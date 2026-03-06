---
phase: 22-install-script
plan: 02
subsystem: documentation
tags: [install-script, user-journey, configuration, troubleshooting, commands]

# Dependency graph
requires:
  - phase: 22-install-script
    provides: "Phase context and install.sh design decisions (CONTEXT.md, RESEARCH.md)"
  - phase: 21-agent-pool
    provides: "Agent pool feature (pool state, /synapse:focus agent, max_pool_slots)"
  - phase: 16-user-journey-commands
    provides: "5 slash commands (init, map, refine, status, focus)"
provides:
  - "Comprehensive usage manual covering installation, all 5 commands, all 4 config files, agent pool, and troubleshooting"
  - "Complete install.sh documentation including flags, modes (--local/--global), and re-install behavior"
  - "Configuration reference for project.toml, trust.toml, agents.toml, synapse.toml"
  - "Troubleshooting section for 6 common issues"
affects: [23-proactive-notifications, 24-e2e-validation, install-script-users]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - "docs/user-journey.md"

key-decisions:
  - "No decisions required — plan executed exactly as written"

patterns-established: []

requirements-completed: [INST-04]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 22 Plan 02: Install Script — Usage Manual Summary

**Comprehensive usage manual expanded from 174 to 633 lines covering install.sh (with flags, modes, and re-install behavior), all 5 slash commands with examples, all 4 config files with field explanations, the agent pool, and 6 troubleshooting scenarios**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T11:07:20Z
- **Completed:** 2026-03-06T11:10:10Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced skeleton user-journey.md (174 lines) with comprehensive usage manual (633 lines)
- Added full Installation section: one-liner, local vs global install modes, flags reference table, re-install behavior, and file layout diagram
- Added Configuration Reference covering all 4 config files: project.toml, trust.toml (full 16-entry involvement matrix + domain autonomy + max_pool_slots), agents.toml (all 11 agents described), synapse.toml (server connection)
- Expanded Command Reference for all 5 commands with purpose, syntax, bullet-point what-it-does, and example sessions
- Added Agent Pool section covering configuration, finish-first policy, viewing pool state via /synapse:status and /synapse:focus agent, and cancelling agents
- Added Troubleshooting section covering 6 issues: Ollama not running, smoke test failure, hooks not firing, MCP not connecting, missing project context, skills not loading
- Removed outdated caveats ("install.sh is part of Phase 17", "some features are planned")

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand docs/user-journey.md into comprehensive usage manual** - `c707316` (feat)

**Plan metadata:** (to be created)

## Files Created/Modified

- `/home/kanter/code/synapse/docs/user-journey.md` — Comprehensive usage manual: installation, commands, configuration, agent pool, troubleshooting (633 lines)

## Decisions Made

None — plan executed exactly as written. All sections, content, and style guidelines from the plan were followed directly.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- INST-04 requirement complete: usage manual documents the complete user journey from install to ongoing RPEV use
- All 5 slash commands documented with purpose, usage, and examples
- Configuration section documents all 4 config files with field explanations
- Troubleshooting section covers 6 most common issues
- install.sh flags and both install modes (--local, --global) documented
- Ready for Phase 22-03 (install.sh implementation, INST-01 through INST-03)

---
*Phase: 22-install-script*
*Completed: 2026-03-06*
