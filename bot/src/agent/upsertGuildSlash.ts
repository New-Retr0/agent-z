import { REST, Routes } from "discord.js";
import { getGuildSlashCommandsBody } from "./slashPayload.js";

/**
 * Publishes /agent-z and /help to one guild. Requires the bot token; app id = OAuth application id
 * (same snowflake as the bot user for normal bots).
 */
export async function upsertAgentZGuildCommands(opts: {
  token: string;
  applicationId: string;
  guildId: string;
}): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(opts.token);
  const body = getGuildSlashCommandsBody();
  await rest.put(Routes.applicationGuildCommands(opts.applicationId, opts.guildId), {
    body,
  });
}
