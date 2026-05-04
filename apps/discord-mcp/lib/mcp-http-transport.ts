import { withMcpAuth } from "mcp-handler";
import { mcpHandler } from "./server";
import { verifyBearer } from "./auth";

/** Shared Streamable HTTP / SSE entry; mounted at `/api/mcp` and `/api/sse`. */
export const authedMcpTransport = withMcpAuth(mcpHandler, verifyBearer, { required: true });
