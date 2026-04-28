"use client";

import { useState } from "react";
import { saveModelId } from "./actions";

type Providers = Record<string, { id: string; name: string }[]>;

export function ModelsClient({
  currentModelId,
  initialProviders,
}: {
  currentModelId: string;
  initialProviders: Providers;
}) {
  const [selected, setSelected] = useState(currentModelId);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-400">Model</span>
        <select
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value={currentModelId}>{currentModelId}</option>
          {Object.entries(initialProviders).map(([provider, models]) => (
            <optgroup key={provider} label={provider}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="rounded-md bg-zinc-100 text-zinc-900 py-2 text-sm font-medium w-fit px-4"
        onClick={async () => {
          setStatus(null);
          await saveModelId(selected);
          setStatus("Saved. Runtime cache invalidated.");
        }}
      >
        Save to database
      </button>
      {status && <p className="text-sm text-emerald-400">{status}</p>}
      <TestPromptPanel />
    </div>
  );
}

function TestPromptPanel() {
  const [prompt, setPrompt] = useState("Say hello in one sentence.");
  const [out, setOut] = useState<string | null>(null);
  return (
    <div className="mt-8 flex flex-col gap-2 border-t border-zinc-800 pt-6">
      <h2 className="text-lg font-medium">Test prompt</h2>
      <textarea
        className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm min-h-[100px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        type="button"
        className="rounded-md border border-zinc-700 py-2 text-sm w-fit px-4"
        onClick={async () => {
          setOut(null);
          const res = await fetch("/api/admin/test-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const j = await res.json();
          setOut(JSON.stringify(j, null, 2));
        }}
      >
        Run
      </button>
      {out && (
        <pre className="text-xs font-mono overflow-auto rounded-md bg-zinc-900 p-3 border border-zinc-800">
          {out}
        </pre>
      )}
    </div>
  );
}
