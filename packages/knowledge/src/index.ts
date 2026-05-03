import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _dir = dirname(fileURLToPath(import.meta.url));
export const knowledgeDocsDir = join(_dir, "../docs");

async function isKnowledgeDocsAvailable(): Promise<boolean> {
  try {
    const s = await stat(knowledgeDocsDir);
    return s.isDirectory();
  } catch {
    return false;
  }
}

type KnowledgeIndexTopic = {
  id: string;
  file: string;
  title: string;
  summary: string;
  source?: string;
};

type KnowledgeIndex = {
  version: number;
  topics: KnowledgeIndexTopic[];
  generatedAt?: string;
};

type CachedKnowledge = {
  index: KnowledgeIndex;
  bodies: Map<string, string>;
};

let cached: CachedKnowledge | null = null;

export async function listBundledDocPaths(): Promise<string[]> {
  if (!(await isKnowledgeDocsAvailable())) {
    return [];
  }
  const entries = await readdir(knowledgeDocsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".mdx")))
    .map((e) => e.name);
}

export async function readBundledDoc(relative: string): Promise<string> {
  const safe = relative.replaceAll("..", "");
  return readFile(join(knowledgeDocsDir, safe), "utf8");
}

export async function readKnowledgeIndex(): Promise<KnowledgeIndex> {
  try {
    const raw = await readBundledDoc("index.json");
    const parsed = JSON.parse(raw) as KnowledgeIndex;
    return {
      version: parsed.version ?? 1,
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      generatedAt: parsed.generatedAt,
    };
  } catch {
    if (!(await isKnowledgeDocsAvailable())) {
      return { version: 1, topics: [] };
    }
    const files = await listBundledDocPaths();
    return {
      version: 1,
      topics: files.map((file) => ({
        id: file.replace(/\.(md|mdx)$/i, ""),
        file,
        title: file.replace(/\.(md|mdx)$/i, ""),
        summary: "",
      })),
    };
  }
}

async function loadKnowledge(): Promise<CachedKnowledge> {
  if (cached) {
    return cached;
  }

  const index = await readKnowledgeIndex();
  const bodies = new Map<string, string>();
  for (const topic of index.topics) {
    try {
      bodies.set(topic.id, await readBundledDoc(topic.file));
    } catch {
      bodies.set(topic.id, "");
    }
  }
  cached = { index, bodies };
  return cached;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1);
}

function idf(totalDocs: number, docFrequency: number): number {
  return Math.log(1 + (totalDocs - docFrequency + 0.5) / (docFrequency + 0.5));
}

function scoreDocument(queryTerms: Map<string, number>, text: string, totalDocs: number, docFrequency: Map<string, number>) {
  const terms = tokenize(text);
  const docLength = terms.length + 1;
  const termFrequency = new Map<string, number>();
  for (const term of terms) {
    termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
  }

  let score = 0;
  for (const term of queryTerms.keys()) {
    const frequency = termFrequency.get(term) ?? 0;
    if (frequency === 0) {
      continue;
    }
    const termIdf = idf(totalDocs, docFrequency.get(term) ?? 1);
    score += termIdf * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * (docLength / 500)));
  }
  return score;
}

export async function searchKnowledge(query: string, limit = 4): Promise<Array<{
  id: string;
  title: string;
  score: number;
  summary: string;
  excerpt: string;
  source?: string;
}>> {
  const { index, bodies } = await loadKnowledge();
  const queryTerms = new Map<string, number>();
  for (const term of tokenize(query)) {
    queryTerms.set(term, (queryTerms.get(term) ?? 0) + 1);
  }

  const totalDocs = Math.max(index.topics.length, 1);
  const docFrequency = new Map<string, number>();
  for (const topic of index.topics) {
    const text = `${topic.title}\n${topic.summary}\n${bodies.get(topic.id) ?? ""}`;
    const seen = new Set(tokenize(text));
    for (const term of seen) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
  }

  return index.topics
    .map((topic) => {
      const body = bodies.get(topic.id) ?? "";
      const text = `${topic.title}\n${topic.summary}\n${body}`;
      const bodyWithoutFrontmatter = body.replace(/^---[\s\S]*?---\s*/, "").trim();
      return {
        id: topic.id,
        title: topic.title,
        score: queryTerms.size === 0 ? 0 : scoreDocument(queryTerms, text, totalDocs, docFrequency),
        summary: topic.summary,
        excerpt: (topic.summary || bodyWithoutFrontmatter).replace(/\s+/g, " ").slice(0, 900),
        source: topic.source,
      };
    })
    .filter((result) => queryTerms.size === 0 || result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function buildKnowledgeContext(query: string, limit = 4): Promise<string> {
  const results = await searchKnowledge(query, limit);
  if (results.length === 0) {
    return "No bundled knowledge matched this request.";
  }

  return results
    .map((result, index) => {
      const source = result.source ? ` (${result.source})` : "";
      return `#${index + 1}: ${result.title}${source}\n${result.excerpt}`;
    })
    .join("\n\n");
}
