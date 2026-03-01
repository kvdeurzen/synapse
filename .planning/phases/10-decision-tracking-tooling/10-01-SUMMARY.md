---
phase: 10-decision-tracking-tooling
plan: 01
subsystem: database
tags: [lancedb, arrow, zod, embeddings, decisions, mcp-tools]

# Dependency graph
requires:
  - phase: 09-code-search-tooling
    provides: "embed() service, insertBatch, connectDb, logActivity patterns"
provides:
  - "DECISIONS_SCHEMA Arrow schema (17 fields) in src/db/schema.ts"
  - "DecisionRowSchema Zod validation schema in src/db/schema.ts"
  - "decision-constants.ts: VALID_TIERS, TIER_NAMES, VALID_DECISION_TYPES, VALID_DECISION_STATUSES"
  - "store_decision MCP tool with rationale embedding, supersession, and activity logging"
  - "decisions table in TABLE_NAMES (7 tables total)"
  - "FTS indexes on decisions.subject and decisions.rationale"
affects: [11-decision-query-tooling, 12-orchestrator-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decision tier hierarchy (0=product_strategy, 1=architecture, 2=functional_design, 3=execution)"
    - "Supersession via supersedes param: marks old decision status=superseded, sets superseded_by"
    - "Quick precedent check via vector similarity (cosine distance <= 0.15 = has_precedent=true)"
    - "Fail-fast embedding: store_decision throws if Ollama unreachable (same as store_document)"

key-files:
  created:
    - src/tools/decision-constants.ts
    - src/tools/store-decision.ts
    - test/tools/store-decision.test.ts
  modified:
    - src/db/schema.ts
    - src/tools/init-project.ts
    - src/server.ts
    - src/tools/delete-project.ts
    - test/db/init-project.test.ts
    - test/db/schema.test.ts
    - test/tools/get-index-status.test.ts
    - test/tools/search-code.test.ts
    - test/db/delete-project.test.ts

key-decisions:
  - "Vector field is nullable in DECISIONS_SCHEMA for defensive schema design, even though store_decision enforces Ollama availability at write time"
  - "Precedent check uses cosine distance <= 0.15 threshold (approximately similarity >= 0.85)"
  - "store_decision fails fast on Ollama down (same pattern as store_document — no partial writes)"

patterns-established:
  - "Decision constants: all enums live in decision-constants.ts, imported by schema.ts and store-decision.ts"
  - "MCP tool registration: storeDecision(dbPath, projectId, args, config) core function + registerStoreDecisionTool(server, config) wrapper"

requirements-completed: [DEC-01, DEC-02, DEC-05, DEC-06, DEC-07]

# Metrics
duration: 8min
completed: 2026-03-01
---

# Phase 10 Plan 01: Decisions Schema, Constants, and store_decision Tool Summary

**DECISIONS_SCHEMA (17 fields) with tier-based categorization (0-3), rationale embedding via Ollama, supersession lifecycle, and store_decision MCP tool wired into server.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-01T18:33:05Z
- **Completed:** 2026-03-01T18:41:25Z
- **Tasks:** 2
- **Files modified:** 9 (5 source, 5 test)

## Accomplishments
- Defined DECISIONS_SCHEMA (17-field Arrow schema) and DecisionRowSchema (Zod validation) covering full decision data model
- Created decision-constants.ts with tier hierarchy (0=product_strategy through 3=execution), decision types, and status enums
- Implemented store_decision MCP tool with rationale embedding, supersession support, activity logging, and quick precedent check
- Extended init_project to create decisions table (now 7 tables) with BTree on project_id and FTS indexes on subject+rationale
- Wired registerStoreDecisionTool into server.ts (19 registered tools total)
- 17 new TDD tests passing covering all behavioral requirements

## Task Commits

Each task was committed atomically:

1. **Task 1: Define decisions schema, types, and constants** - `e39e455` (feat)
2. **Task 2: Implement store_decision core logic and MCP tool with TDD** - `92a9dd5` (feat)

**Plan metadata:** (docs commit follows)

_Note: Both tasks used TDD (RED test first, then GREEN implementation)_

## Files Created/Modified
- `src/tools/decision-constants.ts` - VALID_TIERS, TIER_NAMES, VALID_DECISION_TYPES, VALID_DECISION_STATUSES
- `src/db/schema.ts` - Added DECISIONS_SCHEMA (17 fields), DecisionRowSchema, "decisions" in TABLE_NAMES/TABLE_SCHEMAS
- `src/tools/store-decision.ts` - storeDecision core function + registerStoreDecisionTool MCP registration
- `src/tools/init-project.ts` - FTS indexes for decisions.subject and decisions.rationale, updated description to 7 tables
- `src/server.ts` - Added registerStoreDecisionTool import and registration call (19 tools)
- `src/tools/delete-project.ts` - Updated description to reflect 7 tables (no code change needed — uses TABLE_NAMES dynamically)
- `test/tools/store-decision.test.ts` - 17 TDD tests covering storage, embedding, activity logging, supersession, validation
- `test/db/init-project.test.ts` - Updated TABLE_NAMES to 7 entries, tables_created/skipped expectations
- `test/db/schema.test.ts` - Updated TABLE_NAMES count expectation from 6 to 7
- `test/tools/get-index-status.test.ts` - Updated tool count expectation from 18 to 19
- `test/tools/search-code.test.ts` - Updated tool count expectation from 18 to 19
- `test/db/delete-project.test.ts` - Updated tables_cleaned expectation from 6 to 7

## Decisions Made
- Nullable vector field in DECISIONS_SCHEMA as defensive schema design — actual writes still fail fast if Ollama is down (enforcement is at store_decision level)
- Cosine distance threshold of 0.15 for has_precedent (approximately cosine similarity >= 0.85)
- Precedent check failure is non-fatal — if vector search fails for any reason, has_precedent = false and execution continues

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tool count test expectations after adding store_decision**
- **Found during:** Task 2 (full test suite run)
- **Issue:** test/tools/get-index-status.test.ts and test/tools/search-code.test.ts hardcoded tool count as 18; adding store_decision increased it to 19
- **Fix:** Updated both test files to expect 19 tools, updated test descriptions to reference Phase 10
- **Files modified:** test/tools/get-index-status.test.ts, test/tools/search-code.test.ts
- **Verification:** bun test — all 512 tests pass
- **Committed in:** 92a9dd5 (Task 2 commit)

**2. [Rule 1 - Bug] Updated delete-project test expectations for 7 tables**
- **Found during:** Task 2 (full test suite run)
- **Issue:** test/db/delete-project.test.ts expected tables_cleaned=6; adding decisions table made it 7
- **Fix:** Updated expectations to 7, updated delete_project tool description to mention 7 tables
- **Files modified:** test/db/delete-project.test.ts, src/tools/delete-project.ts
- **Verification:** bun test — all 512 tests pass
- **Committed in:** 92a9dd5 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bugs: existing tests had hardcoded counts that needed updating)
**Impact on plan:** Both auto-fixes necessary for test suite correctness after extending TABLE_NAMES. No scope creep.

## Issues Encountered
None — plan executed without unexpected blockers.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- decisions table exists with BTree index and FTS indexes on subject/rationale
- store_decision tool fully functional and registered at /tools/store_decision
- Plan 02 (query_decisions + check_precedent) can proceed — it depends on stored decisions with vectors
- All 512 tests passing (up from 495 at v1.0 close)

---
*Phase: 10-decision-tracking-tooling*
*Completed: 2026-03-01*

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.
