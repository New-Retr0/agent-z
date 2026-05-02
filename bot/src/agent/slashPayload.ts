import { SlashCommandBuilder } from "discord.js";

const agentZ = new SlashCommandBuilder()
  .setName("agent-z")
  .setDescription("Run Agent Z in this server")
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName("text")
      .setDescription("What you want Agent Z to do")
      .setRequired(false)
  );

const agentZAdmin = new SlashCommandBuilder()
  .setName("agent-z-admin")
  .setDescription("Run private Agent Z staff/admin actions")
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName("action")
      .setDescription("Staff/admin action for Agent Z")
      .setRequired(true)
  );

const helpTopLevel = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Agent Z help");

/** @deprecated use getGuildSlashCommandsBody */
export function getAgentZSlashCommandJson() {
  return agentZ.toJSON();
}

/** All guild slash commands for this app (PUT replaces the whole set for the guild). */
export function getGuildSlashCommandsBody(): ReturnType<SlashCommandBuilder["toJSON"]>[] {
  return [agentZ.toJSON(), agentZAdmin.toJSON(), helpTopLevel.toJSON()];
}
