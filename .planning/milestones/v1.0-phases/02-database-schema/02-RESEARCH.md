# Phase 2: Database Schema - Research

**Researched:** 2026-02-27
**Domain:** LanceDB table creation, Arrow schemas, Zod v4, ULID generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Table initialization behavior:**
- init_project skips existing tables — check if each table exists, only create missing ones, never drop data
- Auto-create database directory and all tables — zero manual setup, just pass a path
- Single init_project call creates all 5 tables — agents don't need to know internal table structure
- Return creation summary: `{ tables_created, tables_skipped, database_path, project_id }`
- Idempotent: re-running with same project_id returns existing project info without error

**Schema strictness & defaults:**
- V2 forward-compatibility fields (parent_id, depth, decision_type) are purely null until v2 features are built — no placeholder defaults
- Application-layer validation only via Zod — no reliance on LanceDB type enforcement
- Single shared Zod schema source of truth — MCP tool inputs and DB inserts both derive from it
- Timestamps stored as ISO 8601 strings ('2026-02-27T12:00:00Z') across all tables
- All ID fields (doc_id, chunk_id, relationship_id, project_id) use ULIDs — sortable by creation time, URL-safe
- Array/list fields (tags, imports, exports) stored as JSON-serialized strings — parse on read
- Each table's schema defined as a frozen constant exported from a shared schemas file
- Vector dimension (768) enforced via runtime assertion before insert, not at schema type level

**Batched insert pattern:**
- All chunks from one document inserted in a single LanceDB `add()` call — no partial documents on failure
- Insert helper validates every row against Zod schema before sending batch — fail fast with clear error
- Fail immediately on insert error — no retries, return clear error with context (table name, row count, error message)
- Generic `insertBatch(table, rows, schema)` function — one function works for all 5 tables

**Multi-project isolation:**
- Default deployment: one LanceDB database per project (path via --db flag) — portable, team-shareable
- project_id column exists in every table with BTree index — enables optional multi-project-in-one-DB scenarios
- project_id is user-provided name/slug (e.g., 'synapse', 'my-api') — human-readable, predictable
- Re-init with same project_id is allowed and idempotent — returns existing project info
- Include delete_project tool that removes all rows matching a project_id across all tables

### Claude's Discretion
- Exact Arrow schema field ordering within tables
- BTree index configuration details
- Internal error message formatting
- Temp file or lock handling during batch inserts

### Deferred Ideas (OUT OF SCOPE)
- Schema migration tooling (altering existing table schemas) — future phase if needed
- Cross-project reference/knowledge sharing — future capability
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-03 | init_project creates LanceDB database with 5 tables (documents, code_chunks, relationships, project_meta, activity_log) and all indexes | LanceDB `createEmptyTable` with Arrow schema + `existOk:true` pattern; BTree index via `table.createIndex(col, { config: lancedb.Index.btree() })` |
| FOUND-05 | All queries are scoped by project_id for multi-project support | project_id column in every Arrow schema; BTree index on project_id; `table.delete("project_id = 'x'")` for delete_project |
| FOUND-06 | Schema includes v2 forward-compatibility fields (parent_id, depth, decision_type) on documents table | Arrow `Field` with `nullable: true` as 3rd constructor parameter; confirmed via Context7 lancedb docs |
</phase_requirements>

## Summary

LanceDB's TypeScript SDK (pinned at `@lancedb/lancedb@0.26.2` per project decisions) provides `db.createEmptyTable(name, schema, options)` with an `existOk: true` option that makes the call a no-op if the table already exists — this is the canonical idempotent table creation primitive. Arrow schemas are defined using the `Schema` and `Field` classes re-exported by `@lancedb/lancedb`; nullable fields use the 3rd boolean argument to `Field`. Scalar BTree indexes are created post-table-creation via `table.createIndex(column, { config: lancedb.Index.btree() })`.

The project already commits to Zod v4 (confirmed pinned at `^4.0.0`, resolved to v4.3.6 in bun.lock). The single-source-of-truth pattern — one Zod schema per table, Arrow schema derived from the same shape — is the right architecture. ULID generation should use `ulidx` (the actively maintained successor to the now-abandoned `ulid` package), which has full TypeScript types and uses Node's `crypto.randomBytes` internally.

The two hardest decisions in this phase are: (1) how to represent the `vector` column (768-dimensional `Float32` `FixedSizeList`) in an empty table schema without requiring the embedding service (Phase 3), and (2) how to handle the idempotent `init_project` return value when tables already exist. Both are solvable with the patterns documented below.

**Primary recommendation:** Use `db.createEmptyTable(name, arrowSchema, { existOk: true })` for each of the 5 tables, driven by a loop over frozen schema constants. Create BTree indexes on `project_id` immediately after each table. Expose `init_project` and `delete_project` as MCP tools following the `registerXTool(server, config, ...)` pattern from Phase 1.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lancedb/lancedb` | 0.26.2 (pinned) | Vector DB — create tables, add rows, delete rows, create indexes | Project decision; 0.27.x-beta has breaking insert API change |
| `zod` | ^4.0.0 (resolved 4.3.6) | Runtime schema validation for all inserts | Already installed; project decision for single source of truth |
| `ulidx` | latest (^2.4.1) | ULID generation for all ID fields | Active maintained replacement for abandoned `ulid`; full TS types; uses Node crypto |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` (built-in) | — | `mkdirSync` to auto-create DB directory | In `init_project` before `lancedb.connect()` |
| `node:path` (built-in) | — | Resolve absolute DB paths | In `init_project` path normalization |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ulidx` | `crypto.randomUUID()` (built-in) | UUIDs not sortable; ULIDs are time-ordered and URL-safe — project decision mandates ULIDs |
| `ulidx` | original `ulid` package | `ulid` is unmaintained with open compatibility bugs; `ulidx` is the community successor |
| Arrow `Field` nullability | Omitting nullable fields entirely | LanceDB schema is immutable after first write; must define v2 fields now as nullable |

**Installation:**
```bash
bun add ulidx
# @lancedb/lancedb is not yet installed — add it now pinned to 0.26.2:
bun add @lancedb/lancedb@0.26.2
# Do NOT add apache-arrow separately — let lancedb manage its pinned version
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── schema.ts        # Arrow schemas + Zod schemas as frozen constants (source of truth)
│   ├── connection.ts    # lancedb.connect() wrapper — returns db handle
│   └── batch.ts         # Generic insertBatch(table, rows, zodSchema) helper
├── tools/
│   ├── init-project.ts  # registerInitProjectTool(server, config)
│   ├── delete-project.ts # registerDeleteProjectTool(server, config)
│   ├── ping.ts          # (existing)
│   └── echo.ts          # (existing)
├── types.ts             # (existing — ToolResult, SynapseConfig)
├── config.ts            # (existing)
├── server.ts            # (existing — add init_project + delete_project registrations)
├── logger.ts            # (existing)
└── index.ts             # (existing)
```

### Pattern 1: Idempotent Table Creation with `existOk`

**What:** Create all 5 tables in a single loop with `existOk: true` so re-runs are safe.
**When to use:** Every time `init_project` is called.

```typescript
// Source: Context7 /lancedb/lancedb — CreateTableOptions interface
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect(dbPath);
const existingNames = new Set(await db.tableNames());

const results = { tables_created: 0, tables_skipped: 0 };

for (const [name, schema] of Object.entries(TABLE_SCHEMAS)) {
  if (existingNames.has(name)) {
    results.tables_skipped++;
  } else {
    await db.createEmptyTable(name, schema, { existOk: true });
    // Create BTree index on project_id immediately
    const table = await db.openTable(name);
    await table.createIndex("project_id", { config: lancedb.Index.btree() });
    results.tables_created++;
  }
}
```

**Key insight:** `existOk: true` with `mode: "create"` (the default) is a strict no-op when the table already exists — it does NOT overwrite or truncate. This is confirmed in Context7 `CreateTableOptions.existOk` docs: "If existOk is set to true and the table already exists, and the mode is set to 'create', then no error will be raised, and the operation will proceed without issue."

### Pattern 2: Arrow Schema Definition with Nullable Fields

**What:** Define each table's schema as a frozen constant using LanceDB-re-exported Arrow types.
**When to use:** In `src/db/schema.ts`.

```typescript
// Source: Context7 /lancedb/lancedb — Schema, Field, FixedSizeList, Utf8, Float32, etc.
import * as lancedb from "@lancedb/lancedb";

// Field(name, type, nullable)  ← 3rd arg = nullable boolean
export const DOCUMENTS_SCHEMA = new lancedb.Schema([
  new lancedb.Field("doc_id",         new lancedb.Utf8(),  false),
  new lancedb.Field("project_id",     new lancedb.Utf8(),  false),
  new lancedb.Field("title",          new lancedb.Utf8(),  false),
  new lancedb.Field("content",        new lancedb.Utf8(),  false),
  new lancedb.Field("category",       new lancedb.Utf8(),  false),
  new lancedb.Field("status",         new lancedb.Utf8(),  false),
  new lancedb.Field("version",        new lancedb.Int32(), false),
  new lancedb.Field("created_at",     new lancedb.Utf8(),  false),  // ISO 8601
  new lancedb.Field("updated_at",     new lancedb.Utf8(),  false),  // ISO 8601
  new lancedb.Field("tags",           new lancedb.Utf8(),  false),  // JSON string: string[]
  new lancedb.Field("phase",          new lancedb.Utf8(),  true),
  new lancedb.Field("priority",       new lancedb.Int32(), true),
  // v2 forward-compatibility fields — null until v2 features built
  new lancedb.Field("parent_id",      new lancedb.Utf8(),  true),
  new lancedb.Field("depth",          new lancedb.Int32(), true),
  new lancedb.Field("decision_type",  new lancedb.Utf8(),  true),
]) as const;
```

**Critical:** Do NOT include a `vector` column in the documents table schema — vectors belong in `code_chunks`. The documents table stores text for FTS; embedding happens in Phase 3 tools.

Wait — re-reading requirements: code_chunks needs vectors (768-dim). Let's define that separately:

```typescript
// code_chunks table — includes 768-dim vector column
export const CODE_CHUNKS_SCHEMA = new lancedb.Schema([
  new lancedb.Field("chunk_id",    new lancedb.Utf8(),   false),
  new lancedb.Field("project_id",  new lancedb.Utf8(),   false),
  new lancedb.Field("doc_id",      new lancedb.Utf8(),   false),
  new lancedb.Field("content",     new lancedb.Utf8(),   false),
  new lancedb.Field("file_path",   new lancedb.Utf8(),   false),
  new lancedb.Field("symbol_name", new lancedb.Utf8(),   true),
  new lancedb.Field("symbol_type", new lancedb.Utf8(),   true),
  new lancedb.Field("scope_chain", new lancedb.Utf8(),   true),
  new lancedb.Field("imports",     new lancedb.Utf8(),   false),  // JSON string
  new lancedb.Field("exports",     new lancedb.Utf8(),   false),  // JSON string
  new lancedb.Field("start_line",  new lancedb.Int32(),  true),
  new lancedb.Field("end_line",    new lancedb.Int32(),  true),
  new lancedb.Field("language",    new lancedb.Utf8(),   true),
  new lancedb.Field("created_at",  new lancedb.Utf8(),   false),  // ISO 8601
  new lancedb.Field("vector",
    new lancedb.FixedSizeList(768, new lancedb.Field("item", new lancedb.Float32(), true)),
    false),
]);
```

### Pattern 3: Generic `insertBatch` with Zod Validation

**What:** One function validates + inserts rows for any table.
**When to use:** All future phases that write data.

```typescript
// Source: Context7 /lancedb/lancedb — table.add() + /colinhacks/zod — safeParse
import type { Table } from "@lancedb/lancedb";
import type { ZodSchema } from "zod";

export async function insertBatch<T>(
  table: Table,
  rows: T[],
  schema: ZodSchema<T>,
): Promise<void> {
  // Validate every row before touching the DB — fail fast
  for (let i = 0; i < rows.length; i++) {
    const result = schema.safeParse(rows[i]);
    if (!result.success) {
      throw new Error(
        `Row ${i} failed validation for table '${table.name}': ` +
        result.error.issues.map(e => e.message).join("; ")
      );
    }
  }
  // Single atomic add — all-or-nothing per decision
  await table.add(rows as Record<string, unknown>[]);
}
```

### Pattern 4: `delete_project` via SQL Predicate

**What:** Delete all rows for a project_id across all 5 tables.
**When to use:** `delete_project` MCP tool.

```typescript
// Source: Context7 /lancedb/lancedb — table.delete(predicate)
async function deleteProject(db: lancedb.Connection, projectId: string): Promise<void> {
  const predicate = `project_id = '${projectId}'`;
  for (const tableName of TABLE_NAMES) {
    const existing = await db.tableNames();
    if (existing.includes(tableName)) {
      const table = await db.openTable(tableName);
      await table.delete(predicate);
    }
  }
}
```

**Warning:** SQL injection is not a concern here (projectId is validated by Zod as a slug/string before reaching this call) but must be clearly documented.

### Pattern 5: ULID Generation

**What:** Generate time-sorted unique IDs for all ID fields.

```typescript
// Source: ulidx README — https://github.com/perry-mitchell/ulidx
import { ulid } from "ulidx";

const doc_id = ulid();          // "01ARYZ6S41TSV4RRFFQ69G5FAV"
const chunk_id = ulid();
const project_id = "my-api";   // user-provided slug, not generated
```

### Anti-Patterns to Avoid

- **Importing `apache-arrow` directly:** LanceDB pins its own Arrow version. A separate `apache-arrow` install causes TypeScript type mismatch errors (confirmed in project STATE.md pre-build decision).
- **Calling `createIndex` before the table has data:** BTree index creation on empty tables should work but verify in practice — if it errors, create index after first insert instead.
- **Using `mode: "overwrite"` for idempotent init:** This drops and recreates the table, destroying data. The correct primitive is `existOk: true` with default `mode: "create"`.
- **Storing vectors in `documents` table:** Documents are text-only; vectors live in `code_chunks`. Mixing concerns creates confusion and schema bloat.
- **Storing arrays natively:** LanceDB supports Arrow `List` types but the project decision is JSON-serialized strings for `tags`, `imports`, `exports` — parse on read, serialize on write.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent table creation | Conditional `createTable` + catch | `existOk: true` option | Race-condition safe; official API |
| Unique sortable IDs | UUID + timestamp composite | `ulidx` `ulid()` | Spec-compliant, monotonic, URL-safe |
| Row validation | Manual field checks | Zod `schema.safeParse()` | Type inference, composable, already installed |
| Batch delete by project | Loop deleting row-by-row | `table.delete(predicate)` | Single version write, efficient |
| Table existence check | Try/catch `openTable` | `db.tableNames()` + `Set.has()` | Predictable, no exception flow |

**Key insight:** LanceDB's `existOk` is the entire idempotency solution. There is no need to build a check-then-create pattern — the option is designed exactly for this use case.

## Common Pitfalls

### Pitfall 1: Schema Immutability After First Write

**What goes wrong:** Adding a column to a LanceDB table after the first row is written is not possible without a migration tool (which is out of scope). If the v2 forward-compatibility fields (`parent_id`, `depth`, `decision_type`) are not included in the initial schema, they can never be added later without a full table rebuild.

**Why it happens:** LanceDB uses the Lance columnar format, which is append-only and schema-locked per the format spec.

**How to avoid:** All nullable v2 fields MUST be in the Arrow schema for `documents` at table creation time. Confirmed as Arrow `Field("parent_id", Utf8(), true)` — the `true` nullable flag is essential.

**Warning signs:** Any future phase trying to add columns via ALTER TABLE or schema extension will fail silently or error.

### Pitfall 2: `apache-arrow` Version Conflict

**What goes wrong:** If `apache-arrow` is installed separately (e.g., `bun add apache-arrow`), TypeScript sees two different Arrow type definitions. Passing a `Schema` from `apache-arrow` to `@lancedb/lancedb` APIs fails with type errors even though they look identical.

**Why it happens:** `@lancedb/lancedb` bundles its own pinned Arrow dependency. Two Arrow namespaces exist in node_modules.

**How to avoid:** Import ALL Arrow types exclusively from `@lancedb/lancedb`. Never `import { Schema } from "apache-arrow"`. This is a confirmed project pre-build decision in STATE.md.

**Warning signs:** TypeScript errors like "Type 'Schema' is not assignable to type 'Schema'" with identical-looking types.

### Pitfall 3: BTree Index on Empty Table

**What goes wrong:** `table.createIndex(col, { config: lancedb.Index.btree() })` may fail on a truly empty table (0 rows) in some LanceDB versions. This is an open GitHub issue pattern observed in the lancedb repo.

**Why it happens:** Index building may require at least one row to determine statistics.

**How to avoid:** Create BTree indexes immediately after table creation but handle the case where the index call fails on an empty table gracefully (wrap in try/catch, log warning, skip). The index can be created on first insert if needed. Alternatively, test this in a Wave 0 unit test before assuming it works.

**Warning signs:** `createIndex` throwing an error with message about empty table or no data.

**Confidence:** MEDIUM — verified as a pattern in LanceDB GitHub issues but not confirmed for v0.26.2 specifically.

### Pitfall 4: `tableNames()` Returns Lexicographic Order, Not Creation Order

**What goes wrong:** Code that relies on `tableNames()` returning tables in creation order will break. It returns them alphabetically.

**Why it happens:** Confirmed in Context7 LanceDB docs: "listed in lexicographical order."

**How to avoid:** Always use `Set.has()` for existence checks; never index by position into the `tableNames()` array.

### Pitfall 5: ISO 8601 String Timestamps in LanceDB Queries

**What goes wrong:** Filtering by timestamp range requires SQL string comparison, which only works correctly if all timestamps are zero-padded ISO 8601 (`2026-02-27T12:00:00Z`). Non-standard formats break lexicographic ordering.

**Why it happens:** LanceDB doesn't have a native timestamp Arrow type in this context (timestamps stored as `Utf8` per project decision).

**How to avoid:** Always generate timestamps via `new Date().toISOString()` — this produces the correct zero-padded UTC format.

### Pitfall 6: `project_id` SQL Injection in Delete Predicate

**What goes wrong:** If `project_id` contains a SQL special character (single quote, semicolon), the predicate `project_id = '${id}'` could break or behave unexpectedly.

**Why it happens:** LanceDB's `delete(predicate)` uses a SQL-like filter string.

**How to avoid:** Validate `project_id` via Zod as a slug (`z.string().regex(/^[a-z0-9-_]+$/)`) before it reaches the delete call. This is application-layer validation per project decisions.

## Code Examples

Verified patterns from official sources:

### Create Empty Table (Idempotent)

```typescript
// Source: Context7 /lancedb/lancedb — CreateTableOptions.existOk
import * as lancedb from "@lancedb/lancedb";
import { mkdirSync } from "node:fs";
import { DOCUMENTS_SCHEMA, CODE_CHUNKS_SCHEMA, RELATIONSHIPS_SCHEMA,
         PROJECT_META_SCHEMA, ACTIVITY_LOG_SCHEMA, TABLE_NAMES } from "./schema.js";

const TABLE_SCHEMA_MAP = {
  documents:     DOCUMENTS_SCHEMA,
  code_chunks:   CODE_CHUNKS_SCHEMA,
  relationships: RELATIONSHIPS_SCHEMA,
  project_meta:  PROJECT_META_SCHEMA,
  activity_log:  ACTIVITY_LOG_SCHEMA,
} as const;

export async function initProject(dbPath: string, projectId: string) {
  mkdirSync(dbPath, { recursive: true });
  const db = await lancedb.connect(dbPath);
  const existing = new Set(await db.tableNames());

  let tables_created = 0;
  let tables_skipped = 0;

  for (const [name, schema] of Object.entries(TABLE_SCHEMA_MAP)) {
    if (existing.has(name)) {
      tables_skipped++;
    } else {
      await db.createEmptyTable(name, schema, { existOk: true });
      const table = await db.openTable(name);
      // BTree index on project_id for multi-project scoping (FOUND-05)
      await table.createIndex("project_id", { config: lancedb.Index.btree() });
      tables_created++;
    }
  }

  return {
    tables_created,
    tables_skipped,
    database_path: dbPath,
    project_id: projectId,
  };
}
```

### BTree Index Creation

```typescript
// Source: Context7 /lancedb/lancedb — createIndex with btree config
await table.createIndex("project_id", {
  config: lancedb.Index.btree(),
});
```

### Generic insertBatch

```typescript
// Source: Context7 /lancedb/lancedb — table.add(); /colinhacks/zod — safeParse
import type { Table } from "@lancedb/lancedb";
import type { ZodTypeAny, z } from "zod";

export async function insertBatch<S extends ZodTypeAny>(
  table: Table,
  rows: z.infer<S>[],
  zodSchema: S,
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const result = zodSchema.safeParse(rows[i]);
    if (!result.success) {
      const msgs = result.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new Error(`[insertBatch] Row ${i} invalid for table '${table.name}': ${msgs}`);
    }
  }
  await table.add(rows as Record<string, unknown>[]);
}
```

### ULID Generation

```typescript
// Source: ulidx README — https://github.com/perry-mitchell/ulidx/blob/main/README.md
import { ulid } from "ulidx";

const newDocId = ulid();       // "01JNMKQ..." — time-sortable
const newChunkId = ulid();
```

### Zod Schema for Document Row (source of truth pattern)

```typescript
// src/db/schema.ts — Zod schema drives both MCP input validation and DB insert validation
import { z } from "zod";
import * as lancedb from "@lancedb/lancedb";

export const DocumentRowSchema = z.object({
  doc_id:        z.string().ulid(),         // or z.string().min(26).max(26) if .ulid() not in v4
  project_id:    z.string().min(1),
  title:         z.string().min(1),
  content:       z.string(),
  category:      z.string().min(1),
  status:        z.string().min(1),
  version:       z.number().int().min(1),
  created_at:    z.string().datetime(),     // ISO 8601 enforced by Zod
  updated_at:    z.string().datetime(),
  tags:          z.string(),               // JSON string — parse on read
  phase:         z.string().nullable(),
  priority:      z.number().int().nullable(),
  parent_id:     z.string().nullable(),    // v2 forward-compatibility
  depth:         z.number().int().nullable(),
  decision_type: z.string().nullable(),
});

export type DocumentRow = z.infer<typeof DocumentRowSchema>;

// Arrow schema matches Zod schema exactly — no type drift
export const DOCUMENTS_SCHEMA = new lancedb.Schema([
  new lancedb.Field("doc_id",         new lancedb.Utf8(),  false),
  new lancedb.Field("project_id",     new lancedb.Utf8(),  false),
  new lancedb.Field("title",          new lancedb.Utf8(),  false),
  new lancedb.Field("content",        new lancedb.Utf8(),  false),
  new lancedb.Field("category",       new lancedb.Utf8(),  false),
  new lancedb.Field("status",         new lancedb.Utf8(),  false),
  new lancedb.Field("version",        new lancedb.Int32(), false),
  new lancedb.Field("created_at",     new lancedb.Utf8(),  false),
  new lancedb.Field("updated_at",     new lancedb.Utf8(),  false),
  new lancedb.Field("tags",           new lancedb.Utf8(),  false),
  new lancedb.Field("phase",          new lancedb.Utf8(),  true),
  new lancedb.Field("priority",       new lancedb.Int32(), true),
  new lancedb.Field("parent_id",      new lancedb.Utf8(),  true),
  new lancedb.Field("depth",          new lancedb.Int32(), true),
  new lancedb.Field("decision_type",  new lancedb.Utf8(),  true),
]);
```

### Complete Table Schema Inventory

Below is the recommended field list for all 5 tables (planner should freeze these):

**`documents`** (see Zod example above)

**`code_chunks`**
- chunk_id (Utf8, not null), project_id (Utf8, not null), doc_id (Utf8, not null)
- file_path (Utf8, not null), symbol_name (Utf8, nullable), symbol_type (Utf8, nullable)
- scope_chain (Utf8, nullable), content (Utf8, not null), language (Utf8, nullable)
- imports (Utf8, not null — JSON string), exports (Utf8, not null — JSON string)
- start_line (Int32, nullable), end_line (Int32, nullable)
- created_at (Utf8, not null — ISO 8601), file_hash (Utf8, nullable)
- vector (FixedSizeList(768, Float32), not null) — empty until Phase 3 writes real data

**`relationships`**
- relationship_id (Utf8, not null), project_id (Utf8, not null)
- from_id (Utf8, not null), to_id (Utf8, not null), type (Utf8, not null)
- source (Utf8, not null — "manual" or "ast_import"), created_at (Utf8, not null)
- metadata (Utf8, nullable — JSON string for future extensibility)

**`project_meta`**
- project_id (Utf8, not null), name (Utf8, not null), created_at (Utf8, not null)
- updated_at (Utf8, not null), description (Utf8, nullable)
- last_index_at (Utf8, nullable — ISO 8601)
- settings (Utf8, nullable — JSON string for future extensibility)

**`activity_log`**
- log_id (Utf8, not null), project_id (Utf8, not null)
- actor (Utf8, not null), action (Utf8, not null)
- target_id (Utf8, nullable), target_type (Utf8, nullable)
- metadata (Utf8, nullable — JSON string), created_at (Utf8, not null)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ulid` npm package | `ulidx` npm package | ~2022 | `ulid` is unmaintained; `ulidx` has ESM support and active maintenance |
| `createTable` + catch for idempotency | `existOk: true` option | LanceDB ~0.10+ | Clean no-op without exception handling |
| `mode: "errorIfExist"` (old default name) | `mode: "create"` (current default) | LanceDB API update | Default behavior unchanged; naming clarified |

**Deprecated/outdated:**
- `lancedb` (old package name): The package was renamed to `@lancedb/lancedb`. Old `lancedb` on npm is a different/legacy package.
- `table.create_index()` (Python snake_case): In TypeScript use `table.createIndex()` (camelCase). Docs sometimes mix the two.

## Open Questions

1. **BTree index creation on empty table — does it work in v0.26.2?**
   - What we know: Context7 and official docs show `table.createIndex(col, { config: lancedb.Index.btree() })` without mentioning an empty-table restriction.
   - What's unclear: A GitHub issue pattern suggests it may fail when no rows exist; not confirmed for v0.26.2 specifically.
   - Recommendation: Write a unit test that creates an empty table and immediately calls `createIndex` — fail-fast if it errors. If it does fail, defer index creation to a post-first-insert hook.

2. **`code_chunks` vector column in empty table — does `Float32` FixedSizeList work with zero rows?**
   - What we know: LanceDB GitHub issue #1293 describes a bug with Float64 vectors on empty tables (since fixed). The pattern for Float32 FixedSizeList is well-documented.
   - What's unclear: Whether an empty table with a 768-dim Float32 vector column causes any issues in v0.26.2 specifically, or whether Phase 3 tools can insert rows without the embedding service running.
   - Recommendation: The schema should define the vector column; Phase 3 embedding tools will be responsible for supplying 768-dim vectors. No zero-vector placeholder should be inserted here.

3. **`z.string().ulid()` in Zod v4?**
   - What we know: Zod v3 has `.ulid()` validator. Zod v4 changes many method signatures.
   - What's unclear: Whether `.ulid()` is still available in Zod v4.3.6 (the resolved version).
   - Recommendation: Fall back to `z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)` if `.ulid()` is not available in v4. Verify in Phase 2 code.

## Sources

### Primary (HIGH confidence)
- `/lancedb/lancedb` via Context7 — table creation, `existOk`, `tableNames()`, BTree index, `table.add()`, `table.delete()`, Arrow schema types, FixedSizeList, Field nullability
- `/colinhacks/zod` via Context7 — Zod v4 object schema, `safeParse`, nullable, optional, type inference
- `src/server.ts`, `src/config.ts`, `src/types.ts` — existing project patterns (registerXTool, ToolResult, SynapseConfig shapes)
- `.planning/STATE.md` — pre-build decisions: pin lancedb 0.26.2, no separate apache-arrow, Zod v4 confirmed

### Secondary (MEDIUM confidence)
- [ulidx GitHub README](https://github.com/perry-mitchell/ulidx/blob/main/README.md) — API, import syntax, Node.js crypto usage
- [ulidx npm page](https://www.npmjs.com/package/ulidx) — confirmed actively maintained, TypeScript native
- WebSearch confirming `ulid` package abandoned, `ulidx` as successor — multiple sources agree

### Tertiary (LOW confidence)
- BTree index on empty table caveat — observed as pattern in LanceDB GitHub issues but not confirmed for v0.26.2; flag for Wave 0 testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — lancedb pinned by project decision; ulidx confirmed via official README; Zod v4 confirmed in bun.lock
- Architecture: HIGH — `existOk` confirmed via Context7 official docs; Arrow field patterns confirmed; tool registration pattern confirmed from Phase 1 code
- Pitfalls: MEDIUM — schema immutability and apache-arrow conflict are HIGH (confirmed in project STATE.md); BTree empty-table issue is LOW (unverified for this version)

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (30 days — LanceDB 0.26.x is pinned, stable)
