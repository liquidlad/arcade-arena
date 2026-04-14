"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CellState = "empty" | "ship" | "hit" | "miss" | "sunk";

interface Ship {
  name: string;
  size: number;
  cells: [number, number][];
  hits: Set<string>;
  sunk: boolean;
}

interface Board {
  grid: CellState[][];
  ships: Ship[];
}

type Phase = "setup" | "battle";
type Turn = "player" | "ai";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID = 10;
const ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const COL_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const SHIP_DEFS: { name: string; size: number }[] = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

const key = (r: number, c: number) => `${r},${c}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyGrid(): CellState[][] {
  return Array.from({ length: GRID }, () => Array(GRID).fill("empty") as CellState[]);
}

function canPlace(grid: CellState[][], r: number, c: number, size: number, dir: 0 | 1): boolean {
  for (let i = 0; i < size; i++) {
    const nr = dir === 0 ? r : r + i;
    const nc = dir === 0 ? c + i : c;
    if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return false;
    if (grid[nr][nc] !== "empty") return false;
  }
  return true;
}

function randomPlace(grid: CellState[][], ships: Ship[]): { grid: CellState[][]; ships: Ship[] } {
  const g = grid.map((row) => [...row]);
  const placed: Ship[] = [];

  for (const def of SHIP_DEFS) {
    let attempts = 0;
    while (attempts < 500) {
      const dir = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
      const r = Math.floor(Math.random() * GRID);
      const c = Math.floor(Math.random() * GRID);
      if (canPlace(g, r, c, def.size, dir)) {
        const cells: [number, number][] = [];
        for (let i = 0; i < def.size; i++) {
          const nr = dir === 0 ? r : r + i;
          const nc = dir === 0 ? c + i : c;
          g[nr][nc] = "ship";
          cells.push([nr, nc]);
        }
        placed.push({ name: def.name, size: def.size, cells, hits: new Set(), sunk: false });
        break;
      }
      attempts++;
    }
  }

  return { grid: g, ships: placed };
}

function createBoard(): Board {
  const { grid, ships } = randomPlace(createEmptyGrid(), []);
  return { grid, ships };
}

// ---------------------------------------------------------------------------
// AI brain
// ---------------------------------------------------------------------------

interface AIState {
  mode: "hunt" | "target";
  targets: [number, number][];
  hitStack: [number, number][];
}

function initAI(): AIState {
  return { mode: "hunt", targets: [], hitStack: [] };
}

function aiPickTarget(ai: AIState, grid: CellState[][]): [number, number] {
  // Target mode: try adjacent cells of known hits
  while (ai.targets.length > 0) {
    const t = ai.targets.pop()!;
    if (grid[t[0]][t[1]] === "empty" || grid[t[0]][t[1]] === "ship") {
      return t;
    }
  }

  // Hunt mode: random shot on checkerboard pattern for efficiency
  const available: [number, number][] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if ((grid[r][c] === "empty" || grid[r][c] === "ship") && (r + c) % 2 === 0) {
        available.push([r, c]);
      }
    }
  }
  // Fallback: also odd cells
  if (available.length === 0) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c] === "empty" || grid[r][c] === "ship") {
          available.push([r, c]);
        }
      }
    }
  }

  ai.mode = "hunt";
  return available[Math.floor(Math.random() * available.length)];
}

function aiAfterHit(ai: AIState, r: number, c: number) {
  ai.mode = "target";
  const adj: [number, number][] = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
  for (const [nr, nc] of adj) {
    if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
      ai.targets.push([nr, nc]);
    }
  }
  ai.hitStack.push([r, c]);
}

function aiAfterSink(ai: AIState) {
  ai.hitStack = [];
  ai.targets = [];
  ai.mode = "hunt";
}

// ---------------------------------------------------------------------------
// Cell component
// ---------------------------------------------------------------------------

function Cell({
  state,
  isPlayerGrid,
  onClick,
  hovered,
  onHover,
}: {
  state: CellState;
  isPlayerGrid: boolean;
  onClick?: () => void;
  hovered?: boolean;
  onHover?: (h: boolean) => void;
}) {
  let bg = "bg-[var(--bg-dark)]";
  let border = "border-[#1a1a3a]";
  let glow = "";
  let content = "";

  if (state === "ship" && isPlayerGrid) {
    bg = "bg-[rgba(0,255,255,0.15)]";
    border = "border-[rgba(0,255,255,0.3)]";
  } else if (state === "hit" || state === "sunk") {
    bg = state === "sunk" ? "bg-[rgba(255,0,255,0.25)]" : "bg-[rgba(255,0,255,0.15)]";
    border = "border-[var(--neon-magenta)]";
    glow = "shadow-[0_0_6px_var(--neon-magenta),0_0_12px_rgba(255,0,255,0.3)]";
    content = "X";
  } else if (state === "miss") {
    bg = "bg-[rgba(106,106,154,0.1)]";
    border = "border-[rgba(106,106,154,0.3)]";
    content = "\u2022";
  }

  const hoverable = !isPlayerGrid && onClick && (state === "empty" || state === "ship");

  return (
    <div
      onClick={hoverable ? onClick : undefined}
      onMouseEnter={hoverable && onHover ? () => onHover(true) : undefined}
      onMouseLeave={hoverable && onHover ? () => onHover(false) : undefined}
      className={`
        w-[30px] h-[30px] sm:w-[35px] sm:h-[35px] border flex items-center justify-center
        text-[8px] select-none transition-all duration-100
        ${bg} ${border} ${glow}
        ${hoverable ? "cursor-crosshair hover:bg-[rgba(0,255,255,0.1)] hover:border-[var(--neon-cyan)]" : ""}
        ${hovered ? "bg-[rgba(0,255,255,0.15)] border-[var(--neon-cyan)]" : ""}
      `}
      style={{ fontFamily: "var(--font-press-start), monospace" }}
    >
      {state === "hit" || state === "sunk" ? (
        <span className="text-[var(--neon-magenta)] text-[10px]">{content}</span>
      ) : state === "miss" ? (
        <span className="text-[var(--text-muted)] text-[10px]">{content}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid component
// ---------------------------------------------------------------------------

function GameGrid({
  title,
  grid,
  isPlayerGrid,
  onCellClick,
  disabled,
}: {
  title: string;
  grid: CellState[][];
  isPlayerGrid: boolean;
  onCellClick?: (r: number, c: number) => void;
  disabled?: boolean;
}) {
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="text-[10px] text-[var(--neon-cyan)] glow-cyan tracking-widest mb-1"
        style={{ fontFamily: "var(--font-press-start), monospace" }}
      >
        {title}
      </div>

      {/* Column labels */}
      <div className="flex">
        <div className="w-[20px] sm:w-[24px]" />
        {COL_LABELS.map((l) => (
          <div
            key={l}
            className="w-[30px] sm:w-[35px] text-center text-[7px] sm:text-[8px] text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            {l}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {grid.map((row, r) => (
        <div key={r} className="flex items-center">
          <div
            className="w-[20px] sm:w-[24px] text-[7px] sm:text-[8px] text-[var(--text-muted)] text-right pr-1"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            {ROW_LABELS[r]}
          </div>
          {row.map((cell, c) => (
            <Cell
              key={`${r}-${c}`}
              state={cell}
              isPlayerGrid={isPlayerGrid}
              onClick={
                !disabled && onCellClick
                  ? () => onCellClick(r, c)
                  : undefined
              }
              hovered={hoverCell === key(r, c)}
              onHover={
                !disabled
                  ? (h) => setHoverCell(h ? key(r, c) : null)
                  : undefined
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ship tracker component
// ---------------------------------------------------------------------------

function ShipTracker({ ships, label }: { ships: Ship[]; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="text-[8px] text-[var(--text-muted)] tracking-wider mb-1"
        style={{ fontFamily: "var(--font-press-start), monospace" }}
      >
        {label}
      </div>
      {ships.map((ship) => (
        <div key={ship.name} className="flex items-center gap-2">
          <span
            className={`text-[7px] sm:text-[8px] w-[72px] sm:w-[80px] truncate ${
              ship.sunk ? "text-[var(--neon-magenta)] line-through" : "text-[var(--text-primary)]"
            }`}
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            {ship.name}
          </span>
          <div className="flex gap-[2px]">
            {Array.from({ length: ship.size }).map((_, i) => (
              <div
                key={i}
                className={`w-[10px] h-[10px] sm:w-[12px] sm:h-[12px] border ${
                  i < ship.hits.size
                    ? "bg-[var(--neon-magenta)] border-[var(--neon-magenta)] shadow-[0_0_4px_var(--neon-magenta)]"
                    : ship.sunk
                    ? "bg-[rgba(255,0,255,0.2)] border-[rgba(255,0,255,0.4)]"
                    : "bg-[rgba(0,255,255,0.1)] border-[rgba(0,255,255,0.3)]"
                }`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main game component
// ---------------------------------------------------------------------------

function BattleshipGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [playerBoard, setPlayerBoard] = useState<Board>(createBoard);
  const [enemyBoard, setEnemyBoard] = useState<Board>(createBoard);
  const [turn, setTurn] = useState<Turn>("player");
  const [status, setStatus] = useState("PLACE YOUR FLEET");
  const [statusColor, setStatusColor] = useState("cyan");
  const aiRef = useRef<AIState>(initAI());
  const [gameOver, setGameOver] = useState(false);
  const [playerSunk, setPlayerSunk] = useState(0);
  const [enemySunk, setEnemySunk] = useState(0);
  const processingRef = useRef(false);

  // Display grid for enemy: hide ships
  const enemyDisplayGrid = enemyBoard.grid.map((row) =>
    row.map((cell) => (cell === "ship" ? "empty" : cell) as CellState)
  );

  // Randomize player ships
  const randomize = useCallback(() => {
    setPlayerBoard(createBoard());
  }, []);

  // Deploy fleet and start battle
  const deploy = useCallback(() => {
    setPhase("battle");
    setStatus("YOUR TURN - FIRE AT WILL");
    setStatusColor("cyan");
    setTurn("player");
  }, []);

  // Check if all ships are sunk on a board
  const allSunk = useCallback((board: Board) => {
    return board.ships.every((s) => s.sunk);
  }, []);

  // Process a shot on a board, returns { hit, sunkShip }
  const fireShot = useCallback(
    (
      board: Board,
      r: number,
      c: number
    ): { newBoard: Board; hit: boolean; sunkShip: Ship | null } => {
      const g = board.grid.map((row) => [...row]);
      const ships = board.ships.map((s) => ({
        ...s,
        cells: [...s.cells] as [number, number][],
        hits: new Set(s.hits),
        sunk: s.sunk,
      }));

      const wasShip = g[r][c] === "ship";
      let sunkShip: Ship | null = null;

      if (wasShip) {
        g[r][c] = "hit";
        // Find which ship was hit
        for (const ship of ships) {
          for (const [sr, sc] of ship.cells) {
            if (sr === r && sc === c) {
              ship.hits.add(key(r, c));
              if (ship.hits.size === ship.size) {
                ship.sunk = true;
                // Mark all cells as sunk
                for (const [cr, cc] of ship.cells) {
                  g[cr][cc] = "sunk";
                }
                sunkShip = ship;
              }
              break;
            }
          }
        }
      } else {
        g[r][c] = "miss";
      }

      return { newBoard: { grid: g, ships }, hit: wasShip, sunkShip };
    },
    []
  );

  // Player fires
  const playerFire = useCallback(
    (r: number, c: number) => {
      if (phase !== "battle" || turn !== "player" || gameOver || processingRef.current) return;

      const cell = enemyBoard.grid[r][c];
      if (cell === "hit" || cell === "miss" || cell === "sunk") return;

      processingRef.current = true;

      const { newBoard, hit, sunkShip } = fireShot(enemyBoard, r, c);
      setEnemyBoard(newBoard);

      if (sunkShip) {
        setStatus(`${sunkShip.name.toUpperCase()} SUNK!`);
        setStatusColor("magenta");
        setEnemySunk((prev) => prev + 1);
      } else if (hit) {
        setStatus("HIT!");
        setStatusColor("magenta");
      } else {
        setStatus("MISS!");
        setStatusColor("gray");
      }

      // Check win
      if (allSunk(newBoard)) {
        setStatus("VICTORY! ALL ENEMY SHIPS DESTROYED!");
        setStatusColor("green");
        setGameOver(true);
        processingRef.current = false;
        setTimeout(() => onGameEnd(true), 2000);
        return;
      }

      // AI turn after delay
      setTurn("ai");
      setTimeout(() => {
        setStatus("ENEMY FIRING...");
        setStatusColor("magenta");

        setTimeout(() => {
          const ai = aiRef.current;
          const [ar, ac] = aiPickTarget(ai, playerBoard.grid);
          const { newBoard: newPB, hit: aiHit, sunkShip: aiSunk } = fireShot(playerBoard, ar, ac);

          if (aiHit) {
            aiAfterHit(ai, ar, ac);
          }
          if (aiSunk) {
            aiAfterSink(ai);
          }

          setPlayerBoard(newPB);

          if (aiSunk) {
            setStatus(`YOUR ${aiSunk.name.toUpperCase()} WAS SUNK!`);
            setStatusColor("magenta");
            setPlayerSunk((prev) => prev + 1);
          } else if (aiHit) {
            setStatus("ENEMY HIT YOUR SHIP!");
            setStatusColor("magenta");
          } else {
            setStatus("ENEMY MISSED!");
            setStatusColor("gray");
          }

          // Check loss
          if (allSunk(newPB)) {
            setStatus("DEFEAT! YOUR FLEET IS DESTROYED!");
            setStatusColor("magenta");
            setGameOver(true);
            processingRef.current = false;
            setTimeout(() => onGameEnd(false), 2000);
            return;
          }

          setTimeout(() => {
            setTurn("player");
            setStatus("YOUR TURN - FIRE AT WILL");
            setStatusColor("cyan");
            processingRef.current = false;
          }, 800);
        }, 600);
      }, 500);
    },
    [phase, turn, gameOver, enemyBoard, playerBoard, fireShot, allSunk, onGameEnd]
  );

  // Status text color class
  const statusGlow =
    statusColor === "cyan"
      ? "text-[var(--neon-cyan)] glow-cyan"
      : statusColor === "magenta"
      ? "text-[var(--neon-magenta)] glow-magenta"
      : statusColor === "green"
      ? "text-[var(--neon-green)] glow-green"
      : "text-[var(--text-muted)]";

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Status bar */}
      <div
        className={`text-[10px] sm:text-xs tracking-wider h-[20px] ${statusGlow} ${
          phase === "battle" && !gameOver ? "pulse-glow" : ""
        }`}
        style={{ fontFamily: "var(--font-press-start), monospace" }}
      >
        {status}
      </div>

      {/* Setup buttons */}
      {phase === "setup" && (
        <div className="flex gap-4 mb-2">
          <button onClick={randomize} className="arcade-btn arcade-btn-cyan text-[8px] !py-2 !px-4">
            RANDOMIZE
          </button>
          <button onClick={deploy} className="arcade-btn arcade-btn-green text-[8px] !py-2 !px-4">
            DEPLOY FLEET
          </button>
        </div>
      )}

      {/* Grids */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8">
        {/* Player grid */}
        <div className="flex flex-col items-center gap-3">
          <GameGrid
            title="YOUR FLEET"
            grid={playerBoard.grid}
            isPlayerGrid={true}
            disabled={true}
          />
          <ShipTracker ships={playerBoard.ships} label="YOUR SHIPS" />
        </div>

        {/* Divider / VS */}
        <div className="flex flex-col items-center justify-center py-4 lg:py-20">
          <div
            className="text-[var(--neon-magenta)] glow-magenta text-[10px] sm:text-xs"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            VS
          </div>
          {phase === "battle" && (
            <div className="mt-3 flex flex-col items-center gap-1">
              <div
                className="text-[7px] text-[var(--text-muted)]"
                style={{ fontFamily: "var(--font-press-start), monospace" }}
              >
                SUNK
              </div>
              <div
                className="text-[8px] text-[var(--neon-cyan)]"
                style={{ fontFamily: "var(--font-press-start), monospace" }}
              >
                {enemySunk}/{SHIP_DEFS.length}
              </div>
              <div className="w-px h-6 bg-[var(--border-color)]" />
              <div
                className="text-[8px] text-[var(--neon-magenta)]"
                style={{ fontFamily: "var(--font-press-start), monospace" }}
              >
                {playerSunk}/{SHIP_DEFS.length}
              </div>
              <div
                className="text-[7px] text-[var(--text-muted)]"
                style={{ fontFamily: "var(--font-press-start), monospace" }}
              >
                LOST
              </div>
            </div>
          )}
        </div>

        {/* Enemy grid */}
        <div className="flex flex-col items-center gap-3">
          <GameGrid
            title="ENEMY WATERS"
            grid={enemyDisplayGrid}
            isPlayerGrid={false}
            onCellClick={playerFire}
            disabled={phase !== "battle" || turn !== "player" || gameOver}
          />
          <ShipTracker ships={enemyBoard.ships} label="ENEMY SHIPS" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-3 border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 rounded">
        <div className="flex items-center gap-2">
          <div className="w-[12px] h-[12px] bg-[rgba(0,255,255,0.15)] border border-[rgba(0,255,255,0.3)]" />
          <span
            className="text-[7px] text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            SHIP
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[12px] h-[12px] bg-[rgba(255,0,255,0.15)] border border-[var(--neon-magenta)] shadow-[0_0_4px_var(--neon-magenta)] flex items-center justify-center">
            <span className="text-[var(--neon-magenta)] text-[6px]">X</span>
          </div>
          <span
            className="text-[7px] text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            HIT
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[12px] h-[12px] bg-[rgba(106,106,154,0.1)] border border-[rgba(106,106,154,0.3)] flex items-center justify-center">
            <span className="text-[var(--text-muted)] text-[6px]">{"\u2022"}</span>
          </div>
          <span
            className="text-[7px] text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            MISS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[12px] h-[12px] bg-[rgba(255,0,255,0.25)] border border-[var(--neon-magenta)] shadow-[0_0_4px_var(--neon-magenta)]" />
          <span
            className="text-[7px] text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            SUNK
          </span>
        </div>
      </div>

      {/* Mode indicator */}
      <div
        className="text-[7px] text-[var(--text-muted)] mt-1"
        style={{ fontFamily: "var(--font-press-start), monospace" }}
      >
        {mode === "wager" ? "WAGER MODE" : "PRACTICE MODE"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function BattleshipPage() {
  return (
    <GameWrapper title="BATTLESHIP" color="cyan">
      {({ mode, onGameEnd }) => (
        <BattleshipGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
