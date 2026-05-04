import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./read-tools";
import { registerWriteDirectTools } from "./write-direct-tools";
import { registerWriteStagedTools } from "./write-staged-tools";

export function registerTools(server: McpServer) {
  registerReadTools(server);
  registerWriteDirectTools(server);
  registerWriteStagedTools(server);
}