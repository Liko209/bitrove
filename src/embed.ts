// Local llama-server embedding adapter. Branches per active model
// tier (light = bge-m3, standard/quality/max = Qwen3-Embedding-* of
// varying size).
//
// Pooling + prompt strategy:
//   - bge-m3: CLS pooling (set on llama-server --pooling cls), no
//     query / passage prefix (it's a true bi-encoder).
//   - Qwen3-Embedding: last-token pooling, query side needs an
//     "Instruct: ... \nQuery: " prefix; document side is raw text.
// We pick which strategy to use at runtime based on
// BITROVE_EMBED_MODEL (set by electron/services.ts when spawning the
// admin process — see P2.9 for the spawn-side change).

import { readIngestSettings } from "./settings.ts";

const EMBED_URL_RAW = process.env.EMBED_URL ?? "http://127.0.0.1:8765";
const EMBED_URL = EMBED_URL_RAW.includes("/v1/embeddings")
  ? EMBED_URL_RAW
  : `${EMBED_URL_RAW.replace(/\/+$/, "")}/v1/embeddings`;

// Per-tier vector dims. Has to match electron/setup.ts TIERS.embed.dim
// and the chunk_vecs schema in db.ts (which uses EMBED_DIM at
// CREATE TABLE time).
type Tier = "light" | "standard" | "quality" | "max";
const DIM_BY_TIER: Record<Tier, number> = {
  light: 1024,
  standard: 1024,
  quality: 2560,
  max: 4096,
};

// One-time tier resolution. Cached so we don't re-read the JSON on
// every embed() call. The admin restarts on tier change (P1.6) so
// the cache stays correct for the lifetime of the process.
let activeTier: Tier | null = null;
async function resolveTier(): Promise<Tier> {
  if (activeTier) return activeTier;
  // BITROVE_MODEL_TIER lets electron override settings.ts (useful in
  // dev / tests where we want to force a tier without writing to
  // ingest-settings.json).
  const envTier = process.env.BITROVE_MODEL_TIER as Tier | undefined;
  if (envTier && envTier in DIM_BY_TIER) {
    activeTier = envTier;
    return envTier;
  }
  const s = await readIngestSettings();
  activeTier = (s.activeModelTier ?? "light") as Tier;
  return activeTier;
}

export async function getEmbedDim(): Promise<number> {
  const t = await resolveTier();
  return DIM_BY_TIER[t];
}

// Synchronous fallback used by db.ts at openDb() time when the
// settings file hasn't been read yet. Reads BITROVE_MODEL_TIER env
// (set by electron) or falls back to 1024 (light/standard).
export function getEmbedDimSync(): number {
  const envTier = process.env.BITROVE_MODEL_TIER as Tier | undefined;
  if (envTier && envTier in DIM_BY_TIER) return DIM_BY_TIER[envTier];
  return 1024;
}

export const EMBED_DIM = getEmbedDimSync();

// 替换不成对的 UTF-16 surrogate 为 U+FFFD，避免下游 JSON 解析失败
function sanitizeForJson(s: string): string {
  return s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�",
  );
}

// llama-server returns 503 with a "model is loading" body while the
// GGUF mmap is still warming up — that's not actually a failure, just
// "ask again in a second". 502 / 504 happen on cold connect. Retry
// those a handful of times before giving up so a fresh app launch
// doesn't poison every file in the first scan with transient errors.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 6;

// Qwen3-Embedding's official query-side instruction. Document side
// is raw text. Keeping the prompt short — Qwen handles arbitrary
// task descriptions, but a generic retrieval-targeted instruction is
// enough for our use.
const QWEN_QUERY_PROMPT_PREFIX =
  "Instruct: Given a search query, retrieve relevant passages that answer the query\nQuery: ";

async function withPromptForRole(
  text: string,
  role: "query" | "passage",
): Promise<string> {
  const t = await resolveTier();
  if (t === "light") return text; // bge-m3: no prefix either side
  // Qwen3-Embedding-*: query gets the instruct prefix, passage stays raw
  return role === "query" ? QWEN_QUERY_PROMPT_PREFIX + text : text;
}

export async function embed(texts: string[]): Promise<number[][]> {
  // Backward-compat shim: legacy callers (catalog cards, anything
  // not yet branched) get passage-side embeddings, which is
  // correct for indexing. Search code paths should call
  // embedQuery() explicitly.
  return embedMany(texts, "passage");
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedMany([text], "query");
  return v;
}

export async function embedPassage(text: string): Promise<number[]> {
  const [v] = await embedMany([text], "passage");
  return v;
}

async function embedMany(
  texts: string[],
  role: "query" | "passage",
): Promise<number[][]> {
  const withPrompt = await Promise.all(
    texts.map((t) => withPromptForRole(t, role)),
  );
  const clean = withPrompt.map(sanitizeForJson);
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let r: Response;
    try {
      r = await fetch(EMBED_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: clean, model: "bge-m3" }),
      });
    } catch (e) {
      // Network-level failure (connection refused while llama-server
      // is still starting up). Treat as retryable.
      lastErr = (e as Error).message;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((res) => setTimeout(res, backoff(attempt)));
        continue;
      }
      throw new Error(`embed connect failed: ${lastErr}`);
    }
    if (r.ok) {
      const j = (await r.json()) as { data: { embedding: number[] }[] };
      return j.data.map((d) => d.embedding);
    }
    const body = await r.text();
    lastErr = `${r.status} ${body.slice(0, 200)}`;
    if (!RETRYABLE_STATUS.has(r.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`embed failed: ${lastErr}`);
    }
    await new Promise((res) => setTimeout(res, backoff(attempt)));
  }
  throw new Error(`embed failed after ${MAX_ATTEMPTS} attempts: ${lastErr}`);
}

function backoff(attempt: number): number {
  // 1s, 2s, 4s, 4s, 4s — covers the typical 10-30s GGUF warmup.
  return Math.min(1000 * 2 ** (attempt - 1), 4000);
}

// Legacy single-text API. Treats input as a passage (correct for the
// catalog-card flow that historically called it). Search-side paths
// should switch to embedQuery() explicitly.
export async function embedOne(text: string): Promise<number[]> {
  return embedPassage(text);
}
