import type { Metadata } from "next";
import { HomeContent } from "./home-content";

export const metadata: Metadata = {
  title: "Agent Z — Discord AI agent",
  description:
    "Tier-aware Discord bot with slash commands, MCP tools, and a Vercel-hosted control plane. Try it on Discord or self-host from GitHub.",
  openGraph: {
    title: "Agent Z — Discord AI agent",
    description: "AI-powered Discord helper: slash commands, tools, admin cockpit, optional MCP and gateway relay.",
  },
};

export default function Home() {
  return <HomeContent />;
}
