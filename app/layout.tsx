import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";
import WalletProvider from "@/app/components/WalletProvider";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
});

export const metadata: Metadata = {
  title: "ARCADE ARENA | $ARENA",
  description: "Arcade Arena - wager $ARENA tokens in classic arcade games. Player vs Player. Winner takes all.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pressStart.variable} h-full`}>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-press-start), monospace" }}>
        <div className="crt-overlay" />
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
