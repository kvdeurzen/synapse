# Phase 23: Visibility + Notifications - Research

**Researched:** 2026-03-06
**Domain:** Claude Code statusline hooks, MCP tool enhancement, ANSI terminal styling, LanceDB data access
**Confidence:** HIGH

## Summary

Phase 23 enhances two existing systems (statusline hook and project_overview MCP tool) and updates one command (/synapse:status) to give users real-time visibility into RPEV progress and notifications about blocked items. The implementation touches three codebases: the framework hooks (JavaScript), the server tools (TypeScript), and the command skill (Markdown).

The core challenge is the statusline data access problem: the statusline hook runs as a synchronous shell script that receives JSON from Claude Code via stdin. It cannot call MCP tools. Therefore, RPEV state must be accessible without MCP -- either via a state file or direct LanceDB read. The state file approach is strongly recommended because it avoids importing the heavy `@lancedb/lancedb` package into the hooks layer, keeps the hook fast and failure-tolerant, and aligns with the existing pattern of the orchestrator writing state documents. The orchestrator already writes `pool-state-[project_id]` documents on every slot change -- writing a lightweight `.synapse/state/statusline.json` file alongside those updates is minimal additional work.

The project_overview enhancement is straightforward: internally compose from `get_task_tree` for each epic, aggregate rollup stats, query RPEV stage documents and pool-state document, and return an enriched response. The /synapse:status command updates are purely Markdown template changes consuming the enhanced project_overview response.

**Primary recommendation:** Use a state file (`.synapse/state/statusline.json`) written by the orchestrator on every RPEV state change for statusline data access. Enhance project_overview to compose from get_task_tree and include task_progress + pool_status sections. Update /synapse:status command to render "Needs Your Attention" section.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Statusline shows **top epic progress + pool count** when RPEV active: e.g., `Auth System 4/12 | Pool 3/3 active`
- Top epic = highest-priority epic with active work
- **Query at render** -- statusline hook queries state on each render cycle (not cached in memory)
- **Separate 500ms timeout** for the data query, independent of existing 3-second overall hook timeout
- **Idle state**: Claude's discretion
- Per-epic breakdown in project_overview with total/completed/blocked/in_progress counts
- RPEV stage counts per epic in project_overview
- Pool summary section in project_overview response
- **Compose from get_task_tree** -- project_overview internally calls get_task_tree for each epic
- **proactive_notifications = true**: statusline shows blocked count with **color/blink** ANSI (red blinking). No bell, no sound
- **proactive_notifications = false** (default): blocked count in **subdued style** (dim/gray)
- **Notification triggers**: items needing user approval (co-pilot/reviews) AND items with exhausted retries. NOT dependency-blocked items
- Blocked counter display in statusline: split by type -- e.g., `(2Y 1R)` with yellow/red indicators
- /synapse:status: top-level "Needs Your Attention" section AND inline blocked counts on epic lines
- Needs Your Attention: single list with icon/badge per item (not separate sub-sections)

### Claude's Discretion
- Exact mechanism for statusline data access (state file vs direct DB read vs other)
- Idle state statusline behavior (show blocked count or fall back to basic)
- Blocked counter refresh strategy (real-time or per-turn)
- Icon/badge choices for approval vs failed items in /synapse:status
- How to handle case where get_task_tree returns no epics
- ANSI color/blink exact codes for proactive vs subtle blocked indicators
- Whether to add pool-state document query to project_overview or read pool state from trust.toml + task tree

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-01 | Progress statusline hook shows active epic, wave count, and task completion in Claude Code | Statusline hook extension pattern documented; state file architecture for data access; ANSI escape code patterns for proactive/subtle styling; 500ms timeout implementation |
| VIS-02 | project_overview enhanced to show task tree progress alongside document stats | get_task_tree composition pattern; epic discovery via depth=0 query; RPEV stage document aggregation; pool-state document inclusion; ProjectOverviewResult interface extension |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| smol-toml | (existing) | Parse trust.toml for proactive_notifications | Already imported in statusline hook |
| @lancedb/lancedb | 0.26.2 | LanceDB queries in project_overview | Already used by all server tools |
| zod | (existing) | Input validation for enhanced project_overview | Already used by all MCP tools |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs | (built-in) | Read state file in statusline hook | State file approach for RPEV data |
| node:path | (built-in) | Resolve state file path | Path construction for .synapse/state/ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| State file | Direct LanceDB read from hook | Would require importing @lancedb/lancedb into framework hooks layer, adding ~5MB+ dependency, startup latency; LanceDB uses native bindings that may fail in hook context |
| State file | MCP tool call from hook | Impossible -- statusline hooks cannot call MCP tools; they only receive stdin JSON from Claude Code |
| JSON state file | TOML state file | JSON is faster to parse (native JSON.parse), no library needed; TOML would require smol-toml import |

**Installation:**
No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Data Flow

```
Orchestrator writes state              Statusline reads state
========================               =======================
  store_document(rpev-stage-X)  --->   .synapse/state/statusline.json
  store_document(pool-state-X)  --->   (written after each RPEV/pool update)
  update_task(status change)    --->
```

### State File Schema (`.synapse/state/statusline.json`)

The orchestrator writes this file on every RPEV state change (stage transition, pool slot change, task completion, blocked item change). The statusline hook reads it on each render.

```json
{
  "project_id": "my-project",
  "project_name": "My Project",
  "top_epic": {
    "title": "Auth System",
    "done_count": 4,
    "total_count": 12,
    "completion_pct": 33
  },
  "pool": {
    "active": 3,
    "total": 3
  },
  "blocked": {
    "approval": 2,
    "failed": 1
  },
  "updated_at": "2026-03-06T12:00:00.000Z"
}
```

**Key design decisions:**
- File is flat JSON -- no nesting beyond one level. Keeps parsing fast.
- `top_epic` is pre-computed by orchestrator (highest-priority epic with active work) so statusline doesn't need to sort/filter.
- `blocked` counts are split by type (approval vs failed) matching the statusline display format `(2Y 1R)`.
- `null` values for `top_epic` and `pool` when no RPEV activity (idle state).
- `updated_at` lets the hook detect stale data (optional -- could show dim indicator if file is >5min old).

### Statusline Hook Extension Pattern

The existing statusline hook (synapse-statusline.js) follows this flow:
1. Set 3-second overall timeout
2. Read stdin JSON from Claude Code
3. Read project.toml via resolveConfig()
4. Build context bar from remaining_percentage
5. Write formatted string to stdout

Extension adds after step 3:
3b. Read state file with separate 500ms timeout
3c. Build RPEV progress section (epic + pool + blocked)
3d. Append to statusline output

```javascript
// Pattern: separate timeout for state file read
let rpevSection = "";
try {
  const stateFileTimeout = setTimeout(() => { throw new Error("timeout"); }, 500);
  const statePath = path.join(projectRoot, ".synapse", "state", "statusline.json");
  const raw = fs.readFileSync(statePath, "utf8");
  clearTimeout(stateFileTimeout);
  const state = JSON.parse(raw);
  // Build rpevSection from state...
} catch {
  // Silent fail -- statusline continues without RPEV info
}
```

**Important:** The 500ms timeout is for the state file read operation. Since `fs.readFileSync` is synchronous and reads a small JSON file (<1KB), it will almost always complete in <1ms. The timeout is a safety net for edge cases (NFS mounts, disk issues). Implementation should use `setTimeout` to set a flag, not to abort the sync read -- the read will complete instantly, but if the file is somehow blocking, the 3-second overall timeout will catch it.

### ANSI Escape Code Reference

Codes already used in the existing statusline:
- `\x1b[36m` -- Cyan (Synapse project name)
- `\x1b[32m` -- Green (context bar <50%)
- `\x1b[33m` -- Yellow (context bar 50-65%)
- `\x1b[38;5;208m` -- Orange (context bar 65-80%)
- `\x1b[5;31m` -- Blinking red (context bar >80%)
- `\x1b[2m` -- Dim (model name, directory)
- `\x1b[0m` -- Reset

For Phase 23 notifications:

| Style | ANSI Code | Use Case |
|-------|-----------|----------|
| Red blinking | `\x1b[5;31m` | Proactive blocked counter (proactive_notifications=true) |
| Dim/gray | `\x1b[2m` | Subtle blocked counter (proactive_notifications=false, default) |
| Yellow | `\x1b[33m` | Approval-needed indicator (Y in blocked counter) |
| Red | `\x1b[31m` | Failed indicator (R in blocked counter) |
| Cyan | `\x1b[36m` | Epic title in progress section |
| Green | `\x1b[32m` | Pool active count |

### Statusline Output Format

**Active state (RPEV running):**
```
Synapse: MyProject | Auth System 4/12 | Pool 3/3 | (2Y 1R) | Opus | mydir | [context bar]
```

**Active state with proactive_notifications=true (blinking blocked):**
```
Synapse: MyProject | Auth System 4/12 | Pool 3/3 | [BLINK](2Y 1R)[/BLINK] | Opus | mydir | [context bar]
```

**Idle state (no active RPEV, but blocked items exist):**
```
Synapse: MyProject | (1R) | Opus | mydir | [context bar]
```

**Idle state (no blocked items):**
```
Synapse: MyProject | Opus | mydir | [context bar]
```
(Falls back to current behavior -- no RPEV section at all)

### Project Overview Enhancement Pattern

The existing `projectOverview()` function returns document stats. Enhance it to also return task tree progress:

```typescript
// Extended interface
export interface ProjectOverviewResult {
  // ... existing fields ...

  // NEW: Task tree progress per epic
  task_progress?: {
    epics: Array<{
      task_id: string;
      title: string;
      priority: string | null;
      status: string;
      rpev_stage: string | null;  // From stage document if found
      rollup: {
        total_descendants: number;
        done_count: number;
        blocked_count: number;
        in_progress_count: number;
        completion_percentage: number;
      };
      rpev_stage_counts?: {
        refining: number;
        planning: number;
        executing: number;
        validating: number;
        done: number;
      };
    }>;
    total_epics: number;
  };

  // NEW: Pool status
  pool_status?: {
    active_slots: number;
    total_slots: number;
    queued_count: number;
    slots: Array<{
      letter: string;
      task_id: string | null;
      task_title: string | null;
      agent_type: string | null;
      epic_title: string | null;
    }>;
  };

  // NEW: Blocked items needing attention
  needs_attention?: {
    approval_needed: Array<{
      task_id: string;
      title: string;
      level: string;
      stage: string;
      involvement: string;
    }>;
    failed: Array<{
      task_id: string;
      title: string;
      level: string;
      notes: string;
    }>;
  };
}
```

### Epic Discovery Pattern

To find all epics for a project without knowing their task_ids:

```typescript
// Query tasks table for depth=0 (epics)
const tasksTable = await db.openTable("tasks");
const epicRows = await tasksTable
  .query()
  .where(`project_id = '${projectId}' AND depth = 0`)
  .toArray();
```

Then for each epic, call the existing `getTaskTree()` core function:

```typescript
import { getTaskTree } from "./get-task-tree.js";

for (const epicRow of epicRows) {
  const treeResult = await getTaskTree(dbPath, projectId, {
    project_id: projectId,
    root_task_id: epicRow.task_id as string,
    max_depth: 5,
    max_tasks: 200,
  });
  // Use treeResult.tree.rollup for aggregated stats
}
```

### RPEV Stage Document Aggregation

To get RPEV stage counts per epic, query stage documents and group by parent epic:

```typescript
// Query all RPEV stage documents
const docsTable = await db.openTable("documents");
const stageDocRows = await docsTable
  .query()
  .where(`project_id = '${projectId}' AND category = 'plan' AND tags LIKE '%|rpev-stage|%'`)
  .toArray();

// Parse each stage doc's content (JSON) to extract stage field
for (const doc of stageDocRows) {
  const content = JSON.parse(doc.content as string);
  // content.stage: "REFINING" | "PLANNING" | "EXECUTING" | "VALIDATING" | "DONE"
  // content.task_id: maps back to a task in the tree
  // content.level: "epic" | "feature" | "component" | "task"
  // content.pending_approval: boolean
}
```

### /synapse:status Command Update Pattern

The command (packages/framework/commands/synapse/status.md) is a Markdown skill file consumed by the AI agent. It tells the agent how to render the dashboard. Updates are text changes to the template:

1. Add "Needs Your Attention" section before "Epics (by priority)" section
2. Add inline blocked counts on epic lines: `Auth System [EXECUTING] (65% -- 2 blocked)`
3. Use icon/badge pattern for item types in the attention list

Recommended icons:
- `[APPROVE]` badge for approval-needed items (co-pilot/reviews involvement)
- `[FAILED]` badge for items with exhausted retries
- These are text badges, not emoji -- consistent with existing CLI aesthetic

### Anti-Patterns to Avoid
- **Importing LanceDB in hooks:** The hooks layer (packages/framework/hooks/) is pure JavaScript with minimal deps (only smol-toml). Adding @lancedb/lancedb would break this pattern, add native module risk, and slow startup.
- **Blocking on state file read:** The statusline must never hang. Always wrap state file reads in try/catch with silent fallback.
- **Duplicating tree logic:** project_overview must compose from get_task_tree, not duplicate the BFS/rollup code.
- **Calling MCP from statusline:** Impossible -- the statusline hook has no MCP client connection. It only receives stdin JSON from Claude Code.
- **Writing state file from statusline hook:** The hook is read-only (reads stdin, writes stdout). The orchestrator agent writes the state file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Task tree rollup stats | Custom tree traversal in project_overview | `getTaskTree()` from get-task-tree.ts | Already handles BFS, rollup computation, depth caps, filtering |
| TOML parsing in hooks | Custom parser | `smol-toml` (already imported) | Edge cases in TOML spec (escaped strings, multi-line, sub-tables) |
| ANSI escape code builder | Custom helper | Inline `\x1b[` codes (existing pattern) | The codebase already uses inline codes; a helper adds unnecessary abstraction |
| Config resolution | Manual path walking | `resolveConfig()` from lib/resolve-config.js | Handles walk-up, monorepo fallback, null for missing |
| LanceDB connection | Direct lancedb.connect() in project_overview | `connectDb()` from db/connection.ts | Handles mkdir, path resolution, logging |

**Key insight:** The get_task_tree tool already computes everything needed for per-epic progress (rollup stats with done/blocked/in_progress/total counts and completion_percentage). project_overview just needs to iterate over epics and call it.

## Common Pitfalls

### Pitfall 1: State File Race Conditions
**What goes wrong:** Orchestrator writes state file while statusline hook is reading it, resulting in partial/corrupt JSON.
**Why it happens:** fs.writeFileSync and fs.readFileSync are not atomic on most filesystems.
**How to avoid:** Write to a temp file first, then rename (atomic on most Linux/macOS filesystems). The orchestrator should use `fs.writeFileSync(tmpPath, data)` then `fs.renameSync(tmpPath, statePath)`.
**Warning signs:** Occasional JSON parse errors in statusline (silent due to try/catch, but visible in stderr if logging).

### Pitfall 2: Statusline Width Overflow
**What goes wrong:** Adding RPEV progress + pool + blocked counter makes the statusline too long for narrow terminals, causing text wrapping or truncation.
**Why it happens:** Terminal width varies. `Auth System 4/12 | Pool 3/3 | (2Y 1R)` adds ~35+ characters to an already populated statusline.
**How to avoid:** Keep RPEV section compact. Use abbreviations. Consider terminal width (available from stdin JSON as cwd but not directly as terminal width -- Claude Code doesn't expose terminal width in statusline data). Test with narrow terminal (80 chars).
**Warning signs:** Text wrapping in statusline area, visual glitches.

### Pitfall 3: Missing State File on First Run
**What goes wrong:** Before the orchestrator runs for the first time, no `.synapse/state/statusline.json` exists. Hook tries to read it and fails.
**Why it happens:** State file is created by orchestrator, not by init.
**How to avoid:** Always treat missing state file as "idle state" -- fall back to basic statusline. The try/catch around the read handles this naturally.
**Warning signs:** None if handled correctly (this is the expected initial state).

### Pitfall 4: Stale State File
**What goes wrong:** User resumes after days. State file shows old RPEV progress that no longer reflects reality.
**Why it happens:** State file is only updated when orchestrator runs. Between sessions, it persists.
**How to avoid:** Include `updated_at` in state file. Statusline can optionally dim or omit RPEV section if file is older than a threshold (e.g., 30 minutes). Or rely on the orchestrator to refresh state on session startup (it already does pool recovery on startup).
**Warning signs:** Statusline shows progress numbers that don't match /synapse:status output.

### Pitfall 5: LanceDB Query Latency in project_overview
**What goes wrong:** project_overview calls get_task_tree for each epic, plus queries stage documents and pool state. With many epics, this compounds.
**Why it happens:** Each get_task_tree call opens a table, queries rows, builds a tree. Multiple calls = multiple round-trips.
**How to avoid:** For the epic discovery, do a single `depth = 0` query. For stage documents, do a single `tags LIKE '%|rpev-stage|%'` query and group in-memory. Pool state is a single document lookup. Only call get_task_tree per epic (typically 1-5 epics, not hundreds).
**Warning signs:** project_overview latency >2 seconds with more than 3 epics.

### Pitfall 6: Circular Import Between Tools
**What goes wrong:** project_overview.ts imports from get-task-tree.ts. If get-task-tree.ts ever imports from project-overview.ts (unlikely but worth noting), circular dependency.
**Why it happens:** Composition pattern creates one-way dependency.
**How to avoid:** Keep the dependency one-way: project_overview imports get_task_tree. Never the reverse.
**Warning signs:** TypeScript compilation errors about circular references.

## Code Examples

### Statusline Hook Extension (packages/framework/hooks/synapse-statusline.js)

The key addition to the existing hook. Insert after the project.toml reading block (line ~33):

```javascript
// Source: existing synapse-statusline.js pattern + CONTEXT.md decisions
// Read RPEV state from state file (500ms timeout safety net)
let rpevSection = "";
try {
  const projectRoot = path.dirname(path.dirname(projectTomlPath));
  const statePath = path.join(projectRoot, ".synapse", "state", "statusline.json");
  const raw = fs.readFileSync(statePath, "utf8");
  const state = JSON.parse(raw);

  // Read proactive_notifications from trust.toml
  const trustPath = resolveConfig("trust.toml");
  let proactive = false;
  if (trustPath) {
    try {
      const trust = parseToml(fs.readFileSync(trustPath, "utf8"));
      proactive = trust.rpev?.proactive_notifications === true;
    } catch {}
  }

  // Build epic progress section
  if (state.top_epic) {
    const e = state.top_epic;
    rpevSection += `\x1b[36m${e.title}\x1b[0m ${e.done_count}/${e.total_count}`;
  }

  // Build pool section
  if (state.pool && state.pool.active > 0) {
    rpevSection += ` \x1b[2m|\x1b[0m \x1b[32mPool ${state.pool.active}/${state.pool.total}\x1b[0m`;
  }

  // Build blocked counter
  const approvalCount = state.blocked?.approval || 0;
  const failedCount = state.blocked?.failed || 0;
  if (approvalCount > 0 || failedCount > 0) {
    let blockedStr = "(";
    if (approvalCount > 0) blockedStr += `${approvalCount}\x1b[33m\u26a0\x1b[0m`;
    if (approvalCount > 0 && failedCount > 0) blockedStr += " ";
    if (failedCount > 0) blockedStr += `${failedCount}\x1b[31m\u2718\x1b[0m`;
    blockedStr += ")";

    if (proactive) {
      rpevSection += ` \x1b[5;31m${blockedStr}\x1b[0m`;  // Blinking red
    } else {
      rpevSection += ` \x1b[2m${blockedStr}\x1b[0m`;      // Dim/subtle
    }
  }

  if (rpevSection) {
    rpevSection = ` \x1b[2m|\x1b[0m ${rpevSection}`;
  }
} catch {
  // Silent fail -- statusline continues without RPEV info
}
```

### Project Overview Enhancement (packages/server/src/tools/project-overview.ts)

```typescript
// Source: existing project-overview.ts + get-task-tree.ts patterns
import { getTaskTree, type RollupStats, type GetTaskTreeResult } from "./get-task-tree.js";

// Inside projectOverview function, after existing queries:

// ── 6. Task tree progress (per epic) ──────────────────────────────
const tasksTable = await db.openTable("tasks");
const epicRows = await tasksTable
  .query()
  .where(`project_id = '${projectId}' AND depth = 0`)
  .toArray();

const epics: TaskProgressEpic[] = [];
for (const epicRow of epicRows) {
  try {
    const treeResult = await getTaskTree(dbPath, projectId, {
      project_id: projectId,
      root_task_id: epicRow.task_id as string,
      max_depth: 5,
      max_tasks: 200,
    });
    epics.push({
      task_id: epicRow.task_id as string,
      title: epicRow.title as string,
      priority: epicRow.priority as string | null,
      status: epicRow.status as string,
      rpev_stage: null, // filled below from stage docs
      rollup: treeResult.tree.rollup,
    });
  } catch {
    // Skip epic if tree fetch fails
  }
}

// ── 7. RPEV stage documents ──────────────────────────────────────
const stageDocRows = await docsTable
  .query()
  .where(`project_id = '${projectId}' AND category = 'plan' AND tags LIKE '%|rpev-stage|%' AND status != 'superseded'`)
  .limit(100)
  .toArray();

// Map stage docs to task_ids and build stage counts
for (const doc of stageDocRows) {
  try {
    const content = JSON.parse(doc.content as string);
    const matchingEpic = epics.find(e => e.task_id === content.task_id);
    if (matchingEpic) {
      matchingEpic.rpev_stage = content.stage;
    }
  } catch {}
}

// ── 8. Pool state document ───────────────────────────────────────
const poolDocRows = await docsTable
  .query()
  .where(`project_id = '${projectId}' AND tags LIKE '%|pool-state|%' AND status != 'superseded'`)
  .limit(1)
  .toArray();
```

### State File Write Pattern (for orchestrator guidance)

The orchestrator agent needs instructions to write the state file. This goes into the orchestrator's RPEV stage transition section:

```
After every RPEV state change (stage transition, pool slot change, task status update that affects blocked counts):
1. Compute the statusline state:
   - top_epic: highest-priority epic (lowest priority value) with status "in_progress" or has active descendants
   - pool: read from current pool-state document
   - blocked.approval: count of stage docs with pending_approval=true
   - blocked.failed: count of stage docs with notes containing failure/retry exhaustion
2. Write to .synapse/state/statusline.json using the Write tool
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Statusline shows only project name + model + context | Add RPEV progress + pool + blocked | Phase 23 | Users see real-time work stream progress |
| project_overview shows only document stats | Add task tree progress + pool status + needs_attention | Phase 23 | /synapse:status renders complete RPEV dashboard |
| Blocked items only visible via /synapse:status command | Blocked counter in statusline (passive notification) | Phase 23 | Users notice blocked items without running commands |

**Claude Code statusline protocol (verified 2026-03-06):**
- Hook receives full JSON via stdin including: model, workspace, context_window, cost, session_id, version
- Updates after each assistant message, permission mode change, or vim mode toggle
- Debounced at 300ms -- rapid changes batch together
- Supports ANSI escape codes for colors
- Supports multiple lines (each echo/print = separate row)
- Does NOT expose terminal width -- hook must estimate/assume
- If new update triggers while script running, in-flight execution is cancelled

## Open Questions

1. **State file write frequency in orchestrator**
   - What we know: Orchestrator must write .synapse/state/statusline.json on RPEV state changes
   - What's unclear: The orchestrator is an AI agent prompt (Markdown), not a code module. Writing the state file requires the orchestrator to use the Write tool (filesystem write) on every stage transition. This adds a tool call to every transition.
   - Recommendation: Add explicit instruction to orchestrator prompt to write state file after every RPEV/pool state update. The Write tool is already in the orchestrator's allowed tools list. Keep the file small (<500 bytes) so writes are instant.

2. **Epic priority sorting**
   - What we know: Task priority field is a string enum: "critical", "high", "medium", "low"
   - What's unclear: Are epics guaranteed to have a priority set? What if multiple epics have the same priority?
   - Recommendation: Sort by priority (critical > high > medium > low > null), break ties by creation date (oldest first). Handle null priority as lowest.

3. **RPEV stage counts per epic implementation**
   - What we know: Stage documents have `tags: "|rpev-stage|[level]|[stage]|"` and `content.task_id` that maps to a task
   - What's unclear: To compute stage counts per epic, we need to map each stage document's task_id to its parent epic. This requires either: (a) checking the task's root_id, or (b) traversing the tree
   - Recommendation: After fetching all stage docs, look up each task_id in the tree results (already fetched per epic) to map stage docs to their epic. Build stage counts in-memory.

## Sources

### Primary (HIGH confidence)
- Claude Code statusline documentation: https://code.claude.com/docs/en/statusline -- full JSON schema, update timing, ANSI support verified
- Existing codebase: synapse-statusline.js, project-overview.ts, get-task-tree.ts -- read and analyzed directly
- Orchestrator agent prompt: synapse-orchestrator.md -- pool-state and rpev-stage document schemas verified
- trust.toml: proactive_notifications field confirmed at `[rpev]` section

### Secondary (MEDIUM confidence)
- LanceDB query patterns: inferred from existing tools (all use same connectDb + table.query().where() pattern)
- State file atomic write pattern: standard Node.js fs.writeFileSync + fs.renameSync -- well-established pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- extending existing patterns (statusline hook, MCP tool), state file is a simple, well-understood mechanism
- Pitfalls: HIGH -- all identified from direct code analysis and Claude Code documentation
- Data access (state file recommendation): MEDIUM -- this is a discretionary choice; direct DB read would also work but has more risk

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- all components are project-internal, no external API changes expected)
