---
phase: 15-foundation
plan: 02
subsystem: infra
tags: [hooks, config-resolution, claude-hooks, settings-json, audit-log, tier-gate, tool-allowlist]

# Dependency graph
requires:
  - phase: 15-foundation-plan-01
    provides: resolveConfig() shared walk-up config resolver (packages/framework/hooks/lib/resolve-config.js)
provides:
  - Portable hook config resolution — tier-gate and tool-allowlist find config from any launch directory
  - Portable audit log path — audit-log.js derives project root from .synapse/config/ walk-up
  - Registered Synapse hooks in .claude/settings.json with $CLAUDE_PROJECT_DIR-prefixed bun commands
affects:
  - 15-foundation
  - 16-install-script
  - 17-commands
  - all phases that depend on hooks firing correctly

# Tech tracking
tech-stack:
  added: []
  patterns:
    - resolveConfig() is the canonical pattern for all .synapse/config/ lookups in hooks
    - Explicit null check before config file read — fail-closed on missing config
    - Project root derived from .synapse/config/project.toml path traversal (.dirname x3)
    - $CLAUDE_PROJECT_DIR prefix on all Synapse hook commands in settings.json

key-files:
  created: []
  modified:
    - packages/framework/hooks/tier-gate.js
    - packages/framework/hooks/tool-allowlist.js
    - packages/framework/hooks/audit-log.js
    - .claude/settings.json

key-decisions:
  - "Explicit null check for resolveConfig() return before readFileSync — ensures fail-closed with clear message vs confusing ENOENT"
  - "audit-log.js derives projectRoot via path.dirname x3 from project.toml path — walks .synapse/config/project.toml back to project root"
  - "audit-log.js fallback to CLAUDE_PROJECT_DIR || cwd for pre-init state — best-effort log path during /synapse:init session"
  - "precedent-gate.js left unmodified — confirmed reads no config files, advisory-only"

patterns-established:
  - "resolveConfig() import pattern: import { resolveConfig } from './lib/resolve-config.js' in all hooks that read .synapse/config/"
  - "Fail-closed null guard: if (!resolveConfig(file)) { deny(); exit(0); } before any readFileSync"
  - "Project root derivation from config path: path.dirname(path.dirname(path.dirname(configPath)))"

requirements-completed: [FOUND-03, FOUND-04]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 15 Plan 02: Foundation Summary

**Portable hook config resolution via resolveConfig() — tier-gate, tool-allowlist, and audit-log now work from any Claude Code launch directory, with all 5 Synapse hooks registered in .claude/settings.json**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T15:45:51Z
- **Completed:** 2026-03-03T15:47:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- tier-gate.js and tool-allowlist.js use resolveConfig() instead of hardcoded process.cwd() paths — hooks work from any launch directory including subdirectories
- audit-log.js derives project root from .synapse/config/project.toml path traversal, writing .synapse-audit.log at correct location regardless of CWD
- .claude/settings.json registers all 5 Synapse hooks (synapse-startup, tier-gate, tool-allowlist, precedent-gate, audit-log) using `bun $CLAUDE_PROJECT_DIR/...` format alongside existing GSD hooks

## Task Commits

Each task was committed atomically:

1. **Task 1: Update tier-gate.js and tool-allowlist.js to use resolveConfig** - `d44d69f` (feat)
2. **Task 2: Update audit-log.js project root detection and register all Synapse hooks in settings.json** - `690e334` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `packages/framework/hooks/tier-gate.js` - Added resolveConfig import; replaced hardcoded path.join(process.cwd(),...) with resolveConfig('trust.toml') + explicit null check
- `packages/framework/hooks/tool-allowlist.js` - Added resolveConfig import; replaced hardcoded path with resolveConfig('agents.toml') + explicit null check
- `packages/framework/hooks/audit-log.js` - Added resolveConfig import; replaced hardcoded logPath with project root derived from resolveConfig('project.toml') path traversal
- `.claude/settings.json` - Added PreToolUse event; registered all 5 Synapse hooks with $CLAUDE_PROJECT_DIR prefix; preserved all existing GSD hooks

## Decisions Made
- Added explicit null guard (`if (!trustTomlPath)`) before `readFileSync` in tier-gate and tool-allowlist — provides clearer "not found" error message vs confusing ENOENT, and keeps the fail-closed guarantee
- audit-log.js uses `CLAUDE_PROJECT_DIR || cwd` fallback when project.toml not found — ensures audit logging still works during initial `/synapse:init` session before .synapse/ exists
- precedent-gate.js left completely unmodified — confirmed it reads no config files; it provides advisory-only precedent reminders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three gate hooks now use portable config resolution — hooks fire correctly from any launch directory
- .claude/settings.json has all Synapse hooks registered — ready for Phase 16 (install script) to use as the template for generated settings
- Phase 17 (commands) can proceed in parallel with Phase 16 per the decision recorded in STATE.md

---
*Phase: 15-foundation*
*Completed: 2026-03-03*
