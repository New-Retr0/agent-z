import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { loadEnvFile } from "./loadEnv.js";
import { createDiscordMcpServer } from "./mcpServer.js";

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const mcp = createDiscordMcpServer(config);
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
