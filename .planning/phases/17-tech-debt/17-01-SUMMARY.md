---
phase: 17-tech-debt
plan: 01
subsystem: database
tags: [lancedb, sql, escapeSQL, code-indexing, ast-import, relationships, documents]

# Dependency graph
requires:
  - phase: 15-foundation
    provides: resolveConfig pattern and server package baseline
  - phase: 16-user-journey-commands
    provides: complete server tool suite at stable state
provides:
  - shared escapeSQL helper in db/sql-helpers.ts
  - created_at preservation on re-init and re-index
  - code file document entries enabling AST edge traversal
affects: [18, 19, 20, 21, 23, 24]  # any phase using indexCodebase or get_related_documents

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared SQL escape in db/sql-helpers.ts — import from there, never define locally"
    - "LanceDB upsert with read-before-delete to preserve immutable fields (created_at)"
    - "Code file documents: doc_id=filePath in documents table so relationships.from_id/to_id resolves"

key-files:
  created:
    - packages/server/src/db/sql-helpers.ts
    - packages/server/test/db/sql-helpers.test.ts
  modified:
    - packages/server/src/tools/init-project.ts
    - packages/server/src/tools/index-codebase.ts
    - packages/server/test/db/init-project.test.ts
    - packages/server/test/tools/index-codebase.test.ts
    - packages/server/test/tools/get-related-documents.test.ts

key-decisions:
  - "Use file path as doc_id in documents table for code files — direct lookup compat with relationships table, no ULID mapping needed"
  - "code_chunks.doc_id stays as file path — consistent with documents.doc_id=filePath; ULID migration deferred"
  - "upsertCodeFileDocument is insert-only (no update) — existence check skips files already indexed"

patterns-established:
  - "Pattern: read existing row before delete in LanceDB upsert to preserve created_at"
  - "Pattern: open fresh db.openTable() reference before read to avoid stale LanceDB cache"

requirements-completed: [DEBT-01, DEBT-02, DEBT-03]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 17 Plan 01: Correctness Fixes (escapeSQL + created_at + AST edges) Summary

**Shared escapeSQL in db/sql-helpers.ts; created_at preserved on re-init/re-index; code file document entries make AST import edges resolvable by get_related_documents**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T14:34:38Z
- **Completed:** 2026-03-05T14:39:00Z
- **Tasks:** 2
- **Files modified:** 7 (3 src + 4 test)

## Accomplishments

- Created `db/sql-helpers.ts` with a single exported `escapeSQL` — eliminates duplication across tool files
- Fixed LanceDB upsert in both `init-project.ts` and `index-codebase.ts` to read `created_at` before delete and reinsert the original value
- Added `upsertCodeFileDocument` in `index-codebase.ts` that inserts a `documents` row (doc_id=filePath, category=code_file) per indexed file, making `relationships.from_id/to_id` directly resolvable by `get_related_documents`
- All 624 server tests pass (12 new tests added)

## Task Commits

Each task was committed atomically (TDD: failing tests then implementation):

1. **Task 1 RED: escapeSQL + created_at tests** - `3220de7` (test)
2. **Task 1 GREEN: Extract escapeSQL, fix created_at** - `c4295f6` (feat)
3. **Task 2 RED: AST import edge tests** - `437d983` (test)
4. **Task 2 GREEN: upsertCodeFileDocument** - `da5667c` (feat)

_Note: TDD tasks each have 2 commits (test RED → feat GREEN)_

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/server/src/db/sql-helpers.ts` — New shared `escapeSQL` helper
- `packages/server/src/tools/init-project.ts` — Import shared escapeSQL; preserve created_at on re-init
- `packages/server/src/tools/index-codebase.ts` — Import shared escapeSQL; preserve created_at; add upsertCodeFileDocument helper and call site
- `packages/server/test/db/sql-helpers.test.ts` — Tests for escapeSQL (quotes, empty, multi-quote)
- `packages/server/test/db/init-project.test.ts` — Tests for created_at preservation on re-init
- `packages/server/test/tools/index-codebase.test.ts` — Test for created_at preservation on re-index
- `packages/server/test/tools/get-related-documents.test.ts` — 3 tests for AST import edge resolvability

## Decisions Made

- **File path as doc_id:** Using `filePath` as `doc_id` in the documents table for code files (not a fresh ULID). This makes `relationships.from_id/to_id` (already file paths) directly resolvable without any mapping layer. The `doc_id` field is typed as `string` with no format constraint — file paths are valid values.
- **code_chunks.doc_id unchanged:** Left `code_chunks.doc_id = file.relativePath` as-is. Now `documents.doc_id` and `code_chunks.doc_id` are both the file path — consistent. ULID migration deferred.
- **Insert-only upsert for code file documents:** `upsertCodeFileDocument` only inserts if the document doesn't exist — no updates on re-index (content is `Code file: {filePath}` which never changes). This avoids unnecessary writes.

## Deviations from Plan

None — plan executed exactly as written. The RESEARCH.md provided clear fix patterns and pitfall guidance that were followed precisely.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEBT-01, DEBT-02, DEBT-03 complete — correctness bugs fixed
- Phase 17 Plan 02 (lint cleanup) can proceed independently
- `get_related_documents` now returns results for AST import edges after `index_codebase` runs
- The server is ready for RPEV orchestration rework (Phase 18+)

---
*Phase: 17-tech-debt*
*Completed: 2026-03-05*

## Self-Check: PASSED

- FOUND: `packages/server/src/db/sql-helpers.ts`
- FOUND: `packages/server/test/db/sql-helpers.test.ts`
- FOUND: `.planning/phases/17-tech-debt/17-01-SUMMARY.md`
- All 4 task commits exist: 3220de7, c4295f6, 437d983, da5667c
- 624 server tests pass, 0 fail
