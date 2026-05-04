"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  ExternalLink,
  GitBranch,
  MessageSquare,
  Radio,
  Server,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@repo/ui/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";

const DISCORD_INVITE = process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/XFgPpPN2";
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/New-Retr0/agent-z";

const capabilities = [
  {
    icon: MessageSquare,
    title: "Slash commands",
    description: "Use `/agent-z` for help with tier-appropriate tooling, or `/agent-z-admin` for staff workflows with staged confirmations.",
  },
  {
    icon: Shield,
    title: "Tier-aware access",
    description: "Capabilities map to Discord roles: verified, mod, and admin surfaces stay separated so public slash stays read-safe.",
  },
  {
    icon: Wrench,
    title: "Discord MCP",
    description: "Optional Streamable HTTP MCP server for Cursor and other clients—tools are gated the same way as in Discord.",
  },
  {
    icon: Radio,
    title: "Gateway relay",
    description: "Always-on gateway forwards mentions, replies, and reactions to your Vercel app so the bot can respond outside pure interactions.",
  },
];

export function HomeContent() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Image src="/logo.svg" alt="" width={28} height={28} className="rounded" />
            Agent Z
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#paths" className="hover:text-foreground">
              Try or self-host
            </a>
            <Link href="/admin/login" className="hover:text-foreground">
              Admin
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                <GitBranch />
                GitHub
              </a>
            </Button>
            <Button size="sm" asChild>
              <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                Join Discord
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-background px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-8">
            <Badge variant="secondary" className="w-fit">
              <Sparkles />
              Discord + Vercel AI agent
            </Badge>
            <div className="flex flex-col gap-4">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Agent Z: an AI moderator and helper for your Discord server
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Slash commands, tool calling against Discord APIs, optional MCP for external clients, and an admin control plane—built
                on Next.js and the Vercel AI SDK.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" asChild>
                <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Try the live bot
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  <GitBranch />
                  Self-host from GitHub
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">What it can do</h2>
              <p className="max-w-2xl text-muted-foreground">
                Behavior depends on your role mapping and configured channels—this is the surface area the stack is built for.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {capabilities.map((item) => (
                <Card key={item.title}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <item.icon className="size-5 text-muted-foreground" />
                      <CardTitle className="text-base">{item.title}</CardTitle>
                    </div>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        <section id="paths" className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-semibold tracking-tight">Try it or run your own</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Join the community server to use a hosted instance, or deploy the open-source monorepo.
            </p>

            <Tabs defaultValue="try" className="mt-8">
              <TabsList className="w-full justify-start sm:w-auto">
                <TabsTrigger value="try">Try the live bot</TabsTrigger>
                <TabsTrigger value="selfhost">Self-host</TabsTrigger>
              </TabsList>
              <TabsContent value="try" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="size-5" />
                      Join the Discord
                    </CardTitle>
                    <CardDescription>
                      Step into the Zero to Agent community server where Agent Z is running with full context and tooling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                      After you join, use slash commands in the allowed channels—the bot respects channel and role configuration from the
                      admin console.
                    </p>
                    <Button asChild>
                      <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                        Open Discord invite
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="selfhost" className="mt-6 flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="size-5" />
                      Vercel (apps/web)
                    </CardTitle>
                    <CardDescription>
                      Production Discord interactions hit <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/discord</code>{" "}
                      on your Next.js deployment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
                    <ol className="flex list-decimal flex-col gap-3 pl-5">
                      <li>
                        Clone{" "}
                        <a className="text-foreground underline hover:no-underline" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                          the repo on GitHub
                        </a>{" "}
                        and copy{" "}
                        <code className="rounded bg-muted px-1">apps/web/env/.env.example</code> to{" "}
                        <code className="rounded bg-muted px-1">apps/web/.env</code> (and{" "}
                        <code className="rounded bg-muted px-1">apps/gateway/env/.env.example</code> →{" "}
                        <code className="rounded bg-muted px-1">apps/gateway/.env</code> if you run the gateway relay).
                      </li>
                      <li>
                        Set Discord app credentials{" "}
                        (<code className="rounded bg-muted px-1">DISCORD_BOT_TOKEN</code>,{" "}
                        <code className="rounded bg-muted px-1">DISCORD_PUBLIC_KEY</code>,{" "}
                        <code className="rounded bg-muted px-1">DISCORD_APPLICATION_ID</code>), Neon{" "}
                        <code className="rounded bg-muted px-1">DATABASE_URL</code>, Vercel AI Gateway{" "}
                        <code className="rounded bg-muted px-1">AI_GATEWAY_API_KEY</code>, and Agent Z secrets (
                        <code className="rounded bg-muted px-1">AGENT_Z_ADMIN_SECRET</code>,{" "}
                        <code className="rounded bg-muted px-1">AGENT_Z_INTERNAL_SECRET</code>,{" "}
                        <code className="rounded bg-muted px-1">AGENT_Z_APP_BASE_URL</code> → your deployment URL).
                      </li>
                      <li>
                        Run <code className="rounded bg-muted px-1">npx prisma migrate deploy</code> from{" "}
                        <code className="rounded bg-muted px-1">packages/db</code>.
                      </li>
                      <li>
                        In Vercel, set the project <strong className="text-foreground">Root Directory</strong> to{" "}
                        <code className="rounded bg-muted px-1">apps/web</code>, deploy, then set the Discord{" "}
                        <strong className="text-foreground">Interactions Endpoint URL</strong> to{" "}
                        <code className="rounded bg-muted px-1">https://&lt;your-app&gt;.vercel.app/api/discord</code>.
                      </li>
                      <li>
                        Optionally deploy <code className="rounded bg-muted px-1">apps/discord-mcp</code> as a second project and set{" "}
                        <code className="rounded bg-muted px-1">DISCORD_MCP_URL</code> on web for full tool access from the agent.
                      </li>
                    </ol>
                  </CardContent>
                </Card>

                <Alert>
                  <Radio className="size-4" />
                  <AlertTitle>Persistent gateway (Railway or any always-on host)</AlertTitle>
                  <AlertDescription className="flex flex-col gap-3">
                    <p>
                      Slash commands work over HTTPS interactions on Vercel. <strong className="text-foreground">Mentions</strong>,{" "}
                      <strong className="text-foreground">replies</strong>, and similar Gateway events need the small{" "}
                      <code className="rounded bg-muted px-1">apps/gateway</code> relay—it POSTs events to your Vercel app.
                    </p>
                    <p>
                      On{" "}
                      <a className="font-medium text-foreground underline hover:no-underline" href="https://railway.app" target="_blank" rel="noopener noreferrer">
                        Railway
                      </a>
                      , create a service from the same repo, install root dependencies, and use a start command such as:
                    </p>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-xs text-foreground">
                      npm run build -w @repo/gateway {"&&"} npm run start -w @repo/gateway
                    </pre>
                    <p>
                      Set at least <code className="rounded bg-muted px-1">DISCORD_BOT_TOKEN</code> and{" "}
                      <code className="rounded bg-muted px-1">AGENT_Z_APP_BASE_URL</code> (your public web origin). Optional:{" "}
                      <code className="rounded bg-muted px-1">AGENT_Z_GATEWAY_ACTIVITY</code>, message content / oversight toggles per{" "}
                      <code className="rounded bg-muted px-1">apps/gateway/src/index.ts</code>.
                    </p>
                  </AlertDescription>
                </Alert>

                <Accordion type="single" collapsible className="w-full rounded-lg border px-4">
                  <AccordionItem value="env">
                    <AccordionTrigger>Environment variables checklist</AccordionTrigger>
                    <AccordionContent>
                      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
                        <li>Database: DATABASE_URL (pooled Neon for runtime)</li>
                        <li>Discord: DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, DISCORD_APPLICATION_ID</li>
                        <li>AI: AI_GATEWAY_API_KEY</li>
                        <li>Agent Z: AGENT_Z_ADMIN_SECRET, AGENT_Z_INTERNAL_SECRET, AGENT_Z_APP_BASE_URL</li>
                        <li>MCP (optional): DISCORD_MCP_URL pointing at your discord-mcp deployment</li>
                        <li>Gateway worker: DISCORD_BOT_TOKEN, AGENT_Z_APP_BASE_URL on Railway</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Agent Z</span>
            <span>Next.js, Vercel, and Discord.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a className="text-muted-foreground hover:text-foreground" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
              Discord
            </a>
            <a className="text-muted-foreground hover:text-foreground" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <Link className="text-muted-foreground hover:text-foreground" href="/admin/login">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
