import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Agent Z Discord MCP",
  description:
    "Tier-gated Discord moderation tools, resources, and prompts exposed as a Model Context Protocol server. Used in-process by Agent Z and connectable from Cursor, Claude Desktop, and any MCP-aware client.",
};

export const viewport: Viewport = {
  themeColor: "#0a0c12",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
