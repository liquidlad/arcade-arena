"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID = 60;
const CELL = 10;
const CANVAS_W = GRID * CELL; // 600
const CANVAS_H = GRID * CELL; // 600
const TICK_MS = 80;

const BG = "#0a0a1a";
const GRID_COLOR = "rgba(255,255,255,0.03)";
const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";

type Dir = "up" | "down" | "left" | "right";

interface Cycle {
  x: number;
  y: number;
  dir: Dir;
  trail: Set<string>;
  color: string;
  alive: boolean;
}

const opposite: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const dirDelta: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

// ---------------------------------------------------------------------------
// AI Logic
// ---------------------------------------------------------------------------

function isBlocked(x: number, y: number, playerTrail: Set<string>, aiTrail: Set<string>): boolean {
  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return true;
  const key = cellKey(x, y);
  return playerTrail.has(key) || aiTrail.has(key);
}

function floodFill(startX: number, startY: number, playerTrail: Set<string>, aiTrail: Set<string>): number {
  const visited = new Set<string>();
  const stack: [number, number][] = [[startX, startY]];
  let count = 0;
  const maxCount = 200; // cap for performance

  while (stack.length > 0 && count < maxCount) {
    const [cx, cy] = stack.pop()!;
    const key = cellKey(cx, cy);
    if (visited.has(key)) continue;
    if (cx < 0 || cx >= GRID || cy < 0 || cy >= GRID) continue;
    if (playerTrail.has(key) || aiTrail.has(key)) continue;
    visited.add(key);
    count++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return count;
}

function aiChooseDir(ai: Cycle, player: Cycle): Dir {
  const dirs: Dir[] = ["up", "down", "left", "right"];
  const validDirs = dirs.filter((d) => {
    if (d === opposite[ai.dir]) return false;
    const [dx, dy] = dirDelta[d];
    const nx = ai.x + dx;
    const ny = ai.y + dy;
    return !isBlocked(nx, ny, player.trail, ai.trail);
  });

  if (validDirs.length === 0) return ai.dir; // doomed

  // Score each direction by available space (flood fill)
  const scored = validDirs.map((d) => {
    const [dx, dy] = dirDelta[d];
    const nx = ai.x + dx;
    const ny = ai.y + dy;
    let score = floodFill(nx, ny, player.trail, ai.trail);

    // Bonus: prefer directions that move toward the player when we have space advantage
    // This makes the AI occasionally try to cut off the player
    const distToPlayer = Math.abs(nx - player.x) + Math.abs(ny - player.y);
    if (score > 80 && distToPlayer < 20) {
      score += 10; // slight aggression bonus
    }

    // Penalty for moving toward walls when not necessary
    if (nx <= 1 || nx >= GRID - 2 || ny <= 1 || ny >= GRID - 2) {
      score -= 5;
    }

    return { dir: d, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Sometimes pick a suboptimal direction for unpredictability (10% chance)
  if (scored.length > 1 && Math.random() < 0.1) {
    return scored[1].dir;
  }

  return scored[0].dir;
}

// ---------------------------------------------------------------------------
// TronGame component
// ---------------------------------------------------------------------------

function TronGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const nextDirRef = useRef<Dir>("right");
  const gameOverRef = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(3);

  // -----------------------------------------------------------------------
  // Main game loop
  // -----------------------------------------------------------------------

  const stableOnGameEnd = useCallback(onGameEnd, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset
    gameOverRef.current = false;

    // State ----------------------------------------------------------------
    const player: Cycle = {
      x: Math.floor(GRID * 0.25),
      y: Math.floor(GRID / 2),
      dir: "right",
      trail: new Set<string>(),
      color: CYAN,
      alive: true,
    };
    const ai: Cycle = {
      x: Math.floor(GRID * 0.75),
      y: Math.floor(GRID / 2),
      dir: "left",
      trail: new Set<string>(),
      color: MAGENTA,
      alive: true,
    };

    // Mark starting positions
    player.trail.add(cellKey(player.x, player.y));
    ai.trail.add(cellKey(ai.x, ai.y));

    nextDirRef.current = player.dir;
    let paused = true;
    let lastTick = 0;
    let gameEndCalled = false;
    let deathFlashFrames = 0;
    let winnerText = "";

    // Countdown ------------------------------------------------------------
    let countVal = 3;
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      countVal -= 1;
      if (countVal <= 0) {
        clearInterval(countdownInterval);
        setCountdown(null);
        paused = false;
      } else {
        setCountdown(countVal);
      }
    }, 800);

    // Input ----------------------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      let newDir: Dir | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          newDir = "up";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          newDir = "down";
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          newDir = "left";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          newDir = "right";
          break;
      }
      if (newDir && newDir !== opposite[player.dir]) {
        nextDirRef.current = newDir;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Draw helpers ---------------------------------------------------------

    const drawGrid = () => {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, CANVAS_H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(CANVAS_W, i * CELL);
        ctx.stroke();
      }
    };

    const drawTrail = (trail: Set<string>, color: string) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      trail.forEach((key) => {
        const [cx, cy] = key.split(",").map(Number);
        ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
      });
      ctx.shadowBlur = 0;
    };

    const drawCycleHead = (cycle: Cycle) => {
      if (!cycle.alive) return;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = cycle.color;
      ctx.shadowBlur = 16;
      ctx.fillRect(cycle.x * CELL, cycle.y * CELL, CELL, CELL);
      ctx.shadowBlur = 0;
    };

    const drawBorder = () => {
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2);
      ctx.shadowBlur = 0;
    };

    const drawLabel = (text: string, x: number, y: number, color: string) => {
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillText(text, x * CELL + CELL / 2, y * CELL - 6);
      ctx.shadowBlur = 0;
    };

    const drawExplosion = (cx: number, cy: number, color: string, frame: number) => {
      const maxR = 40;
      const r = maxR * (frame / 30);
      const alpha = 1 - frame / 30;
      ctx.beginPath();
      ctx.arc(cx * CELL + CELL / 2, cy * CELL + CELL / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = color.replace(")", `,${alpha * 0.4})`).replace("rgb", "rgba").replace("#", "");
      // Simpler glow approach
      ctx.shadowColor = color;
      ctx.shadowBlur = 30 * alpha;
      ctx.strokeStyle = `${color}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // Movement helper ------------------------------------------------------

    const moveCycle = (cycle: Cycle) => {
      const [dx, dy] = dirDelta[cycle.dir];
      cycle.x += dx;
      cycle.y += dy;
    };

    const checkCollision = (cycle: Cycle, otherTrail: Set<string>): boolean => {
      if (cycle.x < 0 || cycle.x >= GRID || cycle.y < 0 || cycle.y >= GRID) return true;
      const key = cellKey(cycle.x, cycle.y);
      if (cycle.trail.has(key) || otherTrail.has(key)) return true;
      return false;
    };

    // Game loop ------------------------------------------------------------

    let deathX = 0;
    let deathY = 0;
    let deathColor = CYAN;

    const tick = (timestamp: number) => {
      if (gameOverRef.current && deathFlashFrames <= 0) return;

      // Tick-based movement
      const shouldStep = !paused && timestamp - lastTick >= TICK_MS;

      if (shouldStep) {
        lastTick = timestamp;

        // Apply queued direction
        if (nextDirRef.current !== opposite[player.dir]) {
          player.dir = nextDirRef.current;
        }

        // AI decision
        ai.dir = aiChooseDir(ai, player);

        // Move both
        moveCycle(player);
        moveCycle(ai);

        // Check collisions
        const playerDead = checkCollision(player, ai.trail);
        const aiDead = checkCollision(ai, player.trail);

        // Both land on same cell
        const sameCell = player.x === ai.x && player.y === ai.y;

        if (playerDead || aiDead || sameCell) {
          if (sameCell || (playerDead && aiDead)) {
            // Tie -- player loses
            player.alive = false;
            ai.alive = false;
            deathX = player.x;
            deathY = player.y;
            deathColor = CYAN;
          } else if (playerDead) {
            player.alive = false;
            deathX = player.x;
            deathY = player.y;
            deathColor = CYAN;
          } else {
            ai.alive = false;
            deathX = ai.x;
            deathY = ai.y;
            deathColor = MAGENTA;
          }
          deathFlashFrames = 30;
          winnerText = player.alive ? "YOU WIN" : "YOU CRASHED";
        } else {
          // Record trail
          player.trail.add(cellKey(player.x, player.y));
          ai.trail.add(cellKey(ai.x, ai.y));
        }
      }

      // -- Draw ----------------------------------------------------------
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      drawGrid();
      drawBorder();

      // Trails
      drawTrail(player.trail, CYAN);
      drawTrail(ai.trail, MAGENTA);

      // Heads
      drawCycleHead(player);
      drawCycleHead(ai);

      // Labels near starting positions (only at start)
      if (paused || (player.trail.size < 4 && ai.trail.size < 4)) {
        drawLabel("YOU", player.x, player.y, CYAN);
        drawLabel("CPU", ai.x, ai.y, MAGENTA);
      }

      // Countdown
      if (paused && countVal > 0) {
        ctx.font = '72px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = CYAN;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = 30;
        ctx.fillText(String(countVal), CANVAS_W / 2, CANVAS_H / 2 + 20);
        ctx.shadowBlur = 0;
      }

      // Death explosion & result
      if (deathFlashFrames > 0) {
        deathFlashFrames--;
        drawExplosion(deathX, deathY, deathColor, 30 - deathFlashFrames);

        // Flash screen border
        const flashAlpha = deathFlashFrames / 30;
        ctx.strokeStyle = `${deathColor}${Math.floor(flashAlpha * 180).toString(16).padStart(2, "0")}`;
        ctx.lineWidth = 4;
        ctx.shadowColor = deathColor;
        ctx.shadowBlur = 20 * flashAlpha;
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.shadowBlur = 0;

        // Show winner text
        if (deathFlashFrames < 20) {
          ctx.font = '36px "Courier New", monospace';
          ctx.textAlign = "center";
          const textColor = player.alive ? CYAN : MAGENTA;
          ctx.fillStyle = textColor;
          ctx.shadowColor = textColor;
          ctx.shadowBlur = 20;
          ctx.fillText(winnerText, CANVAS_W / 2, CANVAS_H / 2);
          ctx.shadowBlur = 0;
        }

        if (deathFlashFrames <= 0 && !gameEndCalled) {
          gameEndCalled = true;
          gameOverRef.current = true;
          stableOnGameEnd(player.alive);
          return;
        }
      }

      // Scanline effect for CRT feel
      for (let i = 0; i < CANVAS_H; i += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(0, i, CANVAS_W, 1);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Cleanup --------------------------------------------------------------
    return () => {
      clearInterval(countdownInterval);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      gameOverRef.current = true;
    };
  }, [stableOnGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Status bar */}
      <div className="flex items-center gap-8 text-[10px]">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: CYAN, boxShadow: `0 0 8px ${CYAN}` }}
          />
          <span className="text-[#00ffff]" style={{ textShadow: `0 0 6px ${CYAN}` }}>
            YOU
          </span>
        </div>
        <span className="text-[var(--text-muted)]">VS</span>
        <div className="flex items-center gap-2">
          <span className="text-[#ff00ff]" style={{ textShadow: `0 0 6px ${MAGENTA}` }}>
            CPU
          </span>
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: MAGENTA, boxShadow: `0 0 8px ${MAGENTA}` }}
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block max-w-full h-auto border border-[#00ffff]/20"
          style={{ imageRendering: "pixelated" }}
        />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="text-6xl font-bold animate-pulse"
              style={{ color: CYAN, textShadow: `0 0 30px ${CYAN}, 0 0 60px ${CYAN}` }}
            >
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        WASD&nbsp;&nbsp;or&nbsp;&nbsp;ARROWS&nbsp;&nbsp;to turn
      </div>

      {/* Mode badge */}
      {mode === "practice" && (
        <div className="text-[var(--text-muted)] text-[8px] opacity-50">
          PRACTICE MODE
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TronPage() {
  return (
    <GameWrapper title="TRON" color="cyan">
      {({ mode, onGameEnd }) => (
        <TronGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
