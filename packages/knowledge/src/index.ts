import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _dir = dirname(fileURLToPath(import.meta.url));
export const knowledgeDocsDir = join(_dir, "../docs");

export async function listBundledDocPaths(): Promise<string[]> {
  const entries = await readdir(knowledgeDocsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".mdx")))
    .map((e) => e.name);
}

export async function readBundledDoc(relative: string): Promise<string> {
  const safe = relative.replaceAll("..", "");
  return readFile(join(knowledgeDocsDir, safe), "utf8");
}
