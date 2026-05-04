import { headers } from "next/headers";
import { Code2, ShieldCheck, Wrench, BookOpen, Sparkles, Database } from "lucide-react";

export const dynamic = "force-dynamic";

async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function Home() {
  const origin = await getOrigin();
  const mcpUrl = `${origin}/api/mcp`;
  const sseUrl = `${origin}/api/sse`;
  const discoveryUrl = `${origin}/.well-known/mcp.json`;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Agent Z &middot; Discord MCP
        </span>
        <h1 className="text-balance text-4xl font-semibold leading-tight md:text-5xl">
          Tier-gated Discord moderation, exposed as a Model Context Protocol server.
        </h1>
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          Tools, resources, and prompts for the Agent Z moderation cockpit. Driven in-process by the
          bot and connectable from Cursor, Claude Desktop, ChatGPT custom connectors, or any
          MCP-aware client. One catalog, two consumers.
        </p>
      </header>

      <section aria-labelledby="endpoints" className="flex flex-col gap-3">
        <h2 id="endpoints" className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Endpoints
        </h2>
        <ul className="flex flex-col gap-2 font-mono text-sm">
          <li className="flex flex-col gap-1 rounded-md border border-border bg-muted px-4 py-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Streamable HTTP (primary)</span>
            <span className="break-all text-foreground">{mcpUrl}</span>
          </li>
          <li className="flex flex-col gap-1 rounded-md border border-border bg-muted px-4 py-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">SSE (fallback)</span>
            <span className="break-all text-foreground">{sseUrl}</span>
          </li>
          <li className="flex flex-col gap-1 rounded-md border border-border bg-muted px-4 py-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Discovery</span>
            <span className="break-all text-foreground">{discoveryUrl}</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="primitives" className="flex flex-col gap-4">
        <h2 id="primitives" className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          What this server exposes
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Capability
            icon={<Wrench className="h-5 w-5 text-accent" aria-hidden />}
            title="Tools"
            body="discord_api_read, discord_send_message, discord_timeout_member, role assign/remove, bulk_delete_messages. Tier-gated server-side; the agent and external clients see the same catalog."
          />
          <Capability
            icon={<Database className="h-5 w-5 text-accent" aria-hidden />}
            title="Resources"
            body="agent-z://config/tier-matrix, agent-z://config/server-info, discord://guild/{id}/channels, discord://channel/{id}/pinned. One-click context attachment for MCP-aware clients."
          />
          <Capability
            icon={<BookOpen className="h-5 w-5 text-accent" aria-hidden />}
            title="Prompts"
            body="moderate-spam-wave, triage-help-channel, vibe-check, rules-explainer. Mod-cockpit templates that drive our tools end-to-end."
          />
          <Capability
            icon={<Sparkles className="h-5 w-5 text-accent" aria-hidden />}
            title="Elicitation"
            body="Destructive operations request mid-call confirmation via MCP elicitation. Clients without elicitation can pass preConfirmed: true."
          />
        </div>
      </section>

      <section aria-labelledby="auth" className="flex flex-col gap-3">
        <h2 id="auth" className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Authentication
        </h2>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted px-4 py-4 text-sm leading-relaxed">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-mono">Authorization: Bearer &lt;MCP_API_KEY&gt;</span>{" "}
              is required for every request. Set the secret on the Vercel project that hosts this app.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Code2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-mono">X-Actor-Discord-*</span>{" "}
              headers carry the calling user&apos;s Discord identity (user, guild, channel, roles).
              The server resolves an Agent Z tier from the Discord role mapping in Postgres and
              gates each tool/resource accordingly.
            </span>
          </p>
        </div>
      </section>

      <section aria-labelledby="connect" className="flex flex-col gap-3">
        <h2 id="connect" className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Connect from Cursor
        </h2>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4 text-xs leading-relaxed text-foreground">
{`{
  "mcpServers": {
    "agent-z": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY",
        "X-Actor-Discord-User-Id": "YOUR_DISCORD_USER_ID",
        "X-Actor-Discord-Guild-Id": "YOUR_GUILD_ID",
        "X-Actor-Discord-Role-Ids": "ROLE_ID_1,ROLE_ID_2"
      }
    }
  }
}`}
        </pre>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
        Part of the Agent Z monorepo. Built with{" "}
        <span className="font-mono">mcp-handler</span> on Vercel Fluid Compute.
      </footer>
    </main>
  );
}

function Capability({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-muted p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-base font-medium">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </article>
  );
}
