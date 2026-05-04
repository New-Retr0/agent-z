import { authedMcpTransport } from "@/lib/mcp-http-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { authedMcpTransport as GET, authedMcpTransport as POST, authedMcpTransport as DELETE };
