import { prisma } from "@repo/db";
import {
  discordRequest,
  loadDiscordToolConfig,
  type DiscordToolConfig,
} from "@repo/discord-tools";
import { getRuntimeConfig } from "@repo/config/runtime-config";

export type VerifyOutcome =
  | { kind: "granted"; roleId: string; messageDmStatus: "sent" | "skipped" | "failed" }
  | { kind: "already-verified"; roleId: string }
  | { kind: "config-incomplete"; reason: string }
  | { kind: "wrong-message"; expectedMessageId: string; actualMessageId: string }
  | { kind: "wrong-channel"; expectedChannelId: string; actualChannelId: string }
  | { kind: "wrong-emoji"; expectedEmoji: string; actualEmoji: string }
  | { kind: "error"; reason: string };

export interface VerifyArgs {
  guildId: string;
  channelId: string;
  messageId: string;
  userId: string;
  /** Plain unicode emoji string OR `name:id` for custom emoji. */
  emoji: string;
}

/**
 * Idempotent verify-on-reaction implementation.
 *
 * Validates the reaction matches the configured channel/message/emoji, then:
 *  1. PUT /guilds/{g}/members/{u}/roles/{r}            (grant role)
 *  2. POST /users/@me/channels                         (open DM)
 *  3. POST /channels/{dm}/messages                     (send welcome)
 *  4. INSERT verification_grant                        (audit + dedupe)
 *
 * Repeated calls for the same user-guild-role return `already-verified` cheaply
 * via the unique index on (user_id, guild_id, role_id).
 */
export async function verifyUserFromReaction(args: VerifyArgs): Promise<VerifyOutcome> {
  const rc = await getRuntimeConfig();
  if (!rc.verifiedRoleId) {
    return { kind: "config-incomplete", reason: "verified_role_id is unset" };
  }
  if (!rc.verifyChannelId) {
    return { kind: "config-incomplete", reason: "verify_channel_id is unset" };
  }
  if (rc.verifyChannelId !== args.channelId) {
    return {
      kind: "wrong-channel",
      expectedChannelId: rc.verifyChannelId,
      actualChannelId: args.channelId,
    };
  }
  if (rc.verifyMessageId && rc.verifyMessageId !== args.messageId) {
    return {
      kind: "wrong-message",
      expectedMessageId: rc.verifyMessageId,
      actualMessageId: args.messageId,
    };
  }
  if (!emojiMatches(rc.verifyEmoji, args.emoji)) {
    return {
      kind: "wrong-emoji",
      expectedEmoji: rc.verifyEmoji,
      actualEmoji: args.emoji,
    };
  }

  // Fast-path: existing live grant?
  const existing = await prisma.verificationGrant
    .findUnique({
      where: {
        userId_guildId_roleId: {
          userId: args.userId,
          guildId: args.guildId,
          roleId: rc.verifiedRoleId,
        },
      },
    })
    .catch(() => null);
  if (existing && !existing.revokedAt) {
    return { kind: "already-verified", roleId: rc.verifiedRoleId };
  }

  let config: DiscordToolConfig;
  try {
    config = await loadDiscordToolConfig();
  } catch (e) {
    return {
      kind: "error",
      reason: `discord config not loadable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 1) Grant role.
  const grantRes = await discordRequest(config, {
    method: "PUT",
    path: `/guilds/${args.guildId}/members/${args.userId}/roles/${rc.verifiedRoleId}`,
    auditReason: "Agent Z: reaction-verify",
  });
  if (grantRes.status >= 400) {
    return {
      kind: "error",
      reason: `role grant failed: HTTP ${grantRes.status} ${grantRes.rawBody}`,
    };
  }

  // 2) + 3) DM the welcome message (best-effort).
  let dmStatus: "sent" | "skipped" | "failed" = "skipped";
  if (rc.welcomeDmTemplate.trim()) {
    try {
      const dmCreate = await discordRequest(config, {
        method: "POST",
        path: `/users/@me/channels`,
        body: { recipient_id: args.userId },
      });
      const dm = dmCreate.body as { id?: string } | null;
      if (dmCreate.status < 400 && dm?.id) {
        const send = await discordRequest(config, {
          method: "POST",
          path: `/channels/${dm.id}/messages`,
          body: { content: renderTemplate(rc.welcomeDmTemplate, { userId: args.userId }) },
        });
        dmStatus = send.status < 400 ? "sent" : "failed";
      } else {
        dmStatus = "failed";
      }
    } catch {
      dmStatus = "failed";
    }
  }

  // 4) Persist or revive grant.
  await prisma.verificationGrant.upsert({
    where: {
      userId_guildId_roleId: {
        userId: args.userId,
        guildId: args.guildId,
        roleId: rc.verifiedRoleId,
      },
    },
    create: {
      userId: args.userId,
      guildId: args.guildId,
      roleId: rc.verifiedRoleId,
      reactionMessageId: args.messageId,
      reactionEmoji: args.emoji,
    },
    update: {
      reactionMessageId: args.messageId,
      reactionEmoji: args.emoji,
      revokedAt: null,
      revokedReason: null,
      grantedAt: new Date(),
    },
  });

  return { kind: "granted", roleId: rc.verifiedRoleId, messageDmStatus: dmStatus };
}

/**
 * Match either plain unicode (`✅` / `:white_check_mark:`) or `name:id` custom
 * emoji. Discord delivers the same custom emoji as `name:id` in REST and as
 * `name:id` from chat-bot's `rawEmoji`, so a strict equality check is enough
 * for custom emoji. For unicode, accept either the literal char or one of the
 * common shortcode names that chat-bot normalizes to.
 */
function emojiMatches(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  // chat-bot may emit shortcodes like "white_check_mark" while runtime config
  // stores the unicode char. Treat `:white_check_mark:` ↔ `✅` as equivalent
  // by mapping a small set of common verify emojis.
  const aliases: Record<string, string[]> = {
    "✅": ["white_check_mark", "✅", "check"],
    "👍": ["thumbs_up", "+1", "👍"],
    "🎉": ["tada", "🎉"],
  };
  for (const [unicode, names] of Object.entries(aliases)) {
    if (
      (expected === unicode || names.includes(expected)) &&
      (actual === unicode || names.includes(actual))
    ) {
      return true;
    }
  }
  return false;
}

function renderTemplate(template: string, vars: { userId: string }): string {
  return template.replace(/\{user\}/g, `<@${vars.userId}>`).replace(/\{userId\}/g, vars.userId);
}
