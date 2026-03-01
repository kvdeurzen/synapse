---
phase: 03-embedding-service
plan: "01"
subsystem: embedding-service
tags: [embedding, ollama, lru-cache, retry, tdd, error-handling]
dependency_graph:
  requires:
    - src/logger.ts
    - src/types.ts
  provides:
    - src/errors.ts
    - src/services/embedder.ts
  affects:
    - Phase 4 (store_document / index_codebase write paths)
    - Phase 5 (semantic_search / search_code read paths)
tech_stack:
  added:
    - lru-cache@11.2.6
  patterns:
    - Per-project LRU cache with SHA-256 keys
    - Exponential backoff retry loop (hand-rolled, ~20 lines)
    - TDD red-green cycle with _setFetchImpl() test hook
    - Fail-fast on definitive errors, retry on transient errors
key_files:
  created:
    - src/errors.ts
    - src/services/embedder.ts
    - test/services/embedder.test.ts
  modified:
    - package.json
    - bun.lock
decisions:
  - "Used _setFetchImpl() test hook instead of Bun's mock.module — simpler, avoids module-level mocking complexity"
  - "AbortSignal.timeout() used for 30s per-request timeout rather than manual abort controller"
  - "TypeScript noUncheckedIndexedAccess requires explicit 'as Type' casts for indexed array access in loops"
  - "Biome lint/suspicious/useIterableCallbackReturn: forEach with expect() return replaced with for-of loops in tests"
metrics:
  duration: "4 min"
  completed_date: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
requirements-completed:
  - EMBED-01
  - EMBED-02
  - EMBED-06
---

# Phase 3 Plan 1: Embedding Service Core Summary

**One-liner:** Ollama embedding service with per-project LRU cache (SHA-256 keys), exponential backoff retry, batch auto-chunking at 32 texts, and 768-dimension assertion per vector.

## What Was Built

### src/errors.ts
Five typed error classes for all Ollama failure modes:
- `OllamaError` — base class (all Ollama errors)
- `OllamaUnreachableError` — ECONNREFUSED / network failure ("Run: ollama serve")
- `OllamaModelNotFoundError` — HTTP 404 / model not loaded ("Run: ollama pull {model}")
- `OllamaTimeoutError` — 30s timeout exceeded ("Run: ollama serve")
- `EmbedDimensionError` — vector dimension mismatch with model name and got/expected values

Each class sets `this.name` for reliable `instanceof` checking and includes actionable fix guidance in the error message.

### src/services/embedder.ts
Complete embedding service module with:

- **`embed(texts, projectId, config)`** — main entry point, returns `number[][]`
- **Per-project LRU cache** — `Map<projectId, LRUCache>` with `max: 10_000` entries per project
- **SHA-256 cache keys** — `hash(modelName + ':' + text)` via `node:crypto` createHash — switching models invalidates cache automatically
- **Batch auto-chunking** — inputs >32 texts split into chunks of 32 before calling Ollama (prevents OOM)
- **Exponential backoff retry** — 3 attempts, `500ms * 2^attempt + jitter(0-100ms)` for transient failures
- **Fail-fast** — `OllamaModelNotFoundError` and `EmbedDimensionError` throw immediately without retrying
- **Dimension assertion** — every vector checked to be exactly 768 dimensions BEFORE caching or returning
- **Cache stats logging** — hits/miss/size logged to stderr every 100 `embed()` calls via pino logger
- **Test hook** — `_setFetchImpl(fn)` allows injecting mock fetch implementations in tests
- **Exports** — `embed`, `getProjectCache`, `clearAllCaches`, `getCacheStats`, `EXPECTED_DIMENSIONS`, `_setFetchImpl`

### test/services/embedder.test.ts
29 tests across 7 describe groups covering:
1. Error class hierarchy (9 tests) — instanceof checks, message content
2. embed() single text (2 tests) — returns one 768-dim vector matching mock response
3. embed() batch inputs (2 tests) — 3 texts returns 3 vectors; 50 texts auto-chunked (fetch called ≥2 times, each ≤32 texts)
4. Dimension assertion (3 tests) — 384-dim and 769-dim vectors throw EmbedDimensionError with model/dimensions in message
5. Error classification (5 tests) — TypeError→Unreachable, DOMException AbortError/TimeoutError→Timeout, HTTP 404→ModelNotFound, HTTP 500→OllamaError
6. Retry logic (3 tests) — transient retry succeeds on 2nd attempt; definitive error no retry (called once); 3 consecutive failures throws
7. Caching (5 tests) — same text same project = 1 fetch call; different project = 2 calls; different model = 2 calls; getCacheStats returns {size, hits, misses}; clearAllCaches resets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict array index access**
- **Found during:** Task 2 (TypeScript compile check)
- **Issue:** `texts[i]`, `uncachedIndices[j]`, `allNewVectors[j]` typed as `T | undefined` in strict mode
- **Fix:** Added explicit `as Type` casts where loop bounds guarantee defined values
- **Files modified:** src/services/embedder.ts
- **Commit:** c52299f

**2. [Rule 1 - Bug] Biome import sort and formatting**
- **Found during:** Task 2 (Biome check)
- **Issue:** Import order not sorted, multiline expressions could be single-line
- **Fix:** `bunx biome check --write` auto-applied fixes
- **Files modified:** src/errors.ts, src/services/embedder.ts, test/services/embedder.test.ts
- **Commit:** c52299f

**3. [Rule 2 - Missing] Replace forEach with for-of in tests**
- **Found during:** Task 2 (Biome lint/suspicious/useIterableCallbackReturn)
- **Issue:** `result.forEach((v) => expect(v).toHaveLength(768))` — forEach callback returns value (expect result), Biome treats as suspicious
- **Fix:** Replaced 2 forEach calls with for-of loops in test file
- **Files modified:** test/services/embedder.test.ts
- **Commit:** c52299f

**4. [Rule 1 - Bug] toSatisfy() with typed generic fails on rejected promise**
- **Found during:** Task 2 (test run)
- **Issue:** `rejects.toSatisfy((e: EmbedDimensionError) => ...)` — Bun passes raw Error object but TypeScript parameter annotation created mismatch, `e.message` was undefined
- **Fix:** Replaced with explicit try/catch pattern + `toBeInstanceOf` + direct property checks
- **Files modified:** test/services/embedder.test.ts
- **Commit:** c52299f

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/errors.ts | FOUND |
| src/services/embedder.ts | FOUND |
| test/services/embedder.test.ts | FOUND |
| Commit c950aeb (Task 1 - RED) | FOUND |
| Commit c52299f (Task 2 - GREEN) | FOUND |
| All 101 tests pass | VERIFIED |
| TypeScript compiles | VERIFIED |
| Biome clean | VERIFIED |
