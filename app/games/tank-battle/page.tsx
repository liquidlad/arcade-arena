"use client";

import { useRef, useEffect, useCallback } from "react";
import GameWrapper from "@/app/components/GameWrapper";

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                          */
/* ------------------------------------------------------------------ */

const ARENA_W = 600;
const ARENA_H = 600;
const TILE = 40; // wall grid size
const COLS = ARENA_W / TILE;
const ROWS = ARENA_H / TILE;

const TANK_W = 24;
const TANK_H = 28;
const BARREL_LEN = 18;
const BULLET_R = 3;
const BULLET_SPEED = 5;
const TANK_SPEED = 2;
const TANK_ROT_SPEED = 0.045;
const FIRE_COOLDOWN = 400; // ms
const MAX_LIVES = 3;
const HIT_FLASH_DUR = 300; // ms
const AI_SHOOT_COOLDOWN = 800;
const AI_DODGE_RANGE = 120;

const COLOR_BG = "#0a0a1a";
const COLOR_WALL = "#2a2a4a";
const COLOR_WALL_EDGE = "#3e3e6e";
const COLOR_PLAYER = "#00ffff";
const COLOR_AI = "#ff2d95";
const COLOR_BULLET_PLAYER = "#00ffff";
const COLOR_BULLET_AI = "#ff2d95";
const COLOR_MUTED = "#555580";

/* ------------------------------------------------------------------ */
/*  MAZE / WALL LAYOUT                                                 */
/* ------------------------------------------------------------------ */

// 1 = wall, 0 = open.  15 cols x 15 rows
const MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,1,1,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,1,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

function isWall(col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
  return MAP[row][col] === 1;
}

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface Tank {
  x: number;
  y: number;
  angle: number; // radians, 0 = up
  lives: number;
  color: string;
  lastFire: number;
  hitFlash: number; // timestamp of last hit
}

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  bounces: number;
  owner: "player" | "ai";
  color: string;
}

/* ------------------------------------------------------------------ */
/*  COLLISION HELPERS                                                   */
/* ------------------------------------------------------------------ */

function tankRect(t: Tank) {
  // Axis-aligned bounding box (we use the larger dimension for simplicity)
  const half = Math.max(TANK_W, TANK_H) / 2;
  return { x: t.x - half, y: t.y - half, w: half * 2, h: half * 2 };
}

function tankCollidesWalls(tx: number, ty: number): boolean {
  const half = Math.max(TANK_W, TANK_H) / 2;
  const left = tx - half;
  const top = ty - half;
  const right = tx + half;
  const bottom = ty + half;

  const cLeft = Math.floor(left / TILE);
  const cRight = Math.floor((right - 0.01) / TILE);
  const rTop = Math.floor(top / TILE);
  const rBottom = Math.floor((bottom - 0.01) / TILE);

  for (let r = rTop; r <= rBottom; r++) {
    for (let c = cLeft; c <= cRight; c++) {
      if (isWall(c, r)) return true;
    }
  }
  return false;
}

function bulletHitsWall(bx: number, by: number): { col: number; row: number } | null {
  const c = Math.floor(bx / TILE);
  const r = Math.floor(by / TILE);
  if (isWall(c, r)) return { col: c, row: r };
  return null;
}

function pointInTank(px: number, py: number, t: Tank): boolean {
  const r = tankRect(t);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/* ------------------------------------------------------------------ */
/*  DRAWING                                                            */
/* ------------------------------------------------------------------ */

function drawTank(ctx: CanvasRenderingContext2D, t: Tank, now: number) {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);

  // Flash white on hit
  const flashing = now - t.hitFlash < HIT_FLASH_DUR;
  const col = flashing ? "#ffffff" : t.color;

  // Body
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = flashing ? 20 : 10;
  ctx.fillRect(-TANK_W / 2, -TANK_H / 2, TANK_W, TANK_H);

  // Treads (darker strips on sides)
  ctx.fillStyle = COLOR_BG;
  ctx.shadowBlur = 0;
  ctx.fillRect(-TANK_W / 2, -TANK_H / 2, 4, TANK_H);
  ctx.fillRect(TANK_W / 2 - 4, -TANK_H / 2, 4, TANK_H);

  // Barrel
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  ctx.shadowColor = col;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -BARREL_LEN);
  ctx.stroke();

  // Turret circle
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();

  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet) {
  ctx.save();
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
  ctx.fill();

  // Glow ring
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BULLET_R + 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAP[r][c] === 1) {
        const x = c * TILE;
        const y = r * TILE;
        ctx.fillStyle = COLOR_WALL;
        ctx.fillRect(x, y, TILE, TILE);
        // Edge highlight
        ctx.strokeStyle = COLOR_WALL_EDGE;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
}

function drawLives(ctx: CanvasRenderingContext2D, x: number, y: number, lives: number, color: string, label: string) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.font = "bold 11px monospace";
  ctx.fillText(label, x, y);
  ctx.shadowBlur = 0;
  for (let i = 0; i < MAX_LIVES; i++) {
    const bx = x + i * 18;
    const by = y + 6;
    if (i < lives) {
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, 12, 8);
    } else {
      ctx.strokeStyle = COLOR_MUTED;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, 12, 8);
    }
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, player: Tank, ai: Tank) {
  drawLives(ctx, 12, 16, player.lives, COLOR_PLAYER, "PLAYER");
  drawLives(ctx, ARENA_W - 72, 16, ai.lives, COLOR_AI, "ENEMY");
}

function drawControls(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLOR_MUTED;
  ctx.shadowBlur = 0;
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("WASD / ARROWS  MOVE  |  SPACE  SHOOT", ARENA_W / 2, ARENA_H - 8);
  ctx.textAlign = "left";
}

function drawCountdown(ctx: CanvasRenderingContext2D, count: number) {
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 20;
  ctx.font = "bold 48px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count <= 0 ? "FIGHT!" : String(count), ARENA_W / 2, ARENA_H / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowBlur = 0;
}

/* ------------------------------------------------------------------ */
/*  AI LOGIC                                                           */
/* ------------------------------------------------------------------ */

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function angleToTarget(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

function hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(dist / (TILE / 2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const c = Math.floor(px / TILE);
    const r = Math.floor(py / TILE);
    if (isWall(c, r)) return false;
  }
  return true;
}

interface AIState {
  moveDir: number; // current movement angle target
  nextDecision: number; // timestamp for next decision
  dodging: boolean;
}

function updateAI(
  ai: Tank,
  player: Tank,
  bullets: Bullet[],
  aiState: AIState,
  now: number,
): { fire: boolean } {
  let fire = false;

  // Check for nearby player bullets to dodge
  let closestBullet: Bullet | null = null;
  let closestDist = AI_DODGE_RANGE;
  for (const b of bullets) {
    if (b.owner === "ai") continue;
    const d = Math.sqrt((b.x - ai.x) ** 2 + (b.y - ai.y) ** 2);
    if (d < closestDist) {
      closestDist = d;
      closestBullet = b;
    }
  }

  const angleToPlayer = angleToTarget(ai, player);
  const diff = angleDiff(ai.angle, angleToPlayer);
  const los = hasLineOfSight(ai.x, ai.y, player.x, player.y);

  // Dodge incoming bullets
  if (closestBullet && closestDist < 80) {
    // Move perpendicular to bullet direction
    const bulletAngle = Math.atan2(closestBullet.dx, -closestBullet.dy);
    aiState.moveDir = bulletAngle + Math.PI / 2;
    aiState.dodging = true;
  } else if (now > aiState.nextDecision) {
    aiState.dodging = false;
    aiState.nextDecision = now + 800 + Math.random() * 1200;

    if (los) {
      // Move toward player but offset slightly
      aiState.moveDir = angleToPlayer + (Math.random() - 0.5) * 0.8;
    } else {
      // Wander: pick a random direction
      aiState.moveDir = ai.angle + (Math.random() - 0.5) * 2;
    }
  }

  // Rotate toward target
  const rotTarget = aiState.dodging ? aiState.moveDir : angleToPlayer;
  const rotDiff = angleDiff(ai.angle, rotTarget);
  const rotStep = TANK_ROT_SPEED * 0.8;
  if (Math.abs(rotDiff) > rotStep) {
    ai.angle += Math.sign(rotDiff) * rotStep;
  } else {
    ai.angle = rotTarget;
  }

  // Move forward
  const moveAngle = aiState.moveDir;
  const speed = TANK_SPEED * 0.75;
  const nx = ai.x + Math.sin(moveAngle) * speed;
  const ny = ai.y - Math.cos(moveAngle) * speed;

  if (!tankCollidesWalls(nx, ny)) {
    ai.x = nx;
    ai.y = ny;
  } else {
    // Try sliding along one axis
    if (!tankCollidesWalls(nx, ai.y)) {
      ai.x = nx;
    } else if (!tankCollidesWalls(ai.x, ny)) {
      ai.y = ny;
    } else {
      // Stuck: pick new direction
      aiState.moveDir = ai.angle + Math.PI / 2 + Math.random() * Math.PI;
      aiState.nextDecision = now + 200;
    }
  }

  // Fire when roughly aimed at player and have line of sight
  if (los && Math.abs(diff) < 0.3 && now - ai.lastFire > AI_SHOOT_COOLDOWN) {
    fire = true;
  }

  return { fire };
}

/* ------------------------------------------------------------------ */
/*  GAME COMPONENT                                                     */
/* ------------------------------------------------------------------ */

interface TankGameProps {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}

function TankGame({ mode, onGameEnd }: TankGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOver = useRef(false);
  const keys = useRef<Set<string>>(new Set());

  // Particle effects for hits
  interface Particle {
    x: number; y: number; dx: number; dy: number; life: number; color: string;
  }

  const particlesRef = useRef<Particle[]>([]);

  const spawnHitParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particlesRef.current.push({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: 1,
        color,
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- State ---
    const player: Tank = {
      x: 2 * TILE + TILE / 2,
      y: 12 * TILE + TILE / 2,
      angle: 0,
      lives: MAX_LIVES,
      color: COLOR_PLAYER,
      lastFire: 0,
      hitFlash: 0,
    };

    const ai: Tank = {
      x: 12 * TILE + TILE / 2,
      y: 2 * TILE + TILE / 2,
      angle: Math.PI,
      lives: MAX_LIVES,
      color: COLOR_AI,
      lastFire: 0,
      hitFlash: 0,
    };

    const bullets: Bullet[] = [];
    const aiState: AIState = {
      moveDir: Math.PI,
      nextDecision: 0,
      dodging: false,
    };

    // Countdown
    const startTime = performance.now();
    const COUNTDOWN_MS = 3000;
    let gameStarted = false;

    gameOver.current = false;

    function fireBullet(t: Tank, owner: "player" | "ai") {
      const bx = t.x + Math.sin(t.angle) * (BARREL_LEN + 2);
      const by = t.y - Math.cos(t.angle) * (BARREL_LEN + 2);
      bullets.push({
        x: bx,
        y: by,
        dx: Math.sin(t.angle) * BULLET_SPEED,
        dy: -Math.cos(t.angle) * BULLET_SPEED,
        bounces: 0,
        owner,
        color: owner === "player" ? COLOR_BULLET_PLAYER : COLOR_BULLET_AI,
      });
      t.lastFire = performance.now();
    }

    // --- Input ---
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.key.toLowerCase());
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()) ||
          ["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // --- Game Loop ---
    let animId: number;

    function loop() {
      if (gameOver.current) return;
      const now = performance.now();

      // Countdown phase
      const elapsed = now - startTime;
      if (elapsed < COUNTDOWN_MS) {
        ctx!.fillStyle = COLOR_BG;
        ctx!.fillRect(0, 0, ARENA_W, ARENA_H);
        drawWalls(ctx!);
        drawTank(ctx!, player, now);
        drawTank(ctx!, ai, now);
        drawHUD(ctx!, player, ai);
        drawControls(ctx!);
        const count = Math.ceil((COUNTDOWN_MS - elapsed) / 1000);
        drawCountdown(ctx!, count);
        animId = requestAnimationFrame(loop);
        return;
      }
      if (!gameStarted) {
        // Show "FIGHT!" for a brief moment
        if (elapsed < COUNTDOWN_MS + 500) {
          ctx!.fillStyle = COLOR_BG;
          ctx!.fillRect(0, 0, ARENA_W, ARENA_H);
          drawWalls(ctx!);
          drawTank(ctx!, player, now);
          drawTank(ctx!, ai, now);
          drawHUD(ctx!, player, ai);
          drawControls(ctx!);
          drawCountdown(ctx!, 0);
          animId = requestAnimationFrame(loop);
          return;
        }
        gameStarted = true;
      }

      // --- Player Input ---
      const k = keys.current;
      if (k.has("a") || k.has("arrowleft")) {
        player.angle -= TANK_ROT_SPEED;
      }
      if (k.has("d") || k.has("arrowright")) {
        player.angle += TANK_ROT_SPEED;
      }
      if (k.has("w") || k.has("arrowup")) {
        const nx = player.x + Math.sin(player.angle) * TANK_SPEED;
        const ny = player.y - Math.cos(player.angle) * TANK_SPEED;
        if (!tankCollidesWalls(nx, ny)) {
          player.x = nx;
          player.y = ny;
        } else if (!tankCollidesWalls(nx, player.y)) {
          player.x = nx;
        } else if (!tankCollidesWalls(player.x, ny)) {
          player.y = ny;
        }

      }
      if (k.has("s") || k.has("arrowdown")) {
        const nx = player.x - Math.sin(player.angle) * TANK_SPEED * 0.6;
        const ny = player.y + Math.cos(player.angle) * TANK_SPEED * 0.6;
        if (!tankCollidesWalls(nx, ny)) {
          player.x = nx;
          player.y = ny;
        } else if (!tankCollidesWalls(nx, player.y)) {
          player.x = nx;
        } else if (!tankCollidesWalls(player.x, ny)) {
          player.y = ny;
        }

      }
      if (k.has(" ") && now - player.lastFire > FIRE_COOLDOWN) {
        fireBullet(player, "player");
      }

      // --- AI ---
      const aiAction = updateAI(ai, player, bullets, aiState, now);
      if (aiAction.fire) {
        fireBullet(ai, "ai");
      }

      // --- Update Bullets ---
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.dx;
        b.y += b.dy;

        // Wall collision
        const hit = bulletHitsWall(b.x, b.y);
        if (hit) {
          if (b.bounces >= 1) {
            bullets.splice(i, 1);
            continue;
          }
          // Ricochet: determine which face was hit
          const wallCx = hit.col * TILE + TILE / 2;
          const wallCy = hit.row * TILE + TILE / 2;
          const relX = b.x - wallCx;
          const relY = b.y - wallCy;

          if (Math.abs(relX) / TILE > Math.abs(relY) / TILE) {
            b.dx = -b.dx;
            b.x += b.dx * 2;
          } else {
            b.dy = -b.dy;
            b.y += b.dy * 2;
          }
          b.bounces++;
          continue;
        }

        // Hit player?
        if (b.owner === "ai" && pointInTank(b.x, b.y, player)) {
          player.lives--;
          player.hitFlash = now;
          spawnHitParticles(b.x, b.y, COLOR_PLAYER);
          bullets.splice(i, 1);
          if (player.lives <= 0) {
            gameOver.current = true;
            setTimeout(() => onGameEnd(false), 800);
            return;
          }
          continue;
        }
        // Hit AI?
        if (b.owner === "player" && pointInTank(b.x, b.y, ai)) {
          ai.lives--;
          ai.hitFlash = now;
          spawnHitParticles(b.x, b.y, COLOR_AI);
          bullets.splice(i, 1);
          if (ai.lives <= 0) {
            gameOver.current = true;
            setTimeout(() => onGameEnd(true), 800);
            return;
          }
          continue;
        }

        // Out of bounds (safety)
        if (b.x < -10 || b.x > ARENA_W + 10 || b.y < -10 || b.y > ARENA_H + 10) {
          bullets.splice(i, 1);
        }
      }

      // --- Update Particles ---
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.dx;
        p.y += p.dy;
        p.life -= 0.025;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // --- Draw ---
      ctx!.fillStyle = COLOR_BG;
      ctx!.fillRect(0, 0, ARENA_W, ARENA_H);

      // Grid lines (subtle)
      ctx!.strokeStyle = "rgba(255,255,255,0.015)";
      ctx!.lineWidth = 1;
      for (let i = 0; i <= COLS; i++) {
        ctx!.beginPath();
        ctx!.moveTo(i * TILE, 0);
        ctx!.lineTo(i * TILE, ARENA_H);
        ctx!.stroke();
      }
      for (let i = 0; i <= ROWS; i++) {
        ctx!.beginPath();
        ctx!.moveTo(0, i * TILE);
        ctx!.lineTo(ARENA_W, i * TILE);
        ctx!.stroke();
      }

      drawWalls(ctx!);

      // Particles
      for (const p of particles) {
        ctx!.globalAlpha = p.life;
        ctx!.fillStyle = p.color;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 6;
        ctx!.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx!.globalAlpha = 1;
      ctx!.shadowBlur = 0;

      // Bullets
      for (const b of bullets) {
        drawBullet(ctx!, b);
      }

      // Tanks
      drawTank(ctx!, player, now);
      drawTank(ctx!, ai, now);

      // HUD
      drawHUD(ctx!, player, ai);
      drawControls(ctx!);

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);

    return () => {
      gameOver.current = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [onGameEnd, spawnHitParticles]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={ARENA_W}
        height={ARENA_H}
        className="border border-[var(--border-color)] block max-w-full"
        style={{
          imageRendering: "pixelated",
          boxShadow: "0 0 30px rgba(255,45,149,0.15), 0 0 60px rgba(0,255,255,0.08)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE EXPORT                                                        */
/* ------------------------------------------------------------------ */

export default function TankBattlePage() {
  return (
    <GameWrapper title="TANK BATTLE" color="pink">
      {({ mode, onGameEnd }) => (
        <TankGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
