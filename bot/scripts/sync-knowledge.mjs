#!/usr/bin/env node
/**
 * Copies skill markdown into bot/knowledge and writes index.json.
 * Set AGENT_Z_KNOWLEDGE_SOURCE to a directory of .md files (e.g. Cursor Vercel plugin skills).
 * If unset, creates a minimal stub so the bot can start.
 */
import { mkdir, copyFile, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const knowledgeDir = join(here, "..", "knowledge");
const sourceDir = process.env.AGENT_Z_KNOWLEDGE_SOURCE?.trim();

await mkdir(knowledgeDir, { recursive: true });

const topics = [];

if (sourceDir) {
  try {
    const st = await stat(sourceDir);
    if (!st.isDirectory()) {
      console.warn("[sync-knowledge] AGENT_Z_KNOWLEDGE_SOURCE is not a directory:", sourceDir);
    } else {
      const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".md"));
      for (const f of files) {
        const src = join(sourceDir, f);
        const destName = f.replace(/[^a-zA-Z0-9._-]/g, "_");
        const dest = join(knowledgeDir, destName);
        await copyFile(src, dest);
        const raw = await readFile(src, "utf8");
        const title =
          raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(f, ".md");
        const summary = raw
          .slice(0, 400)
          .replace(/\s+/g, " ")
          .trim();
        topics.push({
          id: basename(destName, ".md"),
          file: destName,
          title,
          summary,
        });
      }
      console.log(`[sync-knowledge] Copied ${topics.length} files from`, sourceDir);
    }
  } catch (e) {
    console.warn("[sync-knowledge] could not read source:", e);
  }
}

if (topics.length === 0) {
  const stubName = "stub-welcome.md";
  const dest = join(knowledgeDir, stubName);
  const body = `---
id: stub-welcome
title: Knowledge bundle
summary: Run knowledge sync with AGENT_Z_KNOWLEDGE_SOURCE pointing at skill .md files.
---

# Knowledge bundle

Add \`AGENT_Z_KNOWLEDGE_SOURCE\` in \`.env\` to a folder of markdown docs (e.g. Vercel / shadcn skills), then run \`npm run knowledge:sync\`.

Until then, search results may be empty; you can still use **fetch_url** for official docs.`;
  await writeFile(dest, body, "utf8");
  topics.push({
    id: "stub-welcome",
    file: stubName,
    title: "Knowledge bundle",
    summary: "Configure AGENT_Z_KNOWLEDGE_SOURCE and run npm run knowledge:sync",
  });
  console.log("[sync-knowledge] Wrote minimal stub (no AGENT_Z_KNOWLEDGE_SOURCE or empty dir)");
}

const index = { version: 1, topics, generatedAt: new Date().toISOString() };
await writeFile(join(knowledgeDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
console.log("[sync-knowledge] Wrote", join(knowledgeDir, "index.json"));
