# Deferred Items — Phase 13.1

## Lint Failures (Pre-existing, Out of Scope)

**Discovered during:** Plan 02, Task 1 (bun run lint verification)

**Issue:** `bun run lint` fails with 57 errors (server) + 20 errors (framework).
These are pre-existing code quality issues that were NOT being caught before:
- Server: was failing lint with biome 2.4.4 even before monorepo migration (confirmed by replaying old config)
- Framework: was using biome 1.9.4 (much less strict); now upgraded to 2.4.4 as part of monorepo consolidation

**Error types:**
- `lint/correctness/noUnusedVariables` — unused variables in server tools and framework hooks
- `lint/correctness/noUnusedFunctionParameters` — unused function parameters
- `lint/correctness/noUnusedImports` — unused imports
- Import organization suggestions (safe fixes)
- Formatting differences (indentation in some files)

**Files affected:**
- `packages/server/src/tools/*.ts` — unused imports/params from incremental refactoring
- `packages/framework/hooks/synapse-audit.js` — unused variables
- `packages/framework/hooks/synapse-startup.js` — unused variables
- Various other server src files

**Recommendation:** Run `bun run --cwd packages/server lint -- --write` and `bun run --cwd packages/framework lint -- --write`
to apply safe auto-fixes. Then manually address remaining issues.
This is a tech-debt cleanup task, not blocking anything functionally.

**Scope:** NOT modified by Phase 13.1 plans — pre-existing in both repos.
