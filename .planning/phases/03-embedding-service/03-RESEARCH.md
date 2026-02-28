# Phase 3: Embedding Service - Research

**Researched:** 2026-02-28
**Domain:** Ollama HTTP API, LRU caching, TypeScript fetch, error classification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Error reporting**
- Actionable guidance in all error messages — include what went wrong AND how to fix it (e.g., "Ollama unreachable at localhost:11434. Run: ollama serve" or "Model nomic-embed-text not found. Run: ollama pull nomic-embed-text")
- Distinct error types per failure mode: Ollama unreachable, model not found, wrong dimensions, timeout — callers can handle each differently
- Read-path degradation logs a stderr warning ("Ollama unavailable — returning non-semantic results only") so agents know results may be less relevant
- Dimension assertion error includes model name and explanation (e.g., "Dimension mismatch: model nomic-embed-text returned 384 dimensions, expected 768. This usually means the model changed or a different model is loaded.")

**Connection resilience**
- Retry with exponential backoff on transient failures (timeouts, connection reset) — 2-3 attempts. Fail fast on definitive errors (model not found, wrong dimensions)
- 30-second per-request timeout — generous enough for first-call model loading on slower hardware
- Auto-chunk large batch requests into groups of ~32 texts to prevent Ollama timeouts or OOM on huge payloads
- Ollama URL configurable via OLLAMA_URL env var (default: http://localhost:11434) — already specified in Phase 1, confirmed it flows through to embedding service

**Embedding caching**
- In-memory LRU cache with 10,000 entries (~30MB memory)
- Per-project cache isolation (separate cache per project_id)
- Cache key = hash(model_name + text) — switching models automatically invalidates cache
- Ephemeral only — cache lives in memory, gone on server restart. No disk persistence
- LRU eviction only, no TTL — embeddings are deterministic for same text + model
- Log cache stats periodically to stderr (hit/miss ratio, current size) for debugging and tuning

**Startup validation**
- Blocking health check with 5-second timeout — server waits for result before registering tools
- Checks Ollama reachability AND verifies nomic-embed-text model is available (no test embed)
- Results surfaced via stderr log line AND included in ping/echo tool response so agents can programmatically check Ollama status
- Startup only — no periodic re-checks. Ollama going down mid-session surfaces naturally on next embed call

### Claude's Discretion
- HTTP client library choice and connection pooling
- Exact exponential backoff timing and jitter
- Cache implementation details (hash function, data structure)
- Batch chunk size tuning (starting point ~32, can adjust)
- Internal module structure and file organization

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EMBED-01 | Embedding service calls Ollama /api/embed with nomic-embed-text model (768 dimensions) | Verified: POST /api/embed, `input` field accepts string or array, response is `embeddings: number[][]` |
| EMBED-02 | Embedding service supports single and batch embedding | Verified: /api/embed `input` field is `string | string[]`; batch chunking into ~32 texts handled in wrapper |
| EMBED-03 | Write operations (store_document, index_codebase) fail fast with clear error when Ollama is unreachable | Verified: fetch() throws TypeError on ECONNREFUSED; classify via error type, surface OllamaUnreachableError |
| EMBED-04 | Read operations (semantic_search, search_code, query_documents) continue working without Ollama | Architecture: embed() function takes `required` flag; callers pass `required: false` on read paths |
| EMBED-05 | Non-blocking health check on startup logs warning if Ollama is down but server still starts | Architecture: startup check uses GET /api/tags (5s timeout); result stored in module state; non-blocking relative to tool registration |
| EMBED-06 | Embedding dimension assertion prevents inserting vectors with wrong dimensions | Code: assert function checks `vector.length === EXPECTED_DIMENSIONS`; throws EmbedDimensionError before any DB call |
</phase_requirements>

## Summary

Phase 3 builds a single TypeScript module (`src/services/embedder.ts` or similar) that wraps the Ollama `/api/embed` HTTP endpoint. The service provides: a typed `embed()` function (single + batch), an LRU embedding cache keyed per project_id, explicit error types for each failure mode, dimension assertion, and a startup health check that populates the ping tool's `ollamaStatus` field.

All HTTP calls use the native `fetch()` API (available in Bun and Node 18+) with `AbortSignal.timeout()` for the 30-second request timeout and a manual 5-second timeout for the startup health check. No external HTTP client library is needed. The `lru-cache` npm package (v11.x) provides the LRU implementation with `max: 10000`; the project already uses ESM and Bun, both of which are compatible.

The key architecture decision is that `embed()` is **not** a fire-and-forget function: the write/read distinction lives in the _caller_, not the service. The service exposes a `required` parameter (or two named functions like `embedOrThrow` / `embedOrNull`). This keeps the embedding service simple while giving callers control over degradation behavior.

**Primary recommendation:** Use native `fetch()` + `AbortSignal.timeout()` for HTTP, `lru-cache` v11 for caching, `node:crypto` SHA-256 for cache keys, and a hand-rolled retry loop (2-3 retries, exponential backoff) — no additional dependencies needed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fetch` (built-in) | Bun 1.x / Node 18+ | HTTP calls to Ollama | Already available, no extra dep; AbortSignal.timeout() handles timeouts natively |
| `lru-cache` | ^11.0.0 | In-memory LRU per-project embedding cache | Industry standard, typed, zero deps, `max` property is sufficient |
| `node:crypto` | Built-in | SHA-256 cache key hashing | Deterministic, fast, no dep; already used by Node/Bun |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` (already installed) | latest | Log cache stats, startup warnings to stderr | Already in project — use `logger` from `src/logger.ts` |
| `zod` (already installed) | ^4.0.0 | Validate Ollama response shape at runtime | Optional hardening: parse the embeddings array shape |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lru-cache` | Hand-rolled Map + doubly-linked list | lru-cache handles eviction edge cases; hand-rolling risks bugs and ~50 lines of boilerplate |
| `node:crypto` SHA-256 | Simple string concatenation as key | Concatenation risks collisions on texts that contain the separator; SHA-256 is collision-resistant |
| Native `fetch` | `axios`, `undici`, `got` | fetch is already in Bun/Node 18+; no extra dep for a simple POST |

**Installation:**
```bash
bun add lru-cache
```
(All other dependencies already present)

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── embedder.ts      # EmbeddingService class or module exports
├── errors.ts            # Shared typed error classes (OllamaUnreachableError, OllamaModelNotFoundError, EmbedDimensionError, OllamaTimeoutError)
└── types.ts             # Extend SynapseConfig if needed; EmbedResult type
```

### Pattern 1: Distinct Error Classes Per Failure Mode

**What:** Define a class hierarchy so callers can `instanceof`-check the failure mode.

**When to use:** All Ollama call sites — write paths re-throw, read paths catch and degrade.

**Example:**
```typescript
// src/errors.ts
export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

export class OllamaUnreachableError extends OllamaError {
  constructor(url: string) {
    super(`Ollama unreachable at ${url}. Run: ollama serve`);
    this.name = 'OllamaUnreachableError';
  }
}

export class OllamaModelNotFoundError extends OllamaError {
  constructor(model: string) {
    super(`Model ${model} not found. Run: ollama pull ${model}`);
    this.name = 'OllamaModelNotFoundError';
  }
}

export class OllamaTimeoutError extends OllamaError {
  constructor(url: string, timeoutMs: number) {
    super(`Ollama request timed out after ${timeoutMs}ms at ${url}. Run: ollama serve`);
    this.name = 'OllamaTimeoutError';
  }
}

export class EmbedDimensionError extends OllamaError {
  constructor(model: string, got: number, expected: number) {
    super(
      `Dimension mismatch: model ${model} returned ${got} dimensions, expected ${expected}. ` +
      `This usually means the model changed or a different model is loaded.`
    );
    this.name = 'EmbedDimensionError';
  }
}
```

### Pattern 2: Ollama /api/embed HTTP Call

**What:** Single POST to `/api/embed` with `input: string | string[]`. Response is `{ embeddings: number[][] }`.

**When to use:** All embedding calls — single strings and batch arrays both use the same endpoint.

**Example:**
```typescript
// Source: https://docs.ollama.com/api/embed (verified via Context7)
const response = await fetch(`${ollamaUrl}/api/embed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: embedModel, input: texts }),
  signal: AbortSignal.timeout(30_000), // 30-second timeout
});

if (!response.ok) {
  const body = await response.text();
  if (response.status === 404) {
    throw new OllamaModelNotFoundError(embedModel);
  }
  throw new OllamaError(`Ollama returned HTTP ${response.status}: ${body}`);
}

const data = await response.json() as { embeddings: number[][] };
// data.embeddings is an array of vectors, one per input text
```

**Key API facts (HIGH confidence, verified via official Ollama docs):**
- Endpoint: `POST /api/embed` (NOT the old `/api/embeddings` — that was the legacy endpoint)
- Request: `{ model: string, input: string | string[] }`
- Response: `{ model: string, embeddings: number[][], total_duration: number, load_duration: number, prompt_eval_count: number }`
- `embeddings` is always an array even for a single input; for a single string input, `embeddings[0]` is the vector
- HTTP 404 = model not found; TCP connection failure = `TypeError` (ECONNREFUSED)
- HTTP 500 = Ollama server-side failure

### Pattern 3: Startup Health Check (Blocking, 5s Timeout)

**What:** Before registering tools, check `GET /api/tags` to verify Ollama is up and `nomic-embed-text` is in the models list. Store the result in module-level state so ping tool can report it.

**When to use:** Server startup, before `createServer()` or as first step in `startServer()`.

**Example:**
```typescript
// Source: https://docs.ollama.com/api/tags (verified)
// GET /api/tags response: { models: Array<{ name: string, ... }> }

export type OllamaHealthStatus = 'ok' | 'unreachable' | 'model_missing';

export async function checkOllamaHealth(
  ollamaUrl: string,
  embedModel: string,
): Promise<OllamaHealthStatus> {
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return 'unreachable';
    const data = await response.json() as { models: Array<{ name: string }> };
    const hasModel = data.models.some((m) => m.name === embedModel || m.name.startsWith(`${embedModel}:`));
    return hasModel ? 'ok' : 'model_missing';
  } catch {
    return 'unreachable';
  }
}
```

**Note on model name matching:** The `name` field from `/api/tags` may include a tag suffix (e.g., `"nomic-embed-text:latest"`), so check with `startsWith` as well as exact match.

**Note on "blocking but server still starts":** The CONTEXT.md says "blocking health check with 5-second timeout — server waits for result before registering tools." This means: `await checkOllamaHealth(...)` in `startServer()` before `server.connect(transport)`, but if the result is `unreachable` or `model_missing`, log a warning and continue — do not throw. The check is "blocking" in the sense that startup waits for the result; it is NOT "blocking" in the sense of aborting startup.

### Pattern 4: Per-Project LRU Cache with SHA-256 Cache Keys

**What:** A `Map<string, LRUCache<string, number[]>>` where the outer key is `project_id` and the inner cache stores `cacheKey → vector`. Cache key = `SHA256(modelName + ':' + text)`.

**When to use:** Wrap every call to Ollama in the embedding service.

**Example:**
```typescript
// Source: https://github.com/isaacs/node-lru-cache (verified via Context7)
import { LRUCache } from 'lru-cache';
import { createHash } from 'node:crypto';

const PROJECT_CACHES = new Map<string, LRUCache<string, number[]>>();

function getProjectCache(projectId: string): LRUCache<string, number[]> {
  let cache = PROJECT_CACHES.get(projectId);
  if (!cache) {
    cache = new LRUCache<string, number[]>({ max: 10_000 });
    PROJECT_CACHES.set(projectId, cache);
  }
  return cache;
}

function makeCacheKey(model: string, text: string): string {
  return createHash('sha256').update(`${model}:${text}`).digest('hex');
}
```

### Pattern 5: Batch Chunking (~32 texts)

**What:** Split input arrays into chunks of 32 and call `/api/embed` once per chunk. Collect all results.

**When to use:** Any batch embed call to prevent Ollama OOM on huge payloads.

**Example:**
```typescript
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function embedBatch(texts: string[], model: string, ollamaUrl: string): Promise<number[][]> {
  const CHUNK_SIZE = 32;
  const results: number[][] = [];
  for (const chunk of chunkArray(texts, CHUNK_SIZE)) {
    const chunkEmbeds = await callOllamaEmbed(chunk, model, ollamaUrl);
    results.push(...chunkEmbeds);
  }
  return results;
}
```

### Pattern 6: Exponential Backoff Retry (Hand-Rolled, No External Library)

**What:** Retry transient failures (ECONNREFUSED on initial connect, AbortError/timeout, HTTP 5xx) up to 3 attempts with exponential backoff + jitter. Do NOT retry 4xx errors (definitive failures).

**When to use:** Inside the core fetch wrapper in `embedder.ts`.

**Example:**
```typescript
// Transient: TypeError (ECONNREFUSED), DOMException AbortError (timeout), HTTP 500+
// Definitive: HTTP 4xx (model not found, bad request) — throw immediately
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry definitive errors
      if (err instanceof OllamaModelNotFoundError || err instanceof EmbedDimensionError) {
        throw err;
      }
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
```

### Pattern 7: Dimension Assertion

**What:** After receiving embeddings from Ollama, assert each vector has exactly 768 dimensions before returning. Throw `EmbedDimensionError` if not.

**When to use:** In the `embedder.ts` response parsing, before cache storage, before returning to caller.

**Example:**
```typescript
const EXPECTED_DIMENSIONS = 768;

function assertDimensions(vector: number[], model: string): void {
  if (vector.length !== EXPECTED_DIMENSIONS) {
    throw new EmbedDimensionError(model, vector.length, EXPECTED_DIMENSIONS);
  }
}
```

### Pattern 8: Write-Path vs Read-Path Distinction

**What:** The embedding service `embed()` function always calls Ollama and throws on failure. The write-path / read-path distinction is implemented by callers.

**When to use:** Write paths (store_document, index_codebase) call `embed()` directly — failure propagates. Read paths (query_documents, semantic_search) catch `OllamaError` and continue without the embedding.

**Example:**
```typescript
// Write path: let it throw
const vectors = await embedder.embed(texts, projectId);

// Read path: degrade gracefully
let queryVector: number[] | null = null;
try {
  [queryVector] = await embedder.embed([queryText], projectId);
} catch (err) {
  if (err instanceof OllamaError) {
    logger.warn('Ollama unavailable — returning non-semantic results only');
    queryVector = null;
  } else {
    throw err; // Re-throw non-Ollama errors
  }
}
```

### Anti-Patterns to Avoid

- **Single catch-all error type:** Catching all errors as a generic `OllamaError` prevents callers from distinguishing "unreachable" from "model not found" from "wrong dimensions". Use the distinct error class hierarchy.
- **Test embed on startup:** Using `/api/embed` as the health check (vs `/api/tags`) is slower and consumes GPU memory for no purpose. `/api/tags` is a metadata-only endpoint.
- **Global cache without project isolation:** A single LRU cache across all projects leaks content between projects — use per-project caches.
- **No chunking on batch:** Passing 1000 texts as a single `/api/embed` call can cause Ollama OOM or timeout. Always chunk.
- **Retry 4xx responses:** Model not found (404) and dimension errors will never resolve on retry. Retrying wastes time and delays the clear error message.
- **Writing to stdout:** The existing project pattern (`pino.destination(2)`) must be followed for all logging in this module.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU eviction | Custom Map + doubly-linked list | `lru-cache` v11 | Eviction order bugs, `max` enforcement edge cases |
| Cache key collision resistance | String concatenation | `node:crypto` SHA-256 | "model1:text2" and "model1:tex" + "t2" would collide; SHA-256 is collision-resistant |
| HTTP timeout | `setTimeout` + `clearTimeout` + AbortController manually | `AbortSignal.timeout(ms)` | AbortSignal.timeout is built into fetch, composes correctly, no cleanup code needed |

**Key insight:** This phase has almost no reason to install new libraries. `fetch` + `AbortSignal.timeout` + `lru-cache` + `node:crypto` covers all requirements. The retry logic is ~20 lines and has no edge cases complex enough to warrant a library.

## Common Pitfalls

### Pitfall 1: Old `/api/embeddings` vs New `/api/embed`
**What goes wrong:** Code calls `POST /api/embeddings` (the old endpoint) — may work on older Ollama versions but is not the documented current endpoint.
**Why it happens:** Many blog posts and older LangChain integrations reference `/api/embeddings`. The current OpenAPI spec uses `/api/embed`.
**How to avoid:** Always use `POST /api/embed`. The response field is `embeddings` (plural array of arrays), not `embedding` (single array).
**Warning signs:** Getting a 404 despite Ollama running; response has an `embedding` field instead of `embeddings`.

### Pitfall 2: Model Name Tag Mismatch in /api/tags
**What goes wrong:** Health check reports `model_missing` even when `nomic-embed-text` is installed.
**Why it happens:** `/api/tags` returns model names with tags like `"nomic-embed-text:latest"`, not bare `"nomic-embed-text"`.
**How to avoid:** Use `m.name === embedModel || m.name.startsWith(embedModel + ':')` when checking the models list.
**Warning signs:** Startup warning "model missing" fires but `ollama list` shows nomic-embed-text installed.

### Pitfall 3: First-Call Model Load Latency
**What goes wrong:** First embed call takes 10-20 seconds as Ollama loads the model into memory — exceeds a 5-second timeout and gets retried unnecessarily.
**Why it happens:** Ollama loads models lazily on first use. The 30-second timeout in CONTEXT.md accounts for this.
**How to avoid:** Use the 30-second timeout for all `/api/embed` calls. The startup health check uses `/api/tags` (metadata only, fast), not a test embed.
**Warning signs:** Intermittent OllamaTimeoutError on the very first embed call in a fresh Ollama session.

### Pitfall 4: fetch() TypeError vs HTTP Error Distinction
**What goes wrong:** Treating all errors uniformly — a `TypeError` (ECONNREFUSED) and a 404 response are both errors but require very different handling.
**Why it happens:** `fetch()` throws a `TypeError` for network failures (no response) but returns a non-ok `Response` for HTTP errors. Only `response.ok` distinguishes HTTP success from HTTP error within the response object.
**How to avoid:** Check `!response.ok` after fetch resolves; catch `TypeError` (network unreachable) and `DOMException` (timeout/AbortError) separately in the catch block. Classify each into the appropriate custom error class.
**Warning signs:** OllamaUnreachableError being thrown for model-not-found cases (or vice versa).

### Pitfall 5: Cache Stats Logging Frequency
**What goes wrong:** Logging cache stats on every embed call floods stderr and degrades performance.
**Why it happens:** Misreading "log cache stats periodically" from CONTEXT.md.
**How to avoid:** Log stats every N calls (e.g., every 100 embeds) or on a time interval, not per-call. A simple counter modulo check is sufficient.
**Warning signs:** Pino output overwhelmed with cache stat lines.

### Pitfall 6: ping Tool ollamaStatus Field
**What goes wrong:** `ping` still returns `ollamaStatus: "unknown"` after Phase 3 is complete.
**Why it happens:** The startup health check result is not wired back into the `ping` tool. This is a cross-cutting concern between `embedder.ts` and `server.ts`.
**How to avoid:** Store the health status in a module-level variable (or singleton) in `embedder.ts` and export a `getOllamaStatus()` function. Update the `ping` tool registration in `server.ts` to call this function.
**Warning signs:** Tests checking `ollamaStatus` in ping response still see `"unknown"` after the health check runs.

## Code Examples

Verified patterns from official sources:

### Complete /api/embed Call with Error Classification
```typescript
// Source: https://docs.ollama.com/api/embed (verified via Context7)
async function callOllamaEmbed(
  texts: string[],
  model: string,
  ollamaUrl: string,
): Promise<number[][]> {
  let response: Response;
  try {
    response = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new OllamaTimeoutError(ollamaUrl, 30_000);
    }
    // TypeError = ECONNREFUSED or DNS failure
    throw new OllamaUnreachableError(ollamaUrl);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new OllamaModelNotFoundError(model);
    }
    throw new OllamaError(`Ollama HTTP ${response.status}: ${body}`);
  }

  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings;
}
```

### LRU Cache Setup (Per-Project)
```typescript
// Source: https://github.com/isaacs/node-lru-cache (verified via Context7)
import { LRUCache } from 'lru-cache';
import { createHash } from 'node:crypto';

const PROJECT_CACHES = new Map<string, LRUCache<string, number[]>>();
let cacheHits = 0;
let cacheMisses = 0;

function getProjectCache(projectId: string): LRUCache<string, number[]> {
  if (!PROJECT_CACHES.has(projectId)) {
    PROJECT_CACHES.set(projectId, new LRUCache<string, number[]>({ max: 10_000 }));
  }
  return PROJECT_CACHES.get(projectId)!;
}

function cacheKey(model: string, text: string): string {
  return createHash('sha256').update(`${model}:${text}`).digest('hex');
}
```

### Startup Health Check Integration (in server.ts or index.ts)
```typescript
// Integrates with existing server.ts pattern
// startServer() in server.ts becomes async and calls checkOllamaHealth before connect()
export async function startServer(server: McpServer, config: SynapseConfig): Promise<void> {
  // Blocking health check — await result before connecting transport
  // Server starts regardless of result; status stored for ping tool
  const status = await checkOllamaHealth(config.ollamaUrl, config.embedModel);
  setOllamaStatus(status); // module-level setter in embedder.ts

  if (status !== 'ok') {
    logger.warn(
      { ollamaUrl: config.ollamaUrl, embedModel: config.embedModel, status },
      status === 'unreachable'
        ? `Ollama unreachable at ${config.ollamaUrl}. Run: ollama serve`
        : `Model ${config.embedModel} not found. Run: ollama pull ${config.embedModel}`,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Synapse MCP server running on stdio');
}
```

### Dimension Assertion
```typescript
const EXPECTED_DIMENSIONS = 768; // nomic-embed-text dimensions (HIGH confidence)

function assertDimensions(vector: number[], model: string): void {
  if (vector.length !== EXPECTED_DIMENSIONS) {
    throw new EmbedDimensionError(model, vector.length, EXPECTED_DIMENSIONS);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `POST /api/embeddings` (legacy) | `POST /api/embed` | ~2024 Ollama refactor | New endpoint accepts `input: string \| string[]` and returns `embeddings: number[][]`; old endpoint accepted `prompt: string` and returned `embedding: number[]` |
| Hard-coded `http://localhost:11434` | `OLLAMA_URL` env var | Phase 1 decision | Already in SynapseConfig — flows through to embedding service |

**Deprecated/outdated:**
- `POST /api/embeddings`: The legacy single-text endpoint. Returns `{ embedding: number[] }` (singular). Still works in older Ollama but not the documented API. Do not use.

## Open Questions

1. **AbortError name in Bun vs Node**
   - What we know: In browser/Node `fetch`, timeout AbortSignal throws a `DOMException` with `name === 'TimeoutError'` or `name === 'AbortError'` depending on how it was triggered.
   - What's unclear: Bun's `fetch` implementation may use a different error name for AbortSignal.timeout().
   - Recommendation: In the catch block, check both `err instanceof DOMException` and `err.name === 'AbortError' || err.name === 'TimeoutError'`, or check `err.message` for "timed out" — then verify in tests.

2. **nomic-embed-text model tag format in /api/tags**
   - What we know: The `/api/tags` response includes model names sometimes with `:latest` suffix.
   - What's unclear: Whether a user who ran `ollama pull nomic-embed-text` sees it as `"nomic-embed-text"` or `"nomic-embed-text:latest"` in the name field.
   - Recommendation: Use `m.name === embedModel || m.name.startsWith(embedModel + ':')` to match both forms. Verify in integration test.

## Sources

### Primary (HIGH confidence)
- `/websites/ollama_api` (Context7) — `/api/embed` OpenAPI spec, full request/response schema
- `/llmstxt/ollama_llms-full_txt` (Context7) — batch embedding examples, JS SDK patterns
- https://docs.ollama.com/api/embed — official Ollama embed endpoint documentation
- https://docs.ollama.com/api/tags — official Ollama model list endpoint
- https://docs.ollama.com/api/errors — official Ollama error format and HTTP status codes
- `/isaacs/node-lru-cache` (Context7) — LRU cache API, `max` option, set/get patterns

### Secondary (MEDIUM confidence)
- https://nodejs.org/api/crypto.html — `createHash('sha256').update(str).digest('hex')` pattern
- WebSearch: nomic-embed-text dimensions confirmed as 768 across multiple sources

### Tertiary (LOW confidence)
- Bun AbortSignal.timeout error name — not verified with Bun docs; flagged as Open Question

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fetch, lru-cache, node:crypto all verified via Context7 and official docs
- Architecture: HIGH — Ollama API shape verified via official OpenAPI spec; error class pattern is established TypeScript idiom
- Pitfalls: HIGH for API pitfalls (verified via docs); MEDIUM for Bun AbortError name (flagged)

**Research date:** 2026-02-28
**Valid until:** 2026-09-01 (Ollama API is stable; lru-cache v11 is stable)
