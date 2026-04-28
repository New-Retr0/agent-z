import { prisma } from "@repo/db";
import {
  addChannelMapping,
  addRoleMapping,
  setFeatureFlag,
  upsertRateLimit,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  let roles: { id: string; kind: string; discordRoleId: string }[] = [];
  let channels: { id: string; kind: string; discordChannelId: string }[] = [];
  let rateLimits: { id: string; kind: string; value: number }[] = [];
  let flags: { key: string; value: string }[] = [];
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
      <h1 className="text-2xl font-semibold">Config</h1>
      <p className="text-sm text-zinc-500 -mt-6">
        Maps Discord snowflakes to logical kinds and tune rate limits. Use your Neon `DATABASE_URL` in every
        environment.
      </p>

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
