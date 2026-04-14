"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ─── Constants ────────────────────────────────────────────────
const CANVAS_W = 700;
const CANVAS_H = 500;
const HALF_W = CANVAS_W / 2;
const DIVIDER_W = 2;
const FIELD_W = HALF_W - DIVIDER_W / 2;
const FIELD_H = CANVAS_H;

const SHIP_W = 20;
const SHIP_H = 16;
const BULLET_W = 2;
const BULLET_H = 8;
const BULLET_SPEED = 6;
const MAX_BULLETS = 2;
const SHIP_SPEED = 3.5;

const ENEMY_W = 16;
const ENEMY_H = 14;
const ENEMY_COLS = 8;
const ENEMY_ROWS = 4;
const ENEMY_PAD_X = 22;
const ENEMY_PAD_Y = 22;
const FORMATION_TOP = 40;
const FORMATION_LEFT = 20;

const GAME_DURATION = 90;
const COUNTDOWN_SECONDS = 3;
const STAR_COUNT = 80;

const SCORE_BEE = 100;
const SCORE_BUTTERFLY = 200;
const SCORE_BOSS = 400;

type EnemyType = "bee" | "butterfly" | "boss";

interface Star {
  x: number;
  y: number;
  speed: number;
  brightness: number;
}

interface Bullet {
  x: number;
  y: number;
  dy: number;
  fromEnemy: boolean;
}

interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  row: number;
  col: number;
  // dive state
  diving: boolean;
  diveT: number;
  diveStartX: number;
  diveStartY: number;
  diveCurveDir: number;
  diveSpeed: number;
  homeX: number;
  homeY: number;
  // flash on hit
  flashTimer: number;
}

interface Explosion {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
}

interface PlayerState {
  x: number;
  y: number;
  lives: number;
  score: number;
  wave: number;
  bullets: Bullet[];
  enemies: Enemy[];
  explosions: Explosion[];
  respawnTimer: number;
  invincibleTimer: number;
  dead: boolean;
  formationDir: number;
  formationOffsetX: number;
  diveTimer: number;
  enemyShootTimer: number;
}

// ─── Drawing helpers ──────────────────────────────────────────

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, invincible: boolean) {
  ctx.save();
  if (invincible && Math.floor(Date.now() / 80) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  // Main body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - SHIP_H / 2);
  ctx.lineTo(x - SHIP_W / 2, y + SHIP_H / 2);
  ctx.lineTo(x - SHIP_W / 4, y + SHIP_H / 4);
  ctx.lineTo(x + SHIP_W / 4, y + SHIP_H / 4);
  ctx.lineTo(x + SHIP_W / 2, y + SHIP_H / 2);
  ctx.closePath();
  ctx.fill();
  // Cockpit
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 2, y - 3, 4, 4);
  // Engine glow
  ctx.fillStyle = color === "#0ff" ? "#0ff" : "#b829ff";
  ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
  ctx.fillRect(x - 3, y + SHIP_H / 4, 6, 3);
  ctx.restore();
}

function drawBee(ctx: CanvasRenderingContext2D, x: number, y: number, flash: boolean) {
  ctx.save();
  if (flash) { ctx.fillStyle = "#fff"; } else { ctx.fillStyle = "#FFD700"; }
  // Body
  ctx.fillRect(x - 5, y - 4, 10, 8);
  // Wings
  ctx.fillStyle = flash ? "#fff" : "#FFA500";
  ctx.fillRect(x - 8, y - 6, 4, 6);
  ctx.fillRect(x + 4, y - 6, 4, 6);
  // Eyes
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 3, y - 3, 2, 2);
  ctx.fillRect(x + 1, y - 3, 2, 2);
  // Stripes
  ctx.fillStyle = flash ? "#ddd" : "#8B4513";
  ctx.fillRect(x - 4, y, 8, 1);
  ctx.fillRect(x - 4, y + 2, 8, 1);
  ctx.restore();
}

function drawButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, flash: boolean) {
  ctx.save();
  if (flash) { ctx.fillStyle = "#fff"; } else { ctx.fillStyle = "#FF00FF"; }
  // Body
  ctx.fillRect(x - 3, y - 5, 6, 10);
  // Left wing
  ctx.fillStyle = flash ? "#fff" : "#FF69B4";
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 4);
  ctx.lineTo(x - 10, y - 7);
  ctx.lineTo(x - 10, y + 2);
  ctx.lineTo(x - 3, y + 3);
  ctx.closePath();
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(x + 3, y - 4);
  ctx.lineTo(x + 10, y - 7);
  ctx.lineTo(x + 10, y + 2);
  ctx.lineTo(x + 3, y + 3);
  ctx.closePath();
  ctx.fill();
  // Wing dots
  ctx.fillStyle = flash ? "#ddd" : "#fff";
  ctx.fillRect(x - 8, y - 3, 2, 2);
  ctx.fillRect(x + 6, y - 3, 2, 2);
  // Eyes
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 2, y - 4, 2, 2);
  ctx.fillRect(x + 1, y - 4, 2, 2);
  ctx.restore();
}

function drawBoss(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, flash: boolean) {
  ctx.save();
  const baseColor = hp <= 1 ? "#FF4444" : "#00FF88";
  if (flash) { ctx.fillStyle = "#fff"; } else { ctx.fillStyle = baseColor; }
  // Body (larger)
  ctx.fillRect(x - 8, y - 6, 16, 12);
  // Crown
  ctx.fillStyle = flash ? "#fff" : "#FFD700";
  ctx.fillRect(x - 6, y - 9, 3, 3);
  ctx.fillRect(x - 1, y - 10, 3, 4);
  ctx.fillRect(x + 4, y - 9, 3, 3);
  // Wings
  ctx.fillStyle = flash ? "#ddd" : (hp <= 1 ? "#CC3333" : "#00CC66");
  ctx.fillRect(x - 12, y - 4, 4, 8);
  ctx.fillRect(x + 8, y - 4, 4, 8);
  // Eyes
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 5, y - 3, 3, 3);
  ctx.fillRect(x + 2, y - 3, 3, 3);
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 4, y - 2, 2, 2);
  ctx.fillRect(x + 3, y - 2, 2, 2);
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const flash = e.flashTimer > 0;
  switch (e.type) {
    case "bee": drawBee(ctx, e.x, e.y, flash); break;
    case "butterfly": drawButterfly(ctx, e.x, e.y, flash); break;
    case "boss": drawBoss(ctx, e.x, e.y, e.hp, flash); break;
  }
}

function drawExplosion(ctx: CanvasRenderingContext2D, ex: Explosion) {
  const progress = 1 - ex.timer / ex.maxTimer;
  const radius = 6 + progress * 14;
  const alpha = 1 - progress;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Outer ring
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Inner flash
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Sparks
  const sparkCount = 6;
  for (let i = 0; i < sparkCount; i++) {
    const angle = (i / sparkCount) * Math.PI * 2 + progress * 2;
    const dist = radius * (0.8 + progress * 0.5);
    const sx = ex.x + Math.cos(angle) * dist;
    const sy = ex.y + Math.sin(angle) * dist;
    ctx.fillStyle = i % 2 === 0 ? "#FF6600" : "#FFD700";
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }
  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet, color: string) {
  ctx.fillStyle = b.fromEnemy ? "#FF4444" : color;
  ctx.fillRect(b.x - BULLET_W / 2, b.y - BULLET_H / 2, BULLET_W, BULLET_H);
  // Glow
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = b.fromEnemy ? "#FF0000" : color;
  ctx.fillRect(b.x - BULLET_W, b.y - BULLET_H / 2 - 1, BULLET_W * 2, BULLET_H + 2);
  ctx.restore();
}

// ─── Formation creation ───────────────────────────────────────
function createFormation(wave: number): Enemy[] {
  const enemies: Enemy[] = [];
  const rows = Math.min(ENEMY_ROWS + Math.floor(wave / 3), 5);
  const cols = Math.min(ENEMY_COLS + Math.floor(wave / 4), 10);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let type: EnemyType;
      if (r === 0) type = "boss";
      else if (r === 1) type = "butterfly";
      else type = "bee";
      const homeX = FORMATION_LEFT + c * ENEMY_PAD_X;
      const homeY = FORMATION_TOP + r * ENEMY_PAD_Y;
      enemies.push({
        type,
        x: homeX,
        y: homeY,
        hp: type === "boss" ? 2 : 1,
        alive: true,
        row: r,
        col: c,
        diving: false,
        diveT: 0,
        diveStartX: homeX,
        diveStartY: homeY,
        diveCurveDir: 1,
        diveSpeed: 1.5 + wave * 0.15,
        homeX,
        homeY,
        flashTimer: 0,
      });
    }
  }
  return enemies;
}

function createInitialState(wave: number = 1): PlayerState {
  return {
    x: FIELD_W / 2,
    y: FIELD_H - 30,
    lives: 3,
    score: 0,
    wave,
    bullets: [],
    enemies: createFormation(wave),
    explosions: [],
    respawnTimer: 0,
    invincibleTimer: 0,
    dead: false,
    formationDir: 1,
    formationOffsetX: 0,
    diveTimer: 80 - Math.min(wave * 5, 40),
    enemyShootTimer: 60 - Math.min(wave * 3, 30),
  };
}

// ─── Game Component ───────────────────────────────────────────
function GalagaGame({ mode, onGameEnd }: { mode: "practice" | "wager"; onGameEnd: (won: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    player: createInitialState(),
    ai: createInitialState(),
    keys: new Set<string>(),
    stars: [] as Star[],
    countdown: COUNTDOWN_SECONDS,
    countdownTimer: 0,
    gameStarted: false,
    gameOver: false,
    timeLeft: GAME_DURATION,
    frameTimer: 0,
    lastTime: 0,
  });
  const animRef = useRef<number>(0);
  const endedRef = useRef(false);

  // Initialize stars
  useEffect(() => {
    const s = stateRef.current;
    s.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      s.stars.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        speed: 0.2 + Math.random() * 0.6,
        brightness: 0.3 + Math.random() * 0.7,
      });
    }
  }, []);

  const shoot = useCallback((ps: PlayerState): void => {
    if (ps.bullets.filter(b => !b.fromEnemy).length < MAX_BULLETS && ps.respawnTimer <= 0) {
      ps.bullets.push({ x: ps.x, y: ps.y - SHIP_H / 2, dy: -BULLET_SPEED, fromEnemy: false });
    }
  }, []);

  const updateField = useCallback((ps: PlayerState, dx: number, doShoot: boolean, wave: number): void => {
    // Move ship
    if (ps.respawnTimer <= 0 && !ps.dead) {
      ps.x += dx * SHIP_SPEED;
      ps.x = Math.max(SHIP_W / 2, Math.min(FIELD_W - SHIP_W / 2, ps.x));
    }

    // Shoot
    if (doShoot && ps.respawnTimer <= 0 && !ps.dead) {
      shoot(ps);
    }

    // Respawn timer
    if (ps.respawnTimer > 0) {
      ps.respawnTimer--;
      if (ps.respawnTimer <= 0) {
        ps.invincibleTimer = 90;
        ps.x = FIELD_W / 2;
        ps.y = FIELD_H - 30;
      }
    }
    if (ps.invincibleTimer > 0) ps.invincibleTimer--;

    // Update bullets
    ps.bullets = ps.bullets.filter(b => {
      b.y += b.dy;
      return b.y > -10 && b.y < FIELD_H + 10;
    });

    // Update formation sway
    const swaySpeed = 0.4 + wave * 0.05;
    ps.formationOffsetX += swaySpeed * ps.formationDir;
    const maxSway = 15 + wave * 2;
    if (ps.formationOffsetX > maxSway || ps.formationOffsetX < -maxSway) {
      ps.formationDir *= -1;
    }

    // Update enemies
    const aliveEnemies = ps.enemies.filter(e => e.alive);
    for (const e of ps.enemies) {
      if (!e.alive) continue;
      if (e.flashTimer > 0) e.flashTimer--;

      if (!e.diving) {
        // In formation
        e.x = e.homeX + ps.formationOffsetX;
        e.y = e.homeY;
      } else {
        // Diving
        e.diveT += 0.02 * e.diveSpeed;
        if (e.diveT < 0.5) {
          // Swooping curve down
          const t = e.diveT * 2;
          e.x = e.diveStartX + Math.sin(t * Math.PI * 2) * 40 * e.diveCurveDir;
          e.y = e.diveStartY + t * (FIELD_H - e.diveStartY + 40);
        } else {
          // Fly off bottom and respawn at top to return to formation
          e.diving = false;
          e.diveT = 0;
          e.x = e.homeX + ps.formationOffsetX;
          e.y = e.homeY;
        }
        // If enemy goes past bottom
        if (e.y > FIELD_H + 20) {
          e.diving = false;
          e.diveT = 0;
          e.x = e.homeX + ps.formationOffsetX;
          e.y = e.homeY;
        }
      }
    }

    // Dive timer
    ps.diveTimer--;
    if (ps.diveTimer <= 0) {
      const nonDiving = aliveEnemies.filter(e => !e.diving);
      if (nonDiving.length > 0) {
        const diver = nonDiving[Math.floor(Math.random() * nonDiving.length)];
        diver.diving = true;
        diver.diveT = 0;
        diver.diveStartX = diver.x;
        diver.diveStartY = diver.y;
        diver.diveCurveDir = Math.random() > 0.5 ? 1 : -1;
      }
      ps.diveTimer = Math.max(20, 80 - wave * 8);
    }

    // Enemy shoot timer
    ps.enemyShootTimer--;
    if (ps.enemyShootTimer <= 0) {
      // Pick a random alive enemy to shoot
      const shooters = aliveEnemies.filter(e => e.diving || Math.random() < 0.3);
      if (shooters.length > 0) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        ps.bullets.push({ x: shooter.x, y: shooter.y + ENEMY_H / 2, dy: 3 + wave * 0.3, fromEnemy: true });
      }
      ps.enemyShootTimer = Math.max(15, 60 - wave * 5);
    }

    // Bullet-enemy collisions (player bullets)
    for (const b of ps.bullets) {
      if (b.fromEnemy) continue;
      for (const e of ps.enemies) {
        if (!e.alive) continue;
        if (Math.abs(b.x - e.x) < ENEMY_W / 2 + 2 && Math.abs(b.y - e.y) < ENEMY_H / 2 + 2) {
          e.hp--;
          e.flashTimer = 6;
          b.y = -100; // remove bullet
          if (e.hp <= 0) {
            e.alive = false;
            ps.explosions.push({ x: e.x, y: e.y, timer: 20, maxTimer: 20 });
            switch (e.type) {
              case "bee": ps.score += SCORE_BEE; break;
              case "butterfly": ps.score += SCORE_BUTTERFLY; break;
              case "boss": ps.score += SCORE_BOSS; break;
            }
          }
          break;
        }
      }
    }

    // Enemy bullet hitting player
    if (ps.respawnTimer <= 0 && ps.invincibleTimer <= 0 && !ps.dead) {
      for (const b of ps.bullets) {
        if (!b.fromEnemy) continue;
        if (Math.abs(b.x - ps.x) < SHIP_W / 2 && Math.abs(b.y - ps.y) < SHIP_H / 2) {
          b.y = FIELD_H + 100;
          ps.lives--;
          ps.explosions.push({ x: ps.x, y: ps.y, timer: 30, maxTimer: 30 });
          if (ps.lives <= 0) {
            ps.dead = true;
          } else {
            ps.respawnTimer = 60;
          }
          break;
        }
      }
    }

    // Enemy body hitting player
    if (ps.respawnTimer <= 0 && ps.invincibleTimer <= 0 && !ps.dead) {
      for (const e of ps.enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - ps.x) < (SHIP_W + ENEMY_W) / 2 - 2 && Math.abs(e.y - ps.y) < (SHIP_H + ENEMY_H) / 2 - 2) {
          e.alive = false;
          ps.explosions.push({ x: e.x, y: e.y, timer: 20, maxTimer: 20 });
          ps.lives--;
          ps.explosions.push({ x: ps.x, y: ps.y, timer: 30, maxTimer: 30 });
          if (ps.lives <= 0) {
            ps.dead = true;
          } else {
            ps.respawnTimer = 60;
          }
          break;
        }
      }
    }

    // Update explosions
    ps.explosions = ps.explosions.filter(ex => {
      ex.timer--;
      return ex.timer > 0;
    });

    // Check if wave cleared
    if (ps.enemies.every(e => !e.alive) && !ps.dead) {
      ps.wave++;
      ps.enemies = createFormation(ps.wave);
      ps.formationOffsetX = 0;
      ps.formationDir = 1;
      ps.diveTimer = Math.max(20, 80 - ps.wave * 8);
      ps.enemyShootTimer = Math.max(15, 60 - ps.wave * 5);
    }
  }, [shoot]);

  const aiUpdate = useCallback((ps: PlayerState): { dx: number; doShoot: boolean } => {
    if (ps.dead || ps.respawnTimer > 0) return { dx: 0, doShoot: false };

    // Find nearest alive enemy, prioritize diving ones
    let target: Enemy | null = null;
    let minDist = Infinity;
    const divingEnemies = ps.enemies.filter(e => e.alive && e.diving);
    const searchList = divingEnemies.length > 0 ? divingEnemies : ps.enemies.filter(e => e.alive);

    for (const e of searchList) {
      const dist = Math.abs(e.x - ps.x) + Math.abs(e.y - ps.y) * 0.3;
      if (dist < minDist) {
        minDist = dist;
        target = e;
      }
    }

    let dx = 0;
    let doShoot = false;

    if (target) {
      // Move toward target x
      const diff = target.x - ps.x;
      if (Math.abs(diff) > 5) {
        dx = diff > 0 ? 1 : -1;
      }
      // Shoot when roughly aligned
      if (Math.abs(diff) < 15) {
        doShoot = true;
      }
    }

    // Dodge enemy bullets (basic)
    for (const b of ps.bullets) {
      if (!b.fromEnemy) continue;
      if (b.y > ps.y - 80 && b.y < ps.y && Math.abs(b.x - ps.x) < 25) {
        // Dodge away from bullet
        dx = b.x > ps.x ? -1 : 1;
      }
    }

    // Rate-limit shooting (AI doesn't spam perfectly)
    if (Math.random() > 0.15) doShoot = false;

    return { dx, doShoot };
  }, []);

  const renderField = useCallback((
    ctx: CanvasRenderingContext2D,
    ps: PlayerState,
    offsetX: number,
    shipColor: string,
    label: string,
    labelColor: string,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, FIELD_W, FIELD_H);
    ctx.clip();
    ctx.translate(offsetX, 0);

    // Draw enemies
    for (const e of ps.enemies) {
      if (e.alive) drawEnemy(ctx, e);
    }

    // Draw player bullets
    for (const b of ps.bullets) {
      drawBullet(ctx, b, b.fromEnemy ? "#FF4444" : shipColor);
    }

    // Draw ship
    if (ps.respawnTimer <= 0 && !ps.dead) {
      drawShip(ctx, ps.x, ps.y, shipColor, ps.invincibleTimer > 0);
    }

    // Draw explosions
    for (const ex of ps.explosions) {
      drawExplosion(ctx, ex);
    }

    // HUD
    ctx.fillStyle = labelColor;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, 6, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "9px monospace";
    ctx.fillText(`SCORE: ${ps.score}`, 6, 28);
    ctx.fillText(`WAVE: ${ps.wave}`, FIELD_W - 70, 14);

    // Lives as small ships
    ctx.fillStyle = shipColor;
    for (let i = 0; i < ps.lives; i++) {
      const lx = FIELD_W - 66 + i * 16;
      const ly = 28;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 4);
      ctx.lineTo(lx - 5, ly + 4);
      ctx.lineTo(lx + 5, ly + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Dead overlay
    if (ps.dead) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.fillStyle = "#FF4444";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DESTROYED", FIELD_W / 2, FIELD_H / 2);
    }

    ctx.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const s = stateRef.current;
    // Reset state
    s.player = createInitialState();
    s.ai = createInitialState();
    s.countdown = COUNTDOWN_SECONDS;
    s.countdownTimer = 0;
    s.gameStarted = false;
    s.gameOver = false;
    s.timeLeft = GAME_DURATION;
    s.frameTimer = 0;
    s.lastTime = 0;
    endedRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "Space", " "].includes(e.key)) {
        e.preventDefault();
        s.keys.add(e.key === " " ? "Space" : e.key);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      s.keys.delete(e.key === " " ? "Space" : e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let spaceWasDown = false;

    const gameLoop = (timestamp: number) => {
      if (!s.lastTime) s.lastTime = timestamp;
      const dt = timestamp - s.lastTime;
      s.lastTime = timestamp;

      // ── Clear & draw background ──
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Stars
      for (const star of s.stars) {
        star.y += star.speed;
        if (star.y > CANVAS_H) {
          star.y = 0;
          star.x = Math.random() * CANVAS_W;
        }
        ctx.fillStyle = `rgba(255,255,255,${star.brightness})`;
        ctx.fillRect(star.x, star.y, 1, 1);
      }

      // Divider
      ctx.fillStyle = "#333";
      ctx.fillRect(HALF_W - 1, 0, DIVIDER_W, CANVAS_H);

      // ── Countdown phase ──
      if (!s.gameStarted) {
        s.frameTimer += dt;
        if (s.frameTimer >= 1000) {
          s.frameTimer -= 1000;
          s.countdown--;
          if (s.countdown <= 0) {
            s.gameStarted = true;
          }
        }

        // Render static fields (enemies in place, ship visible)
        renderField(ctx, s.player, 0, "#0ff", "PLAYER", "#0ff");
        renderField(ctx, s.ai, HALF_W, "#b829ff", "CPU", "#b829ff");

        // Countdown number
        const countText = s.countdown > 0 ? String(s.countdown) : "GO!";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 48px monospace";
        ctx.textAlign = "center";
        ctx.globalAlpha = 0.9;
        ctx.fillText(countText, CANVAS_W / 2, CANVAS_H / 2 + 10);
        ctx.globalAlpha = 1;

        // Timer bar at bottom
        ctx.fillStyle = "#333";
        ctx.fillRect(0, CANVAS_H - 20, CANVAS_W, 20);
        ctx.fillStyle = "#888";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`TIME: ${GAME_DURATION}s`, CANVAS_W / 2, CANVAS_H - 7);

        // Controls hint
        ctx.fillStyle = "#555";
        ctx.font = "8px monospace";
        ctx.fillText("\u2190 \u2192 MOVE  |  SPACE SHOOT", CANVAS_W / 2, CANVAS_H - 28);

        animRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── Game logic ──
      if (!s.gameOver) {
        // Timer
        s.frameTimer += dt;
        if (s.frameTimer >= 1000) {
          s.frameTimer -= 1000;
          s.timeLeft--;
        }

        // Player input
        let pdx = 0;
        if (s.keys.has("ArrowLeft")) pdx = -1;
        if (s.keys.has("ArrowRight")) pdx = 1;
        const spaceDown = s.keys.has("Space");
        const pShoot = spaceDown && !spaceWasDown;
        spaceWasDown = spaceDown;

        // Update player
        updateField(s.player, pdx, pShoot, s.player.wave);

        // AI logic
        const aiInput = aiUpdate(s.ai);
        updateField(s.ai, aiInput.dx, aiInput.doShoot, s.ai.wave);

        // Check end conditions
        const bothDead = s.player.dead && s.ai.dead;
        const timeUp = s.timeLeft <= 0;
        const playerDead = s.player.dead;
        const aiDead = s.ai.dead;

        if (timeUp || bothDead || playerDead || aiDead) {
          if (!endedRef.current) {
            s.gameOver = true;
            endedRef.current = true;
            let playerWon: boolean;
            if (playerDead && !aiDead) {
              playerWon = false;
            } else if (aiDead && !playerDead) {
              playerWon = true;
            } else {
              playerWon = s.player.score >= s.ai.score;
            }
            setTimeout(() => onGameEnd(playerWon), 1500);
          }
        }
      }

      // ── Render ──
      renderField(ctx, s.player, 0, "#0ff", "PLAYER", "#0ff");
      renderField(ctx, s.ai, HALF_W, "#b829ff", "CPU", "#b829ff");

      // Timer bar
      ctx.fillStyle = "#111";
      ctx.fillRect(0, CANVAS_H - 20, CANVAS_W, 20);
      const timeRatio = Math.max(0, s.timeLeft / GAME_DURATION);
      const barColor = s.timeLeft <= 10 ? "#FF4444" : s.timeLeft <= 30 ? "#FFD700" : "#0f0";
      ctx.fillStyle = barColor;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(0, CANVAS_H - 20, CANVAS_W * timeRatio, 20);
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.timeLeft <= 10 ? "#FF4444" : "#fff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`TIME: ${Math.max(0, s.timeLeft)}s`, CANVAS_W / 2, CANVAS_H - 7);

      // Controls hint
      ctx.fillStyle = "#444";
      ctx.font = "8px monospace";
      ctx.fillText("\u2190 \u2192 MOVE  |  SPACE SHOOT", CANVAS_W / 2, CANVAS_H - 28);

      // Scores comparison in divider area
      ctx.fillStyle = "#0ff";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(String(s.player.score), HALF_W - 6, CANVAS_H - 7);
      ctx.fillStyle = "#b829ff";
      ctx.textAlign = "left";
      ctx.fillText(String(s.ai.score), HALF_W + 6, CANVAS_H - 7);

      // Game over overlay
      if (s.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textAlign = "center";

        const playerWon = s.player.dead && !s.ai.dead ? false
          : s.ai.dead && !s.player.dead ? true
          : s.player.score >= s.ai.score;

        ctx.fillStyle = playerWon ? "#0f0" : "#f44";
        ctx.font = "bold 28px monospace";
        ctx.fillText(playerWon ? "YOU WIN!" : "YOU LOSE!", CANVAS_W / 2, CANVAS_H / 2 - 10);

        ctx.fillStyle = "#fff";
        ctx.font = "12px monospace";
        ctx.fillText(
          `${s.player.score} vs ${s.ai.score}`,
          CANVAS_W / 2,
          CANVAS_H / 2 + 20
        );
      }

      animRef.current = requestAnimationFrame(gameLoop);
    };

    animRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [mode, onGameEnd, updateField, aiUpdate, renderField]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="border border-purple-500/30 rounded"
        style={{ imageRendering: "pixelated", maxWidth: "100%", height: "auto" }}
      />
      <p className="text-[8px] text-[var(--text-muted)] tracking-widest">
        FIRST TO LOSE ALL LIVES OR LOWEST SCORE AFTER 90s LOSES
      </p>
    </div>
  );
}

// ─── Page Export ───────────────────────────────────────────────
export default function GalagaPage() {
  return (
    <GameWrapper title="GALAGA DUEL" color="purple">
      {({ mode, onGameEnd }) => (
        <GalagaGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
