"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface GameWrapperProps {
  title: string;
  color: "green" | "cyan" | "magenta" | "purple" | "yellow" | "pink" | "orange";
  children: (props: { mode: "practice" | "wager"; onGameEnd: (won: boolean) => void }) => React.ReactNode;
}

const colorMap = {
  green: { text: "text-[var(--neon-green)]", glow: "glow-green", boxGlow: "box-glow-green", border: "border-[var(--neon-green)]", bg: "rgba(0,255,65,0.1)" },
  cyan: { text: "text-[var(--neon-cyan)]", glow: "glow-cyan", boxGlow: "box-glow-cyan", border: "border-[var(--neon-cyan)]", bg: "rgba(0,255,255,0.1)" },
  magenta: { text: "text-[var(--neon-magenta)]", glow: "glow-magenta", boxGlow: "box-glow-magenta", border: "border-[var(--neon-magenta)]", bg: "rgba(255,0,255,0.1)" },
  purple: { text: "text-[var(--neon-purple)]", glow: "glow-purple", boxGlow: "box-glow-purple", border: "border-[var(--neon-purple)]", bg: "rgba(184,41,255,0.1)" },
  yellow: { text: "text-[var(--neon-yellow)]", glow: "glow-yellow", boxGlow: "box-glow-yellow", border: "border-[var(--neon-yellow)]", bg: "rgba(255,255,0,0.1)" },
  pink: { text: "text-[var(--neon-pink)]", glow: "glow-pink", boxGlow: "box-glow-pink", border: "border-[var(--neon-pink)]", bg: "rgba(255,45,149,0.1)" },
  orange: { text: "text-[var(--neon-orange)]", glow: "glow-yellow", boxGlow: "box-glow-yellow", border: "border-[var(--neon-orange)]", bg: "rgba(255,136,0,0.1)" },
};

export default function GameWrapper({ title, color, children }: GameWrapperProps) {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"practice" | "wager">("practice");
  const [won, setWon] = useState(false);
  const [done, setDone] = useState(false);
  const c = colorMap[color];

  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const handlePractice = () => {
    setMode("practice");
    setStarted(true);
    setDone(false);
  };

  const handleWager = () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    // Wallet is connected — wager mode would start here once deposits are implemented
    setMode("wager");
    setStarted(true);
    setDone(false);
  };

  const onGameEnd = (playerWon: boolean) => {
    setWon(playerWon);
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-[var(--text-muted)] text-[8px] hover:text-[var(--text-primary)] transition-colors">
            &lt; BACK TO LOBBY
          </Link>
          <h1 className={`text-lg sm:text-xl ${c.text} ${c.glow}`}>{title}</h1>
          <div className="w-[80px] text-right">
            {connected && publicKey && (
              <span className="text-[var(--neon-green)] text-[8px]">
                {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
              </span>
            )}
          </div>
        </div>

        {/* Top bar: mode select + status */}
        {!done && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4 border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
            {!started ? (
              <>
                <span className="text-[var(--text-muted)] text-[8px]">SELECT MODE:</span>
                <button onClick={handlePractice} className="arcade-btn arcade-btn-cyan text-[8px] !px-4 !py-2">
                  PRACTICE
                </button>
                <button onClick={handleWager} className="arcade-btn arcade-btn-magenta text-[8px] !px-4 !py-2">
                  {connected ? "WAGER $ARENA" : "CONNECT & WAGER"}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-[var(--neon-green)] text-[8px]">● PLAYING</span>
                <span className="text-[var(--text-muted)] text-[8px]">
                  {mode === "practice" ? "PRACTICE MODE" : "WAGER MODE"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Result bar */}
        {done && (
          <div className="flex flex-col items-center gap-4 mb-4 border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className={`text-xl ${won ? "text-[var(--neon-green)] glow-green" : "text-[var(--neon-magenta)] glow-magenta"}`}>
              {won ? "YOU WIN!" : "YOU LOSE!"}
            </div>
            {mode === "wager" && (
              <div className={`text-[10px] ${won ? "text-[var(--neon-green)]" : "text-[var(--neon-magenta)]"}`}>
                {won ? "+$ARENA earned" : "-$ARENA lost"}
              </div>
            )}
            {mode === "practice" && (
              <div className="text-[var(--text-muted)] text-[8px]">PRACTICE MODE - NO TOKENS WAGERED</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setStarted(false); setDone(false); }}
                className="arcade-btn arcade-btn-cyan text-[8px] !px-4 !py-2"
              >
                PLAY AGAIN
              </button>
              <Link href="/" className="arcade-btn arcade-btn-green text-[8px] !px-4 !py-2 inline-block">
                LOBBY
              </Link>
            </div>
          </div>
        )}

        {/* Game always visible below */}
        {started ? (
          children({ mode, onGameEnd })
        ) : (
          <div className="opacity-50 pointer-events-none">
            {children({ mode: "practice", onGameEnd: () => {} })}
          </div>
        )}
      </div>
    </div>
  );
}
