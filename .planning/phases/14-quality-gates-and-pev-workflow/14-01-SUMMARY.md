---
phase: 14-quality-gates-and-pev-workflow
plan: "01"
subsystem: hooks
tags: [hooks, trust, tier-authority, allowlist, PreToolUse, fail-closed, smol-toml]

# Dependency graph
requires:
  - phase: 13-quality-gates-and-pev-workflow
    provides: trust.toml tier_authority config and agents.toml allowed_tools config
  - phase: 12-agent-framework
    provides: hook pattern (synapse-audit.js, synapse-startup.js as reference implementations)
provides:
  - tier-gate.js PreToolUse hook enforcing tier authority with fail-closed behavior
  - tool-allowlist.js PreToolUse hook enforcing per-agent Synapse MCP tool boundaries
  - precedent-gate.js PreToolUse hook injecting check_precedent advisory reminder
  - 21 unit tests covering deny/allow/ask/error scenarios for all three hooks
  - settings.template.json wired with PreToolUse matchers and updated PostToolUse
affects: [14-02-audit-log, 14-03-pev-workflow, 14-04-wave-controller]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed enforcement hooks: top-level try/catch outputs deny JSON on any error"
    - "Exit 0 silently for allow (no stdout output), structured JSON stdout for deny/ask"
    - "Most-restrictive-wins: deny > ask > allow when multiple hooks run on same event"
    - "Specific matcher listed before broad matcher in PreToolUse array for correct ordering"
    - "Advisory hook (precedent-gate) fails open; enforcement hooks (tier-gate, tool-allowlist) fail closed"
    - "spawnSync with project root cwd so hooks can resolve config file paths"

key-files:
  created:
    - packages/framework/hooks/tier-gate.js
    - packages/framework/hooks/tool-allowlist.js
    - packages/framework/hooks/precedent-gate.js
    - packages/framework/test/unit/gate-hooks.test.ts
  modified:
    - packages/framework/settings.template.json

key-decisions:
  - "precedent-gate fails open on error (advisory, not enforcement) — exit 0 silently vs deny"
  - "tier-gate checks tier === 0 BEFORE loading trust.toml — Tier 0 always requires ask regardless of actor"
  - "tool-allowlist uses empty string actor '' as unknown actor — denied by fail-closed logic"
  - "PostToolUse updated to audit-log.js with no matcher, consolidated from Plan 14-02 to avoid parallel write conflict"

patterns-established:
  - "Enforcement hooks output deny JSON to stdout and exit 0 — never exit non-zero"
  - "Config paths use packages/framework/config/ prefix since hooks run from project root"
  - "GATE-07 most-restrictive-wins verified by testing individual hook outputs independently"

requirements-completed: [GATE-01, GATE-02, GATE-03, GATE-04, GATE-06, GATE-07]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 14 Plan 01: Quality Gates Enforcement Hooks Summary

**Three fail-closed PreToolUse hooks (tier-gate, tool-allowlist, precedent-gate) with 21 unit tests and settings.template.json wiring — enforcing tier authority and Synapse tool boundaries per trust.toml and agents.toml**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T20:06:10Z
- **Completed:** 2026-03-02T20:09:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Three PreToolUse hooks created: tier-gate enforces tier authority (deny/ask/allow), tool-allowlist enforces Synapse MCP tool boundaries, precedent-gate injects advisory check_precedent reminder
- All enforcement hooks fail-closed: malformed JSON, missing config, unknown actor, or any exception results in deny
- 21 unit tests with spawnSync pattern and project root cwd so config paths resolve correctly
- settings.template.json updated with PreToolUse matchers (specific before broad) and PostToolUse consolidated to audit-log.js with no matcher

## Task Commits

Each task was committed atomically:

1. **Task 1: Create three PreToolUse enforcement hooks** - `adf69ea` (feat)
2. **Task 2: Wire settings.template.json** - `f0b0fab` (feat)

## Files Created/Modified
- `packages/framework/hooks/tier-gate.js` - PreToolUse hook enforcing tier authority; returns ask for Tier 0, deny for unauthorized tiers, allows authorized access
- `packages/framework/hooks/tool-allowlist.js` - PreToolUse hook enforcing Synapse MCP tool allowlists per agent; passes non-Synapse tools silently
- `packages/framework/hooks/precedent-gate.js` - Advisory PreToolUse hook injecting check_precedent reminder before store_decision
- `packages/framework/test/unit/gate-hooks.test.ts` - 21 unit tests covering all three hooks with deny/allow/ask/error scenarios
- `packages/framework/settings.template.json` - Updated with PreToolUse section (two matchers) and consolidated PostToolUse (audit-log.js, no matcher)

## Decisions Made
- precedent-gate fails open on error (advisory hook) while tier-gate and tool-allowlist fail closed (enforcement hooks)
- tier-gate checks tier === 0 before loading trust.toml — Tier 0 always requires "ask" regardless of actor identity
- PostToolUse updated here (consolidated from Plan 14-02) to avoid parallel file write conflict in Wave 1

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three enforcement hooks wired and tested — ready for audit-log.js (Plan 14-02)
- settings.template.json references audit-log.js which Plan 14-02 will create
- Plan 14-02 can focus purely on the audit log hook without touching settings.template.json

---
*Phase: 14-quality-gates-and-pev-workflow*
*Completed: 2026-03-02*
