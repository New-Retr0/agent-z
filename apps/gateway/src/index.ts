import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActivityType, Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "..", "..");

config({ path: join(repoRoot, ".env") });
config({ path: join(appRoot, ".env"), override: true });

const token = process.env.DISCORD_BOT_TOKEN?.trim();
const activity = process.env.AGENT_Z_GATEWAY_ACTIVITY?.trim() || "Agent Z";

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN is required to keep Agent Z online.");
}

/**
 * This optional Gateway process only maintains Discord presence. Main Agent Z
 * behavior stays in the Vercel-hosted Chat SDK webhook app.
 */
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity(activity, { type: ActivityType.Custom });
  console.log(`[Agent Z Gateway] online as ${readyClient.user.tag}`);
  console.log("[Agent Z Gateway] webhook/workflow behavior remains hosted on Vercel.");
});

client.on(Events.Error, (error) => {
  console.error("[Agent Z Gateway] Discord client error", error);
});

client.login(token);

