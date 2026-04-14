"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_W = 400;
const CANVAS_H = 600;
const MALLET_R = 25;
const PUCK_R = 15;
const GOAL_W = 120;
const WALL_T = 6; // wall thickness
const WIN_SCORE = 7;
const FRICTION = 0.997;
const MAX_PUCK_SPEED = 14;
const PUCK_TRANSFER = 0.7; // how much mallet velocity transfers to puck
const AI_SPEED = 4.5;
const AI_STRIKE_SPEED = 7;
const TRAIL_LENGTH = 8;

const BG = "#0a0a1a";
const TABLE_BG = "#0f0f2a";
const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const PUCK_COLOR = "#ffffaa";
const BORDER_COLOR = "#00ffff";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Vec2 {
  x: number;
  y: number;
}

interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Vec2[];
}

interface Mallet {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function capSpeed(vx: number, vy: number, max: number): [number, number] {
  const spd = Math.sqrt(vx * vx + vy * vy);
  if (spd > max) {
    const scale = max / spd;
    return [vx * scale, vy * scale];
  }
  return [vx, vy];
}

// ---------------------------------------------------------------------------
// AirHockeyGame component
// ---------------------------------------------------------------------------

function AirHockeyGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const gameOverRef = useRef(false);
  const mouseRef = useRef<Vec2>({ x: CANVAS_W / 2, y: CANVAS_H * 0.75 });

  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(3);

  // -----------------------------------------------------------------------
  // Reset puck to center
  // -----------------------------------------------------------------------

  const resetPuck = useCallback((): Puck => {
    return {
      x: CANVAS_W / 2,
      y: CANVAS_H / 2,
      vx: 0,
      vy: 0,
      trail: [],
    };
  }, []);

  // -----------------------------------------------------------------------
  // Main game loop
  // -----------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // -- State --
    let pScore = 0;
    let aScore = 0;
    let puck: Puck = resetPuck();
    const player: Mallet = {
      x: CANVAS_W / 2,
      y: CANVAS_H * 0.8,
      prevX: CANVAS_W / 2,
      prevY: CANVAS_H * 0.8,
    };
    const ai: Mallet = {
      x: CANVAS_W / 2,
      y: CANVAS_H * 0.2,
      prevX: CANVAS_W / 2,
      prevY: CANVAS_H * 0.2,
    };
    let paused = true;
    let scorePause = 0; // frames to pause after scoring
    let flash = 0;
    let flashColor = CYAN;

    // Goal boundaries
    const goalLeft = (CANVAS_W - GOAL_W) / 2;
    const goalRight = (CANVAS_W + GOAL_W) / 2;

    // -- Countdown --
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

    // -- Mouse input --
    const getCanvasPos = (e: MouseEvent | TouchEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = getCanvasPos(e);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      mouseRef.current = getCanvasPos(e);
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      mouseRef.current = getCanvasPos(e);
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });

    // -----------------------------------------------------------------------
    // Drawing
    // -----------------------------------------------------------------------

    const drawTable = () => {
      // Table surface
      ctx.fillStyle = TABLE_BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Neon border with goals cut out
      ctx.strokeStyle = BORDER_COLOR;
      ctx.shadowColor = BORDER_COLOR;
      ctx.shadowBlur = 10;
      ctx.lineWidth = WALL_T;

      // Left wall
      ctx.beginPath();
      ctx.moveTo(WALL_T / 2, 0);
      ctx.lineTo(WALL_T / 2, CANVAS_H);
      ctx.stroke();

      // Right wall
      ctx.beginPath();
      ctx.moveTo(CANVAS_W - WALL_T / 2, 0);
      ctx.lineTo(CANVAS_W - WALL_T / 2, CANVAS_H);
      ctx.stroke();

      // Top wall (with goal gap)
      ctx.beginPath();
      ctx.moveTo(0, WALL_T / 2);
      ctx.lineTo(goalLeft, WALL_T / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(goalRight, WALL_T / 2);
      ctx.lineTo(CANVAS_W, WALL_T / 2);
      ctx.stroke();

      // Bottom wall (with goal gap)
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H - WALL_T / 2);
      ctx.lineTo(goalLeft, CANVAS_H - WALL_T / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(goalRight, CANVAS_H - WALL_T / 2);
      ctx.lineTo(CANVAS_W, CANVAS_H - WALL_T / 2);
      ctx.stroke();

      // Goal areas (darker recesses)
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(goalLeft, 0, GOAL_W, WALL_T + 4);
      ctx.fillRect(goalLeft, CANVAS_H - WALL_T - 4, GOAL_W, WALL_T + 4);

      // Goal markers
      ctx.shadowBlur = 6;
      ctx.strokeStyle = MAGENTA;
      ctx.shadowColor = MAGENTA;
      ctx.lineWidth = 2;
      // Top goal
      ctx.beginPath();
      ctx.moveTo(goalLeft, 0);
      ctx.lineTo(goalLeft, WALL_T + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(goalRight, 0);
      ctx.lineTo(goalRight, WALL_T + 6);
      ctx.stroke();
      // Bottom goal
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.beginPath();
      ctx.moveTo(goalLeft, CANVAS_H);
      ctx.lineTo(goalLeft, CANVAS_H - WALL_T - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(goalRight, CANVAS_H);
      ctx.lineTo(goalRight, CANVAS_H - WALL_T - 6);
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Center line
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = "rgba(0,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(WALL_T, CANVAS_H / 2);
      ctx.lineTo(CANVAS_W - WALL_T, CANVAS_H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center circle
      ctx.strokeStyle = "rgba(0,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 50, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = "rgba(0,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(CANVAS_W / 2, CANVAS_H / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawMallet = (m: Mallet, color: string) => {
      // Outer glow
      ctx.beginPath();
      ctx.arc(m.x, m.y, MALLET_R + 4, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.1);
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fill();

      // Mallet body
      ctx.beginPath();
      ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.stroke();

      // Inner circle
      ctx.beginPath();
      ctx.arc(m.x, m.y, MALLET_R * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowBlur = 8;
      ctx.fill();

      ctx.shadowBlur = 0;
    };

    const drawPuckTrail = (p: Puck) => {
      for (let i = 0; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.4;
        const radius = PUCK_R * (0.3 + (i / p.trail.length) * 0.7);
        ctx.beginPath();
        ctx.arc(p.trail[i].x, p.trail[i].y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,170,${alpha})`;
        ctx.fill();
      }
    };

    const drawPuck = (p: Puck) => {
      drawPuckTrail(p);

      // Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, PUCK_R + 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,170,0.08)";
      ctx.shadowColor = PUCK_COLOR;
      ctx.shadowBlur = 25;
      ctx.fill();

      // Puck body
      ctx.beginPath();
      ctx.arc(p.x, p.y, PUCK_R, 0, Math.PI * 2);
      ctx.fillStyle = PUCK_COLOR;
      ctx.shadowColor = PUCK_COLOR;
      ctx.shadowBlur = 18;
      ctx.fill();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 3, PUCK_R * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.shadowBlur = 0;
      ctx.fill();

      ctx.shadowBlur = 0;
    };

    // -----------------------------------------------------------------------
    // Physics
    // -----------------------------------------------------------------------

    const collideMalletPuck = (m: Mallet, p: Puck) => {
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minDist = MALLET_R + PUCK_R;

      if (d < minDist && d > 0) {
        // Separate
        const overlap = minDist - d;
        const nx = dx / d;
        const ny = dy / d;
        p.x += nx * overlap;
        p.y += ny * overlap;

        // Mallet velocity
        const mvx = m.x - m.prevX;
        const mvy = m.y - m.prevY;

        // Reflect puck velocity along collision normal
        const relVx = p.vx - mvx;
        const relVy = p.vy - mvy;
        const dot = relVx * nx + relVy * ny;

        // Only resolve if objects are approaching
        if (dot < 0) {
          p.vx -= 2 * dot * nx;
          p.vy -= 2 * dot * ny;
        }

        // Add mallet velocity transfer
        p.vx += mvx * PUCK_TRANSFER;
        p.vy += mvy * PUCK_TRANSFER;

        // Speed boost from mallet movement speed
        const malletSpeed = Math.sqrt(mvx * mvx + mvy * mvy);
        const boost = 1 + malletSpeed * 0.15;
        p.vx *= boost;
        p.vy *= boost;

        // Cap speed
        [p.vx, p.vy] = capSpeed(p.vx, p.vy, MAX_PUCK_SPEED);
      }
    };

    const wallBounce = (p: Puck) => {
      const left = WALL_T + PUCK_R;
      const right = CANVAS_W - WALL_T - PUCK_R;
      const top = WALL_T + PUCK_R;
      const bottom = CANVAS_H - WALL_T - PUCK_R;

      // Left wall
      if (p.x < left) {
        p.x = left;
        p.vx = Math.abs(p.vx) * 0.9;
      }
      // Right wall
      if (p.x > right) {
        p.x = right;
        p.vx = -Math.abs(p.vx) * 0.9;
      }

      // Top wall / goal
      if (p.y < top) {
        if (p.x >= goalLeft && p.x <= goalRight) {
          // In goal area - check if fully past
          if (p.y < -PUCK_R) {
            return "top_goal";
          }
        } else {
          p.y = top;
          p.vy = Math.abs(p.vy) * 0.9;
        }
      }

      // Bottom wall / goal
      if (p.y > bottom) {
        if (p.x >= goalLeft && p.x <= goalRight) {
          if (p.y > CANVAS_H + PUCK_R) {
            return "bottom_goal";
          }
        } else {
          p.y = bottom;
          p.vy = -Math.abs(p.vy) * 0.9;
        }
      }

      // Goal post collisions (treat them as point obstacles)
      const goalPosts = [
        { x: goalLeft, y: WALL_T / 2 },
        { x: goalRight, y: WALL_T / 2 },
        { x: goalLeft, y: CANVAS_H - WALL_T / 2 },
        { x: goalRight, y: CANVAS_H - WALL_T / 2 },
      ];
      for (const post of goalPosts) {
        const dx = p.x - post.x;
        const dy = p.y - post.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < PUCK_R + 3) {
          const nx = dx / d;
          const ny = dy / d;
          p.x = post.x + nx * (PUCK_R + 3);
          p.y = post.y + ny * (PUCK_R + 3);
          const dot = p.vx * nx + p.vy * ny;
          p.vx -= 2 * dot * nx;
          p.vy -= 2 * dot * ny;
          p.vx *= 0.85;
          p.vy *= 0.85;
        }
      }

      return null;
    };

    // -----------------------------------------------------------------------
    // AI
    // -----------------------------------------------------------------------

    const updateAI = (p: Puck) => {
      const targetX = CANVAS_W / 2;
      const defensiveY = CANVAS_H * 0.18;
      let destX: number;
      let destY: number;
      let speed = AI_SPEED;

      if (p.y < CANVAS_H / 2) {
        // Puck on AI side: chase it
        destX = p.x;
        destY = p.y - 30; // slightly behind puck to strike it downward
        destY = Math.max(WALL_T + MALLET_R, destY);

        // If puck is heading toward AI goal, be more aggressive
        if (p.vy < -2) {
          speed = AI_STRIKE_SPEED;
          destY = p.y + p.vy * 3; // predict
          destY = clamp(destY, WALL_T + MALLET_R, CANVAS_H / 2 - MALLET_R);
          destX = p.x + p.vx * 3;
          destX = clamp(destX, WALL_T + MALLET_R, CANVAS_W - WALL_T - MALLET_R);
        }
      } else {
        // Puck on player side: return to defensive position
        destX = targetX;
        destY = defensiveY;
        speed = AI_SPEED * 0.7;
      }

      // Constrain destination to AI half
      destY = clamp(destY, WALL_T + MALLET_R, CANVAS_H / 2 - MALLET_R);
      destX = clamp(destX, WALL_T + MALLET_R, CANVAS_W - WALL_T - MALLET_R);

      // Move toward destination
      const dx = destX - ai.x;
      const dy = destY - ai.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d > 1) {
        const moveX = (dx / d) * Math.min(speed, d);
        const moveY = (dy / d) * Math.min(speed, d);
        ai.prevX = ai.x;
        ai.prevY = ai.y;
        ai.x += moveX;
        ai.y += moveY;
      } else {
        ai.prevX = ai.x;
        ai.prevY = ai.y;
      }
    };

    // -----------------------------------------------------------------------
    // Tick
    // -----------------------------------------------------------------------

    const tick = () => {
      if (gameOverRef.current) return;

      // -- Player mallet follows mouse, constrained to bottom half --
      player.prevX = player.x;
      player.prevY = player.y;
      const targetX = clamp(
        mouseRef.current.x,
        WALL_T + MALLET_R,
        CANVAS_W - WALL_T - MALLET_R
      );
      const targetY = clamp(
        mouseRef.current.y,
        CANVAS_H / 2 + MALLET_R,
        CANVAS_H - WALL_T - MALLET_R
      );
      // Smooth follow for slightly less twitchy feel
      player.x += (targetX - player.x) * 0.6;
      player.y += (targetY - player.y) * 0.6;

      if (!paused && scorePause <= 0) {
        // -- AI --
        updateAI(puck);

        // -- Puck physics --
        puck.vx *= FRICTION;
        puck.vy *= FRICTION;

        // Stop jitter when nearly still
        if (Math.abs(puck.vx) < 0.05) puck.vx = 0;
        if (Math.abs(puck.vy) < 0.05) puck.vy = 0;

        puck.x += puck.vx;
        puck.y += puck.vy;

        // Trail
        puck.trail.push({ x: puck.x, y: puck.y });
        if (puck.trail.length > TRAIL_LENGTH) {
          puck.trail.shift();
        }

        // Wall collisions
        const goal = wallBounce(puck);

        // Mallet collisions
        collideMalletPuck(player, puck);
        collideMalletPuck(ai, puck);

        // Scoring
        if (goal === "bottom_goal") {
          // AI scores (puck went into player's goal)
          aScore += 1;
          setAiScore(aScore);
          flash = 15;
          flashColor = MAGENTA;
          if (aScore >= WIN_SCORE) {
            gameOverRef.current = true;
            onGameEnd(false);
            return;
          }
          puck = resetPuck();
          puck.vy = -2; // serve toward AI
          scorePause = 45;
        } else if (goal === "top_goal") {
          // Player scores
          pScore += 1;
          setPlayerScore(pScore);
          flash = 15;
          flashColor = CYAN;
          if (pScore >= WIN_SCORE) {
            gameOverRef.current = true;
            onGameEnd(true);
            return;
          }
          puck = resetPuck();
          puck.vy = 2; // serve toward player
          scorePause = 45;
        }
      } else if (scorePause > 0) {
        scorePause -= 1;
        // Keep AI still during pause
        ai.prevX = ai.x;
        ai.prevY = ai.y;
      }

      // ---------------------------------------------------------------
      // Draw
      // ---------------------------------------------------------------
      // Background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Flash on score
      if (flash > 0) {
        ctx.fillStyle =
          flashColor === CYAN
            ? `rgba(0,255,255,${flash * 0.008})`
            : `rgba(255,0,255,${flash * 0.008})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        flash -= 1;
      }

      drawTable();
      drawPuck(puck);
      drawMallet(player, CYAN);
      drawMallet(ai, MAGENTA);

      // Countdown overlay
      if (paused && countVal > 0) {
        ctx.font = 'bold 72px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = CYAN;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = 40;
        ctx.fillText(String(countVal), CANVAS_W / 2, CANVAS_H / 2);
        ctx.shadowBlur = 0;
      }

      // Score pause "GOAL!" text
      if (scorePause > 30) {
        ctx.font = 'bold 48px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = flashColor;
        ctx.shadowColor = flashColor;
        ctx.shadowBlur = 30;
        ctx.fillText("GOAL!", CANVAS_W / 2, CANVAS_H / 2);
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Cleanup
    return () => {
      clearInterval(countdownInterval);
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
    };
  }, [resetPuck, onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scoreboard */}
      <div className="flex items-center gap-8 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">YOU</span>
          <span className="text-[#00ffff] glow-cyan text-sm font-bold">
            {playerScore}
          </span>
        </div>
        <span className="text-[var(--text-muted)]">FIRST TO {WIN_SCORE}</span>
        <div className="flex items-center gap-2">
          <span className="text-[#ff00ff] glow-magenta text-sm font-bold">
            {aiScore}
          </span>
          <span className="text-[var(--text-muted)]">CPU</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block max-w-full h-auto border border-[#00ffff]/20 cursor-none"
          style={{ imageRendering: "auto" }}
        />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[#00ffff] glow-cyan text-6xl font-bold animate-pulse">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        MOVE MOUSE TO CONTROL
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

export default function AirHockeyPage() {
  return (
    <GameWrapper title="AIR HOCKEY" color="cyan">
      {({ mode, onGameEnd }) => (
        <AirHockeyGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
