---
phase: 23-visibility-notifications
plan: 01
subsystem: ui
tags: [statusline, rpev, ansi, hooks, orchestrator]

# Dependency graph
requires:
  - phase: 21-agent-pool
    provides: pool-state document schema (pool-state-[project_id])
  - phase: 18-rpev-orchestration
    provides: RPEV stage document pattern (rpev-stage-[task_id])
  - phase: 16-user-journey-commands
    provides: trust.toml with proactive_notifications placeholder
provides:
  - RPEV progress section in Claude Code statusline (synapse-statusline.js rpevSection)
  - Statusline state file protocol in orchestrator (statusline.json schema + write triggers)
affects:
  - 23-visibility-notifications (plans 02+)
  - synapse-orchestrator agent behavior

# Tech tracking
tech-stack:
  added: []
  patterns:
    - State file pattern for statusline data (orchestrator writes, hook reads)
    - try/catch silent fallback for hook resilience
    - ANSI blinking (5;31m) vs dim (2m) for configurable notification styling

key-files:
  created: []
  modified:
    - packages/framework/hooks/synapse-statusline.js
    - packages/framework/agents/synapse-orchestrator.md

key-decisions:
  - "State file approach (.synapse/state/statusline.json) chosen for statusline data — synchronous readFileSync on <1KB file is effectively instantaneous, no async complexity needed"
  - "proactive_notifications=true uses ANSI blink (\\x1b[5;31m), false uses dim (\\x1b[2m) — visual-only, no terminal bell"
  - "projectRoot derived from path.dirname(path.dirname(projectTomlPath)) — goes up from .synapse/config/ to project root"
  - "Blocked counter uses Unicode \\u26a0 (warning triangle) for approval-needed and \\u2718 (heavy ballot X) for failed — matches plan spec"

patterns-established:
  - "Statusline RPEV section: try/catch wraps entire block so any failure silently degrades to current behavior"
  - "Trust.toml proactive_notifications drives binary blinking/dim styling for blocked counter"
  - "Orchestrator writes statusline.json after every RPEV state change — step 7 in On Task Completion and Session Start Recovery"

requirements-completed: [VIS-01]

# Metrics
duration: 1min
completed: 2026-03-06
---

# Phase 23 Plan 01: Visibility + Notifications — Statusline RPEV Progress Summary

**RPEV progress in Claude Code statusline via orchestrator-written state file: epic title + task counts, pool status, configurable blocked counter (blinking vs dim)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-06T14:12:41Z
- **Completed:** 2026-03-06T14:14:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Statusline hook reads `.synapse/state/statusline.json` and renders RPEV progress (epic title + done/total, pool active/total, blocked counter with approval + failed counts)
- `proactive_notifications` from trust.toml drives blinking-red vs dim styling for the blocked counter
- Missing or corrupt state file causes silent fallback to existing statusline behavior (no crash, no empty output)
- Orchestrator agent has explicit state file write protocol: schema, when-to-write triggers (stage transitions, pool updates, task status changes, session recovery), and computation instructions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend statusline hook with RPEV progress section** - `873ca0e` (feat)
2. **Task 2: Add state file write protocol to orchestrator agent** - `4247499` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `packages/framework/hooks/synapse-statusline.js` - Added RPEV progress section: reads statusline.json, builds epic/pool/blocked display, integrates into final stdout.write
- `packages/framework/agents/synapse-orchestrator.md` - Added Statusline State File Protocol section; added step 7 to On Task Completion and Session Start Recovery

## Decisions Made
- **State file approach chosen:** synchronous `fs.readFileSync` on the <1KB statusline.json file is effectively instantaneous (<1ms). The existing 3-second overall hook timeout is sufficient; no separate async timeout needed. This simplifies the implementation vs. async MCP query.
- **projectRoot derivation:** `path.dirname(path.dirname(projectTomlPath))` — goes up two levels from `.synapse/config/project.toml` to project root. This ensures the state file path is always relative to the project, not the hook's install location.
- **Blocked counter Unicode:** `\u26a0` (warning triangle ⚠) for approval-pending items, `\u2718` (heavy ballot X ✘) for failed items — provides type-at-a-glance in the compact statusline display.
- **ANSI styling:** proactive_notifications=true → `\x1b[5;31m` (blinking red); false → `\x1b[2m` (dim/gray). Visual-only, no terminal bell or system notification.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The `.synapse/state/statusline.json` file will be created automatically by the orchestrator when RPEV workflows are active.

## Next Phase Readiness

- Statusline RPEV section is complete and ready for live use once the orchestrator begins writing state files
- Phase 23 Plan 02 (project_overview enhancements) can proceed independently — no dependency on Plan 01 artifacts
- The `.synapse/state/` directory convention is established; future phases can add additional state files if needed

---
*Phase: 23-visibility-notifications*
*Completed: 2026-03-06*
