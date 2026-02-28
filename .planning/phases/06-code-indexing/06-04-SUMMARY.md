---
phase: 06-code-indexing
plan: "04"
subsystem: code-indexing
tags: [tree-sitter, lancedb, embeddings, sha256, incremental-indexing, mcp-tool]

# Dependency graph
requires:
  - phase: 06-01
    provides: scanFiles, FileEntry, ScanResult — file discovery pipeline
  - phase: 06-02
    provides: extractSymbols, SymbolExtraction, ExtractionResult — AST symbol extraction
  - phase: 06-03
    provides: resolveImports, ImportEdge — file-to-file import edge generation
  - phase: 03-01
    provides: embed, getOllamaStatus, setOllamaStatus — embedding service
  - phase: 02-02
    provides: code_chunks, relationships tables; CodeChunkRowSchema, RelationshipRowSchema
provides:
  - indexCodebase: full indexing pipeline orchestrator (scan → hash → parse → extract → embed → write)
  - registerIndexCodebaseTool: MCP tool registration wrapping indexCodebase
  - Integration tests: 10 tests covering first-index, incremental, deletion, test-tagging, edge-replacement, fail-fast
affects: [06-05, server-integration, search-code-chunks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-export pattern: indexCodebase core function + registerIndexCodebaseTool MCP wrapper"
    - "escapeSQL helper for single-quote escaping in LanceDB predicate strings"
    - "Fail-fast embed check: getOllamaStatus() before any disk I/O"
    - "Sequential file processing (one at a time) to avoid OOM with tree-sitter+Ollama"
    - "Delete-then-reinsert for ast_import edges on every index cycle (no append/duplicate risk)"

key-files:
  created:
    - src/tools/index-codebase.ts
    - test/tools/index-codebase.test.ts
  modified: []

key-decisions:
  - "indexCodebase processes files sequentially (not parallel) to avoid OOM from tree-sitter + Ollama memory pressure"
  - "doc_id = file_path for code_chunks rows — enables join-free lookup by file path"
  - "escapeSQL helper prevents single-quote injection in LanceDB filter predicates"
  - "ast_import edges use delete-then-reinsert strategy (not append) — ensures edges stay fresh without duplicates"
  - "is_test flag embedded in imports JSON field (not a dedicated column) — avoids schema change, preserves forward compat"
  - "project_meta.last_index_at update is non-critical: wrapped in try/catch so indexing never fails on metadata update error"
  - "Large file warning (>5000 lines) emits logger.warn but indexes normally per CONTEXT.md locked decision"

patterns-established:
  - "Incremental indexing via SHA-256 hash comparison on file content before any parsing/embedding"
  - "Stale cleanup: deleted files get code_chunks AND ast_import edges removed in one index cycle"
  - "Test file detection: isTest flag from scanner → is_test:true in imports JSON metadata"

requirements-completed: [CODE-03, CODE-04, CODE-05, CODE-06, CODE-08, CODE-09]

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 6 Plan 04: Code Indexing Orchestrator Summary

**indexCodebase pipeline orchestrator: scan → SHA-256 hash → parse → extract → embed → write code_chunks + ast_import edges, with incremental skip, stale cleanup, and MCP tool registration**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T17:35:45Z
- **Completed:** 2026-02-28T17:39:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Full indexing pipeline in `indexCodebase()`: scan files → SHA-256 hash check → tree-sitter parse → extract symbols → embed → write code_chunks rows → write ast_import edge rows → cleanup deleted files
- Incremental indexing: unchanged files skipped via SHA-256 hash comparison (CODE-05); changed files have old chunks deleted then new ones inserted
- Deleted file cleanup: code_chunks and ast_import edges removed when file no longer exists on disk (CODE-06)
- ast_import edge delete-then-reinsert on every index cycle — prevents duplicates (CODE-08)
- All code_chunk rows include all required fields: chunk_id, project_id, doc_id=file_path, file_path, symbol_name, symbol_type, scope_chain, content, language, imports, exports, start_line, end_line, created_at, file_hash, vector (CODE-03)
- Test file tagging: chunks from `*.test.ts` / `*_test.py` files have `is_test: true` in imports JSON field
- Ollama fail-fast: `getOllamaStatus() !== 'ok'` throws `OllamaUnreachableError` before any I/O (CODE-04 embed check)
- Large file warning: files >5000 lines emit `logger.warn` with file path and line count, then index normally
- Returns `{ files_scanned, files_indexed, chunks_created, skipped_unchanged, files_deleted, edges_created, errors }` (CODE-09)
- `registerIndexCodebaseTool` follows two-export pattern from all other tools (store_document, delete_document, etc.)
- 10 integration tests pass; 449 total tests pass (0 regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement indexCodebase core function via TDD** - `0c5503a` (feat)
   - Both tasks implemented together since registerIndexCodebaseTool lives in same file
2. **Task 2: MCP tool registration** - included in `0c5503a` (same file, no separate commit needed)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `src/tools/index-codebase.ts` - Core `indexCodebase()` function and `registerIndexCodebaseTool()` MCP wrapper
- `test/tools/index-codebase.test.ts` - 10 integration tests covering all pipeline behaviors

## Decisions Made

- Both tasks committed together since `registerIndexCodebaseTool` and `indexCodebase` are in the same file — splitting into two commits would have required a compile-broken intermediate state
- `escapeSQL` helper scoped to module (not exported) — only needed for LanceDB predicate building inside this file
- `project_meta.last_index_at` update wrapped in try/catch — metadata update is non-critical; indexing result is still valid even if project_meta is stale

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 10 tests passed on first run.

## User Setup Required

None — no external service configuration required. Ollama must be running and model available at runtime, but no setup needed for development/testing (tests mock the embedding service).

## Next Phase Readiness

- `indexCodebase` and `registerIndexCodebaseTool` ready for integration in Plan 06-05 (server.ts registration)
- All required CODE-* requirements (CODE-03, CODE-04, CODE-05, CODE-06, CODE-08, CODE-09) satisfied
- 449 tests passing — clean baseline for Plan 06-05

---
*Phase: 06-code-indexing*
*Completed: 2026-02-28*
