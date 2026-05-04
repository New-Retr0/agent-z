import {
  discordRequest,
  loadDiscordToolConfig,
  executeDiscordBanMember,
  executeDiscordBulkDeleteMessages,
  executeDiscordCreateAutoModRule,
  executeDiscordCreateChannel,
  executeDiscordCreateGuildEmoji,
  executeDiscordCreateInvite,
  executeDiscordCreateRole,
  executeDiscordCreateScheduledEvent,
  executeDiscordCreateWebhook,
  executeDiscordDeleteAutoModRule,
  executeDiscordDeleteChannel,
  executeDiscordDeleteGuildEmoji,
  executeDiscordDeleteMessage,
  executeDiscordDeleteRole,
  executeDiscordDeleteScheduledEvent,
  executeDiscordDeleteWebhook,
  executeDiscordEditAutoModRule,
  executeDiscordEditChannel,
  executeDiscordEditMessage,
  executeDiscordEditRole,
  executeDiscordEditScheduledEvent,
  executeDiscordEditThreadMetadata,
  executeDiscordKickMember,
  executeDiscordMemberRoleUpdate,
  executeDiscordMoveMemberVoice,
  executeDiscordReorderRoles,
  executeDiscordSetMemberNickname,
  executeDiscordTimeoutMember,
  executeDiscordUnbanMember,
  type DiscordCapabilityContext,
} from "@repo/discord-tools";
import { writeAuditEntry } from "@/lib/audit";

function ctxFor(pending: {
  invokerUserId: string;
  capability: string;
  guildId: string | null;
}): DiscordCapabilityContext {
  return {
    capabilityId: `execute:${pending.capability}`,
    tier: "admin",
    invokerUserId: pending.invokerUserId,
    expectedGuildId: pending.guildId ?? undefined,
  };
}

function parseInput(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function executePendingDiscordAction(pending: {
  id: string;
  capability: string;
  inputJson: string;
  invokerUserId: string;
  guildId: string | null;
}): Promise<string> {
  const config = loadDiscordToolConfig();
  const raw = parseInput(pending.inputJson);
  const cap = pending.capability;
  const cx = ctxFor(pending);

  const assignWrap = async (action: "assign" | "remove") =>
    executeDiscordMemberRoleUpdate(
      config,
      {
        guildId: String(raw.guildId ?? ""),
        userId: String(raw.userId ?? ""),
        roleId: String(raw.roleId ?? ""),
        reason: raw.reason !== undefined ? String(raw.reason) : undefined,
      },
      cx,
      action
    );

  try {
    let out: string;
    switch (cap) {
      case "kick_member":
        out = await executeDiscordKickMember(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            userId: String(raw.userId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "ban_member":
        out = await executeDiscordBanMember(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            userId: String(raw.userId ?? ""),
            deleteMessageSeconds:
              raw.deleteMessageSeconds === null || raw.deleteMessageSeconds === undefined
                ? undefined
                : Number(raw.deleteMessageSeconds),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "unban_member":
        out = await executeDiscordUnbanMember(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            userId: String(raw.userId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "timeout_member":
        out = await executeDiscordTimeoutMember(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            userId: String(raw.userId ?? ""),
            communicationDisabledUntil:
              raw.communicationDisabledUntil === null || raw.communicationDisabledUntil === undefined
                ? null
                : String(raw.communicationDisabledUntil),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "assign_member_role":
        out = await assignWrap("assign");
        break;
      case "remove_member_role":
        out = await assignWrap("remove");
        break;
      case "set_member_nickname":
        out = await executeDiscordSetMemberNickname(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            userId: String(raw.userId ?? ""),
            nick: raw.nick === undefined ? null : raw.nick === null ? null : String(raw.nick),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "move_member_voice":
        out = await executeDiscordMoveMemberVoice(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            userId: String(raw.userId ?? ""),
            channelId:
              raw.channelId === undefined || raw.channelId === null ? null : String(raw.channelId),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_channel":
        out = await executeDiscordCreateChannel(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "edit_channel":
        out = await executeDiscordEditChannel(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_channel":
        out = await executeDiscordDeleteChannel(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_invite":
        out = await executeDiscordCreateInvite(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            body: raw.body !== undefined ? (raw.body as Record<string, unknown>) : undefined,
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_role":
        out = await executeDiscordCreateRole(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            body: raw.body !== undefined ? (raw.body as Record<string, unknown>) : undefined,
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "edit_role":
        out = await executeDiscordEditRole(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            roleId: String(raw.roleId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_role":
        out = await executeDiscordDeleteRole(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            roleId: String(raw.roleId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "reorder_roles":
        out = await executeDiscordReorderRoles(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            rolePositions: (raw.rolePositions as Array<{ id: string; position: number }>) ?? [],
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "bulk_delete_messages": {
        const channelId = String(raw.channelId ?? "");
        const count = Number(raw.count ?? 0);
        const messages = await discordRequest(config, {
          method: "GET",
          path: `/channels/${channelId}/messages`,
          query: { limit: Math.min(100, Math.max(2, count)) },
          auditReason: `agent-z: ${pending.invokerUserId} bulk_delete inspect`,
        });
        if (messages.status < 200 || messages.status >= 300) {
          throw new Error(`Could not list messages: ${messages.status}`);
        }
        const messageIds = Array.isArray(messages.body)
          ? messages.body.flatMap((entry) =>
              entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as { id?: unknown }).id === "string"
                ? [(entry as { id: string }).id]
                : []
            )
          : [];
        if (messageIds.length < 2) {
          throw new Error("Fewer than 2 deletable messages in window.");
        }
        out = await executeDiscordBulkDeleteMessages(
          config,
          { channelId, messageIds, reason: raw.reason !== undefined ? String(raw.reason) : undefined },
          cx
        );
        break;
      }
      case "edit_message":
        out = await executeDiscordEditMessage(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            messageId: String(raw.messageId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_message":
        out = await executeDiscordDeleteMessage(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            messageId: String(raw.messageId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "edit_thread_metadata":
        out = await executeDiscordEditThreadMetadata(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_scheduled_event":
        out = await executeDiscordCreateScheduledEvent(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "edit_scheduled_event":
        out = await executeDiscordEditScheduledEvent(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            eventId: String(raw.eventId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_scheduled_event":
        out = await executeDiscordDeleteScheduledEvent(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            eventId: String(raw.eventId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_automod_rule":
        out = await executeDiscordCreateAutoModRule(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "edit_automod_rule":
        out = await executeDiscordEditAutoModRule(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            ruleId: String(raw.ruleId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_automod_rule":
        out = await executeDiscordDeleteAutoModRule(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            ruleId: String(raw.ruleId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_guild_emoji":
        out = await executeDiscordCreateGuildEmoji(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            name: String(raw.name ?? ""),
            imageBase64: String(raw.imageBase64 ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_guild_emoji":
        out = await executeDiscordDeleteGuildEmoji(
          config,
          {
            guildId: String(raw.guildId ?? ""),
            emojiId: String(raw.emojiId ?? ""),
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "create_webhook":
        out = await executeDiscordCreateWebhook(
          config,
          {
            channelId: String(raw.channelId ?? ""),
            body: (raw.body as Record<string, unknown>) ?? {},
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      case "delete_webhook":
        out = await executeDiscordDeleteWebhook(
          config,
          {
            webhookId: String(raw.webhookId ?? ""),
            token: raw.token !== undefined ? String(raw.token) : undefined,
            reason: raw.reason !== undefined ? String(raw.reason) : undefined,
          },
          cx
        );
        break;
      default:
        throw new Error(`Unknown capability: ${cap}`);
    }

    await writeAuditEntry({
      actor: `discord:${pending.invokerUserId}`,
      action: `pending:${cap}`,
      target: pending.id,
      afterJson: out.slice(0, 8000),
    });

    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeAuditEntry({
      actor: `discord:${pending.invokerUserId}`,
      action: `pending_failed:${cap}`,
      target: pending.id,
      afterJson: msg,
    });
    throw e;
  }
}
