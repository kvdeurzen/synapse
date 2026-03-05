---
phase: 17-tech-debt
plan: 02
subsystem: testing
tags: [biome, lint, code-quality, null-safety, autonomy-modes]

# Dependency graph
requires:
  - phase: 17-tech-debt
    plan: "01"
    provides: correctness fixes baseline (escapeSQL, created_at, AST edges)
provides:
  - zero-warning lint baseline across both packages
  - null-safe manual replacements for noNonNullAssertion in server src
  - canonical autonomy mode ordering in synapse-orchestrator.md
affects: [18, 19, 20, 21, 23, 24]  # future phases building on clean codebase

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit null guard pattern for map.get()! after has() check — throw Error with key context"
    - "Explicit null guard pattern for array[0]! after length check — throw Error with task_id context"
    - "Use (value as string) instead of value! in test assertions after expect(value).toBeDefined()"

key-files:
  created: []
  modified:
    - packages/framework/agents/synapse-orchestrator.md
    - packages/server/src/services/code-indexer/scanner.ts
    - packages/server/src/tools/get-index-status.ts
    - packages/server/src/tools/get-smart-context.ts
    - packages/server/src/tools/get-task-tree.ts
    - packages/server/src/tools/update-task.ts
    - packages/framework/hooks/synapse-startup.js
    - packages/framework/test/integration/startup.test.ts
    - "packages/server/src/** (57 auto-fixed files)"
    - "packages/framework/src/** + hooks/** + test/** (20 auto-fixed files)"

key-decisions:
  - "Use explicit null guard (if (!entry) throw) rather than optional chaining (?.) for map.get() after has() — optional chaining silently swallows the push/mutate, explicit throw makes bugs visible"
  - "Remove unused GetIndexStatusArgs type alias rather than prefix with _ — type aliases with _ prefix still trigger noUnusedVariables in Biome"
  - "Framework test failures (5) confirmed pre-existing — hook unit tests fail due to environment, integration tests fail due to Ollama unavailability; no regressions introduced"

patterns-established:
  - "Pattern: after has() check, use explicit null guard on get() — never assume compiler elides the undefined branch"
  - "Pattern: after length > 0 check, use explicit null guard on [0] — never use ! operator even when logically guaranteed"

requirements-completed: [DEBT-04, DEBT-05]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 17 Plan 02: Lint Cleanup + Autonomy Mode Fix Summary

**Biome lint reduced from 109 findings (58 errors + 51 warnings) to zero across both packages; autonomy mode ordering corrected to canonical autopilot → co-pilot → advisory in synapse-orchestrator.md**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T14:42:03Z
- **Completed:** 2026-03-05T14:47:08Z
- **Tasks:** 2
- **Files modified:** 63 (57 auto-fixed + 6 manual server/framework src + 1 agent md)

## Accomplishments

- Ran `bunx biome check --write` and `--write --unsafe` on all source files in both packages — auto-fixed formatting, import ordering, template literals, optional chaining, unused imports, and useless catch clauses
- Manually replaced 8 `noNonNullAssertion` occurrences in server src with explicit null guards (scanner.ts, get-index-status.ts, get-smart-context.ts, get-task-tree.ts, update-task.ts)
- Removed unused `GetIndexStatusArgs` type alias and `created_at` destructuring in synapse-startup.js
- Replaced `text!` with `text as string` in framework integration test assertions (post-`expect().toBeDefined()` context)
- Fixed autonomy mode ordering in `synapse-orchestrator.md`: was advisory → co-pilot → autopilot (wrong), now none (autopilot) → strategic (co-pilot) → always (advisory) (canonical)
- All 624 server tests pass; 5 pre-existing framework failures confirmed unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Biome auto-fix + manual null-safety fixes** - `c733abc` (fix)
2. **Task 2: Autonomy mode ordering** - `a91ba90` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/server/src/services/code-indexer/scanner.ts` — Replace `relPath.split(".").pop()!` with explicit null guard + continue
- `packages/server/src/tools/get-index-status.ts` — Remove unused type alias; replace `langMap.get(lang)!` with explicit null guard
- `packages/server/src/tools/get-smart-context.ts` — Replace `relatedEntriesMap.get(rel.doc_id)!` with explicit null guard
- `packages/server/src/tools/get-task-tree.ts` — Replace `rootTaskRows[0]!` and `queue.shift()!` with explicit null guards
- `packages/server/src/tools/update-task.ts` — Replace `existingRows[0]!` and `finalRows[0]!` with explicit null guards
- `packages/framework/hooks/synapse-startup.js` — Remove unused `created_at` from destructuring
- `packages/framework/test/integration/startup.test.ts` — Replace `text!` with `text as string` in 3 JSON.parse calls
- `packages/framework/agents/synapse-orchestrator.md` — Reorder autonomy modes to canonical order
- 55+ other files — Biome auto-fix (formatting, import ordering, template literals, unused imports, optional chaining)

## Decisions Made

- **Explicit null guard over optional chaining for map mutations:** When `map.get(key)` result is used to call `.push()`, `.add()`, or increment, optional chaining silently no-ops instead of throwing. Explicit `if (!entry) throw` makes the invariant visible and testable.
- **Type assertion over non-null assertion in tests:** `JSON.parse(text as string)` satisfies Biome without `!` and correctly expresses the intent (we've just asserted `text` is defined via `expect(text).toBeDefined()`).
- **Pre-existing framework test failures documented:** 5 framework failures confirmed pre-existing (hook unit tests require specific env setup; integration tests require Ollama). Not introduced by lint changes.

## Deviations from Plan

None — plan executed exactly as written. The RESEARCH.md provided accurate lists of files and fix types. Auto-fix handled the bulk; manual fixes followed the exact pattern from the plan's Phase 3 instructions.

## Issues Encountered

- **Biome formatting rule triggered on single-line throw:** After adding `if (!finalRow) throw new Error(...)` in update-task.ts, Biome formatter required breaking the throw to a new line. Fixed immediately by reformatting to `if (!finalRow)\n  throw new Error(...)`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEBT-04 (lint cleanup) and DEBT-05 (autonomy mode fix) complete
- `bun run lint` exits clean (code 0) on both packages — zero errors, zero warnings
- Phase 17 tech debt complete — codebase ready for Phase 18 RPEV orchestration rework
- 624 server tests pass, confirming auto-fix introduced no behavioral regressions

---
*Phase: 17-tech-debt*
*Completed: 2026-03-05*

## Self-Check: PASSED

- FOUND: `packages/framework/agents/synapse-orchestrator.md`
- FOUND: `.planning/phases/17-tech-debt/17-02-SUMMARY.md`
- FOUND commit c733abc (lint fixes)
- FOUND commit a91ba90 (autonomy mode fix)
- `bun run lint` exits code 0, both packages: zero errors, zero warnings
- 624 server tests pass, 0 fail
