"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLS = 28;
const ROWS = 31;
const CELL = 20;
const CANVAS_W = COLS * CELL; // 560
const CANVAS_H = ROWS * CELL; // 620

const BG = "#0a0a1a";
const WALL_COLOR = "#1a1a6a";
const WALL_HIGHLIGHT = "#2a2aaa";
const DOT_COLOR = "#ffffff";
const PAC_COLOR = "#ffff00";
const GHOST_COLOR = "#ff00ff";
const GHOST_VULNERABLE = "#4444ff";
const GHOST_FLASH = "#ffffff";
const TEXT_COLOR = "#ffffff";

const PAC_MOVE_INTERVAL = 150; // ms per cell
const GHOST_MOVE_INTERVAL = 180; // ms per cell (slightly slower)
const GHOST_VULNERABLE_INTERVAL = 280; // much slower when vulnerable
const POWER_DURATION = 5000; // 5 seconds
const STARTING_LIVES = 3;
const DOT_SCORE = 10;
const POWER_PELLET_SCORE = 50;
const GHOST_EAT_SCORE = 200;

// Direction vectors: [dx, dy]
const DIR: Record<string, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

// ---------------------------------------------------------------------------
// Maze layout (28x31 grid)
// 1 = wall, 0 = dot path, 2 = empty path (no dot), 3 = power pellet
// Classic-inspired layout
// ---------------------------------------------------------------------------

const MAZE_TEMPLATE: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],
  [1,3,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,3,1],
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,0,1],
  [1,0,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,0,1,1,1,1,1,2,1,1,2,1,1,1,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,1,1,1,1,1,2,1,1,2,1,1,1,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,1,1,2,2,2,2,2,2,2,2,2,2,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,1,1,2,1,1,1,2,2,1,1,1,2,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,2,2,2,1,2,2,2,2,2,2,1,2,2,2,0,1,1,1,1,1,1],
  [2,2,2,2,2,2,0,1,1,2,1,2,2,2,2,2,2,1,2,1,1,0,2,2,2,2,2,2],
  [1,1,1,1,1,1,0,1,1,2,1,2,2,2,2,2,2,1,2,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,1,1,2,2,2,2,2,2,2,2,2,2,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],
  [1,3,0,0,1,1,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,1,1,0,0,3,1],
  [1,1,1,0,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,0,1,1,1],
  [1,1,1,0,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,0,1,1,1],
  [1,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// ---------------------------------------------------------------------------
// Helper: deep clone maze
// ---------------------------------------------------------------------------
function cloneMaze(m: number[][]): number[][] {
  return m.map((r) => [...r]);
}

// ---------------------------------------------------------------------------
// Helper: count total dots + pellets in maze
// ---------------------------------------------------------------------------
function countCollectibles(maze: number[][]): number {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === 0 || maze[r][c] === 3) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Helper: check if a cell is walkable (not a wall)
// ---------------------------------------------------------------------------
function isWalkable(maze: number[][], col: number, row: number): boolean {
  // Wrap horizontal tunnel
  const wc = ((col % COLS) + COLS) % COLS;
  if (row < 0 || row >= ROWS) return false;
  return maze[row][wc] !== 1;
}

// ---------------------------------------------------------------------------
// Ghost AI: BFS toward target (or away when vulnerable)
// ---------------------------------------------------------------------------
function ghostBFS(
  maze: number[][],
  gx: number,
  gy: number,
  tx: number,
  ty: number,
  flee: boolean
): string {
  // When fleeing, pick the direction that moves AWAY from target
  if (flee) {
    let bestDir = "up";
    let bestDist = -1;
    for (const [name, [dx, dy]] of Object.entries(DIR)) {
      const nx = ((gx + dx) % COLS + COLS) % COLS;
      const ny = gy + dy;
      if (!isWalkable(maze, nx, ny)) continue;
      const dist = Math.abs(nx - tx) + Math.abs(ny - ty);
      if (dist > bestDist) {
        bestDist = dist;
        bestDir = name;
      }
    }
    return bestDir;
  }

  // BFS to find shortest path to target
  const visited = new Set<string>();
  const queue: { x: number; y: number; firstDir: string }[] = [];

  for (const [name, [dx, dy]] of Object.entries(DIR)) {
    const nx = ((gx + dx) % COLS + COLS) % COLS;
    const ny = gy + dy;
    if (!isWalkable(maze, nx, ny)) continue;
    const key = `${nx},${ny}`;
    if (visited.has(key)) continue;
    visited.add(key);
    queue.push({ x: nx, y: ny, firstDir: name });
  }

  let idx = 0;
  while (idx < queue.length) {
    const cur = queue[idx++];
    if (cur.x === tx && cur.y === ty) return cur.firstDir;

    for (const [, [dx, dy]] of Object.entries(DIR)) {
      const nx = ((cur.x + dx) % COLS + COLS) % COLS;
      const ny = cur.y + dy;
      if (!isWalkable(maze, nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny, firstDir: cur.firstDir });
    }
  }

  // Fallback: random valid direction
  const dirs = Object.entries(DIR).filter(([, [dx, dy]]) =>
    isWalkable(maze, ((gx + dx) % COLS + COLS) % COLS, gy + dy)
  );
  return dirs.length > 0 ? dirs[Math.floor(Math.random() * dirs.length)][0] : "up";
}

// ---------------------------------------------------------------------------
// PacChaseGame component
// ---------------------------------------------------------------------------

function PacChaseGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const gameOverRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());

  // Game state in refs for animation loop access
  const stateRef = useRef({
    maze: cloneMaze(MAZE_TEMPLATE),
    pacX: 14,
    pacY: 22,
    pacDir: "left" as string,
    pacNextDir: "left" as string,
    pacMouthAngle: 0,
    pacMouthOpening: true,
    ghostX: 13,
    ghostY: 13,
    ghostDir: "up" as string,
    score: 0,
    lives: STARTING_LIVES,
    dotsLeft: 0,
    totalDots: 0,
    powerTimer: 0, // timestamp when power ends
    ghostEaten: false,
    lastPacMove: 0,
    lastGhostMove: 0,
    // Smooth animation interpolation
    pacPrevX: 14,
    pacPrevY: 22,
    pacLerpT: 1,
    ghostPrevX: 13,
    ghostPrevY: 13,
    ghostLerpT: 1,
    // Ready countdown
    readyTimer: 2000,
    readyStart: 0,
    // Death animation
    deathAnim: 0, // 0 = not dying, >0 = animation progress (0..1)
    deathStart: 0,
    // Ghost respawn
    ghostRespawnTimer: 0,
  });

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [powerTimeLeft, setPowerTimeLeft] = useState(0);

  const resetPositions = useCallback(() => {
    const s = stateRef.current;
    s.pacX = 14;
    s.pacY = 22;
    s.pacPrevX = 14;
    s.pacPrevY = 22;
    s.pacLerpT = 1;
    s.pacDir = "left";
    s.pacNextDir = "left";
    s.ghostX = 13;
    s.ghostY = 13;
    s.ghostPrevX = 13;
    s.ghostPrevY = 13;
    s.ghostLerpT = 1;
    s.ghostDir = "up";
    s.readyTimer = 1500;
    s.readyStart = performance.now();
    s.deathAnim = 0;
    s.lastPacMove = 0;
    s.lastGhostMove = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Initialize
    const s = stateRef.current;
    s.maze = cloneMaze(MAZE_TEMPLATE);
    s.totalDots = countCollectibles(s.maze);
    s.dotsLeft = s.totalDots;
    s.score = 0;
    s.lives = STARTING_LIVES;
    s.powerTimer = 0;
    s.ghostEaten = false;
    s.ghostRespawnTimer = 0;
    s.readyStart = performance.now();
    gameOverRef.current = false;
    setScore(0);
    setLives(STARTING_LIVES);
    setPowerTimeLeft(0);
    resetPositions();

    // Key handlers
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.add(key);

      // Map keys to directions
      if (key === "arrowleft" || key === "a") s.pacNextDir = "left";
      else if (key === "arrowright" || key === "d") s.pacNextDir = "right";
      else if (key === "arrowup" || key === "w") s.pacNextDir = "up";
      else if (key === "arrowdown" || key === "s") s.pacNextDir = "down";

      if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // -----------------------------------------------------------------------
    // Draw functions
    // -----------------------------------------------------------------------

    function drawMaze() {
      const maze = stateRef.current.maze;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = c * CELL;
          const y = r * CELL;
          if (maze[r][c] === 1) {
            // Wall with subtle highlight
            ctx.fillStyle = WALL_COLOR;
            ctx.fillRect(x, y, CELL, CELL);
            // Inner highlight
            ctx.fillStyle = WALL_HIGHLIGHT;
            ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            ctx.fillStyle = WALL_COLOR;
            ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
          }
        }
      }
    }

    function drawDots() {
      const maze = stateRef.current.maze;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cx = c * CELL + CELL / 2;
          const cy = r * CELL + CELL / 2;
          if (maze[r][c] === 0) {
            // Small dot
            ctx.fillStyle = DOT_COLOR;
            ctx.beginPath();
            ctx.arc(cx, cy, 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (maze[r][c] === 3) {
            // Power pellet (pulsing)
            const pulse = Math.sin(performance.now() / 200) * 0.3 + 0.7;
            ctx.fillStyle = DOT_COLOR;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    function drawPacMan(_timestamp: number) {
      const s = stateRef.current;

      if (s.deathAnim > 0) {
        // Death animation: pac-man shrinks/opens mouth wide
        const progress = s.deathAnim;
        const cx = s.pacX * CELL + CELL / 2;
        const cy = s.pacY * CELL + CELL / 2;
        const mouthAngle = Math.PI * progress;

        ctx.fillStyle = PAC_COLOR;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, CELL / 2 - 2, mouthAngle, Math.PI * 2 - mouthAngle);
        ctx.closePath();
        ctx.fill();
        return;
      }

      // Interpolated position
      const lx = s.pacPrevX + (s.pacX - s.pacPrevX) * Math.min(s.pacLerpT, 1);
      const ly = s.pacPrevY + (s.pacY - s.pacPrevY) * Math.min(s.pacLerpT, 1);
      // Handle tunnel wrap for interpolation
      let drawX = lx;
      if (Math.abs(s.pacX - s.pacPrevX) > 2) {
        drawX = s.pacX; // snap on tunnel
      }
      const cx = drawX * CELL + CELL / 2;
      const cy = ly * CELL + CELL / 2;

      // Mouth animation
      const mouth = s.pacMouthAngle;

      // Direction angle
      let angle = 0;
      if (s.pacDir === "right") angle = 0;
      else if (s.pacDir === "down") angle = Math.PI / 2;
      else if (s.pacDir === "left") angle = Math.PI;
      else if (s.pacDir === "up") angle = -Math.PI / 2;

      const mouthRad = mouth * Math.PI;

      ctx.fillStyle = PAC_COLOR;
      ctx.shadowColor = PAC_COLOR;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, CELL / 2 - 2, angle + mouthRad, angle + Math.PI * 2 - mouthRad);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eye
      const eyeDist = 4;
      const eyeAngle = angle - Math.PI / 4;
      const ex = cx + Math.cos(eyeAngle) * eyeDist;
      const ey = cy + Math.sin(eyeAngle) * eyeDist;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawGhost(timestamp: number) {
      const s = stateRef.current;
      if (s.ghostRespawnTimer > 0) return; // Ghost is respawning

      const isPowered = s.powerTimer > timestamp;
      const isFlashing = isPowered && (s.powerTimer - timestamp) < 1500;

      // Interpolated position
      const lx = s.ghostPrevX + (s.ghostX - s.ghostPrevX) * Math.min(s.ghostLerpT, 1);
      const ly = s.ghostPrevY + (s.ghostY - s.ghostPrevY) * Math.min(s.ghostLerpT, 1);
      let drawX = lx;
      if (Math.abs(s.ghostX - s.ghostPrevX) > 2) {
        drawX = s.ghostX;
      }
      const cx = drawX * CELL + CELL / 2;
      const cy = ly * CELL + CELL / 2;
      const r = CELL / 2 - 2;

      // Color
      let color = GHOST_COLOR;
      if (isPowered) {
        if (isFlashing && Math.floor(timestamp / 150) % 2 === 0) {
          color = GHOST_FLASH;
        } else {
          color = GHOST_VULNERABLE;
        }
      }

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;

      // Ghost body: dome + wavy bottom
      ctx.beginPath();
      ctx.arc(cx, cy - 2, r, Math.PI, 0, false);
      // Right side down
      ctx.lineTo(cx + r, cy + r);
      // Wavy bottom
      const waves = 3;
      const waveW = (r * 2) / waves;
      for (let i = 0; i < waves; i++) {
        const wx = cx + r - (i * waveW) - waveW / 2;
        const baseY = cy + r;
        const waveY = baseY - 3 * Math.sin(timestamp / 100 + i);
        ctx.quadraticCurveTo(
          cx + r - i * waveW - waveW / 4,
          waveY,
          cx + r - (i + 1) * waveW,
          baseY
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes
      if (!isPowered) {
        // White eyes
        const eyeOffsetX = 3;
        const eyeOffsetY = -3;
        for (const side of [-1, 1]) {
          const ex = cx + side * eyeOffsetX;
          const ey = cy + eyeOffsetY;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.ellipse(ex, ey, 3, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          // Pupil (looks toward pac-man)
          const dx = s.pacX - s.ghostX;
          const dy = s.pacY - s.ghostY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          ctx.fillStyle = "#00f";
          ctx.beginPath();
          ctx.arc(ex + (dx / dist) * 1.5, ey + (dy / dist) * 1.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Scared face
        const eyeOffsetY = -2;
        for (const side of [-1, 1]) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(cx + side * 3, cy + eyeOffsetY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        // Wobbly mouth
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy + 4);
        for (let i = 0; i <= 4; i++) {
          ctx.lineTo(cx - 4 + i * 2, cy + 4 + (i % 2 === 0 ? 0 : -2));
        }
        ctx.stroke();
      }
    }

    function drawHUD(timestamp: number) {
      const s = stateRef.current;

      // Score
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`SCORE: ${s.score}`, 8, 16);

      // Lives (draw small pac-mans)
      ctx.textAlign = "right";
      ctx.fillText("LIVES:", CANVAS_W - 70, 16);
      for (let i = 0; i < s.lives; i++) {
        ctx.fillStyle = PAC_COLOR;
        ctx.beginPath();
        ctx.moveTo(CANVAS_W - 52 + i * 20, 12);
        ctx.arc(CANVAS_W - 52 + i * 20, 12, 7, 0.3, Math.PI * 2 - 0.3);
        ctx.closePath();
        ctx.fill();
      }

      // Power timer
      if (s.powerTimer > timestamp) {
        const remaining = Math.ceil((s.powerTimer - timestamp) / 1000);
        ctx.fillStyle = GHOST_VULNERABLE;
        ctx.textAlign = "center";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`POWER: ${remaining}s`, CANVAS_W / 2, 16);
      }

      // Dots remaining
      ctx.fillStyle = "#888";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${s.dotsLeft} DOTS LEFT`, CANVAS_W / 2, CANVAS_H - 6);
    }

    function drawReady(timestamp: number) {
      const s = stateRef.current;
      const elapsed = timestamp - s.readyStart;
      if (elapsed < s.readyTimer) {
        ctx.fillStyle = PAC_COLOR;
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("READY!", CANVAS_W / 2, CANVAS_H / 2);
        ctx.textBaseline = "alphabetic";
      }
    }

    function drawControls() {
      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("WASD or ARROWS to move", CANVAS_W / 2, CANVAS_H - 18);
    }

    // -----------------------------------------------------------------------
    // Game logic
    // -----------------------------------------------------------------------

    function tryMove(
      x: number,
      y: number,
      dir: string,
      maze: number[][]
    ): { nx: number; ny: number; moved: boolean } {
      const [dx, dy] = DIR[dir];
      let nx = x + dx;
      let ny = y + dy;

      // Tunnel wrap
      if (nx < 0) nx = COLS - 1;
      if (nx >= COLS) nx = 0;

      if (!isWalkable(maze, nx, ny)) {
        return { nx: x, ny: y, moved: false };
      }
      return { nx, ny, moved: true };
    }

    function update(timestamp: number) {
      const s = stateRef.current;

      // Ready countdown
      if (timestamp - s.readyStart < s.readyTimer) return;

      // Death animation
      if (s.deathAnim > 0) {
        const deathDuration = 800;
        s.deathAnim = Math.min((timestamp - s.deathStart) / deathDuration, 1);
        if (s.deathAnim >= 1) {
          s.deathAnim = 0;
          if (s.lives <= 0) {
            gameOverRef.current = true;
            onGameEnd(false);
            return;
          }
          resetPositions();
        }
        return;
      }

      // Update lerp timers
      if (s.lastPacMove > 0) {
        s.pacLerpT = (timestamp - s.lastPacMove) / PAC_MOVE_INTERVAL;
      }
      if (s.lastGhostMove > 0) {
        const ghostInterval = s.powerTimer > timestamp
          ? GHOST_VULNERABLE_INTERVAL
          : GHOST_MOVE_INTERVAL;
        s.ghostLerpT = (timestamp - s.lastGhostMove) / ghostInterval;
      }

      // Pac-Man mouth animation
      const mouthSpeed = 0.04;
      if (s.pacMouthOpening) {
        s.pacMouthAngle += mouthSpeed;
        if (s.pacMouthAngle >= 0.25) s.pacMouthOpening = false;
      } else {
        s.pacMouthAngle -= mouthSpeed;
        if (s.pacMouthAngle <= 0.02) s.pacMouthOpening = true;
      }

      // Pac-Man movement (tick-based)
      if (s.lastPacMove === 0 || timestamp - s.lastPacMove >= PAC_MOVE_INTERVAL) {
        // Try desired direction first
        const desired = tryMove(s.pacX, s.pacY, s.pacNextDir, s.maze);
        if (desired.moved) {
          s.pacPrevX = s.pacX;
          s.pacPrevY = s.pacY;
          s.pacX = desired.nx;
          s.pacY = desired.ny;
          s.pacDir = s.pacNextDir;
          s.pacLerpT = 0;
          s.lastPacMove = timestamp;
        } else {
          // Try current direction
          const current = tryMove(s.pacX, s.pacY, s.pacDir, s.maze);
          if (current.moved) {
            s.pacPrevX = s.pacX;
            s.pacPrevY = s.pacY;
            s.pacX = current.nx;
            s.pacY = current.ny;
            s.pacLerpT = 0;
            s.lastPacMove = timestamp;
          }
        }

        // Eat dot
        const cell = s.maze[s.pacY][s.pacX];
        if (cell === 0) {
          s.maze[s.pacY][s.pacX] = 2;
          s.score += DOT_SCORE;
          s.dotsLeft--;
        } else if (cell === 3) {
          s.maze[s.pacY][s.pacX] = 2;
          s.score += POWER_PELLET_SCORE;
          s.dotsLeft--;
          s.powerTimer = timestamp + POWER_DURATION;
          s.ghostEaten = false;
        }

        setScore(s.score);

        // Win check
        if (s.dotsLeft <= 0) {
          gameOverRef.current = true;
          onGameEnd(true);
          return;
        }
      }

      // Ghost respawn timer
      if (s.ghostRespawnTimer > 0) {
        if (timestamp > s.ghostRespawnTimer) {
          s.ghostRespawnTimer = 0;
          s.ghostX = 13;
          s.ghostY = 13;
          s.ghostPrevX = 13;
          s.ghostPrevY = 13;
          s.ghostLerpT = 1;
        }
        // Update power time display
        setPowerTimeLeft(s.powerTimer > timestamp ? Math.ceil((s.powerTimer - timestamp) / 1000) : 0);
        return;
      }

      // Ghost movement (tick-based)
      const ghostInterval = s.powerTimer > timestamp
        ? GHOST_VULNERABLE_INTERVAL
        : GHOST_MOVE_INTERVAL;

      if (s.lastGhostMove === 0 || timestamp - s.lastGhostMove >= ghostInterval) {
        const isVulnerable = s.powerTimer > timestamp;
        const dir = ghostBFS(s.maze, s.ghostX, s.ghostY, s.pacX, s.pacY, isVulnerable);
        const move = tryMove(s.ghostX, s.ghostY, dir, s.maze);
        if (move.moved) {
          s.ghostPrevX = s.ghostX;
          s.ghostPrevY = s.ghostY;
          s.ghostX = move.nx;
          s.ghostY = move.ny;
          s.ghostDir = dir;
          s.ghostLerpT = 0;
          s.lastGhostMove = timestamp;
        } else {
          s.lastGhostMove = timestamp;
        }
      }

      // Collision check
      if (s.pacX === s.ghostX && s.pacY === s.ghostY) {
        if (s.powerTimer > timestamp && !s.ghostEaten) {
          // Eat the ghost!
          s.score += GHOST_EAT_SCORE;
          s.ghostEaten = true;
          s.ghostRespawnTimer = timestamp + 3000;
          setScore(s.score);
        } else if (s.powerTimer <= timestamp) {
          // Ghost catches pac-man
          s.lives--;
          setLives(s.lives);
          s.deathAnim = 0.01;
          s.deathStart = timestamp;
          s.powerTimer = 0;
        }
      }

      // Also check interpolation overlap (ghost passing through pac)
      const gDist = Math.abs(s.pacX - s.ghostX) + Math.abs(s.pacY - s.ghostY);
      if (gDist <= 1 && s.ghostRespawnTimer <= 0) {
        // Extra check: are they on the same cell or adjacent and interpolating through each other
        if (s.pacX === s.ghostX && s.pacY === s.ghostY) {
          // Already handled above
        }
      }

      // Update power time display
      setPowerTimeLeft(s.powerTimer > timestamp ? Math.ceil((s.powerTimer - timestamp) / 1000) : 0);
      setLives(s.lives);
    }

    // -----------------------------------------------------------------------
    // Main loop
    // -----------------------------------------------------------------------

    function frame(timestamp: number) {
      if (gameOverRef.current) return;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      drawMaze();
      drawDots();
      update(timestamp);
      drawGhost(timestamp);
      drawPacMan(timestamp);
      drawHUD(timestamp);
      drawReady(timestamp);
      drawControls();

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode, onGameEnd, resetPositions]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* HUD bar */}
      <div className="flex items-center justify-between w-full max-w-[560px] px-2">
        <div className="text-[var(--neon-yellow)] text-xs font-mono glow-yellow">
          SCORE: {score}
        </div>
        {powerTimeLeft > 0 && (
          <div className="text-[#4444ff] text-xs font-mono animate-pulse">
            POWER: {powerTimeLeft}s
          </div>
        )}
        <div className="flex items-center gap-1 text-xs font-mono text-[var(--text-muted)]">
          LIVES:
          {Array.from({ length: lives }).map((_, i) => (
            <span key={i} className="text-[var(--neon-yellow)]">&#9679;</span>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="border border-[#1a1a6a] rounded shadow-lg shadow-blue-900/30"
        style={{ imageRendering: "pixelated" }}
      />

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[9px] font-mono tracking-wider">
        WASD or ARROWS to move
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------------------

export default function PacChasePage() {
  return (
    <GameWrapper title="PAC CHASE" color="yellow">
      {({ mode, onGameEnd }) => (
        <PacChaseGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
