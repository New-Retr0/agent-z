import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentZConfig } from "./botConfig.js";

type IndexTopic = { id: string; file: string; title: string; summary: string };
type IndexFile = { version: number; topics: IndexTopic[]; generatedAt?: string };

let cached: { path: string; index: IndexFile; bodies: Map<string, string> } | null = null;

async function loadAll(cfg: AgentZConfig): Promise<NonNullable<typeof cached>> {
  if (cached?.path === cfg.knowledgeDir) {
    return cached;
  }
  const indexPath = join(cfg.knowledgeDir, "index.json");
  const raw = await readFile(indexPath, "utf8");
  const index = JSON.parse(raw) as IndexFile;
  const bodies = new Map<string, string>();
  for (const t of index.topics) {
    const p = join(cfg.knowledgeDir, t.file);
    try {
      const text = await readFile(p, "utf8");
      bodies.set(t.id, text);
    } catch {
      bodies.set(t.id, "");
    }
  }
  cached = { path: cfg.knowledgeDir, index, bodies };
  return cached;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
}

const avgDocLen = 500;

function idf(n: number, df: number): number {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

function scoreDoc(
  qTerms: Map<string, number>,
  text: string,
  n: number,
  docFreq: Map<string, number>
): number {
  const docLen = tokenize(text).length + 1;
  const tf = new Map<string, number>();
  for (const w of tokenize(text)) {
    tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  let s = 0;
  for (const [term, qtf] of qTerms) {
    const f = tf.get(term) ?? 0;
    if (f === 0) continue;
    const idfv = idf(n, docFreq.get(term) ?? 1);
    s += idfv * (f * (1.2 + 1)) / (f + 1.2 * (0.25 + 0.75 * (docLen / avgDocLen)));
    void qtf;
  }
  return s;
}

export async function searchDocs(
  cfg: AgentZConfig,
  query: string,
  k: number
): Promise<Array<{ id: string; title: string; score: number; snippet: string }>> {
  const { index, bodies } = await loadAll(cfg);
  const qTerms = new Map<string, number>();
  for (const w of tokenize(query)) {
    qTerms.set(w, (qTerms.get(w) ?? 0) + 1);
  }
  const n = index.topics.length;
  const docFreq = new Map<string, number>();
  for (const t of index.topics) {
    const text = `${t.title}\n${t.summary}\n${bodies.get(t.id) ?? ""}`;
    const seen = new Set<string>();
    for (const w of tokenize(text)) {
      if (!seen.has(w)) {
        seen.add(w);
        docFreq.set(w, (docFreq.get(w) ?? 0) + 1);
      }
    }
  }
  const out: Array<{ id: string; title: string; score: number; snippet: string }> = [];
  for (const t of index.topics) {
    const text = `${t.title}\n${t.summary}\n${bodies.get(t.id) ?? ""}`;
    const sc = scoreDoc(qTerms, text, n, docFreq);
    const sn = t.summary || text.slice(0, 200);
    out.push({ id: t.id, title: t.title, score: sc, snippet: sn });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k);
}

export async function listTopics(cfg: AgentZConfig): Promise<
  Array<{ id: string; title: string; summary: string }>
> {
  const { index } = await loadAll(cfg);
  return index.topics.map((t) => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
  }));
}

export async function readTopic(cfg: AgentZConfig, id: string): Promise<string> {
  const { bodies, index } = await loadAll(cfg);
  if (!index.topics.some((t) => t.id === id)) {
    return `Unknown topic: ${id}. Use list_vercel_topics.`;
  }
  return bodies.get(id) ?? "";
}

const FETCH_ALLOW = new Set(
  [
    "vercel.com",
    "www.vercel.com",
    "nextjs.org",
    "ui.shadcn.com",
    "shadcn.com",
    "www.shadcn.com",
    "sdk.vercel.ai",
    "ai-sdk.dev",
    "discord.com",
    "raw.githubusercontent.com",
  ].map((h) => h.toLowerCase())
);

export async function fetchUrlText(urlStr: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return "Invalid URL.";
  }
  if (u.protocol !== "https:") {
    return "Only https URLs are allowed.";
  }
  const host = u.hostname.toLowerCase();
  if (![...FETCH_ALLOW].some((h) => host === h || host.endsWith(`.${h}`))) {
    return `Host not allowlisted: ${host}`;
  }
  const res = await fetch(urlStr, {
    headers: { "User-Agent": "AgentZ/1.0 (docs fetch)" },
    signal: AbortSignal.timeout(20_000),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text") && !ct.includes("json") && !ct.includes("html")) {
    return `Unsupported content type: ${ct}`;
  }
  const text = await res.text();
  return text.length > 12_000 ? text.slice(0, 12_000) + "\n…(truncated)" : text;
}
