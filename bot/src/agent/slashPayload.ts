import { SlashCommandBuilder } from "discord.js";

const agentZ = new SlashCommandBuilder()
  .setName("agent-z")
  .setDescription("Agent Z — server assistant (prompt + help)")
  .addSubcommand((s) =>
    s
      .setName("prompt")
      .setDescription("Run a natural-language request")
      .addStringOption((o) =>
        o
          .setName("text")
          .setDescription("What you want the bot to do")
          .setRequired(true)
      )
  )
  .addSubcommand((s) => s.setName("help").setDescription("Show paginated help for your access level"));

const helpTopLevel = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Agent Z — paginated help (same as /agent-z help)");

/** @deprecated use getGuildSlashCommandsBody */
export function getAgentZSlashCommandJson() {
  return agentZ.toJSON();
}

/** All guild slash commands for this app (PUT replaces the whole set for the guild). */
export function getGuildSlashCommandsBody(): ReturnType<SlashCommandBuilder["toJSON"]>[] {
  return [agentZ.toJSON(), helpTopLevel.toJSON()];
}
