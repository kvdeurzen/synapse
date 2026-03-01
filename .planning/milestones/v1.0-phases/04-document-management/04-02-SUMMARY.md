---
phase: 04-document-management
plan: 02
subsystem: tools
tags: [lancedb, zod, ulid, chunking, embedding, versioning, activity-log, starter-documents]

# Dependency graph
requires:
  - phase: 04-01
    provides: "chunkDocument(), logActivity(), DocChunkRowSchema, DocumentRowSchema, activity_log table, doc_chunks table"
  - phase: 03-embedding-service
    provides: "embed() function, _setFetchImpl() test hook"
  - phase: 02-database-schema
    provides: "insertBatch(), connectDb(), TABLE_NAMES, TABLE_SCHEMAS"

provides:
  - "store_document MCP tool: validates 12-category taxonomy, chunks, embeds, versions, logs activity"
  - "storeDocument() core function (testable without MCP server)"
  - "Re-versioning: supersedes old doc_chunks and document rows on doc_id update"
  - "Carry-forward categories protection: superseded never becomes archived for ADR/design_pattern/glossary/code_pattern/dependency"
  - "Rollback: document row deleted if embed() fails to prevent orphaned rows"
  - "initProject extended with starter document seeding (4 defaults: project_charter, adr_log, implementation_patterns, glossary)"
  - "InitProjectResult.starters_seeded count returned"
  - "FOUND-04: starters seeded at init time with no Ollama dependency (no doc_chunks)"

affects: [04-03, 04-04, 05-code-indexing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "storeDocument() validates via StoreDocumentInputSchema.parse() at runtime entry — not just TypeScript types"
    - "Re-versioning max version found via reduce() over all rows (LanceDB query order not guaranteed)"
    - "Embed rollback: delete document row if embed() throws to prevent orphaned metadata"
    - "Starters seeded only when tables_created > 0 (fresh project) — idempotent on re-init"
    - "CARRY_FORWARD_CATEGORIES set used to document intent; implementation always uses superseded (never archived) for all re-versioning"

key-files:
  created:
    - src/tools/store-document.ts
    - test/tools/store-document.test.ts
  modified:
    - src/tools/init-project.ts
    - src/server.ts
    - test/db/init-project.test.ts

key-decisions:
  - "Runtime Zod validation in storeDocument() core function ensures invalid category/status throws even when TypeScript types are bypassed"
  - "LanceDB returns FixedSizeList fields as typed arrays (not plain Array) — test assertion uses .length check instead of Array.isArray()"
  - "Max version detection uses reduce() over all document rows for the doc_id — LanceDB query order is not guaranteed"
  - "Embed rollback: delete newly inserted document row if embed() throws — prevents orphaned document metadata"
  - "Starters seeded only when tables_created > 0 — ensures idempotency (re-init never duplicates starters)"
  - "Implementation Patterns (code_pattern) used per CONTEXT.md locked decision (not Coding Guidelines)"

requirements-completed: [FOUND-04, DOC-01, DOC-04, DOC-09, DOC-10, DOC-12]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 4 Plan 02: store_document Tool and Starter Document Seeding Summary

**store_document MCP tool with 12-category validation, chunking, embedding, versioning, activity logging, and rollback; init_project extended with four configurable starter document scaffolds seeded at project creation with no Ollama dependency**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T07:56:00Z
- **Completed:** 2026-02-28T08:02:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Built `src/tools/store-document.ts` with full store_document MCP tool: 12-category validation (VALID_CATEGORIES const), 5-status lifecycle enforcement (draft/active/approved/superseded/archived), ULID doc_id generation, chunkDocument() + embed() pipeline, insertBatch() for document and doc_chunk rows, version increment on re-versioning, old chunk/document supersession, embed rollback on failure, and logActivity() call on success
- Registered `store_document` in `src/server.ts` alongside existing tools
- Extended `src/tools/init-project.ts` with STARTER_TEMPLATES map (project_charter, adr_log, implementation_patterns, glossary), seeding logic guarded by `tables_created > 0` for idempotency, optional `starterTypes` parameter, and `starters_seeded` in InitProjectResult
- 20 new tests for store_document covering all DOC requirements; 11 new tests for init_project seeding
- Full suite: 184 pass, 0 fail (up from 154 in Plan 01 — 30 new tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement store_document tool with chunking, embedding, versioning, and activity logging** - `31c8d1c` (feat)
2. **Task 2: Extend init_project with starter document seeding** - `874858d` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/tools/store-document.ts` - store_document MCP tool: VALID_CATEGORIES, VALID_STATUSES, CARRY_FORWARD_CATEGORIES, StoreDocumentInputSchema, storeDocument(), registerStoreDocumentTool()
- `test/tools/store-document.test.ts` - 20 tests covering new doc storage, category validation, re-versioning, lifecycle states, carry-forward protection, return values, error handling
- `src/tools/init-project.ts` - Extended with StarterTemplate interface, STARTER_TEMPLATES map, DEFAULT_STARTERS, seeding logic in initProject(), starters_seeded in InitProjectResult, starter_types in MCP schema
- `src/server.ts` - Added registerStoreDocumentTool import and registration call (toolCount now 5)
- `test/db/init-project.test.ts` - Added starters_seeded assertion to existing test; 11 new tests for seeding

## Decisions Made

- **Runtime validation**: storeDocument() calls `StoreDocumentInputSchema.parse(args)` at entry — TypeScript types are erased at runtime, so explicit Zod validation is necessary for correctness when the core function is called directly from tests
- **LanceDB vector return type**: FixedSizeList fields come back as Float32Array or similar typed arrays from LanceDB — not plain JavaScript arrays. Test uses `.length` check instead of `Array.isArray()` for portability
- **Max version detection**: All rows for a doc_id are fetched then `.reduce()` finds the max — LanceDB query order with `.where()` is not guaranteed for row ordering purposes
- **Embed rollback**: If `embed()` throws after the document row is inserted, the document row is immediately deleted to prevent orphaned metadata rows. The caller gets a clear error.
- **Seeding guard**: Starters are only seeded when `tables_created > 0` — a second `initProject()` call skips seeding entirely (idempotent by design)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing runtime validation in storeDocument() core function**
- **Found during:** Task 1 verification (tests for invalid category and status)
- **Issue:** The plan specified Zod input schema validation, but the `storeDocument` core function received already-typed `StoreDocumentArgs`. When tests passed `"invalid_category" as any`, TypeScript types were bypassed but no runtime validation caught it — the function succeeded when it should throw
- **Fix:** Added `StoreDocumentInputSchema.parse(args)` as the first line of `storeDocument()` and used `validated` (the parsed result with defaults applied) throughout the function body
- **Files modified:** src/tools/store-document.ts
- **Verification:** Tests for invalid_category and invalid_status now correctly throw
- **Committed in:** 31c8d1c (Task 1 commit)

**2. [Rule 1 - Bug] Fixed LanceDB FixedSizeList vector assertion in tests**
- **Found during:** Task 1 test run
- **Issue:** Test asserted `Array.isArray(chunk.vector)` expecting `true`, but LanceDB returns FixedSizeList fields as `Float32Array` — a typed array — which `Array.isArray()` returns `false` for
- **Fix:** Changed assertion to `vector !== null && vector !== undefined` and `(vector as { length: number }).length === 768` — works for both plain arrays and typed arrays
- **Files modified:** test/tools/store-document.test.ts
- **Verification:** All 20 store-document tests pass
- **Committed in:** 31c8d1c (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 bugs — missing runtime validation, typed array assertion)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- Full test suite runs in 28.79s (up from previous plans due to embed mock retry timeout in one test)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- store_document ready for Plans 03-04 (update_document, delete_document, link_documents can build on this)
- init_project now seeds starters at project creation — MCP agents immediately have scaffolding
- All 184 tests pass, TypeScript compiles clean, Biome passes

---
*Phase: 04-document-management*
*Completed: 2026-02-28*

## Self-Check: PASSED

All files present:
- src/tools/store-document.ts - FOUND
- test/tools/store-document.test.ts - FOUND
- src/tools/init-project.ts - FOUND
- src/server.ts - FOUND
- test/db/init-project.test.ts - FOUND
- .planning/phases/04-document-management/04-02-SUMMARY.md - FOUND

All commits present:
- 31c8d1c - FOUND (Task 1)
- 874858d - FOUND (Task 2)
