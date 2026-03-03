---
phase: 15-foundation
plan: 01
subsystem: hooks
tags: [toml, config-resolution, hooks, project-id, session-context, bun]

# Dependency graph
requires: []
provides:
  - "resolveConfig() walk-up config resolution utility (packages/framework/hooks/lib/resolve-config.js)"
  - "synapse-startup.js reads .synapse/config/project.toml and injects SYNAPSE PROJECT CONTEXT into additionalContext"
  - "project_id validation with clear error messages on malformed IDs"
  - "Hard-fail with /synapse:init guidance when project.toml is missing"
  - "Skill validation against SKILL.md files (warn, not fail)"
  - "DRY config resolution — trust.toml and agents.toml now use resolveConfig() instead of possibleRoots loop"
affects: [16-commands, 17-install, 18-mcp-frontmatter, 19-server-tools, 20-agent-wiring, 21-e2e, 22-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Walk-up config resolution: check .synapse/config/{filename} from CLAUDE_PROJECT_DIR up to filesystem root"
    - "Monorepo dev fallback: packages/framework/config/{filename} when no .synapse/config found"
    - "Hard-fail on missing project.toml with process.exit(0) — avoids blocking session start while still signaling error via additionalContext"
    - "TDD cycle: RED (failing tests) committed separately from GREEN (implementation)"

key-files:
  created:
    - packages/framework/hooks/lib/resolve-config.js
    - packages/framework/hooks/lib/resolve-config.test.js
  modified:
    - packages/framework/hooks/synapse-startup.js

key-decisions:
  - "Project context (SYNAPSE PROJECT CONTEXT block) is prepended before baseInstructions so project_id is the first thing agents see"
  - "Hard fail on missing project.toml via process.exit(0) with error in additionalContext — never block session with non-zero exit"
  - "Skills validation is warn-only (stderr warning, no fail) to avoid blocking sessions for misconfigured skills"
  - "Replaced possibleRoots loop in synapse-startup.js with resolveConfig() calls — DRY and consistent with project.toml resolution"

patterns-established:
  - "resolveConfig(filename): canonical way to find .synapse/config/ files; all hooks should use this"
  - "SYNAPSE PROJECT CONTEXT block format: separator lines, project_id, name, skills, IMPORTANT reminder line"

requirements-completed: [FOUND-01, FOUND-02]

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 15 Plan 01: Foundation — resolveConfig Utility and Project Context Injection Summary

**Walk-up .synapse/config/ resolver with TOML-backed project_id injection into every agent session via synapse-startup.js**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T15:40:52Z
- **Completed:** 2026-03-03T15:43:10Z
- **Tasks:** 2
- **Files modified:** 3 (1 created utility, 1 created test, 1 modified hook)

## Accomplishments

- Created `resolveConfig()` shared utility that walks up from `CLAUDE_PROJECT_DIR` (or cwd) checking `.synapse/config/{filename}` at each level, with monorepo dev fallback to `packages/framework/config/`
- Updated `synapse-startup.js` to read `.synapse/config/project.toml`, validate `project_id`, warn on missing skill SKILL.md files, and inject a structured `SYNAPSE PROJECT CONTEXT` block as the first thing in `additionalContext`
- Hard-fail behavior when `project.toml` is missing: stderr error + `additionalContext` error message directing user to `/synapse:init`, exits 0 to avoid blocking session

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests for resolveConfig** - `fbcc3c2` (test)
2. **Task 1 (GREEN): Implement resolveConfig() shared walk-up config resolver** - `6b99bb7` (feat)
3. **Task 2: Update synapse-startup.js to read project.toml and inject project context** - `c92cd2a` (feat)

_Note: TDD tasks have multiple commits (test RED -> feat GREEN)_

## Files Created/Modified

- `packages/framework/hooks/lib/resolve-config.js` — Walk-up config resolver, exports `resolveConfig(filename)`. Checks `.synapse/config/` from CLAUDE_PROJECT_DIR up to filesystem root; falls back to `packages/framework/config/`.
- `packages/framework/hooks/lib/resolve-config.test.js` — 7 bun:test tests covering: direct hit, walk-up from nested dir, monorepo fallback, null return, CLAUDE_PROJECT_DIR override, root stop condition, first-match-wins.
- `packages/framework/hooks/synapse-startup.js` — Updated to import `resolveConfig`, add `validateProjectId()`, read `project.toml`, validate `project_id`, warn on missing skills, inject SYNAPSE PROJECT CONTEXT block before `baseInstructions`. Replaced `possibleRoots` loop with `resolveConfig()` calls.

## Decisions Made

- Project context block is prepended before `baseInstructions` so `project_id` is the first thing agents see in their context
- Hard fail on missing `project.toml` uses `process.exit(0)` (not non-zero) to avoid blocking Claude Code session start — the error is surfaced via `additionalContext`
- Skills validation is warn-only so misconfigured skills don't block sessions
- `possibleRoots` loop replaced with `resolveConfig()` calls — DRY, consistent with project.toml resolution pattern

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `resolveConfig()` utility is ready for use by any other hook or script that needs to find `.synapse/config/` files
- `synapse-startup.js` now injects `project_id` automatically — agents will have project context from session start
- Phase 16 (commands) and Phase 17 (install script) can proceed in parallel as planned
- Phase 18 (MCP frontmatter) and Phase 19 (server tools) depend on project_id being in context — now unblocked

---
*Phase: 15-foundation*
*Completed: 2026-03-03*
