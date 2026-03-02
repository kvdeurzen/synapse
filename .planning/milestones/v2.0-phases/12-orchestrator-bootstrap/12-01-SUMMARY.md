---
phase: 12-orchestrator-bootstrap
plan: "01"
subsystem: infra
tags: [bun, toml, zod, smol-toml, config, framework, synapse-framework]

# Dependency graph
requires: []
provides:
  - "synapse-framework repo at ../synapse-framework with full directory structure"
  - "TOML config system with Zod validation (loadSynapseConfig, loadTrustConfig, loadAgentsConfig, loadSecretsConfig, loadAllConfig)"
  - "Default config files: synapse.toml, trust.toml, agents.toml, secrets.toml.template"
  - "settings.template.json with Claude Code mcpServers and hooks format"
  - "ConfigError class for structured error handling in tests"
  - "Three-layer test directory structure (unit/, integration/, behavioral/)"
affects:
  - "12-02 (hook system depends on config system)"
  - "12-03 (session lifecycle depends on config loading)"
  - "13 (agent definitions build on framework structure)"

# Tech tracking
tech-stack:
  added:
    - "smol-toml@1.6.0 — TOML parsing"
    - "zod@4.3.6 — schema validation"
    - "@biomejs/biome@2.4.4 — linting/formatting"
    - "bun-types@1.3.10 — Bun runtime types"
    - "@types/node@25.3.3 — Node.js types"
  patterns:
    - "loadAndValidate<T>(filePath, schema, options) — shared TOML+Zod loader with structured error messages"
    - "ConfigError extends Error — testable errors (not process.exit) for all config loaders"
    - "Optional config pattern — secrets.toml returns {} when missing (not error)"
    - "Anti-drift test — default config files tested against their own schemas"

key-files:
  created:
    - "../synapse-framework/src/config.ts — TOML config loader with Zod validation"
    - "../synapse-framework/config/synapse.toml — Synapse MCP server connection config"
    - "../synapse-framework/config/trust.toml — Trust matrix with per-domain autonomy levels"
    - "../synapse-framework/config/agents.toml — Agent registry with 10 agents and model assignments"
    - "../synapse-framework/config/secrets.toml.template — Template for gitignored secrets.toml"
    - "../synapse-framework/settings.template.json — Claude Code settings.json template with mcpServers + hooks"
    - "../synapse-framework/test/unit/config.test.ts — 13 unit tests for all config loaders"
    - "../synapse-framework/package.json — Bun project manifest"
    - "../synapse-framework/tsconfig.json — TypeScript config"
    - "../synapse-framework/biome.json — Biome linter/formatter config"
    - "../synapse-framework/.gitignore — Blocks secrets.toml and settings.json"
  modified: []

key-decisions:
  - "ConfigError throws (not process.exit) so tests can catch — CLI entry points convert to exit(1)"
  - "Zod 4 z.string({ error: '...' }) syntax used for custom missing-field messages (not z.string().min())"
  - "loadSecretsConfig is optional (returns {} on missing) — secrets not required for development"
  - "Anti-drift test validates actual config/ files against schemas in CI"

patterns-established:
  - "loadAndValidate pattern: readFileSync -> parseToml -> Zod safeParse -> collect ALL errors -> throw ConfigError"
  - "Optional file pattern: options.optional=true returns schema default instead of throwing on ENOENT"
  - "Error message format: [synapse-framework] {filePath} not found / Malformed {filePath}: {msg} / Configuration error(s) in {filePath}"

requirements-completed:
  - ORCH-01
  - ORCH-02
  - ORCH-05

# Metrics
duration: 3min
completed: "2026-03-01"
---

# Phase 12 Plan 01: Orchestrator Bootstrap Summary

**synapse-framework repo bootstrapped with six-directory Claude Code layout, TOML+Zod config system (4 loaders, ConfigError), default config files, and settings.template.json — 13 tests pass**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T21:11:58Z
- **Completed:** 2026-03-01T21:14:57Z
- **Tasks:** 2 (Task 1: repo structure + tooling; Task 2: config system TDD)
- **Files modified:** 15 created

## Accomplishments
- New synapse-framework repo at /home/kanter/code/synapse-framework with agents/, skills/, hooks/, workflows/, commands/synapse/, config/, src/, test/ directories
- TOML config system with loadAndValidate helper, four loader functions, and ConfigError class — all 13 unit tests pass
- Default config files (synapse.toml, trust.toml, agents.toml) validated against their own schemas as anti-drift test
- settings.template.json with Claude Code mcpServers format and hooks section for SessionStart + PostToolUse

## Task Commits

Each task was committed atomically:

1. **Task 1: Create synapse-framework repo with directory structure** - `6a31e29` (chore)
2. **Task 2 RED: Add failing config system tests** - `2d0d69f` (test)
3. **Task 2 GREEN: Implement TOML config system** - `7485d4a` (feat)

_Note: TDD task had RED (test) + GREEN (feat) commits per TDD protocol_

## Files Created/Modified
- `synapse-framework/src/config.ts` — ConfigError class, SynapseFrameworkConfigSchema, TrustConfigSchema, AgentsConfigSchema, SecretsConfigSchema, loadAndValidate helper, four public loaders, loadAllConfig
- `synapse-framework/config/synapse.toml` — Default Synapse MCP server connection config with [server] and [connection] sections
- `synapse-framework/config/trust.toml` — Default trust matrix with 6 domains and strategic decomposition approval
- `synapse-framework/config/agents.toml` — 10-agent registry (product-strategist, researcher, architect, decomposer, plan-reviewer, executor, validator, integration-checker, debugger, codebase-analyst)
- `synapse-framework/config/secrets.toml.template` — Template for gitignored secrets.toml
- `synapse-framework/settings.template.json` — Claude Code settings.json template with mcpServers + hooks sections
- `synapse-framework/test/unit/config.test.ts` — 13 unit tests for all config loaders
- `synapse-framework/package.json` — Bun project with smol-toml, zod, biome, bun-types
- `synapse-framework/tsconfig.json`, `biome.json`, `.gitignore` — Tooling config

## Decisions Made

- **ConfigError over process.exit:** Config loaders throw ConfigError (not process.exit) so tests can catch and assert on error messages. CLI entry points convert ConfigError to exit(1). Mirrors testability best practices from synapse-server codebase.
- **Zod 4 error message syntax:** `z.string({ error: 'db path is required' })` used for custom missing-field messages. The `z.string().min(1, '...')` pattern produces a different error when the field is entirely absent (vs. empty string) in Zod 4.
- **Optional secrets pattern:** `loadSecretsConfig` returns `{}` on missing file — secrets are not required for development, only for API-calling operations.
- **Anti-drift validation test:** The test suite validates actual `config/*.toml` files against the Zod schemas. This prevents config files and schemas from silently drifting apart.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod 4 schema syntax for custom missing-field error messages**
- **Found during:** Task 2 (GREEN phase — making tests pass)
- **Issue:** `z.string().min(1, "db path is required")` produces "Invalid input: expected string, received undefined" in Zod 4 when field is missing entirely (not empty string). The test expected "db path is required".
- **Fix:** Changed to `z.string({ error: "db path is required" })` which uses Zod 4's correct API for the type-mismatch error message.
- **Files modified:** `src/config.ts`
- **Verification:** All 13 tests pass including the "throws ConfigError on invalid schema (missing required db)" test.
- **Committed in:** 7485d4a (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in schema syntax for Zod 4)
**Impact on plan:** Minor — correct behavior achieved, Zod 4 API used correctly. No scope creep.

## Issues Encountered
- None beyond the Zod 4 syntax deviation documented above.

## User Setup Required
None — no external service configuration required for the framework bootstrap itself.

## Next Phase Readiness
- synapse-framework repo is ready for Plans 02 and 03 to build on
- Config system provides loadSynapseConfig, loadTrustConfig, loadAgentsConfig, loadSecretsConfig for hooks and session lifecycle to use
- Directory structure mirrors .claude/ target layout — agents/, hooks/, commands/ ready for content
- Test infrastructure (bun test, unit/integration/behavioral dirs) established for subsequent plans

---
*Phase: 12-orchestrator-bootstrap*
*Completed: 2026-03-01*

## Self-Check: PASSED

Files verified:
- FOUND: synapse-framework/package.json
- FOUND: synapse-framework/tsconfig.json
- FOUND: synapse-framework/biome.json
- FOUND: synapse-framework/.gitignore
- FOUND: synapse-framework/src/config.ts
- FOUND: synapse-framework/config/synapse.toml
- FOUND: synapse-framework/config/trust.toml
- FOUND: synapse-framework/config/agents.toml
- FOUND: synapse-framework/config/secrets.toml.template
- FOUND: synapse-framework/settings.template.json
- FOUND: synapse-framework/test/unit/config.test.ts

Commits verified:
- FOUND: 6a31e29 (Task 1: repo structure and tooling)
- FOUND: 2d0d69f (Task 2 RED: failing tests)
- FOUND: 7485d4a (Task 2 GREEN: config implementation)
