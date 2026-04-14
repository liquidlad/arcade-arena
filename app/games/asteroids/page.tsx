"use client";

import { useEffect, useRef, useCallback } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// --- Constants ---
const W = 700;
const H = 500;
const BG = "#0a0a1a";
const PLAYER_COLOR = "#00ffff";
const AI_COLOR = "#ff00ff";
const ASTEROID_COLOR = "#888899";
const BULLET_COLOR_PLAYER = "#00ffff";
const BULLET_COLOR_AI = "#ff00ff";
const SHIP_RADIUS = 12;
const BULLET_SPEED = 6;
const BULLET_LIFE = 80;
const THRUST_POWER = 0.12;
const ROTATION_SPEED = 0.065;
const FRICTION = 0.99;
const MAX_SPEED = 4.5;
const INVULN_TIME = 120; // frames of invulnerability after death
const SHOOT_COOLDOWN = 12;
const MAX_LIVES = 3;
const ASTEROID_SPAWN_INTERVAL = 600; // frames between new asteroid waves
const INITIAL_ASTEROIDS = 4;

// --- Types ---
interface Vec2 {
  x: number;
  y: number;
}

interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  lives: number;
  score: number;
  invulnTimer: number;
  shootCooldown: number;
  thrusting: boolean;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: "player" | "ai";
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: "large" | "medium" | "small";
  radius: number;
  vertices: Vec2[];
  rotation: number;
  rotSpeed: number;
}

// --- Helpers ---
function wrap(val: number, max: number): number {
  if (val < 0) return val + max;
  if (val > max) return val - max;
  return val;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function wrapDist(a: Vec2, b: Vec2): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const wx = Math.min(dx, W - dx);
  const wy = Math.min(dy, H - dy);
  return Math.sqrt(wx * wx + wy * wy);
}

function angleTo(from: Vec2, to: Vec2): number {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  // Handle wrapping - find shortest path
  if (Math.abs(dx) > W / 2) dx = dx > 0 ? dx - W : dx + W;
  if (Math.abs(dy) > H / 2) dy = dy > 0 ? dy - H : dy + H;
  return Math.atan2(dy, dx);
}

function sizeRadius(size: "large" | "medium" | "small"): number {
  if (size === "large") return 35;
  if (size === "medium") return 20;
  return 10;
}

function sizeScore(size: "large" | "medium" | "small"): number {
  if (size === "large") return 20;
  if (size === "medium") return 50;
  return 100;
}

function makeAsteroidVertices(radius: number): Vec2[] {
  const count = 8 + Math.floor(Math.random() * 5);
  const verts: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = radius * (0.7 + Math.random() * 0.6);
    verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return verts;
}

function spawnAsteroid(avoidX?: number, avoidY?: number): Asteroid {
  let x: number, y: number;
  do {
    x = Math.random() * W;
    y = Math.random() * H;
  } while (
    avoidX !== undefined &&
    avoidY !== undefined &&
    dist({ x, y }, { x: avoidX, y: avoidY }) < 120
  );
  const speed = 0.5 + Math.random() * 1.2;
  const angle = Math.random() * Math.PI * 2;
  const radius = sizeRadius("large");
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: "large",
    radius,
    vertices: makeAsteroidVertices(radius),
    rotation: 0,
    rotSpeed: (Math.random() - 0.5) * 0.03,
  };
}

function splitAsteroid(a: Asteroid): Asteroid[] {
  const nextSize = a.size === "large" ? "medium" : a.size === "medium" ? "small" : null;
  if (!nextSize) return [];
  const results: Asteroid[] = [];
  for (let i = 0; i < 2; i++) {
    const speed = 0.8 + Math.random() * 1.5;
    const angle = Math.random() * Math.PI * 2;
    const radius = sizeRadius(nextSize);
    results.push({
      x: a.x + (Math.random() - 0.5) * 10,
      y: a.y + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: nextSize,
      radius,
      vertices: makeAsteroidVertices(radius),
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.05,
    });
  }
  return results;
}

// --- Game Component ---
function AsteroidsGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const gameOverRef = useRef(false);

  const gameLoop = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // --- State ---
      const player: Ship = {
        x: W * 0.25,
        y: H / 2,
        vx: 0,
        vy: 0,
        angle: 0,
        lives: MAX_LIVES,
        score: 0,
        invulnTimer: INVULN_TIME,
        shootCooldown: 0,
        thrusting: false,
      };

      const ai: Ship = {
        x: W * 0.75,
        y: H / 2,
        vx: 0,
        vy: 0,
        angle: Math.PI,
        lives: MAX_LIVES,
        score: 0,
        invulnTimer: INVULN_TIME,
        shootCooldown: 0,
        thrusting: false,
      };

      let bullets: Bullet[] = [];
      let asteroids: Asteroid[] = [];
      let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
      let frameCount = 0;

      // Spawn initial asteroids
      for (let i = 0; i < INITIAL_ASTEROIDS; i++) {
        asteroids.push(spawnAsteroid(W / 2, H / 2));
      }

      // --- Explosion particles ---
      function explode(x: number, y: number, color: string, count: number) {
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 3;
          particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 20 + Math.floor(Math.random() * 30),
            color,
          });
        }
      }

      // --- Shoot ---
      function shoot(ship: Ship, owner: "player" | "ai") {
        if (ship.shootCooldown > 0) return;
        ship.shootCooldown = SHOOT_COOLDOWN;
        bullets.push({
          x: ship.x + Math.cos(ship.angle) * (SHIP_RADIUS + 4),
          y: ship.y + Math.sin(ship.angle) * (SHIP_RADIUS + 4),
          vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
          vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
          life: BULLET_LIFE,
          owner,
        });
      }

      // --- Respawn ship ---
      function respawnShip(ship: Ship, defaultX: number) {
        ship.x = defaultX;
        ship.y = H / 2;
        ship.vx = 0;
        ship.vy = 0;
        ship.invulnTimer = INVULN_TIME;
      }

      // --- AI Behavior ---
      function updateAI() {
        // Find nearest asteroid threat
        let nearestAsteroid: Asteroid | null = null;
        let nearestAsteroidDist = Infinity;
        for (const a of asteroids) {
          const d = wrapDist(ai, a);
          if (d < nearestAsteroidDist) {
            nearestAsteroidDist = d;
            nearestAsteroid = a;
          }
        }

        // Decide target: shoot nearest asteroid if close, else shoot player
        let targetAngle: number;
        let shouldShoot = false;

        if (nearestAsteroid && nearestAsteroidDist < 150) {
          // Avoid/destroy nearby asteroid
          targetAngle = angleTo(ai, nearestAsteroid);
          shouldShoot = nearestAsteroidDist < 200;
          // Thrust away if very close
          if (nearestAsteroidDist < 80) {
            const awayAngle = angleTo(nearestAsteroid, ai);
            ai.vx += Math.cos(awayAngle) * THRUST_POWER * 0.7;
            ai.vy += Math.sin(awayAngle) * THRUST_POWER * 0.7;
            ai.thrusting = true;
          }
        } else {
          // Target the player
          targetAngle = angleTo(ai, player);
          const playerDist = wrapDist(ai, player);
          shouldShoot = playerDist < 350;

          // Move toward player if far, maintain distance if close
          if (playerDist > 200) {
            ai.vx += Math.cos(ai.angle) * THRUST_POWER * 0.5;
            ai.vy += Math.sin(ai.angle) * THRUST_POWER * 0.5;
            ai.thrusting = true;
          } else if (playerDist < 100) {
            const awayAngle = angleTo(player, ai);
            ai.vx += Math.cos(awayAngle) * THRUST_POWER * 0.4;
            ai.vy += Math.sin(awayAngle) * THRUST_POWER * 0.4;
            ai.thrusting = true;
          } else {
            ai.thrusting = false;
          }
        }

        // Rotate toward target
        let angleDiff = targetAngle - ai.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) > 0.1) {
          ai.angle += angleDiff > 0 ? ROTATION_SPEED * 0.85 : -ROTATION_SPEED * 0.85;
        }

        // Shoot with some randomness so it's not laser-perfect
        if (shouldShoot && Math.abs(angleDiff) < 0.3 && Math.random() < 0.06) {
          shoot(ai, "ai");
        }
      }

      // --- Draw ship ---
      function drawShip(ship: Ship, color: string) {
        if (ship.lives <= 0) return;
        if (ship.invulnTimer > 0 && Math.floor(ship.invulnTimer / 4) % 2 === 0) return; // blink

        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);

        // Ship triangle
        ctx.beginPath();
        ctx.moveTo(SHIP_RADIUS, 0);
        ctx.lineTo(-SHIP_RADIUS * 0.7, -SHIP_RADIUS * 0.6);
        ctx.lineTo(-SHIP_RADIUS * 0.4, 0);
        ctx.lineTo(-SHIP_RADIUS * 0.7, SHIP_RADIUS * 0.6);
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Thrust flame
        if (ship.thrusting) {
          ctx.beginPath();
          ctx.moveTo(-SHIP_RADIUS * 0.5, -SHIP_RADIUS * 0.25);
          ctx.lineTo(-SHIP_RADIUS * (0.8 + Math.random() * 0.5), 0);
          ctx.lineTo(-SHIP_RADIUS * 0.5, SHIP_RADIUS * 0.25);
          ctx.strokeStyle = "#ffaa00";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.restore();
      }

      // --- Draw asteroid ---
      function drawAsteroid(a: Asteroid) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotation);
        ctx.beginPath();
        ctx.moveTo(a.vertices[0].x, a.vertices[0].y);
        for (let i = 1; i < a.vertices.length; i++) {
          ctx.lineTo(a.vertices[i].x, a.vertices[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = ASTEROID_COLOR;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // --- Draw lives ---
      function drawLives(x: number, y: number, lives: number, color: string, label: string) {
        ctx.fillStyle = color;
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, x, y);
        for (let i = 0; i < lives; i++) {
          const lx = x + i * 18 + 60;
          const ly = y - 4;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-4, -4);
          ctx.lineTo(-2, 0);
          ctx.lineTo(-4, 4);
          ctx.closePath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
        }
      }

      // --- Draw score ---
      function drawScore(x: number, y: number, score: number, color: string) {
        ctx.fillStyle = color;
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${score}`, x, y);
      }

      // --- Main loop ---
      let animId: number;

      function update() {
        if (gameOverRef.current) return;
        frameCount++;
        const keys = keysRef.current;

        // --- Player input ---
        player.thrusting = false;
        if (player.lives > 0) {
          if (keys.has("ArrowLeft")) player.angle -= ROTATION_SPEED;
          if (keys.has("ArrowRight")) player.angle += ROTATION_SPEED;
          if (keys.has("ArrowUp")) {
            player.vx += Math.cos(player.angle) * THRUST_POWER;
            player.vy += Math.sin(player.angle) * THRUST_POWER;
            player.thrusting = true;
          }
          if (keys.has(" ")) shoot(player, "player");
        }

        // --- AI ---
        if (ai.lives > 0 && ai.invulnTimer < INVULN_TIME - 30) {
          updateAI();
        } else {
          ai.thrusting = false;
        }

        // --- Update ships ---
        for (const ship of [player, ai]) {
          // Friction
          ship.vx *= FRICTION;
          ship.vy *= FRICTION;

          // Clamp speed
          const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
          if (speed > MAX_SPEED) {
            ship.vx = (ship.vx / speed) * MAX_SPEED;
            ship.vy = (ship.vy / speed) * MAX_SPEED;
          }

          ship.x = wrap(ship.x + ship.vx, W);
          ship.y = wrap(ship.y + ship.vy, H);

          if (ship.invulnTimer > 0) ship.invulnTimer--;
          if (ship.shootCooldown > 0) ship.shootCooldown--;
        }

        // --- Update bullets ---
        bullets = bullets.filter((b) => {
          b.x = wrap(b.x + b.vx, W);
          b.y = wrap(b.y + b.vy, H);
          b.life--;
          return b.life > 0;
        });

        // --- Update asteroids ---
        for (const a of asteroids) {
          a.x = wrap(a.x + a.vx, W);
          a.y = wrap(a.y + a.vy, H);
          a.rotation += a.rotSpeed;
        }

        // --- Update particles ---
        particles = particles.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.97;
          p.vy *= 0.97;
          p.life--;
          return p.life > 0;
        });

        // --- Bullet-Asteroid collisions ---
        const newAsteroids: Asteroid[] = [];
        const bulletsToRemove = new Set<number>();
        const asteroidsToRemove = new Set<number>();

        for (let bi = 0; bi < bullets.length; bi++) {
          for (let ai2 = 0; ai2 < asteroids.length; ai2++) {
            if (asteroidsToRemove.has(ai2)) continue;
            const b = bullets[bi];
            const a = asteroids[ai2];
            if (dist(b, a) < a.radius) {
              bulletsToRemove.add(bi);
              asteroidsToRemove.add(ai2);
              newAsteroids.push(...splitAsteroid(a));
              explode(a.x, a.y, ASTEROID_COLOR, a.size === "large" ? 12 : a.size === "medium" ? 8 : 5);
              // Award score to shooter
              const scoreVal = sizeScore(a.size);
              if (b.owner === "player") player.score += scoreVal;
              else ai.score += scoreVal;
              break;
            }
          }
        }

        bullets = bullets.filter((_, i) => !bulletsToRemove.has(i));
        asteroids = asteroids.filter((_, i) => !asteroidsToRemove.has(i));
        asteroids.push(...newAsteroids);

        // --- Bullet-Ship collisions ---
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
          const b = bullets[bi];

          // Check player hit
          if (b.owner === "ai" && player.lives > 0 && player.invulnTimer <= 0) {
            if (dist(b, player) < SHIP_RADIUS) {
              player.lives--;
              explode(player.x, player.y, PLAYER_COLOR, 20);
              bullets.splice(bi, 1);
              if (player.lives > 0) respawnShip(player, W * 0.25);
              continue;
            }
          }

          // Check AI hit
          if (b.owner === "player" && ai.lives > 0 && ai.invulnTimer <= 0) {
            if (dist(b, ai) < SHIP_RADIUS) {
              ai.lives--;
              explode(ai.x, ai.y, AI_COLOR, 20);
              bullets.splice(bi, 1);
              if (ai.lives > 0) respawnShip(ai, W * 0.75);
              continue;
            }
          }
        }

        // --- Ship-Asteroid collisions ---
        for (const [ship, color, defaultX, label] of [
          [player, PLAYER_COLOR, W * 0.25, "player"],
          [ai, AI_COLOR, W * 0.75, "ai"],
        ] as [Ship, string, number, string][]) {
          if (ship.lives <= 0 || ship.invulnTimer > 0) continue;
          for (let ai3 = asteroids.length - 1; ai3 >= 0; ai3--) {
            const a = asteroids[ai3];
            if (dist(ship, a) < a.radius + SHIP_RADIUS * 0.6) {
              ship.lives--;
              explode(ship.x, ship.y, color, 25);
              // Also break the asteroid
              const children = splitAsteroid(a);
              explode(a.x, a.y, ASTEROID_COLOR, 8);
              asteroids.splice(ai3, 1);
              asteroids.push(...children);
              if (ship.lives > 0) respawnShip(ship, defaultX);
              break;
            }
          }
        }

        // --- Spawn new asteroids periodically ---
        if (frameCount % ASTEROID_SPAWN_INTERVAL === 0 && asteroids.length < 15) {
          const count = 2 + Math.floor(frameCount / 1800); // more over time, capped naturally by max check
          for (let i = 0; i < Math.min(count, 3); i++) {
            asteroids.push(spawnAsteroid(player.x, player.y));
          }
        }

        // --- Check game over ---
        if (player.lives <= 0 || ai.lives <= 0) {
          gameOverRef.current = true;
          // Delay to show explosion then report result
          setTimeout(() => {
            onGameEnd(ai.lives <= 0 && player.lives > 0);
          }, 1200);
        }

        // --- DRAW ---
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

        // Subtle grid
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 0.5;
        for (let gx = 0; gx < W; gx += 50) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, H);
          ctx.stroke();
        }
        for (let gy = 0; gy < H; gy += 50) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(W, gy);
          ctx.stroke();
        }

        // Border
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, W, H);

        // Asteroids
        for (const a of asteroids) drawAsteroid(a);

        // Bullets
        for (const b of bullets) {
          ctx.fillStyle = b.owner === "player" ? BULLET_COLOR_PLAYER : BULLET_COLOR_AI;
          ctx.shadowColor = b.owner === "player" ? BULLET_COLOR_PLAYER : BULLET_COLOR_AI;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Particles
        for (const p of particles) {
          const alpha = p.life / 50;
          ctx.fillStyle =
            p.color +
            Math.floor(Math.min(1, alpha) * 255)
              .toString(16)
              .padStart(2, "0");
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ships
        drawShip(player, PLAYER_COLOR);
        drawShip(ai, AI_COLOR);

        // HUD - Lives
        drawLives(12, 22, player.lives, PLAYER_COLOR, "PLAYER");
        drawLives(12, 42, ai.lives, AI_COLOR, "  A.I.");

        // HUD - Scores
        ctx.fillStyle = PLAYER_COLOR;
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`P: ${player.score}`, W - 12, 22);
        ctx.fillStyle = AI_COLOR;
        ctx.fillText(`AI: ${ai.score}`, W - 12, 42);

        // Mode indicator
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(mode === "wager" ? "WAGER MATCH" : "PRACTICE", W / 2, 18);

        // Controls hint
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText("\u2190 \u2192 ROTATE  |  \u2191 THRUST  |  SPACE SHOOT", W / 2, H - 10);

        // Game over flash
        if (gameOverRef.current) {
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.fillRect(0, 0, W, H);
          const winColor = ai.lives <= 0 ? PLAYER_COLOR : AI_COLOR;
          const winText = ai.lives <= 0 ? "VICTORY" : "DEFEATED";
          ctx.fillStyle = winColor;
          ctx.shadowColor = winColor;
          ctx.shadowBlur = 20;
          ctx.font = "bold 36px monospace";
          ctx.textAlign = "center";
          ctx.fillText(winText, W / 2, H / 2);
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "12px monospace";
          ctx.fillText(
            `PLAYER: ${player.score}  |  A.I.: ${ai.score}`,
            W / 2,
            H / 2 + 30
          );
        }

        animId = requestAnimationFrame(update);
      }

      animId = requestAnimationFrame(update);

      return () => {
        cancelAnimationFrame(animId);
      };
    },
    [mode, onGameEnd]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    gameOverRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const cleanup = gameLoop(ctx);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keysRef.current.clear();
      gameOverRef.current = true;
      cleanup();
    };
  }, [gameLoop]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="border border-[var(--border-color)] bg-[#0a0a1a] max-w-full"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="flex gap-6 text-[8px] text-[var(--text-muted)]">
        <span>
          <span className="text-[#00ffff]">CYAN</span> = YOU
        </span>
        <span>
          <span className="text-[#ff00ff]">MAGENTA</span> = A.I.
        </span>
        <span>DESTROY ASTEROIDS & YOUR OPPONENT</span>
      </div>
    </div>
  );
}

// --- Page Export ---
export default function AsteroidsPage() {
  return (
    <GameWrapper title="ASTEROIDS DUEL" color="magenta">
      {({ mode, onGameEnd }) => (
        <AsteroidsGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
