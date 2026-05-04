import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Vercel / local secrets only. Mutable app config is in Postgres (runtime-config).
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DISCORD_BOT_TOKEN: z.string().min(1).optional(),
    DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
    DISCORD_APPLICATION_ID: z.string().min(1).optional(),
    AI_GATEWAY_API_KEY: z.string().optional(),
    DATABASE_URL: z.string().url().optional(),
    DIRECT_URL: z.string().url().optional(),
    /** Shared secret for /admin (httpOnly cookie). Replace with Clerk + Discord when ready. */
    AGENT_Z_ADMIN_SECRET: z.string().min(16).optional(),
    /**
     * Shared secret: `/api/agent/direct`, `/api/discord/verify`, some `/api/cron/*` routes,
     * and `/api/internal/pending-actions` (MCP staged actions).
     */
    AGENT_Z_INTERNAL_SECRET: z.string().min(16).optional(),
    /** In-app MCP HTTP URL (apps/web `runAgentZ`); pair with DISCORD_MCP_API_KEY. */
    DISCORD_MCP_URL: z.string().url().optional(),
    /** Bearer for DISCORD_MCP_URL; must match MCP_API_KEY on apps/discord-mcp when using one shared secret. */
    DISCORD_MCP_API_KEY: z.string().min(1).optional(),
    /** Bearer for external MCP clients hitting POST /api/mcp (apps/discord-mcp). */
    MCP_API_KEY: z.string().min(1).optional(),
    /** Upstash REST — rate limits (apps/web) and embed queue (packages/db) when set. */
    KV_REST_API_URL: z.string().url().optional(),
    KV_REST_API_TOKEN: z.string().min(1).optional(),
    /** apps/discord-mcp server runtime / Redis-backed features. */
    REDIS_URL: z.string().min(1).optional(),
    /** Scheduled messages cron (`/api/cron/scheduled-msgs`). */
    CRON_SECRET: z.string().min(1).optional(),
    /** Override default embedding model id (Oversight / AI Gateway). */
    AGENT_Z_EMBED_MODEL: z.string().min(1).optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_WEBHOOK_SECRET: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    AGENT_Z_ADMIN_SECRET: process.env.AGENT_Z_ADMIN_SECRET,
    AGENT_Z_INTERNAL_SECRET: process.env.AGENT_Z_INTERNAL_SECRET,
    DISCORD_MCP_URL: process.env.DISCORD_MCP_URL,
    DISCORD_MCP_API_KEY: process.env.DISCORD_MCP_API_KEY,
    MCP_API_KEY: process.env.MCP_API_KEY,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    REDIS_URL: process.env.REDIS_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    AGENT_Z_EMBED_MODEL: process.env.AGENT_Z_EMBED_MODEL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
