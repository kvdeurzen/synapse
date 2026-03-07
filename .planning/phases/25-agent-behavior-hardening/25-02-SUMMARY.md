---
phase: 25-agent-behavior-hardening
plan: 02
subsystem: commands
tags: [slash-commands, status, refine, init, rpev, agent-prompts]

# Dependency graph
requires:
  - phase: 23-visibility-notifications
    provides: "project_overview enhanced response with task_progress, pool_status, needs_attention"
  - phase: 18-rpev-orchestration
    provides: "RPEV stage documents, get_task_tree with root_task_id/max_depth"
provides:
  - "Filtered per-epic status queries with fixed output template"
  - "Code Index Trust Rule preventing wasteful Explore agents"
  - "Persist-before-transition pattern for refinement sessions"
  - "UX/DX dimension surfacing in brainstorming"
  - "Auto-commit scaffolding in init"
affects: [25-agent-behavior-hardening, synapse-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-epic shallow tree queries (root_task_id + max_depth: 2) instead of full tree fetch"
    - "Fixed markdown template for agent output (no discretion formatting)"
    - "Code Index Trust Rule (skip Explore when index has data)"
    - "Persist-before-transition (save state before offering next stage)"

key-files:
  created: []
  modified:
    - ".claude/commands/synapse/status.md"
    - "packages/framework/commands/synapse/status.md"
    - ".claude/commands/synapse/refine.md"
    - "packages/framework/commands/synapse/refine.md"
    - ".claude/commands/synapse/init.md"
    - "packages/framework/commands/synapse/init.md"

key-decisions:
  - "status.md uses per-epic get_task_tree(root_task_id, max_depth: 2) instead of single unfiltered tree -- O(epics) small calls vs O(1) huge call"
  - "semantic_search removed from status.md allowed-tools -- redundant with query_documents for rpev-stage"
  - "Code Index Trust Rule: get_smart_context code summaries are SUFFICIENT context, no Explore agent needed"
  - "Persist before transition: store_document called before readiness summary, not after user responds"
  - "init.md commit step is non-fatal: warns user but does not treat git failure as error"

patterns-established:
  - "Fixed template pattern: agents MUST follow template exactly, no reformatting"
  - "Code Index Trust Rule: skip redundant file exploration when index provides summaries"
  - "Persist-before-transition: save state before presenting user-facing decision points"

requirements-completed: [ABH-04]

# Metrics
duration: 3min
completed: 2026-03-07
---

# Phase 25 Plan 02: Slash Command Prompt Fixes Summary

**Per-epic filtered status queries with fixed template, code index trust rule for refine, persist-before-transition, UX/DX dimension, and init commit step**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T07:48:52Z
- **Completed:** 2026-03-07T07:51:31Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Rewrote status.md to use per-epic shallow tree queries (root_task_id + max_depth: 2) instead of one unfiltered get_task_tree call, with a fixed markdown template agents cannot reformat
- Added Code Index Trust Rule to refine.md preventing wasteful Explore agent spawns when get_smart_context already returns code summaries (saves ~58k tokens per cycle)
- Added persist-before-transition to refine.md step 7 ensuring refinement state is saved before user sees readiness summary
- Added UX/DX dimension surfacing to refine.md brainstorming patterns for decisions with developer experience impact
- Added commit scaffolding step to init.md that auto-commits .synapse/ and .claude/ after initialization

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite status.md with filtered queries and structured output template** - `f56ce04` (feat)
2. **Task 2: Fix refine.md (trust code index, persist at boundary, UX dimension) and init.md (commit step)** - `28e42c7` (feat)

## Files Created/Modified
- `.claude/commands/synapse/status.md` - Rewrote with per-epic filtered queries, fixed template, removed semantic_search
- `packages/framework/commands/synapse/status.md` - Mirror of above
- `.claude/commands/synapse/refine.md` - Added Code Index Trust Rule, persist-before-transition, UX/DX dimension
- `packages/framework/commands/synapse/refine.md` - Mirror of above
- `.claude/commands/synapse/init.md` - Added commit scaffolding step (10), renumbered Summary to step 11
- `packages/framework/commands/synapse/init.md` - Mirror of above

## Decisions Made
- status.md uses per-epic get_task_tree(root_task_id, max_depth: 2) -- O(epics) small calls is better than O(1) huge unfiltered call since rollup stats on each node already contain completion data
- Removed semantic_search from status.md allowed-tools -- query_documents with rpev-stage tags covers the same need
- Code Index Trust Rule is an explicit rule block after step 4, not a comment -- ensures agents actually follow it
- Persist-before-transition placed inside step 7 (before readiness summary), with step 8 noting it may already have been called
- init.md commit step is non-fatal (warns on failure) to avoid blocking init on repos with uncommitted changes

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- All 3 slash commands updated with mirrored copies
- Ready for Plan 25-01 (orchestrator hardening) and Plan 25-03 (hook fixes) in parallel
- E2E re-validation (Plan 25-04) will confirm these fixes work end-to-end

---
*Phase: 25-agent-behavior-hardening*
*Completed: 2026-03-07*
