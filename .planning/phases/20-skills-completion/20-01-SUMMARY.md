---
phase: 20-skills-completion
plan: 01
subsystem: framework
tags: [skills, agents, startup-hook, context-injection, agents.toml, role-skills]

# Dependency graph
requires:
  - phase: 15-foundation
    provides: synapse-startup.js hook pattern and resolveConfig utility
  - phase: 19-agent-prompts
    provides: agents.toml agent registry with final tool lists
provides:
  - "Dynamic skill manifest injected into additionalContext by synapse-startup.js"
  - "role_skills two-layer model in agents.toml (project.toml skills + per-agent role_skills)"
  - "All 10 agents updated with role_skills per CONTEXT.md assignment matrix"
  - "Empty project/ skill directory removed"
affects: [20-02-skills-content, 21-agent-pool, 22-install-script]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skill manifest build: project skills first (project.toml order), role-only skills alphabetically, de-duplicated"
    - "skillContext appended to contextParts after domainContext — same pattern as tierContext/rpevContext/domainContext"
    - "Warn-only on missing SKILL.md — never fail session start on missing skills"
    - "role_skills field in agents.toml is always additive — no override semantics"

key-files:
  created: []
  modified:
    - packages/framework/hooks/synapse-startup.js
    - packages/framework/config/agents.toml
    - packages/framework/src/config.ts
    - packages/framework/agents/architect.md
    - packages/framework/agents/decomposer.md
    - packages/framework/agents/executor.md
    - packages/framework/agents/validator.md
    - packages/framework/agents/integration-checker.md
    - packages/framework/agents/debugger.md
    - packages/framework/agents/codebase-analyst.md

key-decisions:
  - "Project skills listed before role skills in manifest (project.toml order first, then alphabetical)"
  - "role_skills replaces skills in agents.toml entirely — skills field removed from all agent entries"
  - "AgentsConfigSchema updated to include role_skills field with default [] — allows loadAgentsConfig callers to access role_skills"
  - "Agent markdown skills: frontmatter removed from 7 agents to match agents.toml (no skills field)"

patterns-established:
  - "skillContext block: placed after domainContext, before final contextParts.join()"
  - "role_skills in agents.toml: simple array, not sub-table — TOML ordering safe"

requirements-completed: [SKILL-01, SKILL-02]

# Metrics
duration: 15min
completed: 2026-03-05
---

# Phase 20 Plan 01: Skills Completion - Dynamic Injection Summary

**Dynamic skill manifest injected into agent additionalContext via synapse-startup.js, using project.toml skills + agents.toml role_skills two-layer model**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-05T22:00:00Z
- **Completed:** 2026-03-05T22:15:00Z
- **Tasks:** 2
- **Files modified:** 11 (including 7 agent markdown files + deletion of project/.gitkeep)

## Accomplishments
- Skill manifest builder added to synapse-startup.js — reads project.toml skills + agents.toml role_skills, builds compact manifest with descriptions from SKILL.md frontmatter, injects into additionalContext
- All 10 agents in agents.toml migrated from hardcoded `skills = [...]` to `role_skills = [...]` per CONTEXT.md assignment matrix
- Empty `packages/framework/skills/project/` directory deleted
- AgentsConfigSchema updated to include `role_skills` field
- Skills frontmatter removed from 7 agent markdown files (architect, decomposer, executor, validator, integration-checker, debugger, codebase-analyst)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add skill manifest builder to synapse-startup.js** - `d12dd45` (feat)
2. **Task 2: Replace hardcoded skills with role_skills in agents.toml** - `1ae66bf` (feat)

**Plan metadata:** _(to be added after final commit)_

## Files Created/Modified
- `packages/framework/hooks/synapse-startup.js` - Added skillContext block after domainContext; reads project.toml skills + agents.toml role_skills, builds manifest with SKILL.md descriptions, appends to contextParts
- `packages/framework/config/agents.toml` - All 10 agents: removed `skills = [...]`, added `role_skills = [...]` per CONTEXT.md matrix
- `packages/framework/src/config.ts` - AgentsConfigSchema extended with `role_skills: z.array(z.string()).default([])`
- `packages/framework/agents/architect.md` - Removed `skills: [typescript]` from frontmatter
- `packages/framework/agents/decomposer.md` - Removed `skills: [typescript]` from frontmatter
- `packages/framework/agents/executor.md` - Removed `skills: [typescript, bun]` from frontmatter
- `packages/framework/agents/validator.md` - Removed `skills: [typescript, vitest]` from frontmatter
- `packages/framework/agents/integration-checker.md` - Removed `skills: [typescript]` from frontmatter
- `packages/framework/agents/debugger.md` - Removed `skills: [typescript, vitest]` from frontmatter
- `packages/framework/agents/codebase-analyst.md` - Removed `skills: [typescript]` from frontmatter
- `packages/framework/skills/project/.gitkeep` - Deleted (empty directory removed)

## Decisions Made
- **Project skills first in manifest:** Project.toml skills listed before role-only skills, matching user's mental model of "what stack am I on" before "what roles are available"
- **De-duplication:** Skills in both project.toml and role_skills are listed once under project skills (no duplicate entry)
- **AgentsConfigSchema extended:** Added `role_skills` field to schema so `loadAgentsConfig()` callers receive the field — prevents silent stripping by Zod
- **Agent markdown skills frontmatter removed:** Aligns with test 10 in agents-integration.test.ts which checks that agents with no `skills` in TOML have no `skills:` in frontmatter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated AgentsConfigSchema to include role_skills**
- **Found during:** Task 2 (agents.toml update)
- **Issue:** AgentsConfigSchema in config.ts had no `role_skills` field — Zod would silently strip `role_skills` from parsed configs, making it unavailable to any code using `loadAgentsConfig()`
- **Fix:** Added `role_skills: z.array(z.string()).default([])` to the per-agent object schema
- **Files modified:** packages/framework/src/config.ts
- **Verification:** Framework tests still pass at same count (no regressions)
- **Committed in:** 1ae66bf (Task 2 commit)

**2. [Rule 1 - Bug] Removed skills: frontmatter from 7 agent markdown files**
- **Found during:** Task 2 (agents.toml update)
- **Issue:** Test 10 in agents-integration.test.ts checks that agents with no `skills` in TOML (after removing `skills = [...]`) must NOT have `skills:` in frontmatter — 7 agent files had stale `skills:` frontmatter that would fail this test
- **Fix:** Removed `skills: [...]` line from frontmatter of architect, decomposer, executor, validator, integration-checker, debugger, codebase-analyst
- **Files modified:** 7 agent markdown files
- **Verification:** Framework tests pass at same count
- **Committed in:** 1ae66bf (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. Schema fix ensures callers can access role_skills. Frontmatter fix prevents test regression. No scope creep.

## Issues Encountered
- Pre-existing test failures (6 failures): 5 hooks.test.ts failures due to missing .synapse/config/project.toml in test environment (hook exits silently with no output), 1 agents-integration test 3 failure (executor.md tools frontmatter missing store_document and link_documents vs agents.toml). All pre-existing, none introduced by this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Skill injection infrastructure complete — project.toml `skills` + agents.toml `role_skills` feed into `additionalContext` manifest
- Plan 20-02 can now build on this: flesh out existing skill files (tailwind, python, sql) and author 6 new generic skill files (brainstorming, testing-strategy, architecture-design, security, defining-requirements, documentation) — the manifest builder will pick them up automatically
- Install script (Phase 22) needs to copy `packages/framework/skills/` to `.claude/skills/` — skill paths in startup hook reference `.claude/skills/` relative to projectRoot

## Self-Check: PASSED

- [x] SUMMARY.md exists at `.planning/phases/20-skills-completion/20-01-SUMMARY.md`
- [x] Task 1 commit d12dd45 exists in git log
- [x] Task 2 commit 1ae66bf exists in git log
- [x] `packages/framework/hooks/synapse-startup.js` exists and contains 4 occurrences of `skillContext`
- [x] `packages/framework/config/agents.toml` has 0 hardcoded `skills = ` lines, 10 `role_skills` lines
- [x] `packages/framework/skills/project/` directory deleted
- [x] Framework tests: 97 pass, 6 fail (same pre-existing failures, no regressions)

---
*Phase: 20-skills-completion*
*Completed: 2026-03-05*
