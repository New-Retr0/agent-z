import { PUBLIC_AGENT_Z_HELP_MARKDOWN } from "@repo/agent/public-help-markdown";
import {
  forgetUser,
  loadPendingActionByToken,
  resolvePendingAction,
  updatePendingActionSummary,
} from "@repo/db";
import { extractPaTokenFromAssistantText } from "@/lib/agent-z/pending-action-token";
import { runAgentZ } from "@/lib/agent-z/run";
import { formatAgentZWhyDebugMarkdown } from "@/lib/agent-z/debug-why";
import { stagedActionHookToken } from "@/lib/workflows/staged-action";
import { applyAgentRateLimit } from "@/lib/rate-limit";
import { buildAgentZHelpDiscordPayload } from "@/lib/discord-help";
import { resolveDiscordAccess } from "@/lib/discord-access";
import { resumeHook } from "workflow/api";
import {
  DISCORD_ADMIN_REPLY_MAX_CHARS,
  DISCORD_PUBLIC_REPLY_MAX_CHARS,
  editOriginalInteraction,
  formatDiscordChunks,
  postDiscordInteractionFollowup,
} from "@/lib/discord-replies";
import {
  STAGED_EDIT_SUBMIT_PREFIX,
  STAGED_EDIT_TEXT_INPUT_ID,
  buildStagingDiscordEmbed,
  buildStagedActionComponents,
  refreshStagedActionInteractionMessage,
} from "@/lib/discord-staged-ui";

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
    try {
      const payload = await buildAgentZHelpDiscordPayload({ discordContext: getNativeDiscordContext(interaction) });
      await editOriginalInteraction(applicationId, token, "\u200b", {
        flags: 0,
        embeds: payload.embeds,
        components: payload.components,
        allowedMentions: mentionAllowList(invokerUserIdForMention),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await editOriginalInteraction(applicationId, token, `${PUBLIC_AGENT_Z_HELP_MARKDOWN}\n\n_(help embed failed: ${message})_`, {
        flags: 0,
        allowedMentions: mentionAllowList(invokerUserIdForMention),
      });
    }
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
    const stagedToken = result.stagedPaToken ?? extractPaTokenFromAssistantText(result.text);
    const pendingRow = stagedToken ? await loadPendingActionByToken(stagedToken) : null;
    const comps =
      stagedToken && pendingRow
        ? buildStagedActionComponents({ token: stagedToken, capability: pendingRow.capability })
        : stagedToken
          ? [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3,
                    label: "Confirm",
                    custom_id: `azconfirm:${stagedToken}`,
                  },
                  {
                    type: 2,
                    style: 4,
                    label: "Cancel",
                    custom_id: `azcancel:${stagedToken}`,
                  },
                ],
              },
            ]
        : [];

    const embedFirst =
      stagedToken && pendingRow
        ? [
            buildStagingDiscordEmbed({
              token: stagedToken,
              capability: pendingRow.capability,
              summary: pendingRow.summary,
              expiresAt: pendingRow.expiresAt,
              assistantSnippet: result.text.slice(0, 700),
            }),
          ]
        : undefined;

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
      embedsFirstMessageOnly: embedFirst,
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
    /** Optional embeds on the first PATCH (staged admin UX). */
    embedsFirstMessageOnly?: unknown[];
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
    embeds: opts.embedsFirstMessageOnly,
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
      "Only users mapped to **admin** tier in `/admin/config` may confirm destructive staged actions.",
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

async function discordBotRequestJson(path: string): Promise<unknown> {
  const bot = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!bot) throw new Error("DISCORD_BOT_TOKEN is not set");
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { authorization: `Bot ${bot}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Discord REST ${res.status}: ${text.slice(0, 260)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function previewJsonFence(obj: unknown): string {
  return "```json\n" + JSON.stringify(obj, null, 2).slice(0, 1800) + "\n```";
}

function extractModalTextField(interaction: Record<string, unknown>, customId: string): string | undefined {
  const data = recordProp(interaction, "data");
  const rows = Array.isArray(data?.components) ? data.components : [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const inner = Array.isArray(r.components) ? r.components : [];
    for (const cmp of inner) {
      const c = cmp as Record<string, unknown>;
      if (c.custom_id === customId && typeof c.value === "string") return c.value;
    }
  }
  return undefined;
}

export async function handlePendingActionDetailButton(interaction: Record<string, unknown>, token: string) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const itoken = stringProp(interaction, "token");
  if (!applicationId || !itoken) return;

  const pending = await loadPendingActionByToken(token);
  if (!pending || pending.status !== "pending") {
    await postDiscordInteractionFollowup(applicationId, itoken, "This staged action is no longer pending.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  const actorId = extractInvokerUserId(interaction);
  if (!actorId || actorId !== pending.invokerUserId) {
    await postDiscordInteractionFollowup(applicationId, itoken, "Only the staff member who queued this action can open details.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  const input = safeParseObject(pending.inputJson);
  const fenced = previewJsonFence({ capability: pending.capability, summary: pending.summary, input }).slice(0, 4050);

  await postDiscordInteractionFollowup(applicationId, itoken, "\u200b", {
    flags: EPHEMERAL_FLAG,
    embeds: [{ title: "Staged action details", description: fenced || "_(empty)_", color: 0x38bdf8 }],
  });
}

export async function handlePendingActionPreviewButton(interaction: Record<string, unknown>, token: string) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const itoken = stringProp(interaction, "token");
  if (!applicationId || !itoken) return;

  const pending = await loadPendingActionByToken(token);
  if (!pending || pending.status !== "pending") {
    await postDiscordInteractionFollowup(applicationId, itoken, "This staged action is no longer pending.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  const actorId = extractInvokerUserId(interaction);
  if (!actorId || actorId !== pending.invokerUserId) {
    await postDiscordInteractionFollowup(applicationId, itoken, "Only the staff member who queued this action can preview targets.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  const cap = pending.capability.toLowerCase();
  const input = safeParseObject(pending.inputJson);

  let body = "";
  try {
    if (cap.includes("bulk_delete")) {
      const channelId = String(input.channelId ?? "");
      if (!/^\d{17,20}$/.test(channelId)) throw new Error("missing channelId in staged input JSON");
      const data = await discordBotRequestJson(`/channels/${channelId}/messages?limit=12`);
      if (!Array.isArray(data)) throw new Error("unexpected Discord messages payload");
      const lines = data
        .map((m) => {
          if (!m || typeof m !== "object") return "";
          const r = m as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : "";
          const content = typeof r.content === "string" ? r.content : "";
          return `- \`${id.slice(0, 10)}…\` ${content.slice(0, 120)}`;
        })
        .filter(Boolean);
      body = `Recent messages for <#${channelId}>:\n${lines.join("\n")}`.slice(0, 3950);
    } else if (cap.includes("delete_message") || cap.includes("edit_message")) {
      const channelId = String(input.channelId ?? "");
      const messageId = String(input.messageId ?? "");
      if (!/^\d{17,20}$/.test(channelId) || !/^\d{17,20}$/.test(messageId)) {
        throw new Error("missing channelId/messageId");
      }
      const msg = await discordBotRequestJson(`/channels/${channelId}/messages/${messageId}`);
      body = "```json\n" + JSON.stringify(msg, null, 2).slice(0, 3600) + "\n```";
    } else {
      body = previewJsonFence(input);
    }
  } catch (e) {
    body = `Preview failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  await postDiscordInteractionFollowup(applicationId, itoken, "\u200b", {
    flags: EPHEMERAL_FLAG,
    embeds: [{ title: "Staged preview", description: body.slice(0, 4096), color: 0x22c55e }],
  });
}

export async function handleStagedSummaryModalSubmit(interaction: Record<string, unknown>) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const itoken = stringProp(interaction, "token");
  if (!applicationId || !itoken) return;

  const data = recordProp(interaction, "data");
  const cid = typeof data?.custom_id === "string" ? data.custom_id.trim() : "";
  if (!cid.startsWith(STAGED_EDIT_SUBMIT_PREFIX)) return;

  const token = cid.slice(STAGED_EDIT_SUBMIT_PREFIX.length);
  const pending = await loadPendingActionByToken(token);
  if (!pending || pending.status !== "pending") {
    await postDiscordInteractionFollowup(applicationId, itoken, "This staged action is no longer pending.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  const actorId = extractInvokerUserId(interaction);
  if (!actorId || actorId !== pending.invokerUserId) {
    await postDiscordInteractionFollowup(
      applicationId,
      itoken,
      "Only the staff member who queued this action may edit this summary.",
      { flags: EPHEMERAL_FLAG }
    );
    return;
  }

  const raw = extractModalTextField(interaction, STAGED_EDIT_TEXT_INPUT_ID)?.trim() ?? "";
  if (!raw) {
    await postDiscordInteractionFollowup(applicationId, itoken, "Summary was empty.", { flags: EPHEMERAL_FLAG });
    return;
  }

  await updatePendingActionSummary({ token, summary: raw });
  const latest = await loadPendingActionByToken(token);
  if (!latest || latest.status !== "pending") {
    await postDiscordInteractionFollowup(applicationId, itoken, "Updated summary, but the pending row vanished.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  await refreshStagedActionInteractionMessage({
    token: latest.token,
    capability: latest.capability,
    summary: latest.summary,
    expiresAt: latest.expiresAt,
    interactionApplicationId: latest.interactionApplicationId,
    interactionToken: latest.interactionToken,
  }).catch(() => false);

  await postDiscordInteractionFollowup(applicationId, itoken, "**Summary saved.** Reload the ephemeral card if Discord cached the older embed.", {
    flags: EPHEMERAL_FLAG,
  });
}

export async function handleAgentZHelpComponent(interaction: Record<string, unknown>, kind: "why" | "forget") {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const itoken = stringProp(interaction, "token");
  if (!applicationId || !itoken) return;

  const discordCtx = getNativeDiscordContext(interaction);
  const actor = extractInvokerUserId(interaction);

  if (!actor) {
    await postDiscordInteractionFollowup(applicationId, itoken, "Could not read your Discord user id.", {
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  if (kind === "forget") {
    try {
      const summary = await forgetUser(actor);
      const lines = [
        "**You're forgotten.**",
        `- Deleted ${summary.conversationTurnsDeleted} conversation turn${summary.conversationTurnsDeleted === 1 ? "" : "s"}.`,
        `- ${summary.profileDeleted ? "Removed your stored profile." : "No profile to remove."}`,
        `- Cancelled ${summary.scheduledMessagesCancelled} pending scheduled message${summary.scheduledMessagesCancelled === 1 ? "" : "s"}.`,
        "",
        "New conversations may be logged going forward; use **Forget me** again if needed.",
      ];
      await postDiscordInteractionFollowup(applicationId, itoken, lines.join("\n"), { flags: EPHEMERAL_FLAG });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await postDiscordInteractionFollowup(applicationId, itoken, `**Forget failed**: ${msg}`, { flags: EPHEMERAL_FLAG });
    }
    return;
  }

  const accessWhy = await resolveDiscordAccess(discordCtx);
  if (!accessWhy.allowed || (accessWhy.tier !== "mod" && accessWhy.tier !== "admin")) {
    await postDiscordInteractionFollowup(
      applicationId,
      itoken,
      "The **Why** shortcut requires **mod** or **admin** tier (same mapping as `/agent-z-admin`).",
      { flags: EPHEMERAL_FLAG }
    );
    return;
  }

  try {
    const md = await formatAgentZWhyDebugMarkdown({
      surface: "public",
      tier: accessWhy.tier,
      discordCtx,
      invokerUserId: actor,
      samplePrompt: undefined,
    });
    await pushChunkedInteractionReply(applicationId, itoken, md, {
      flags: EPHEMERAL_FLAG,
      maxTotalChars: DISCORD_PUBLIC_REPLY_MAX_CHARS,
      maxChunks: 4,
      allowedMentions: mentionAllowList(actor),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await postDiscordInteractionFollowup(applicationId, itoken, `Diagnostic failed: ${message}`, {
      flags: EPHEMERAL_FLAG,
    });
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
