import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@repo/config/env";
import { timingSafeSecretEqual } from "@/lib/workflow-request";
import { verifyUserFromReaction } from "@/lib/verify-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  channelId: z.string().regex(/^\d{17,20}$/),
  messageId: z.string().regex(/^\d{17,20}$/),
  userId: z.string().regex(/^\d{17,20}$/),
  emoji: z.string().min(1).max(64),
});

/**
 * Internal verify endpoint called by the chat-bot reaction handler.
 *
 * Auth: Bearer token equal to AGENT_Z_INTERNAL_SECRET (same secret already used
 * by /api/agent/direct and /api/workflow/invoke). Body is the validated reaction
 * fingerprint; verifyUserFromReaction handles config / dedupe / role grant /
 * welcome DM / VerificationGrant audit row.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!timingSafeSecretEqual(token, env.AGENT_Z_INTERNAL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const outcome = await verifyUserFromReaction(parsed.data);
    return NextResponse.json(outcome);
  } catch (e) {
    return NextResponse.json(
      {
        kind: "error",
        reason: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
