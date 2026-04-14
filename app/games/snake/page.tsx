"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Point = { x: number; y: number };

const COLS = 30;
const ROWS = 30;
const CELL = 20;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const TICK_MS = 140;

const COLOR_BG = "#0a0a1a";
const COLOR_GRID = "#111133";
const COLOR_PLAYER = "#00ffff";
const COLOR_PLAYER_HEAD = "#66ffff";
const COLOR_AI = "#ff00ff";
const COLOR_AI_HEAD = "#ff77ff";
const COLOR_FOOD = "#ffff00";
const COLOR_FOOD_GLOW = "rgba(255,255,0,0.25)";
const COLOR_TEXT = "#e0e0ff";
const COLOR_MUTED = "#6a6a9a";

const OPPOSITE: Record<Dir, Dir> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

const DIR_DELTA: Record<Dir, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eq(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function occupies(body: Point[], p: Point) {
  return body.some((s) => eq(s, p));
}

function randomFreeCell(playerBody: Point[], aiBody: Point[]): Point {
  let p: Point;
  do {
    p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (occupies(playerBody, p) || occupies(aiBody, p));
  return p;
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// ---------------------------------------------------------------------------
// AI logic
// ---------------------------------------------------------------------------

function aiChooseDir(
  head: Point,
  currentDir: Dir,
  food: Point,
  playerBody: Point[],
  aiBody: Point[]
): Dir {
  const dirs: Dir[] = ["UP", "DOWN", "LEFT", "RIGHT"];

  // Filter out reverse direction (can't go backwards)
  const valid = dirs.filter((d) => d !== OPPOSITE[currentDir]);

  // For each valid direction, check if the resulting cell is safe
  const safe = valid.filter((d) => {
    const delta = DIR_DELTA[d];
    const next = { x: head.x + delta.x, y: head.y + delta.y };
    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) return false;
    if (occupies(aiBody, next)) return false;
    if (occupies(playerBody, next)) return false;
    return true;
  });

  if (safe.length === 0) return currentDir; // doomed

  // 20% chance of random turn for unpredictability
  if (Math.random() < 0.2) {
    return safe[Math.floor(Math.random() * safe.length)];
  }

  // Otherwise pick the direction that minimises manhattan distance to food
  safe.sort((a, b) => {
    const da = DIR_DELTA[a];
    const db = DIR_DELTA[b];
    const na = { x: head.x + da.x, y: head.y + da.y };
    const nb = { x: head.x + db.x, y: head.y + db.y };
    return manhattan(na, food) - manhattan(nb, food);
  });

  return safe[0];
}

// ---------------------------------------------------------------------------
// Game component
// ---------------------------------------------------------------------------

interface SnakeGameProps {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}

function SnakeGame({ mode, onGameEnd }: SnakeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOver = useRef(false);
  const dirQueue = useRef<Dir[]>([]);
  const stateRef = useRef({
    playerBody: [{ x: 5, y: 15 }, { x: 4, y: 15 }, { x: 3, y: 15 }] as Point[],
    playerDir: "RIGHT" as Dir,
    aiBody: [{ x: 24, y: 15 }, { x: 25, y: 15 }, { x: 26, y: 15 }] as Point[],
    aiDir: "LEFT" as Dir,
    food: { x: 15, y: 15 } as Point,
    playerScore: 0,
    aiScore: 0,
  });

  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);

  // ------- Input handling -------
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      let newDir: Dir | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          newDir = "UP";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          newDir = "DOWN";
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          newDir = "LEFT";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          newDir = "RIGHT";
          break;
      }
      if (newDir) {
        e.preventDefault();
        // Queue up to 2 inputs so fast turns register
        if (dirQueue.current.length < 3) {
          dirQueue.current.push(newDir);
        }
      }
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

  // ------- Draw -------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;

    // Background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Grid lines (subtle)
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(WIDTH, y * CELL);
      ctx.stroke();
    }

    // Food glow
    const fx = s.food.x * CELL + CELL / 2;
    const fy = s.food.y * CELL + CELL / 2;
    const grad = ctx.createRadialGradient(fx, fy, 2, fx, fy, CELL * 1.5);
    grad.addColorStop(0, COLOR_FOOD_GLOW);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(fx - CELL * 1.5, fy - CELL * 1.5, CELL * 3, CELL * 3);

    // Food
    ctx.fillStyle = COLOR_FOOD;
    ctx.shadowColor = COLOR_FOOD;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Helper: draw a snake
    const drawSnake = (body: Point[], color: string, headColor: string) => {
      body.forEach((seg, i) => {
        const px = seg.x * CELL + 1;
        const py = seg.y * CELL + 1;
        const size = CELL - 2;
        if (i === 0) {
          // Head
          ctx.fillStyle = headColor;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.fillRect(px, py, size, size);
          ctx.shadowBlur = 0;
          // Eyes
          ctx.fillStyle = COLOR_BG;
          const eyeSize = 3;
          ctx.fillRect(px + 4, py + 4, eyeSize, eyeSize);
          ctx.fillRect(px + size - 7, py + 4, eyeSize, eyeSize);
        } else {
          // Body — gradually fades
          const alpha = 1 - (i / body.length) * 0.5;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 4;
          ctx.fillRect(px, py, size, size);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      });
    };

    drawSnake(s.playerBody, COLOR_PLAYER, COLOR_PLAYER_HEAD);
    drawSnake(s.aiBody, COLOR_AI, COLOR_AI_HEAD);

    // Countdown overlay
    if (!started || countdown > 0) {
      ctx.fillStyle = "rgba(10,10,26,0.6)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "bold 48px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(countdown > 0 ? String(countdown) : "GO!", WIDTH / 2, HEIGHT / 2);
    }
  }, [started, countdown]);

  // ------- Game loop -------
  useEffect(() => {
    // Initial draw
    draw();

    if (!started) return;

    const interval = setInterval(() => {
      if (gameOver.current) return;

      const s = stateRef.current;

      // Process player direction queue
      while (dirQueue.current.length > 0) {
        const next = dirQueue.current.shift()!;
        if (next !== OPPOSITE[s.playerDir]) {
          s.playerDir = next;
          break;
        }
      }

      // AI decision
      s.aiDir = aiChooseDir(s.aiBody[0], s.aiDir, s.food, s.playerBody, s.aiBody);

      // Calculate new heads
      const pd = DIR_DELTA[s.playerDir];
      const ad = DIR_DELTA[s.aiDir];
      const newPlayerHead = { x: s.playerBody[0].x + pd.x, y: s.playerBody[0].y + pd.y };
      const newAiHead = { x: s.aiBody[0].x + ad.x, y: s.aiBody[0].y + ad.y };

      // Check deaths
      const playerDead =
        newPlayerHead.x < 0 ||
        newPlayerHead.x >= COLS ||
        newPlayerHead.y < 0 ||
        newPlayerHead.y >= ROWS ||
        occupies(s.playerBody, newPlayerHead) ||
        occupies(s.aiBody, newPlayerHead) ||
        eq(newPlayerHead, newAiHead);

      const aiDead =
        newAiHead.x < 0 ||
        newAiHead.x >= COLS ||
        newAiHead.y < 0 ||
        newAiHead.y >= ROWS ||
        occupies(s.aiBody, newAiHead) ||
        occupies(s.playerBody, newAiHead) ||
        eq(newAiHead, newPlayerHead);

      if (playerDead || aiDead) {
        gameOver.current = true;
        clearInterval(interval);

        // Draw final state then report
        draw();

        // Both die or AI dies = player wins; only player dies = player loses
        const playerWon = aiDead;
        setTimeout(() => onGameEnd(playerWon), 600);
        return;
      }

      // Move snakes — add new head
      s.playerBody.unshift(newPlayerHead);
      s.aiBody.unshift(newAiHead);

      // Check food
      const playerAte = eq(newPlayerHead, s.food);
      const aiAte = eq(newAiHead, s.food);

      if (playerAte) {
        s.playerScore++;
        setScores((prev) => ({ ...prev, player: s.playerScore }));
      } else {
        s.playerBody.pop();
      }

      if (aiAte) {
        s.aiScore++;
        setScores((prev) => ({ ...prev, ai: s.aiScore }));
      } else {
        s.aiBody.pop();
      }

      // Respawn food if eaten
      if (playerAte || aiAte) {
        s.food = randomFreeCell(s.playerBody, s.aiBody);
      }

      draw();
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [started, draw, onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scoreboard */}
      <div className="flex items-center justify-between w-full max-w-[600px]">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4"
            style={{ backgroundColor: COLOR_PLAYER, boxShadow: `0 0 8px ${COLOR_PLAYER}` }}
          />
          <div>
            <div className="text-[var(--neon-cyan)] glow-cyan text-[10px]">YOU</div>
            <div className="text-[var(--text-primary)] text-xs">{scores.player}</div>
          </div>
        </div>

        <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
          {mode === "wager" ? "WAGER MATCH" : "PRACTICE"}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[var(--neon-magenta)] glow-magenta text-[10px]">AI</div>
            <div className="text-[var(--text-primary)] text-xs">{scores.ai}</div>
          </div>
          <div
            className="w-4 h-4"
            style={{ backgroundColor: COLOR_AI, boxShadow: `0 0 8px ${COLOR_AI}` }}
          />
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative border border-[var(--border-color)]"
        style={{ boxShadow: "0 0 30px rgba(0,255,255,0.08), inset 0 0 30px rgba(0,0,0,0.5)" }}
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="block"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        WASD or ARROWS to move
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SnakePage() {
  return (
    <GameWrapper title="SNAKE RACE" color="cyan">
      {({ mode, onGameEnd }) => <SnakeGame mode={mode} onGameEnd={onGameEnd} />}
    </GameWrapper>
  );
}
