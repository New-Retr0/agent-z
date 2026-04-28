import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load `.env` from `apps/mcp/.env` or the monorepo root, regardless of process cwd.
 * Must run before loadConfig().
 */
export function loadEnvFile(): void {
  const file = fileURLToPath(import.meta.url);
  const here = path.dirname(file);
  const mcpRoot = path.resolve(here, "..");
  const monorepoRoot = path.resolve(mcpRoot, "..", "..");
  const candidates = [
    path.join(mcpRoot, ".env"),
    path.join(monorepoRoot, ".env"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      config({ path: p });
      return;
    }
  }
  config();
}
