---
phase: 05-document-search
plan: "03"
subsystem: search
tags: [lancedb, gpt-tokenizer, mcp-tool, context-assembly, graph-traversal, tdd]

# Dependency graph
requires:
  - phase: 05-01
    provides: extractSnippet, fetchDocMetadata, buildSearchPredicate from search-utils.ts
  - phase: 04-04
    provides: getRelatedDocuments for 1-hop graph traversal, VALID_RELATIONSHIP_TYPES
provides:
  - get_smart_context MCP tool with overview and detailed modes
  - getSmartContext core function (testable without MCP server)
  - registerGetSmartContextTool MCP wrapper
  - Two-phase context assembly: metadata scan + full content fetch with graph expansion
affects:
  - 05-04 (hybrid-search — get_smart_context is primary tool agents use for context gathering)
  - 06-code-indexing (any code context assembly will reference these patterns)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drop-lowest strategy: token budget exceeded = drop entire document, never truncate mid-content"
    - "RELATIONSHIP_PRIORITY map (depends_on/implements=1, references/related_to=2, contradicts/child_of/supersedes=3) for graph expansion ordering"
    - "initProject seeds 4 starter docs — tests must use category filters to isolate test data"

key-files:
  created:
    - src/tools/get-smart-context.ts
    - test/tools/get-smart-context.test.ts
  modified: []

key-decisions:
  - "max_tokens min=500 (per plan spec) — tests that need tight budgets use 500 with content designed to overflow"
  - "1-hop graph expansion deduplicates by keeping highest-priority relationship when doc appears via multiple paths"
  - "Starter documents (4 seeded by initProject) require category-filter isolation in count-sensitive tests"
  - "Related doc sort uses doc_id as tiebreaker when relationship priorities match (title not yet loaded for efficiency)"
  - "Requested docs always included even if they exceed max_tokens budget; only related docs are budget-gated"

patterns-established:
  - "getSmartContext(dbPath, projectId, args): two-export pattern — core function + registerGetSmartContextTool wrapper"
  - "Overview mode builds documents-table predicate directly (no doc_chunks, no embeddings)"
  - "Detailed mode chains getRelatedDocuments per requested doc_id, then fetches full content of related docs"

requirements-completed: [SRCH-04, SRCH-05, SRCH-06]

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 5 Plan 03: get_smart_context Summary

**get_smart_context MCP tool with overview mode (metadata scan + ~100-token summaries sorted by priority) and detailed mode (full content + 1-hop graph expansion with depends_on/implements prioritized before references/related_to), both accumulating to configurable max_tokens budget using drop-lowest strategy**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-28T15:15:43Z
- **Completed:** 2026-02-28T15:20:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Overview mode: metadata-only scan of documents table (no embeddings), ~100-token summaries via extractSnippet("", "", 100), sorted by priority asc/updated_at desc, accumulated within max_tokens budget with drop-lowest strategy
- Detailed mode: full content fetch for specified doc_ids, 1-hop graph expansion via getRelatedDocuments(), RELATIONSHIP_PRIORITY ordering, dedup of already-requested docs, token budget respected across requested + related docs
- 21 tests passing: 8 overview tests + 13 detailed tests, all passing with full suite regression check (337 tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: overview mode TDD RED** - `06e0175` (test)
2. **Task 1+2: GREEN — full implementation** - `ad4b583` (feat)

_Note: TDD tasks committed as RED (failing tests) then GREEN (implementation). Both overview and detailed mode implemented together since they share the same source file._

## Files Created/Modified
- `src/tools/get-smart-context.ts` - get_smart_context MCP tool: overview mode (metadata scan), detailed mode (full content + 1-hop graph), RELATIONSHIP_PRIORITY map, getSmartContext core + registerGetSmartContextTool wrapper
- `test/tools/get-smart-context.test.ts` - 21 tests covering overview no-filter, category filter, budget enforcement, priority sort, default max_tokens, empty results, field validation, token accounting; detailed full content, 1-hop expansion, priority ordering, dedup, budget enforcement, graph_expansion metadata

## Decisions Made
- `max_tokens` minimum is 500 (per plan spec 500-20000). Tests that need tight budget enforcement use 500+ with content sized to overflow.
- Starter docs (4 seeded by initProject: plan, architecture_decision, code_pattern, glossary) are present in every test DB — tests that need exact counts use category filters (change_record, requirement, learning, learning) to isolate.
- Related doc expansion uses doc_id as alphabetical tiebreaker when relationship priorities match — avoids needing to load titles for sort, consistent ordering.
- Requested docs are always included regardless of token budget (they're what the agent explicitly asked for). Budget only gates related/expanded docs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertions adjusted for 4 starter documents seeded by initProject**
- **Found during:** Task 1 (test execution — GREEN phase)
- **Issue:** Tests expecting exact document counts (0, 1, 5) failed because initProject seeds 4 starter docs
- **Fix:** Added category filters to count-sensitive tests to isolate test data from starter docs
- **Files modified:** test/tools/get-smart-context.test.ts
- **Verification:** All 21 tests pass
- **Committed in:** 06e0175 (test commit)

**2. [Rule 1 - Bug] Test max_tokens adjusted from 200/300 to 500 to satisfy Zod min**
- **Found during:** Task 1 (test execution — GREEN phase)
- **Issue:** Plan spec says max_tokens min=500, but budget enforcement tests used 200/300
- **Fix:** Increased test content length so 500-token budget still causes truncation; updated assertions accordingly
- **Files modified:** test/tools/get-smart-context.test.ts
- **Verification:** Budget enforcement tests pass (documents.length < total, total_tokens <= 500)
- **Committed in:** 06e0175 (test commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - test correctness)
**Impact on plan:** Both fixes necessary for tests to match actual runtime behavior. No scope creep.

## Issues Encountered
None — implementation followed the plan spec exactly. Test adjustments were needed due to starter document seeding behavior documented in Phase 04-02 decisions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- get_smart_context is ready for agents to use as primary context-gathering tool
- Plan 05-04 (hybrid search) can now integrate with get_smart_context for two-stage retrieval
- All 337 tests pass — no regressions introduced

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git history.

---
*Phase: 05-document-search*
*Completed: 2026-02-28*
