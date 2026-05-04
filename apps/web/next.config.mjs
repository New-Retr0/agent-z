import path from "node:path";
import { fileURLToPath } from "node:url";
import { withWorkflow } from "workflow/next";

const stubZlibSync = new URL("stubs/zlib-sync.mjs", import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@repo/config",
    "@repo/db",
    "@repo/agent",
    "@repo/chat-bot",
  ],
  /** Monorepo: trace files from workspace root (single `next` install). */
  outputFileTracingRoot: path.join(__dirname, "../.."),
  /**
   * @discordjs/ws optional native zlib — avoids bundler resolve + node-gyp on Windows.
   * Runtime: lazy import resolves to `null` (library already `.catch(() => null)`).
   */
  turbopack: {
    resolveAlias: {
      /** file:// URL — Turbopack on Windows does not accept raw `C:\` paths for aliases. */
      "zlib-sync": stubZlibSync.href,
    },
  },
};

export default withWorkflow(nextConfig);