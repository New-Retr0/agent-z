import { randomUUID } from "node:crypto";
import { createGateway, generateText, stepCountIs } from "ai";
import { buildKnowledgeContext } from "@repo/knowledge";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";
import { prisma } from "@repo/db";
import type { AgentReplyTarget, AgentTier, DiscordInvocationContext } from "@repo/agent/types";
import { resolveDiscordAccess } from "@/lib/discord-access";

type DirectRequest = {
  prompt: string;
  invokerUserId: string;
  discordContext: DiscordInvocationContext;
  replyTarget?: AgentReplyTarget;
};

type ReminderProposal = {
  kind: "reminder";
  token: string;
  requestedBy: string;
  channelId: string;
  sourceMessageId?: string;
  targetUserIds: string[];
  reminderText: string;
  dueAt: string;
  originalPrompt: string;
  tier: AgentTier;
};

export type DirectAgentResult =
  | { kind: "answer"; text: string }
  | { kind: "workflowProposal"; token: string; text: string; components: Array<Record<string, unknown>> };

const TIER_RANK = {
  public: 0,
  verified: 1,
  mod: 2,
  admin: 3,
} as const satisfies Record<AgentTier, number>;

export async function runDirectAgentZ(input: DirectRequest): Promise<DirectAgentResult> {
  const access = await resolveDiscordAccess(input.discordContext);
  if (!access.allowed) {
    return { kind: "answer", text: access.reason };
  }

  const tier = lowerTier(access.tier, "verified");
  const reminder = detectReminder(input.prompt, input.invokerUserId, input.replyTarget, tier);
  if (reminder.kind === "clarify") {
    return { kind: "answer", text: reminder.text };
  }
  if (reminder.kind === "proposal") {
    await persistProposal(reminder.proposal);
    return {
      kind: "workflowProposal",
      token: reminder.proposal.token,
      text: formatProposal(reminder.proposal),
      components: buildProposalComponents(reminder.proposal.token),
    };
  }

  const rc = await getRuntimeConfig();
  if (!env.AI_GATEWAY_API_KEY) {
    return {
      kind: "answer",
      text: "Agent Z is missing AI Gateway credentials, so I cannot answer yet.",
    };
  }

  const knowledge = await buildKnowledgeContext(input.prompt, 5);
  const model = createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(rc.modelId);
  const result = await generateText({
    model,
    system: buildDirectSystemPrompt(tier, knowledge, rc.systemPromptOverride),
    messages: [{ role: "user", content: input.prompt }],
    stopWhen: stepCountIs(3),
  });

  return { kind: "answer", text: result.text.trim() || "I could not produce a useful answer." };
}

function lowerTier(actual: AgentTier, max: AgentTier): AgentTier {
  return TIER_RANK[actual] <= TIER_RANK[max] ? actual : max;
}

function buildDirectSystemPrompt(tier: AgentTier, knowledge: string, override: string | null) {
  const base = override?.trim() || "You are Agent Z, a helpful Discord assistant for this server.";
  return `${base}

You are answering through the fast stateless Discord path. Do not claim to have persistent memory, do not expose internal run IDs, and do not mention hidden admin tools or MCP tool names.

Current mode:
- Tier: ${tier}
- Public/verified users get knowledge Q&A, explanation, and light planning only.
- If the user asks for long-running work, scheduling, or actions, say you can propose a confirmed workflow when appropriate.
- Never say you can perform destructive Discord/admin actions in this direct path.

Bundled knowledge that may be relevant:
${knowledge}`;
}

type ReminderDetection =
  | { kind: "none" }
  | { kind: "clarify"; text: string }
  | { kind: "proposal"; proposal: ReminderProposal };

function detectReminder(
  prompt: string,
  invokerUserId: string,
  replyTarget: AgentReplyTarget | undefined,
  tier: AgentTier
): ReminderDetection {
  if (!/\b(remind|reminder|todo|to-do|follow up|schedule)\b/i.test(prompt)) {
    return { kind: "none" };
  }

  if (!replyTarget || replyTarget._type !== "discord:Channel") {
    return {
      kind: "clarify",
      text: "I can schedule that as a workflow from a Discord channel. Try it in the server channel where you want the reminder posted.",
    };
  }

  const dueAt = parseDueAt(prompt);
  if (!dueAt) {
    return {
      kind: "clarify",
      text: "I can schedule that, but I need a clear time like `tomorrow at 9am`, `in 2 hours`, or `May 10 at 3pm`.",
    };
  }

  const targetUserIds = extractMentionedUserIds(prompt);
  if (targetUserIds.length === 0) {
    return {
      kind: "clarify",
      text: "Who should I remind? Mention the Discord user in the request, for example `remind @Alex tomorrow at 9am to submit notes`.",
    };
  }

  return {
    kind: "proposal",
    proposal: {
      kind: "reminder",
      token: randomUUID(),
      requestedBy: invokerUserId,
      channelId: replyTarget.channelId,
      sourceMessageId: replyTarget.messageId,
      targetUserIds,
      reminderText: extractReminderText(prompt),
      dueAt: dueAt.toISOString(),
      originalPrompt: prompt,
      tier,
    },
  };
}

function extractMentionedUserIds(prompt: string) {
  return [...prompt.matchAll(/<@!?(\d{17,20})>/g)].map((match) => match[1]).filter(Boolean);
}

function extractReminderText(prompt: string) {
  const cleaned = prompt
    .replace(/<@!?\d{17,20}>/g, "")
    .replace(/\b(remind|reminder|todo|to-do|follow up|schedule)\b/gi, "")
    .replace(/\b(in \d+\s+(minutes?|hours?|days?)|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|today(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)\b/gi, "")
    .replace(/\b(to|about|that)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "follow up";
}

function parseDueAt(prompt: string): Date | null {
  const now = new Date();
  const relative = prompt.match(/\bin\s+(\d{1,3})\s+(minutes?|hours?|days?)\b/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const ms = unit.startsWith("minute") ? amount * 60_000 : unit.startsWith("hour") ? amount * 3_600_000 : amount * 86_400_000;
    return new Date(now.getTime() + ms);
  }

  const dayMatch = prompt.match(/\b(today|tomorrow)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\b/i);
  if (dayMatch) {
    const due = new Date(now);
    if (dayMatch[1].toLowerCase() === "tomorrow") {
      due.setDate(due.getDate() + 1);
    }
    let hour = dayMatch[2] ? Number(dayMatch[2]) : 9;
    const minute = dayMatch[3] ? Number(dayMatch[3]) : 0;
    const period = dayMatch[4]?.toLowerCase();
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    due.setHours(hour, minute, 0, 0);
    if (due.getTime() <= now.getTime()) {
      due.setDate(due.getDate() + 1);
    }
    return due;
  }

  return null;
}

async function persistProposal(proposal: ReminderProposal) {
  await prisma.confirmation.create({
    data: {
      hookToken: proposal.token,
      requestedBy: proposal.requestedBy,
      summary: JSON.stringify(proposal),
      status: "pending",
    },
  });
}

function formatProposal(proposal: ReminderProposal) {
  const targets = proposal.targetUserIds.map((id) => `<@${id}>`).join(", ");
  return `I can start a reminder workflow.\n\nReminder: ${targets} - ${proposal.reminderText}\nWhen: <t:${Math.floor(new Date(proposal.dueAt).getTime() / 1000)}:F>\n\nClick **Start workflow** to schedule it.`;
}

export function buildProposalComponents(token: string): Array<Record<string, unknown>> {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Start workflow",
          custom_id: `agentz:start:${token}`,
        },
        {
          type: 2,
          style: 4,
          label: "Cancel",
          custom_id: `agentz:cancel:${token}`,
        },
      ],
    },
  ];
}

export type { ReminderProposal };
