---
phase: 25-agent-behavior-hardening
plan: 03
subsystem: hooks
tags: [audit-log, attribution, agent-prompts, session-summary, cost-estimation]

# Dependency graph
requires:
  - phase: 19-agent-prompts
    provides: Base agent prompt structure with Attribution sections
  - phase: 24-e2e-validation
    provides: E2E run data showing 91% unknown attribution rate
provides:
  - Strengthened Attribution sections in 8 agent prompts with per-tool actor listings
  - Heuristic fallback attribution in audit-log.js for Task tool
  - has_actor boolean field for attribution gap visibility
  - session-summary.js script for per-agent token/cost aggregation
  - Removal of redundant synapse-audit.js
affects: [25-agent-behavior-hardening, e2e-revalidation]

# Tech tracking
tech-stack:
  added: []
  patterns: [explicit-per-tool-actor-listing, heuristic-attribution-fallback, ndjson-aggregation]

key-files:
  created:
    - packages/framework/scripts/session-summary.js
    - .claude/scripts/session-summary.js
  modified:
    - .claude/hooks/audit-log.js
    - packages/framework/hooks/audit-log.js
    - packages/framework/agents/architect.md
    - packages/framework/agents/codebase-analyst.md
    - packages/framework/agents/debugger.md
    - packages/framework/agents/integration-checker.md
    - packages/framework/agents/plan-reviewer.md
    - packages/framework/agents/product-strategist.md
    - packages/framework/agents/researcher.md
    - packages/framework/agents/validator.md

key-decisions:
  - "Per-tool actor listing pattern: Attribution sections now list every MCP tool with explicit actor parameter example"
  - "Task tool heuristic: Task tool calls attributed to synapse-orchestrator since only orchestrator spawns Task"
  - "has_actor boolean field added to audit log entries for attribution gap visibility"

patterns-established:
  - "Attribution section pattern: CRITICAL header + tool list with actor examples for every MCP tool"
  - "Heuristic attribution chain: actor -> assigned_agent -> tool-pattern heuristic -> unknown"

requirements-completed: [ABH-05]

# Metrics
duration: 5min
completed: 2026-03-07
---

# Phase 25 Plan 03: Audit Attribution & Session Summary

**Hardened actor attribution in 8 agent prompts with per-tool listings, enhanced audit-log.js with heuristic fallback and has_actor field, removed redundant synapse-audit.js, created session-summary.js for per-agent cost aggregation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T07:48:49Z
- **Completed:** 2026-03-07T07:54:11Z
- **Tasks:** 2
- **Files modified:** 14 (8 agent .md, 2 audit-log.js, 2 synapse-audit.js removed, 2 session-summary.js created)

## Accomplishments
- All 8 remaining agent prompts now have strengthened Attribution sections listing every MCP tool with explicit `actor` parameter
- audit-log.js enhanced with heuristic fallback (Task tool -> synapse-orchestrator) and `has_actor` boolean for gap visibility
- synapse-audit.js removed from both .claude/hooks/ and packages/framework/hooks/ (redundant with audit-log.js)
- session-summary.js created in both packages/framework/scripts/ and .claude/scripts/ with per-agent token counts, cost estimates, and attribution quality percentage

## Task Commits

Each task was committed atomically:

1. **Task 1: Strengthen actor attribution in 8 remaining agent prompts** - `9a71594` (feat)
2. **Task 2: Enhance audit-log.js, remove synapse-audit.js, create session-summary.js** - `ce54606` (feat)

## Files Created/Modified
- `packages/framework/agents/architect.md` - Strengthened Attribution section with 9 tools listed
- `packages/framework/agents/codebase-analyst.md` - Strengthened Attribution section with 7 tools listed
- `packages/framework/agents/debugger.md` - Strengthened Attribution section with 6 tools listed
- `packages/framework/agents/integration-checker.md` - Strengthened Attribution section with 9 tools listed
- `packages/framework/agents/plan-reviewer.md` - Strengthened Attribution section with 7 tools listed
- `packages/framework/agents/product-strategist.md` - Strengthened Attribution section with 8 tools listed
- `packages/framework/agents/researcher.md` - Strengthened Attribution section with 8 tools listed
- `packages/framework/agents/validator.md` - Strengthened Attribution section with 8 tools listed
- `.claude/hooks/audit-log.js` - Added heuristic fallback and has_actor field
- `packages/framework/hooks/audit-log.js` - Mirror of .claude/hooks/audit-log.js
- `.claude/hooks/synapse-audit.js` - REMOVED (redundant)
- `packages/framework/hooks/synapse-audit.js` - REMOVED (redundant)
- `packages/framework/scripts/session-summary.js` - NEW: NDJSON audit log aggregation
- `.claude/scripts/session-summary.js` - Mirror of framework session-summary.js

## Decisions Made
- Per-tool actor listing pattern: Attribution sections now list every MCP tool with explicit actor parameter example, replacing the generic "include actor" instruction
- Task tool heuristic: Task tool calls attributed to synapse-orchestrator since only orchestrator spawns the Task tool
- has_actor boolean field added to audit log entries to make attribution gap visibility explicit (true = explicit actor, false = heuristic/unknown)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Combined with Plan 25-01's changes to executor, decomposer, and synapse-orchestrator, all 11 agents now mandate actor on every MCP call
- session-summary.js ready for orchestrator integration at RPEV cycle completion
- Ready for E2E revalidation (Plan 25-04) to measure attribution improvement from 9% to target >=80%

## Self-Check: PASSED

All 14 files verified (10 modified, 2 removed, 2 created). Both commits (9a71594, ce54606) found in git log.

---
*Phase: 25-agent-behavior-hardening*
*Completed: 2026-03-07*
