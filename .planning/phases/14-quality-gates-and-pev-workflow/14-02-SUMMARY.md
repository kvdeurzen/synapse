---
phase: 14-quality-gates-and-pev-workflow
plan: "02"
subsystem: hooks
tags: [audit, observability, hooks, token-estimation, tier-authority, trust-toml, agents-toml, startup-hook]

# Dependency graph
requires:
  - phase: 13-agent-specialization-skill-loading-trust
    provides: trust.toml tier_authority config and agents.toml registry
  - phase: 14-quality-gates-and-pev-workflow
    provides: Plan 01 gate hooks pattern, synapse-audit.js original audit hook

provides:
  - audit-log.js PostToolUse hook that logs ALL tool calls (not just Synapse MCP) with token estimates
  - synapse-startup.js enhanced with tier identity injection from trust.toml + agents.toml
  - hooks.test.ts expanded with 15 tests covering audit token estimates and startup tier context

affects:
  - phase 14 plan 03 (PEV workflow -- hooks now include full audit coverage)
  - settings.template.json PostToolUse config (Plan 14-01 Task 2 updates the hook reference)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tokenEstimate = Math.ceil(chars/4) for token cost estimation in hooks (matches skills.ts pattern)"
    - "Multi-root config resolution: try monorepo cwd, then packages/framework, then import.meta.url relative"
    - "Graceful degradation pattern: inner try/catch for config reads, outer try/catch for hook safety"

key-files:
  created:
    - packages/framework/hooks/audit-log.js
  modified:
    - packages/framework/hooks/synapse-startup.js
    - packages/framework/test/unit/hooks.test.ts

key-decisions:
  - "audit-log.js is a NEW file (not replacing synapse-audit.js) -- backward compatibility preserved"
  - "Multi-root path resolution for config files: checks cwd, packages/framework subdir, and import.meta.url relative -- handles running from monorepo root or package dir"
  - "Startup hook uses inner try/catch for config read so graceful degradation is isolated from base instructions"
  - "hooks.test.ts runs startup tests with PROJECT_ROOT cwd so trust.toml + agents.toml are resolvable"
  - "Reversed 'ignores non-Synapse tool calls' test to 'logs non-Synapse tool call' per GATE-05 expanded audit"

patterns-established:
  - "All-tool audit logging: PostToolUse hooks log every tool call regardless of namespace prefix"
  - "Token estimate fields: input_tokens and output_tokens added to every audit log entry"
  - "Config injection pattern: SessionStart hooks read TOML config and inject structured context blocks"

requirements-completed:
  - GATE-05
  - GATE-06

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 14 Plan 02: Audit Log and Startup Tier Identity Summary

**Expanded audit-log.js logs all tool calls with Math.ceil(chars/4) token estimates, and synapse-startup.js injects per-agent tier authority from trust.toml + agents.toml into SessionStart context**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T20:06:15Z
- **Completed:** 2026-03-02T20:09:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `audit-log.js` PostToolUse hook that logs ALL tool calls (Read, Write, Bash, mcp__synapse__*, etc.) with `input_tokens` and `output_tokens` token estimates per call using `Math.ceil(chars/4)`
- Enhanced `synapse-startup.js` to read `trust.toml` and `agents.toml` at session start and inject a structured "Agent Tier Authority" block listing each agent's tier constraints and permitted Synapse tools
- Updated `hooks.test.ts` with 15 tests (up from 10): reversed non-Synapse audit behavior, added token estimate assertions, added tier authority and Tier 0 warning startup tests, added graceful degradation test

## Task Commits

Each task was committed atomically:

1. **Task 1: Create expanded audit-log.js and update synapse-startup.js with tier identity** - `247a466` (feat)
2. **Task 2: Update hooks.test.ts with expanded audit and startup tier identity tests** - `a77e0ca` (test)

**Plan metadata:** (pending final docs commit)

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified
- `packages/framework/hooks/audit-log.js` - New PostToolUse hook logging ALL tool calls with token estimates; replaces synapse-audit.js scope per GATE-05
- `packages/framework/hooks/synapse-startup.js` - Enhanced SessionStart hook: reads trust.toml + agents.toml, injects tier authority block with graceful fallback
- `packages/framework/test/unit/hooks.test.ts` - 15 tests covering expanded audit (token estimates, non-Synapse logging) and startup tier injection

## Decisions Made
- `audit-log.js` is a NEW file alongside existing `synapse-audit.js` (not replacing it) -- backward compatibility preserved; settings.template.json PostToolUse reference update is in Plan 14-01 Task 2 to avoid parallel write conflicts
- Multi-root path resolution for config: tries `process.cwd()/config/`, then `cwd/packages/framework/config/`, then `import.meta.url` relative -- handles running from any directory in the monorepo
- Inner try/catch for config reads in startup hook isolates tier injection errors from base session start instructions (graceful degradation is isolated)
- Tests use `PROJECT_ROOT` (monorepo root) as cwd for startup tests so config files resolve correctly

## Deviations from Plan

None - plan executed exactly as written. The config path resolution uses three fallback roots (not specified in plan) but this was necessary for correctness and falls within Rule 2 (missing critical functionality).

## Issues Encountered
None - all implementations worked as expected on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `audit-log.js` is ready; settings.template.json PostToolUse update (pointing to audit-log.js) is in Plan 14-01 Task 2
- `synapse-startup.js` with tier identity injection is complete and tested
- Framework test suite passes (96/96 tests)
- Plan 14-03 (PEV workflow) can proceed

---
*Phase: 14-quality-gates-and-pev-workflow*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: packages/framework/hooks/audit-log.js
- FOUND: packages/framework/hooks/synapse-startup.js
- FOUND: packages/framework/test/unit/hooks.test.ts
- FOUND: .planning/phases/14-quality-gates-and-pev-workflow/14-02-SUMMARY.md
- FOUND commit 247a466 (Task 1: feat audit-log.js + synapse-startup.js tier identity)
- FOUND commit a77e0ca (Task 2: test hooks.test.ts expanded audit + tier tests)
- All 15 hooks.test.ts tests pass
- All 96 framework tests pass
