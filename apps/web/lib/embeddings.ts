/**
 * Embedding helper used by the Oversight Layer.
 *
 * Routes through the AI Gateway (`@ai-sdk/gateway`) so we get the same
 * provider routing, auth, and observability as the chat models. The default
 * model is `openai/text-embedding-3-small` (1536-dim, cheap, fast); override
 * with the `AGENT_Z_EMBED_MODEL` env var if you want to swap providers.
 */

import { embed, embedMany } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { env } from "@repo/config/env";

export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIMENSIONS = 1536;

function getEmbedModelId(): string {
  return process.env.AGENT_Z_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

function getEmbedModel() {
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "[embeddings] AI_GATEWAY_API_KEY is required to call the embedding model."
    );
  }
  return createGateway({ apiKey: env.AI_GATEWAY_API_KEY }).textEmbeddingModel(
    getEmbedModelId()
  );
}

/**
 * Embed a single piece of text. Returns the model id alongside so the caller
 * can store it on the row (so we can identify rows that need re-embedding
 * after a model swap).
 */
export async function embedOne(text: string): Promise<{ vector: number[]; model: string }> {
  const model = getEmbedModel();
  const result = await embed({
    model,
    value: text,
  });
  return { vector: result.embedding, model: getEmbedModelId() };
}

/**
 * Batch variant. Most embedding APIs are 5–10× cheaper per item when batched.
 * The AI Gateway handles fanout/retries; we just hand it the array.
 */
export async function embedManyTexts(
  texts: string[]
): Promise<{ vectors: number[][]; model: string }> {
  if (texts.length === 0) return { vectors: [], model: getEmbedModelId() };
  const model = getEmbedModel();
  const result = await embedMany({
    model,
    values: texts,
  });
  return { vectors: result.embeddings, model: getEmbedModelId() };
}

/**
 * Truncate to the embedding model's context window. Each Discord message is
 * already small (≤4 000 chars), so this is a safety net for unusually long
 * pasted blocks.
 */
export function prepareForEmbedding(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  // ~8 000 tokens at 4 chars/token; clamp at 30 000 chars defensively.
  return trimmed.length > 30_000 ? trimmed.slice(0, 30_000) : trimmed;
}
