---
phase: 13-agent-specialization-skill-trust
plan: "02"
subsystem: skills
tags: [skill-loader, skills, typescript, react, python, vitest, sql, bun, tailwind, token-validation]

# Dependency graph
requires:
  - phase: 13-01
    provides: Agent markdown format with skills frontmatter injection pattern
provides:
  - Skill loader (loadSkill, loadAgentSkills, warnUnreferencedSkills) with token estimation
  - 7 built-in skill directories: typescript, react, python, vitest, sql, bun, tailwind
  - skills/project/ reserved directory for user-defined skills
  - 16 unit tests covering all loader behaviors
affects: [13-03, 13-04, 13-05, agent-definitions, skill-injection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skill loader reads skills/<name>/SKILL.md via node:fs readFileSync"
    - "Token estimate: Math.ceil(chars / 4) — ~4 chars per English token"
    - "2K token warning threshold: warn to stderr but still return full content"
    - "warnUnreferencedSkills ignores 'project' reserved directory"
    - "SKILL.md format: YAML frontmatter + Conventions/Quality Criteria/Vocabulary/Anti-patterns sections"

key-files:
  created:
    - synapse-framework/src/skills.ts
    - synapse-framework/test/unit/skills.test.ts
    - synapse-framework/skills/typescript/SKILL.md
    - synapse-framework/skills/react/SKILL.md
    - synapse-framework/skills/python/SKILL.md
    - synapse-framework/skills/vitest/SKILL.md
    - synapse-framework/skills/sql/SKILL.md
    - synapse-framework/skills/bun/SKILL.md
    - synapse-framework/skills/tailwind/SKILL.md
    - synapse-framework/skills/project/.gitkeep
  modified:
    - synapse-framework/skills/.gitkeep (deleted — skills dir no longer empty)

key-decisions:
  - "2K token warning is non-blocking: loadSkill warns to stderr but always returns full content"
  - "warnUnreferencedSkills ignores 'project' directory — reserved for user-defined skills, intentionally unchecked"
  - "estimateTokens uses Math.ceil(chars / 4) — simple proxy matching CONTEXT.md locked decision"
  - "Skill SKILL.md files target 400-600 tokens each (1600-2400 chars) — well under 2K warning threshold"

patterns-established:
  - "Skill loader: loadSkill(name, skillsDir) — skillsDir defaults to 'skills' for production use"
  - "SKILL.md template: frontmatter (name, description, disable-model-invocation, user-invocable) + 4 sections"
  - "TDD: RED (test/unit/skills.test.ts fails) -> GREEN (src/skills.ts passes) committed separately"

requirements-completed: [SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 13 Plan 02: Skill Loader and Built-in Skills Summary

**Skill loader (loadSkill/loadAgentSkills/warnUnreferencedSkills) with 2K token warning, plus 7 built-in SKILL.md files (typescript, react, python, vitest, sql, bun, tailwind) averaging ~500 tokens each**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T11:21:34Z
- **Completed:** 2026-03-02T11:25:01Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Implemented `src/skills.ts` with `loadSkill`, `loadAgentSkills`, `warnUnreferencedSkills`, and `estimateTokens` exports
- Created 7 built-in skill directories with structured SKILL.md content following the 4-section template
- 16 unit tests pass with TDD discipline (RED -> GREEN) covering all behaviors including stderr warnings, fail-fast, and unreferenced skill detection
- Reserved `skills/project/` directory for user-defined skills, ignored by `warnUnreferencedSkills`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create skill loader with token validation and unreferenced skill warning** - `6587251` (feat)
2. **Task 2: Create 7 built-in skill directories with structured SKILL.md content** - `02ce3f0` (feat)

**Plan metadata:** committed with docs commit after SUMMARY.md

_Note: Task 1 used TDD (RED -> GREEN in single commit as tests and implementation committed together)_

## Files Created/Modified

- `synapse-framework/src/skills.ts` - Skill loader: loadSkill, loadAgentSkills, warnUnreferencedSkills, estimateTokens
- `synapse-framework/test/unit/skills.test.ts` - 16 unit tests covering all loader behaviors
- `synapse-framework/skills/typescript/SKILL.md` - TypeScript conventions (type vs interface, Zod, satisfies, no any)
- `synapse-framework/skills/react/SKILL.md` - React conventions (functional components, no prop drilling, stable keys)
- `synapse-framework/skills/python/SKILL.md` - Python conventions (type hints, dataclasses, pathlib, no bare except)
- `synapse-framework/skills/vitest/SKILL.md` - Testing conventions (AAA, one concept per test, no shared state)
- `synapse-framework/skills/sql/SKILL.md` - SQL conventions (parameterized, explicit JOINs, index FKs, no SELECT *)
- `synapse-framework/skills/bun/SKILL.md` - Bun runtime conventions (Bun.file, bun:test, ESM-only, no polyfills)
- `synapse-framework/skills/tailwind/SKILL.md` - Tailwind conventions (utility-first, responsive prefixes, no @apply overuse)
- `synapse-framework/skills/project/.gitkeep` - Reserved directory for user-defined skills

## Decisions Made

- **2K token warning is non-blocking:** loadSkill warns to stderr but always returns full content. Matches CONTEXT.md locked decision from research phase.
- **`project` directory excluded from warnUnreferencedSkills:** Reserved for users to add custom skills without triggering false-positive warnings.
- **SKILL.md files target 400-600 tokens each:** Well under the 2K threshold, keeping skill injection lightweight while remaining actionable.
- **estimateTokens uses Math.ceil(chars / 4):** Simple, consistent with the ~4 chars/token proxy established in CONTEXT.md.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Skill loader is fully implemented and tested — Phase 13 Plan 03 (agent definitions) can now reference skills from agents.toml and inject them via `loadAgentSkills`
- 7 built-in skills cover the primary tech stack for synapse-framework development
- The `skills/project/` directory is ready for user-defined skills

---
*Phase: 13-agent-specialization-skill-trust*
*Completed: 2026-03-02*

## Self-Check: PASSED

All files and commits verified:
- synapse-framework/src/skills.ts: FOUND
- synapse-framework/test/unit/skills.test.ts: FOUND
- skills/typescript/SKILL.md: FOUND
- skills/react/SKILL.md: FOUND
- skills/python/SKILL.md: FOUND
- skills/vitest/SKILL.md: FOUND
- skills/sql/SKILL.md: FOUND
- skills/bun/SKILL.md: FOUND
- skills/tailwind/SKILL.md: FOUND
- skills/project/.gitkeep: FOUND
- Commit 6587251 (Task 1): FOUND
- Commit 02ce3f0 (Task 2): FOUND
