"use client";

import { useRef, useEffect, useCallback } from "react";
import GameWrapper from "@/app/components/GameWrapper";

// ── Constants ──────────────────────────────────────────────────────────
const CANVAS_W = 700;
const CANVAS_H = 500;
const HALF_W = CANVAS_W / 2;
const DIVIDER_W = 2;

const PADDLE_W = 70;
const PADDLE_H = 10;
const PADDLE_Y_OFFSET = 30; // from bottom of each field

const BALL_R = 5;
const BALL_SPEED = 4;

const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_W = 34;
const BRICK_H = 12;
const BRICK_PAD = 3;
const BRICK_TOP_OFFSET = 40;
const BRICK_LEFT_OFFSET = (fieldW: number) =>
  (fieldW - (BRICK_COLS * (BRICK_W + BRICK_PAD) - BRICK_PAD)) / 2;

const MAX_LIVES = 3;

const BG = "#0a0a1a";
const PLAYER_COLOR = "#ffff00";
const AI_COLOR = "#ff00ff";

const BRICK_COLORS = ["#ff0055", "#ff00ff", "#00ffff", "#00ff41", "#ffff00"];
const BRICK_POINTS = [50, 40, 30, 20, 10];

// ── Types ──────────────────────────────────────────────────────────────
interface Brick {
  x: number;
  y: number;
  alive: boolean;
  row: number;
}

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  stuck: boolean; // on paddle
}

interface Field {
  paddle: number; // x center
  ball: Ball;
  bricks: Brick[];
  score: number;
  lives: number;
  totalBricks: number;
}

// ── Helpers ────────────────────────────────────────────────────────────
function createBricks(fieldW: number): Brick[] {
  const bricks: Brick[] = [];
  const leftOff = BRICK_LEFT_OFFSET(fieldW);
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: leftOff + c * (BRICK_W + BRICK_PAD),
        y: BRICK_TOP_OFFSET + r * (BRICK_H + BRICK_PAD),
        alive: true,
        row: r,
      });
    }
  }
  return bricks;
}

function createField(fieldW: number): Field {
  const bricks = createBricks(fieldW);
  return {
    paddle: fieldW / 2,
    ball: {
      x: fieldW / 2,
      y: CANVAS_H - PADDLE_Y_OFFSET - PADDLE_H - BALL_R - 1,
      dx: BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
      dy: -BALL_SPEED,
      stuck: true,
    },
    bricks,
    score: 0,
    lives: MAX_LIVES,
    totalBricks: bricks.length,
  };
}

function launchBall(ball: Ball) {
  ball.stuck = false;
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3);
  ball.dx = BALL_SPEED * Math.cos(angle);
  ball.dy = BALL_SPEED * Math.sin(angle);
}

// ── Game Component ─────────────────────────────────────────────────────
function BreakoutGame({
  mode,
  onGameEnd,
}: {
  mode: "practice" | "wager";
  onGameEnd: (won: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOver = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const playerRef = useRef<Field>(createField(HALF_W - DIVIDER_W / 2));
  const aiRef = useRef<Field>(createField(HALF_W - DIVIDER_W / 2));
  const animRef = useRef<number>(0);
  const countdownRef = useRef(3);
  const countdownTimerRef = useRef<number>(0);
  const gameStarted = useRef(false);
  const particles = useRef<Particle[]>([]);

  interface Particle {
    x: number;
    y: number;
    dx: number;
    dy: number;
    life: number;
    color: string;
    side: "left" | "right";
  }

  // ── Input ─────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
      keysRef.current.add(e.key);
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key);
  }, []);

  // ── Update helpers ────────────────────────────────────────────────
  function spawnParticles(
    bx: number,
    by: number,
    color: string,
    side: "left" | "right"
  ) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2;
      particles.current.push({
        x: bx,
        y: by,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 15,
        color,
        side,
      });
    }
  }

  function updateField(
    field: Field,
    paddleTarget: number | null,
    isAI: boolean,
    side: "left" | "right"
  ) {
    const fw = HALF_W - DIVIDER_W / 2;
    const ball = field.ball;

    // Paddle movement
    if (isAI) {
      // AI tracks ball with slight imprecision
      if (!ball.stuck) {
        const aiSpeed = 3.5;
        const offset = Math.sin(Date.now() * 0.003) * 18; // wobble
        const target = ball.x + offset;
        if (field.paddle < target - 3) field.paddle += aiSpeed;
        else if (field.paddle > target + 3) field.paddle -= aiSpeed;
      }
    } else if (paddleTarget !== null) {
      field.paddle = paddleTarget;
    }

    // Clamp paddle
    field.paddle = Math.max(
      PADDLE_W / 2,
      Math.min(fw - PADDLE_W / 2, field.paddle)
    );

    // Ball stuck on paddle
    if (ball.stuck) {
      ball.x = field.paddle;
      ball.y = CANVAS_H - PADDLE_Y_OFFSET - PADDLE_H - BALL_R - 1;
      return;
    }

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall bounces (left, right, top)
    if (ball.x - BALL_R <= 0) {
      ball.x = BALL_R;
      ball.dx = Math.abs(ball.dx);
    }
    if (ball.x + BALL_R >= fw) {
      ball.x = fw - BALL_R;
      ball.dx = -Math.abs(ball.dx);
    }
    if (ball.y - BALL_R <= 0) {
      ball.y = BALL_R;
      ball.dy = Math.abs(ball.dy);
    }

    // Paddle collision
    const paddleTop = CANVAS_H - PADDLE_Y_OFFSET - PADDLE_H;
    const paddleLeft = field.paddle - PADDLE_W / 2;
    const paddleRight = field.paddle + PADDLE_W / 2;
    if (
      ball.dy > 0 &&
      ball.y + BALL_R >= paddleTop &&
      ball.y + BALL_R <= paddleTop + PADDLE_H + 4 &&
      ball.x >= paddleLeft &&
      ball.x <= paddleRight
    ) {
      // Angle based on where ball hits paddle
      const hitPos = (ball.x - paddleLeft) / PADDLE_W; // 0..1
      const angle = -Math.PI / 2 + (hitPos - 0.5) * (Math.PI * 0.7);
      const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      ball.dx = speed * Math.cos(angle);
      ball.dy = speed * Math.sin(angle);
      // Ensure going up
      if (ball.dy > 0) ball.dy = -ball.dy;
      ball.y = paddleTop - BALL_R;
    }

    // Brick collision
    for (const brick of field.bricks) {
      if (!brick.alive) continue;
      const bLeft = brick.x;
      const bRight = brick.x + BRICK_W;
      const bTop = brick.y;
      const bBottom = brick.y + BRICK_H;

      if (
        ball.x + BALL_R > bLeft &&
        ball.x - BALL_R < bRight &&
        ball.y + BALL_R > bTop &&
        ball.y - BALL_R < bBottom
      ) {
        brick.alive = false;
        field.score += BRICK_POINTS[brick.row];
        spawnParticles(
          brick.x + BRICK_W / 2,
          brick.y + BRICK_H / 2,
          BRICK_COLORS[brick.row],
          side
        );

        // Determine collision side
        const overlapLeft = ball.x + BALL_R - bLeft;
        const overlapRight = bRight - (ball.x - BALL_R);
        const overlapTop = ball.y + BALL_R - bTop;
        const overlapBottom = bBottom - (ball.y - BALL_R);
        const minOverlap = Math.min(
          overlapLeft,
          overlapRight,
          overlapTop,
          overlapBottom
        );
        if (minOverlap === overlapTop || minOverlap === overlapBottom) {
          ball.dy = -ball.dy;
        } else {
          ball.dx = -ball.dx;
        }
        break; // one brick per frame
      }
    }

    // Ball lost below paddle
    if (ball.y - BALL_R > CANVAS_H) {
      field.lives--;
      if (field.lives > 0) {
        ball.stuck = true;
        ball.x = field.paddle;
        ball.y = CANVAS_H - PADDLE_Y_OFFSET - PADDLE_H - BALL_R - 1;
        // AI launches again after short delay
        if (isAI) {
          setTimeout(() => {
            if (!gameOver.current && ball.stuck) launchBall(ball);
          }, 600);
        }
      }
    }

    // Speed up ball slightly over time for intensity
    const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    if (speed < 7) {
      const boost = 1.0002;
      ball.dx *= boost;
      ball.dy *= boost;
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────
  function drawField(
    ctx: CanvasRenderingContext2D,
    field: Field,
    offsetX: number,
    paddleColor: string,
    label: string
  ) {
    const fw = HALF_W - DIVIDER_W / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, fw, CANVAS_H);
    ctx.clip();
    ctx.translate(offsetX, 0);

    // Subtle field bg
    ctx.fillStyle = "rgba(255,255,255,0.015)";
    ctx.fillRect(0, 0, fw, CANVAS_H);

    // Label
    ctx.fillStyle = paddleColor;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = paddleColor;
    ctx.shadowBlur = 8;
    ctx.fillText(label, fw / 2, 16);
    ctx.shadowBlur = 0;

    // Score + Lives
    ctx.fillStyle = "#e0e0ff";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE: ${field.score}`, 6, 30);
    ctx.textAlign = "right";
    // Lives as hearts
    let livesStr = "";
    for (let i = 0; i < field.lives; i++) livesStr += "\u2665 ";
    ctx.fillStyle = "#ff0055";
    ctx.fillText(livesStr.trim(), fw - 6, 30);

    // Bricks remaining indicator
    const alive = field.bricks.filter((b) => b.alive).length;
    ctx.fillStyle = "#6a6a9a";
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${alive} BRICKS LEFT`, fw / 2, CANVAS_H - 6);

    // Bricks
    for (const brick of field.bricks) {
      if (!brick.alive) continue;
      const color = BRICK_COLORS[brick.row];
      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = color;
      ctx.fillRect(brick.x, brick.y, BRICK_W, BRICK_H);
      ctx.shadowBlur = 0;
      // Highlight edge
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(brick.x, brick.y, BRICK_W, 2);
    }

    // Paddle
    ctx.shadowColor = paddleColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = paddleColor;
    const px = field.paddle - PADDLE_W / 2;
    const py = CANVAS_H - PADDLE_Y_OFFSET - PADDLE_H;
    ctx.fillRect(px, py, PADDLE_W, PADDLE_H);
    // Paddle highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(px, py, PADDLE_W, 2);

    // Ball
    const ball = field.ball;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball trail
    if (!ball.stuck) {
      ctx.beginPath();
      ctx.arc(ball.x - ball.dx * 1.5, ball.y - ball.dy * 1.5, BALL_R * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();
    }

    ctx.restore();
  }

  function drawParticles(ctx: CanvasRenderingContext2D) {
    const list = particles.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.dx;
      p.y += p.dy;
      p.life--;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      const alpha = p.life / 35;
      const offsetX = p.side === "left" ? 0 : HALF_W + DIVIDER_W / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.fillRect(offsetX + p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.restore();
    }
  }

  // ── Main Loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Reset state
    const fw = HALF_W - DIVIDER_W / 2;
    playerRef.current = createField(fw);
    aiRef.current = createField(fw);
    gameOver.current = false;
    gameStarted.current = false;
    countdownRef.current = 3;
    particles.current = [];
    keysRef.current.clear();

    // Countdown
    let countdownInterval: ReturnType<typeof setInterval>;
    countdownInterval = setInterval(() => {
      countdownRef.current--;
      if (countdownRef.current <= 0) {
        clearInterval(countdownInterval);
        gameStarted.current = true;
        // Launch both balls
        launchBall(playerRef.current.ball);
        launchBall(aiRef.current.ball);
      }
    }, 800);
    countdownTimerRef.current = countdownInterval as unknown as number;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    function loop() {
      if (gameOver.current) return;
      const player = playerRef.current;
      const ai = aiRef.current;
      const fw = HALF_W - DIVIDER_W / 2;

      // ── Update ──
      if (gameStarted.current) {
        // Player paddle from keys
        const speed = 5;
        if (keysRef.current.has("ArrowLeft")) {
          player.paddle -= speed;
        }
        if (keysRef.current.has("ArrowRight")) {
          player.paddle += speed;
        }
        // Space to launch if stuck
        if (keysRef.current.has(" ") && player.ball.stuck) {
          launchBall(player.ball);
        }

        updateField(player, null, false, "left");
        updateField(ai, null, true, "right");

        // ── Win/Lose checks ──
        const playerBricksAlive = player.bricks.filter((b) => b.alive).length;
        const aiBricksAlive = ai.bricks.filter((b) => b.alive).length;

        // Player cleared all bricks
        if (playerBricksAlive === 0 && !gameOver.current) {
          gameOver.current = true;
          onGameEnd(true);
          return;
        }
        // AI cleared all bricks
        if (aiBricksAlive === 0 && !gameOver.current) {
          gameOver.current = true;
          onGameEnd(false);
          return;
        }
        // Player lost all lives
        if (player.lives <= 0 && !gameOver.current) {
          gameOver.current = true;
          onGameEnd(false);
          return;
        }
        // AI lost all lives
        if (ai.lives <= 0 && !gameOver.current) {
          gameOver.current = true;
          onGameEnd(true);
          return;
        }
      }

      // ── Draw ──
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw fields
      drawField(ctx, player, 0, PLAYER_COLOR, "YOU");
      drawField(ctx, ai, HALF_W + DIVIDER_W / 2, AI_COLOR, "CPU");

      // Center divider
      ctx.fillStyle = "#1a1a3a";
      ctx.fillRect(HALF_W - DIVIDER_W / 2, 0, DIVIDER_W, CANVAS_H);
      // Dashed line on divider
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "#2a2a5a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(HALF_W, 0);
      ctx.lineTo(HALF_W, CANVAS_H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Particles
      drawParticles(ctx);

      // Countdown overlay
      if (!gameStarted.current) {
        ctx.fillStyle = "rgba(10,10,26,0.6)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = "#ffff00";
        ctx.shadowColor = "#ffff00";
        ctx.shadowBlur = 20;
        ctx.font = "bold 48px monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          countdownRef.current > 0 ? String(countdownRef.current) : "GO!",
          CANVAS_W / 2,
          CANVAS_H / 2 + 16
        );
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#6a6a9a";
        ctx.font = "10px monospace";
        ctx.fillText("GET READY", CANVAS_W / 2, CANVAS_H / 2 - 40);
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);

    return () => {
      gameOver.current = true;
      cancelAnimationFrame(animRef.current);
      clearInterval(countdownInterval);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [mode, onGameEnd, handleKeyDown, handleKeyUp]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="game-canvas border border-[var(--border-color)] box-glow-yellow"
        style={{ maxWidth: "100%", height: "auto" }}
      />
      <div className="flex items-center justify-between w-full max-w-[700px] px-2">
        <div className="text-[var(--neon-yellow)] text-[8px] glow-yellow">
          {"\u2190 \u2192"} MOVE PADDLE &bull; SPACE LAUNCH
        </div>
        <div className="text-[var(--text-muted)] text-[8px]">
          CLEAR ALL BRICKS TO WIN
        </div>
      </div>
    </div>
  );
}

// ── Page Export ─────────────────────────────────────────────────────────
export default function BreakoutPage() {
  return (
    <GameWrapper title="BREAKOUT" color="yellow">
      {({ mode, onGameEnd }) => (
        <BreakoutGame mode={mode} onGameEnd={onGameEnd} />
      )}
    </GameWrapper>
  );
}
