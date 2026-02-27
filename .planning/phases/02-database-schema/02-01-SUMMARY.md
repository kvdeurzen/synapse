---
phase: 02-database-schema
plan: 01
subsystem: database
tags: [lancedb, apache-arrow, zod, arrow-schema, batch-insert, ulidx]

# Dependency graph
requires:
  - phase: 01-mcp-foundation
    provides: "Pino logger singleton (src/logger.ts) used by connectDb(); Zod v4 patterns established"
provides:
  - "DOCUMENTS_SCHEMA Arrow schema (15 fields, including v2 forward-compat: parent_id, depth, decision_type)"
  - "CODE_CHUNKS_SCHEMA Arrow schema (16 fields, 768-dim Float32 vector)"
  - "RELATIONSHIPS_SCHEMA, PROJECT_META_SCHEMA, ACTIVITY_LOG_SCHEMA Arrow schemas"
  - "5 matching Zod schemas as single source of truth for row validation"
  - "TABLE_SCHEMAS map and TABLE_NAMES const array for table registry"
  - "connectDb() wrapper that auto-creates directory and returns LanceDB connection"
  - "insertBatch() generic Zod-validated batch insert with fail-fast error reporting"
affects:
  - "03-init-project (uses connectDb + TABLE_SCHEMAS to create tables)"
  - "04-document-tools (uses DocumentRowSchema + insertBatch)"
  - "05-code-chunking (uses CodeChunkRowSchema + insertBatch)"
  - "all phases doing LanceDB writes (TABLE_NAMES, TABLE_SCHEMAS)"

# Tech tracking
tech-stack:
  added:
    - "@lancedb/lancedb@0.26.2 (pinned — 0.27.x-beta has breaking insert API change)"
    - "ulidx@2.4.1 (ULID generation, used in tests)"
    - "apache-arrow (transitive dep via lancedb, NOT explicitly installed)"
  patterns:
    - "Arrow types imported from apache-arrow (lancedb transitive dep), not @lancedb/lancedb main entry (TypeScript doesn't re-export them)"
    - "Zod v4 z.array(z.number()).length(768) enforces vector dimension at validation time"
    - "insertBatch validates every row before any DB call — fail fast, no partial writes"
    - "All array fields (tags, imports, exports) stored as JSON strings (Utf8), not native Arrow lists"
    - "All timestamps stored as ISO 8601 strings (Utf8), not Arrow timestamp types"

key-files:
  created:
    - "src/db/schema.ts - All 5 Arrow schemas and 5 Zod schemas, TABLE_SCHEMAS map, TABLE_NAMES array"
    - "src/db/connection.ts - connectDb() LanceDB connection wrapper with auto-mkdir"
    - "src/db/batch.ts - insertBatch<S>() generic Zod-validated batch insert helper"
    - "test/db/schema.test.ts - 37 tests: field counts, nullability, Zod validation, vector dims, insertBatch behavior"
  modified:
    - "package.json - Added @lancedb/lancedb@0.26.2 and ulidx"
    - "bun.lock - Updated lockfile with new dependencies"

key-decisions:
  - "Apache-arrow types imported from 'apache-arrow' (transitive dep) not '@lancedb/lancedb' — lancedb TypeScript types do not re-export Arrow types in index.d.ts, only the JS runtime does. Importing from apache-arrow directly avoids TypeScript errors without any explicit install."
  - "Zod path segments mapped via .map(String) in error reporting — Zod v4 ZodIssue.path is PropertyKey[] (string|number|symbol), not (string|number)[]"
  - "@lancedb/lancedb pinned to exactly 0.26.2 (not ^0.26.2) — per pre-build decision to avoid 0.27.x-beta breaking change"

patterns-established:
  - "Arrow schema pattern: new Schema([new Field(name, new Utf8(), nullable), ...])"
  - "Vector field pattern: new Field('vector', new FixedSizeList(768, new Field('item', new Float32(), true)), false)"
  - "Zod nullable pattern: z.string().nullable() for optional fields, z.string().min(1) for required strings"
  - "insertBatch pattern: validate all rows -> throw with context on first invalid -> table.add(rows)"

requirements-completed: [FOUND-03, FOUND-05, FOUND-06]

# Metrics
duration: 6min
completed: 2026-02-27
---

# Phase 2 Plan 01: Database Schema Summary

**5 LanceDB Arrow schemas (immutable table structure) + 5 matching Zod validation schemas + connectDb/insertBatch helpers, covering all 5 tables including v2 forward-compatibility fields**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-27T20:02:24Z
- **Completed:** 2026-02-27T20:09:18Z
- **Tasks:** 2
- **Files modified:** 6 created, 2 modified

## Accomplishments

- All 5 Arrow schemas defined with correct field types and nullability — immutable table structure frozen before any writes
- Documents schema includes 3 v2 forward-compat nullable fields (parent_id, depth, decision_type) per FOUND-06
- Every schema has non-null project_id column for multi-project isolation
- CODE_CHUNKS_SCHEMA has 768-dim Float32 FixedSizeList vector column for semantic search
- 5 matching Zod schemas serve as single source of truth — vector dimension enforced at validation time
- connectDb() auto-creates DB directory, no manual setup required
- insertBatch() validates every row before any DB call — fail fast with table name, row index, and detailed error
- 37 tests pass covering all schemas, validation, vector dimension enforcement, and insertBatch behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create schema definitions** - `aed164a` (feat)
2. **Task 2: Create DB connection wrapper, batch insert helper, and unit tests** - `c1c04fd` (feat)

**Plan metadata:** (committed after SUMMARY.md creation)

## Files Created/Modified

- `src/db/schema.ts` - 5 Arrow schemas + 5 Zod schemas + TABLE_SCHEMAS map + TABLE_NAMES array
- `src/db/connection.ts` - connectDb() with auto-mkdir and debug logging
- `src/db/batch.ts` - insertBatch<S>() generic Zod-validated batch helper
- `test/db/schema.test.ts` - 37 tests for all schema behaviors
- `package.json` - Added @lancedb/lancedb@0.26.2 and ulidx dependencies
- `bun.lock` - Updated lockfile

## Decisions Made

- **Apache-arrow import path:** lancedb's main TypeScript `index.d.ts` does NOT re-export Arrow types (Schema, Field, Utf8, Int32, Float32, FixedSizeList). Only the JS runtime does via `export * from "apache-arrow"`. Solution: import from `apache-arrow` directly (it's already installed as lancedb's transitive dep — no explicit `bun add` needed). This satisfies the plan's intent of not explicitly installing apache-arrow while making TypeScript happy.
- **Zod v4 path mapping:** Zod v4 `ZodIssue.path` is typed as `PropertyKey[]` (includes symbols). Used `.map(String)` to safely convert all path segments to strings for error messages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Arrow types imported from apache-arrow instead of @lancedb/lancedb**
- **Found during:** Task 1 (schema.ts implementation and TypeScript verification)
- **Issue:** Plan specified `import * as lancedb from "@lancedb/lancedb"` and use `new lancedb.Field(...)`, but lancedb's TypeScript index.d.ts does not re-export Arrow types. TypeScript errors: "Module '@lancedb/lancedb' has no exported member 'Field'" (and 5 others)
- **Fix:** Changed to `import { Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from "apache-arrow"` — the package is already installed as lancedb's transitive dependency, so no `bun add` was needed
- **Files modified:** src/db/schema.ts, test/db/schema.test.ts
- **Verification:** `bunx tsc --noEmit` passes clean; all 37 tests pass
- **Committed in:** aed164a, c1c04fd (both task commits)

**2. [Rule 1 - Bug] Fixed Zod v4 PropertyKey[] path type in insertBatch error formatting**
- **Found during:** Task 2 (batch.ts implementation, TypeScript check)
- **Issue:** Plan's error formatting used inline type `(e: { path: (string | number)[]; message: string })` but Zod v4's `ZodIssue.path` is `PropertyKey[]` (string | number | symbol), not `(string | number)[]`. TypeScript error: "Type 'symbol' is not assignable to type 'string | number'"
- **Fix:** Changed `.map((e: {...}) => ...)` to `.map((e) => `${e.path.map(String).join(".")}: ${e.message}`)` — let TypeScript infer the type, convert path segments via `String()`
- **Files modified:** src/db/batch.ts
- **Verification:** `bunx tsc --noEmit` passes clean
- **Committed in:** c1c04fd (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes required for TypeScript correctness. No scope creep — the import source and error message output are functionally identical to the plan's intent.

## Issues Encountered

- Biome 2.4.4 import ordering enforcement: `bun:test` must be first, then `node:*`, then third-party packages. Fixed by reordering all import blocks.
- Biome line-length enforcement (100 chars): the long `insertBatch` call in the test had to be split to multi-line. Fixed in both batch.ts and schema.test.ts.
- Vector field multi-line construction in schema.ts initially rejected by biome (fit on one 97-char line instead).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema primitives complete — init_project (Phase 2 Plan 02) can now call `connectDb()` and `db.createEmptyTable(name, TABLE_SCHEMAS[name])` for all 5 tables
- All exported names match the plan's artifact spec exactly
- TypeScript compiles strict, Biome passes, 60 total tests pass (37 new + 23 Phase 1)
- No blockers identified

## Self-Check: PASSED
