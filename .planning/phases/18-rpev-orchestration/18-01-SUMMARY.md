---
phase: 18-rpev-orchestration
plan: "01"
subsystem: config
tags: [toml, rpev, involvement-matrix, session-context, hooks, trust]

# Dependency graph
requires:
  - phase: 16-user-journey-commands
    provides: "RPEV seeding in trust.toml (proactive_notifications, explicit_gate_levels) and init.md scaffolding"
provides:
  - "Full RPEV involvement matrix in trust.toml [rpev.involvement] (16 entries)"
  - "[rpev.domain_overrides] section for per-domain escalation"
  - "synapse-startup.js reads and injects RPEV matrix into session additionalContext"
affects: [18-02-rpev-orchestration, 18-03-rpev-orchestration, 19-agent-spawn, 21-agent-pool]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TOML sub-table injection pattern: declare [rpev.involvement] and [rpev.domain_overrides] before [rpev] scalar keys to avoid smol-toml parse errors"
    - "Session context injection pattern: rpevContext follows tierContext pattern — declare variable at try/catch scope, build inside block, push to contextParts"

key-files:
  created: []
  modified:
    - packages/framework/config/trust.toml
    - packages/framework/hooks/synapse-startup.js

key-decisions:
  - "Flat underscore-separated keys (project_refine) in [rpev.involvement] — dotted keys create nested sub-tables in smol-toml"
  - "rpevContext built inside existing try/catch alongside tierContext — reuses trustToml already in scope, no separate try/catch needed"
  - "rpevContext condition uses trustToml.rpev (not trustToml && agentsToml) — RPEV matrix only requires trust.toml, not agents.toml"
  - "Domain overrides displayed only when non-empty — avoids cluttering session context with empty section header"

patterns-established:
  - "RPEV context injection: read from trust.toml, group by level, display as level: stage=mode pairs"
  - "TOML sub-table ordering: sub-tables ([rpev.involvement], [rpev.domain_overrides]) declared before parent [rpev] scalars"

requirements-completed: [RPEV-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 18 Plan 01: RPEV Involvement Matrix Summary

**16-entry RPEV involvement matrix added to trust.toml and injected into agent session context via synapse-startup.js, establishing the default project/epic/feature/work-package x refine/plan/execute/validate behavior gradient**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-05T15:51:27Z
- **Completed:** 2026-03-05T15:53:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- trust.toml [pev] section replaced with full RPEV configuration ([rpev.involvement], [rpev.domain_overrides], [rpev] scalars)
- 16-entry involvement matrix encoding default gradient: project=drives/co-pilot/monitors/monitors, epic=co-pilot/reviews/autopilot/monitors, feature=reviews/autopilot/autopilot/autopilot, work_package=all autopilot
- synapse-startup.js now builds and injects RPEV matrix section into session additionalContext following the same pattern as tierContext

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand trust.toml with RPEV involvement matrix** - `1ba42ba` (feat)
2. **Task 2: Inject RPEV involvement matrix via synapse-startup.js** - `7542be2` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `packages/framework/config/trust.toml` - Replaced [pev] with [rpev] sub-tables: [rpev.involvement] (16 entries), [rpev.domain_overrides] (empty with example), [rpev] scalars (gate levels, retry caps)
- `packages/framework/hooks/synapse-startup.js` - Added rpevContext variable and building logic inside existing try/catch, appended to contextParts after tierContext

## Decisions Made
- Flat underscore-separated keys (project_refine) in [rpev.involvement] rather than dotted keys — smol-toml treats dotted keys as nested sub-tables creating unnecessary nesting depth
- rpevContext condition checks trustToml.rpev rather than trustToml && agentsToml — RPEV matrix only requires trust.toml, giving graceful degradation even when agents.toml is absent
- Sub-tables declared before parent scalar keys to avoid smol-toml parse errors per TOML spec ordering requirement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RPEV involvement matrix is now the foundation for all subsequent Phase 18 plans
- Plan 18-02 can read trustToml.rpev.involvement to determine orchestration behavior at each level/stage
- Plan 18-03 can use rpevContext as the session context signal for gate enforcement
- The domain_overrides section is empty by default — projects can override involvement for specific domains (e.g., security_execute = "co-pilot")

---
*Phase: 18-rpev-orchestration*
*Completed: 2026-03-05*
