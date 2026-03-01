# Phase 11: Task Hierarchy Tooling - Research

**Researched:** 2026-03-01
**Domain:** LanceDB task graph, BFS tree traversal, dependency cycle detection, Arrow schema extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Task Data Model**
- Feature-rich row: include priority, assigned_agent, estimated_effort, description, tags, phase alongside structural fields (parent_id, depth, title, status, dependencies)
- `assigned_agent` uses a role enum matching the 10 agent roles from Phase 13 (executor, validator, architect, decomposer, etc.) — enforces correct assignment at the data layer
- `priority` uses named enum: critical / high / medium / low — stored as Utf8, human-readable for agent reasoning
- Embedding: concatenate `"Title: {title}\n{description}"` before embedding as 768-dim vector — captures both what and why for semantic search (same pattern as decision subject+rationale)
- Document references via existing relationships table with type `task_references` — no direct `related_doc_ids` field on task row. Agents use `get_related_documents` to find context for a task

**Status Lifecycle**
- Status is a linear lifecycle progression: `pending → ready → in_progress → review → done`
  - `pending` — identified, not yet refined
  - `ready` — refined and available for assignment
  - `in_progress` — claimed by an agent, being worked on
  - `review` — work submitted, awaiting validation
  - `done` — validated complete
- Blocked is an orthogonal boolean flag (`is_blocked`) — a task can be blocked in any status (pending, ready, in_progress, or review)
- Cancelled is an orthogonal boolean flag (`is_cancelled`) — can occur from any status except `done`
- Status and flags are separate concerns, not conflated into a single enum

**Cascade Rules**
- No automatic parent completion — when all children reach `done`, `get_task_tree` reports `children_all_done: true` as a signal, but the parent does NOT auto-transition. A validation step must confirm parent requirements are met
- `is_blocked` does NOT cascade upward — a child being blocked by a sibling dependency doesn't mean the parent is blocked. The parent can have other non-blocked children making progress
- `is_blocked` is auto-computed from dependencies — if any dependency task isn't `done` or `is_cancelled`, the dependent task's `is_blocked` is true. Agents can also manually set `is_blocked` for non-dependency blockers (e.g., "waiting on external input") with a block_reason field
- Cancelling a task unblocks its dependents — cancelled tasks are no longer evaluated as blockers. The dependency record stays for audit trail but `is_cancelled` dependencies don't contribute to `is_blocked` computation

**Dependency Model**
- Store dependencies in the existing relationships table with type `task_depends_on` — reuses the graph model for all entity links
- Single dependency type only: `task_depends_on`. Parent-child is via `parent_id`. Document references via `task_references`. No 'blocks', 'relates_to', or other dependency types
- Cycle detection runs on every dependency mutation — any `create_task` with dependencies, or `update_task` that adds/changes dependencies, triggers cycle detection before committing. Guarantees no cycles ever exist in the graph

**get_task_tree Output**
- Nested tree structure — each node has a `children` array. Agents traverse naturally: `tree.children[0].children[1]`
- Rich rollup stats at each node: total_descendants, done_count, blocked_count, in_progress_count, children_all_done (boolean signal for validation eligibility), completion_percentage
- Truncate with indicator when exceeding caps (depth 5, 200 tasks) — return tree up to cap with `truncated: true` and `truncated_count`. Agent can make targeted sub-tree calls for deeper nodes
- Basic filters supported: optional status, assigned_agent, is_blocked, depth filters. Filtered nodes still show in tree structure (preserving hierarchy) but unmatched nodes are collapsed/summarized

### Claude's Discretion
- Exact Arrow schema field ordering and index configuration
- Activity log action names for task mutations
- Error message wording and validation order
- BFS implementation details (queue strategy, memory optimization)
- How collapsed/summarized nodes appear in filtered tree responses
- `block_reason` field design (free text vs structured)
- `estimated_effort` field type and units

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TASK-01 | Agent can create a task with parent_id, depth (0-3), title, description, and dependencies via create_task | create_task tool with full data model; cycle detection before commit; embedding on write |
| TASK-02 | Task tree supports 4 depth levels: Epic (0), Feature (1), Component (2), Task (3) | TASKS_SCHEMA with depth Int32 field; VALID_DEPTHS constant; parent_id nullable Utf8 |
| TASK-03 | Agent can update task status, assigned_agent, priority, and other fields via update_task | update_task tool with partial update pattern; re-compute is_blocked after dependency changes; re-embed if title/description changed |
| TASK-04 | Cascade status propagation: all children complete → parent signals; any child blocked → no cascade | CONTEXT.md mandates children_all_done signal only; no cascade write; get_task_tree computes rollup at read time |
| TASK-05 | Agent can retrieve full task tree via get_task_tree with rollup statistics (total/complete/blocked counts) | BFS traversal in JS; nested tree output shape; rollup stats per node |
| TASK-06 | get_task_tree uses JS-side BFS with root_id denormalization (max depth 5, 200-task cap) | JS BFS queue pattern; truncated flag on cap hit; root_id field on tasks table for efficient subtree fetching |
| TASK-07 | Dependency cycles are detected and rejected on create_task and update_task | DFS cycle detection on relationships table; run before any commit; clear error message |
| TASK-08 | init_project creates the tasks table with Arrow schema and indexes | Extend TABLE_NAMES, TABLE_SCHEMAS, init_project to create tasks + FTS index on title |
| TASK-09 | All task mutations are logged to activity_log | logActivity() service already handles this; follow store_decision pattern |
| TASK-10 | Task description is embedded as a 768-dim vector for semantic search | embed() service; concatenate "Title: {title}\n{description}"; fail fast if Ollama down on create_task |
</phase_requirements>

## Summary

Phase 11 adds three MCP tools (`create_task`, `update_task`, `get_task_tree`) and one new LanceDB table (`tasks`) to the Synapse server. The domain combines three distinct algorithmic sub-problems: (1) a rich relational data model with two orthogonal flag fields (`is_blocked`, `is_cancelled`) and a linear status enum, (2) JS-side BFS tree assembly with rollup statistics computed at read time, and (3) DFS dependency cycle detection that must run transactionally before any commit. All three are well-understood patterns within the existing codebase conventions.

The primary integration complexity is that dependencies are stored in the existing `relationships` table (type `task_depends_on`), not in a separate adjacency table. This means cycle detection must query the relationships table for a given project, build an in-memory adjacency map, and then run DFS — all as a pre-write validation step. The BFS tree assembler must similarly load all descendants from the tasks table in a single bulk query, then build the tree structure in JS memory, rather than making recursive DB calls per node.

The `is_blocked` flag is auto-computed from dependency state rather than being a free user field — when `update_task` changes dependency edges or when a dependency task's status/cancelled flag changes, all downstream tasks must have their `is_blocked` recomputed. This propagation is the most non-obvious write path in the phase.

**Primary recommendation:** Follow the store_decision → query_decisions → check_precedent structural pattern exactly. One constants file (`task-constants.ts`), one schema addition (`TASKS_SCHEMA` + `TaskRowSchema` in `schema.ts`), three tool files, and extension of `init-project.ts` and `server.ts`. All core logic in testable exported functions, MCP registration wrappers separate.

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lancedb/lancedb` | 0.26.2 | Table storage, BTree/FTS indexes, vector search | Already the project DB layer |
| `apache-arrow` | (transitive) | Arrow Schema field types (Utf8, Int32, Bool, Float32, FixedSizeList) | Already used for all schemas in schema.ts |
| `zod` | ^4.0.0 | Input validation and Zod row schemas | All tools use Zod; TaskRowSchema follows DecisionRowSchema pattern |
| `ulidx` | ^2.4.1 | ULID generation for task_id | Already used for all ID generation |
| `@modelcontextprotocol/sdk` | latest | McpServer registration | Same registerXTool pattern throughout |

### Supporting (already available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` (via logger.ts) | latest | Structured logging | createToolLogger() in every tool |
| LRU embedder cache | (internal) | Avoids re-embedding unchanged title+description | Transparently handled by embed() service |

**Installation:** No new packages needed. All dependencies are transitive of existing installs.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── tools/
│   ├── task-constants.ts        # VALID_STATUSES, VALID_PRIORITIES, VALID_DEPTHS, VALID_AGENT_ROLES
│   ├── create-task.ts           # createTask() + registerCreateTaskTool()
│   ├── update-task.ts           # updateTask() + registerUpdateTaskTool()
│   └── get-task-tree.ts         # getTaskTree() + registerGetTaskTreeTool()
├── db/
│   └── schema.ts                # Add TASKS_SCHEMA, TaskRowSchema; extend TABLE_NAMES, TABLE_SCHEMAS
└── server.ts                    # Add 3 import+register calls

test/
└── tools/
    ├── create-task.test.ts
    ├── update-task.test.ts
    └── get-task-tree.test.ts
```

### Pattern 1: Constants File (follow decision-constants.ts exactly)

**What:** Single file defines all enums as `as const` arrays with exported types.
**When to use:** Any new domain with multiple enum-like values.

```typescript
// src/tools/task-constants.ts
export const VALID_TASK_STATUSES = ["pending", "ready", "in_progress", "review", "done"] as const;
export type ValidTaskStatus = (typeof VALID_TASK_STATUSES)[number];

export const VALID_TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type ValidTaskPriority = (typeof VALID_TASK_PRIORITIES)[number];

// Depth 0=Epic, 1=Feature, 2=Component, 3=Task
export const VALID_DEPTHS = [0, 1, 2, 3] as const;
export type ValidDepth = (typeof VALID_DEPTHS)[number];

export const DEPTH_NAMES: Record<number, string> = {
  0: "epic",
  1: "feature",
  2: "component",
  3: "task",
};

// Forward-design for Phase 13's 10 agent roles
export const VALID_AGENT_ROLES = [
  "executor", "validator", "architect", "decomposer", "plan_reviewer",
  "integration_checker", "debugger", "codebase_analyst", "product_strategist", "researcher",
] as const;
export type ValidAgentRole = (typeof VALID_AGENT_ROLES)[number];
```

### Pattern 2: Arrow Schema + Zod Schema (follow DECISIONS_SCHEMA + DecisionRowSchema exactly)

**What:** Arrow Schema uses apache-arrow Field types. Zod schema co-located for row validation. Both registered in TABLE_SCHEMAS.

```typescript
// In src/db/schema.ts — additions

import { Bool } from "apache-arrow"; // Bool type needed for is_blocked, is_cancelled

export const TASKS_SCHEMA = new Schema([
  new Field("task_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("parent_id", new Utf8(), true),          // null for epic (depth=0)
  new Field("root_id", new Utf8(), false),            // denormalized epic ID for efficient subtree fetch
  new Field("depth", new Int32(), false),             // 0=Epic, 1=Feature, 2=Component, 3=Task
  new Field("title", new Utf8(), false),
  new Field("description", new Utf8(), false),
  new Field("status", new Utf8(), false),             // pending|ready|in_progress|review|done
  new Field("is_blocked", new Bool(), false),
  new Field("is_cancelled", new Bool(), false),
  new Field("block_reason", new Utf8(), true),        // free text, nullable
  new Field("priority", new Utf8(), true),            // critical|high|medium|low|null
  new Field("assigned_agent", new Utf8(), true),      // agent role enum, nullable
  new Field("estimated_effort", new Utf8(), true),    // free text (e.g. "2h", "S/M/L"), nullable
  new Field("tags", new Utf8(), false),               // pipe-separated, same pattern as decisions
  new Field("phase", new Utf8(), true),
  new Field("created_at", new Utf8(), false),
  new Field("updated_at", new Utf8(), false),
  new Field("vector", new FixedSizeList(768, new Field("item", new Float32(), true)), true),
]);

export const TaskRowSchema = z.object({
  task_id: z.string().min(1),
  project_id: z.string().min(1),
  parent_id: z.string().nullable(),
  root_id: z.string().min(1),
  depth: z.number().int().min(0).max(3),
  title: z.string().min(1),
  description: z.string(),
  status: z.enum(VALID_TASK_STATUSES),
  is_blocked: z.boolean(),
  is_cancelled: z.boolean(),
  block_reason: z.string().nullable(),
  priority: z.enum(VALID_TASK_PRIORITIES).nullable(),
  assigned_agent: z.enum(VALID_AGENT_ROLES).nullable(),
  estimated_effort: z.string().nullable(),
  tags: z.string(),
  phase: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  vector: z.array(z.number()).length(768).nullable(),
});
```

**Note on Bool in Arrow:** LanceDB uses `apache-arrow` for schema types. The `Bool` type from `apache-arrow` is the correct field type for boolean columns. Confirm import: `import { Bool, Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from "apache-arrow";`

**Note on Zod v4:** The project uses `zod ^4.0.0`. In Zod v4, `z.boolean()` is the correct type for boolean fields in Zod schemas.

### Pattern 3: Core Logic + MCP Wrapper (follow storeDecision/registerStoreDecisionTool exactly)

**What:** Exported `async function createTask(dbPath, projectId, args, config)` is testable. `registerCreateTaskTool(server, config)` is the MCP registration wrapper that calls core logic.

```typescript
// src/tools/create-task.ts

export async function createTask(
  dbPath: string,
  projectId: string,
  args: CreateTaskArgs,
  config: SynapseConfig,
): Promise<CreateTaskResult> {
  const validated = CreateTaskInputSchema.parse(args);
  const db = await connectDb(dbPath);
  const taskId = ulid();
  const now = new Date().toISOString();

  // 1. Validate parent exists (if parent_id provided) + depth consistency
  // 2. Detect dependency cycles (DFS on relationships table) — reject before any write
  // 3. Embed "Title: {title}\n{description}" — fail fast if Ollama down
  // 4. insertBatch to tasks table
  // 5. Insert task_depends_on relationships for each dependency
  // 6. Recompute is_blocked for this task based on inserted dependencies
  // 7. logActivity
  // 8. Return result
}

export function registerCreateTaskTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool("create_task", { ... }, async (args) => {
    const log = createToolLogger("create_task");
    try {
      const data = await createTask(config.db, parsed.project_id, parsed, config);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data }) }] };
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: String(err) }) }] };
    }
  });
}
```

### Pattern 4: BFS Tree Assembly

**What:** Fetch all tasks rooted at a given epic in a single DB query, then build the tree structure in JS memory.
**Why:** Avoids N+1 DB calls for recursive tree assembly.

```typescript
// get-task-tree.ts — core BFS algorithm

async function buildTaskTree(
  db: lancedb.Connection,
  projectId: string,
  rootId: string,
  opts: { maxDepth?: number; maxTasks?: number; filters?: TaskTreeFilters },
): Promise<TaskTreeNode> {
  const maxDepth = opts.maxDepth ?? 5;
  const maxTasks = opts.maxTasks ?? 200;

  // 1. Fetch all tasks for this project rooted at rootId in ONE query
  //    Use root_id denormalization: WHERE root_id = '{rootId}' AND project_id = '{projectId}'
  //    Also fetch the root task itself: WHERE task_id = '{rootId}' AND project_id = '{projectId}'
  const tasksTable = await db.openTable("tasks");
  const allRows = await tasksTable
    .query()
    .where(`(root_id = '${rootId}' OR task_id = '${rootId}') AND project_id = '${projectId}'`)
    .toArray();

  // 2. Build parent→children map in JS
  const childrenMap = new Map<string, TaskRow[]>();
  const taskMap = new Map<string, TaskRow>();
  for (const row of allRows) {
    taskMap.set(row.task_id as string, row as TaskRow);
    if (row.parent_id) {
      if (!childrenMap.has(row.parent_id as string)) {
        childrenMap.set(row.parent_id as string, []);
      }
      childrenMap.get(row.parent_id as string)!.push(row as TaskRow);
    }
  }

  // 3. BFS from root — apply depth cap and task count cap
  let tasksIncluded = 0;
  let truncatedCount = 0;
  let truncated = false;
  const queue: Array<{ taskId: string; depth: number }> = [{ taskId: rootId, depth: 0 }];
  const nodeMap = new Map<string, TaskTreeNode>();

  // Build root node
  const rootRow = taskMap.get(rootId);
  if (!rootRow) throw new Error(`TASK_NOT_FOUND: No task found with task_id '${rootId}'`);

  // ... BFS iteration with rollup computation

  return nodeMap.get(rootId)!;
}
```

**Key insight on root_id denormalization:** Every task stores its epic's task_id as `root_id`. This allows fetching an entire epic subtree with a single SQL WHERE clause (`root_id = X`) rather than recursive queries. Epics set `root_id = task_id` (self-referential). Features/Components/Tasks inherit root_id from their lineage.

### Pattern 5: DFS Cycle Detection

**What:** Load all existing `task_depends_on` relationships for the project from the relationships table, build an in-memory adjacency map, add the proposed new edges, then run DFS to detect cycles before committing anything.

```typescript
async function detectCycles(
  db: lancedb.Connection,
  projectId: string,
  proposedEdges: Array<{ from: string; to: string }>,
): Promise<{ hasCycle: boolean; cyclePath?: string[] }> {
  // 1. Fetch all existing task dependency edges for this project
  const relTable = await db.openTable("relationships");
  const existing = await relTable
    .query()
    .where(`project_id = '${projectId}' AND type = 'task_depends_on'`)
    .toArray();

  // 2. Build adjacency list: from_id → [to_id, ...]
  const graph = new Map<string, Set<string>>();
  for (const rel of existing) {
    const from = rel.from_id as string;
    const to = rel.to_id as string;
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)!.add(to);
  }

  // 3. Add proposed edges to graph
  for (const edge of proposedEdges) {
    if (!graph.has(edge.from)) graph.set(edge.from, new Set());
    graph.get(edge.from)!.add(edge.to);
  }

  // 4. DFS cycle detection — standard "white/gray/black" 3-color approach
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const neighbor of (graph.get(node) ?? [])) {
      if (color.get(neighbor) === GRAY) return true; // Back edge = cycle
      if (!color.has(neighbor) || color.get(neighbor) === WHITE) {
        parent.set(neighbor, node);
        if (dfs(neighbor)) return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const node of graph.keys()) {
    if (!color.has(node) || color.get(node) === WHITE) {
      if (dfs(node)) return { hasCycle: true };
    }
  }

  return { hasCycle: false };
}
```

### Pattern 6: is_blocked Recomputation

**What:** After any dependency edge mutation (create_task with dependencies, update_task adding/removing dependencies, or a dependency task reaching `done`/`is_cancelled=true`), all tasks that depend on the changed task must have their `is_blocked` recomputed.

```typescript
async function recomputeIsBlocked(
  db: lancedb.Connection,
  projectId: string,
  taskId: string,
): Promise<void> {
  // Fetch all dependencies of this task (where this task is the FROM)
  const relTable = await db.openTable("relationships");
  const deps = await relTable
    .query()
    .where(`from_id = '${taskId}' AND project_id = '${projectId}' AND type = 'task_depends_on'`)
    .toArray();

  if (deps.length === 0) {
    // No dependencies — ensure is_blocked is false (unless manually set)
    // Only auto-clear is_blocked if block_reason is null (no manual block)
    return;
  }

  // Fetch all dependency task statuses
  const depIds = deps.map((d) => d.to_id as string);
  const tasksTable = await db.openTable("tasks");
  const depTasks = await tasksTable
    .query()
    .where(`task_id IN ('${depIds.join("','")}') AND project_id = '${projectId}'`)
    .toArray();

  // is_blocked = true if ANY dependency is not (done OR is_cancelled)
  const isBlocked = depTasks.some(
    (t) => t.status !== "done" && !(t.is_cancelled as boolean),
  );

  const now = new Date().toISOString();
  await tasksTable.update({
    where: `task_id = '${taskId}' AND project_id = '${projectId}'`,
    values: { is_blocked: isBlocked, updated_at: now },
  });
}
```

**Important:** `is_blocked` recomputation is scoped to direct dependents of the changed task. It does NOT cascade transitively — if Task A depends on Task B depends on Task C, and C completes, only B's `is_blocked` is recomputed (which may then unblock A on next check). For Phase 11, recompute only immediate dependents.

### Pattern 7: Rollup Statistics (computed at BFS time)

**What:** Each node in the returned tree carries computed rollup stats. These are computed during the BFS assembly, bottom-up after children are resolved.

```typescript
interface RollupStats {
  total_descendants: number;
  done_count: number;
  blocked_count: number;
  in_progress_count: number;
  children_all_done: boolean; // true when ALL direct children are done
  completion_percentage: number;
}

function computeRollup(node: TaskTreeNode): RollupStats {
  const directChildren = node.children ?? [];
  const children_all_done =
    directChildren.length > 0 && directChildren.every((c) => c.status === "done");

  // Recursively aggregate descendants
  let total = 0, done = 0, blocked = 0, inProgress = 0;
  function traverse(n: TaskTreeNode): void {
    for (const child of n.children ?? []) {
      total++;
      if (child.status === "done") done++;
      if (child.is_blocked) blocked++;
      if (child.status === "in_progress") inProgress++;
      traverse(child);
    }
  }
  traverse(node);

  return {
    total_descendants: total,
    done_count: done,
    blocked_count: blocked,
    in_progress_count: inProgress,
    children_all_done,
    completion_percentage: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}
```

### Anti-Patterns to Avoid

- **Recursive DB calls for tree assembly:** Never make one DB query per node to fetch children. Always bulk-fetch by `root_id` and assemble in JS. Recursive queries will hit rate limits and are N+1 in disguise.
- **Storing is_blocked as user-mutable field without recomputation:** `is_blocked` must be recomputed from dependency state on every relevant mutation. Stale `is_blocked` values corrupt agent reasoning.
- **Running cycle detection after writing dependency edges:** Always detect cycles BEFORE writing. If you write the edges first and then detect a cycle, you must rollback, but LanceDB has no transactions — the rollback would require a delete query that could fail. Detect, then write.
- **Conflating status and flags:** The CONTEXT.md is explicit — status is the lifecycle progression, `is_blocked` and `is_cancelled` are orthogonal flags. Do not add "blocked" or "cancelled" as status values.
- **Embedding at read time:** Only embed on write (create_task, update_task when title or description changes). Never embed during get_task_tree.
- **root_id drift:** When a task's parent is deleted or reparented (not in this phase, but guard against it), root_id could become stale. For Phase 11, root_id is set at creation time and is immutable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ID generation | Custom UUID/random | `ulid()` from ulidx | Already project standard; sortable by creation time |
| Row validation before insert | Manual field checks | `insertBatch()` with `TaskRowSchema` | insertBatch validates all rows before any DB write — fail fast, atomic |
| Activity logging | Direct table insert | `logActivity()` from services/activity-log.ts | Handles ULID generation, timestamp, schema validation |
| Embedding | Direct Ollama HTTP | `embed()` from services/embedder.ts | LRU cache, batch chunking, retry, dimension assertion |
| BTree index creation | Raw SQL index DDL | `table.createIndex("field", { config: lancedb.Index.btree() })` | LanceDB API; wrap in try/catch for empty-table case (established pattern) |
| FTS index creation | Custom text index | `table.createIndex("title", { config: lancedb.Index.fts({...}) })` | LanceDB FTS; same options as existing doc_chunks/code_chunks/decisions indexes |

**Key insight:** The project's service layer (embedder, activity-log, batch insert) handles all the cross-cutting concerns. Tool code only needs to orchestrate: validate → detect cycles → embed → write → log.

## Common Pitfalls

### Pitfall 1: BTree Index on Empty Table Fails Silently

**What goes wrong:** `table.createIndex("project_id", { config: lancedb.Index.btree() })` throws on an empty table in some LanceDB versions.
**Why it happens:** LanceDB cannot create BTree index statistics on zero rows.
**How to avoid:** Wrap every `createIndex` call in try/catch — log a warn but do not throw. This is the established pattern in `init-project.ts` (lines 172-183).
**Warning signs:** `init_project` fails on first call; subsequent calls succeed after a row is inserted.

### Pitfall 2: LanceDB UPDATE Does Not Return Row Count

**What goes wrong:** `table.update({ where: ..., values: ... })` does not return whether any rows matched the WHERE predicate.
**Why it happens:** LanceDB's update() is fire-and-forget in terms of match confirmation.
**How to avoid:** After updating a task (especially `update_task`), do a follow-up `table.query().where(...).limit(1).toArray()` to confirm the row exists before returning success. Or validate the task exists as a pre-check before the update.
**Warning signs:** `update_task` returns success but the row never existed in the project.

### Pitfall 3: Bool Field Type in Arrow Schema

**What goes wrong:** Using `new Utf8()` for boolean fields and storing "true"/"false" strings, then filtering on them requires SQL string comparison.
**Why it happens:** The current schema.ts only uses Utf8, Int32, Float32, and FixedSizeList — Bool hasn't been used yet.
**How to avoid:** Import `Bool` from `apache-arrow` and use `new Field("is_blocked", new Bool(), false)`. The Zod schema side uses `z.boolean()`. LanceDB SQL predicates support `is_blocked = true` (native boolean).
**Warning signs:** `WHERE is_blocked = true` returns no results even when tasks are blocked.

### Pitfall 4: root_id Must Be Set for ALL Tasks Including Epics

**What goes wrong:** Epics (depth=0, parent_id=null) have `root_id = task_id` (self-referential). If root_id is left null for epics, the bulk `WHERE root_id = X` query won't find the epic row itself.
**Why it happens:** The denormalization pattern is easy to misread as "root means has a root above me."
**How to avoid:** `root_id = task_id` for depth=0 tasks. `root_id` is inherited from parent's root_id for all other depths.
**Warning signs:** `get_task_tree` returns a tree with no root node data; children appear but root row is missing.

### Pitfall 5: Cycle Detection Must Handle Self-Loops

**What goes wrong:** A task declaring itself as its own dependency (task A depends on task A) passes naive cycle detection that only checks non-trivial cycles.
**Why it happens:** DFS graph traversal starts from a node's neighbors — a self-loop isn't a neighbor in some implementations.
**How to avoid:** Before adding proposed edges to the graph, explicitly check `if (edge.from === edge.to) throw new Error("CYCLE_DETECTED: Self-dependency")`.
**Warning signs:** Task A with `dependencies: [taskA.task_id]` is accepted and blocks itself forever.

### Pitfall 6: IN Clause with Empty Array

**What goes wrong:** `WHERE task_id IN ('')` or `WHERE task_id IN ()` is invalid SQL. This happens when a task has zero dependencies and `depIds` is empty.
**Why it happens:** String interpolation of empty array produces malformed SQL.
**How to avoid:** Guard all IN-clause queries: `if (depIds.length === 0) return;` before constructing the query.
**Warning signs:** `recomputeIsBlocked` or similar functions throw SQL parse errors for tasks with no dependencies.

### Pitfall 7: update_task Re-embedding Scope

**What goes wrong:** Re-embedding on every `update_task` call is wasteful and fails if Ollama is down, even for non-text field updates (e.g., status changes).
**Why it happens:** Naively always embedding after update.
**How to avoid:** Only call `embed()` in `update_task` if `title` or `description` is in the update payload. All other field updates (status, priority, assigned_agent) skip embedding entirely. Follow the fail-fast pattern only when actually embedding.
**Warning signs:** `update_task` with `{ status: "in_progress" }` fails because Ollama is down, even though no text changed.

## Code Examples

Verified patterns from existing codebase:

### Table Query Pattern (copy from query-decisions.ts)

```typescript
// Source: /home/kanter/code/project_mcp/src/tools/query-decisions.ts
const table = await db.openTable("tasks");
const rows = await table
  .query()
  .where(`project_id = '${projectId}' AND status = 'ready'`)
  .limit(200)
  .toArray();
```

### Table Update Pattern (copy from store-decision.ts supersession)

```typescript
// Source: /home/kanter/code/project_mcp/src/tools/store-decision.ts lines 107-110
await table.update({
  where: `task_id = '${taskId}' AND project_id = '${projectId}'`,
  values: { status: "in_progress", updated_at: now },
});
```

### BTree Index Creation Pattern (copy from init-project.ts)

```typescript
// Source: /home/kanter/code/project_mcp/src/tools/init-project.ts lines 173-184
try {
  await table.createIndex("project_id", { config: lancedb.Index.btree() });
} catch (err) {
  logger.warn({ table: name, error: String(err) }, "BTree index creation failed on empty table");
}
```

### FTS Index Creation Pattern (copy from init-project.ts)

```typescript
// Source: /home/kanter/code/project_mcp/src/tools/init-project.ts lines 232-249
await tasksTable.createIndex("title", {
  config: lancedb.Index.fts({
    withPosition: true,
    stem: false,
    removeStopWords: false,
    lowercase: true,
  }),
  replace: true,
});
```

### Embedding Pattern with Concatenation (follow store_decision rationale)

```typescript
// Pattern: concatenate title + description before embedding (CONTEXT.md decision)
const embedText = `Title: ${validated.title}\n${validated.description}`;
const vectors = await embed([embedText], projectId, config);
const vector = vectors[0] ?? [];
// vector.length should be 768 — embed() asserts this
```

### insertBatch with Zod validation (copy from store-decision.ts)

```typescript
// Source: /home/kanter/code/project_mcp/src/tools/store-decision.ts lines 154-178
await insertBatch(
  tasksTable,
  [{
    task_id: taskId,
    project_id: projectId,
    parent_id: validated.parent_id ?? null,
    root_id: rootId, // computed: self for epics, inherited for others
    depth: validated.depth,
    title: validated.title,
    description: validated.description ?? "",
    status: "pending",
    is_blocked: false, // recomputed after dependency insertion
    is_cancelled: false,
    block_reason: null,
    priority: validated.priority ?? null,
    assigned_agent: validated.assigned_agent ?? null,
    estimated_effort: validated.estimated_effort ?? null,
    tags: validated.tags ?? "",
    phase: validated.phase ?? null,
    created_at: now,
    updated_at: now,
    vector: vector.length === 768 ? vector : null,
  }],
  TaskRowSchema,
);
```

### Activity Logging (copy from store-decision.ts)

```typescript
// Source: /home/kanter/code/project_mcp/src/services/activity-log.ts
await logActivity(db, projectId, "create_task", taskId, "task", {
  depth: validated.depth,
  parent_id: validated.parent_id,
});
```

### Test Setup Pattern (copy from store-decision.test.ts)

```typescript
// Source: /home/kanter/code/project_mcp/test/tools/store-decision.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { initProject } from "../../src/tools/init-project.js";
import { createTask } from "../../src/tools/create-task.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "create-task-test-"));
  _setFetchImpl((_url, _init) => {
    return Promise.resolve(new Response(
      JSON.stringify({ embeddings: [Array.from({ length: 768 }, (_, i) => i * 0.001)] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
  });
});
afterEach(() => {
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "blocked" as a status enum value | `is_blocked` as an orthogonal boolean flag | Phase 11 design decision | Eliminates "blocked_AND_in_progress" impossibility; simpler state machine |
| Recursive SQL CTEs for tree traversal | JS-side BFS with root_id denormalization | Phase 11 design decision | LanceDB doesn't support recursive CTEs; JS BFS is simpler to test |
| Separate adjacency table for dependencies | Reuse relationships table with `task_depends_on` type | Phase 11 design decision | Graph model already established; avoids schema proliferation |

## Open Questions

1. **IN clause syntax in LanceDB**
   - What we know: LanceDB SQL predicates support basic WHERE clauses with `=`, `AND`, `OR`
   - What's unclear: Whether `WHERE task_id IN ('id1', 'id2', 'id3')` is supported or requires multiple `OR` conditions
   - Recommendation: Use `IN (...)` first; if it fails, fall back to `id1 OR id2 OR id3` pattern. Test in first wave.

2. **Bool field in LanceDB Arrow schema — query predicate syntax**
   - What we know: LanceDB uses Apache Arrow native types; Bool type exists
   - What's unclear: Whether `WHERE is_blocked = true` works or requires `WHERE is_blocked = 1` or another form
   - Recommendation: Test bool predicate syntax in the first test that uses is_blocked filtering. If `= true` fails, try `= 1`. Document the working form in task-constants.ts.

3. **update_task dependency mutation scope**
   - What we know: `update_task` must support adding/removing dependencies; cycle detection must re-run
   - What's unclear: Whether `update_task` should allow replacing ALL dependencies or only adding/removing individual ones
   - Recommendation: Support full replacement (provide new `dependencies` array; delete old task_depends_on rows, insert new ones, run cycle detection on final state). This is simpler than incremental add/remove.

4. **Immediate dependent recomputation vs. lazy recomputation**
   - What we know: When a task becomes `done`, its dependents' `is_blocked` may change
   - What's unclear: Should `update_task` (when setting status=done) immediately recompute all direct dependents, or is that left to a future phase?
   - Recommendation: Yes, recompute immediate dependents' `is_blocked` whenever a task's status or `is_cancelled` changes. This keeps is_blocked accurate without requiring a separate propagation job. Scope: only DIRECT dependents (tasks that have THIS task as a dependency), not transitive.

## Sources

### Primary (HIGH confidence)

- Existing codebase at `/home/kanter/code/project_mcp/src/` — direct inspection of schema.ts, store-decision.ts, query-decisions.ts, check-precedent.ts, init-project.ts, db/batch.ts, services/activity-log.ts, services/embedder.ts, server.ts
- `/home/kanter/code/project_mcp/test/tools/store-decision.test.ts` — confirmed test patterns (bun:test, mkdtempSync, _setFetchImpl mock)
- `/home/kanter/code/project_mcp/.planning/phases/11-task-hierarchy-tooling/11-CONTEXT.md` — user decisions (all locked choices)
- `/home/kanter/code/project_mcp/.planning/REQUIREMENTS.md` — TASK-01 through TASK-10 requirement text

### Secondary (MEDIUM confidence)

- DFS cycle detection algorithm — standard CS algorithm (white/gray/black 3-color); implementation pattern verified against project's TypeScript style

### Tertiary (LOW confidence)

- Bool field predicate syntax in LanceDB — not verified against LanceDB 0.26.2 docs; flagged as Open Question 2
- `IN` clause support in LanceDB SQL predicates — not verified; flagged as Open Question 1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project dependencies; no new installs required
- Architecture: HIGH — all patterns are directly derived from existing Phase 10 code (decisions tooling)
- Core algorithms (BFS, DFS cycle detection): HIGH — standard algorithms, well-understood
- LanceDB-specific behavior (Bool fields, IN clauses): MEDIUM — derived from project conventions; two open questions flagged
- Pitfalls: HIGH — derived from existing codebase patterns and established gotchas (empty table BTree index, update() return value)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable stack; LanceDB version pinned at 0.26.2)
