---
phase: 20-skills-completion
plan: 02
subsystem: framework
tags: [skills, agents, language-agnostic, rust, go, python, testing, security, architecture, brainstorming, documentation]

# Dependency graph
requires:
  - phase: 20-01
    provides: skill manifest injection infrastructure; agents.toml role_skills field
provides:
  - 18 SKILL.md files with 5-section format (Conventions, Quality Criteria, Vocabulary, Anti-patterns, Commands)
  - 11 new skills (rust, cargo-test, go, go-test, pytest, testing-strategy, architecture-design, security, brainstorming, defining-requirements, documentation)
  - 7 existing skills updated with Commands sections and thin skills expanded
  - 7 agent prompts made language-agnostic (no hardcoded .ts or bun test)
affects: [all future agents using skill injection, executor, validator, integration-checker, decomposer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SKILL.md format: 5 sections (Conventions, Quality Criteria, Vocabulary, Anti-patterns, Commands) at 60-100 lines"
    - "Generic skills cite community sources in line (ratacat, claude-cortex, TechnickAI, Fowler, etc.)"
    - "Agent test commands use {test_command} placeholder referencing project's testing skill"
    - "Language skills provide Commands section so agents discover test/build commands from skill, not hardcoded"

key-files:
  created:
    - packages/framework/skills/rust/SKILL.md
    - packages/framework/skills/cargo-test/SKILL.md
    - packages/framework/skills/go/SKILL.md
    - packages/framework/skills/go-test/SKILL.md
    - packages/framework/skills/pytest/SKILL.md
    - packages/framework/skills/testing-strategy/SKILL.md
    - packages/framework/skills/architecture-design/SKILL.md
    - packages/framework/skills/security/SKILL.md
    - packages/framework/skills/brainstorming/SKILL.md
    - packages/framework/skills/defining-requirements/SKILL.md
    - packages/framework/skills/documentation/SKILL.md
  modified:
    - packages/framework/skills/typescript/SKILL.md
    - packages/framework/skills/bun/SKILL.md
    - packages/framework/skills/vitest/SKILL.md
    - packages/framework/skills/react/SKILL.md
    - packages/framework/skills/python/SKILL.md
    - packages/framework/skills/tailwind/SKILL.md
    - packages/framework/skills/sql/SKILL.md
    - packages/framework/agents/decomposer.md
    - packages/framework/agents/executor.md
    - packages/framework/agents/validator.md
    - packages/framework/agents/integration-checker.md
    - packages/framework/agents/researcher.md

key-decisions:
  - "Agent test command references: {test_command} placeholder points to project's testing skill (not hardcoded bun test)"
  - "MCP tool call examples in agents retain domain context (JWT, auth) — only file extensions and tool commands changed"
  - "store_document example VALUES in researcher.md keep test file paths — they demonstrate content format, not prescribe names"
  - "Existing skills that just need Commands added: target ~50 lines; thin skills being expanded: target 60-100 lines"
  - "Generic skills cite community sources inline for each convention and anti-pattern"

patterns-established:
  - "SKILL.md 5-section format: every skill has Conventions, Quality Criteria, Vocabulary, Anti-patterns, Commands"
  - "Language-agnostic agent prompts: instructions use generic descriptions; skills provide language-specific commands"
  - "Community sourcing for generic skills: cursor rules repos, Claude Code skills, awesome-cursorrules as primary sources"
  - "Test command discovery: agents read the project's testing skill to find the correct test runner command"

requirements-completed: [SKILL-03, SKILL-04, SKILL-05]

# Metrics
duration: 16min
completed: 2026-03-05
---

# Phase 20 Plan 02: Skills Completion Summary

**Language-agnostic agent prompts and 18 skills with 5-section format covering TypeScript, Python, Rust, Go, and 6 generic disciplines sourced from community cursor rules**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-05T21:18:50Z
- **Completed:** 2026-03-05T21:34:44Z
- **Tasks:** 2
- **Files modified:** 23 (7 agents + 7 updated skills + 11 new skills SKILL.md + 1 SUMMARY.md)

## Accomplishments

- Made 7 agent prompts language-agnostic: replaced `bun test` instructions with `{test_command}` referencing project's testing skill; replaced `.ts` file prescriptions with generic descriptions; retained JWT/auth domain context in MCP tool examples
- Updated 7 existing skills with Commands section; expanded python, tailwind, and sql from ~38 to 60 lines each with additional conventions, vocabulary terms, and community-sourced content
- Created 11 new skills: 5 language skills (rust, cargo-test, go, go-test, pytest) adapted from Microsoft Pragmatic Guidelines, Effective Go, Rust Book, and fastmcp.me; 6 generic skills (testing-strategy, architecture-design, security, brainstorming, defining-requirements, documentation) sourced from community cursor rules, awesome-cursorrules, and authoritative references

## Task Commits

Each task was committed atomically:

1. **Task 1: Make 7 agent prompts language-agnostic** - `0fb022e` (feat)
2. **Task 2: Update 7 existing skills and create 11 new skills** - `65ee690` (feat)

## Files Created/Modified

**Agent prompts updated:**
- `packages/framework/agents/decomposer.md` - JWT examples use generic "signing module source + test file"; test criteria reference "testing skill"
- `packages/framework/agents/executor.md` - JWT example uses "JWT signing module" not src/auth/jwt.ts
- `packages/framework/agents/validator.md` - test command uses {test_command} placeholder; expanded testing skill reference
- `packages/framework/agents/integration-checker.md` - {test_command} in Key Tool Sequences and Example
- `packages/framework/agents/researcher.md` - "Test runner with AAA structure" replaces "Bun test with AAA structure"

**Existing skills updated (Commands + expansion):**
- `packages/framework/skills/typescript/SKILL.md` - Added Commands (tsc, eslint/biome)
- `packages/framework/skills/bun/SKILL.md` - Added Commands (bun run, build, test)
- `packages/framework/skills/vitest/SKILL.md` - Added Commands (bun test, vitest)
- `packages/framework/skills/react/SKILL.md` - Added Commands (dev, build, lint)
- `packages/framework/skills/python/SKILL.md` - Expanded to 60 lines; async/await, Protocol, __slots__, ruff, Commands
- `packages/framework/skills/tailwind/SKILL.md` - Expanded to 60 lines; v4 @theme, bg-linear-to-*, JIT, Commands
- `packages/framework/skills/sql/SKILL.md` - Expanded to 60 lines; migrations, deadlock, composite index, Commands

**New language skills created:**
- `packages/framework/skills/rust/SKILL.md` - 61 lines; ownership, Result/?, traits, clippy, thiserror, cargo commands
- `packages/framework/skills/cargo-test/SKILL.md` - 60 lines; #[cfg(test)], integration tests, assert macros
- `packages/framework/skills/go/SKILL.md` - 60 lines; gofmt/goimports, error wrapping, context.Context, goroutines
- `packages/framework/skills/go-test/SKILL.md` - 60 lines; table-driven tests, t.Run, t.Parallel, testdata/, race detector
- `packages/framework/skills/pytest/SKILL.md` - 60 lines; fixtures, parametrize, conftest.py, async support

**New generic skills created:**
- `packages/framework/skills/testing-strategy/SKILL.md` - 61 lines; Fowler pyramid, caduh time budgets, AI Hero TDD
- `packages/framework/skills/architecture-design/SKILL.md` - 61 lines; Hexagonal, ADR, DDD, Markin
- `packages/framework/skills/security/SKILL.md` - 60 lines; CSA R.A.I.L.G.U.A.R.D., Goedecke, Van-LLM-Crew OWASP
- `packages/framework/skills/brainstorming/SKILL.md` - 60 lines; ratacat, claude-cortex, TechnickAI
- `packages/framework/skills/defining-requirements/SKILL.md` - 60 lines; Kiro, nikiforovall EARS, Prolifics, Gherkin
- `packages/framework/skills/documentation/SKILL.md` - 60 lines; Markin, awesome-cursorrules, community consensus

## Decisions Made

- **{test_command} placeholder pattern**: validator and integration-checker now use `{test_command} {test_file}` with a note that test_command comes from project's testing skill (pytest, bun test, cargo test, etc.) — agents must read the testing skill to discover the correct command
- **MCP example VALUES preserved**: store_document content examples in researcher.md and executor.md retain test file path examples since they demonstrate data format, not prescribe file naming conventions
- **Tailwind v4 content**: Added @theme block, bg-linear-to-*, CSS custom properties as theme tokens — addresses current v4 syntax which differs from v3
- **Generic skills cite sources inline**: each convention/anti-pattern item tags its source (Fowler, CSA, ratacat) so agents understand provenance and can weigh the authority appropriately

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Line count targets (60-100 lines) required multiple rounds of content addition to reach minimum, but all content added is substantive and sourced from the research materials.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 plan 02 complete: all 18 skills ready for injection by synapse-startup.js (built in plan 20-01)
- Phase 20 is complete: skill manifest injection, role_skills migration, agent prompts, and skill content all done
- Phase 21 (Agent Pool) can proceed — skills infrastructure fully in place
- Any agent spawned on a Python project now reads pytest/python skills for test commands; Rust projects read cargo-test/rust; TypeScript reads vitest/bun

---
*Phase: 20-skills-completion*
*Completed: 2026-03-05*
