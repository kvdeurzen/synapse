---
phase: 16-user-journey-commands
plan: 01
subsystem: commands
tags: [slash-commands, rpev, mcp, ollama, trust-config, project-init]

# Dependency graph
requires:
  - phase: 15-foundation
    provides: resolveConfig utility and project context injection via synapse-startup.js
provides:
  - /synapse:init slash command (project setup, RPEV config, DB registration)
  - /synapse:map slash command (Ollama health check, codebase indexing)
affects: [16-02, 16-03, 18-rpev-orchestration, 22-install-script]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Slash command authoring: frontmatter (name, description, allowed-tools) + Objective + numbered Process steps + Attribution"
    - "MCP tool calls use mcp__synapse__ prefix with actor: synapse-orchestrator for all calls"
    - "Anti-patterns section in command file explicitly documents what NOT to do"

key-files:
  created:
    - packages/framework/commands/synapse/init.md
    - packages/framework/commands/synapse/map.md
  modified: []

key-decisions:
  - "init.md explicitly states Ollama is NOT needed — only map.md requires it; anti-patterns section reinforces this"
  - "CLAUDE.md amendment is opt-in only — never silent modification, always requires explicit user consent"
  - "RPEV trust.toml section seeds proactive_notifications=false as a Phase 23 placeholder seeded during init"
  - "map.md stops immediately on Ollama absence — no partial indexing attempts"

patterns-established:
  - "Anti-patterns section: each command file explicitly lists what it must NOT do"
  - "Ollama gate: map.md checks both Ollama server AND nomic-embed-text model before calling index_codebase"
  - "RPEV involvement gradient: user-driven/co-pilot/advisory/autopilot per level with explicit_gate_levels"

requirements-completed: [CMD-01, CMD-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 16 Plan 01: User Journey Commands (init + map) Summary

**Slash commands /synapse:init and /synapse:map covering full project setup: interactive RPEV configuration writing trust.toml, LanceDB registration via init_project, and Ollama-gated codebase indexing via index_codebase**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T09:23:26Z
- **Completed:** 2026-03-05T09:25:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `/synapse:init` command: 10-step project setup flow with interactive RPEV per-layer involvement walkthrough, trust.toml seeding, init_project MCP call, CLAUDE.md opt-in, and skill auto-detection
- `/synapse:map` command: Ollama health check + nomic-embed-text model verification before calling index_codebase, with progress feedback and error recovery instructions
- Both commands include Attribution section with `actor: "synapse-orchestrator"` requirement for audit trail

## Task Commits

1. **Task 1: Create /synapse:init command** - `69feb5a` (feat)
2. **Task 2: Create /synapse:map command** - `41e558a` (feat)

## Files Created/Modified

- `packages/framework/commands/synapse/init.md` — 10-step project initialization: name detection, project.toml, RPEV config walkthrough, trust.toml [rpev] section, DB registration (no Ollama), CLAUDE.md opt-in, skill detection
- `packages/framework/commands/synapse/map.md` — Ollama health gate, nomic-embed-text model check, index_codebase with progress feedback, project_overview results display

## Decisions Made

- `init.md` Anti-Patterns section explicitly states "Do NOT check for Ollama during init" — this boundary is important because users can init without running Ollama
- `map.md` stops on either Ollama unreachable OR missing model — both are hard gates, not warnings
- RPEV defaults: project=user-driven, epic=co-pilot, feature=advisory, workpackage=autopilot with explicit_gate_levels=["project","epic"] matches the Phase 16 CONTEXT decisions
- `proactive_notifications = false` seeded in trust.toml as Phase 23 placeholder per CONTEXT decisions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/synapse:init` and `/synapse:map` are complete and follow the established command pattern
- These two commands form the project setup path; the next commands (/synapse:refine, /synapse:status, /synapse:focus) are handled in plans 16-02 and 16-03
- The RPEV trust.toml schema established here (`[rpev]` section with per-layer involvement gradient) will be read by the RPEV Orchestration engine in Phase 18

---
*Phase: 16-user-journey-commands*
*Completed: 2026-03-05*
