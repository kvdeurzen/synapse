---
phase: 03-embedding-service
plan: "02"
subsystem: embedding-service
tags: [embedding, ollama, health-check, startup, ping, server, tdd, error-handling]

requires:
  - phase: 03-01
    provides: embed() function, OllamaError classes, _setFetchImpl test hook, embedder.ts module

provides:
  - checkOllamaHealth() function with 5s timeout using GET /api/tags
  - getOllamaStatus() / setOllamaStatus() module-level status state in embedder.ts
  - startServer(server, config) updated signature passing config for health check
  - Blocking health check in server startup (warns but does NOT abort on failure)
  - Ping tool reports live OllamaHealthStatus instead of hardcoded "unknown"
  - Write-path fail-fast pattern proven (embed() throws on Ollama failure)
  - Read-path degradation pattern proven (catch OllamaError, continue with null vector)

affects:
  - Phase 4 (store_document / index_codebase write paths — must catch OllamaUnreachableError)
  - Phase 5 (semantic_search / search_code read paths — read-path degradation pattern)

tech-stack:
  added: []
  patterns:
    - Blocking startup health check pattern — check before transport.connect(), warn but do not abort
    - Module-level status state with getter/setter — getOllamaStatus/setOllamaStatus
    - Write-path fail-fast — embed() throws OllamaError; caller does NOT swallow silently
    - Read-path degradation — catch OllamaError, set null vector, continue with keyword search
    - _setFetchImpl test hook reused for checkOllamaHealth mocking (same fetch injection point)

key-files:
  created:
    - test/services/health.test.ts
  modified:
    - src/services/embedder.ts
    - src/server.ts
    - src/index.ts
    - src/tools/ping.ts
    - test/tools.test.ts

key-decisions:
  - "checkOllamaHealth uses GET /api/tags metadata endpoint — no test embed call on startup (avoids OOM and slow path on every server start)"
  - "Model name matching handles ':latest' tag suffix via startsWith() check — nomic-embed-text matches nomic-embed-text:latest"
  - "startServer() warns but does NOT abort on unreachable Ollama — server starts in all cases per user decision"
  - "Module-level ollamaStatus defaults to 'unreachable' until checkOllamaHealth is called — safe default for write-path callers"

patterns-established:
  - "Write-path fail-fast: embed() throws OllamaError; store_document / index_codebase must NOT catch silently"
  - "Read-path degradation: catch OllamaError → null vector → keyword-only fallback; non-OllamaError rethrows"
  - "Server startup health check: checkOllamaHealth → setOllamaStatus → connect transport — always in that order"

requirements-completed: [EMBED-03, EMBED-04, EMBED-05]

duration: 4min
completed: "2026-02-28"
---

# Phase 3 Plan 2: Server Health Check Integration Summary

**Ollama startup health check via GET /api/tags with 5s timeout, live status in ping tool, and write-path fail-fast / read-path degradation patterns proven via tests.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T05:47:51Z
- **Completed:** 2026-02-28T05:51:11Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `checkOllamaHealth()`, `getOllamaStatus()`, `setOllamaStatus()`, `OllamaHealthStatus` to embedder.ts — complete health check module
- Updated `startServer(server, config)` to run blocking health check before transport connect, logging warnings but never aborting
- Updated `ping` tool to return live `ollamaStatus` from `getOllamaStatus()` instead of hardcoded `"unknown"`
- Created `test/services/health.test.ts` with 15 tests: 7 health check scenarios, status state tests, EMBED-03/EMBED-04 pattern proof
- Updated `test/tools.test.ts`: ping tests use `setOllamaStatus()` for known state, verifying live `ok`/`unreachable`/`model_missing`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire health check into server startup and ping tool** - `81cbca5` (feat)
2. **Task 2: Write tests for health check, startup wiring, and write/read path patterns** - `af25c02` (test)

**Plan metadata:** (forthcoming)

## Files Created/Modified
- `src/services/embedder.ts` - Added OllamaHealthStatus type, getOllamaStatus/setOllamaStatus/checkOllamaHealth at bottom of module
- `src/server.ts` - Updated startServer signature to (server, config); added blocking health check before transport.connect()
- `src/index.ts` - One-line change: startServer(server, config) instead of startServer(server)
- `src/tools/ping.ts` - Import getOllamaStatus/OllamaHealthStatus; replace hardcoded "unknown" with getOllamaStatus()
- `test/services/health.test.ts` - New: 15 tests for checkOllamaHealth, status state, EMBED-03, EMBED-04 patterns
- `test/tools.test.ts` - Updated 3 existing ping tests; added 2 new ping tests (unreachable, model_missing)

## Decisions Made
- **No test embed on startup**: Used GET /api/tags metadata endpoint rather than calling /api/embed — avoids OOM and latency on startup (RESEARCH.md Pitfall 3)
- **':latest' tag suffix handling**: `m.name.startsWith(`${embedModel}:`)` covers Ollama's default behavior of adding tags to model names
- **Warn but never abort**: startServer logs warn but always connects transport — consistent with user decision that server must start regardless of Ollama state
- **Default to 'unreachable'**: Module-level state initializes to 'unreachable' — write paths see correct error before health check runs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Biome formatting: import grouping and line length**
- **Found during:** Task 2 (Biome check)
- **Issue:** Multi-line imports collapsed to single line; long single-line lambda in health.test.ts needed reformatting
- **Fix:** `bunx biome check --write` auto-applied formatting corrections
- **Files modified:** test/services/health.test.ts
- **Verification:** `bunx biome check src/ test/` returned clean
- **Committed in:** af25c02 (Task 2 commit)

**2. [Rule 1 - Bug] Unused `make768Vector` helper in health.test.ts**
- **Found during:** Task 2 (Biome lint)
- **Issue:** Copied helper from embedder.test.ts but health tests don't use 768-dim vectors
- **Fix:** Removed unused function; health tests use mockTagsResponse helper only
- **Files modified:** test/services/health.test.ts
- **Verification:** Biome noUnusedVariables warning gone; all 118 tests still pass
- **Committed in:** af25c02 (Task 2 commit)

**3. [Rule 1 - Bug] Read-path pattern test for non-OllamaError propagation needed correction**
- **Found during:** Task 2 (test run — 1 test failed)
- **Issue:** Test tried to verify that a generic `Error` thrown inside embed()'s mock would propagate to caller. But embed()'s retry wrapper treats unknown errors as transient and wraps them in OllamaUnreachableError after 3 retries — so the original error was never seen by the caller
- **Fix:** Rewrote test to demonstrate the application-level pattern correctly — the catch logic itself (not embed()) is what rethrows non-OllamaErrors. Test now throws RangeError directly and verifies the catch block rethrows it
- **Files modified:** test/services/health.test.ts
- **Verification:** All 118 tests pass
- **Committed in:** af25c02 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (formatting x2, test logic correction x1)
**Impact on plan:** All fixes minor. No scope creep. Test correction improves accuracy of EMBED-04 pattern documentation.

## Issues Encountered
None beyond the auto-fixed deviations above.

## Next Phase Readiness
- Embedding service fully connected to server lifecycle
- EMBED-03 (write-path fail-fast), EMBED-04 (read-path degradation), EMBED-05 (startup health check) all fulfilled
- Phase 4 (store_document / index_codebase) can call embed() knowing it will throw on Ollama failure — no silent empty-vector storage
- Phase 5 (semantic_search) can use the catch-OllamaError-then-null-vector degradation pattern demonstrated in test
- startServer signature change is backward-compatible (config was already created before startServer call in index.ts)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/services/embedder.ts | FOUND |
| src/server.ts | FOUND |
| src/index.ts | FOUND |
| src/tools/ping.ts | FOUND |
| test/services/health.test.ts | FOUND |
| test/tools.test.ts | FOUND |
| Commit 81cbca5 (Task 1 - feat) | FOUND |
| Commit af25c02 (Task 2 - test) | FOUND |
| All 118 tests pass | VERIFIED |
| TypeScript compiles | VERIFIED |
| Biome clean | VERIFIED |

---
*Phase: 03-embedding-service*
*Completed: 2026-02-28*
