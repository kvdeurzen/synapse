# Phase 8: Fix project_meta Integration Wiring - Research

**Researched:** 2026-03-01
**Domain:** LanceDB row lifecycle — delete+insert upsert pattern, project_meta seeding in init_project
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — no locked decisions. All implementation details are at Claude's discretion.

### Claude's Discretion
- Meta row initial data: what values to use for `name`, `description`, `settings` when seeding the project_meta row in init_project
- Upsert strategy for index_codebase: delete+insert vs check-then-insert/update (LanceDB has no native upsert)
- Re-init behavior: whether init_project should seed/update project_meta on re-init (tables exist) vs only on fresh init
- All implementation details — user trusts the success criteria are specific enough to guide decisions

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CSRCH-04 | get_index_status returns total files indexed, total chunks, last index time, languages breakdown, stale files count | get_index_status already has correct query logic (lines 62-69); bug is that project_meta table is always empty so last_index_at is always null. Fix: seed row in init_project + upsert in index_codebase |
| CODE-10 | TypeScript, Python, and Rust languages are supported with appropriate tree-sitter grammars | Already passing — this phase only touches project_meta wiring, not grammar support. Re-verified: no regression risk here |
</phase_requirements>

## Summary

Phase 8 is a pure data-wiring fix with zero new API surface, no schema changes, and no new dependencies. The bug is simple: `init_project` creates the `project_meta` table but never inserts a row for the project. As a consequence, `index_codebase`'s conditional `if (existing.length > 0)` guard on line 273 of `index-codebase.ts` never fires — it checks for an existing row to update, finds none, and silently does nothing. `get_index_status` correctly handles a missing row (returns `null` for `last_index_at`), so the consumer is fine — the producers are broken.

The fix has two parts: (1) seed a `project_meta` row inside `initProject()` after table creation and starter seeding; (2) replace the conditional-update block in `indexCodebase()` with a delete-then-insert upsert, since LanceDB 0.26.2 has no native upsert primitive. All infrastructure needed is already present: `insertBatch()`, `ProjectMetaRowSchema`, the `project_meta` Arrow schema, and the `table.update()` API.

The only design decision is the upsert strategy. The evidence strongly favors delete+insert over check-then-insert/update: it uses the same pattern already established for `ast_import` edges (`relTable.delete(...)` followed by `insertBatch()`), it eliminates the branching entirely, and it is idempotent by construction. The existing update-only path should simply be replaced with delete+insert unconditionally (still wrapped in try/catch since this remains non-critical).

**Primary recommendation:** Seed `project_meta` row always in `initProject()` (both fresh and re-init paths), using delete+insert upsert in `indexCodebase()`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @lancedb/lancedb | 0.26.2 (pinned) | LanceDB table operations: query, delete, add | Already in use throughout project |
| ulidx | (existing) | Generate ULID for any new IDs if needed | Established ID generation pattern in project |
| zod | ^4.0.0 | Row validation via `insertBatch()` | `ProjectMetaRowSchema` already defined |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `insertBatch()` from `src/db/batch.ts` | N/A | Validated batch insert | Use for project_meta row insertion — already used for starters and code chunks |
| `connectDb()` from `src/db/connection.ts` | N/A | LanceDB connection | Standard connection utility |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| delete+insert upsert | check-then-insert/update (two branches) | More code, branching adds complexity, same outcome |
| Always seed on init | Seed only on fresh init (tables_created > 0) | Fresh-only misses re-init case; re-init behavior is a discretion item; always-seed is safer with guard against duplicates |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

No structural changes. All modifications are within existing files:
```
src/tools/
├── init-project.ts     # Add project_meta row seeding
└── index-codebase.ts   # Replace conditional update with upsert
test/
├── db/
│   └── init-project.test.ts          # Add project_meta row tests
└── tools/
    └── get-index-status.test.ts      # Add end-to-end flow test (init→index→status)
```

### Pattern 1: project_meta Row Seeding in initProject()

**What:** After starter seeding block, unconditionally seed the project_meta row. To remain idempotent on re-init, use delete-then-insert (same as upsert approach: delete existing row for this project_id, then insert fresh row).

**When to use:** Always — both fresh init (tables_created > 0) and re-init (tables_created == 0).

**Reasoning on re-init behavior:** The CONTEXT.md lists re-init behavior as a discretion item. The success criterion is "After init_project, project_meta table contains a row." On re-init, the row already exists (if the user called init_project once before). Two options:
1. **Always upsert (delete+insert):** Row always reflects the latest init call. Idempotent. Safe.
2. **Only seed on fresh init:** Row missing if user bypassed init (unlikely but possible in tests).

**Recommendation:** Always upsert (option 1). The `ast_import` edges already use this exact pattern. The `name` value on re-init will just re-use `projectId` as the name (no information loss since description/settings are null by default).

**Initial data values (discretion item):**
- `name`: use `projectId` — it's the only identifier we have at init time; user can update later
- `description`: `null` — no description provided at init time
- `settings`: `null` — no settings configured at init time
- `last_index_at`: `null` — not yet indexed
- `created_at` / `updated_at`: `new Date().toISOString()`

**Example:**
```typescript
// Source: src/tools/init-project.ts — after starter seeding block

// ── Seed project_meta row (always upsert for idempotency) ────────────────
const projectMetaTable = await db.openTable("project_meta");
// Delete any existing row for this project (handles re-init case)
await projectMetaTable.delete(`project_id = '${escapeSQL(projectId)}'`);
const now2 = new Date().toISOString();
await insertBatch(
  projectMetaTable,
  [
    {
      project_id: projectId,
      name: projectId,
      created_at: now2,
      updated_at: now2,
      description: null,
      last_index_at: null,
      settings: null,
    },
  ],
  ProjectMetaRowSchema,
);
```

Note: `escapeSQL()` is already defined in `index-codebase.ts`. For `init-project.ts`, either import it from a shared utility or inline a copy. Check whether there's a shared `escapeSQL` utility — if not, inline it or move to a shared location.

### Pattern 2: Upsert project_meta.last_index_at in indexCodebase()

**What:** Replace the current conditional-update block with a delete+insert upsert (lines 265-282 in `index-codebase.ts`).

**When to use:** At end of `indexCodebase()`, replacing the existing try/catch block.

**Example:**
```typescript
// Source: src/tools/index-codebase.ts — replaces lines 265-282

// ── 9. Update project_meta last_index_at (upsert) ────────────────────────
try {
  const projectMetaTable = await db.openTable("project_meta");
  // Query existing row to preserve created_at and other fields
  const existingMeta = await projectMetaTable
    .query()
    .where(`project_id = '${escapeSQL(projectId)}'`)
    .limit(1)
    .toArray();

  const now = new Date().toISOString();
  const created_at = existingMeta.length > 0
    ? (existingMeta[0].created_at as string)
    : now;

  // Delete + reinsert (upsert pattern — LanceDB has no native upsert)
  await projectMetaTable.delete(`project_id = '${escapeSQL(projectId)}'`);
  await insertBatch(
    projectMetaTable,
    [
      {
        project_id: projectId,
        name: existingMeta.length > 0 ? (existingMeta[0].name as string) : projectId,
        created_at,
        updated_at: now,
        description: existingMeta.length > 0 ? (existingMeta[0].description as string | null) : null,
        last_index_at: now,
        settings: existingMeta.length > 0 ? (existingMeta[0].settings as string | null) : null,
      },
    ],
    ProjectMetaRowSchema,
  );
} catch {
  // Non-critical: log but don't fail
  logger.warn({ projectId }, "Failed to update project_meta last_index_at");
}
```

**Alternative simpler upsert (if field preservation is not needed):** Since `name` defaults to `projectId` and other fields are all `null`, the delete+insert can be simplified by using known defaults instead of reading the existing row. This is acceptable because there is currently no API to update `name`/`description`/`settings` — they remain `projectId` and `null` throughout the v1 lifecycle.

```typescript
// Simplified version — acceptable if name/description/settings never change at v1
try {
  const projectMetaTable = await db.openTable("project_meta");
  const now = new Date().toISOString();
  await projectMetaTable.delete(`project_id = '${escapeSQL(projectId)}'`);
  await insertBatch(
    projectMetaTable,
    [{
      project_id: projectId,
      name: projectId,
      created_at: now,
      updated_at: now,
      description: null,
      last_index_at: now,
      settings: null,
    }],
    ProjectMetaRowSchema,
  );
} catch {
  logger.warn({ projectId }, "Failed to update project_meta last_index_at");
}
```

**Recommendation:** Use the simplified version. At v1, there is no path to update `name`/`description`/`settings` after init. The `created_at` field being reset on every index is a minor flaw but inconsequential — `last_index_at` is the only field consumers (get_index_status) actually read. If `created_at` preservation matters, use the read-then-write version. Flag in plan as a discretion call.

### Pattern 3: escapeSQL location

**What:** `escapeSQL()` is currently defined locally in `index-codebase.ts`. The `init-project.ts` file will also need it to build the delete predicate.

**Options:**
1. Inline a copy in `init-project.ts` — simple, no refactor needed
2. Extract to shared utility (e.g., `src/db/sql-utils.ts`) — cleaner but scope-creep for this phase

**Recommendation:** Inline in `init-project.ts`. This is a one-liner (`val.replace(/'/g, "''")`). Extraction is a Phase 9 cleanup concern, not Phase 8.

### Anti-Patterns to Avoid
- **Conditional insert (check-then-insert):** Don't use `if (existing.length > 0) { update } else { insert }` — this is the current bug pattern. Delete+insert is simpler and avoids the two-branch maintenance burden.
- **table.update() only:** LanceDB `table.update()` only updates existing rows. If no row exists, it silently does nothing. This was the exact bug introduced in Phase 6.
- **Seeding inside `if (tables_created > 0)` guard:** Don't gate the project_meta seeding on fresh-init only. The row might be absent even on re-init if it was never seeded (the current state of the database).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert primitive | Custom upsert abstraction | delete + insertBatch inline | The pattern is trivial (2 lines), appears in 2 places total — no abstraction needed |
| Row validation | Manual field validation | `ProjectMetaRowSchema` + `insertBatch()` | Already exists, already validates all 7 fields |
| SQL injection prevention | Custom escaping | `escapeSQL()` inline copy | Already established pattern for WHERE clauses |

**Key insight:** Everything needed exists. This phase is wiring, not building.

## Common Pitfalls

### Pitfall 1: table.update() silently no-ops on empty table
**What goes wrong:** `table.update({ where: "...", values: {...} })` returns successfully even when 0 rows match. The code at lines 273-278 of `index-codebase.ts` has this exact bug: `if (existing.length > 0)` is always false because init never seeds a row.
**Why it happens:** LanceDB `update()` is not an error condition for zero-row updates.
**How to avoid:** Use delete+insert pattern instead of update-only.
**Warning signs:** `get_index_status` always returns `last_index_at: null` after an index run.

### Pitfall 2: Forgetting to import ProjectMetaRowSchema in init-project.ts
**What goes wrong:** Build/runtime error — `ProjectMetaRowSchema` is not imported.
**Why it happens:** `init-project.ts` currently imports `DocumentRowSchema` from schema but not `ProjectMetaRowSchema`.
**How to avoid:** Add `ProjectMetaRowSchema` to the import from `"../db/schema.js"` on line 8 of `init-project.ts`.

### Pitfall 3: Re-init seeding doubles the row
**What goes wrong:** If `init_project` is called twice, a second row is inserted without deleting the first. `get_index_status` queries with `.limit(1)` so it only reads the first row — behavior is deterministic but the table has duplicate rows.
**Why it happens:** Insert without prior delete.
**How to avoid:** Delete existing row before inserting. The delete is a no-op if no row exists.

### Pitfall 4: IntoSql type for table.update() values
**What goes wrong:** TypeScript type error — `table.update()` requires `Record<string, IntoSql>` for the `values` parameter, not `Record<string, unknown>`.
**Why it happens:** LanceDB's TypeScript types enforce `IntoSql` on update values.
**How to avoid:** This pitfall does NOT apply to the recommended delete+insert approach. It only matters if reverting to `table.update()`. Document: if update() is used, import `IntoSql` from `@lancedb/lancedb`.

### Pitfall 5: LanceDB cache — must open fresh connection to read updated rows
**What goes wrong:** After inserting/deleting rows via one `db` handle, re-querying via the same `table` object may return stale cached results.
**Why it happens:** LanceDB table objects cache state (documented in Phase 04-03 decision).
**How to avoid:** In tests, open a fresh `lancedb.connect()` + `openTable()` after writes to read back the result. Within the same `indexCodebase()` call, this is not an issue since we open `projectMetaTable` fresh each time.

### Pitfall 6: ProjectMetaRowSchema name field is .min(1), not nullable
**What goes wrong:** Passing `null` or `""` for `name` fails Zod validation inside `insertBatch()`.
**Why it happens:** `ProjectMetaRowSchema` defines `name: z.string().min(1)` — it is NOT nullable.
**How to avoid:** Always pass a non-empty string for `name`. Use `projectId` as default (it satisfies the slug format constraint already validated by `initProject()`).

## Code Examples

Verified patterns from existing codebase:

### Delete-then-insert pattern (ast_import edges in index-codebase.ts)
```typescript
// Source: src/tools/index-codebase.ts lines 235-253
// Delete ALL existing ast_import edges for this project
await relTable.delete(
  `source = 'ast_import' AND project_id = '${escapeSQL(projectId)}'`,
);

// Insert all new edges
if (allEdges.length > 0) {
  const edgeRows = allEdges.map((edge) => ({
    relationship_id: ulid(),
    project_id: projectId,
    // ...
  }));
  await insertBatch(relTable, edgeRows, RelationshipRowSchema);
}
```

### Starter document seeding (current pattern in init-project.ts)
```typescript
// Source: src/tools/init-project.ts lines 259-263
if (starterRows.length > 0) {
  await insertBatch(docsTable, starterRows, DocumentRowSchema);
  starters_seeded = starterRows.length;
}
```

### project_meta row shape (from test/db/init-project.test.ts lines 63-79)
```typescript
// Source: test/db/init-project.test.ts — currently inserted manually in test setup
{
  project_id: "proj",
  name: "Test Project",
  created_at: now,
  updated_at: now,
  description: null,
  last_index_at: null,
  settings: null,
}
```

### table.delete() predicate syntax
```typescript
// Source: src/tools/index-codebase.ts lines 118-124
await codeChunksTable.delete(
  `file_path = '${escapeSQL(f)}' AND project_id = '${escapeSQL(projectId)}'`,
);
```

### get_index_status reading project_meta (works once row exists)
```typescript
// Source: src/tools/get-index-status.ts lines 62-69 — NO CHANGES NEEDED
const metaRows = await metaTable
  .query()
  .where(`project_id = '${projectId}'`)
  .limit(1)
  .toArray();
const lastIndexAt: string | null =
  metaRows.length > 0 ? ((metaRows[0].last_index_at as string | null) ?? null) : null;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Conditional `if (existing.length > 0) update` | Delete+insert upsert | This phase | Fixes the bug — row always exists after init, always updated after index |

**Deprecated/outdated:**
- Conditional update pattern in `index-codebase.ts` lines 273-278: replaced by delete+insert.

## Open Questions

1. **Should `init-project.ts` reset `last_index_at` to null on re-init?**
   - What we know: The delete+insert approach always resets `last_index_at` to null on re-init (since we insert a fresh row). This means calling `init_project` on an already-indexed project will clear `last_index_at` until `index_codebase` is called again.
   - What's unclear: Whether this is desirable behavior. Users typically call `init_project` once, not repeatedly.
   - Recommendation: Accept this behavior. Re-init is an edge case. If a user explicitly re-inits their project, requiring a re-index is reasonable. Success criterion 1 says "After init_project, project_meta table contains a row with last_index_at as null" — which our approach satisfies.

2. **Should `escapeSQL` be moved to a shared utility module?**
   - What we know: It's currently duplicated only in `index-codebase.ts`. Adding it to `init-project.ts` creates a second copy.
   - What's unclear: Whether Phase 8 scope permits a refactor.
   - Recommendation: Inline it in `init-project.ts` for Phase 8. Log as tech debt for cleanup. The function is a one-liner.

## Validation Architecture

> nyquist_validation is not present in .planning/config.json (workflow.nyquist_validation key absent — treated as false). Skipping this section.

*Note: The project uses bun:test. Test command: `bun test`. Existing test infrastructure is comprehensive and covers this phase well.*

### Test Map (informational — not gated)

| Req ID | Behavior | Test Type | File |
|--------|----------|-----------|------|
| CSRCH-04 | After init_project, project_meta has a row with last_index_at=null | unit | `test/db/init-project.test.ts` (new test) |
| CSRCH-04 | After index_codebase, last_index_at is set (upsert works) | integration | `test/tools/get-index-status.test.ts` (new test) |
| CSRCH-04 | Running index_codebase twice updates (not duplicates) the row | integration | `test/tools/get-index-status.test.ts` (new test) |
| CSRCH-04 | get_index_status returns non-null last_index_at after init→index flow | e2e | `test/tools/get-index-status.test.ts` (new test) |

### Wave 0 Gaps
- [ ] New tests in `test/db/init-project.test.ts` — covers project_meta row seeding
- [ ] New tests in `test/tools/get-index-status.test.ts` — covers end-to-end init→index→status flow

*(Framework already installed — bun:test. No new packages needed.)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/tools/init-project.ts` — confirmed: no project_meta row insertion exists
- Direct code inspection: `src/tools/index-codebase.ts` lines 265-282 — confirmed: conditional update that never fires
- Direct code inspection: `src/tools/get-index-status.ts` lines 62-69 — confirmed: correct query, no changes needed
- Direct code inspection: `src/db/schema.ts` lines 165-173 — `ProjectMetaRowSchema` with all 7 fields; `name` is `.string().min(1)` (not nullable)
- Direct code inspection: `src/db/batch.ts` — `insertBatch()` ready for use
- Test run: `bun test test/db/init-project.test.ts` — 17 pass, 0 fail (confirms baseline)
- Test run: `bun test test/tools/get-index-status.test.ts` — 9 pass, 0 fail (confirms baseline)
- Established pattern: Phase 06-04 decision log — delete-then-reinsert strategy already used for ast_import edges
- Established pattern: Phase 04-03 decision log — `IntoSql` type required for `table.update()` values

### Secondary (MEDIUM confidence)
- CONTEXT.md `<code_context>` section — confirmed against actual source code; all integration points match

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing utilities verified in source
- Architecture: HIGH — delete+insert pattern already established for ast_import edges; escapeSQL pattern established for WHERE clauses
- Pitfalls: HIGH — derived from existing codebase decisions (STATE.md Phase 04-03, 06-04) and direct code inspection

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain — internal wiring fix with no external dependencies)
