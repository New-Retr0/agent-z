import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const stubZlibSync = new URL("stubs/zlib-sync.mjs", import.meta.url);

const require = createRequire(import.meta.url);
const { withWorkflow } = require("workflow/next");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@repo/config",
    "@repo/db",
    "@repo/agent",
    "@repo/chat-bot",
    "@repo/knowledge",
  ],
  /** Monorepo: trace files from workspace root (single `next` install). */
  outputFileTracingRoot: path.join(__dirname, "../.."),
  /**
   * `@repo/knowledge` reads markdown/json from `packages/knowledge/docs` at runtime.
   * Tracing does not follow those paths, so Vercel would omit them without an explicit include.
   * Paths are resolved from this app directory (`apps/web`); one `../` would wrongly target `apps/packages/...`.
   */
  outputFileTracingIncludes: {
    "/*": ["../../packages/knowledge/docs/**/*"],
  },
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
