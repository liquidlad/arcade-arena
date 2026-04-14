"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

const CANVAS_W = 700;
const CANVAS_H = 500;
const HALF_W = 340;
const DIVIDER_W = CANVAS_W - HALF_W * 2; // 20px divider

const COLS = 13;
const ROWS = 13;
const CELL_W = Math.floor(HALF_W / COLS);        // ~26
const CELL_H = Math.floor(CANVAS_H / ROWS);      // ~38

const COLOR_BG = "#0a0a1a";
const COLOR_SAFE = "#0a2a0a";
const COLOR_ROAD = "#1a1a2a";
const COLOR_ROAD_LINE = "#2a2a3a";
const COLOR_WATER = "#0a1a3a";
const COLOR_DIVIDER = "#111133";
const COLOR_TEXT = "#e0e0ff";
const COLOR_MUTED = "#6a6a9a";
const COLOR_PLAYER_FROG = "#00ff41";
const COLOR_AI_FROG = "#ff6600";
const COLOR_FROG_EYE = "#ffffff";

const GAME_DURATION = 60;
const WIN_SCORE = 3;

// Row layout from bottom (row 0) to top (row 12):
// 0: start safe zone
// 1-5: traffic lanes
// 6: middle safe zone
// 7-11: river lanes
// 12: home (goal)

type RowType = "safe" | "road" | "water" | "home";

const ROW_TYPES: RowType[] = [
  "safe",   // 0 - start
  "road",   // 1
  "road",   // 2
  "road",   // 3
  "road",   // 4
  "road",   // 5
  "safe",   // 6 - median
  "water",  // 7
  "water",  // 8
  "water",  // 9
  "water",  // 10
  "water",  // 11
  "home",   // 12 - goal
];

// ---------------------------------------------------------------------------
// Obstacle configuration per lane
// ---------------------------------------------------------------------------

interface LaneConfig {
  row: number;
  dir: 1 | -1;
  speed: number;         // pixels per frame
  itemWidth: number;     // in cells
  gap: number;           // in cells between items
  color: string;
}

const TRAFFIC_LANES: LaneConfig[] = [
  { row: 1, dir: 1,  speed: 1.2, itemWidth: 2, gap: 4, color: "#ff3333" },
  { row: 2, dir: -1, speed: 1.6, itemWidth: 3, gap: 5, color: "#ffaa00" },
  { row: 3, dir: 1,  speed: 1.0, itemWidth: 2, gap: 3, color: "#ff55ff" },
  { row: 4, dir: -1, speed: 2.0, itemWidth: 4, gap: 6, color: "#3399ff" },
  { row: 5, dir: 1,  speed: 1.4, itemWidth: 2, gap: 4, color: "#ffff33" },
];

const RIVER_LANES: LaneConfig[] = [
  { row: 7,  dir: -1, speed: 1.0, itemWidth: 3, gap: 4, color: "#8B4513" },
  { row: 8,  dir: 1,  speed: 1.3, itemWidth: 4, gap: 5, color: "#6B3410" },
  { row: 9,  dir: -1, speed: 0.8, itemWidth: 3, gap: 3, color: "#556B2F" },
  { row: 10, dir: 1,  speed: 1.5, itemWidth: 5, gap: 6, color: "#8B4513" },
  { row: 11, dir: -1, speed: 1.1, itemWidth: 3, gap: 4, color: "#556B2F" },
];

// ---------------------------------------------------------------------------
// Obstacle item tracking
// ---------------------------------------------------------------------------

interface Obstacle {
  x: number;          // pixel position (within one half-side)
  width: number;      // pixel width
  row: number;
  dir: 1 | -1;
  speed: number;
  color: string;
  isLog: boolean;     // true for river, false for traffic
}

function createObstacles(lanes: LaneConfig[], isLog: boolean): Obstacle[] {
  const obs: Obstacle[] = [];
  for (const lane of lanes) {
    const itemW = lane.itemWidth * CELL_W;
    const gapW = lane.gap * CELL_W;
    const totalPattern = itemW + gapW;
    const count = Math.ceil(HALF_W / totalPattern) + 2;
    for (let i = 0; i < count; i++) {
      obs.push({
        x: i * totalPattern,
        width: itemW,
        row: lane.row,
        dir: lane.dir,
        speed: lane.speed,
        color: lane.color,
        isLog,
      });
    }
  }
  return obs;
}

// ---------------------------------------------------------------------------
// Frog state
// ---------------------------------------------------------------------------

interface FrogState {
  col: number;
  row: number;
  pixelX: number;     // for smooth riding on logs
  alive: boolean;
  score: number;
  ridingLog: Obstacle | null;
}

function makeFrog(col: number): FrogState {
  return {
    col,
    row: 0,
    pixelX: col * CELL_W,
    alive: true,
    score: 0,
    ridingLog: null,
  };
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

function frogPixelBounds(frog: FrogState) {
  const pad = 3;
  return {
    left: frog.pixelX + pad,
    right: frog.pixelX + CELL_W - pad,
  };
}

function checkCarHit(frog: FrogState, obstacles: Obstacle[]): boolean {
  if (ROW_TYPES[frog.row] !== "road") return false;
  const fb = frogPixelBounds(frog);
  for (const obs of obstacles) {
    if (obs.row !== frog.row) continue;
    const ox = ((obs.x % (HALF_W + obs.width * 2)) + HALF_W + obs.width * 2) % (HALF_W + obs.width * 2) - obs.width;
    if (fb.right > ox && fb.left < ox + obs.width) return true;
  }
  return false;
}

function findLog(frog: FrogState, obstacles: Obstacle[]): Obstacle | null {
  if (ROW_TYPES[frog.row] !== "water") return null;
  const fb = frogPixelBounds(frog);
  const frogCenter = (fb.left + fb.right) / 2;
  for (const obs of obstacles) {
    if (obs.row !== frog.row) continue;
    const ox = ((obs.x % (HALF_W + obs.width * 2)) + HALF_W + obs.width * 2) % (HALF_W + obs.width * 2) - obs.width;
    if (frogCenter > ox && frogCenter < ox + obs.width) return obs;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wrap helper for obstacle rendering
// ---------------------------------------------------------------------------

function wrapX(rawX: number, width: number): number {
  const totalW = HALF_W + width * 2;
  return ((rawX % totalW) + totalW) % totalW - width;
}

// ---------------------------------------------------------------------------
// AI logic
// ---------------------------------------------------------------------------

interface AIState {
  waitTimer: number;
  thinkTimer: number;
}

function aiDecide(
  frog: FrogState,
  obstacles: Obstacle[],
  aiState: AIState
): { dx: number; dy: number } | null {
  // Wait between hops
  if (aiState.waitTimer > 0) {
    aiState.waitTimer--;
    return null;
  }

  aiState.thinkTimer++;
  if (aiState.thinkTimer < 8) return null; // think for a few frames
  aiState.thinkTimer = 0;

  // Occasional mistake: 8% chance to do nothing extra
  if (Math.random() < 0.08) {
    aiState.waitTimer = 15;
    return null;
  }

  const currentRow = frog.row;
  const currentCol = frog.col;

  // Goal: move up toward row 12
  // Check if moving up is safe
  const tryDirs = [
    { dx: 0, dy: 1 },   // up (toward goal)
    { dx: -1, dy: 0 },  // left
    { dx: 1, dy: 0 },   // right
    { dx: 0, dy: -1 },  // back down
  ];

  // Shuffle lateral moves for variety
  if (Math.random() < 0.5) {
    [tryDirs[1], tryDirs[2]] = [tryDirs[2], tryDirs[1]];
  }

  for (const dir of tryDirs) {
    const newRow = currentRow + dir.dy;
    const newCol = currentCol + dir.dx;

    if (newCol < 0 || newCol >= COLS || newRow < 0 || newRow > 12) continue;

    // Check if destination is safe
    const testFrog: FrogState = {
      ...frog,
      col: newCol,
      row: newRow,
      pixelX: newCol * CELL_W,
    };

    const rowType = ROW_TYPES[newRow];

    if (rowType === "road") {
      // Check for cars
      if (!checkCarHit(testFrog, obstacles)) {
        aiState.waitTimer = 4 + Math.floor(Math.random() * 6);
        return dir;
      }
    } else if (rowType === "water") {
      // Check for log to land on
      const log = findLog(testFrog, obstacles);
      if (log) {
        aiState.waitTimer = 4 + Math.floor(Math.random() * 8);
        return dir;
      }
    } else {
      // Safe zone or home — always ok
      aiState.waitTimer = 3 + Math.floor(Math.random() * 5);
      return dir;
    }
  }

  // No good move found — wait
  aiState.waitTimer = 6;
  return null;
}

// ---------------------------------------------------------------------------
// Game component
// ---------------------------------------------------------------------------

interface FroggerGameProps {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}

function FroggerGame({ mode, onGameEnd }: FroggerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOver = useRef(false);
  const inputRef = useRef<{ dx: number; dy: number } | null>(null);

  const stateRef = useRef({
    player: makeFrog(6),
    ai: makeFrog(6),
    trafficObs: createObstacles(TRAFFIC_LANES, false),
    riverObs: createObstacles(RIVER_LANES, true),
    aiTrafficObs: createObstacles(TRAFFIC_LANES, false),
    aiRiverObs: createObstacles(RIVER_LANES, true),
    aiState: { waitTimer: 20, thinkTimer: 0 } as AIState,
    timer: GAME_DURATION,
    frameCount: 0,
    playerHomes: [] as number[],
    aiHomes: [] as number[],
  });

  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);

  // ------- Input handling -------
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      let dx = 0, dy = 0;
      switch (e.key) {
        case "ArrowUp":    case "w": case "W": dy = 1;  break;
        case "ArrowDown":  case "s": case "S": dy = -1; break;
        case "ArrowLeft":  case "a": case "A": dx = -1; break;
        case "ArrowRight": case "d": case "D": dx = 1;  break;
        default: return;
      }
      e.preventDefault();
      inputRef.current = { dx, dy };
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ------- Countdown -------
  useEffect(() => {
    if (countdown <= 0) {
      setStarted(true);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [countdown]);

  // ------- Draw helper -------
  const drawSide = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      offsetX: number,
      frog: FrogState,
      traffic: Obstacle[],
      river: Obstacle[],
      homes: number[],
      frogColor: string,
      label: string
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, 0, HALF_W, CANVAS_H);
      ctx.clip();
      ctx.translate(offsetX, 0);

      // Draw rows from top to bottom (row 12 at top, row 0 at bottom)
      for (let row = 0; row < ROWS; row++) {
        const screenY = (ROWS - 1 - row) * CELL_H;
        const rowType = ROW_TYPES[row];

        if (rowType === "home") {
          ctx.fillStyle = COLOR_SAFE;
          ctx.fillRect(0, screenY, HALF_W, CELL_H);
          // Home slots
          for (let i = 0; i < WIN_SCORE; i++) {
            const slotX = (i * 4 + 2) * CELL_W;
            const slotW = CELL_W * 2;
            ctx.fillStyle = homes.includes(i) ? frogColor : "#1a3a1a";
            ctx.fillRect(slotX, screenY + 4, slotW, CELL_H - 8);
            ctx.strokeStyle = "#2a5a2a";
            ctx.lineWidth = 1;
            ctx.strokeRect(slotX, screenY + 4, slotW, CELL_H - 8);
            if (homes.includes(i)) {
              // Draw mini frog in slot
              drawFrogShape(ctx, slotX + slotW / 2, screenY + CELL_H / 2, 8, frogColor);
            }
          }
        } else if (rowType === "safe") {
          ctx.fillStyle = COLOR_SAFE;
          ctx.fillRect(0, screenY, HALF_W, CELL_H);
          // Subtle grass texture
          ctx.fillStyle = "#0d350d";
          for (let gx = 0; gx < HALF_W; gx += 12) {
            ctx.fillRect(gx, screenY + CELL_H - 3, 2, 3);
          }
        } else if (rowType === "road") {
          ctx.fillStyle = COLOR_ROAD;
          ctx.fillRect(0, screenY, HALF_W, CELL_H);
          // Lane markings
          ctx.strokeStyle = COLOR_ROAD_LINE;
          ctx.setLineDash([8, 8]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, screenY + CELL_H);
          ctx.lineTo(HALF_W, screenY + CELL_H);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (rowType === "water") {
          ctx.fillStyle = COLOR_WATER;
          ctx.fillRect(0, screenY, HALF_W, CELL_H);
          // Water ripple effect
          ctx.strokeStyle = "#0a2a5a";
          ctx.lineWidth = 0.5;
          const rippleOffset = (stateRef.current.frameCount * 0.5) % 20;
          for (let rx = -20 + rippleOffset; rx < HALF_W; rx += 20) {
            ctx.beginPath();
            ctx.moveTo(rx, screenY + CELL_H / 2 - 3);
            ctx.quadraticCurveTo(rx + 5, screenY + CELL_H / 2 - 7, rx + 10, screenY + CELL_H / 2 - 3);
            ctx.stroke();
          }
        }
      }

      // Draw obstacles
      const allObs = [...traffic, ...river];
      for (const obs of allObs) {
        const screenY = (ROWS - 1 - obs.row) * CELL_H;
        const ox = wrapX(obs.x, obs.width);

        ctx.fillStyle = obs.color;
        ctx.shadowColor = obs.isLog ? "transparent" : obs.color;
        ctx.shadowBlur = obs.isLog ? 0 : 6;

        if (obs.isLog) {
          // Log shape with rounded ends
          const r = 4;
          const lx = ox;
          const ly = screenY + 4;
          const lw = obs.width;
          const lh = CELL_H - 8;
          ctx.beginPath();
          ctx.moveTo(lx + r, ly);
          ctx.lineTo(lx + lw - r, ly);
          ctx.quadraticCurveTo(lx + lw, ly, lx + lw, ly + r);
          ctx.lineTo(lx + lw, ly + lh - r);
          ctx.quadraticCurveTo(lx + lw, ly + lh, lx + lw - r, ly + lh);
          ctx.lineTo(lx + r, ly + lh);
          ctx.quadraticCurveTo(lx, ly + lh, lx, ly + lh - r);
          ctx.lineTo(lx, ly + r);
          ctx.quadraticCurveTo(lx, ly, lx + r, ly);
          ctx.fill();
          // Wood grain lines
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.lineWidth = 1;
          for (let gx = lx + 10; gx < lx + lw - 5; gx += 15) {
            ctx.beginPath();
            ctx.moveTo(gx, ly + 2);
            ctx.lineTo(gx, ly + lh - 2);
            ctx.stroke();
          }
        } else {
          // Car/truck rectangle
          const carH = CELL_H - 8;
          ctx.fillRect(ox, screenY + 4, obs.width, carH);
          // Windshield
          ctx.fillStyle = "#aaddff";
          const windshieldW = Math.min(8, obs.width / 4);
          const windshieldX = obs.dir === 1 ? ox + obs.width - windshieldW - 3 : ox + 3;
          ctx.fillRect(windshieldX, screenY + 8, windshieldW, carH - 8);
          // Headlights
          ctx.fillStyle = "#ffff88";
          const hlX = obs.dir === 1 ? ox + obs.width - 3 : ox;
          ctx.fillRect(hlX, screenY + 7, 3, 4);
          ctx.fillRect(hlX, screenY + CELL_H - 11, 3, 4);
        }
        ctx.shadowBlur = 0;
      }

      // Draw frog
      if (frog.alive) {
        const frogScreenX = frog.pixelX + CELL_W / 2;
        const frogScreenY = (ROWS - 1 - frog.row) * CELL_H + CELL_H / 2;
        drawFrogShape(ctx, frogScreenX, frogScreenY, CELL_W / 2 - 2, frogColor);
      }

      // Side label
      ctx.fillStyle = COLOR_MUTED;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, HALF_W / 2, CANVAS_H - 4);

      ctx.restore();
    },
    []
  );

  // ------- Draw main -------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;

    // Clear
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw both sides
    drawSide(ctx, 0, s.player, s.trafficObs, s.riverObs, s.playerHomes, COLOR_PLAYER_FROG, "YOU");
    drawSide(ctx, HALF_W + DIVIDER_W, s.ai, s.aiTrafficObs, s.aiRiverObs, s.aiHomes, COLOR_AI_FROG, "AI");

    // Divider
    ctx.fillStyle = COLOR_DIVIDER;
    ctx.fillRect(HALF_W, 0, DIVIDER_W, CANVAS_H);
    // Divider decoration
    ctx.strokeStyle = "#2a2a5a";
    ctx.lineWidth = 1;
    for (let dy = 10; dy < CANVAS_H; dy += 20) {
      ctx.beginPath();
      ctx.moveTo(HALF_W + DIVIDER_W / 2, dy);
      ctx.lineTo(HALF_W + DIVIDER_W / 2, dy + 10);
      ctx.stroke();
    }

    // Timer at top center
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(CANVAS_W / 2 - 40, 0, 80, 24);
    ctx.strokeStyle = "#3a3a6a";
    ctx.lineWidth = 1;
    ctx.strokeRect(CANVAS_W / 2 - 40, 0, 80, 24);
    ctx.fillStyle = s.timer <= 10 ? "#ff3333" : COLOR_TEXT;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.ceil(s.timer)}s`, CANVAS_W / 2, 13);

    // Scores
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = COLOR_PLAYER_FROG;
    ctx.textAlign = "left";
    ctx.fillText(`FROGS: ${s.player.score}/${WIN_SCORE}`, 6, 14);

    ctx.fillStyle = COLOR_AI_FROG;
    ctx.textAlign = "right";
    ctx.fillText(`FROGS: ${s.ai.score}/${WIN_SCORE}`, CANVAS_W - 6, 14);

    // Countdown overlay
    if (!started || countdown > 0) {
      ctx.fillStyle = "rgba(10,10,26,0.7)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "bold 56px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = COLOR_PLAYER_FROG;
      ctx.shadowBlur = 20;
      ctx.fillText(
        countdown > 0 ? String(countdown) : "GO!",
        CANVAS_W / 2,
        CANVAS_H / 2
      );
      ctx.shadowBlur = 0;
    }
  }, [started, countdown, drawSide]);

  // ------- Game loop -------
  useEffect(() => {
    draw();
    if (!started) return;

    let lastTime = performance.now();
    let timerAccum = 0;
    let animId: number;

    const loop = (now: number) => {
      if (gameOver.current) return;

      const dt = Math.min(now - lastTime, 50); // cap dt
      lastTime = now;
      timerAccum += dt;

      const s = stateRef.current;
      s.frameCount++;

      // Update timer (every 1 second)
      while (timerAccum >= 1000) {
        timerAccum -= 1000;
        s.timer -= 1;
        setTimeLeft(Math.ceil(s.timer));

        if (s.timer <= 0) {
          gameOver.current = true;
          const playerWon = s.player.score > s.ai.score;
          // If tied, player loses (need to beat AI)
          draw();
          setTimeout(() => onGameEnd(playerWon), 800);
          return;
        }
      }

      // Move obstacles
      const moveObs = (obs: Obstacle[]) => {
        for (const o of obs) {
          o.x += o.dir * o.speed;
        }
      };
      moveObs(s.trafficObs);
      moveObs(s.riverObs);
      moveObs(s.aiTrafficObs);
      moveObs(s.aiRiverObs);

      // --- Player input ---
      const inp = inputRef.current;
      if (inp && s.player.alive) {
        const newCol = s.player.col + inp.dx;
        const newRow = s.player.row + inp.dy;
        if (newCol >= 0 && newCol < COLS && newRow >= 0 && newRow <= 12) {
          s.player.col = newCol;
          s.player.row = newRow;
          s.player.pixelX = newCol * CELL_W;
          s.player.ridingLog = null;
        }
        inputRef.current = null;
      }

      // --- AI input ---
      const aiMove = aiDecide(s.ai, [...s.aiTrafficObs, ...s.aiRiverObs], s.aiState);
      if (aiMove && s.ai.alive) {
        const newCol = s.ai.col + aiMove.dx;
        const newRow = s.ai.row + aiMove.dy;
        if (newCol >= 0 && newCol < COLS && newRow >= 0 && newRow <= 12) {
          s.ai.col = newCol;
          s.ai.row = newRow;
          s.ai.pixelX = newCol * CELL_W;
          s.ai.ridingLog = null;
        }
      }

      // --- Player on log/water check ---
      if (ROW_TYPES[s.player.row] === "water" && s.player.alive) {
        const log = findLog(s.player, s.riverObs);
        if (log) {
          s.player.pixelX += log.dir * log.speed;
          s.player.ridingLog = log;
          // Keep in bounds
          if (s.player.pixelX < -CELL_W / 2 || s.player.pixelX > HALF_W) {
            // Fell off screen
            resetFrog(s.player);
          }
        } else {
          // In water — reset
          resetFrog(s.player);
        }
      }

      // --- AI on log/water check ---
      if (ROW_TYPES[s.ai.row] === "water" && s.ai.alive) {
        const log = findLog(s.ai, s.aiRiverObs);
        if (log) {
          s.ai.pixelX += log.dir * log.speed;
          s.ai.ridingLog = log;
          if (s.ai.pixelX < -CELL_W / 2 || s.ai.pixelX > HALF_W) {
            resetFrog(s.ai);
          }
        } else {
          resetFrog(s.ai);
        }
      }

      // --- Car collision ---
      if (checkCarHit(s.player, s.trafficObs)) {
        resetFrog(s.player);
      }
      if (checkCarHit(s.ai, s.aiTrafficObs)) {
        resetFrog(s.ai);
      }

      // --- Reached home? ---
      if (s.player.row === 12 && s.player.alive) {
        s.player.score++;
        s.playerHomes.push(s.playerHomes.length);
        setScores((p) => ({ ...p, player: s.player.score }));
        if (s.player.score >= WIN_SCORE) {
          gameOver.current = true;
          draw();
          setTimeout(() => onGameEnd(true), 800);
          return;
        }
        resetFrog(s.player);
      }

      if (s.ai.row === 12 && s.ai.alive) {
        s.ai.score++;
        s.aiHomes.push(s.aiHomes.length);
        setScores((p) => ({ ...p, ai: s.ai.score }));
        if (s.ai.score >= WIN_SCORE) {
          gameOver.current = true;
          draw();
          setTimeout(() => onGameEnd(false), 800);
          return;
        }
        resetFrog(s.ai);
      }

      draw();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [started, draw, onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scoreboard */}
      <div className="flex items-center justify-between w-full max-w-[720px]">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: COLOR_PLAYER_FROG, boxShadow: `0 0 8px ${COLOR_PLAYER_FROG}` }}
          />
          <div>
            <div className="text-[var(--neon-green)] glow-green text-[10px]">YOU</div>
            <div className="text-[var(--text-primary)] text-xs">{scores.player} / {WIN_SCORE}</div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
            {mode === "wager" ? "WAGER MATCH" : "PRACTICE"}
          </div>
          <div className={`text-xs font-bold ${timeLeft <= 10 ? "text-red-500" : "text-[var(--text-primary)]"}`}>
            {timeLeft}s
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[var(--neon-orange)] text-[10px]" style={{ textShadow: "0 0 6px rgba(255,102,0,0.6)" }}>AI</div>
            <div className="text-[var(--text-primary)] text-xs">{scores.ai} / {WIN_SCORE}</div>
          </div>
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: COLOR_AI_FROG, boxShadow: `0 0 8px ${COLOR_AI_FROG}` }}
          />
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative border border-[var(--border-color)]"
        style={{ boxShadow: "0 0 30px rgba(0,255,65,0.08), inset 0 0 30px rgba(0,0,0,0.5)" }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        WASD or ARROWS to hop &bull; First to {WIN_SCORE} crossings wins &bull; 60s time limit
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: draw frog shape
// ---------------------------------------------------------------------------

function drawFrogShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
) {
  // Body (rounded square-ish)
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Darker belly
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.arc(cx, cy + 1, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeOffX = radius * 0.45;
  const eyeOffY = -radius * 0.35;
  const eyeR = radius * 0.25;

  // Eye whites
  ctx.fillStyle = COLOR_FROG_EYE;
  ctx.beginPath();
  ctx.arc(cx - eyeOffX, cy + eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeOffX, cy + eyeOffY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = "#000000";
  const pupilR = eyeR * 0.55;
  ctx.beginPath();
  ctx.arc(cx - eyeOffX, cy + eyeOffY, pupilR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeOffX, cy + eyeOffY, pupilR, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Helper: reset frog to start
// ---------------------------------------------------------------------------

function resetFrog(frog: FrogState) {
  frog.col = Math.floor(COLS / 2);
  frog.row = 0;
  frog.pixelX = frog.col * CELL_W;
  frog.ridingLog = null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FroggerPage() {
  return (
    <GameWrapper title="FROGGER" color="green">
      {({ mode, onGameEnd }) => (
        <FroggerGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
