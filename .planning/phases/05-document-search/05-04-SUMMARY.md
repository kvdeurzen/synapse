---
phase: 05-document-search
plan: "04"
subsystem: api
tags: [mcp, lancedb, typescript, search, vector-search, fulltext-search, hybrid-search]

# Dependency graph
requires:
  - phase: 05-02
    provides: registerSemanticSearchTool, registerFulltextSearchTool, registerHybridSearchTool built in search tool files
  - phase: 05-03
    provides: registerGetSmartContextTool built in get-smart-context.ts
provides:
  - All 4 search tools registered in server.ts and discoverable by MCP clients
  - server.ts with 15 total tools (11 existing + 4 new search tools)
  - TypeScript-clean codebase with exactOptionalPropertyTypes compliance across all search tools
affects:
  - Phase 6 (code search) — server registration pattern established
  - Any future MCP tools — registerXTool(server, config) pattern unchanged

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registerXTool(server, config) registration pattern applied to all 4 search tools"
    - "Conditional object construction pattern for exactOptionalPropertyTypes compliance"
    - "await RRFReranker.create(k) instead of new RRFReranker(k) for LanceDB 0.26.2"

key-files:
  created: []
  modified:
    - src/server.ts
    - src/tools/semantic-search.ts
    - src/tools/fulltext-search.ts
    - src/tools/hybrid-search.ts
    - src/tools/get-smart-context.ts

key-decisions:
  - "exactOptionalPropertyTypes compliance: build filter objects conditionally (if val !== undefined) rather than spreading Zod-parsed args with T|undefined fields"
  - "RRFReranker.create(60) async factory required — constructor takes NativeRRFReranker not number; new RRFReranker(60) was both a type error and runtime bug"
  - "getSmartContext() parameter type updated to T | undefined for all optional fields to match Zod inference"

patterns-established:
  - "Search filter object pattern: const filters = {}; if (x !== undefined) filters.x = x — required when exactOptionalPropertyTypes is true and source is Zod-parsed"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, SRCH-07]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 5 Plan 04: Server Wiring Summary

**4 search tools (semantic_search, fulltext_search, hybrid_search, get_smart_context) registered in server.ts bringing total MCP tool count to 15, with 3 TypeScript correctness fixes across search tool files**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T15:25:34Z
- **Completed:** 2026-02-28T15:28:18Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Added 4 imports and 4 `registerXTool(server, config)` calls to server.ts — tools now discoverable by MCP clients
- Total tool count is 15 (11 existing + 4 new search tools), `toolCount++` incremented correctly for each
- Fixed 3 TypeScript errors that blocked compilation: exactOptionalPropertyTypes in 3 files, RRFReranker constructor mismatch in hybrid-search.ts
- 347 tests pass, 0 failures — no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Register search tools in server.ts and run full validation** - `4c45f58` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/server.ts` - Added 4 imports and 4 tool registrations, toolCount now 15
- `src/tools/semantic-search.ts` - Fixed exactOptionalPropertyTypes: conditional filter object construction
- `src/tools/fulltext-search.ts` - Fixed exactOptionalPropertyTypes: conditional filter object construction
- `src/tools/hybrid-search.ts` - Fixed exactOptionalPropertyTypes + RRFReranker.create(60) async factory
- `src/tools/get-smart-context.ts` - Fixed getSmartContext() parameter types to accept T | undefined

## Decisions Made
- `exactOptionalPropertyTypes: true` in tsconfig requires building optional filter objects conditionally rather than spreading Zod-inferred types — applied across all 3 search callers of `buildSearchPredicate`
- `RRFReranker` JS constructor takes a `NativeRRFReranker` not a number; `new RRFReranker(60)` was incorrect both at the type level and at runtime — corrected to `await RRFReranker.create(60)` (async factory, wraps `RrfReranker.tryNew(new Float32Array([k]))`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes violations in semantic-search.ts, fulltext-search.ts, hybrid-search.ts**
- **Found during:** Task 1 (bun tsc --noEmit validation)
- **Issue:** Zod `.optional()` fields infer `T | undefined` in strict TypeScript. Passing these directly to `buildSearchPredicate({ category: validated.category })` fails with `exactOptionalPropertyTypes: true` because optional property `category?: string` means `string`, not `string | undefined`
- **Fix:** Build a typed `searchFilters` object and conditionally assign only non-undefined values
- **Files modified:** src/tools/semantic-search.ts, src/tools/fulltext-search.ts, src/tools/hybrid-search.ts
- **Verification:** `bun tsc --noEmit` exits 0
- **Committed in:** 4c45f58 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed RRFReranker constructor misuse in hybrid-search.ts**
- **Found during:** Task 1 (bun tsc --noEmit validation)
- **Issue:** `new rerankers.RRFReranker(60)` passes a `number` to a constructor expecting a `NativeRRFReranker` (internal LanceDB type). This was a type error AND a runtime bug — the inner RRF reranker would never be initialized correctly
- **Fix:** Changed to `await rerankers.RRFReranker.create(60)` — the async factory that calls `RrfReranker.tryNew(new Float32Array([k]))` internally
- **Files modified:** src/tools/hybrid-search.ts
- **Verification:** `bun tsc --noEmit` exits 0; hybrid_search tests pass (Ollama unreachable path exercised in 347-test suite)
- **Committed in:** 4c45f58 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed getSmartContext() parameter type in get-smart-context.ts**
- **Found during:** Task 1 (bun tsc --noEmit validation)
- **Issue:** `getSmartContext(dbPath, parsed.project_id, parsed)` fails because `parsed.doc_ids` is `string[] | undefined` but the function parameter declared `doc_ids?: string[]` — with `exactOptionalPropertyTypes`, the former is not assignable to the latter
- **Fix:** Added `| undefined` to all optional parameter types in `getSmartContext()` signature
- **Files modified:** src/tools/get-smart-context.ts
- **Verification:** `bun tsc --noEmit` exits 0
- **Committed in:** 4c45f58 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs — TypeScript correctness)
**Impact on plan:** All fixes necessary for compilation. The bugs existed in the search tool files from Plans 05-02/05-03 but were only surfaced when `bun tsc --noEmit` was run as part of this plan's validation. No scope creep.

## Issues Encountered
None beyond the TypeScript errors documented above as deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 complete: all 7 SRCH requirements implemented and testable
- 15 MCP tools registered and discoverable: ping, echo, init_project, delete_project, store_document, query_documents, update_document, delete_document, project_overview, link_documents, get_related_documents, semantic_search, fulltext_search, hybrid_search, get_smart_context
- Phase 6 (code search) can use the same registerXTool(server, config) pattern

## Self-Check: PASSED
- SUMMARY.md: FOUND at .planning/phases/05-document-search/05-04-SUMMARY.md
- Task commit 4c45f58: FOUND in git log

---
*Phase: 05-document-search*
*Completed: 2026-02-28*
