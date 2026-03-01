---
phase: 04-document-management
plan: 03
subsystem: tools
tags: [lancedb, query, update, delete, lifecycle, carry-forward, activity-log, doc-constants]

# Dependency graph
requires:
  - phase: 04-02
    provides: "store_document, VALID_CATEGORIES, VALID_STATUSES, CARRY_FORWARD_CATEGORIES, documents table, doc_chunks table, activity_log"
  - phase: 02-database-schema
    provides: "relationships table, insertBatch(), connectDb(), TABLE_NAMES"

provides:
  - "query_documents MCP tool: metadata-only SQL scan, pipe-delimited tag filtering, summary truncation, default limit 20"
  - "queryDocuments() core function (testable without MCP server)"
  - "update_document MCP tool: metadata-only update without re-embedding, lifecycle transitions, carry-forward protection"
  - "updateDocument() core function with DOC_NOT_FOUND / INVALID_TRANSITION / CARRY_FORWARD_PROTECTED error codes"
  - "delete_document MCP tool: soft-delete (archive) and hard-delete with cascade to doc_chunks + relationships"
  - "deleteDocument() core function with DOC_NOT_FOUND / CARRY_FORWARD_PROTECTED error codes"
  - "src/tools/doc-constants.ts: shared VALID_CATEGORIES, VALID_STATUSES, CARRY_FORWARD_CATEGORIES, DocumentCategory, DocumentStatus"
  - "All three tools registered in server.ts (toolCount 8)"

affects: [04-04, 05-code-indexing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "query_documents uses table.query().where(predicate).limit(N).toArray() for pure metadata scan (no embed)"
    - "Pipe-delimited tag matching: LIKE '%|tag|%' for exact token match (Research Pitfall 4)"
    - "update_document uses table.update({ where, values }) — values typed as Record<string, IntoSql>"
    - "LanceDB table objects cache their state — require fresh connection/openTable() after update to read updated rows"
    - "Hard delete: table.delete() on documents, doc_chunks, relationships in sequence"
    - "Shared constants in doc-constants.ts imported by all document tools"

key-files:
  created:
    - src/tools/doc-constants.ts
    - src/tools/query-documents.ts
    - src/tools/update-document.ts
    - src/tools/delete-document.ts
    - test/tools/query-documents.test.ts
    - test/tools/update-document.test.ts
    - test/tools/delete-document.test.ts
  modified:
    - src/tools/store-document.ts
    - src/server.ts

key-decisions:
  - "LanceDB table objects return stale data after an external update — tests must open a fresh lancedb.connect() after calling updateDocument() to see updated values"
  - "update_document predicate uses status != 'superseded' to skip old versions — superseded docs are effectively invisible to update (returns DOC_NOT_FOUND instead of INVALID_TRANSITION)"
  - "Hard delete pre-counts chunks/relationships before deletion for metadata in activity log and return value"
  - "Relationships table OR predicate: (from_id = 'X' OR to_id = 'X') covers both incoming and outgoing edges"
  - "IntoSql type imported from @lancedb/lancedb for correct TypeScript typing of table.update() values object"

requirements-completed: [DOC-05, DOC-06, DOC-07, DOC-09, DOC-10, DOC-11]

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 4 Plan 03: query_documents, update_document, and delete_document Tools Summary

**Three document CRUD tools completing the core mutation surface: query_documents for metadata-only browsing, update_document for lifecycle management without re-embedding, and delete_document for soft/hard removal with cascade; shared constants extracted to doc-constants.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-28T08:05:11Z
- **Completed:** 2026-02-28T08:13:57Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Built `src/tools/doc-constants.ts` with `VALID_CATEGORIES`, `VALID_STATUSES`, `CARRY_FORWARD_CATEGORIES`, `DocumentCategory`, `DocumentStatus` — single source of truth imported by all document tools
- Built `src/tools/query-documents.ts`: pure metadata SQL scan using `table.query().where(predicate).limit(N).toArray()` (zero embed calls), pipe-delimited tag exact matching via LIKE `%|tag|%`, ~100-token summaries (first 400 chars), superseded hidden by default, SQL injection protection for tag input, registered in server.ts
- 17 tests covering all filter combinations (category, status, phase, tags, priority, combined), pagination, summary truncation, return shape
- Built `src/tools/update-document.ts`: metadata-only update without re-chunking/re-embedding, lifecycle state machine (draft/active/approved/archived/superseded), carry-forward protection for ADR/design_pattern/glossary/code_pattern/dependency categories, existence check before update, activity logging
- 15 tests covering basic update, multi-field update, DOC_NOT_FOUND, all valid/invalid lifecycle transitions, carry-forward protection, activity logging
- Built `src/tools/delete-document.ts`: soft-delete sets status=archived (doc_chunks preserved), hard-delete removes documents + doc_chunks + relationships (both directions), carry-forward protection with force=true override, activity logging for both modes
- 9 tests covering soft-delete, hard-delete with cascade, existence check, carry-forward protection (both force=false and force=true), 3-chunk/2-relationship cascade verification
- Refactored `src/tools/store-document.ts` to import constants from shared `doc-constants.ts`
- All three tools registered in `src/server.ts` (toolCount: ping=1, echo=2, init_project=3, delete_project=4, store_document=5, query_documents=6, update_document=7, delete_document=8)
- Full suite: 225 pass, 0 fail (up from 184 in Plan 02 — 41 new tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement query_documents tool** - `5b61ff4` (feat)
2. **Task 2: Implement update_document and delete_document tools** - `45ee8ce` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/tools/doc-constants.ts` - VALID_CATEGORIES, VALID_STATUSES, CARRY_FORWARD_CATEGORIES, DocumentCategory, DocumentStatus
- `src/tools/query-documents.ts` - query_documents MCP tool: metadata scan, tag filter, summary truncation, registerQueryDocumentsTool()
- `src/tools/update-document.ts` - update_document MCP tool: lifecycle transitions, carry-forward guard, registerUpdateDocumentTool()
- `src/tools/delete-document.ts` - delete_document MCP tool: soft/hard delete, cascade, registerDeleteDocumentTool()
- `test/tools/query-documents.test.ts` - 17 tests: all filter types, limit, truncation, return shape
- `test/tools/update-document.test.ts` - 15 tests: metadata update, lifecycle, carry-forward, activity log
- `test/tools/delete-document.test.ts` - 9 tests: soft/hard delete, cascade, carry-forward, existence check
- `src/tools/store-document.ts` - Refactored to import from doc-constants.ts (removed duplicate constant definitions)
- `src/server.ts` - Added registerUpdateDocumentTool, registerDeleteDocumentTool imports and registration calls

## Decisions Made

- **LanceDB stale table reference**: After calling `table.update()` through one connection, the same table object still returns old data. Tests and any code reading after an update MUST open a fresh `lancedb.connect()` + `openTable()` to see updated values. This is a LanceDB 0.26.2 behavior.
- **Superseded invisible to update**: `updateDocument()` predicate excludes `status = 'superseded'` rows, so a superseded doc returns `DOC_NOT_FOUND` — not `INVALID_TRANSITION`. This is correct: superseded is managed by the versioning system, not user-facing lifecycle transitions.
- **IntoSql typing**: `table.update({ where, values })` requires `values: Record<string, IntoSql>`, not `Record<string, unknown>`. TypeScript will reject the broader type.
- **Hard delete OR predicate**: Relationships are queried and deleted with `(from_id = 'X' OR to_id = 'X') AND project_id = 'Y'` to catch both directions. Pre-counted before deletion for activity log metadata.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LanceDB table objects return stale data after update — test assertion fixed**
- **Found during:** Task 2 test run for update-document
- **Issue:** The `updated_at timestamp changes after update` test opened a `lancedb.connect()` and `table` before calling `updateDocument()`, then used the same stale table reference to verify. LanceDB returns pre-update data from cached table objects. Result: `status` showed "draft" instead of "active".
- **Fix:** Changed test to read before/after state using separate `lancedb.connect()` calls. Also updated all other read-after-update patterns across the test file to open fresh connections.
- **Files modified:** test/tools/update-document.test.ts
- **Commit:** 45ee8ce (Task 2 commit)

**2. [Rule 1 - Bug] TypeScript type error on table.update() values object**
- **Found during:** Task 2 TypeScript compile check
- **Issue:** `const values: Record<string, unknown>` was rejected by LanceDB's TypeScript overloads for `table.update({ where, values })`. LanceDB requires `Record<string, IntoSql>` where `IntoSql = string | number | boolean | null | Date | ...`
- **Fix:** Added `import type { IntoSql } from "@lancedb/lancedb"` and typed `values` as `Record<string, IntoSql>`
- **Files modified:** src/tools/update-document.ts
- **Commit:** 45ee8ce (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1x Rule 1 test bug — stale table ref; 1x Rule 1 type error — IntoSql)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- Full test suite runs in ~29s (stable from Plan 02)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three tools (query_documents, update_document, delete_document) ready for Plan 04 (link_documents)
- Full CRUD surface for documents complete: store, query, update (metadata), delete (soft/hard)
- 225 tests pass, TypeScript compiles clean, Biome passes

---
*Phase: 04-document-management*
*Completed: 2026-02-28*

## Self-Check: PASSED

All files present:
- src/tools/doc-constants.ts - FOUND
- src/tools/query-documents.ts - FOUND
- src/tools/update-document.ts - FOUND
- src/tools/delete-document.ts - FOUND
- test/tools/query-documents.test.ts - FOUND
- test/tools/update-document.test.ts - FOUND
- test/tools/delete-document.test.ts - FOUND
- .planning/phases/04-document-management/04-03-SUMMARY.md - FOUND

All commits present:
- 5b61ff4 - FOUND (Task 1: query_documents)
- 45ee8ce - FOUND (Task 2: update_document, delete_document)
