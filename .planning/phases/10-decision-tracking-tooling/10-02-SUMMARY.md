---
phase: 10-decision-tracking-tooling
plan: 02
subsystem: database
tags: [lancedb, vector-search, zod, embeddings, decisions, mcp-tools, tdd]

# Dependency graph
requires:
  - phase: 10-decision-tracking-tooling/10-01
    provides: "DECISIONS_SCHEMA, DecisionRowSchema, decision-constants.ts, store_decision tool, decisions table"
provides:
  - "query_decisions MCP tool with tier/status/type/subject/tags/phase filtering and pagination"
  - "check_precedent MCP tool with 0.85 cosine similarity threshold and 5-match cap"
  - "All three decision tools registered in server.ts (21 total tools)"
  - "DecisionSummary interface (query result shape without vector)"
  - "PrecedentMatch and CheckPrecedentResult interfaces"
affects: [11-decision-query-tooling, 12-orchestrator-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "query_decisions SQL-for-indexed-fields + JS-post-filter for subject/tags (same as query-documents.ts pattern)"
    - "check_precedent graceful degradation: Ollama unreachable returns has_precedent=false with warning (read operation)"
    - "Vector search pre-filtering by decision_type before cosine similarity ranking"
    - "Direct insertBatch with DecisionRowSchema in tests to bypass embed for query-logic tests"
    - "normalizeVector(makeVector(X)) pattern for test vector construction with cosine distance control"

key-files:
  created:
    - src/tools/query-decisions.ts
    - src/tools/check-precedent.ts
    - test/tools/query-decisions.test.ts
    - test/tools/check-precedent.test.ts
  modified:
    - src/server.ts
    - test/tools/get-index-status.test.ts
    - test/tools/search-code.test.ts

key-decisions:
  - "query_decisions uses SQL WHERE for indexed fields (project_id, tier, decision_type, status, phase) and JS post-filter for subject/tags — avoids LanceDB LIKE limitations"
  - "check_precedent is a READ operation: gracefully degrades (has_precedent=false + warning) when Ollama unreachable, unlike store_decision which fails fast"
  - "Test strategy: query-decisions tests use direct insertBatch (no Ollama needed); check-precedent tests use _setFetchImpl with normalized unit vectors"

patterns-established:
  - "Decision tool registration pattern: queryDecisions(dbPath, projectId, args) core + registerQueryDecisionsTool(server, config) wrapper — same as store_decision"
  - "Precedent threshold constant at top of module: PRECEDENT_SIMILARITY_THRESHOLD = 0.85"
  - "All decision-related tools import from decision-constants.ts for shared enums"

requirements-completed: [DEC-03, DEC-04, DEC-08]

# Metrics
duration: 7min
completed: 2026-03-01
---

# Phase 10 Plan 02: query_decisions and check_precedent Tools Summary

**query_decisions browses decisions with tier/status/type/subject/tags filters; check_precedent performs cosine vector search with 0.85 similarity threshold and 5-match cap — completing the decision tracking toolset (21 MCP tools total)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-01T16:24:32Z
- **Completed:** 2026-03-01T16:31:28Z
- **Tasks:** 2
- **Files modified:** 7 (4 source, 3 test)

## Accomplishments
- Implemented query_decisions MCP tool with SQL filtering for indexed fields (tier, status, decision_type, phase) and JS post-filtering for subject substring and tags; pagination via limit/offset
- Implemented check_precedent MCP tool with rationale embedding, decision_type pre-filtering, 0.85 cosine similarity threshold, top-5 ranked matches, and graceful Ollama-down degradation
- Wired both tools into server.ts alongside store_decision — 21 total MCP tools registered
- 24 new TDD tests (14 for query_decisions, 10 for check_precedent) all passing
- Updated tool count expectations in get-index-status and search-code tests to 21
- Full test suite: 536 tests passing (up from 512 at Plan 01 completion)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement query_decisions tool with TDD** - `2a85eed` (feat)
2. **Task 2: Implement check_precedent tool and wire all decision tools into server** - `bd98e54` (feat)

**Plan metadata:** (docs commit follows)

_Note: Both tasks used TDD (RED test first, then GREEN implementation)_

## Files Created/Modified
- `src/tools/query-decisions.ts` - queryDecisions core function + registerQueryDecisionsTool MCP registration
- `src/tools/check-precedent.ts` - checkPrecedent core function + registerCheckPrecedentTool MCP registration
- `src/server.ts` - Added registerQueryDecisionsTool and registerCheckPrecedentTool imports and calls (21 tools)
- `test/tools/query-decisions.test.ts` - 14 TDD tests covering filtering, pagination, result shape, project isolation
- `test/tools/check-precedent.test.ts` - 10 TDD tests covering empty table, type pre-filtering, similarity threshold, ranking, inactive handling, result shape, Ollama degradation
- `test/tools/get-index-status.test.ts` - Updated tool count expectation from 19 to 21
- `test/tools/search-code.test.ts` - Updated tool count expectation from 19 to 21

## Decisions Made
- query_decisions uses SQL WHERE predicates for indexed fields and JS post-filtering for subject/tags — avoids LanceDB's limited LIKE support (same pattern as query-documents.ts)
- check_precedent gracefully degrades when Ollama is unreachable (returns has_precedent=false with warning), unlike store_decision which fails fast — check_precedent is a read/advisory operation
- Test strategy: query-decisions tests insert rows directly via insertBatch (bypassing embed); check-precedent tests use _setFetchImpl with normalized unit vectors to control cosine distance precisely

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tool count test expectations after adding query_decisions and check_precedent**
- **Found during:** Task 2 (full test suite run)
- **Issue:** test/tools/get-index-status.test.ts and test/tools/search-code.test.ts hardcoded tool count as 19; adding two new decision tools increased it to 21
- **Fix:** Updated both test files to expect 21 tools and updated test descriptions to reference Phase 10
- **Files modified:** test/tools/get-index-status.test.ts, test/tools/search-code.test.ts
- **Verification:** bun test — all 536 tests pass
- **Committed in:** bd98e54 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: hardcoded tool counts in existing tests)
**Impact on plan:** Auto-fix necessary for test suite correctness after extending server.ts tool registrations. No scope creep.

## Issues Encountered
None — plan executed without unexpected blockers.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three decision tools (store_decision, query_decisions, check_precedent) functional and registered
- Full decision tracking toolset complete: DEC-01 through DEC-08 requirements met
- Phase 10 complete — all plans executed
- 536 tests passing (up from 512 at Plan 01 completion)
- Phase 11 (if any) or next phase can proceed with full decision tracking capability

---
*Phase: 10-decision-tracking-tooling*
*Completed: 2026-03-01*

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.
