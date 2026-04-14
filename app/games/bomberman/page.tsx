"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLS = 13;
const ROWS = 11;
const TILE = 40;
const CANVAS_W = COLS * TILE; // 520
const CANVAS_H = ROWS * TILE; // 440

const BG = "#0a0a1a";
const PLAYER_COLOR = "#00ffff";
const AI_COLOR = "#ff00ff";
const WALL_COLOR = "#333344";
const BLOCK_COLOR = "#cc7722";
const BLOCK_HIGHLIGHT = "#dd9944";
const BOMB_COLOR = "#ffff00";
const EXPLOSION_COLOR = "#ff6600";
const POWERUP_BOMB_COLOR = "#00ff41";
const POWERUP_RANGE_COLOR = "#ff2d95";
const GROUND_COLOR = "#111122";
const GROUND_ALT = "#0f0f1e";

// Tile types
const EMPTY = 0;
const WALL = 1; // indestructible
const BLOCK = 2; // destructible

// Powerup types
const PU_NONE = 0;
const PU_BOMB = 1; // extra bomb capacity
const PU_RANGE = 2; // bigger explosion range

const BOMB_FUSE = 2000; // ms
const EXPLOSION_DURATION = 500; // ms
const MOVE_COOLDOWN = 140; // ms between grid moves
const AI_MOVE_COOLDOWN = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Player {
  col: number;
  row: number;
  alive: boolean;
  maxBombs: number;
  bombRange: number;
  activeBombs: number;
  lastMove: number;
  // Smooth rendering position
  renderX: number;
  renderY: number;
}

interface Bomb {
  col: number;
  row: number;
  owner: "player" | "ai";
  placedAt: number;
  range: number;
  exploded: boolean;
}

interface Explosion {
  cells: { col: number; row: number }[];
  startedAt: number;
}

interface PowerUp {
  col: number;
  row: number;
  type: number; // PU_BOMB or PU_RANGE
}

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------

function generateMap(): { grid: number[][]; powerups: PowerUp[] } {
  const grid: number[][] = [];
  const powerups: PowerUp[] = [];

  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      // Border walls
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        grid[r][c] = WALL;
      }
      // Interior checkerboard walls
      else if (r % 2 === 0 && c % 2 === 0) {
        grid[r][c] = WALL;
      } else {
        grid[r][c] = EMPTY;
      }
    }
  }

  // Player spawn area (bottom-left): ensure clear at (1,9), (2,9), (1,8), (3,9), (1,7)
  const playerSafe = [
    [ROWS - 2, 1],
    [ROWS - 2, 2],
    [ROWS - 3, 1],
    [ROWS - 4, 1],
    [ROWS - 2, 3],
  ];
  // AI spawn area (top-right): ensure clear at (11,1), (10,1), (11,2), (9,1), (11,3)
  const aiSafe = [
    [1, COLS - 2],
    [1, COLS - 3],
    [2, COLS - 2],
    [1, COLS - 4],
    [3, COLS - 2],
  ];

  const safeSet = new Set<string>();
  for (const [r, c] of playerSafe) safeSet.add(`${r},${c}`);
  for (const [r, c] of aiSafe) safeSet.add(`${r},${c}`);

  // Place destructible blocks
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] !== EMPTY) continue;
      if (safeSet.has(`${r},${c}`)) continue;
      if (Math.random() < 0.4) {
        grid[r][c] = BLOCK;
        // 25% chance of a powerup hidden inside
        if (Math.random() < 0.25) {
          powerups.push({
            col: c,
            row: r,
            type: Math.random() < 0.5 ? PU_BOMB : PU_RANGE,
          });
        }
      }
    }
  }

  return { grid, powerups };
}

// ---------------------------------------------------------------------------
// BombermanGame component
// ---------------------------------------------------------------------------

function BombermanGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const gameOverRef = useRef(false);

  const [countdown, setCountdown] = useState<number | null>(3);
  const [statusText, setStatusText] = useState<string>("");

  // -----------------------------------------------------------------------
  // Main game loop
  // -----------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    gameOverRef.current = false;

    // -- Generate map ---------------------------------------------------
    const { grid, powerups } = generateMap();
    let visiblePowerups: PowerUp[] = []; // revealed after block destroyed

    // -- State ----------------------------------------------------------
    const player: Player = {
      col: 1,
      row: ROWS - 2,
      alive: true,
      maxBombs: 1,
      bombRange: 2,
      activeBombs: 0,
      lastMove: 0,
      renderX: 1 * TILE,
      renderY: (ROWS - 2) * TILE,
    };

    const ai: Player = {
      col: COLS - 2,
      row: 1,
      alive: true,
      maxBombs: 1,
      bombRange: 2,
      activeBombs: 0,
      lastMove: 0,
      renderX: (COLS - 2) * TILE,
      renderY: 1 * TILE,
    };

    const bombs: Bomb[] = [];
    const explosions: Explosion[] = [];
    let paused = true;
    let gameTime = 0;
    let lastTimestamp = 0;

    // Countdown ----------------------------------------------------------
    let countVal = 3;
    setCountdown(3);
    setStatusText("");
    const countdownInterval = setInterval(() => {
      countVal -= 1;
      if (countVal <= 0) {
        clearInterval(countdownInterval);
        setCountdown(null);
        paused = false;
        lastTimestamp = performance.now();
      } else {
        setCountdown(countVal);
      }
    }, 800);

    // Input --------------------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "a",
          "s",
          "d",
          "W",
          "A",
          "S",
          "D",
          " ",
        ].includes(e.key)
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // -- Helpers ---------------------------------------------------------

    function isWalkable(col: number, row: number): boolean {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
      if (grid[row][col] !== EMPTY) return false;
      // Can't walk through bombs
      for (const b of bombs) {
        if (!b.exploded && b.col === col && b.row === row) return false;
      }
      return true;
    }

    function isWalkableIgnoreBombs(col: number, row: number): boolean {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
      return grid[row][col] === EMPTY;
    }

    function placeBomb(who: Player, owner: "player" | "ai") {
      if (who.activeBombs >= who.maxBombs) return;
      // Don't place if bomb already at this cell
      for (const b of bombs) {
        if (!b.exploded && b.col === who.col && b.row === who.row) return;
      }
      bombs.push({
        col: who.col,
        row: who.row,
        owner,
        placedAt: gameTime,
        range: who.bombRange,
        exploded: false,
      });
      who.activeBombs++;
    }

    function getExplosionCells(
      col: number,
      row: number,
      range: number
    ): { col: number; row: number }[] {
      const cells: { col: number; row: number }[] = [{ col, row }];
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      for (const [dc, dr] of dirs) {
        for (let i = 1; i <= range; i++) {
          const nc = col + dc * i;
          const nr = row + dr * i;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
          if (grid[nr][nc] === WALL) break;
          cells.push({ col: nc, row: nr });
          if (grid[nr][nc] === BLOCK) break; // explosion stops at block but hits it
        }
      }
      return cells;
    }

    function triggerExplosion(bomb: Bomb) {
      if (bomb.exploded) return;
      bomb.exploded = true;
      if (bomb.owner === "player") player.activeBombs = Math.max(0, player.activeBombs - 1);
      else ai.activeBombs = Math.max(0, ai.activeBombs - 1);

      const cells = getExplosionCells(bomb.col, bomb.row, bomb.range);
      explosions.push({ cells, startedAt: gameTime });

      // Destroy blocks, reveal powerups
      for (const cell of cells) {
        if (grid[cell.row][cell.col] === BLOCK) {
          grid[cell.row][cell.col] = EMPTY;
          // Check for hidden powerup
          const puIdx = powerups.findIndex(
            (p) => p.col === cell.col && p.row === cell.row
          );
          if (puIdx !== -1) {
            visiblePowerups.push(powerups[puIdx]);
            powerups.splice(puIdx, 1);
          }
        }
      }

      // Chain-detonate other bombs in the blast
      for (const other of bombs) {
        if (other.exploded) continue;
        for (const cell of cells) {
          if (other.col === cell.col && other.row === cell.row) {
            triggerExplosion(other);
            break;
          }
        }
      }

      // Kill players
      for (const cell of cells) {
        if (
          player.alive &&
          player.col === cell.col &&
          player.row === cell.row
        ) {
          player.alive = false;
        }
        if (ai.alive && ai.col === cell.col && ai.row === cell.row) {
          ai.alive = false;
        }
      }
    }

    function checkPowerups(who: Player) {
      const idx = visiblePowerups.findIndex(
        (p) => p.col === who.col && p.row === who.row
      );
      if (idx !== -1) {
        const pu = visiblePowerups[idx];
        if (pu.type === PU_BOMB) {
          who.maxBombs = Math.min(who.maxBombs + 1, 5);
        } else if (pu.type === PU_RANGE) {
          who.bombRange = Math.min(who.bombRange + 1, 6);
        }
        visiblePowerups.splice(idx, 1);
      }
    }

    // -- AI Logic --------------------------------------------------------

    function isCellDangerous(col: number, row: number): boolean {
      for (const b of bombs) {
        if (b.exploded) continue;
        const cells = getExplosionCells(b.col, b.row, b.range);
        for (const cell of cells) {
          if (cell.col === col && cell.row === row) return true;
        }
      }
      return false;
    }

    function aiGetSafeNeighbors(col: number, row: number): { col: number; row: number }[] {
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      const result: { col: number; row: number }[] = [];
      for (const [dc, dr] of dirs) {
        const nc = col + dc;
        const nr = row + dr;
        if (isWalkable(nc, nr) && !isCellDangerous(nc, nr)) {
          result.push({ col: nc, row: nr });
        }
      }
      return result;
    }

    function canEscapeAfterBomb(col: number, row: number, range: number): boolean {
      // Check if AI can flee after placing a bomb at col,row
      const blastCells = getExplosionCells(col, row, range);
      const blastSet = new Set(blastCells.map((c) => `${c.col},${c.row}`));

      // BFS to find a safe tile
      const visited = new Set<string>();
      const queue: { col: number; row: number; steps: number }[] = [];

      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      for (const [dc, dr] of dirs) {
        const nc = col + dc;
        const nr = row + dr;
        if (isWalkableIgnoreBombs(nc, nr)) {
          const key = `${nc},${nr}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ col: nc, row: nr, steps: 1 });
          }
        }
      }

      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (!blastSet.has(`${cur.col},${cur.row}`) && !isCellDangerous(cur.col, cur.row)) {
          return true;
        }
        if (cur.steps >= 4) continue;
        for (const [dc, dr] of dirs) {
          const nc = cur.col + dc;
          const nr = cur.row + dr;
          const key = `${nc},${nr}`;
          if (!visited.has(key) && isWalkableIgnoreBombs(nc, nr)) {
            visited.add(key);
            queue.push({ col: nc, row: nr, steps: cur.steps + 1 });
          }
        }
      }
      return false;
    }

    let aiState: "wander" | "flee" | "attack" = "wander";
    let aiTarget: { col: number; row: number } | null = null;
    let aiPath: { col: number; row: number }[] = [];

    function bfs(
      startCol: number,
      startRow: number,
      goalCol: number,
      goalRow: number
    ): { col: number; row: number }[] | null {
      if (startCol === goalCol && startRow === goalRow) return [];
      const visited = new Set<string>();
      const parent = new Map<string, { col: number; row: number } | null>();
      const queue: { col: number; row: number }[] = [
        { col: startCol, row: startRow },
      ];
      const startKey = `${startCol},${startRow}`;
      visited.add(startKey);
      parent.set(startKey, null);

      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];

      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const [dc, dr] of dirs) {
          const nc = cur.col + dc;
          const nr = cur.row + dr;
          const key = `${nc},${nr}`;
          if (visited.has(key)) continue;
          if (!isWalkable(nc, nr)) continue;
          visited.add(key);
          parent.set(key, { col: cur.col, row: cur.row });
          if (nc === goalCol && nr === goalRow) {
            // Reconstruct path
            const path: { col: number; row: number }[] = [];
            let node: { col: number; row: number } | null = { col: nc, row: nr };
            while (node !== null) {
              path.unshift(node);
              const k: string = `${node.col},${node.row}`;
              node = parent.get(k) ?? null;
            }
            path.shift(); // remove start
            return path;
          }
          queue.push({ col: nc, row: nr });
        }
      }
      return null;
    }

    function aiUpdate() {
      if (!ai.alive || gameOverRef.current) return;
      if (gameTime - ai.lastMove < AI_MOVE_COOLDOWN) return;

      const inDanger = isCellDangerous(ai.col, ai.row);

      if (inDanger) {
        aiState = "flee";
      }

      if (aiState === "flee") {
        // Find nearest safe cell via BFS
        const safeNeighbors = aiGetSafeNeighbors(ai.col, ai.row);
        if (safeNeighbors.length > 0) {
          const target = safeNeighbors[Math.floor(Math.random() * safeNeighbors.length)];
          ai.col = target.col;
          ai.row = target.row;
          ai.lastMove = gameTime;
          checkPowerups(ai);
          if (!isCellDangerous(ai.col, ai.row)) {
            aiState = "wander";
          }
          return;
        }
        // If no safe neighbor, try any walkable neighbor
        const dirs = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ];
        const anyMoves: { col: number; row: number }[] = [];
        for (const [dc, dr] of dirs) {
          const nc = ai.col + dc;
          const nr = ai.row + dr;
          if (isWalkable(nc, nr)) anyMoves.push({ col: nc, row: nr });
        }
        if (anyMoves.length > 0) {
          const target = anyMoves[Math.floor(Math.random() * anyMoves.length)];
          ai.col = target.col;
          ai.row = target.row;
          ai.lastMove = gameTime;
          checkPowerups(ai);
        }
        return;
      }

      // Check if adjacent to a destructible block -> place bomb
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      let adjacentBlock = false;
      for (const [dc, dr] of dirs) {
        const nc = ai.col + dc;
        const nr = ai.row + dr;
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && grid[nr][nc] === BLOCK) {
          adjacentBlock = true;
          break;
        }
      }

      // Also try to trap player: if player is in blast range
      let playerInRange = false;
      if (player.alive) {
        const blastCells = getExplosionCells(ai.col, ai.row, ai.bombRange);
        for (const cell of blastCells) {
          if (cell.col === player.col && cell.row === player.row) {
            playerInRange = true;
            break;
          }
        }
      }

      if ((adjacentBlock || playerInRange) && ai.activeBombs < ai.maxBombs) {
        if (canEscapeAfterBomb(ai.col, ai.row, ai.bombRange)) {
          placeBomb(ai, "ai");
          aiState = "flee";
          return;
        }
      }

      // Wander: pick a target to move toward
      if (aiPath.length === 0 || (aiTarget && !isWalkable(aiTarget.col, aiTarget.row))) {
        // Find nearest block to target
        let bestDist = Infinity;
        let bestTarget: { col: number; row: number } | null = null;

        // Also consider moving toward player sometimes
        if (player.alive && Math.random() < 0.3) {
          // Move toward player
          const path = bfs(ai.col, ai.row, player.col, player.row);
          if (path && path.length > 0) {
            aiPath = path.slice(0, 3);
            aiTarget = { col: player.col, row: player.row };
          }
        }

        if (aiPath.length === 0) {
          // Find nearest block
          for (let r = 1; r < ROWS - 1; r++) {
            for (let c = 1; c < COLS - 1; c++) {
              if (grid[r][c] !== BLOCK) continue;
              // Find adjacent walkable cell to target
              for (const [dc, dr] of dirs) {
                const nc = c + dc;
                const nr = r + dr;
                if (!isWalkableIgnoreBombs(nc, nr)) continue;
                const dist = Math.abs(nc - ai.col) + Math.abs(nr - ai.row);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestTarget = { col: nc, row: nr };
                }
              }
            }
          }
          if (bestTarget) {
            const path = bfs(ai.col, ai.row, bestTarget.col, bestTarget.row);
            if (path && path.length > 0) {
              aiPath = path.slice(0, 5);
              aiTarget = bestTarget;
            }
          }
        }
      }

      // Follow path
      if (aiPath.length > 0) {
        const next = aiPath[0];
        if (isWalkable(next.col, next.row) && !isCellDangerous(next.col, next.row)) {
          ai.col = next.col;
          ai.row = next.row;
          ai.lastMove = gameTime;
          aiPath.shift();
          checkPowerups(ai);
        } else {
          aiPath = []; // path blocked, recalculate
          // Try random safe move
          const safeNeighbors = aiGetSafeNeighbors(ai.col, ai.row);
          if (safeNeighbors.length > 0) {
            const target = safeNeighbors[Math.floor(Math.random() * safeNeighbors.length)];
            ai.col = target.col;
            ai.row = target.row;
            ai.lastMove = gameTime;
            checkPowerups(ai);
          }
        }
      } else {
        // Random walk
        const safeNeighbors = aiGetSafeNeighbors(ai.col, ai.row);
        if (safeNeighbors.length > 0) {
          const target = safeNeighbors[Math.floor(Math.random() * safeNeighbors.length)];
          ai.col = target.col;
          ai.row = target.row;
          ai.lastMove = gameTime;
          checkPowerups(ai);
        }
      }
    }

    // -- Drawing ---------------------------------------------------------

    function drawTile(
      col: number,
      row: number,
      color: string,
      glow: boolean = false
    ) {
      const x = col * TILE;
      const y = row * TILE;
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.shadowBlur = 0;
    }

    function drawGrid() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = c * TILE;
          const y = r * TILE;

          // Ground
          ctx.fillStyle = (r + c) % 2 === 0 ? GROUND_COLOR : GROUND_ALT;
          ctx.fillRect(x, y, TILE, TILE);

          if (grid[r][c] === WALL) {
            // Indestructible wall with subtle pattern
            ctx.fillStyle = WALL_COLOR;
            ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
            // Brick lines
            ctx.strokeStyle = "#444466";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
            ctx.beginPath();
            ctx.moveTo(x + 3, y + TILE / 2);
            ctx.lineTo(x + TILE - 3, y + TILE / 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + TILE / 2, y + 3);
            ctx.lineTo(x + TILE / 2, y + TILE / 2);
            ctx.stroke();
          } else if (grid[r][c] === BLOCK) {
            // Destructible block
            ctx.fillStyle = BLOCK_COLOR;
            ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
            // Cracks/detail
            ctx.fillStyle = BLOCK_HIGHLIGHT;
            ctx.fillRect(x + 3, y + 3, TILE - 10, 3);
            ctx.fillRect(x + 3, y + 3, 3, TILE - 10);
          }
        }
      }
    }

    function drawPowerups() {
      for (const pu of visiblePowerups) {
        const x = pu.col * TILE;
        const y = pu.row * TILE;
        const cx = x + TILE / 2;
        const cy = y + TILE / 2;

        if (pu.type === PU_BOMB) {
          // Green circle with B
          ctx.fillStyle = POWERUP_BOMB_COLOR;
          ctx.shadowColor = POWERUP_BOMB_COLOR;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#000";
          ctx.font = 'bold 11px "Courier New", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("B", cx, cy + 1);
        } else {
          // Pink circle with R
          ctx.fillStyle = POWERUP_RANGE_COLOR;
          ctx.shadowColor = POWERUP_RANGE_COLOR;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#000";
          ctx.font = 'bold 11px "Courier New", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("R", cx, cy + 1);
        }
      }
    }

    function drawBombs() {
      for (const bomb of bombs) {
        if (bomb.exploded) continue;
        const x = bomb.col * TILE + TILE / 2;
        const y = bomb.row * TILE + TILE / 2;
        const elapsed = gameTime - bomb.placedAt;
        const pulsePhase = Math.sin((elapsed / 200) * Math.PI);
        const radius = 12 + pulsePhase * 3;

        // Bomb body
        ctx.fillStyle = "#222";
        ctx.shadowColor = BOMB_COLOR;
        ctx.shadowBlur = 6 + pulsePhase * 6;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Fuse spark
        const sparkIntensity = (elapsed / BOMB_FUSE);
        const sparkColor = sparkIntensity > 0.7 ? "#ff0000" : BOMB_COLOR;
        ctx.fillStyle = sparkColor;
        ctx.shadowColor = sparkColor;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y - radius + 2, 3 + pulsePhase * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Timer arc
        const progress = elapsed / BOMB_FUSE;
        ctx.strokeStyle = progress > 0.7 ? "#ff0000" : BOMB_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }
    }

    function drawExplosions() {
      for (const exp of explosions) {
        const elapsed = gameTime - exp.startedAt;
        const progress = elapsed / EXPLOSION_DURATION;
        if (progress >= 1) continue;

        const alpha = 1 - progress;
        const expand = 0.3 + progress * 0.7;

        for (const cell of exp.cells) {
          const cx = cell.col * TILE + TILE / 2;
          const cy = cell.row * TILE + TILE / 2;
          const size = TILE * expand;

          // Core glow
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
          gradient.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
          gradient.addColorStop(0.3, `rgba(255,200,0,${alpha * 0.8})`);
          gradient.addColorStop(0.6, `rgba(255,100,0,${alpha * 0.6})`);
          gradient.addColorStop(1, `rgba(255,50,0,0)`);

          ctx.fillStyle = gradient;
          ctx.fillRect(cx - size / 2, cy - size / 2, size, size);

          // Hot center
          ctx.fillStyle = `rgba(255,255,200,${alpha * 0.7})`;
          ctx.shadowColor = "#ff6600";
          ctx.shadowBlur = 20 * alpha;
          ctx.beginPath();
          ctx.arc(cx, cy, 6 * alpha, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    function drawPlayer(p: Player, color: string, label: string) {
      if (!p.alive) return;

      // Smooth interpolation toward grid position
      const targetX = p.col * TILE;
      const targetY = p.row * TILE;
      p.renderX += (targetX - p.renderX) * 0.3;
      p.renderY += (targetY - p.renderY) * 0.3;

      const x = p.renderX + TILE / 2;
      const y = p.renderY + TILE / 2;

      // Body
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.fillStyle = `rgba(255,255,255,0.3)`;
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, 5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.font = 'bold 8px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, x, p.renderY - 1);
      ctx.shadowBlur = 0;
    }

    function drawHUD() {
      // Player stats
      ctx.fillStyle = PLAYER_COLOR;
      ctx.shadowColor = PLAYER_COLOR;
      ctx.shadowBlur = 4;
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`BOMBS:${player.maxBombs} RNG:${player.bombRange}`, 4, 2);
      ctx.shadowBlur = 0;

      // AI stats
      ctx.fillStyle = AI_COLOR;
      ctx.shadowColor = AI_COLOR;
      ctx.shadowBlur = 4;
      ctx.textAlign = "right";
      ctx.fillText(`BOMBS:${ai.maxBombs} RNG:${ai.bombRange}`, CANVAS_W - 4, 2);
      ctx.shadowBlur = 0;
    }

    function drawBorder() {
      ctx.strokeStyle = "#ff8800";
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2);
      ctx.shadowBlur = 0;
    }

    // -- Game loop -------------------------------------------------------

    let spacePressedLastFrame = false;

    const tick = (timestamp: number) => {
      if (gameOverRef.current) return;

      if (!paused) {
        const dt = timestamp - lastTimestamp;
        lastTimestamp = timestamp;
        gameTime += dt;

        // --- Player input ------------------------------------------------
        const keys = keysRef.current;
        if (player.alive && gameTime - player.lastMove >= MOVE_COOLDOWN) {
          let dc = 0;
          let dr = 0;
          if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dr = -1;
          else if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dr = 1;
          else if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dc = -1;
          else if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dc = 1;

          if (dc !== 0 || dr !== 0) {
            const nc = player.col + dc;
            const nr = player.row + dr;
            if (isWalkable(nc, nr)) {
              player.col = nc;
              player.row = nr;
              player.lastMove = gameTime;
              checkPowerups(player);
            }
          }
        }

        // Space to place bomb (only on press, not hold)
        const spaceDown = keys.has(" ");
        if (spaceDown && !spacePressedLastFrame && player.alive) {
          placeBomb(player, "player");
        }
        spacePressedLastFrame = spaceDown;

        // --- Bomb fuse check -------------------------------------------
        for (const bomb of bombs) {
          if (!bomb.exploded && gameTime - bomb.placedAt >= BOMB_FUSE) {
            triggerExplosion(bomb);
          }
        }

        // --- Clean up old explosions -----------------------------------
        for (let i = explosions.length - 1; i >= 0; i--) {
          if (gameTime - explosions[i].startedAt >= EXPLOSION_DURATION) {
            explosions.splice(i, 1);
          }
        }

        // --- Clean up exploded bombs -----------------------------------
        for (let i = bombs.length - 1; i >= 0; i--) {
          if (bombs[i].exploded && gameTime - bombs[i].placedAt >= BOMB_FUSE + EXPLOSION_DURATION) {
            bombs.splice(i, 1);
          }
        }

        // --- AI --------------------------------------------------------
        aiUpdate();

        // --- Check win/loss --------------------------------------------
        if (!player.alive && !ai.alive) {
          // Draw
          gameOverRef.current = true;
          setStatusText("DRAW!");
          onGameEnd(false);
          return;
        }
        if (!player.alive) {
          gameOverRef.current = true;
          setStatusText("DEFEATED!");
          onGameEnd(false);
          return;
        }
        if (!ai.alive) {
          gameOverRef.current = true;
          setStatusText("VICTORY!");
          onGameEnd(true);
          return;
        }
      }

      // --- Draw --------------------------------------------------------
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      drawGrid();
      drawPowerups();
      drawBombs();
      drawExplosions();
      drawPlayer(player, PLAYER_COLOR, "YOU");
      drawPlayer(ai, AI_COLOR, "CPU");
      drawHUD();
      drawBorder();

      // Countdown overlay
      if (paused && countVal > 0) {
        // Dim overlay
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.font = '72px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ff8800";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 30;
        ctx.fillText(String(countVal), CANVAS_W / 2, CANVAS_H / 2);
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Cleanup ------------------------------------------------------------
    return () => {
      clearInterval(countdownInterval);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      gameOverRef.current = true;
    };
  }, [onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Status */}
      {statusText && (
        <div
          className={`text-lg font-bold ${
            statusText === "VICTORY!"
              ? "text-[#00ff41] glow-green"
              : "text-[#ff00ff] glow-magenta"
          }`}
        >
          {statusText}
        </div>
      )}

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block max-w-full h-auto border border-[#ff8800]/20"
          style={{ imageRendering: "pixelated" }}
        />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[#ff8800] text-6xl font-bold animate-pulse"
              style={{ textShadow: "0 0 30px #ff8800" }}
            >
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        WASD MOVE&nbsp;&nbsp;|&nbsp;&nbsp;SPACE BOMB
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-[8px]">
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: PLAYER_COLOR, boxShadow: `0 0 6px ${PLAYER_COLOR}` }}
          />
          <span className="text-[var(--text-muted)]">YOU</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: AI_COLOR, boxShadow: `0 0 6px ${AI_COLOR}` }}
          />
          <span className="text-[var(--text-muted)]">CPU</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: POWERUP_BOMB_COLOR, boxShadow: `0 0 6px ${POWERUP_BOMB_COLOR}` }}
          />
          <span className="text-[var(--text-muted)]">+BOMB</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: POWERUP_RANGE_COLOR, boxShadow: `0 0 6px ${POWERUP_RANGE_COLOR}` }}
          />
          <span className="text-[var(--text-muted)]">+RANGE</span>
        </div>
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

export default function BombermanPage() {
  return (
    <GameWrapper title="BOMBERMAN" color="orange">
      {({ mode, onGameEnd }) => (
        <BombermanGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
