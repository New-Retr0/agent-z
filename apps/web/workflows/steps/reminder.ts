import type { ReminderProposal } from "@/lib/agent-z/direct";
import { postDiscordChannelMessage } from "@/lib/discord-replies";

export async function stepPostReminder(input: ReminderProposal) {
  "use step";
  const targets = input.targetUserIds.map((id) => `<@${id}>`).join(" ");
  await postDiscordChannelMessage(input.channelId, `${targets} Reminder: ${input.reminderText}`, {
    messageId: input.sourceMessageId,
    allowedMentions: {
      users: input.targetUserIds,
      replied_user: false,
    },
  });
}
