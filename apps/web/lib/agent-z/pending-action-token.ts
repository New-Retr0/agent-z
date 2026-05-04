/** Pending Discord destructive actions use opaque tokens created by apps/discord-mcp staging. */

const PA_TOKEN_RE_TEXT = /`(pa_[a-f0-9]+)`/;
const PA_TOKEN_RE_WORD = /\b(pa_[a-f0-9]+)\b/;

export function extractPaTokenFromAssistantText(text: string): string | null {
  const m = text.match(PA_TOKEN_RE_TEXT);
  if (m?.[1]) return m[1];
  const m2 = text.match(PA_TOKEN_RE_WORD);
  return m2?.[1] ?? null;
}

function tokenFromToolOutput(output: unknown): string | null {
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.startsWith("{")) {
      try {
        const j = JSON.parse(trimmed) as { paToken?: unknown; staged?: unknown };
        if (typeof j.paToken === "string" && /^pa_[a-f0-9]+$/.test(j.paToken)) {
          return j.paToken;
        }
      } catch {
        /* fall through */
      }
    }
    const m = trimmed.match(/\b(pa_[a-f0-9]+)\b/);
    return m?.[1] ?? null;
  }
  const s =
    output !== undefined && output !== null
      ? typeof output === "object"
        ? JSON.stringify(output)
        : String(output)
      : "";
  const m = s.match(/\b(pa_[a-f0-9]+)\b/);
  return m?.[1] ?? null;
}

const MAX_DEPTH = 14;

/** DFS tool outputs / strings — MCP tool results may appear nested in AI SDK step/message shapes. */
export function extractPaTokenDeep(root: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return null;

  if (typeof root === "string") {
    return tokenFromToolOutput(root);
  }

  if (root === null || root === undefined) return null;

  if (Array.isArray(root)) {
    for (let i = root.length - 1; i >= 0; i--) {
      const t = extractPaTokenDeep(root[i], depth + 1);
      if (t) return t;
    }
    return null;
  }

  if (typeof root === "object") {
    const o = root as Record<string, unknown>;
    if (o.type === "tool-result" && "output" in o) {
      const t = tokenFromToolOutput(o.output);
      if (t) return t;
    }
    const keys = Object.keys(o);
    for (let i = keys.length - 1; i >= 0; i--) {
      const t = extractPaTokenDeep(o[keys[i]!], depth + 1);
      if (t) return t;
    }
  }

  return null;
}

/** Prefer later steps when multiple tools ran (e.g. retries). */
export function extractPaTokenFromGenerateTextResult(result: {
  steps?: readonly unknown[];
  response?: { messages?: readonly unknown[] };
}): string | null {
  const steps = result.steps;
  if (Array.isArray(steps)) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const t = extractPaTokenDeep(steps[i]);
      if (t) return t;
    }
  }
  const msgs = result.response?.messages;
  if (Array.isArray(msgs)) {
    const t = extractPaTokenDeep(msgs);
    if (t) return t;
  }
  return null;
}

/** Remove model prose that promises Discord components when we did not attach any. */
export function stripMisleadingButtonPromises(text: string): string {
  let t = text;
  const patterns = [
    /\n[^\n]*(?:Confirm or Cancel buttons will appear|buttons will appear in Discord)[^\n]*/gi,
    /^[^\n]*(?:Confirm or Cancel buttons will appear|buttons will appear in Discord)[^\n]*\n?/gim,
    /\n[^\n]*You'll need to confirm the action in the Discord UI[^\n]*/gi,
    /\n[^\n]*Do you want to proceed with[^\n]*\?[^\n]*/gi,
  ];
  for (const re of patterns) {
    t = t.replace(re, "\n");
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function impliesStagingWasClaimedWithoutToken(text: string): boolean {
  const joined = text.toLowerCase();
  const fakeToolBlock = /^```[\s\S]*\bdiscord_/im.test(text);
  const claimedStaged =
    /\b(now staged|is now staged|has been staged|queued until|pending confirmation)\b/i.test(joined);
  const promisedUi =
    /buttons will appear/i.test(text) ||
    /confirm or cancel buttons/i.test(joined) ||
    /confirm the action in the discord ui/i.test(joined);
  return fakeToolBlock || claimedStaged || promisedUi;
}

export function stagingMismatchFooter(discordToolsOffered: number): string {
  if (discordToolsOffered <= 0) {
    return "\n\n—\n**No confirmation buttons:** Discord MCP tools were not loaded on this deployment. Set **DISCORD_MCP_URL** and **DISCORD_MCP_API_KEY** on the web app (same values as MCP hosting).";
  }
  return "\n\n—\n**No confirmation buttons:** No staging token (`pa_…`) was produced — the real Discord staged tool likely did not run (often the model pasted a fake tool block instead of invoking tools). Retry the request.";
}
