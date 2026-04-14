"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const W = 700;
const H = 500;
const BG = "#0a0a1a";
const HALF = W / 2;
const GROUND_H = 40;
const GROUND_Y = H - GROUND_H;
const CITY_W = 24;
const CITY_H = 18;
const BATTERY_W = 20;
const BATTERY_H = 14;
const MAX_WAVES = 5;
const BASE_AMMO = 15;
const POINTS_PER_KILL = 25;
const POINTS_PER_CITY_BONUS = 100;
const EXPLOSION_MAX_R = 34;
const EXPLOSION_GROW_RATE = 1.2;
const EXPLOSION_SHRINK_RATE = 0.8;
const COUNTER_MISSILE_SPEED = 5;
const PLAYER_COLOR = "#00ffff";
const AI_COLOR = "#ff00ff";
const ENEMY_MISSILE_COLOR = "#ff3333";
const EXPLOSION_COLORS = ["#ffffff", "#ffff00", "#ff8800", "#ff3333"];

// City positions relative to side origin (0..HALF)
const CITY_OFFSETS = [45, 90, 135, 215, 260, 305];
const BATTERY_X_OFFSET = HALF / 2; // center of each half

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface City {
  x: number;
  alive: boolean;
}

interface EnemyMissile {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  speed: number;
  alive: boolean;
  hit: boolean;
  trail: { x: number; y: number }[];
}

interface CounterMissile {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  speed: number;
  alive: boolean;
  arrived: boolean;
  side: "player" | "ai";
}

interface Explosion {
  x: number;
  y: number;
  r: number;
  maxR: number;
  growing: boolean;
  alive: boolean;
  side: "player" | "ai";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// MissileCommandGame component
// ---------------------------------------------------------------------------

function MissileCommandGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const gameOverRef = useRef(false);
  const clickQueueRef = useRef<{ x: number; y: number }[]>([]);

  const [countdown, setCountdown] = useState<number | null>(3);
  const [wave, setWave] = useState(1);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [playerAmmo, setPlayerAmmo] = useState(BASE_AMMO);
  const [aiAmmo, setAiAmmo] = useState(BASE_AMMO);
  const [playerCities, setPlayerCities] = useState(6);
  const [aiCities, setAiCities] = useState(6);

  // -----------------------------------------------------------------------
  // Build initial cities
  // -----------------------------------------------------------------------

  const buildCities = useCallback((offsetX: number): City[] => {
    return CITY_OFFSETS.map((cx) => ({
      x: offsetX + cx,
      alive: true,
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Main game loop
  // -----------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    // -- State ---------------------------------------------------------------
    let paused = true;
    let gameOver = false;
    gameOverRef.current = false;

    let currentWave = 1;
    let pScore = 0;
    let aScore = 0;
    let pAmmo = BASE_AMMO;
    let aAmmo = BASE_AMMO;

    const pCities: City[] = buildCities(0);
    const aCities: City[] = buildCities(HALF);

    let enemyMissilesPlayer: EnemyMissile[] = [];
    let enemyMissilesAI: EnemyMissile[] = [];
    let counterMissiles: CounterMissile[] = [];
    let explosions: Explosion[] = [];

    let waveEnemyCountPlayer = 0;
    let waveEnemyCountAI = 0;
    let spawnTimerPlayer = 0;
    let spawnTimerAI = 0;
    let spawnedPlayer = 0;
    let spawnedAI = 0;
    let waveComplete = false;
    let waveEndTimer = 0;
    let aiFireCooldown = 0;

    // -- Countdown -----------------------------------------------------------
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

    // -- Mouse / Click -------------------------------------------------------
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      clickQueueRef.current.push({ x: mx, y: my });
    };

    canvas.addEventListener("click", onClick);
    canvas.style.cursor = "crosshair";

    // -- Wave setup ----------------------------------------------------------
    function setupWave(waveNum: number) {
      const baseCount = 6 + waveNum * 3;
      waveEnemyCountPlayer = baseCount;
      waveEnemyCountAI = baseCount;
      spawnedPlayer = 0;
      spawnedAI = 0;
      spawnTimerPlayer = 0;
      spawnTimerAI = 0;
      waveComplete = false;
      waveEndTimer = 0;
      pAmmo = BASE_AMMO + waveNum * 2;
      aAmmo = BASE_AMMO + waveNum * 2;
      setPlayerAmmo(pAmmo);
      setAiAmmo(aAmmo);
      aiFireCooldown = 0;
    }

    function createEnemyMissile(targetSide: "player" | "ai", waveNum: number): EnemyMissile {
      const offsetX = targetSide === "player" ? 0 : HALF;
      const cities = targetSide === "player" ? pCities : aCities;
      const aliveCities = cities.filter((c) => c.alive);
      let tx: number, ty: number;
      if (aliveCities.length > 0) {
        const target = aliveCities[Math.floor(Math.random() * aliveCities.length)];
        tx = target.x + CITY_W / 2;
        ty = GROUND_Y;
      } else {
        tx = offsetX + HALF / 2;
        ty = GROUND_Y;
      }
      const sx = offsetX + 30 + Math.random() * (HALF - 60);
      const speed = 0.8 + waveNum * 0.25 + Math.random() * 0.4;
      return { sx, sy: -10, tx, ty, x: sx, y: -10, speed, alive: true, hit: false, trail: [] };
    }

    // -- Drawing helpers -----------------------------------------------------
    function drawGround() {
      // Player side ground
      ctx.fillStyle = "#0d2a2a";
      ctx.fillRect(0, GROUND_Y, HALF, GROUND_H);
      // AI side ground
      ctx.fillStyle = "#1a0d2a";
      ctx.fillRect(HALF, GROUND_Y, HALF, GROUND_H);

      // Divider line
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(HALF, 0);
      ctx.lineTo(HALF, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawCity(c: City, color: string) {
      if (c.alive) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        // Draw a small building silhouette
        const bx = c.x;
        const by = GROUND_Y - CITY_H;
        // Main block
        ctx.fillRect(bx + 4, by + 4, 16, CITY_H - 4);
        // Left tower
        ctx.fillRect(bx, by + 8, 8, CITY_H - 8);
        // Right tower
        ctx.fillRect(bx + 14, by, 10, CITY_H);
        // Windows (dark)
        ctx.fillStyle = BG;
        ctx.shadowBlur = 0;
        for (let wx = bx + 6; wx < bx + 18; wx += 5) {
          for (let wy = by + 7; wy < GROUND_Y - 4; wy += 5) {
            ctx.fillRect(wx, wy, 2, 2);
          }
        }
      } else {
        // Rubble
        ctx.fillStyle = "rgba(128,128,128,0.4)";
        ctx.shadowBlur = 0;
        const bx = c.x;
        const by = GROUND_Y;
        ctx.fillRect(bx + 2, by - 3, 20, 3);
        ctx.fillRect(bx + 6, by - 5, 12, 2);
        ctx.fillRect(bx + 9, by - 7, 6, 2);
      }
      ctx.shadowBlur = 0;
    }

    function drawBattery(x: number, color: string, ammo: number) {
      const bx = x - BATTERY_W / 2;
      const by = GROUND_Y - BATTERY_H;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      // Base
      ctx.fillRect(bx, by + 6, BATTERY_W, BATTERY_H - 6);
      // Turret
      ctx.fillRect(bx + 6, by, 8, 8);
      // Barrel
      ctx.fillRect(bx + 8, by - 4, 4, 6);
      ctx.shadowBlur = 0;

      // Ammo dots
      ctx.fillStyle = color;
      const dotsPerRow = 8;
      for (let i = 0; i < ammo && i < 30; i++) {
        const row = Math.floor(i / dotsPerRow);
        const col = i % dotsPerRow;
        ctx.fillRect(bx - 10 + col * 5, by + BATTERY_H + 6 + row * 5, 3, 3);
      }
    }

    function drawEnemyMissile(m: EnemyMissile) {
      if (!m.alive && !m.hit) return;
      // Trail
      ctx.strokeStyle = ENEMY_MISSILE_COLOR;
      ctx.shadowColor = ENEMY_MISSILE_COLOR;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.sx, m.sy);
      if (m.trail.length > 0) {
        for (const p of m.trail) {
          ctx.lineTo(p.x, p.y);
        }
      }
      if (m.alive) {
        ctx.lineTo(m.x, m.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Warhead
      if (m.alive) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = ENEMY_MISSILE_COLOR;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function drawCounterMissile(m: CounterMissile) {
      if (!m.alive) return;
      const color = m.side === "player" ? PLAYER_COLOR : AI_COLOR;
      // Trail
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.sx, m.sy);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Head
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawExplosion(ex: Explosion) {
      if (!ex.alive) return;
      const t = ex.r / ex.maxR;
      for (let i = EXPLOSION_COLORS.length - 1; i >= 0; i--) {
        const frac = (i + 1) / EXPLOSION_COLORS.length;
        ctx.fillStyle = EXPLOSION_COLORS[i];
        ctx.globalAlpha = 0.3 + 0.5 * (1 - t);
        ctx.shadowColor = EXPLOSION_COLORS[i];
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, ex.r * frac, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    function drawBorder() {
      ctx.strokeStyle = "rgba(255,0,255,0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);
    }

    function drawHUD() {
      ctx.font = '12px "Courier New", monospace';
      ctx.textAlign = "left";

      // Player side label
      ctx.fillStyle = PLAYER_COLOR;
      ctx.shadowColor = PLAYER_COLOR;
      ctx.shadowBlur = 6;
      ctx.fillText("YOU", 10, 16);
      ctx.shadowBlur = 0;

      // AI side label
      ctx.fillStyle = AI_COLOR;
      ctx.shadowColor = AI_COLOR;
      ctx.shadowBlur = 6;
      ctx.textAlign = "right";
      ctx.fillText("CPU", W - 10, 16);
      ctx.shadowBlur = 0;

      // Wave number centered
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(`WAVE ${currentWave} / ${MAX_WAVES}`, W / 2, 16);

      // Scores
      ctx.textAlign = "left";
      ctx.fillStyle = PLAYER_COLOR;
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(`SCORE: ${pScore}`, 10, 30);
      ctx.fillText(`AMMO: ${pAmmo}`, 10, 42);

      ctx.textAlign = "right";
      ctx.fillStyle = AI_COLOR;
      ctx.fillText(`SCORE: ${aScore}`, W - 10, 30);
      ctx.fillText(`AMMO: ${aAmmo}`, W - 10, 42);

      // Cities count
      const pAlive = pCities.filter((c) => c.alive).length;
      const aAlive = aCities.filter((c) => c.alive).length;
      ctx.textAlign = "left";
      ctx.fillStyle = PLAYER_COLOR;
      ctx.fillText(`CITIES: ${pAlive}`, 10, 54);
      ctx.textAlign = "right";
      ctx.fillStyle = AI_COLOR;
      ctx.fillText(`CITIES: ${aAlive}`, W - 10, 54);
    }

    function drawWaveAnnouncement(text: string) {
      ctx.font = '28px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 20;
      ctx.fillText(text, W / 2, H / 2);
      ctx.shadowBlur = 0;
    }

    // -- Update helpers ------------------------------------------------------
    function moveEnemyMissile(m: EnemyMissile) {
      if (!m.alive) return;
      const dx = m.tx - m.sx;
      const dy = m.ty - m.sy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / d) * m.speed;
      const vy = (dy / d) * m.speed;
      m.trail.push({ x: m.x, y: m.y });
      m.x += vx;
      m.y += vy;
      // Check if arrived at target
      if (m.y >= m.ty) {
        m.alive = false;
        m.hit = true;
      }
    }

    function moveCounterMissile(m: CounterMissile) {
      if (!m.alive || m.arrived) return;
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < m.speed) {
        m.x = m.tx;
        m.y = m.ty;
        m.arrived = true;
        m.alive = false;
        // Create explosion
        explosions.push({
          x: m.tx,
          y: m.ty,
          r: 2,
          maxR: EXPLOSION_MAX_R,
          growing: true,
          alive: true,
          side: m.side,
        });
      } else {
        m.x += (dx / d) * m.speed;
        m.y += (dy / d) * m.speed;
      }
    }

    function updateExplosion(ex: Explosion) {
      if (!ex.alive) return;
      if (ex.growing) {
        ex.r += EXPLOSION_GROW_RATE;
        if (ex.r >= ex.maxR) {
          ex.growing = false;
        }
      } else {
        ex.r -= EXPLOSION_SHRINK_RATE;
        if (ex.r <= 0) {
          ex.alive = false;
        }
      }
    }

    function checkExplosionKills(enemyList: EnemyMissile[], scoreSetter: "player" | "ai") {
      for (const ex of explosions) {
        if (!ex.alive) continue;
        for (const m of enemyList) {
          if (!m.alive) continue;
          if (dist(m.x, m.y, ex.x, ex.y) < ex.r + 3) {
            m.alive = false;
            if (scoreSetter === "player") {
              pScore += POINTS_PER_KILL;
              setPlayerScore(pScore);
            } else {
              aScore += POINTS_PER_KILL;
              setAiScore(aScore);
            }
          }
        }
      }
    }

    function checkCityHits(enemyList: EnemyMissile[], cities: City[]) {
      for (const m of enemyList) {
        if (!m.hit) continue;
        m.hit = false; // consume the hit event
        // Small ground impact explosion regardless
        explosions.push({
          x: m.x,
          y: m.y,
          r: 2,
          maxR: 15,
          growing: true,
          alive: true,
          side: "player",
        });
        for (const c of cities) {
          if (!c.alive) continue;
          if (Math.abs(m.x - (c.x + CITY_W / 2)) < CITY_W + 4) {
            c.alive = false;
            break;
          }
        }
      }
    }

    function firePlayerCounter(tx: number, ty: number) {
      if (pAmmo <= 0) return;
      if (tx > HALF || ty > GROUND_Y - 20) return; // must click in player's sky
      pAmmo -= 1;
      setPlayerAmmo(pAmmo);
      const bx = BATTERY_X_OFFSET;
      const by = GROUND_Y - BATTERY_H - 4;
      counterMissiles.push({
        sx: bx,
        sy: by,
        tx,
        ty: Math.max(20, ty),
        x: bx,
        y: by,
        speed: COUNTER_MISSILE_SPEED,
        alive: true,
        arrived: false,
        side: "player",
      });
    }

    function aiFireCounter() {
      if (aAmmo <= 0) return;
      // Find nearest alive enemy missile on AI's side
      let bestM: EnemyMissile | null = null;
      let bestDist = Infinity;
      const batteryX = HALF + BATTERY_X_OFFSET;
      const batteryY = GROUND_Y - BATTERY_H - 4;
      for (const m of enemyMissilesAI) {
        if (!m.alive) continue;
        if (m.y < 20) continue; // too high, wait
        const d = dist(m.x, m.y, batteryX, batteryY);
        if (d < bestDist) {
          bestDist = d;
          bestM = m;
        }
      }
      if (!bestM) return;

      aAmmo -= 1;
      setAiAmmo(aAmmo);

      // AI aims slightly ahead of the missile with some inaccuracy
      const leadFrames = 15 + Math.random() * 10;
      const dx = bestM.tx - bestM.sx;
      const dy = bestM.ty - bestM.sy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const mvx = (dx / d) * bestM.speed;
      const mvy = (dy / d) * bestM.speed;

      let aimX = bestM.x + mvx * leadFrames;
      let aimY = bestM.y + mvy * leadFrames;

      // Inaccuracy
      const inaccuracy = 20 + Math.random() * 15;
      aimX += (Math.random() - 0.5) * inaccuracy;
      aimY += (Math.random() - 0.5) * inaccuracy;

      // Clamp to AI's side
      aimX = Math.max(HALF + 10, Math.min(W - 10, aimX));
      aimY = Math.max(20, Math.min(GROUND_Y - 30, aimY));

      counterMissiles.push({
        sx: batteryX,
        sy: batteryY,
        tx: aimX,
        ty: aimY,
        x: batteryX,
        y: batteryY,
        speed: COUNTER_MISSILE_SPEED,
        alive: true,
        arrived: false,
        side: "ai",
      });
    }

    // -- Setup first wave ----------------------------------------------------
    setupWave(1);

    // -- Game loop ------------------------------------------------------------
    const tick = () => {
      if (gameOver) return;

      // -- Process clicks ----------------------------------------------------
      if (!paused) {
        const clicks = clickQueueRef.current.splice(0);
        for (const c of clicks) {
          if (c.x < HALF && c.y < GROUND_Y - 20) {
            firePlayerCounter(c.x, c.y);
          }
        }
      }

      if (!paused && !waveComplete) {
        // -- Spawn enemy missiles gradually ----------------------------------
        const spawnRate = Math.max(15, 45 - currentWave * 5);
        if (spawnedPlayer < waveEnemyCountPlayer) {
          spawnTimerPlayer++;
          if (spawnTimerPlayer >= spawnRate) {
            spawnTimerPlayer = 0;
            if (pCities.some((c) => c.alive)) {
              enemyMissilesPlayer.push(createEnemyMissile("player", currentWave));
            }
            spawnedPlayer++;
          }
        }
        if (spawnedAI < waveEnemyCountAI) {
          spawnTimerAI++;
          if (spawnTimerAI >= spawnRate) {
            spawnTimerAI = 0;
            if (aCities.some((c) => c.alive)) {
              enemyMissilesAI.push(createEnemyMissile("ai", currentWave));
            }
            spawnedAI++;
          }
        }

        // -- AI fires counter-missiles ----------------------------------------
        aiFireCooldown--;
        if (aiFireCooldown <= 0 && aAmmo > 0) {
          const aliveEnemies = enemyMissilesAI.filter((m) => m.alive && m.y > 40);
          if (aliveEnemies.length > 0) {
            // Fire probability scales with wave and danger
            const dangerClose = aliveEnemies.some((m) => m.y > GROUND_Y * 0.5);
            if (dangerClose || Math.random() < 0.4) {
              aiFireCounter();
              aiFireCooldown = 20 + Math.floor(Math.random() * 25);
            } else {
              aiFireCooldown = 10;
            }
          }
        }

        // -- Move enemy missiles ----------------------------------------------
        for (const m of enemyMissilesPlayer) moveEnemyMissile(m);
        for (const m of enemyMissilesAI) moveEnemyMissile(m);

        // -- Move counter missiles --------------------------------------------
        for (const m of counterMissiles) moveCounterMissile(m);

        // -- Update explosions ------------------------------------------------
        for (const ex of explosions) updateExplosion(ex);

        // -- Check kills (player explosions kill player-side enemies) ----------
        checkExplosionKills(
          enemyMissilesPlayer,
          "player"
        );
        checkExplosionKills(
          enemyMissilesAI,
          "ai"
        );

        // -- Check city hits --------------------------------------------------
        checkCityHits(enemyMissilesPlayer, pCities);
        checkCityHits(enemyMissilesAI, aCities);

        // Update city counts
        setPlayerCities(pCities.filter((c) => c.alive).length);
        setAiCities(aCities.filter((c) => c.alive).length);

        // -- Check game over --------------------------------------------------
        const pAlive = pCities.filter((c) => c.alive).length;
        const aAlive = aCities.filter((c) => c.alive).length;

        if (pAlive === 0) {
          gameOver = true;
          gameOverRef.current = true;
          onGameEnd(false);
          return;
        }
        if (aAlive === 0) {
          gameOver = true;
          gameOverRef.current = true;
          onGameEnd(true);
          return;
        }

        // -- Check wave end ---------------------------------------------------
        const allPlayerEnemiesDone =
          spawnedPlayer >= waveEnemyCountPlayer &&
          enemyMissilesPlayer.every((m) => !m.alive);
        const allAIEnemiesDone =
          spawnedAI >= waveEnemyCountAI &&
          enemyMissilesAI.every((m) => !m.alive);
        const allCounterDone = counterMissiles.every((m) => !m.alive);
        const allExplosionsDone = explosions.every((ex) => !ex.alive);

        if (
          allPlayerEnemiesDone &&
          allAIEnemiesDone &&
          allCounterDone &&
          allExplosionsDone
        ) {
          waveComplete = true;

          // Bonus points for surviving cities
          const pCityBonus = pCities.filter((c) => c.alive).length * POINTS_PER_CITY_BONUS;
          const aCityBonus = aCities.filter((c) => c.alive).length * POINTS_PER_CITY_BONUS;
          pScore += pCityBonus;
          aScore += aCityBonus;
          setPlayerScore(pScore);
          setAiScore(aScore);
        }
      }

      // -- Wave transition ---------------------------------------------------
      if (waveComplete && !paused) {
        waveEndTimer++;
        if (waveEndTimer > 120) {
          if (currentWave >= MAX_WAVES) {
            // Game over after last wave - compare cities
            const pAlive = pCities.filter((c) => c.alive).length;
            const aAlive = aCities.filter((c) => c.alive).length;
            gameOver = true;
            gameOverRef.current = true;
            if (pAlive > aAlive) {
              onGameEnd(true);
            } else if (aAlive > pAlive) {
              onGameEnd(false);
            } else {
              // Tie: compare scores
              onGameEnd(pScore >= aScore);
            }
            return;
          }
          // Next wave
          currentWave++;
          setWave(currentWave);
          enemyMissilesPlayer = [];
          enemyMissilesAI = [];
          counterMissiles = [];
          explosions = [];
          setupWave(currentWave);
        }
      }

      // -- Draw ----------------------------------------------------------------
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Stars
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      const starSeed = 42;
      for (let i = 0; i < 50; i++) {
        const sx = ((starSeed * (i + 1) * 137) % W);
        const sy = ((starSeed * (i + 1) * 251) % (GROUND_Y - 60));
        ctx.fillRect(sx, sy, 1, 1);
      }

      drawGround();

      // Draw cities
      for (const c of pCities) drawCity(c, PLAYER_COLOR);
      for (const c of aCities) drawCity(c, AI_COLOR);

      // Draw batteries
      drawBattery(BATTERY_X_OFFSET, PLAYER_COLOR, pAmmo);
      drawBattery(HALF + BATTERY_X_OFFSET, AI_COLOR, aAmmo);

      // Draw enemy missiles
      for (const m of enemyMissilesPlayer) drawEnemyMissile(m);
      for (const m of enemyMissilesAI) drawEnemyMissile(m);

      // Draw counter missiles
      for (const m of counterMissiles) drawCounterMissile(m);

      // Draw explosions
      for (const ex of explosions) drawExplosion(ex);

      drawBorder();
      drawHUD();

      // Wave announcement
      if (waveComplete && waveEndTimer < 120) {
        if (currentWave >= MAX_WAVES) {
          drawWaveAnnouncement("FINAL WAVE COMPLETE");
        } else {
          drawWaveAnnouncement(`WAVE ${currentWave} COMPLETE`);
        }
        // Show city bonus text
        ctx.font = '12px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        const pAlive = pCities.filter((c) => c.alive).length;
        const aAlive = aCities.filter((c) => c.alive).length;
        ctx.fillText(
          `CITY BONUS: YOU +${pAlive * POINTS_PER_CITY_BONUS}  CPU +${aAlive * POINTS_PER_CITY_BONUS}`,
          W / 2,
          H / 2 + 30
        );
      }

      // Countdown overlay
      if (paused && countVal > 0) {
        ctx.font = '72px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 30;
        ctx.fillText(String(countVal), W / 2, H / 2 + 20);
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // -- Cleanup -------------------------------------------------------------
    return () => {
      clearInterval(countdownInterval);
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("click", onClick);
      canvas.style.cursor = "default";
      gameOver = true;
    };
  }, [buildCities, onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scoreboard overlay */}
      <div className="flex items-center gap-6 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-[#00ffff] glow-cyan font-bold text-sm">{playerScore}</span>
          <span className="text-[var(--text-muted)]">YOU</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">WAVE</span>
          <span className="text-white font-bold text-sm">{wave}/{MAX_WAVES}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">CPU</span>
          <span className="text-[#ff00ff] glow-magenta font-bold text-sm">{aiScore}</span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 text-[8px]">
        <div className="flex items-center gap-3">
          <span className="text-[#00ffff]">AMMO: {playerAmmo}</span>
          <span className="text-[#00ffff]">CITIES: {playerCities}</span>
        </div>
        <div className="w-px h-3 bg-[var(--border-color)]" />
        <div className="flex items-center gap-3">
          <span className="text-[#ff00ff]">CITIES: {aiCities}</span>
          <span className="text-[#ff00ff]">AMMO: {aiAmmo}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block max-w-full h-auto border border-[#ff00ff]/20"
          style={{ imageRendering: "pixelated" }}
        />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-white text-6xl font-bold animate-pulse" style={{ textShadow: "0 0 30px #fff" }}>
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        CLICK ON YOUR SIDE TO FIRE COUNTER-MISSILE
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

export default function MissileCommandPage() {
  return (
    <GameWrapper title="MISSILE COMMAND" color="magenta">
      {({ mode, onGameEnd }) => (
        <MissileCommandGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
