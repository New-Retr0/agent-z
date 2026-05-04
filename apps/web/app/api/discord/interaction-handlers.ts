import { loadPendingActionByToken, resolvePendingAction } from "@repo/db";
import { extractPaTokenFromAssistantText } from "@/lib/agent-z/pending-action-token";
import { runAgentZ } from "@/lib/agent-z/run";
import { formatAgentZWhyDebugMarkdown } from "@/lib/agent-z/debug-why";
import { stagedActionHookToken } from "@/lib/workflows/staged-action";
import { applyAgentRateLimit } from "@/lib/rate-limit";
import { resolveDiscordAccess } from "@/lib/discord-access";
import { resumeHook } from "workflow/api";
import {
  DISCORD_ADMIN_REPLY_MAX_CHARS,
  DISCORD_PUBLIC_REPLY_MAX_CHARS,
  editOriginalInteraction,
  formatDiscordChunks,
  postDiscordInteractionFollowup,
} from "@/lib/discord-replies";

const EPHEMERAL_FLAG = 64;

export async function handleAgentZPublicSlashInteraction(interaction: Record<string, unknown>) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const token = stringProp(interaction, "token");
  const channelId = stringProp(interaction, "channel_id");

  if (!applicationId || !token || !channelId) {
    await editOriginalInteraction(applicationId, token, "**Agent Z** is not configured.", { flags: 0 });
    return;
  }

  const invokerUserIdForMention = extractInvokerUserId(interaction);

  const args = extractSlashText(interaction).trim() || "help";
  if (args === "help") {
    await editOriginalInteraction(applicationId, token, "Use `/agent-z text:<question>` for normal help. Staff (mod+) can run `/agent-z why` for diagnostics. Staff can use `/agent-z-admin action:<request>` for private mod/admin runs.", {
      flags: 0,
      allowedMentions: mentionAllowList(invokerUserIdForMention),
    });
    return;
  }

  const lower = args.toLowerCase();
  if (lower === "why" || lower.startsWith("why ")) {
    const invokerEarly = invokerUserIdForMention;
    if (!invokerEarly) {
      await editOriginalInteraction(applicationId, token, "Could not read your Discord user id.", { flags: 0 });
      return;
    }
    const discordCtx = getNativeDiscordContext(interaction);
    const accessWhy = await resolveDiscordAccess(discordCtx);
    if (!accessWhy.allowed || (accessWhy.tier !== "mod" && accessWhy.tier !== "admin")) {
      await editOriginalInteraction(
        applicationId,
        token,
        "`/agent-z why` is limited to **mod** or **admin** tier (same mapping as `/agent-z-admin`).",
        { flags: 0, allowedMentions: mentionAllowList(invokerEarly) }
      );
      return;
    }
    const decisionEarly = await applyAgentRateLimit(invokerEarly);
    if (!decisionEarly.allowed) {
      await editOriginalInteraction(applicationId, token, decisionEarly.reason, {
        flags: 0,
        allowedMentions: mentionAllowList(invokerEarly),
      });
      return;
    }
    try {
      const samplePrompt = lower.startsWith("why ") ? args.slice(4).trim() : undefined;
      const md = await formatAgentZWhyDebugMarkdown({
        surface: "public",
        tier: accessWhy.tier,
        discordCtx,
        invokerUserId: invokerEarly,
        samplePrompt,
      });
      await pushChunkedInteractionReply(applicationId, token, md, {
        flags: 0,
        maxTotalChars: DISCORD_PUBLIC_REPLY_MAX_CHARS,
        maxChunks: 4,
        allowedMentions: mentionAllowList(invokerEarly),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await editOriginalInteraction(applicationId, token, `**Agent Z** diagnostic failed: ${message}`, {
        flags: 0,
        allowedMentions: mentionAllowList(invokerEarly),
      });
    }
    return;
  }

  const invokerUserId = invokerUserIdForMention;
  if (!invokerUserId) {
    await editOriginalInteraction(applicationId, token, "Could not read your Discord user id.", { flags: 0 });
    return;
  }

  const decision = await applyAgentRateLimit(invokerUserId);
  if (!decision.allowed) {
    await editOriginalInteraction(applicationId, token, decision.reason, { flags: 0, allowedMentions: mentionAllowList(invokerUserId) });
    return;
  }

  try {
    const result = await runAgentZ({
      prompt: args,
      invokerUserId,
      discordContext: getNativeDiscordContext(interaction),
      surface: "public",
    });

    await pushChunkedInteractionReply(applicationId, token, result.text, {
      flags: 0,
      maxTotalChars: DISCORD_PUBLIC_REPLY_MAX_CHARS,
      maxChunks: 3,
      allowedMentions: mentionAllowList(invokerUserId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await editOriginalInteraction(applicationId, token, `**Agent Z** could not answer: ${message}`, {
      flags: 0,
      allowedMentions: mentionAllowList(invokerUserId),
    });
  }
}

export async function handleAgentZAdminInteraction(interaction: Record<string, unknown>) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const token = stringProp(interaction, "token");
  const action = extractSlashText(interaction).trim();
  const invokerUserId = extractInvokerUserId(interaction);

  if (!applicationId || !token) {
    await editOriginalInteraction(applicationId, token, "**Agent Z admin** is not configured.", { flags: EPHEMERAL_FLAG });
    return;
  }
  if (!action || !invokerUserId) {
    await editOriginalInteraction(
      applicationId,
      token,
      "Use `/agent-z-admin action:<staff request>` or `/agent-z-admin action:why` for diagnostics.",
      { flags: EPHEMERAL_FLAG }
    );
    return;
  }

  const discordCtx = getNativeDiscordContext(interaction);
  const accessEarly = await resolveDiscordAccess(discordCtx);
  if (!accessEarly.allowed) {
    await editOriginalInteraction(applicationId, token, accessEarly.reason, { flags: EPHEMERAL_FLAG });
    return;
  }
  if (accessEarly.tier !== "mod" && accessEarly.tier !== "admin") {
    await editOriginalInteraction(
      applicationId,
      token,
      "`/agent-z-admin` is limited to **mod** or **admin** roles in the mapping. Use `/agent-z` for public help.",
      { flags: EPHEMERAL_FLAG }
    );
    return;
  }

  const decision = await applyAgentRateLimit(invokerUserId);
  if (!decision.allowed) {
    await editOriginalInteraction(applicationId, token, decision.reason, {
      flags: EPHEMERAL_FLAG,
      allowedMentions: mentionAllowList(invokerUserId),
    });
    return;
  }

  const lowerAction = action.toLowerCase();
  if (lowerAction === "why" || lowerAction.startsWith("why ")) {
    try {
      const samplePrompt = lowerAction.startsWith("why ") ? action.slice(4).trim() : undefined;
      const md = await formatAgentZWhyDebugMarkdown({
        surface: "admin",
        tier: accessEarly.tier,
        discordCtx,
        invokerUserId,
        samplePrompt,
      });
      await pushChunkedInteractionReply(applicationId, token, md, {
        flags: EPHEMERAL_FLAG,
        maxTotalChars: DISCORD_ADMIN_REPLY_MAX_CHARS,
        maxChunks: 5,
        allowedMentions: mentionAllowList(invokerUserId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await editOriginalInteraction(applicationId, token, `**Agent Z admin** diagnostic failed: ${message}`, {
        flags: EPHEMERAL_FLAG,
        allowedMentions: mentionAllowList(invokerUserId),
      });
    }
    return;
  }

  try {
    const result = await runAgentZ({
      prompt: action,
      invokerUserId,
      discordContext: discordCtx,
      surface: "admin",
      discordInteraction: { token, applicationId },
    });
    const staged = result.stagedPaToken ?? extractPaTokenFromAssistantText(result.text);
    const comps = staged ? stagedActionComponents(staged) : [];
    const diagPrefix =
      process.env.AGENT_Z_DIAGNOSTICS_HEADER === "1" && typeof result.discordToolsOffered === "number"
        ? `_diag · discord_ tools exposed to model: ${result.discordToolsOffered}_\n\n`
        : "";
    await pushChunkedInteractionReply(applicationId, token, `${diagPrefix}${result.text}`, {
      flags: EPHEMERAL_FLAG,
      maxTotalChars: DISCORD_ADMIN_REPLY_MAX_CHARS,
      maxChunks: 4,
      allowedMentions: mentionAllowList(invokerUserId),
      componentsFirstMessageOnly: comps,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await editOriginalInteraction(applicationId, token, `**Agent Z admin** could not process: ${message}`, {
      flags: EPHEMERAL_FLAG,
      allowedMentions: mentionAllowList(invokerUserId),
    });
  }
}

function mentionAllowList(userId: string | undefined) {
  return userId ? { parse: [] as string[], users: [userId] } : { parse: [] as string[] };
}

async function pushChunkedInteractionReply(
  applicationId: string | undefined,
  token: string | undefined,
  text: string,
  opts: {
    flags: number;
    maxTotalChars: number;
    maxChunks: number;
    allowedMentions?: { parse: string[]; users?: string[] };
    /** Routed to the first PATCH only (e.g. Confirm/Cancel for staged MCP). */
    componentsFirstMessageOnly?: Array<Record<string, unknown>>;
  }
) {
  const chunks = formatDiscordChunks(text, {
    maxTotalChars: opts.maxTotalChars,
    maxChunks: opts.maxChunks,
  });
  if (chunks.length === 0) {
    return;
  }
  await editOriginalInteraction(applicationId, token, chunks[0] ?? "", {
    flags: opts.flags,
    components: opts.componentsFirstMessageOnly ?? [],
    allowedMentions: opts.allowedMentions,
  });
  for (let i = 1; i < chunks.length; i++) {
    await postDiscordInteractionFollowup(applicationId, token, chunks[i] ?? "", {
      flags: opts.flags,
      allowedMentions: opts.allowedMentions,
    });
  }
}

function getNativeDiscordContext(interaction: Record<string, unknown>) {
  const member = recordProp(interaction, "member");
  const memberUser = recordProp(member, "user");
  const directUser = recordProp(interaction, "user");
  const user = memberUser ?? directUser;
  return {
    guildId: stringProp(interaction, "guild_id"),
    channelId: stringProp(interaction, "channel_id"),
    roleIds: arrayOfStrings(member?.roles),
    isDirectMessage: !stringProp(interaction, "guild_id"),
    invokerUserId: extractInvokerUserId(interaction),
    invokerUsername: stringProp(user, "username"),
    invokerGlobalName: stringProp(user, "global_name"),
  };
}

function stagedActionComponents(token: string): Array<Record<string, unknown>> {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Confirm",
          custom_id: `azconfirm:${token}`,
          disabled: false,
        },
        {
          type: 2,
          style: 4,
          label: "Cancel",
          custom_id: `azcancel:${token}`,
          disabled: false,
        },
      ],
    },
  ];
}

async function patchInteractionMessage(
  applicationId: string,
  interactionToken: string,
  content: string,
  components: Array<Record<string, unknown>>,
  flags: number
) {
  await editOriginalInteraction(applicationId, interactionToken, content, {
    flags,
    components,
    allowedMentions: { parse: [] },
  });
}

export async function handlePendingActionComponent(
  interaction: Record<string, unknown>,
  kind: "confirm" | "cancel",
  token: string
) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const itoken = stringProp(interaction, "token");
  if (!applicationId || !itoken) return;

  const pending = await loadPendingActionByToken(token);
  if (!pending || pending.status !== "pending") {
    await patchInteractionMessage(
      applicationId,
      itoken,
      "This confirmation is no longer valid or already resolved.",
      [],
      EPHEMERAL_FLAG
    );
    return;
  }

  if (pending.expiresAt.getTime() < Date.now()) {
    await resolvePendingAction({ token, status: "expired", resultText: "Expired." });
    await patchInteractionMessage(applicationId, itoken, "This confirmation expired.", [], EPHEMERAL_FLAG);
    return;
  }

  const actorId = extractInvokerUserId(interaction);
  if (!actorId || actorId !== pending.invokerUserId) {
    await patchInteractionMessage(applicationId, itoken, "Only the person who queued this action can confirm or cancel.", [], EPHEMERAL_FLAG);
    return;
  }

  const ctx = getNativeDiscordContext(interaction);
  const access = await resolveDiscordAccess(ctx);
  if (!access.allowed) {
    await patchInteractionMessage(applicationId, itoken, access.reason, [], EPHEMERAL_FLAG);
    return;
  }

  if (kind === "cancel") {
    try {
      await patchInteractionMessage(applicationId, itoken, "Cancelling…", [], EPHEMERAL_FLAG);
      await resumeHook(stagedActionHookToken(token), { kind: "cancel", actorId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await patchInteractionMessage(
        applicationId,
        itoken,
        `Could not signal cancellation (workflow may have finished): ${msg.slice(0, 400)}`,
        [],
        EPHEMERAL_FLAG
      );
    }
    return;
  }

  if (access.tier !== "admin") {
    await patchInteractionMessage(
      applicationId,
      itoken,
      "Only users with **admin** tier (role mapping / owner override) may confirm destructive actions.",
      [],
      EPHEMERAL_FLAG
    );
    return;
  }

  try {
    await patchInteractionMessage(applicationId, itoken, "Confirmed — executing…", [], EPHEMERAL_FLAG);
    await resumeHook(stagedActionHookToken(token), { kind: "confirm", actorId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await patchInteractionMessage(
      applicationId,
      itoken,
      `Could not signal confirmation (workflow may have finished): ${msg.slice(0, 400)}`,
      [],
      EPHEMERAL_FLAG
    );
  }
}

function extractInvokerUserId(interaction: Record<string, unknown>) {
  const memberUser = recordProp(recordProp(interaction, "member"), "user");
  const directUser = recordProp(interaction, "user");
  return stringProp(memberUser, "id") || stringProp(directUser, "id");
}

function extractSlashText(interaction: Record<string, unknown>) {
  const data = recordProp(interaction, "data");
  const options = Array.isArray(data?.options) ? data.options : [];
  return options
    .map((option) => (option && typeof option === "object" && "value" in option ? String((option as { value: unknown }).value) : ""))
    .filter(Boolean)
    .join(" ");
}

function recordProp(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return prop && typeof prop === "object" && !Array.isArray(prop) ? (prop as Record<string, unknown>) : undefined;
}

function stringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === "string" && prop.trim() ? prop.trim() : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
