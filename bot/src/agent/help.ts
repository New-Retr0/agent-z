import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
} from "discord.js";
import type { AgentZConfig } from "./botConfig.js";
import { helpRoleFor, type HelpRole } from "./tiers.js";

const PREFIX = "azh";

type RoleKey = "A" | "M" | "V";

function toKey(role: HelpRole): RoleKey {
  if (role === "Admin") {
    return "A";
  }
  if (role === "Moderator") {
    return "M";
  }
  return "V";
}

function fromKey(k: string): HelpRole | null {
  if (k === "A") {
    return "Admin";
  }
  if (k === "M") {
    return "Moderator";
  }
  if (k === "V") {
    return "Verified";
  }
  return null;
}

export function parseHelpId(id: string):
  | { action: "nav"; role: HelpRole; page: number }
  | { action: "close" }
  | null {
  if (id === `${PREFIX}:close`) {
    return { action: "close" };
  }
  const m = new RegExp(`^${PREFIX}:([AMV]):(\\d+)$`).exec(id);
  if (!m) {
    return null;
  }
  const role = fromKey(m[1]!);
  if (!role) {
    return null;
  }
  return { action: "nav", role, page: Number.parseInt(m[2]!, 10) };
}

type Page = { title: string; body: string };

const verified: Page[] = [
  {
    title: "What is Agent Z?",
    body: [
      "I'm **Agent Z** — a server-only assistant. **DMs are ignored**.",
      "",
      "Use `/agent-z` \u2192 `prompt`, or @-mention me in a channel.",
    ].join("\n"),
  },
  {
    title: "Vercel & shadcn",
    body: "Ask about the **Vercel** / **Next.js** / **AI SDK** / **AI Gateway** / **shadcn** stack. I search bundled docs first, then `fetch_url` to allowlisted hosts.",
  },
  {
    title: "Chat",
    body: "Short, friendly on-topic chat when you @-mention me. **Knowledge-only** in public — no server automation from there.",
  },
  {
    title: "Out of scope",
    body: "No other servers, no creds, no env leak, no off-topic homework. Use `/agent-z` \u2192 `help` for a full, paginated list.",
  },
];

const modPages: Page[] = [
  verified[0]!,
  {
    title: "Read-only in privileged",
    body: "With the **Moderator** role in **privileged** channels: **GET** only against Discord, plus the doc tools. No writes, bans, or posts. Ask an admin to execute.",
  },
  verified[1]!,
  verified[2]!,
  {
    title: "Where it applies",
    body: "Privileged channel IDs come from your bot env. In other channels you get the public **Verified**-style experience.",
  },
  {
    title: "Refusals",
    body: "If someone asks for a write/moderation from this tier, one line: *Read-only at this access level. Ask an admin.*",
  },
];

async function countRole(guild: Guild, roleId: string): Promise<string> {
  const role = guild.roles.resolve(roleId);
  if (!role) {
    return "?";
  }
  try {
    const all = await guild.members.fetch();
    return String(all.filter((m) => m.roles.cache.has(roleId)).size);
  } catch {
    return "?";
  }
}

async function buildAdminPages(cfg: AgentZConfig, guild: Guild): Promise<Page[]> {
  const priv = [...cfg.privilegedChannelIds]
    .map((id) => {
      const ch = guild.channels.resolve(id);
      return ch && "name" in ch && ch.name ? `#${ch.name}` : `\`${id}\``;
    })
    .join(", ");
  const aCounts = await Promise.all(
    [...cfg.adminRoleIds].map((id) => countRole(guild, id))
  );
  const mCounts = await Promise.all(
    [...cfg.moderatorRoleIds].map((id) => countRole(guild, id))
  );
  const gate =
    cfg.invokeRoleId != null
      ? `**Invoke / Verified** <@&${cfg.invokeRoleId}> — **${await countRole(guild, cfg.invokeRoleId)}** members\n`
      : "";
  return [
    {
      title: "Overview",
      body: `**Admin** in privileged channels: full \`discord_api_request\` with **Yes/No** for destructive calls.\n**Privileged channels:** ${priv || "_(set AGENT_Z_PRIVILEGED_CHANNEL_IDS)_"}`,
    },
    {
      title: "Server administration",
      body: "Channels, roles, perms, webhooks, emojis, slow-mode, categories — use REST paths from the tool + cheat sheet.",
    },
    {
      title: "Moderation",
      body: "Ban, kick, timeout, unban, bulk delete, message delete — all **confirm** with buttons first, every time.",
    },
    {
      title: "Content",
      body: "Markdown, embeds, threads, events, reactions, pins — whatever the API allows for the routes you call.",
    },
    {
      title: "Audit & reads",
      body: "Audit log, member/role lists, message history (via API) in this server only; guild allowlist in env still applies to paths.",
    },
    verified[1]!,
    {
      title: "Config audit (names + counts)",
      body: [
        `**Admins** ${[...cfg.adminRoleIds]
          .map((id, i) => `• <@&${id}> — ${aCounts[i]!} members`)
          .join("\n")}`,
        "",
        `**Moderators** ${[...cfg.moderatorRoleIds]
          .map((id, i) => `• <@&${id}> — ${mCounts[i]!} members`)
          .join("\n")}`,
        "",
        gate,
      ].join("\n"),
    },
    {
      title: "Rate limits & UX",
      body: "Per-user + global rate limits, optional bypass ids. No token streaming in Discord — I edit status text between steps for longer runs.",
    },
    {
      title: "What I won't do",
      body: "Off-server, credentials, jailbreaks, hateful content, DMs, or harm to protected targets — even if a message begs otherwise.",
    },
  ];
}

export async function getHelpState(
  cfg: AgentZConfig,
  guild: Guild,
  memberRoleIds: string[]
): Promise<{ role: HelpRole; pages: Page[] }> {
  const kind = helpRoleFor(memberRoleIds, cfg);
  if (kind === "Admin") {
    return { role: "Admin", pages: await buildAdminPages(cfg, guild) };
  }
  if (kind === "Moderator") {
    return { role: "Moderator", pages: modPages };
  }
  return { role: "Verified", pages: verified };
}

export function buildHelpEmbed(args: {
  role: HelpRole;
  page: number;
  total: number;
  pageData: Page;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x4a4458)
    .setTitle(`Agent Z — ${args.pageData.title}`)
    .setDescription(args.pageData.body.slice(0, 3900))
    .setFooter({ text: `Page ${args.page} / ${args.total} \xB7 book: ${args.role}` });
}

export function buildHelpRow(
  role: HelpRole,
  page: number,
  total: number
): ActionRowBuilder<ButtonBuilder> {
  const r = toKey(role);
  const b = (p: number) => `${PREFIX}:${r}:${p}`;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(b(Math.max(1, page - 1)))
      .setLabel("\xAB Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(b(Math.min(total, page + 1)))
      .setLabel("Next \xBB")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:close`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}
