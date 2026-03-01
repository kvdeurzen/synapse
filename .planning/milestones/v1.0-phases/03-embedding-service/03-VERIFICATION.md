---
phase: 03-embedding-service
verified: 2026-02-28T00:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 3: Embedding Service Verification Report

**Phase Goal:** A shared embedding service that embeds text via Ollama, asserts correct dimensions on every vector, fails fast on write paths when Ollama is unreachable, and allows read paths to continue without embeddings
**Verified:** 2026-02-28
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                 | Status     | Evidence                                                                                                    |
|----|-----------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------|
| 1  | embed() calls Ollama POST /api/embed with the configured model and returns 768-dimension vectors                      | VERIFIED   | `callOllamaEmbed` in embedder.ts L111: `_fetchImpl(\`\${ollamaUrl}/api/embed\`, { body: JSON.stringify({ model, input: texts }) })`; EXPECTED_DIMENSIONS=768 |
| 2  | embed() with a single string returns one vector; embed() with an array returns matching vectors                      | VERIFIED   | embed() returns `number[][]` with one entry per input text; tests in embedder.test.ts group 2 and 3 pass   |
| 3  | Batch inputs larger than 32 texts are auto-chunked into groups of 32 to prevent Ollama OOM                          | VERIFIED   | `chunkArray(uncachedTexts, BATCH_CHUNK_SIZE)` at L256; BATCH_CHUNK_SIZE=32; large batch test passes (fetch called >=2 times for 50 texts, each chunk <=32) |
| 4  | Transient failures (ECONNREFUSED, timeout, HTTP 5xx) are retried up to 3 times with exponential backoff             | VERIFIED   | `withRetry` loop (MAX_RETRIES=3) at L148; delay formula `BASE_DELAY_MS * 2^attempt + random jitter`; retry tests in embedder.test.ts group 6 pass |
| 5  | Definitive failures (model not found, dimension mismatch) throw immediately without retrying                         | VERIFIED   | withRetry L153: `if (err instanceof OllamaModelNotFoundError \|\| err instanceof EmbedDimensionError) throw err`; test verifies fetch called exactly once on 404 |
| 6  | Every returned vector is asserted to be exactly 768 dimensions before being returned to the caller                  | VERIFIED   | `assertDimensions(vectors, embedModel)` called at L263 before caching; tests for 384-dim and 769-dim vectors throw EmbedDimensionError |
| 7  | Embedding results are cached per-project in an LRU cache with 10,000 max entries                                    | VERIFIED   | `new LRUCache<string, number[]>({ max: 10_000 })` per project at L53; cache tests prove same-project second call skips fetch |
| 8  | Cache key is SHA-256 of model name + text — switching models invalidates cache                                       | VERIFIED   | `createHash("sha256").update(\`\${modelName}:\${text}\`).digest("hex")` at L88; different-model test verifies two fetch calls |
| 9  | Each error type is a distinct class with actionable guidance in the message                                          | VERIFIED   | errors.ts exports 5 classes (OllamaError, OllamaUnreachableError, OllamaModelNotFoundError, OllamaTimeoutError, EmbedDimensionError); each sets `this.name` and includes "Run:" guidance |
| 10 | Startup health check calls GET /api/tags with 5-second timeout and verifies nomic-embed-text is in the model list   | VERIFIED   | `checkOllamaHealth` at embedder.ts L304: `_fetchImpl(\`\${ollamaUrl}/api/tags\`, { signal: AbortSignal.timeout(5_000) })`; model name matching handles ":latest" suffix |
| 11 | If Ollama is unreachable at startup, the server logs a warning but still starts and registers all tools             | VERIFIED   | server.ts L56-68: `if (status !== "ok") { logger.warn(...) }` then falls through to `server.connect(transport)` — no throw or abort |
| 12 | If the model is missing at startup, the server logs a warning with "Run: ollama pull nomic-embed-text" but still starts | VERIFIED | server.ts L61: `\`Model \${config.embedModel} not found. Run: ollama pull \${config.embedModel}\``; server still connects transport |
| 13 | The ping tool response includes ollamaStatus field showing 'ok', 'unreachable', or 'model_missing'                  | VERIFIED   | ping.ts L47: `ollamaStatus: getOllamaStatus()`; type is `OllamaHealthStatus`; ping tests verify all three values |
| 14 | Write-path callers get a thrown error when Ollama is unreachable — they do not silently store without embeddings     | VERIFIED   | embed() throws OllamaUnreachableError after 3 retry attempts; health.test.ts EMBED-03 pattern test proves this |
| 15 | Read-path callers catch OllamaError and degrade gracefully                                                           | VERIFIED   | health.test.ts EMBED-04 pattern test demonstrates catch(OllamaError) → queryVector=null → continue |

**Score:** 15/15 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact                          | Expected                                              | Status     | Details                                                                                                         |
|-----------------------------------|-------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------------|
| `src/errors.ts`                   | 5 typed error classes for Ollama failure modes        | VERIFIED   | Exists, 38 lines, exports OllamaError + 4 subclasses, each with `this.name` and actionable message             |
| `src/services/embedder.ts`        | embed(), cache, retry, batch chunking, dimension assertion | VERIFIED | Exists, 318 lines, substantive; exports embed, getProjectCache, clearAllCaches, getCacheStats, EXPECTED_DIMENSIONS, _setFetchImpl, checkOllamaHealth, getOllamaStatus, setOllamaStatus, OllamaHealthStatus |
| `test/services/embedder.test.ts`  | TDD tests for all embedder behaviors                  | VERIFIED   | Exists, 511 lines; 29 tests across 7 describe groups; all pass                                                  |

### Plan 02 Artifacts

| Artifact                          | Expected                                              | Status     | Details                                                                                                         |
|-----------------------------------|-------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------------|
| `src/server.ts`                   | startServer(server, config) with blocking health check | VERIFIED  | Exists; `startServer` signature takes `(server: McpServer, config: SynapseConfig)`; calls checkOllamaHealth before transport.connect() |
| `src/index.ts`                    | main() passes config to startServer                   | VERIFIED   | L16: `await startServer(server, config)`                                                                        |
| `src/tools/ping.ts`               | ping tool reads live Ollama status                    | VERIFIED   | Imports `getOllamaStatus, type OllamaHealthStatus`; L47: `ollamaStatus: getOllamaStatus()`; no hardcoded "unknown" |
| `test/services/health.test.ts`    | 15 tests for health check, startup, write/read paths  | VERIFIED   | Exists, 258 lines; 15 tests across 5 describe groups; all pass                                                  |
| `test/tools.test.ts`              | Updated ping tests with live ollamaStatus             | VERIFIED   | Imports `setOllamaStatus`; 5 ping tests verify ok/unreachable/model_missing; no hardcoded "unknown" assertion   |

---

## Key Link Verification

### Plan 01 Key Links

| From                        | To                    | Via                                  | Status  | Details                                                                              |
|-----------------------------|-----------------------|--------------------------------------|---------|--------------------------------------------------------------------------------------|
| `src/services/embedder.ts`  | Ollama /api/embed     | native fetch() with AbortSignal.timeout(30000) | WIRED | L111: `_fetchImpl(\`\${ollamaUrl}/api/embed\`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })` |
| `src/services/embedder.ts`  | lru-cache             | Per-project LRU cache, max 10,000    | WIRED   | L2: `import { LRUCache } from "lru-cache"`; L53: `new LRUCache<string, number[]>({ max: 10_000 })` |
| `src/services/embedder.ts`  | src/errors.ts         | Imports and throws typed error classes | WIRED  | L4-9: imports all 5 error classes; throws OllamaUnreachableError, OllamaTimeoutError, OllamaModelNotFoundError, OllamaError, EmbedDimensionError |
| `src/services/embedder.ts`  | node:crypto           | SHA-256 cache key generation          | WIRED   | L1: `import { createHash } from "node:crypto"`; L88: `createHash("sha256").update(...).digest("hex")` |

### Plan 02 Key Links

| From                       | To                         | Via                                              | Status  | Details                                                                  |
|----------------------------|----------------------------|--------------------------------------------------|---------|--------------------------------------------------------------------------|
| `src/index.ts`             | `src/server.ts`            | startServer(server, config) passes config        | WIRED   | index.ts L16: `await startServer(server, config)`                        |
| `src/server.ts`            | `src/services/embedder.ts` | Calls checkOllamaHealth() and setOllamaStatus()  | WIRED   | server.ts L4: import; L53: `checkOllamaHealth(config.ollamaUrl, ...)`; L54: `setOllamaStatus(status)` |
| `src/tools/ping.ts`        | `src/services/embedder.ts` | Calls getOllamaStatus() to populate ping response | WIRED  | ping.ts L4: import; L47: `ollamaStatus: getOllamaStatus()`              |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                              | Status    | Evidence                                                                                      |
|-------------|-------------|--------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------|
| EMBED-01    | 03-01       | Embedding service calls Ollama /api/embed with nomic-embed-text (768 dim) | SATISFIED | embed() calls POST /api/embed; EXPECTED_DIMENSIONS=768; dimension assertion enforces this     |
| EMBED-02    | 03-01       | Embedding service supports single and batch embedding                     | SATISFIED | embed() accepts string[], returns number[][].; batch test with 3 texts returns 3 vectors     |
| EMBED-03    | 03-02       | Write operations fail fast with clear error when Ollama is unreachable    | SATISFIED | embed() throws OllamaUnreachableError after 3 retries; EMBED-03 pattern test in health.test.ts proves this |
| EMBED-04    | 03-02       | Read operations continue working without Ollama                           | SATISFIED | EMBED-04 pattern test demonstrates catch(OllamaError) → null → graceful degradation         |
| EMBED-05    | 03-02       | Non-blocking health check on startup logs warning but server starts anyway | SATISFIED | checkOllamaHealth with 5s timeout; server.ts warns but always calls transport.connect()      |
| EMBED-06    | 03-01       | Embedding dimension assertion prevents inserting wrong-dimension vectors  | SATISFIED | assertDimensions() called before caching; throws EmbedDimensionError on mismatch            |

**Orphaned requirements:** None. All 6 EMBED-xx requirements are claimed by plans and verified in the codebase.

**Note on EMBED-05 description:** The REQUIREMENTS.md description says "Non-blocking health check" but the implementation is a blocking health check (server awaits result before connecting transport). This matches the PLAN.md intent and user decision ("Blocking health check with 5-second timeout — server waits for result before registering tools"). The server still starts regardless of the result, satisfying the spirit of the requirement. No gap — the blocking vs. non-blocking distinction does not prevent goal achievement.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | —    | —       | —        | No anti-patterns detected in any modified source file |

Checked:
- `src/errors.ts` — no console.log, no TODO/FIXME, no stubs
- `src/services/embedder.ts` — no console.log, no TODO/FIXME, no stubs
- `src/server.ts` — no console.log, no TODO/FIXME, no stubs
- `src/index.ts` — one `console.error` in the top-level fatal error handler (line 22): appropriate and intentional
- `src/tools/ping.ts` — no console.log, no TODO/FIXME, no stubs

---

## Human Verification Required

None. All observable behaviors are testable programmatically and verified by the 118-test suite.

Items that might ordinarily require human verification (actual Ollama connectivity, log line appearance in stderr) are adequately covered by the mock-based test approach.

---

## Test Suite Summary

| File                               | Tests | Status |
|------------------------------------|-------|--------|
| test/services/embedder.test.ts     | 29    | All pass |
| test/services/health.test.ts       | 15    | All pass |
| test/tools.test.ts                 | 5 ping + others | All pass |
| Full suite (9 files)               | 118   | 118 pass, 0 fail |

**TypeScript:** `bunx tsc --noEmit` — no errors
**Biome:** `bunx biome check src/ test/` — 23 files, no fixes applied

---

## Commits Verified

| Commit  | Description                                      | Exists |
|---------|--------------------------------------------------|--------|
| c950aeb | test(03-01): install lru-cache, RED tests        | YES    |
| c52299f | feat(03-01): implement embedding service — GREEN | YES    |
| 81cbca5 | feat(03-02): wire health check into server       | YES    |
| af25c02 | test(03-02): health check tests, ping tool tests | YES    |

---

## Gaps Summary

No gaps found. All 15 observable truths are verified, all 7 artifacts exist and are substantive, all 7 key links are wired, all 6 requirement IDs are satisfied with direct code evidence, and the test suite achieves 118/118 passing with no regressions.

---

_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_
