import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { prisma } from "@repo/db";
import { discordRequest, loadDiscordToolConfig, type DiscordToolConfig } from "@repo/discord-tools";
import { meetsTier, resolveTier, tierLabel, type Tier } from "./tier";
import type { Actor } from "./auth";

type McpExtra = {
  authInfo?: { extra?: { actor?: Actor } };
};

let discordConfigMemo: { cfg: DiscordToolConfig; expires: number } | null = null;

async function resolveDiscordConfigCached(): Promise<DiscordToolConfig> {
  const now = Date.now();
  if (discordConfigMemo && discordConfigMemo.expires > now) {
    return discordConfigMemo.cfg;
  }
  const rc = await getRuntimeConfig();
  const cfg = loadDiscordToolConfig(process.env, {
    reactionVerifiedRoleIdFromDb: rc.verifiedRoleId,
    allowDeleteVerifiedRoleFromDb: rc.allowDeleteVerifiedRole,
  });
  discordConfigMemo = { cfg, expires: now + 30_000 };
  return cfg;
}

async function authorizeOrFail(extra: McpExtra | undefined, required: Tier, resourceLabel: string) {
  const actor = extra?.authInfo?.extra?.actor;
  if (!actor) {
    throw new Error(
      `Missing actor headers; the MCP client did not forward Discord identity (X-Actor-Discord-*) for ${resourceLabel}.`
    );
  }
  const tier = await resolveTier(actor);
  if (!meetsTier(tier, required)) {
    throw new Error(
      `Insufficient tier for ${resourceLabel}: requires ${required}, caller resolves to ${tier}.`
    );
  }
  return { actor, tier };
}

function jsonContents(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function registerResources(server: McpServer) {
  // ─── agent-z://config/tier-matrix ───────────────────────────────────────
  server.registerResource(
    "tier-matrix",
    "agent-z://config/tier-matrix",
    {
      title: "Agent Z Tier Matrix",
      description:
        "Snapshot of the role mapping that drives Discord tier resolution. Public read — useful for clients to know which Discord roles count as admin/mod/verified before issuing tool calls.",
      mimeType: "application/json",
    },
    async (uri) => {
      const rows = await prisma.roleMapping.findMany({
        where: { kind: { in: ["admin", "mod", "verified"] } },
        select: { kind: true, discordRoleId: true },
        orderBy: [{ kind: "asc" }, { discordRoleId: "asc" }],
      });
      const matrix: Record<string, string[]> = { admin: [], mod: [], verified: [] };
      for (const row of rows) {
        if (matrix[row.kind]) matrix[row.kind].push(row.discordRoleId);
      }
      return jsonContents(uri.href, {
        description:
          "Discord role IDs grouped by Agent Z tier. Roles map admin > mod > verified > public.",
        tiers: matrix,
      });
    }
  );

  // ─── discord://guild/{guildId}/channels ─────────────────────────────────
  server.registerResource(
    "guild-channels",
    new ResourceTemplate("discord://guild/{guildId}/channels", { list: undefined }),
    {
      title: "Guild Channels",
      description:
        "All channels in the actor's guild (text, voice, forum, threadable). Includes name, type, parent_id, and topic. Verified-tier or higher.",
      mimeType: "application/json",
    },
    async (uri, vars, extra) => {
      const auth = await authorizeOrFail(extra as McpExtra | undefined, "verified", "guild-channels");
      const guildIdRaw = Array.isArray(vars.guildId) ? vars.guildId[0] : vars.guildId;
      const guildId = String(guildIdRaw ?? auth.actor.guildId ?? "").trim();
      if (!/^\d{17,20}$/.test(guildId)) {
        throw new Error("guildId must be a Discord snowflake.");
      }
      if (auth.actor.guildId && guildId !== auth.actor.guildId) {
        throw new Error(`Guild ${guildId} does not match the actor's guild ${auth.actor.guildId}.`);
      }
      const result = await discordRequest(await resolveDiscordConfigCached(), {
        method: "GET",
        path: `/guilds/${guildId}/channels`,
        auditReason: `agent-z: ${auth.actor.userId ?? "?"} guild-channels ${auth.tier}`,
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Discord returned ${result.status} for /guilds/${guildId}/channels.`);
      }
      return jsonContents(uri.href, result.body);
    }
  );

  // ─── discord://channel/{channelId}/pinned ───────────────────────────────
  server.registerResource(
    "channel-pinned",
    new ResourceTemplate("discord://channel/{channelId}/pinned", { list: undefined }),
    {
      title: "Pinned Messages",
      description:
        "Pinned messages for a channel. Useful for letting the model anchor its answer in the channel's curated context. Verified-tier or higher.",
      mimeType: "application/json",
    },
    async (uri, vars, extra) => {
      const auth = await authorizeOrFail(extra as McpExtra | undefined, "verified", "channel-pinned");
      const channelIdRaw = Array.isArray(vars.channelId) ? vars.channelId[0] : vars.channelId;
      const channelId = String(channelIdRaw ?? "").trim();
      if (!/^\d{17,20}$/.test(channelId)) {
        throw new Error("channelId must be a Discord snowflake.");
      }
      const result = await discordRequest(await resolveDiscordConfigCached(), {
        method: "GET",
        path: `/channels/${channelId}/pins`,
        auditReason: `agent-z: ${auth.actor.userId ?? "?"} channel-pinned ${auth.tier}`,
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Discord returned ${result.status} for /channels/${channelId}/pins.`);
      }
      return jsonContents(uri.href, result.body);
    }
  );

  // ─── agent-z://config/server-info ───────────────────────────────────────
  server.registerResource(
    "server-info",
    "agent-z://config/server-info",
    {
      title: "Agent Z Server Info",
      description:
        "Operational summary of the Discord MCP server: version, the resolved actor tier, and a quick capability listing. Useful for client diagnostics. Public.",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const actor = (extra as McpExtra | undefined)?.authInfo?.extra?.actor;
      const tier = actor ? await resolveTier(actor) : "public";
      return jsonContents(uri.href, {
        name: "agent-z-discord-mcp",
        version: "0.1.0",
        callerTier: tierLabel(tier),
        callerHasGuild: Boolean(actor?.guildId),
        callerIsDirectMessage: Boolean(actor?.isDirectMessage),
      });
    }
  );
}
