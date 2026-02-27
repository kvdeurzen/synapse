# Phase 2: Database Schema - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Define and freeze all 5 LanceDB table schemas (documents, code_chunks, relationships, project_meta, activity_log) with v2 forward-compatibility fields, establish the batched insert pattern, and provide init_project / delete_project tools. No business logic beyond schema creation, initialization, and project cleanup.

</domain>

<decisions>
## Implementation Decisions

### Table initialization behavior
- init_project skips existing tables — check if each table exists, only create missing ones, never drop data
- Auto-create database directory and all tables — zero manual setup, just pass a path
- Single init_project call creates all 5 tables — agents don't need to know internal table structure
- Return creation summary: { tables_created, tables_skipped, database_path, project_id }
- Idempotent: re-running with same project_id returns existing project info without error

### Schema strictness & defaults
- V2 forward-compatibility fields (parent_id, depth, decision_type) are purely null until v2 features are built — no placeholder defaults
- Application-layer validation only via Zod — no reliance on LanceDB type enforcement
- Single shared Zod schema source of truth — MCP tool inputs and DB inserts both derive from it
- Timestamps stored as ISO 8601 strings ('2026-02-27T12:00:00Z') across all tables
- All ID fields (doc_id, chunk_id, relationship_id, project_id) use ULIDs — sortable by creation time, URL-safe
- Array/list fields (tags, imports, exports) stored as JSON-serialized strings — parse on read
- Each table's schema defined as a frozen constant exported from a shared schemas file
- Vector dimension (768) enforced via runtime assertion before insert, not at schema type level

### Batched insert pattern
- All chunks from one document inserted in a single LanceDB add() call — no partial documents on failure
- Insert helper validates every row against Zod schema before sending batch — fail fast with clear error
- Fail immediately on insert error — no retries, return clear error with context (table name, row count, error message)
- Generic insertBatch(table, rows, schema) function — one function works for all 5 tables

### Multi-project isolation
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

</decisions>

<specifics>
## Specific Ideas

- User wants per-project databases to be shareable with team members — portability matters
- Cross-project reference reuse was mentioned as a future benefit of having project_id even in per-project DBs

</specifics>

<deferred>
## Deferred Ideas

- Schema migration tooling (altering existing table schemas) — future phase if needed
- Cross-project reference/knowledge sharing — future capability

</deferred>

---

*Phase: 02-database-schema*
*Context gathered: 2026-02-27*
