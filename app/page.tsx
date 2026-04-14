"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const ASCII_LOGO_1 = `
 █████╗ ██████╗  ██████╗ █████╗ ██████╗ ███████╗
██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝
███████║██████╔╝██║     ███████║██║  ██║█████╗
██╔══██║██╔══██╗██║     ██╔══██║██║  ██║██╔══╝
██║  ██║██║  ██║╚██████╗██║  ██║██████╔╝███████╗
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═════╝ ╚══════╝`;

const ASCII_LOGO_2 = `
 █████╗ ██████╗ ███████╗███╗   ██╗ █████╗
██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗
███████║██████╔╝█████╗  ██╔██╗ ██║███████║
██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║██╔══██║
██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝`;

interface GameInfo {
  name: string;
  path: string;
  description: string;
  color: string;
  glowClass: string;
  icon: string;
  players: string;
}

const GAMES: GameInfo[] = [
  {
    name: "TRON",
    path: "/games/tron",
    description: "LIGHT CYCLE DEATH RACE",
    color: "var(--neon-cyan)",
    glowClass: "glow-cyan",
    icon: "🏍️",
    players: "1v1",
  },
  {
    name: "BOMBERMAN",
    path: "/games/bomberman",
    description: "TRAP & BLAST YOUR ENEMY",
    color: "var(--neon-orange)",
    glowClass: "glow-yellow",
    icon: "💣",
    players: "1v1",
  },
  {
    name: "ASTEROIDS",
    path: "/games/asteroids",
    description: "DUEL IN THE ASTEROID FIELD",
    color: "var(--neon-magenta)",
    glowClass: "glow-magenta",
    icon: "☄️",
    players: "1v1",
  },
  {
    name: "TANK BATTLE",
    path: "/games/tank-battle",
    description: "TOP-DOWN ARENA COMBAT",
    color: "var(--neon-pink)",
    glowClass: "glow-pink",
    icon: "🔫",
    players: "1v1",
  },
  {
    name: "GALAGA",
    path: "/games/galaga",
    description: "BLAST THE BUG SWARM",
    color: "var(--neon-purple)",
    glowClass: "glow-purple",
    icon: "🛸",
    players: "1v1",
  },
  {
    name: "AIR HOCKEY",
    path: "/games/air-hockey",
    description: "FAST PUCK PHYSICS PVP",
    color: "var(--neon-cyan)",
    glowClass: "glow-cyan",
    icon: "🏒",
    players: "1v1",
  },
  {
    name: "MISSILE CMD",
    path: "/games/missile-command",
    description: "DEFEND YOUR CITIES",
    color: "var(--neon-magenta)",
    glowClass: "glow-magenta",
    icon: "🚀",
    players: "1v1",
  },
  {
    name: "PAC CHASE",
    path: "/games/pac-chase",
    description: "EAT OR BE EATEN",
    color: "var(--neon-yellow)",
    glowClass: "glow-yellow",
    icon: "ᗧ",
    players: "1v1",
  },
  {
    name: "SPACE INVADERS",
    path: "/games/space-invaders",
    description: "RACE TO CLEAR THE WAVES",
    color: "var(--neon-purple)",
    glowClass: "glow-purple",
    icon: "👾",
    players: "1v1",
  },
  {
    name: "BATTLESHIP",
    path: "/games/battleship",
    description: "SINK THE ENEMY FLEET",
    color: "var(--neon-cyan)",
    glowClass: "glow-cyan",
    icon: "🚢",
    players: "1v1",
  },
  {
    name: "FROGGER",
    path: "/games/frogger",
    description: "RACE ACROSS THE ROAD",
    color: "var(--neon-green)",
    glowClass: "glow-green",
    icon: "🐸",
    players: "1v1",
  },
  {
    name: "BREAKOUT",
    path: "/games/breakout",
    description: "SMASH BRICKS TO WIN",
    color: "var(--neon-yellow)",
    glowClass: "glow-yellow",
    icon: "🧱",
    players: "1v1",
  },
  {
    name: "PONG",
    path: "/games/pong",
    description: "THE ORIGINAL 1V1",
    color: "var(--neon-green)",
    glowClass: "glow-green",
    icon: "🏓",
    players: "1v1",
  },
  {
    name: "SNAKE RACE",
    path: "/games/snake",
    description: "LAST SNAKE ALIVE WINS",
    color: "var(--neon-cyan)",
    glowClass: "glow-cyan",
    icon: "🐍",
    players: "1v1",
  },
];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center">
        <div className="text-[var(--neon-green)] glow-green blink text-xs">LOADING...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* ASCII Header */}
        <header className="text-center mb-8">
          <pre className="text-[var(--neon-green)] glow-green text-[0.35rem] sm:text-[0.5rem] md:text-[0.7rem] lg:text-sm leading-none font-bold inline-block" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
            {ASCII_LOGO_1}
          </pre>
          <pre className="text-[var(--neon-magenta)] glow-magenta text-[0.35rem] sm:text-[0.5rem] md:text-[0.7rem] lg:text-sm leading-none font-bold inline-block mt-1" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
            {ASCII_LOGO_2}
          </pre>
          <p className="text-[var(--neon-magenta)] glow-magenta text-[10px] mt-4 tracking-widest">
            ARCADE ARENA // WAGER $ARCADE // WINNER TAKES ALL
          </p>
        </header>

        {/* Connect Wallet Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-8">
          {connected && publicKey ? (
            <>
              <div className="flex items-center gap-4 mb-2 sm:mb-0">
                <div className="text-[var(--neon-green)] text-[8px]">● CONNECTED</div>
                <div className="text-[var(--text-muted)] text-[8px]">
                  {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                className="arcade-btn arcade-btn-magenta text-[8px] !px-4 !py-2"
              >
                DISCONNECT
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="text-[8px]">
                  <span className="text-[var(--text-muted)]">BALANCE: </span>
                  <span className="text-[var(--text-muted)]">CONNECT WALLET</span>
                </div>
              </div>
              <button
                onClick={() => setVisible(true)}
                className="arcade-btn arcade-btn-green text-[8px] !px-4 !py-2"
              >
                CONNECT WALLET
              </button>
            </>
          )}
        </div>

        {/* Game Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {GAMES.map((game) => (
            <Link
              key={game.name}
              href={game.path}
              className="group border border-[var(--border-color)] bg-[var(--bg-card)] p-5 hover:bg-[var(--bg-card-hover)] transition-all duration-200 flex flex-col"
            >
              <div
                className={`text-4xl font-bold mb-3 ${game.glowClass} transition-all group-hover:scale-110`}
                style={{ color: game.color }}
              >
                {game.icon}
              </div>
              <div
                className={`text-xs mb-2 ${game.glowClass}`}
                style={{ color: game.color }}
              >
                {game.name}
              </div>
              <div className="text-[var(--text-muted)] text-[8px] mb-3 flex-1">
                {game.description}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] text-[8px]">{game.players}</span>
                <span
                  className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: game.color }}
                >
                  PLAY &gt;
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* How It Works */}
        <div className="border border-[var(--border-color)] bg-[var(--bg-card)] p-6 mb-8">
          <div className="text-[var(--neon-cyan)] glow-cyan text-xs mb-4">&gt; HOW IT WORKS</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-[9px]">
            <div>
              <div className="text-[var(--neon-green)] mb-2">01 CONNECT</div>
              <div className="text-[var(--text-muted)]">Connect your Solana wallet and load up on $ARCADE tokens</div>
            </div>
            <div>
              <div className="text-[var(--neon-magenta)] mb-2">02 WAGER</div>
              <div className="text-[var(--text-muted)]">Pick a game, deposit your wager, and get matched with an opponent</div>
            </div>
            <div>
              <div className="text-[var(--neon-yellow)] mb-2">03 WIN</div>
              <div className="text-[var(--text-muted)]">Beat your opponent and take the entire pot. Winner takes all.</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-6 border-t border-[var(--border-color)]">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
            <a
              href="https://x.com/liquidlad_"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-muted)] text-[8px] hover:text-[var(--neon-cyan)] transition-colors"
            >
              FOLLOW ON X
            </a>
            <a
              href="https://pump.fun/?q=arcade&tab=created_timestamp"
              target="_blank"
              rel="noopener noreferrer"
              className="arcade-btn arcade-btn-green text-[8px] !px-4 !py-2"
            >
              BUY $ARCADE
            </a>
            <span className="text-[var(--text-muted)] text-[8px]">arcadearena.fun</span>
          </div>
          <div className="text-[var(--neon-green)] glow-green text-[8px] mt-4 blink">
            INSERT COIN TO CONTINUE
          </div>
        </footer>
      </div>
    </div>
  );
}
