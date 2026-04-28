/**
 * One-off: find a member by name search, open DM, send a message.
 * Usage: node scripts/send-dm.mjs "DisplayOrUsername"   (message from DM_TEXT or -- and rest of argv)
 * Env: same .env as repo (DISCORD_BOT_TOKEN, DISCORD_ALLOWED_GUILD_IDS)
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const botRoot = join(__dirname, "..");
const repoRoot = join(botRoot, "..");
config({ path: join(repoRoot, ".env") });

const API = (p) => `https://discord.com/api/v10${p}`;
const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  console.error("DISCORD_BOT_TOKEN missing");
  process.exit(1);
}

const guilds = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (guilds.length !== 1) {
  console.error("Need exactly one id in DISCORD_ALLOWED_GUILD_IDS for this script.");
  process.exit(1);
}
const guildId = guilds[0];

const args = process.argv.slice(2);
const dash = args.indexOf("--");
const query = dash === -1 ? args[0] : args.slice(0, dash).join(" ");
const fromFlag = dash >= 0 ? args.slice(dash + 1).join(" ") : process.env.DM_TEXT?.trim();

if (!query) {
  console.error('Usage: node scripts/send-dm.mjs "Username" -- Your message here');
  process.exit(1);
}
if (!fromFlag) {
  console.error("Set DM_TEXT=... or: node send-dm.mjs name -- message body");
  process.exit(1);
}

const message = fromFlag;

async function jfetch(method, path, body) {
  const r = await fetch(API(path), {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  const parsed = t ? JSON.parse(t) : null;
  if (!r.ok) {
    throw new Error(`${method} ${path} ${r.status}: ${t}`);
  }
  return parsed;
}

// GET /guilds/{id}/members/search?query=...
const enc = encodeURIComponent(query);
const found = await jfetch("GET", `/guilds/${guildId}/members/search?query=${enc}&limit=10`);
if (!Array.isArray(found) || !found.length) {
  console.error(`No members match query "${query}". Try their exact username.`);
  process.exit(1);
}

const qLower = query.toLowerCase();
const user =
  found.find((m) => m.user?.username?.toLowerCase() === qLower) ||
  found.find((m) => m.user?.global_name?.toLowerCase() === qLower) ||
  found[0];
const u = user.user;
const tag = u.global_name ? `${u.global_name} (@${u.username})` : `@${u.username}`;
console.log(`Using member: ${tag} (${u.id})`);

const dm = await jfetch("POST", "/users/@me/channels", { recipient_id: u.id });
await jfetch("POST", `/channels/${dm.id}/messages`, { content: message });
console.log("DM sent.");
