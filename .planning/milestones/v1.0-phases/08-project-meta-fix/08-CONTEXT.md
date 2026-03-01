# Phase 8: Fix project_meta Integration Wiring - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire up the `project_meta` row lifecycle so `init_project` seeds a row, `index_codebase` updates `last_index_at` via upsert (works whether row exists or not), and `get_index_status` returns correct timestamps. This is an internal data wiring fix — no new tables, no new tools, no API changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Meta row initial data: what values to use for `name`, `description`, `settings` when seeding the project_meta row in init_project
- Upsert strategy for index_codebase: delete+insert vs check-then-insert/update (LanceDB has no native upsert)
- Re-init behavior: whether init_project should seed/update project_meta on re-init (tables exist) vs only on fresh init
- All implementation details — user trusts the success criteria are specific enough to guide decisions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `insertBatch()` (src/db/batch.ts): Validated batch insert used throughout the project — reuse for project_meta row insertion
- `ProjectMetaRowSchema` (src/db/schema.ts:165-173): Zod schema already defined with all 7 fields
- `connectDb()` (src/db/connection.ts): Standard DB connection utility

### Established Patterns
- Table creation in init_project uses `db.createEmptyTable()` with `existOk: true` — idempotent
- Starter document seeding only runs on fresh init (`if (tables_created > 0)`)
- index_codebase uses `escapeSQL()` for all WHERE clauses
- get_index_status already has correct query logic (lines 62-69) — just needs the row to exist

### Integration Points
- `src/tools/init-project.ts` line ~265: After starter seeding, before return — insert project_meta row
- `src/tools/index-codebase.ts` lines 266-282: Replace conditional UPDATE with upsert logic
- `src/tools/get-index-status.ts` lines 62-69: No changes needed — already handles present/absent rows correctly
- Existing tests: `test/db/init-project.test.ts`, `test/tools/get-index-status.test.ts`

### Key Bug Details
1. `init_project` creates project_meta TABLE but never inserts a ROW
2. `index_codebase` line 273: `if (existing.length > 0)` means update only fires if row exists — it never does
3. `get_index_status` correctly returns null when no row exists — the consumer is fine, the producer is broken

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Success criteria from roadmap are precise:
1. After init_project, project_meta table contains a row with last_index_at as null
2. After index_codebase, project_meta.last_index_at is set to current timestamp (upsert)
3. get_index_status returns non-null last_index_at after init_project -> index_codebase flow
4. Running index_codebase twice updates (not duplicates) the project_meta row

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-project-meta-fix*
*Context gathered: 2026-03-01*
