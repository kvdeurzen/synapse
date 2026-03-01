# Phase 11: Task Hierarchy Tooling - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `tasks` LanceDB table and three MCP tools (`create_task`, `update_task`, `get_task_tree`) to the Synapse server. Tasks form a recursive hierarchy (Epic/Feature/Component/Task) with dependency cycle detection, computed blocking status, and BFS tree retrieval with rollup statistics. This phase builds the data layer only — orchestration logic, agent assignment enforcement, and PEV workflow are Phase 12-14 concerns.

</domain>

<decisions>
## Implementation Decisions

### Task Data Model
- Feature-rich row: include priority, assigned_agent, estimated_effort, description, tags, phase alongside structural fields (parent_id, depth, title, status, dependencies)
- `assigned_agent` uses a role enum matching the 10 agent roles from Phase 13 (executor, validator, architect, decomposer, etc.) — enforces correct assignment at the data layer
- `priority` uses named enum: critical / high / medium / low — stored as Utf8, human-readable for agent reasoning
- Embedding: concatenate `"Title: {title}\n{description}"` before embedding as 768-dim vector — captures both what and why for semantic search (same pattern as decision subject+rationale)
- Document references via existing relationships table with type `task_references` — no direct `related_doc_ids` field on task row. Agents use `get_related_documents` to find context for a task

### Status Lifecycle
- **Status is a linear lifecycle progression:** `pending → ready → in_progress → review → done`
  - `pending` — identified, not yet refined
  - `ready` — refined and available for assignment
  - `in_progress` — claimed by an agent, being worked on
  - `review` — work submitted, awaiting validation
  - `done` — validated complete
- **Blocked is an orthogonal boolean flag (`is_blocked`)** — a task can be blocked in any status (pending, ready, in_progress, or review)
- **Cancelled is an orthogonal boolean flag (`is_cancelled`)** — can occur from any status except `done`
- Status and flags are separate concerns, not conflated into a single enum

### Cascade Rules
- **No automatic parent completion** — when all children reach `done`, `get_task_tree` reports `children_all_done: true` as a signal, but the parent does NOT auto-transition. A validation step must confirm parent requirements are met
- **`is_blocked` does NOT cascade upward** — a child being blocked by a sibling dependency doesn't mean the parent is blocked. The parent can have other non-blocked children making progress
- **`is_blocked` is auto-computed from dependencies** — if any dependency task isn't `done` or `is_cancelled`, the dependent task's `is_blocked` is true. Agents can also manually set `is_blocked` for non-dependency blockers (e.g., "waiting on external input") with a block_reason field
- **Cancelling a task unblocks its dependents** — cancelled tasks are no longer evaluated as blockers. The dependency record stays for audit trail but `is_cancelled` dependencies don't contribute to `is_blocked` computation

### Dependency Model
- Store dependencies in the existing **relationships table** with type `task_depends_on` — reuses the graph model for all entity links
- **Single dependency type only:** `task_depends_on`. Parent-child is via `parent_id`. Document references via `task_references`. No 'blocks', 'relates_to', or other dependency types
- **Cycle detection runs on every dependency mutation** — any `create_task` with dependencies, or `update_task` that adds/changes dependencies, triggers cycle detection before committing. Guarantees no cycles ever exist in the graph

### get_task_tree Output
- **Nested tree structure** — each node has a `children` array. Agents traverse naturally: `tree.children[0].children[1]`
- **Rich rollup stats at each node:** total_descendants, done_count, blocked_count, in_progress_count, children_all_done (boolean signal for validation eligibility), completion_percentage
- **Truncate with indicator** when exceeding caps (depth 5, 200 tasks) — return tree up to cap with `truncated: true` and `truncated_count`. Agent can make targeted sub-tree calls for deeper nodes
- **Basic filters supported:** optional status, assigned_agent, is_blocked, depth filters. Filtered nodes still show in tree structure (preserving hierarchy) but unmatched nodes are collapsed/summarized

### Claude's Discretion
- Exact Arrow schema field ordering and index configuration
- Activity log action names for task mutations
- Error message wording and validation order
- BFS implementation details (queue strategy, memory optimization)
- How collapsed/summarized nodes appear in filtered tree responses
- `block_reason` field design (free text vs structured)
- `estimated_effort` field type and units

</decisions>

<specifics>
## Specific Ideas

- Status model intentionally separates lifecycle (status enum) from state flags (is_blocked, is_cancelled) — this avoids the combinatorial explosion of "blocked_and_in_progress" vs "blocked_and_pending" states
- The `children_all_done` signal in rollup stats is designed specifically for Phase 14's PEV loop — the validator reads this flag to know when to check parent requirements
- Cancelling a task unblocking dependents follows the principle that a cancelled prerequisite means the prerequisite is no longer required, not that it failed
- Role enum for assigned_agent forward-designs for Phase 13's 10 agent roles without requiring that phase to modify the tasks table

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `registerXTool` pattern (`src/tools/*.ts`): All existing tools follow the same registration pattern — new tools slot in identically
- Arrow schema definitions (`src/db/schema.ts`): TABLE_SCHEMAS registry and TABLE_NAMES const array — add `tasks` table here
- Zod row schemas (`src/db/schema.ts`): Validation schemas co-located with Arrow schemas — add TaskRowSchema here
- `src/services/embedder.ts`: Existing embedding service for 768-dim vectors — reuse for task description embedding
- `src/tools/init-project.ts`: Creates all tables on init — extend to create tasks table
- Activity log pattern: All mutation tools log to activity_log — follow same pattern for task mutations
- Relationships table: Already has from_id/to_id/type/source fields — reuse for `task_depends_on` and `task_references`
- `src/tools/decision-constants.ts`: Constants file pattern — create `task-constants.ts` for status enum, priority enum, depth enum, agent role enum
- `src/utils/uuid.ts` (or ulidx): ID generation for task_id

### Established Patterns
- Tool registration: `registerXTool(server, config)` function exported from each tool file, imported and called in `server.ts`
- Schema definition: Arrow Schema + Zod schema + TABLE_NAMES/TABLE_SCHEMAS registry in `src/db/schema.ts`
- Table initialization: `src/db/connection.ts` creates tables from schemas on init
- Embedding on write: store_document/store_decision embed content via embedding service — same pattern for task description
- Fail-fast on write when Ollama unavailable — read operations continue without embeddings

### Integration Points
- `src/server.ts`: Add `registerCreateTaskTool`, `registerUpdateTaskTool`, `registerGetTaskTreeTool` imports and registration calls
- `src/db/schema.ts`: Add TASKS_SCHEMA, TaskRowSchema, extend TABLE_NAMES and TABLE_SCHEMAS
- `src/db/connection.ts`: Extend table creation to include tasks table with BTree + FTS indexes
- `src/tools/init-project.ts`: Add tasks table creation alongside existing 7 tables
- `src/types.ts`: Add task types (TaskRow, status enum, priority enum, depth enum, agent role enum)
- Relationships table: Add `task_depends_on` and `task_references` relationship types

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-task-hierarchy-tooling*
*Context gathered: 2026-03-01*
