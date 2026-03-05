---
phase: 16-user-journey-commands
plan: 03
subsystem: commands
tags: [synapse, rpev, navigation, user-journey, slash-commands, documentation]

# Dependency graph
requires:
  - phase: 16-user-journey-commands
    provides: RPEV model design, command set decisions (init/map/refine/status/focus locked)

provides:
  - /synapse:focus command — navigation by fuzzy name search and path shorthand (2.3.1)
  - docs/user-journey.md — complete step-by-step flow from install to ongoing use (CMD-04)

affects:
  - 17-install-script (references install.sh placeholder in user journey)
  - 21-e2e-validation (focus command is part of e2e test scope)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP tool actor attribution: all tool calls include actor: synapse-orchestrator"
    - "Path shorthand pattern: N.N.N = priority-ordered index into task tree hierarchy"
    - "Command allowed-tools broad for focus: gateway command enables full interaction after navigation"

key-files:
  created:
    - packages/framework/commands/synapse/focus.md
    - docs/user-journey.md

key-decisions:
  - "Agent-based focus (/synapse:focus agent C) explicitly deferred to Agent Pool phase (Phase 21)"
  - "Path shorthand positions are not stable — always note they reflect current priority order"
  - "focus.md allowed-tools list is broad: once focused on an item, user may refine, create sub-items, or store decisions"

patterns-established:
  - "Command pattern: frontmatter (name, description, allowed-tools) + Objective + Process steps + Attribution"
  - "Deferred feature notation: explicitly name deferred patterns and provide user-facing fallback message"
  - "User journey doc covers both paths: new project and existing project"

requirements-completed: [CMD-04]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 16 Plan 03: Focus Command and User Journey Summary

**/synapse:focus navigation command with fuzzy name search and 2.3.1 path shorthand, plus complete user journey documentation from install to ongoing RPEV use**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T09:23:38Z
- **Completed:** 2026-03-05T09:25:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `/synapse:focus` command enabling navigation by semantic fuzzy name search (via `mcp__synapse__semantic_search`) and structural path shorthand (`2.3.1` = Epic 2, Feature 3, Work Package 1)
- Item context display shows RPEV status, decisions, related documents, and open questions once resolved
- Contextual actions adapt to item state: blocked items trigger inline decision engagement, refining items offer refinement resume, done items offer validation review
- Created `docs/user-journey.md` (CMD-04) covering prerequisites through ongoing use with the RPEV rhythm
- User journey covers both starting paths (new project and existing project) with command reference table

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /synapse:focus command** - `d2b06b4` (feat)
2. **Task 2: Write user journey documentation** - `916a714` (docs)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `packages/framework/commands/synapse/focus.md` — Navigation command: parse name vs path shorthand, resolve via semantic_search + task tree, display full item context, offer contextual actions, handle blocked item decision engagement
- `docs/user-journey.md` — Complete developer guide: prerequisites (Bun, Ollama, Claude Code), step-by-step flow (install → init → map → refine → status → focus), RPEV rhythm, key concepts, command reference table, two starting paths

## Decisions Made
- Agent-based focus (`/synapse:focus agent C`) explicitly deferred to Agent Pool phase (Phase 21); command provides a clear user-facing message when this pattern is attempted
- Path shorthand instability noted prominently: positions reflect current priority order and can change if items are reprioritized
- `allowed-tools` list for focus.md is broad (includes store_decision, create_task) because focus acts as a gateway — once on an item, users may want to work with it directly

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- All five `/synapse:*` commands are now authored (init, map, refine, status, focus)
- User journey document ties the full command set together for new adopters (CMD-04 complete)
- Phase 17 (install script) can proceed — `docs/user-journey.md` references `bash install.sh` placeholder
- Phase 21 (E2E validation) has all five commands as test targets

---
*Phase: 16-user-journey-commands*
*Completed: 2026-03-05*

## Self-Check: PASSED

- FOUND: packages/framework/commands/synapse/focus.md
- FOUND: docs/user-journey.md
- FOUND: .planning/phases/16-user-journey-commands/16-03-SUMMARY.md
- Commit d2b06b4 verified (feat: focus command)
- Commit 916a714 verified (docs: user journey)
