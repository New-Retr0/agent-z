import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGuildId } from "../resolveGuildId.js";
import { resolveApplicationId } from "./resolveApplicationId.js";
import { upsertAgentZGuildCommands } from "./upsertGuildSlash.js";

const here = dirname(fileURLToPath(import.meta.url));
const botRoot = join(here, "..", "..");
const repoRoot = join(botRoot, "..");
config({ path: join(repoRoot, ".env") });
config({ path: join(botRoot, ".env"), override: true });

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required.");
  }
  const fromEnv = process.env.DISCORD_APPLICATION_ID?.trim() ?? process.env.DISCORD_CLIENT_ID?.trim();
  const appId = await resolveApplicationId(token, fromEnv);
  const guildId = resolveGuildId();
  await upsertAgentZGuildCommands({ token, applicationId: appId, guildId });
  console.log("Registered /agent-z, /agent-z-admin, and /help in guild", guildId);
  console.log("In Discord, type /agent-z text:<question> or /agent-z-admin action:<staff action>.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
