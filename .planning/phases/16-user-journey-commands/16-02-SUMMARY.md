---
phase: 16-user-journey-commands
plan: 02
subsystem: commands
tags: [slash-commands, rpev, brainstorming, decision-tracking, mcp-tools, status-dashboard]

# Dependency graph
requires:
  - phase: 16-user-journey-commands
    provides: Command authoring patterns, MCP tool signatures, RPEV model decisions (from 16-CONTEXT.md and 16-RESEARCH.md)
provides:
  - "/synapse:refine — primary RPEV brainstorm command with DECIDED/OPEN/EMERGING tracking and cross-session persistence"
  - "/synapse:status — RPEV dashboard with epics by priority, blocked items, agent pool stub, and suggested actions"
  - "Deletion of deprecated /synapse:new-goal command"
affects:
  - "16-user-journey-commands (16-03 user journey doc references refine and status)"
  - "18-rpev-orchestration (orchestrator fills in engine beneath these commands)"
  - "21-agent-pool (agent pool section in status.md is stubbed, awaiting this phase)"
  - "23-visibility-notifications (proactive push notifications deferred to this phase)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DECIDED/OPEN/EMERGING decision state tracking in brainstorm commands"
    - "doc_id versioning for cross-session refinement state continuity via store_document"
    - "check_precedent before store_decision — consistency gate pattern"
    - "Level-aware readiness gating: explicit user signal at Project/Epic level, lighter at Feature/WP"
    - "Phase stub pattern: clearly label deferred features with target phase number"

key-files:
  created:
    - packages/framework/commands/synapse/refine.md
  modified:
    - packages/framework/commands/synapse/status.md
  deleted:
    - packages/framework/commands/synapse/new-goal.md

key-decisions:
  - "/synapse:new-goal deleted — clean break, replaced entirely by /synapse:refine"
  - "DECIDED/OPEN/EMERGING are the three canonical decision states for refinement sessions"
  - "At Project and Epic level, user must explicitly signal readiness — no auto-transition to Plan"
  - "Refinement state persisted via store_document with doc_id reuse on resume (versioning not duplication)"
  - "Agent pool section in status.md explicitly stubbed with Phase 21 reference"

patterns-established:
  - "Refine command: load existing state → load context/precedents → brainstorm → track decisions → check readiness → persist state"
  - "Status command: get overview → get task tree → get recent context → check active refinements → present dashboard"
  - "All commands include Attribution section requiring actor: synapse-orchestrator on all MCP calls"

requirements-completed: [CMD-03]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 16 Plan 02: RPEV Commands (refine + status) Summary

**/synapse:refine brainstorm command with DECIDED/OPEN/EMERGING tracking and cross-session persistence, plus /synapse:status evolved into a full RPEV dashboard with blocked-item priority view**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T09:23:29Z
- **Completed:** 2026-03-05T09:25:29Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 1 rewritten, 1 deleted)

## Accomplishments
- Created `/synapse:refine` — the primary RPEV user interaction command implementing a full 9-step brainstorm + decision tracking flow with Socratic questioning, level-aware readiness gating, and cross-session state persistence via `store_document` with `doc_id` versioning on resume
- Evolved `/synapse:status` from a simple work-stream status display into a full RPEV dashboard showing epics by priority with RPEV stage indicators, a prominent "Needs Your Input" section for blocked items, agent pool stub (Phase 21), and suggested actions
- Deleted `/synapse:new-goal` — clean break per locked CONTEXT.md decision; its `check_precedent` and `get_smart_context` patterns are preserved in refine.md steps 3-4

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /synapse:refine command** - `ffccb9f` (feat)
2. **Task 2: Evolve /synapse:status into RPEV dashboard** - `edd4cf4` (feat)
3. **Task 3: Delete deprecated /synapse:new-goal** - `9bdda51` (chore)

## Files Created/Modified
- `packages/framework/commands/synapse/refine.md` - New primary RPEV brainstorm command (151 lines): scope detection, hierarchy level detection, state loading, context/precedent loading, Socratic brainstorming with DECIDED/OPEN/EMERGING tracking, level-aware readiness gate, state persistence, session close with Phase 18 stub
- `packages/framework/commands/synapse/status.md` - Rewritten as RPEV dashboard: epics by priority with RPEV stage badges, "Needs Your Input" blocked-items section, active refinement session surfacing, agent pool Phase 21 stub, recent decisions, suggested actions, empty-state handling
- `packages/framework/commands/synapse/new-goal.md` - Deleted

## Decisions Made
- Anti-patterns section added explicitly to refine.md — documents the four key "do NOT" behaviors (no auto-decisions for user, no skipping check_precedent, no auto-transition at Project/Epic level, always persist before session ends)
- status.md adds `mcp__synapse__semantic_search` to its allowed-tools list (needed to surface active refinement sessions) beyond what the plan frontmatter specified — this is a correctness addition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/synapse:refine` and `/synapse:status` are ready for immediate use in Claude Code sessions
- The engine beneath them (RPEV Orchestration Phase 18) will fill in the auto-trigger-to-plan behavior stubbed in refine.md step 9
- Agent pool display in status.md stubbed — will be filled in by Phase 21
- Proactive notification option (push vs pull) seeded in status.md design — full implementation in Phase 23

---
*Phase: 16-user-journey-commands*
*Completed: 2026-03-05*
