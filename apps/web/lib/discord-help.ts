import { PUBLIC_AGENT_Z_HELP_MARKDOWN } from "@repo/agent/public-help-markdown";
import type { DiscordInvocationContext } from "@repo/agent/types";
import { resolveDiscordAccess } from "@/lib/discord-access";
import { introspectMcp } from "@/lib/mcp-introspect";

function resolveAppOrigin(): string {
  const explicit = process.env.AGENT_Z_APP_BASE_URL?.replace(/\/$/, "").trim();
  if (explicit) return explicit;
  const host = process.env.VERCEL_URL?.trim();
  if (host) return host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
  return "http://localhost:3000";
}

function categorizeToolNames(names: readonly string[]): { readish: number; stagedish: number; other: number } {
  let readish = 0;
  let stagedish = 0;
  let other = 0;
  for (const n of names) {
    const l = n.toLowerCase();
    if (l.includes("staged")) {
      stagedish += 1;
      continue;
    }
    if (
      /discord_(kick|ban|unban|timeout)_member\b/.test(l) ||
      l.includes("bulk_delete") ||
      l.includes("delete_channel") ||
      l.includes("delete_role") ||
      l.includes("create_channel") ||
      l.includes("webhook") ||
      l.includes("invite")
    ) {
      stagedish += 1;
      continue;
    }
    if (
      l.includes("_read") ||
      l.includes("_list") ||
      l.includes("fetch") ||
      l.includes("search") ||
      l.includes("audit")
    ) {
      readish += 1;
      continue;
    }
    other += 1;
  }
  return { readish, stagedish, other };
}

export async function buildAgentZHelpDiscordPayload(args: { discordContext: DiscordInvocationContext }): Promise<{
  markdownFallback: string;
  embeds: Record<string, unknown>[];
  components: Array<Record<string, unknown>>;
}> {
  const access = await resolveDiscordAccess(args.discordContext);

  let mcpLine = "MCP: not reachable from this host.";
  try {
    const snap = await introspectMcp();
    if (snap.available) {
      const discordTools = snap.tools.filter((t) => t.name.startsWith("discord_"));
      const { readish, stagedish, other } = categorizeToolNames(discordTools.map((t) => t.name));
      mcpLine = `Endpoint \`${snap.endpoint}\` — **${discordTools.length}** \`discord_*\` tools (≈${readish} read-like / ≈${stagedish} high-impact / ${other} other).`;
    } else {
      mcpLine = `Offline${snap.error ? `: ${snap.error.slice(0, 180)}` : ""}.`;
    }
  } catch (e) {
    mcpLine = `Introspection error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }

  const tierLabel = access.allowed ? access.tier : "denied";
  const origin = resolveAppOrigin();

  const embed: Record<string, unknown> = {
    title: "Agent Z",
    description: PUBLIC_AGENT_Z_HELP_MARKDOWN.slice(0, 3900),
    color: 0x5865f2,
    fields: [
      { name: "Your tier (role map)", value: tierLabel, inline: true },
      {
        name: "Invoker",
        value: args.discordContext.invokerUserId ? `<@${args.discordContext.invokerUserId}>` : "unknown",
        inline: true,
      },
      { name: "Discord MCP snapshot", value: mcpLine.slice(0, 1024) },
      {
        name: "Memory / privacy (accurate)",
        value:
          "Recent channel messages may be replayed for context. Profile notes are optional operator-written memory — not Discord identity.",
      },
    ],
  };

  const components: Array<Record<string, unknown>> = [
    {
      type: 1,
      components: [
        { type: 2, style: 2, label: "Why (staff)", custom_id: "azhelp:why" },
        { type: 2, style: 2, label: "Forget me", custom_id: "azhelp:forget" },
        { type: 2, style: 5, label: "Open /admin", url: `${origin}/admin` },
      ],
    },
  ];

  return { markdownFallback: PUBLIC_AGENT_Z_HELP_MARKDOWN, embeds: [embed], components };
}
