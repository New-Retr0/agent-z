import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Mod-cockpit prompt templates — the killer feature of "novel use of MCP" track.
 *
 * These templates show up in MCP-aware clients (Cursor, Claude Desktop, ChatGPT custom connectors) as
 * one-click slots in the prompt picker. The LLM still drives the conversation, but the prompt seeds it
 * with a battle-tested instruction set that uses *our* tools.
 */
export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "moderate-spam-wave",
    {
      title: "Moderate spam wave",
      description:
        "Investigate and clean up a recent spam wave in a Discord channel. Walks the agent through identifying violators, drafting replies, and proposing actions before executing.",
      argsSchema: {
        channelId: z.string().describe("Discord channel snowflake to investigate"),
        windowMinutes: z
          .string()
          .optional()
          .describe("How far back to look (in minutes, default 30)"),
      },
    },
    ({ channelId, windowMinutes }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Investigate the last ${windowMinutes ?? "30"} minutes of messages in <#${channelId}> for a possible spam wave.

Steps:
1. Use \`discord_api_read\` with path \`/channels/${channelId}/messages\` and a query of {"limit": 100} to fetch recent messages.
2. Identify users with >3 messages within the window that look spammy (links, repeated content, mass-pings).
3. For each violator, propose: (a) timeout duration (5m, 1h, 24h), (b) message-deletion scope (their last N), (c) a polite explanation post.
4. Use \`discord_api_read\` with path \`/guilds/{guild_id}/audit-logs\` to check whether each user has prior incidents.
5. Wait for explicit approval from the operator before calling \`discord_timeout_member\`, \`bulk_delete_messages\`, or \`discord_send_message\`.

Always cite message IDs, timestamps, and user IDs. Never act without approval.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "triage-help-channel",
    {
      title: "Triage help channel",
      description:
        "Find unanswered questions in a help channel and draft replies. Does not post; surfaces a list for a human moderator.",
      argsSchema: {
        channelId: z.string().describe("Help channel snowflake to triage"),
        unansweredHours: z
          .string()
          .optional()
          .describe("Threshold for 'unanswered' in hours (default 6)"),
      },
    },
    ({ channelId, unansweredHours }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Triage <#${channelId}>. List every question or help request that has not received a substantive reply in the last ${unansweredHours ?? "6"} hours.

For each entry produce:
- \`messageId\`, \`authorId\`, timestamp.
- One-line summary of the question.
- A short proposed reply that I can paste myself, citing any pinned messages or oversight summaries that are relevant.
- Confidence level (high / medium / low) that the reply is correct.

Use \`discord_api_read\` for message listing. Do not post replies; this is a read-only triage.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "vibe-check",
    {
      title: "Vibe check",
      description:
        "Sentiment + mood snapshot of a channel over the last 24 hours. Useful for community managers before posting an announcement.",
      argsSchema: {
        channelId: z.string().describe("Channel snowflake to inspect"),
      },
    },
    ({ channelId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Run a vibe check on <#${channelId}>: read the last ~200 messages from the last 24 hours via \`discord_api_read\` and produce a short report with:
- Overall sentiment (positive / neutral / mixed / negative).
- Top three topics being discussed.
- Any user(s) who appear frustrated, repeatedly off-topic, or potentially in distress (cite message IDs).
- A one-sentence recommended posture for an announcement going up next.

Be honest. Do not hedge. Do not post anything; this is a read-only assessment.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "rules-explainer",
    {
      title: "Rules explainer",
      description:
        "Draft a friendly, plain-language explanation of one or more server rules, intended to be posted by a moderator.",
      argsSchema: {
        rules: z
          .string()
          .describe("Comma-separated rule numbers, or a free-text description of which rules to explain."),
        audience: z
          .string()
          .optional()
          .describe("Audience descriptor: 'new members', 'returning veterans', etc."),
      },
    },
    ({ rules, audience }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Draft a short Discord post explaining these rules: ${rules}.

Audience: ${audience ?? "new members"}.

Format:
- Open with a single welcoming sentence.
- One short paragraph per rule (avoid jargon, no legal-style language).
- Close with one sentence telling people where to ask follow-up questions.

If the channel pinned messages contain examples of how the rules have been applied, fetch them via the \`discord://channel/{channelId}/pinned\` resource and quote one example. Do not post the message yourself; produce the draft for a moderator to send.`,
          },
        },
      ],
    })
  );
}
