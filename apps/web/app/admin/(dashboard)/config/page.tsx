import { prisma } from "@repo/db";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import {
  addChannelMapping,
  addRoleMapping,
  setFeatureFlag,
  setVerifyConfig,
  upsertRateLimit,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  let roles: { id: string; kind: string; discordRoleId: string }[] = [];
  let channels: { id: string; kind: string; discordChannelId: string }[] = [];
  let rateLimits: { id: string; kind: string; value: number }[] = [];
  let flags: { key: string; value: string }[] = [];
  const rc = await getRuntimeConfig();
  try {
    ;[roles, channels, rateLimits] = await Promise.all([
      prisma.roleMapping.findMany({ orderBy: { kind: "asc" } }),
      prisma.channelMapping.findMany({ orderBy: { kind: "asc" } }),
      prisma.rateLimit.findMany({ orderBy: { kind: "asc" } }),
    ]);
    const rows = await prisma.botConfig.findMany({
      where: { key: { in: ["public_tier_enabled", "message_content_intent"] } },
    });
    flags = rows.map((r) => ({ key: r.key, value: r.valueJson }));
  } catch {
    // DB unavailable
  }

  return (
    <div className="max-w-4xl flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">Config</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Runtime behavior backed by Postgres (<code className="font-mono text-zinc-400">BotConfig</code>, mappings,
          rate limits). Changes here apply without redeploying the app.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Role mappings</h2>
        <p className="text-xs text-zinc-500">Examples: <code>admin</code>, <code>mod</code>, <code>verified</code></p>
        <ul className="text-sm text-zinc-300 font-mono text-xs">
          {roles.length === 0 ? <li>—</li> : roles.map((r) => (
            <li key={r.id}>
              {r.kind} → {r.discordRoleId}
            </li>
          ))}
        </ul>
        <form action={addRoleMapping} className="flex flex-wrap gap-2 items-end text-sm">
          <input name="kind" placeholder="kind" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
          <input
            name="discord_role_id"
            placeholder="role snowflake"
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono"
          />
          <button type="submit" className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm">
            Add
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Channel mappings</h2>
        <p className="text-xs text-zinc-500">
          Use kind <code>agent</code> to restrict Agent Z slash/mention runs to specific channels.
        </p>
        <ul className="text-sm text-zinc-300 font-mono text-xs">
          {channels.length === 0 ? <li>—</li> : channels.map((c) => (
            <li key={c.id}>
              {c.kind} → {c.discordChannelId}
            </li>
          ))}
        </ul>
        <form action={addChannelMapping} className="flex flex-wrap gap-2 items-end text-sm">
          <input name="kind" placeholder="kind" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
          <input
            name="discord_channel_id"
            placeholder="channel snowflake"
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono"
          />
          <button type="submit" className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm">
            Add
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Rate limits</h2>
        <p className="text-xs text-zinc-500">
          Supported kinds: <code>user_rpm</code> (per Discord user per minute) and <code>global_rpm</code> (all Agent Z
          runs per minute). A missing limit means unlimited.
        </p>
        <ul className="text-sm text-zinc-300 font-mono text-xs">
          {rateLimits.length === 0 ? <li>—</li> : rateLimits.map((r) => (
            <li key={r.id}>
              {r.kind}: {r.value}
            </li>
          ))}
        </ul>
        <form action={upsertRateLimit} className="flex flex-wrap gap-2 items-end text-sm">
          <input name="kind" placeholder="e.g. user_rpm" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
          <input name="value" type="number" placeholder="limit" className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 w-24" />
          <button type="submit" className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm">
            Save
          </button>
        </form>
      </section>

      <section id="verify-on-reaction" className="flex flex-col gap-3 scroll-mt-24">
        <h2 className="text-lg font-medium">Verify on reaction</h2>
        <p className="text-xs text-zinc-500">
          When a non-bot user adds the configured emoji on the configured message, Agent Z grants the verified
          role and DMs <code className="font-mono">welcome_dm_template</code>. Leaving any of role/channel ID
          blank disables the flow. Use <code className="font-mono">{"{user}"}</code> in the welcome template
          to mention the new member.
        </p>
        <form action={setVerifyConfig} className="grid gap-3 max-w-xl text-sm md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400 text-xs">Verified role ID</span>
            <input
              name="verified_role_id"
              defaultValue={rc.verifiedRoleId ?? ""}
              placeholder="e.g. 1234567890123456789"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400 text-xs">Verify channel ID</span>
            <input
              name="verify_channel_id"
              defaultValue={rc.verifyChannelId ?? ""}
              placeholder="e.g. 1234567890123456789"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400 text-xs">Verify message ID (optional)</span>
            <input
              name="verify_message_id"
              defaultValue={rc.verifyMessageId ?? ""}
              placeholder="leave blank to accept any message in channel"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400 text-xs">Emoji</span>
            <input
              name="verify_emoji"
              defaultValue={rc.verifyEmoji}
              placeholder="✅ or name:id"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-zinc-400 text-xs">Welcome DM template</span>
            <textarea
              name="welcome_dm_template"
              defaultValue={rc.welcomeDmTemplate}
              rows={3}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 leading-relaxed"
            />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm">
              Save verify config
            </button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Feature flags (BotConfig)</h2>
        <form action={setFeatureFlag} className="flex flex-col gap-2 text-sm max-w-sm">
          <input type="hidden" name="key" value="public_tier_enabled" />
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={flags.find((f) => f.key === "public_tier_enabled")?.value === "true"}
            />
            public_tier_enabled (allow public-tier flows)
          </label>
          <button type="submit" className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm w-fit">
            Save
          </button>
        </form>
        <form action={setFeatureFlag} className="flex flex-col gap-2 text-sm max-w-sm">
          <input type="hidden" name="key" value="message_content_intent" />
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={flags.find((f) => f.key === "message_content_intent")?.value !== "false"}
            />
            message_content_intent
          </label>
          <button type="submit" className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm w-fit">
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
