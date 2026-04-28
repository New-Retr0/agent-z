import type { AgentZConfig } from "./botConfig.js";

type Bucket = {
  minuteWindow: number;
  minuteCount: number;
  dayKey: string;
  dayCount: number;
};

function dayKeyUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function nowMin(): number {
  return Math.floor(Date.now() / 60_000);
}

function createBucket(): Bucket {
  return {
    minuteWindow: nowMin(),
    minuteCount: 0,
    dayKey: dayKeyUtc(),
    dayCount: 0,
  };
}

const perUser = new Map<string, Bucket>();
let globalBucket = createBucket();

function tryConsume(
  b: Bucket,
  minuteLimit: number,
  dayLimit: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const m = nowMin();
  if (m !== b.minuteWindow) {
    b.minuteWindow = m;
    b.minuteCount = 0;
  }
  const dk = dayKeyUtc();
  if (dk !== b.dayKey) {
    b.dayKey = dk;
    b.dayCount = 0;
  }
  if (b.dayCount >= dayLimit) {
    const until = new Date();
    until.setUTCHours(24, 0, 0, 0);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)) };
  }
  if (b.minuteCount >= minuteLimit) {
    return { ok: false, retryAfterSec: 60 - (Math.floor(Date.now() / 1000) % 60) };
  }
  b.minuteCount += 1;
  b.dayCount += 1;
  return { ok: true };
}

export function checkRateLimit(
  userId: string,
  cfg: AgentZConfig
): { ok: true } | { ok: false; reason: string; retryAfterSec: number } {
  if (cfg.ratelimitBypassUserIds.has(userId)) {
    return { ok: true };
  }
  let ub = perUser.get(userId);
  if (!ub) {
    ub = createBucket();
    perUser.set(userId, ub);
  }
  const u = tryConsume(ub, cfg.userRpm, cfg.userDaily);
  if (!u.ok) {
    return { ok: false, reason: "user", retryAfterSec: u.retryAfterSec };
  }
  const g = tryConsume(globalBucket, cfg.globalRpm, cfg.globalDaily);
  if (!g.ok) {
    ub.minuteCount = Math.max(0, ub.minuteCount - 1);
    ub.dayCount = Math.max(0, ub.dayCount - 1);
    return { ok: false, reason: "global", retryAfterSec: g.retryAfterSec };
  }
  return { ok: true };
}
