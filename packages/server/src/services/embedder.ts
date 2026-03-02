import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import {
  EmbedDimensionError,
  OllamaError,
  OllamaModelNotFoundError,
  OllamaTimeoutError,
  OllamaUnreachableError,
} from "../errors.js";
import { logger } from "../logger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const EXPECTED_DIMENSIONS = 768;
const BATCH_CHUNK_SIZE = 32;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_STATS_LOG_INTERVAL = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

interface CacheEntry {
  cache: LRUCache<string, number[]>;
  hits: number;
  misses: number;
  totalCalls: number;
}

// ─── Per-project LRU cache ────────────────────────────────────────────────────

const projectCaches = new Map<string, CacheEntry>();

// Test-only: allow injecting a fake fetch implementation
let _fetchImpl: FetchImpl = (url, init) => fetch(url, init);

/**
 * Test-only hook: replace the internal fetch implementation.
 */
export function _setFetchImpl(fn: FetchImpl): void {
  _fetchImpl = fn;
}

/**
 * Get or create a per-project cache entry.
 */
export function getProjectCache(projectId: string): CacheEntry {
  let entry = projectCaches.get(projectId);
  if (!entry) {
    entry = {
      cache: new LRUCache<string, number[]>({ max: 10_000 }),
      hits: 0,
      misses: 0,
      totalCalls: 0,
    };
    projectCaches.set(projectId, entry);
  }
  return entry;
}

/**
 * Clear all per-project caches. Used in tests and for full cache reset.
 */
export function clearAllCaches(): void {
  projectCaches.clear();
}

/**
 * Get cache statistics for a specific project.
 */
export function getCacheStats(projectId: string): { size: number; hits: number; misses: number } {
  const entry = projectCaches.get(projectId);
  if (!entry) {
    return { size: 0, hits: 0, misses: 0 };
  }
  return {
    size: entry.cache.size,
    hits: entry.hits,
    misses: entry.misses,
  };
}

// ─── Cache key ────────────────────────────────────────────────────────────────

function makeCacheKey(modelName: string, text: string): string {
  return createHash("sha256").update(`${modelName}:${text}`).digest("hex");
}

// ─── Dimension assertion ──────────────────────────────────────────────────────

function assertDimensions(vectors: number[][], model: string): void {
  for (const vec of vectors) {
    if (vec.length !== EXPECTED_DIMENSIONS) {
      throw new EmbedDimensionError(model, vec.length, EXPECTED_DIMENSIONS);
    }
  }
}

// ─── Core HTTP call ───────────────────────────────────────────────────────────

async function callOllamaEmbed(
  texts: string[],
  model: string,
  ollamaUrl: string,
): Promise<number[][]> {
  let response: Response;

  try {
    response = await _fetchImpl(`${ollamaUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException) {
      // AbortError or TimeoutError — both indicate a timeout
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        throw new OllamaTimeoutError(ollamaUrl, REQUEST_TIMEOUT_MS);
      }
    }
    if (err instanceof TypeError) {
      // Network-level failure: ECONNREFUSED, DNS failure, etc.
      throw new OllamaUnreachableError(ollamaUrl);
    }
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new OllamaModelNotFoundError(model);
    }
    throw new OllamaError(`Ollama returned HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { embeddings: number[][] };
  return data.embeddings;
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, ollamaUrl: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Definitive errors: fail fast, no retry
      if (err instanceof OllamaModelNotFoundError || err instanceof EmbedDimensionError) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      // Transient errors: retry with exponential backoff (except last attempt)
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 100;
        logger.warn(
          { attempt: attempt + 1, delayMs: delay, error: lastError.message },
          "Ollama transient failure — retrying",
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted — throw the last error, wrapped if needed
  if (lastError instanceof OllamaUnreachableError) {
    throw lastError;
  }
  if (lastError instanceof OllamaTimeoutError) {
    throw lastError;
  }
  if (lastError instanceof OllamaError) {
    throw lastError;
  }
  throw new OllamaUnreachableError(ollamaUrl);
}

// ─── Batch chunking ───────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Main embed() function ────────────────────────────────────────────────────

/**
 * Embed an array of texts using Ollama's /api/embed endpoint.
 *
 * Features:
 * - Per-project LRU cache with SHA-256 keys (model + text)
 * - Auto-chunking of large batches (>32 texts) to prevent OOM
 * - Exponential backoff retry (3 attempts) for transient failures
 * - Fail-fast for definitive errors (model not found, dimension mismatch)
 * - Dimension assertion (768) on every returned vector
 */
export async function embed(
  texts: string[],
  projectId: string,
  config: { ollamaUrl: string; embedModel: string },
): Promise<number[][]> {
  const { ollamaUrl, embedModel } = config;
  const cacheEntry = getProjectCache(projectId);

  // Track call count for periodic stats logging
  cacheEntry.totalCalls++;
  if (cacheEntry.totalCalls % CACHE_STATS_LOG_INTERVAL === 0) {
    logger.debug(
      {
        projectId,
        cacheSize: cacheEntry.cache.size,
        hits: cacheEntry.hits,
        misses: cacheEntry.misses,
        hitRate:
          cacheEntry.hits > 0
            ? (cacheEntry.hits / (cacheEntry.hits + cacheEntry.misses)).toFixed(3)
            : "0.000",
      },
      "Embedding cache stats",
    );
  }

  // Partition into cached and uncached texts, preserving original order
  const results: number[][] = new Array(texts.length);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i] as string;
    const key = makeCacheKey(embedModel, text);
    const cached = cacheEntry.cache.get(key);
    if (cached !== undefined) {
      results[i] = cached;
      cacheEntry.hits++;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(text);
      cacheEntry.misses++;
    }
  }

  if (uncachedTexts.length === 0) {
    return results;
  }

  // Chunk uncached texts into groups of BATCH_CHUNK_SIZE
  const chunks = chunkArray(uncachedTexts, BATCH_CHUNK_SIZE);
  const allNewVectors: number[][] = [];

  for (const chunk of chunks) {
    const vectors = await withRetry(() => callOllamaEmbed(chunk, embedModel, ollamaUrl), ollamaUrl);

    // Assert dimensions before caching or returning
    assertDimensions(vectors, embedModel);
    allNewVectors.push(...vectors);
  }

  // Store new vectors in cache and assign to results
  for (let j = 0; j < uncachedIndices.length; j++) {
    const originalIdx = uncachedIndices[j] as number;
    const vector = allNewVectors[j] as number[];
    const key = makeCacheKey(embedModel, texts[originalIdx] as string);
    cacheEntry.cache.set(key, vector);
    results[originalIdx] = vector;
  }

  return results;
}

// ─── Ollama Health Check ───────────────────────────────────────────────────────

export type OllamaHealthStatus = "ok" | "unreachable" | "model_missing";

let ollamaStatus: OllamaHealthStatus = "unreachable"; // Default: assume unreachable until checked

export function getOllamaStatus(): OllamaHealthStatus {
  return ollamaStatus;
}

export function setOllamaStatus(status: OllamaHealthStatus): void {
  ollamaStatus = status;
}

/**
 * Check Ollama reachability and verify the embed model is available.
 *
 * Calls GET /api/tags with a 5-second timeout. Verifies the model is in the
 * list (handles ":latest" tag suffix). Does NOT make a test embedding call.
 */
export async function checkOllamaHealth(
  ollamaUrl: string,
  embedModel: string,
): Promise<OllamaHealthStatus> {
  try {
    const response = await _fetchImpl(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return "unreachable";
    const data = (await response.json()) as { models: Array<{ name: string }> };
    // Model name may include tag suffix (e.g., "nomic-embed-text:latest")
    const hasModel = data.models.some(
      (m) => m.name === embedModel || m.name.startsWith(`${embedModel}:`),
    );
    return hasModel ? "ok" : "model_missing";
  } catch {
    return "unreachable";
  }
}
