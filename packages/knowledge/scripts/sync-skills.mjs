import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(here, "../docs");
const userHome = process.env.USERPROFILE || process.env.HOME || "";

const defaultSources = [
  path.join(userHome, ".cursor", "plugins", "cache", "cursor-public", "vercel"),
  path.join(userHome, ".cursor", "skills"),
  path.join(userHome, ".agents", "skills"),
].filter(Boolean);

const sourceRoots = (process.env.AGENT_Z_KNOWLEDGE_SOURCE
  ? process.env.AGENT_Z_KNOWLEDGE_SOURCE.split(path.delimiter)
  : defaultSources
).filter((root) => root && existsSync(root));

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

async function walk(dir, matches = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, matches);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      matches.push(fullPath);
    }
  }
  return matches;
}

function titleFromMarkdown(markdown, fallback) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title || fallback;
}

function summaryFromMarkdown(markdown) {
  const body = markdown
    .replace(/^---[\s\S]*?---\s*/, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join(" ");
  return body.slice(0, 320);
}

await mkdir(docsDir, { recursive: true });

const skillFiles = [];
for (const root of sourceRoots) {
  skillFiles.push(...(await walk(root)));
}

const topics = [];
for (const sourcePath of skillFiles.sort()) {
  const markdown = await readFile(sourcePath, "utf8");
  const parent = path.basename(path.dirname(sourcePath));
  const title = titleFromMarkdown(markdown, parent);
  const id = `skill-${slugify(parent || title)}-${shortHash(sourcePath)}`;
  const file = `${id}.md`;

  await writeFile(
    path.join(docsDir, file),
    `---\nsource: ${sourcePath.replaceAll("\\", "/")}\n---\n\n${markdown}`,
    "utf8"
  );

  topics.push({
    id,
    file,
    title,
    summary: summaryFromMarkdown(markdown),
    source: "cursor-skill",
  });
}

await writeFile(
  path.join(docsDir, "index.json"),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), topics }, null, 2)}\n`,
  "utf8"
);

console.log(`Synced ${topics.length} skill docs into ${docsDir}`);
