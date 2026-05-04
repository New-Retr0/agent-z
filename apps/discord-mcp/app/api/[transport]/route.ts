import { withMcpAuth } from "mcp-handler";
import { mcpHandler } from "@/lib/server";
import { verifyBearer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authedHandler = withMcpAuth(mcpHandler, verifyBearer, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
