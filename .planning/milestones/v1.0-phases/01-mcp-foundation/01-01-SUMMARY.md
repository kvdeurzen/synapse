---
phase: 01-mcp-foundation
plan: 01
subsystem: infra
tags: [bun, typescript, pino, zod, biome, smol-toml, mcp]

# Dependency graph
requires: []
provides:
  - "Bun project scaffold with all Phase 1 dependencies installed"
  - "Strict TypeScript config (noUncheckedIndexedAccess, exactOptionalPropertyTypes)"
  - "Biome linter/formatter config"
  - "Pino logger singleton writing exclusively to stderr via pino.destination(2)"
  - "4-level config loader (CLI > env > synapse.toml > defaults) with Zod v4 validation"
  - "ToolResult<T> response envelope type"
  - "SynapseConfig interface"
  - "createToolLogger() for per-invocation correlation IDs"
affects:
  - "02-stdio-transport (imports logger.ts and config.ts)"
  - "all subsequent phases (foundational modules used everywhere)"

# Tech tracking
tech-stack:
  added:
    - "@modelcontextprotocol/sdk@1.27.1"
    - "pino@10.3.1 (stderr-only via pino.destination(2))"
    - "zod@4.3.6 (pinned to ^4.0.0)"
    - "smol-toml@1.6.0 (TOML config file parsing)"
    - "@biomejs/biome@2.4.4"
    - "bun@1.3.9 runtime"
    - "typescript@5.9.3"
  patterns:
    - "pino.destination(2) for guaranteed stderr-only logging (stdout contamination prevention)"
    - "Zod ConfigSchema.safeParse() collecting all errors at once before process.exit(1)"
    - "4-level config precedence: CLI args (parseArgs) > env vars > synapse.toml > Zod defaults"
    - "Child logger with correlationId UUID on every tool invocation"
    - "console.error only in pre-logger code, never console.log anywhere in src/"

key-files:
  created:
    - "package.json - Project manifest with all Phase 1 deps"
    - "tsconfig.json - Strict TypeScript with noUncheckedIndexedAccess, exactOptionalPropertyTypes"
    - "biome.json - Linter/formatter config (2-space indent, 100 line width)"
    - ".gitignore - Bun/TypeScript standard ignores"
    - "bun.lock - Bun lockfile (text format, bun@1.3.9)"
    - "src/types.ts - ToolResult<T> envelope and SynapseConfig interface"
    - "src/logger.ts - Pino stderr singleton with setLogLevel() and createToolLogger()"
    - "src/config.ts - 4-level config loader with Zod v4 validation"
    - "test/logger.test.ts - 4 tests: stderr isolation, level update, child logger bindings"
    - "test/config.test.ts - 10 tests: all precedence levels, error cases, toml fallback"
  modified: []

key-decisions:
  - "Zod v4.3.6 resolved (not v3) — pinned to ^4.0.0; Zod v4 error API uses z.string({ error: msg }) for invalid_type customization"
  - "bun@1.3.9 generates bun.lock (text) not bun.lockb (binary) — committed as lockfile"
  - "Config test approach: spawn bun run tmpfile.ts -- args (not bun -e) to avoid flag collision with --db"
  - "Empty env strings treated as unset via || undefined to prevent empty-string leakthrough"

patterns-established:
  - "Test subprocess pattern: write temp script file, run with bun run file.ts -- args for CLI arg isolation"
  - "node: protocol prefix on all Node.js built-in imports (enforced by biome)"

requirements-completed: [FOUND-02, FOUND-07]

# Metrics
duration: 5min
completed: 2026-02-27
---

# Phase 1 Plan 01: Project Scaffold and Foundation Modules Summary

**Bun project scaffold with Pino stderr-only logging (pino.destination(2)), 4-level CLI/env/toml/default config loader via Zod v4, and strict TypeScript/Biome toolchain**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-27T17:48:25Z
- **Completed:** 2026-02-27T17:53:37Z
- **Tasks:** 2
- **Files modified:** 10 created

## Accomplishments

- Bun project with all Phase 1 deps installed: @modelcontextprotocol/sdk, pino, smol-toml, zod@^4.0.0
- Strict TypeScript compiling clean (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- Pino logger provably writes only to stderr — subprocess test confirms zero stdout output
- Config loader implements 4-level precedence with all-at-once Zod validation and process.exit(1)
- 14 tests passing (4 logger + 10 config) via bun:test
- Zero console.log calls in any source file

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize Bun project with dependencies and tooling config** - `1876cfc` (chore)
2. **Task 2: Create logger, config loader, and shared types modules** - `c42af3d` (feat)

**Plan metadata:** (see below — committed after SUMMARY.md creation)

## Files Created/Modified

- `package.json` - Synapse-MCP project manifest, ESM, all Phase 1 deps
- `tsconfig.json` - Strict TypeScript, bundler module resolution, bun-types
- `biome.json` - Biome linter/formatter (2-space, 100 width, recommended rules)
- `.gitignore` - Bun/TypeScript standard ignores
- `bun.lock` - Text lockfile (bun@1.3.9 format)
- `src/types.ts` - ToolResult<T> and SynapseConfig interfaces
- `src/logger.ts` - Pino singleton to stderr, setLogLevel(), createToolLogger()
- `src/config.ts` - 4-level config loader, Zod v4 validation, all-errors-at-once
- `test/logger.test.ts` - 4 subprocess-based logger tests
- `test/config.test.ts` - 10 config precedence and error tests

## Decisions Made

- **Zod v4 pin:** Resolved v4.3.6 (not v3) — pinned to ^4.0.0. In Zod v4, `z.string({ error: msg })` customizes invalid_type messages (distinct from `min(1, msg)` which only fires on too_small).
- **bun.lock format:** bun@1.3.9 generates text-format `bun.lock` (not binary `bun.lockb`) — committed to repo per plan intent.
- **Config test strategy:** Subprocess tests use temp file + `bun run file.ts -- args` instead of `bun -e script args` because bun hijacks `--db` as a bun flag when using `-e`.
- **Empty env var handling:** `process.env.SYNAPSE_DB_PATH || undefined` treats empty strings as unset, preventing empty-string leakthrough in test isolation and real usage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod v4 error message customization for missing required field**
- **Found during:** Task 2 (config.ts implementation and testing)
- **Issue:** Zod v4's invalid_type error (missing field) does not use `.min(1, msg)` message — it uses a separate `error` constructor option: `z.string({ error: msg })`
- **Fix:** Changed `z.string().min(1, msg)` to `z.string({ error: msg }).min(1, msg)` to provide custom message for both missing and empty string cases
- **Files modified:** src/config.ts
- **Verification:** Config tests confirm error message contains expected text on missing db
- **Committed in:** c42af3d (Task 2 commit)

**2. [Rule 1 - Bug] Fixed CLI arg parsing collision in subprocess test**
- **Found during:** Task 2 (config tests initially failing)
- **Issue:** `bun -e script --db /path` treated `--db` as a bun runtime flag, not forwarding to process.argv correctly
- **Fix:** Changed test helper to write temp file and use `bun run tmpfile.ts -- --db /path` which correctly populates process.argv.slice(2)
- **Files modified:** test/config.test.ts
- **Verification:** All 10 config tests pass
- **Committed in:** c42af3d (Task 2 commit)

**3. [Rule 1 - Bug] Fixed empty env var leakthrough in test isolation**
- **Found during:** Task 2 (config tests, CLI override not working)
- **Issue:** Subprocess env inherited `SYNAPSE_DB_PATH=""` which was truthy enough to override CLI args via the `?? ""` chain
- **Fix:** Added `|| undefined` to env var reads so empty strings are treated as unset
- **Files modified:** src/config.ts
- **Verification:** "CLI overrides env vars" test passes
- **Committed in:** c42af3d (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** All fixes required for correctness — Zod v4 API differences, test isolation, env var handling. No scope creep.

## Issues Encountered

- Biome 2.4.4 rejected `"files": { "includes": [...], "ignoreUnknown": true }` in biome.json — these fields don't exist in the 2.x schema. Removed them; biome operates on all matched patterns via CLI args instead.
- TypeScript strict mode flagged `cliArgs["log-level"]` as `string | boolean | undefined` — fixed by extracting via `typeof cliArgs["log-level"] === "string"` guard before assignment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Foundation complete — logger.ts and config.ts are ready for import by Phase 1 Plan 2 (stdio MCP server)
- All dependencies installed and locked
- TypeScript strict mode compiling, Biome passing
- No blockers identified
- Note for Phase 2: `src/index.ts` is the entry point — needs to be created next

## Self-Check: PASSED

All 11 files verified present. Both task commits (1876cfc, c42af3d) verified in git log.

---
*Phase: 01-mcp-foundation*
*Completed: 2026-02-27*
