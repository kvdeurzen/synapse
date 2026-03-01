---
phase: 07-code-search-and-integration-validation
plan: 01
subsystem: search
tags: [lancedb, bm25, rrf, vector-search, code-search, mcp-tool]

# Dependency graph
requires:
  - phase: 06-code-indexing
    provides: code_chunks table with FTS index and vector embeddings
  - phase: 05-document-search
    provides: search-utils.ts (extractSnippet, normalizeVectorScore, normalizeFtsScore), hybrid-search.ts pattern

provides:
  - search_code MCP tool with semantic, fulltext, and hybrid (RRF) search modes against code_chunks table
  - Code-specific filters: language, symbol_type, file_pattern (glob syntax)
  - globToSqlLike helper translating glob patterns to SQL LIKE predicates
  - CodeSearchResultItem and CodeSearchResult types
  - searchCode core function exportable for testing

affects: [07-02-integration-validation, any future code intelligence phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Code-specific inline predicate builder (no cross-table joins — code_chunks filters are direct columns)
    - globToSqlLike for translating glob syntax to SQL LIKE predicates
    - scope_chain parsed from dot-notation string to string[] at result-building time
    - Hybrid FTS fallback pattern (identical to hybrid-search.ts) when Ollama unreachable

key-files:
  created:
    - src/tools/search-code.ts
    - test/tools/search-code.test.ts
  modified:
    - src/server.ts

key-decisions:
  - "Code search uses inline predicate builder (not buildSearchPredicate from search-utils) — code_chunks has no cross-table metadata join"
  - "scope_chain stored as dot-notation string, returned as string[] by splitting on '.'"
  - "Default limit for search_code is 10 (vs 5 for document search tools) per CONTEXT.md"
  - "Content returned as extractSnippet() trimmed snippet, not full chunk content"
  - "Hybrid fallback to FTS-only when Ollama status is not 'ok' (both unreachable and model_missing)"

patterns-established:
  - "code-search pattern: inline AND predicate for code_chunks direct columns (language, symbol_type, file_path LIKE)"
  - "globToSqlLike: escape %, _ then convert ** to %, * to %, ? to _"

requirements-completed: [CSRCH-01, CSRCH-02, CSRCH-03]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 7 Plan 01: Search Code Summary

**search_code MCP tool with semantic/fulltext/hybrid (RRF) modes, code-specific filters (language, symbol_type, file_pattern glob), and scope_chain array parsing against code_chunks table**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T05:07:30Z
- **Completed:** 2026-03-01T05:10:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented search_code MCP tool supporting three search modes (semantic/fulltext/hybrid) against code_chunks table
- Code-specific filter builder: language, symbol_type, file_pattern (glob via globToSqlLike) combined with AND logic
- Hybrid mode with RRFReranker(60) falls back to FTS-only when Ollama is unreachable or model missing
- Registered search_code as tool #17 in server.ts
- 20 tests covering all modes, filters, scope_chain parsing, glob translation, empty table edge case, and server registration

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement search-code.ts with all three search modes and code-specific filter builder** - `564255f` (feat)
2. **Task 2: Create search-code tests and register tool in server.ts** - `1adc21d` (feat)

**Plan metadata:** (upcoming docs commit)

## Files Created/Modified

- `src/tools/search-code.ts` - Core search_code tool: searchCode function + registerSearchCodeTool, CodeSearchResultItem/CodeSearchResult types, globToSqlLike helper
- `test/tools/search-code.test.ts` - 20 tests covering fulltext mode, semantic fallback, hybrid fallback, scope_chain parsing, language/symbol_type/file_pattern filters, empty table behavior, server registration
- `src/server.ts` - Added import + registration of registerSearchCodeTool (toolCount 16 → 17)

## Decisions Made

- Code search does NOT use `buildSearchPredicate` from search-utils.ts — that function does cross-table metadata joins to the documents table which don't apply to code_chunks (code-specific filters are direct columns)
- scope_chain is stored as dot-notation string in DB (e.g., "UserService.login") and parsed to string[] at query time via `.split(".")` — no type label prefixes (per Pitfall 1 in RESEARCH.md)
- Default limit for search_code is 10 (plan specifies this explicitly; document search tools default to 5)
- Content returned as extractSnippet() trimmed snippet to avoid returning full chunk content (locked decision)
- RRFReranker.create(60) async factory (not constructor) — consistent with Phase 05-02/05-04 correction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- search_code tool registered and tested — ready for 07-02 integration validation
- All 469 tests pass (449 from Phase 6 + 20 new search_code tests)
- TypeScript compiles clean with no errors

## Self-Check: PASSED

- FOUND: src/tools/search-code.ts
- FOUND: test/tools/search-code.test.ts
- FOUND: 07-01-SUMMARY.md
- FOUND: commit 564255f (Task 1 - search-code.ts implementation)
- FOUND: commit 1adc21d (Task 2 - tests + server.ts registration)
- TypeScript: compiles clean (no errors)
- Tests: 469 pass, 0 fail

---
*Phase: 07-code-search-and-integration-validation*
*Completed: 2026-03-01*
