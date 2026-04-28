import { listBundledDocPaths, readBundledDoc } from "@repo/knowledge";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  let files: string[] = [];
  try {
    files = await listBundledDocPaths();
  } catch {
    files = [];
  }
  const docs = await Promise.all(
    files.map(async (f) => {
      const content = await readBundledDoc(f).catch(() => "(unreadable)");
      return { f, content };
    })
  );
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Knowledge</h1>
      <p className="text-sm text-zinc-500">Bundled markdown under `packages/knowledge/docs`.</p>
      <ul className="flex flex-col gap-4 text-sm">
        {docs.length === 0 ? (
          <li className="text-zinc-500">No files found.</li>
        ) : (
          docs.map(({ f, content }) => (
            <li key={f}>
              <p className="font-mono text-zinc-300">{f}</p>
              <pre className="text-xs font-mono mt-1 p-2 rounded bg-zinc-900 border border-zinc-800 overflow-auto max-h-48">
                {content.slice(0, 2000)}
              </pre>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
