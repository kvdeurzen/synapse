---
phase: 13-agent-specialization-skill-trust
plan: "01"
subsystem: config
tags: [zod, toml, trust-matrix, agent-tools, config-validation, tier-authority]

# Dependency graph
requires:
  - phase: 12-orchestrator-bootstrap
    provides: "Zod config loaders for synapse.toml, trust.toml, agents.toml with anti-drift tests"
provides:
  - "TrustConfigSchema extended with tier_authority and agent_overrides fields"
  - "AgentsConfigSchema extended with allowed_tools per agent"
  - "config/trust.toml with [tier_authority] mapping all 10 agents to permitted decision tiers"
  - "config/agents.toml with explicit allowed_tools arrays for all 10 agents"
  - "8 new unit tests covering schema extensions, backward compat, and anti-drift validation"
affects:
  - "13-02 (agent markdown files — agents.toml is source of truth for allowed_tools)"
  - "13-03 (skill loader — agents.toml consumed for skill assignment)"
  - "14 (hook enforcement — agents.toml allowed_tools enforced by PreToolUse GATE hooks)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tier_authority: record of agent name to int[] (0-3) — maps who can store decisions at what tier"
    - "agent_overrides: per-agent domain autonomy overrides layered on top of global domain defaults"
    - "allowed_tools: explicit tool allowlist per agent in agents.toml — source of truth for Phase 14 enforcement"
    - "Zod .default({}) on record fields ensures backward-compatible empty-object defaults"

key-files:
  created: []
  modified:
    - "synapse-framework/src/config.ts"
    - "synapse-framework/config/trust.toml"
    - "synapse-framework/config/agents.toml"
    - "synapse-framework/test/unit/config.test.ts"

key-decisions:
  - "tier_authority uses z.record(z.string(), z.array(z.number().int().min(0).max(3))) — validates tier values 0-3 at schema level"
  - "agent_overrides uses nested object {domains: record} — allows per-agent domain autonomy overrides with optional domains key"
  - "allowed_tools defaults to [] — backward-compatible with existing agents.toml entries that omit the field"
  - "Researcher has no store_decision, create_task, update_task — deliberation via documents pattern"
  - "Debugger and Codebase Analyst have no Write/Edit — diagnostic/analysis only, Executor applies fixes"
  - "Validators and Plan Reviewer have update_task — direct authority to gate execution without orchestrator routing"

patterns-established:
  - "Anti-drift tests validate actual config files against extended Zod schemas — schema and file must stay in sync"
  - "agents.toml allowed_tools is verbose (individual tools listed) but unambiguous — no tool group indirection"

requirements-completed: [TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05, TRUST-06, ROLE-12]

# Metrics
duration: 9min
completed: 2026-03-02
---

# Phase 13 Plan 01: Trust-Knowledge Matrix and Agent Tool Boundaries Summary

**Extended Zod config schemas with tier_authority (agent->tier[]), agent_overrides, and allowed_tools; updated trust.toml and agents.toml with all 10 agents' decision authority and explicit tool allowlists**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-02T11:21:34Z
- **Completed:** 2026-03-02T11:30:34Z
- **Tasks:** 1 (TDD with RED/GREEN phases)
- **Files modified:** 4

## Accomplishments
- Extended TrustConfigSchema with `tier_authority` (z.record of agent->tier array validated 0-3) and `agent_overrides` (per-agent domain override map) with empty-object defaults for backward compatibility
- Extended AgentsConfigSchema with `allowed_tools: z.array(z.string()).default([])` per agent
- Added `[tier_authority]` section to trust.toml mapping all 10 agents to their permitted decision tiers (per CONTEXT.md locked decisions)
- Added `allowed_tools` arrays to all 10 agents in agents.toml with explicit tool lists enforcing: Researcher write-knowledge-not-decisions, Debugger/Analyst read-only, Validators/Plan Reviewer update_task authority
- Added 8 new unit tests (tier_authority acceptance, agent_overrides acceptance, invalid tier rejection, backward-compat defaults, allowed_tools acceptance, allowed_tools default, anti-drift trust.toml, anti-drift agents.toml)
- All 21 config tests pass; full test suite 55/55 pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Zod schemas and update config files for trust and agent tool boundaries** - `035d5ad` (feat)

**Plan metadata:** (pending final commit)

_Note: TDD task — RED phase (failing tests written first), GREEN phase (schemas and config updated to pass)_

## Files Created/Modified
- `synapse-framework/src/config.ts` - Extended TrustConfigSchema (tier_authority, agent_overrides) and AgentsConfigSchema (allowed_tools)
- `synapse-framework/config/trust.toml` - Added [tier_authority] section mapping all 10 agents to permitted tiers; commented agent_overrides example
- `synapse-framework/config/agents.toml` - Added allowed_tools arrays to all 10 agents (12-14 tools each)
- `synapse-framework/test/unit/config.test.ts` - Added 8 new tests for schema extensions, backward compat, and anti-drift validation

## Decisions Made
- `tier_authority` uses `z.array(z.number().int().min(0).max(3))` — tier values 0-3 validated at schema level, invalid values throw ConfigError
- `agent_overrides` has optional `domains` key per agent — keeps TOML syntax clean with `[agent_overrides.agent.domains]` subsections
- `allowed_tools` defaults to empty array — fully backward-compatible, no forced migration of existing agents.toml
- Researcher: no `store_decision`, `create_task`, `update_task` — deliberately constrained to documents-based deliberation pattern
- Debugger: no `Write`, `Edit` — diagnostic-only agent, separation of diagnosis from repair
- Codebase Analyst: no `Write`, `Edit` — analysis-only, results stored as documents
- Executor: `Write`, `Edit`, `Bash` included for full coding capability; constrained to Tier 3 decisions via tier_authority

## Deviations from Plan

None - plan executed exactly as written. TDD flow proceeded cleanly: RED (8 tests fail with undefined/TypeError), GREEN (schemas extended + config files updated → 21 tests pass).

## Issues Encountered

None - straightforward Zod schema extension with TOML config updates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- agents.toml `allowed_tools` is the source of truth for Phase 14 GATE hook enforcement — ready for consumption
- trust.toml `tier_authority` ready for agent system prompt injection (Phase 13 plan 03-04)
- Zod schemas validated and tested — anti-drift tests will catch any future config/schema divergence in CI

## Self-Check: PASSED

- FOUND: synapse-framework/src/config.ts
- FOUND: synapse-framework/config/trust.toml
- FOUND: synapse-framework/config/agents.toml
- FOUND: synapse-framework/test/unit/config.test.ts
- FOUND: commit 035d5ad

---
*Phase: 13-agent-specialization-skill-trust*
*Completed: 2026-03-02*
