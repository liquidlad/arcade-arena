"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_W = 700;
const CANVAS_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 80;
const BALL_SIZE = 10;
const PADDLE_SPEED = 6;
const BALL_BASE_SPEED = 5;
const WIN_SCORE = 5;
const NET_DASH = 10;
const NET_GAP = 8;
const AI_REACTION_SPEED = 0.04; // lower = easier, higher = harder

const NEON = "#00ff41";
const BG = "#0a0a1a";
const DIM = "rgba(0,255,65,0.15)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

interface Paddle {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// PongGame component
// ---------------------------------------------------------------------------

function PongGame({
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

  // Score state for the overlay UI
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(3);

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const resetBall = useCallback((): Ball => {
    const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8; // +-22.5 deg
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      x: CANVAS_W / 2,
      y: CANVAS_H / 2,
      vx: Math.cos(angle) * BALL_BASE_SPEED * dir,
      vy: Math.sin(angle) * BALL_BASE_SPEED,
      speed: BALL_BASE_SPEED,
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

    // State ------------------------------------------------------------------
    let pScore = 0;
    let aScore = 0;
    let ball: Ball = resetBall();
    const player: Paddle = {
      x: 20,
      y: CANVAS_H / 2 - PADDLE_H / 2,
      w: PADDLE_W,
      h: PADDLE_H,
    };
    const ai: Paddle = {
      x: CANVAS_W - 20 - PADDLE_W,
      y: CANVAS_H / 2 - PADDLE_H / 2,
      w: PADDLE_W,
      h: PADDLE_H,
    };
    let aiTargetY = CANVAS_H / 2;
    let paused = true; // paused during countdown
    let flash = 0; // screen‑flash timer on score

    // Countdown --------------------------------------------------------------
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

    // Input ------------------------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (
        ["ArrowUp", "ArrowDown", "w", "s", "W", "S"].includes(e.key)
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Draw helpers -----------------------------------------------------------

    const drawRect = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = NEON;
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 12;
      ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
    };

    const drawNet = () => {
      ctx.setLineDash([NET_DASH, NET_GAP]);
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2, 0);
      ctx.lineTo(CANVAS_W / 2, CANVAS_H);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawScore = () => {
      ctx.font = '48px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = DIM;
      ctx.fillText(String(pScore), CANVAS_W / 4, 60);
      ctx.fillText(String(aScore), (CANVAS_W * 3) / 4, 60);
    };

    const drawBall = (b: Ball) => {
      ctx.fillStyle = NEON;
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 18;
      ctx.fillRect(
        b.x - BALL_SIZE / 2,
        b.y - BALL_SIZE / 2,
        BALL_SIZE,
        BALL_SIZE
      );
      ctx.shadowBlur = 0;
    };

    const drawBorder = () => {
      ctx.strokeStyle = NEON;
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2);
      ctx.shadowBlur = 0;
    };

    // Collision --------------------------------------------------------------

    const paddleCollision = (b: Ball, p: Paddle): boolean => {
      return (
        b.x - BALL_SIZE / 2 < p.x + p.w &&
        b.x + BALL_SIZE / 2 > p.x &&
        b.y - BALL_SIZE / 2 < p.y + p.h &&
        b.y + BALL_SIZE / 2 > p.y
      );
    };

    // Game loop --------------------------------------------------------------

    const tick = () => {
      if (gameOverRef.current) return;

      // -- Input -------------------------------------------------------
      const keys = keysRef.current;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) {
        player.y = Math.max(0, player.y - PADDLE_SPEED);
      }
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) {
        player.y = Math.min(CANVAS_H - PADDLE_H, player.y + PADDLE_SPEED);
      }

      if (!paused) {
        // -- AI ----------------------------------------------------------
        // AI targets ball y with a smoothing factor (beatable delay)
        aiTargetY = ball.y - ai.h / 2;
        const diff = aiTargetY - ai.y;
        ai.y += diff * AI_REACTION_SPEED;
        ai.y = Math.max(0, Math.min(CANVAS_H - ai.h, ai.y));

        // -- Ball movement -----------------------------------------------
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Top / bottom bounce
        if (ball.y - BALL_SIZE / 2 <= 0) {
          ball.y = BALL_SIZE / 2;
          ball.vy = Math.abs(ball.vy);
        }
        if (ball.y + BALL_SIZE / 2 >= CANVAS_H) {
          ball.y = CANVAS_H - BALL_SIZE / 2;
          ball.vy = -Math.abs(ball.vy);
        }

        // Paddle collisions
        if (paddleCollision(ball, player) && ball.vx < 0) {
          const hitPos = (ball.y - (player.y + player.h / 2)) / (player.h / 2);
          const angle = hitPos * (Math.PI / 4); // max 45 deg
          ball.speed = Math.min(ball.speed + 0.3, 10);
          ball.vx = Math.cos(angle) * ball.speed;
          ball.vy = Math.sin(angle) * ball.speed;
          ball.x = player.x + player.w + BALL_SIZE / 2;
        }

        if (paddleCollision(ball, ai) && ball.vx > 0) {
          const hitPos = (ball.y - (ai.y + ai.h / 2)) / (ai.h / 2);
          const angle = hitPos * (Math.PI / 4);
          ball.speed = Math.min(ball.speed + 0.3, 10);
          ball.vx = -(Math.cos(angle) * ball.speed);
          ball.vy = Math.sin(angle) * ball.speed;
          ball.x = ai.x - BALL_SIZE / 2;
        }

        // Scoring
        if (ball.x < 0) {
          aScore += 1;
          setAiScore(aScore);
          flash = 12;
          if (aScore >= WIN_SCORE) {
            gameOverRef.current = true;
            onGameEnd(false);
            return;
          }
          ball = resetBall();
        }
        if (ball.x > CANVAS_W) {
          pScore += 1;
          setPlayerScore(pScore);
          flash = 12;
          if (pScore >= WIN_SCORE) {
            gameOverRef.current = true;
            onGameEnd(true);
            return;
          }
          ball = resetBall();
        }
      }

      // -- Draw ----------------------------------------------------------
      // Background (with optional flash)
      if (flash > 0) {
        ctx.fillStyle = `rgba(0,255,65,${flash * 0.01})`;
        flash -= 1;
      } else {
        ctx.fillStyle = BG;
      }
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      drawBorder();
      drawNet();
      drawScore();
      drawRect(player.x, player.y, player.w, player.h);
      drawRect(ai.x, ai.y, ai.w, ai.h);
      drawBall(ball);

      // Countdown text
      if (paused && countVal > 0) {
        ctx.font = '72px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = NEON;
        ctx.shadowColor = NEON;
        ctx.shadowBlur = 30;
        ctx.fillText(String(countVal), CANVAS_W / 2, CANVAS_H / 2 + 20);
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Cleanup ----------------------------------------------------------------
    return () => {
      clearInterval(countdownInterval);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [resetBall, onGameEnd]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Scoreboard overlay */}
      <div className="flex items-center gap-8 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">YOU</span>
          <span className="text-[#00ff41] glow-green text-sm font-bold">
            {playerScore}
          </span>
        </div>
        <span className="text-[var(--text-muted)]">FIRST TO {WIN_SCORE}</span>
        <div className="flex items-center gap-2">
          <span className="text-[#00ff41] glow-green text-sm font-bold">
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
          className="block max-w-full h-auto border border-[#00ff41]/20"
          style={{ imageRendering: "pixelated" }}
        />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[#00ff41] glow-green text-6xl font-bold animate-pulse">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="text-[var(--text-muted)] text-[8px] tracking-widest">
        W / S&nbsp;&nbsp;or&nbsp;&nbsp;ARROWS&nbsp;&nbsp;to move
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

export default function PongPage() {
  return (
    <GameWrapper title="PONG" color="green">
      {({ mode, onGameEnd }) => (
        <PongGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
