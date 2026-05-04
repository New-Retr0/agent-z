/**
 * Elicitation helper for destructive MCP tool calls.
 *
 * Per MCP spec, a tool can ask the connecting client (Cursor, Claude Desktop, the in-process agent)
 * for additional confirmation mid-execution. mcp-handler exposes this via the request context's
 * `elicit()` method when the underlying SDK supports it.
 *
 * In Phase 1 we use this only as a *guard rail*: tools that cross an "impact threshold"
 * (`bulk_delete_messages` with `count > 50`, etc.) call `confirmDestructive(...)` which returns
 * either `{ confirmed: true }` or aborts the tool with a friendly message.
 *
 * If the client does not support elicitation (older clients), we fall back to requiring an explicit
 * `confirmed: true` field on the tool input — the caller is told to re-issue the call with that flag.
 */

type ElicitableContext = {
  // mcp-handler may expose the SDK request handler extra; we feature-detect below.
  request?: {
    sendRequest?: (
      method: string,
      params: unknown,
      schema: unknown,
      options?: { timeout?: number }
    ) => Promise<unknown>;
  };
};

export type ConfirmDestructiveInput = {
  action: string;
  impactSummary: string;
  threshold?: number;
  count: number;
  preConfirmed?: boolean;
};

export type ConfirmDestructiveResult =
  | { confirmed: true; via: "pre-confirmed" | "elicitation" | "skipped" }
  | { confirmed: false; reason: string };

const ELICITATION_TIMEOUT_MS = 30_000;

export async function confirmDestructive(
  ctx: unknown,
  input: ConfirmDestructiveInput
): Promise<ConfirmDestructiveResult> {
  const threshold = input.threshold ?? 50;
  if (input.count <= threshold) {
    return { confirmed: true, via: "skipped" };
  }
  if (input.preConfirmed) {
    return { confirmed: true, via: "pre-confirmed" };
  }

  const elicitable = ctx as ElicitableContext;
  const sendRequest = elicitable?.request?.sendRequest;
  if (typeof sendRequest === "function") {
    try {
      const result = (await sendRequest(
        "elicitation/create",
        {
          message: `Confirm: ${input.action} - ${input.impactSummary}.`,
          requestedSchema: {
            type: "object",
            required: ["confirmed"],
            properties: {
              confirmed: {
                type: "boolean",
                description: "Confirm this destructive action proceeds.",
              },
            },
          },
        },
        // Loose schema; mcp-handler validates the response shape itself.
        { type: "object" } as unknown,
        { timeout: ELICITATION_TIMEOUT_MS }
      )) as { action?: string; content?: { confirmed?: boolean } };
      if (result?.action === "accept" && result.content?.confirmed === true) {
        return { confirmed: true, via: "elicitation" };
      }
      return { confirmed: false, reason: "Caller declined the elicitation prompt." };
    } catch (error) {
      return {
        confirmed: false,
        reason: `Elicitation failed: ${error instanceof Error ? error.message : String(error)}. Retry with preConfirmed: true if you have authority.`,
      };
    }
  }

  return {
    confirmed: false,
    reason: `Client does not support elicitation. Re-call ${input.action} with preConfirmed: true if you have authority for this action.`,
  };
}
