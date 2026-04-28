import { getRuntimeConfig } from "@repo/config/runtime-config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const base =
    process.env.VERCEL_URL != null
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT ?? "3000"}`;
  const rc = await getRuntimeConfig();
  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="text-sm flex flex-col gap-2">
        <p>
          <span className="text-zinc-500">Discord webhook URL: </span>
          <code className="font-mono text-xs break-all">
            {base}/api/discord
          </code>
        </p>
        <p>
          <span className="text-zinc-500">Welcome DM template (DB): </span>
          {rc.welcomeDmTemplate.slice(0, 120)}…
        </p>
        <p className="text-zinc-500 text-xs">
          OIDC: use `vercel env pull` for AI Gateway. Re-register commands via a one-shot script
          (see `AGENTS.md`).
        </p>
      </div>
    </div>
  );
}
