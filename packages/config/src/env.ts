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
    /** Shared between `apps/web` and the chat-bot for `Authorization: Bearer ...` on `/api/agent/direct` and `/api/discord/verify`. */
    AGENT_Z_INTERNAL_SECRET: z.string().min(16).optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_WEBHOOK_SECRET: z.string().optional(),
    AGENT_Z_OWNER_DISCORD_ID: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
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
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    AGENT_Z_OWNER_DISCORD_ID: process.env.AGENT_Z_OWNER_DISCORD_ID,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
