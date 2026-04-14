"use client";

import { useRef, useEffect, useCallback } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ── Constants ──────────────────────────────────────────────────────────
const CANVAS_W = 700;
const CANVAS_H = 500;
const HALF_W = CANVAS_W / 2;
const DIVIDER_X = HALF_W;

const COLS = 6;
const ROWS = 5;
const INV_W = 24;
const INV_H = 16;
const INV_PAD_X = 8;
const INV_PAD_Y = 8;
const GRID_W = COLS * (INV_W + INV_PAD_X) - INV_PAD_X;

const CANNON_W = 28;
const CANNON_H = 14;
const CANNON_Y_OFFSET = 40;

const BULLET_W = 2;
const BULLET_H = 8;
const BULLET_SPEED = 6;

const ENEMY_BULLET_SPEED = 3;
const ENEMY_SHOOT_CHANCE = 0.008;

const BASE_MARCH_SPEED = 0.6;
const MARCH_DROP = 10;
const MARCH_SPEEDUP_FACTOR = 0.04;

const PLAYER_SPEED = 4;
const PLAYER_SHOOT_CD = 250; // ms

const AI_SHOOT_CD = 500;
const AI_MOVE_SPEED = 3.2;

const BG_COLOR = "#0a0a1a";
const PLAYER_COLOR = "#00ffff";
const AI_COLOR = "#b829ff";
const DIVIDER_COLOR = "#1a1a3a";
const TEXT_COLOR_DIM = "#555577";
const STAR_COLOR = "#1a1a3a";

// ── Types ──────────────────────────────────────────────────────────────
interface Invader {
  row: number;
  col: number;
  alive: boolean;
  x: number;
  y: number;
}

interface Bullet {
  x: number;
  y: number;
  dy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface FieldState {
  invaders: Invader[];
  cannonX: number;
  bullets: Bullet[];
  enemyBullets: Bullet[];
  particles: Particle[];
  marchDir: number; // 1 = right, -1 = left
  marchSpeed: number;
  score: number;
  alive: boolean;
  offsetX: number; // left edge of this field in canvas coords
  color: string;
}

// ── Pixel-art invader shapes (drawn from center) ─────────────────────
function drawInvaderShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  row: number,
  color: string,
  pulse: number
) {
  const s = 2; // pixel scale
  ctx.fillStyle = color;
  const alpha = 0.7 + 0.3 * Math.sin(pulse);
  ctx.globalAlpha = alpha;

  if (row === 0) {
    // Squid — top row
    const pixels = [
      [0, -3], [-1, -2], [0, -2], [1, -2],
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
      [-3, 1], [-1, 1], [0, 1], [1, 1], [3, 1],
      [-2, 2], [2, 2], [-1, 3], [1, 3],
    ];
    for (const [px, py] of pixels) ctx.fillRect(cx + px * s, cy + py * s, s, s);
  } else if (row <= 2) {
    // Crab — middle rows
    const pixels = [
      [-1, -3], [1, -3],
      [-1, -2], [0, -2], [1, -2],
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
      [-3, 1], [-1, 1], [0, 1], [1, 1], [3, 1],
      [-3, 2], [-2, 2], [2, 2], [3, 2],
      [-1, 3], [1, 3],
    ];
    for (const [px, py] of pixels) ctx.fillRect(cx + px * s, cy + py * s, s, s);
  } else {
    // Octopus — bottom rows
    const pixels = [
      [-1, -3], [0, -3], [1, -3],
      [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
      [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1],
      [-3, 0], [-2, 0], [0, 0], [2, 0], [3, 0],
      [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1],
      [-2, 2], [-1, 2], [1, 2], [2, 2],
      [-3, 3], [-2, 3], [2, 3], [3, 3],
    ];
    for (const [px, py] of pixels) ctx.fillRect(cx + px * s, cy + py * s, s, s);
  }
  ctx.globalAlpha = 1;
}

// ── Build invader grid ────────────────────────────────────────────────
function buildGrid(offsetX: number): Invader[] {
  const startX = offsetX + (HALF_W - GRID_W) / 2;
  const startY = 50;
  const invaders: Invader[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      invaders.push({
        row: r,
        col: c,
        alive: true,
        x: startX + c * (INV_W + INV_PAD_X) + INV_W / 2,
        y: startY + r * (INV_H + INV_PAD_Y) + INV_H / 2,
      });
    }
  }
  return invaders;
}

// ── Spawn particles ───────────────────────────────────────────────────
function spawnExplosion(particles: Particle[], x: number, y: number, color: string, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 20 + Math.random() * 20,
      color,
    });
  }
}

// ── Main game component ───────────────────────────────────────────────
function SpaceInvadersGame({
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
  const lastPlayerShot = useRef(0);
  const lastAiShot = useRef(0);
  const tickRef = useRef(0);
  const starsRef = useRef<{ x: number; y: number; brightness: number }[]>([]);
  const countdownRef = useRef(3);
  const countdownStart = useRef(0);
  const gameStarted = useRef(false);

  // Initialize stars
  if (starsRef.current.length === 0) {
    for (let i = 0; i < 80; i++) {
      starsRef.current.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        brightness: 0.2 + Math.random() * 0.4,
      });
    }
  }

  const initField = useCallback((offsetX: number, color: string): FieldState => {
    return {
      invaders: buildGrid(offsetX),
      cannonX: offsetX + HALF_W / 2,
      bullets: [],
      enemyBullets: [],
      particles: [],
      marchDir: 1,
      marchSpeed: BASE_MARCH_SPEED,
      score: 0,
      alive: true,
      offsetX,
      color,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let player = initField(0, PLAYER_COLOR);
    let ai = initField(HALF_W, AI_COLOR);
    gameOverRef.current = false;
    tickRef.current = 0;
    countdownRef.current = 3;
    countdownStart.current = performance.now();
    gameStarted.current = false;

    // ── Key handlers ────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", " ", "Space"].includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── Update invader march ────────────────────────────────────────
    function updateMarch(field: FieldState) {
      const living = field.invaders.filter((i) => i.alive);
      if (living.length === 0) return;

      const aliveCount = living.length;
      const total = ROWS * COLS;
      field.marchSpeed = BASE_MARCH_SPEED + (total - aliveCount) * MARCH_SPEEDUP_FACTOR;

      let needDrop = false;
      for (const inv of living) {
        const localX = inv.x - field.offsetX;
        if (
          (field.marchDir === 1 && localX + INV_W / 2 >= HALF_W - 10) ||
          (field.marchDir === -1 && localX - INV_W / 2 <= 10)
        ) {
          needDrop = true;
          break;
        }
      }

      if (needDrop) {
        field.marchDir *= -1;
        for (const inv of living) inv.y += MARCH_DROP;
      } else {
        for (const inv of living) inv.x += field.marchDir * field.marchSpeed;
      }
    }

    // ── Enemy shooting ──────────────────────────────────────────────
    function enemyShooting(field: FieldState) {
      const living = field.invaders.filter((i) => i.alive);
      if (living.length === 0) return;

      // Only bottom-most invaders in each column shoot
      const bottomInvaders: Map<number, Invader> = new Map();
      for (const inv of living) {
        const existing = bottomInvaders.get(inv.col);
        if (!existing || inv.row > existing.row) {
          bottomInvaders.set(inv.col, inv);
        }
      }

      for (const inv of bottomInvaders.values()) {
        if (Math.random() < ENEMY_SHOOT_CHANCE) {
          field.enemyBullets.push({
            x: inv.x,
            y: inv.y + INV_H / 2,
            dy: ENEMY_BULLET_SPEED,
          });
        }
      }
    }

    // ── AI logic ────────────────────────────────────────────────────
    function updateAI(field: FieldState, now: number) {
      const living = field.invaders.filter((i) => i.alive);
      if (living.length === 0) return;

      // Find the lowest invader (most threatening)
      let target = living[0];
      for (const inv of living) {
        if (inv.y > target.y || (inv.y === target.y && Math.abs(inv.x - field.cannonX) < Math.abs(target.x - field.cannonX))) {
          target = inv;
        }
      }

      // Move toward target x with some imprecision
      const dx = target.x - field.cannonX;
      const jitter = Math.sin(now * 0.003) * 8; // slight imprecision
      if (Math.abs(dx + jitter) > 3) {
        field.cannonX += Math.sign(dx + jitter) * AI_MOVE_SPEED;
      }

      // Clamp
      field.cannonX = Math.max(field.offsetX + CANNON_W / 2, Math.min(field.offsetX + HALF_W - CANNON_W / 2, field.cannonX));

      // Shoot
      if (now - lastAiShot.current > AI_SHOOT_CD && Math.abs(dx) < 30) {
        field.bullets.push({
          x: field.cannonX,
          y: CANVAS_H - CANNON_Y_OFFSET - CANNON_H,
          dy: -BULLET_SPEED,
        });
        lastAiShot.current = now;
      }
    }

    // ── Update bullets & collisions ─────────────────────────────────
    function updateBullets(field: FieldState) {
      // Player/AI bullets going up
      field.bullets = field.bullets.filter((b) => {
        b.y += b.dy;
        if (b.y < 0) return false;

        // Check hit on invaders
        for (const inv of field.invaders) {
          if (!inv.alive) continue;
          if (
            Math.abs(b.x - inv.x) < INV_W / 2 + 2 &&
            Math.abs(b.y - inv.y) < INV_H / 2 + 2
          ) {
            inv.alive = false;
            field.score += (ROWS - inv.row) * 10;
            spawnExplosion(field.particles, inv.x, inv.y, field.color, 12);
            return false;
          }
        }
        return true;
      });

      // Enemy bullets going down
      field.enemyBullets = field.enemyBullets.filter((b) => {
        b.y += b.dy;
        if (b.y > CANVAS_H) return false;

        // Hit cannon?
        if (
          b.y >= CANVAS_H - CANNON_Y_OFFSET - CANNON_H &&
          b.y <= CANVAS_H - CANNON_Y_OFFSET + 4 &&
          Math.abs(b.x - field.cannonX) < CANNON_W / 2 + 2
        ) {
          field.alive = false;
          spawnExplosion(field.particles, field.cannonX, CANVAS_H - CANNON_Y_OFFSET, field.color, 20);
          return false;
        }
        return true;
      });
    }

    // ── Update particles ────────────────────────────────────────────
    function updateParticles(field: FieldState) {
      field.particles = field.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.life--;
        return p.life > 0;
      });
    }

    // ── Check win/lose ──────────────────────────────────────────────
    function checkEndConditions(playerField: FieldState, aiField: FieldState): "player" | "ai" | "none" {
      const playerCleared = playerField.invaders.every((i) => !i.alive);
      const aiCleared = aiField.invaders.every((i) => !i.alive);

      if (playerCleared && aiCleared) return "player"; // tie goes to player
      if (playerCleared) return "player";
      if (aiCleared) return "ai";

      // Invaders reached bottom?
      const playerReached = playerField.invaders.some((i) => i.alive && i.y + INV_H / 2 >= CANVAS_H - CANNON_Y_OFFSET - CANNON_H - 5);
      const aiReached = aiField.invaders.some((i) => i.alive && i.y + INV_H / 2 >= CANVAS_H - CANNON_Y_OFFSET - CANNON_H - 5);

      if (playerReached && aiReached) return "ai"; // both lose — player loses
      if (playerReached) return "ai";
      if (aiReached) return "player";

      if (!playerField.alive && !aiField.alive) return "ai";
      if (!playerField.alive) return "ai";
      if (!aiField.alive) return "player";

      return "none";
    }

    // ── Draw ────────────────────────────────────────────────────────
    function drawField(field: FieldState, label: string, pulse: number) {
      // Field label
      ctx!.fillStyle = field.color;
      ctx!.globalAlpha = 0.6;
      ctx!.font = "bold 10px monospace";
      ctx!.textAlign = "center";
      ctx!.fillText(label, field.offsetX + HALF_W / 2, 16);
      ctx!.globalAlpha = 1;

      // Score
      ctx!.fillStyle = field.color;
      ctx!.font = "bold 12px monospace";
      ctx!.fillText(String(field.score), field.offsetX + HALF_W / 2, 34);

      // Invaders
      for (const inv of field.invaders) {
        if (!inv.alive) continue;
        drawInvaderShape(ctx!, inv.x, inv.y, inv.row, field.color, pulse + inv.col * 0.5);
      }

      // Cannon
      if (field.alive) {
        const cx = field.cannonX;
        const cy = CANVAS_H - CANNON_Y_OFFSET;
        ctx!.fillStyle = field.color;
        // Base
        ctx!.fillRect(cx - CANNON_W / 2, cy - CANNON_H / 2, CANNON_W, CANNON_H);
        // Barrel
        ctx!.fillRect(cx - 2, cy - CANNON_H / 2 - 8, 4, 10);
        // Glow
        ctx!.shadowColor = field.color;
        ctx!.shadowBlur = 8;
        ctx!.fillRect(cx - 2, cy - CANNON_H / 2 - 8, 4, 10);
        ctx!.shadowBlur = 0;
      }

      // Bullets (player/AI)
      ctx!.fillStyle = field.color;
      ctx!.shadowColor = field.color;
      ctx!.shadowBlur = 6;
      for (const b of field.bullets) {
        ctx!.fillRect(b.x - BULLET_W / 2, b.y - BULLET_H / 2, BULLET_W, BULLET_H);
      }
      ctx!.shadowBlur = 0;

      // Enemy bullets
      ctx!.fillStyle = "#ff4444";
      ctx!.shadowColor = "#ff4444";
      ctx!.shadowBlur = 4;
      for (const b of field.enemyBullets) {
        ctx!.fillRect(b.x - BULLET_W / 2, b.y - BULLET_H / 2, BULLET_W, BULLET_H);
      }
      ctx!.shadowBlur = 0;

      // Particles
      for (const p of field.particles) {
        ctx!.globalAlpha = p.life / 40;
        ctx!.fillStyle = p.color;
        ctx!.fillRect(p.x - 1, p.y - 1, 3, 3);
      }
      ctx!.globalAlpha = 1;
    }

    // ── Game Loop ───────────────────────────────────────────────────
    function gameLoop(now: number) {
      if (gameOverRef.current) return;
      tickRef.current++;
      const pulse = now * 0.004;

      // ── Countdown phase ─────────────────────────────────────────
      if (!gameStarted.current) {
        const elapsed = (now - countdownStart.current) / 1000;
        const count = 3 - Math.floor(elapsed);

        // Draw background and static elements during countdown
        ctx!.fillStyle = BG_COLOR;
        ctx!.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Stars
        for (const star of starsRef.current) {
          ctx!.fillStyle = STAR_COLOR;
          ctx!.globalAlpha = star.brightness + Math.sin(now * 0.001 + star.x) * 0.15;
          ctx!.fillRect(star.x, star.y, 1, 1);
        }
        ctx!.globalAlpha = 1;

        // Divider
        ctx!.strokeStyle = DIVIDER_COLOR;
        ctx!.lineWidth = 2;
        ctx!.setLineDash([6, 6]);
        ctx!.beginPath();
        ctx!.moveTo(DIVIDER_X, 0);
        ctx!.lineTo(DIVIDER_X, CANVAS_H);
        ctx!.stroke();
        ctx!.setLineDash([]);

        // Draw static fields
        drawField(player, "YOU", pulse);
        drawField(ai, "CPU", pulse);

        // Draw countdown number
        if (count > 0) {
          ctx!.fillStyle = "#ffffff";
          ctx!.font = "bold 64px monospace";
          ctx!.textAlign = "center";
          ctx!.shadowColor = "#ffffff";
          ctx!.shadowBlur = 20;
          ctx!.fillText(String(count), CANVAS_W / 2, CANVAS_H / 2 + 20);
          ctx!.shadowBlur = 0;
        } else {
          // "GO!" frame
          ctx!.fillStyle = "#00ff65";
          ctx!.font = "bold 48px monospace";
          ctx!.textAlign = "center";
          ctx!.shadowColor = "#00ff65";
          ctx!.shadowBlur = 20;
          ctx!.fillText("GO!", CANVAS_W / 2, CANVAS_H / 2 + 16);
          ctx!.shadowBlur = 0;

          if (elapsed > 3.5) {
            gameStarted.current = true;
          }
        }

        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── Player input ──────────────────────────────────────────────
      if (player.alive) {
        if (keysRef.current.has("ArrowLeft")) {
          player.cannonX = Math.max(CANNON_W / 2, player.cannonX - PLAYER_SPEED);
        }
        if (keysRef.current.has("ArrowRight")) {
          player.cannonX = Math.min(HALF_W - CANNON_W / 2, player.cannonX + PLAYER_SPEED);
        }
        if (keysRef.current.has(" ") && now - lastPlayerShot.current > PLAYER_SHOOT_CD) {
          player.bullets.push({
            x: player.cannonX,
            y: CANVAS_H - CANNON_Y_OFFSET - CANNON_H,
            dy: -BULLET_SPEED,
          });
          lastPlayerShot.current = now;
        }
      }

      // ── AI input ──────────────────────────────────────────────────
      if (ai.alive) updateAI(ai, now);

      // ── Update both fields ────────────────────────────────────────
      for (const field of [player, ai]) {
        updateMarch(field);
        enemyShooting(field);
        updateBullets(field);
        updateParticles(field);
      }

      // ── Check end ─────────────────────────────────────────────────
      const result = checkEndConditions(player, ai);
      if (result !== "none") {
        gameOverRef.current = true;
        // Allow a brief delay for visual feedback
        setTimeout(() => {
          onGameEnd(result === "player");
        }, 800);
      }

      // ── Render ────────────────────────────────────────────────────
      ctx!.fillStyle = BG_COLOR;
      ctx!.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Stars
      for (const star of starsRef.current) {
        ctx!.fillStyle = STAR_COLOR;
        ctx!.globalAlpha = star.brightness + Math.sin(now * 0.001 + star.x) * 0.15;
        ctx!.fillRect(star.x, star.y, 1, 1);
      }
      ctx!.globalAlpha = 1;

      // Divider
      ctx!.strokeStyle = DIVIDER_COLOR;
      ctx!.lineWidth = 2;
      ctx!.setLineDash([6, 6]);
      ctx!.beginPath();
      ctx!.moveTo(DIVIDER_X, 0);
      ctx!.lineTo(DIVIDER_X, CANVAS_H);
      ctx!.stroke();
      ctx!.setLineDash([]);

      // Draw VS label on divider
      ctx!.fillStyle = TEXT_COLOR_DIM;
      ctx!.font = "bold 10px monospace";
      ctx!.textAlign = "center";
      ctx!.fillText("VS", DIVIDER_X, CANVAS_H / 2);

      // Draw both fields
      drawField(player, "YOU", pulse);
      drawField(ai, "CPU", pulse);

      // ── Bottom scanline / ground line ─────────────────────────────
      const groundY = CANVAS_H - CANNON_Y_OFFSET + CANNON_H / 2 + 8;
      ctx!.strokeStyle = PLAYER_COLOR;
      ctx!.globalAlpha = 0.3;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(2, groundY);
      ctx!.lineTo(HALF_W - 2, groundY);
      ctx!.stroke();

      ctx!.strokeStyle = AI_COLOR;
      ctx!.beginPath();
      ctx!.moveTo(HALF_W + 2, groundY);
      ctx!.lineTo(CANVAS_W - 2, groundY);
      ctx!.stroke();
      ctx!.globalAlpha = 1;

      // ── Remaining count ───────────────────────────────────────────
      const playerRemaining = player.invaders.filter((i) => i.alive).length;
      const aiRemaining = ai.invaders.filter((i) => i.alive).length;

      ctx!.fillStyle = TEXT_COLOR_DIM;
      ctx!.font = "9px monospace";
      ctx!.textAlign = "center";
      ctx!.fillText(`${playerRemaining} LEFT`, player.offsetX + HALF_W / 2, CANVAS_H - 8);
      ctx!.fillText(`${aiRemaining} LEFT`, ai.offsetX + HALF_W / 2, CANVAS_H - 8);

      // Game over flash
      if (gameOverRef.current) {
        const winner = checkEndConditions(player, ai);
        ctx!.fillStyle = winner === "player" ? PLAYER_COLOR : AI_COLOR;
        ctx!.font = "bold 28px monospace";
        ctx!.textAlign = "center";
        ctx!.shadowColor = winner === "player" ? PLAYER_COLOR : AI_COLOR;
        ctx!.shadowBlur = 20;
        ctx!.fillText(
          winner === "player" ? "VICTORY!" : "DEFEATED!",
          CANVAS_W / 2,
          CANVAS_H / 2
        );
        ctx!.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [initField, onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="border border-[#1a1a3a] rounded"
        style={{ imageRendering: "pixelated", background: BG_COLOR }}
      />
      <div className="flex items-center gap-6 text-[8px] text-[#555577] tracking-widest">
        <span>
          <span className="text-[#00ffff]">&larr; &rarr;</span> MOVE
        </span>
        <span>
          <span className="text-[#00ffff]">SPACE</span> SHOOT
        </span>
        <span className="text-[#555577]">|</span>
        <span>RACE TO CLEAR ALL INVADERS</span>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
export default function SpaceInvadersPage() {
  return (
    <GameWrapper title="SPACE INVADERS" color="purple">
      {({ mode, onGameEnd }) => (
        <SpaceInvadersGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
