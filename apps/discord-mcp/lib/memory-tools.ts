/**
 * Memory-related MCP tools.
 *
 * These tools read and write the `ConversationTurn`, `UserProfile`, and `ScheduledMessage`
 * tables introduced in Phase 3 of the Discord agent rebuild. They are intentionally split
 * out of `tools.ts` so the Discord-API surface and the persistent-memory surface each have
 * their own focused module.
 *
 * Tier policy:
 *   - read_user_profile / recall_conversation:  verified (any subscribed member)
 *   - remember_about_user:                      verified (anyone can ask the bot to remember
 *                                               something about themselves; we still re-
 *                                               check userId === actor.userId before write)
 *   - schedule_message / cancel_scheduled_message: verified
 *   - forget_about_user (admin):                admin (compliance / GDPR cleanup)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  cancelScheduledMessage,
  enqueueScheduledMessage,
  forgetUser,
  loadRecentTurns,
  loadUserProfile,
  rememberAboutUser,
} from "@repo/db";
import { confirmDestructive } from "./elicitation";
import { meetsTier, resolveTier, type Tier } from "./tier";
import type { Actor } from "./auth";

type McpToolContext = {
  authInfo?: {
    extra?: {
      actor?: Actor;
    };
  };
  request?: {
    sendRequest?: (
      method: string,
      params: unknown,
      schema: unknown,
      options?: { timeout?: number }
    ) => Promise<unknown>;
  };
};

type ToolResultContent = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const SNOWFLAKE = z.string().regex(/^\d{17,20}$/, "must be a Discord snowflake");

function textResult(text: string, opts?: { isError?: boolean }): ToolResultContent {
  return {
    content: [{ type: "text", text }],
    isError: opts?.isError === true ? true : undefined,
  };
}

async function readActor(
  ctx: McpToolContext
): Promise<{ actor: Actor; tier: Tier } | { error: string }> {
  const actor = ctx.authInfo?.extra?.actor;
  if (!actor) {
    return {
      error:
        "Missing actor headers; the MCP client did not forward Discord identity (X-Actor-Discord-*).",
    };
  }
  const tier = await resolveTier(actor);
  return { actor, tier };
}

function tierGate(actual: Tier, required: Tier, action: string): ToolResultContent | null {
  if (meetsTier(actual, required)) return null;
  return textResult(
    `Insufficient tier for "${action}". This tool requires the ${required} role tier; the caller resolves to ${actual}.`,
    { isError: true }
  );
}

export function registerMemoryTools(server: McpServer) {
  // ─── remember_about_user ──────────────────────────────────────────────
  server.registerTool(
    "remember_about_user",
    {
      title: "Remember About User",
      description:
        "Append a durable note to a user's profile, optionally update preferences. " +
        "Use this when the user explicitly says 'remember that…' or shares a stable fact " +
        "that should persist across conversations. Notes are capped to the most recent 200; " +
        "older notes age out. Callers can only modify their own profile unless they are admin.",
      inputSchema: {
        userId: SNOWFLAKE.optional(),
        displayName: z.string().min(1).max(64).optional(),
        note: z
          .object({
            text: z.string().min(1).max(1000),
            kind: z.string().min(1).max(32).optional(),
          })
          .optional(),
        preferences: z.record(z.unknown()).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "remember_about_user");
      if (denied) return denied;

      const targetUserId = input.userId ?? auth.actor.userId;
      if (!targetUserId) {
        return textResult("No userId provided and no actor user id available.", {
          isError: true,
        });
      }
      if (targetUserId !== auth.actor.userId && !meetsTier(auth.tier, "admin")) {
        return textResult(
          "Only admins can write to another user's profile. Drop the userId argument to write to your own.",
          { isError: true }
        );
      }
      if (!input.note && !input.preferences && !input.displayName) {
        return textResult(
          "Nothing to remember: provide at least one of `note`, `preferences`, or `displayName`.",
          { isError: true }
        );
      }

      try {
        const next = await rememberAboutUser({
          userId: targetUserId,
          displayName: input.displayName,
          note: input.note
            ? { text: input.note.text, kind: input.note.kind, at: new Date().toISOString() }
            : undefined,
          preferences: input.preferences,
        });
        const noteCount = next.notes.length;
        const summary = `Updated profile for <@${targetUserId}>. Notes on file: ${noteCount}. Preference keys: ${Object.keys(
          next.preferences
        ).length}.`;
        return textResult(summary);
      } catch (error) {
        return textResult(
          `Failed to update profile: ${error instanceof Error ? error.message : String(error)}`,
          { isError: true }
        );
      }
    }
  );

  // ─── read_user_profile ────────────────────────────────────────────────
  server.registerTool(
    "read_user_profile",
    {
      title: "Read User Profile",
      description:
        "Load the persistent profile (notes + preferences) for a specific Discord user. " +
        "Returns a structured snapshot suitable for citing back to the user. Callers may " +
        "always read their own profile; reading another user's profile requires mod tier.",
      inputSchema: {
        userId: SNOWFLAKE.optional(),
        maxNotes: z.number().int().min(1).max(50).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "read_user_profile");
      if (denied) return denied;

      const targetUserId = input.userId ?? auth.actor.userId;
      if (!targetUserId) {
        return textResult("No userId provided and no actor user id available.", {
          isError: true,
        });
      }
      if (targetUserId !== auth.actor.userId && !meetsTier(auth.tier, "mod")) {
        return textResult(
          "Reading another user's profile requires the mod tier. Drop the userId argument to read your own.",
          { isError: true }
        );
      }

      const profile = await loadUserProfile(targetUserId);
      if (!profile) {
        return textResult(`No profile on file for <@${targetUserId}>.`);
      }
      const cap = input.maxNotes ?? 25;
      const recentNotes = profile.notes.slice(-cap);
      const payload = {
        userId: profile.userId,
        displayName: profile.displayName,
        lastSeenAt: profile.lastSeenAt?.toISOString() ?? null,
        updatedAt: profile.updatedAt.toISOString(),
        noteCount: profile.notes.length,
        notes: recentNotes,
        preferences: profile.preferences,
      };
      return textResult(JSON.stringify(payload, null, 2));
    }
  );

  // ─── recall_conversation ──────────────────────────────────────────────
  server.registerTool(
    "recall_conversation",
    {
      title: "Recall Conversation",
      description:
        "Return the most recent conversation turns for a channel. Useful when the agent is " +
        "asked 'what were we just talking about?'. Limited to 50 turns per call. The runtime " +
        "system prompt already includes the last 12 turns, so only call this when you need to " +
        "look further back.",
      inputSchema: {
        channelId: SNOWFLAKE,
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "recall_conversation");
      if (denied) return denied;

      const turns = await loadRecentTurns({
        channelId: input.channelId,
        limit: input.limit ?? 25,
      });
      if (turns.length === 0) {
        return textResult(`No conversation turns recorded for <#${input.channelId}>.`);
      }
      const lines = turns.map((t) => {
        const author = t.role === "assistant" ? "agent-z" : t.userId;
        return `[${t.createdAt.toISOString()}] ${t.role}<${author}>: ${t.content}`;
      });
      return textResult(lines.join("\n"));
    }
  );

  // ─── schedule_message ─────────────────────────────────────────────────
  server.registerTool(
    "schedule_message",
    {
      title: "Schedule Message",
      description:
        "Queue a message to be posted in a channel at a future time. The cron worker " +
        "(/api/cron/scheduled-msgs, every minute) drains pending rows and posts them. " +
        "Replaces the old workflow-based reminder path. Time must be ISO-8601 and in the future.",
      inputSchema: {
        channelId: SNOWFLAKE,
        guildId: SNOWFLAKE.optional(),
        scheduledFor: z.string().datetime(),
        content: z.string().min(1).max(2000),
        targetUserIds: z.array(SNOWFLAKE).max(20).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "schedule_message");
      if (denied) return denied;
      if (!auth.actor.userId) {
        return textResult("Cannot schedule: actor is missing userId.", { isError: true });
      }

      const when = new Date(input.scheduledFor);
      if (Number.isNaN(when.getTime())) {
        return textResult(
          "Invalid scheduledFor; pass an ISO-8601 datetime string.",
          { isError: true }
        );
      }
      if (when.getTime() <= Date.now() + 30_000) {
        return textResult(
          "scheduledFor must be at least 30 seconds in the future.",
          { isError: true }
        );
      }

      try {
        const row = await enqueueScheduledMessage({
          channelId: input.channelId,
          guildId: input.guildId,
          scheduledFor: when,
          content: input.content,
          authorUserId: auth.actor.userId,
          targetUserIds: input.targetUserIds ?? [],
        });
        return textResult(
          `Scheduled message ${row.id} for ${row.scheduledFor.toISOString()} in <#${input.channelId}>.`
        );
      } catch (error) {
        return textResult(
          `Failed to schedule: ${error instanceof Error ? error.message : String(error)}`,
          { isError: true }
        );
      }
    }
  );

  // ─── cancel_scheduled_message ─────────────────────────────────────────
  server.registerTool(
    "cancel_scheduled_message",
    {
      title: "Cancel Scheduled Message",
      description:
        "Cancel a pending scheduled message by id. Only the original author or an admin " +
        "may cancel a scheduled message.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "cancel_scheduled_message");
      if (denied) return denied;
      if (!auth.actor.userId) {
        return textResult("Cannot cancel: actor is missing userId.", { isError: true });
      }

      const result = await cancelScheduledMessage(input.id, auth.actor.userId);
      if (result.ok) {
        return textResult(`Cancelled scheduled message ${input.id}.`);
      }
      return textResult(`Could not cancel: ${result.reason}.`, { isError: true });
    }
  );

  // ─── forget_about_user (admin compliance) ─────────────────────────────
  server.registerTool(
    "forget_about_user",
    {
      title: "Forget About User",
      description:
        "Hard-delete a user's persistent memory: conversation turns, profile, and pending " +
        "scheduled messages. Admin-only. Used for GDPR / compliance requests; the user-facing " +
        "/forget-me slash command provides the same behavior to end users for their own data.",
      inputSchema: {
        userId: SNOWFLAKE,
        reason: z.string().min(1).max(512),
        preConfirmed: z.boolean().optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "admin", "forget_about_user");
      if (denied) return denied;

      const confirmation = await confirmDestructive(ctx as McpToolContext, {
        action: "forget_about_user",
        impactSummary: `permanently delete all stored memory for <@${input.userId}> — reason: ${input.reason}`,
        threshold: 0,
        preConfirmed: input.preConfirmed,
      });
      if (!confirmation.confirmed) {
        return textResult(`Aborted: ${confirmation.reason}`, { isError: true });
      }

      try {
        const summary = await forgetUser(input.userId);
        return textResult(
          `Forgot user ${input.userId}. Deleted ${summary.conversationTurnsDeleted} conversation turns, ` +
            `${summary.profileDeleted ? "removed profile" : "no profile to remove"}, ` +
            `cancelled ${summary.scheduledMessagesCancelled} scheduled messages. Reason: ${input.reason}.`
        );
      } catch (error) {
        return textResult(
          `Forget failed: ${error instanceof Error ? error.message : String(error)}`,
          { isError: true }
        );
      }
    }
  );
}
