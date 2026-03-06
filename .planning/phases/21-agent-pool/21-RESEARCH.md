# Phase 21: Agent Pool - Research

**Researched:** 2026-03-06
**Domain:** Agent pool orchestration, work queue management, pool visibility, token tracking, agent interaction UX
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Slot Model and Sizing**
- One generic pool — no per-type partitioning. A single pool of N slots. The orchestrator assigns any available slot to the next highest-priority work, choosing the right agent type (executor, validator, integration-checker, decomposer, etc.) per task
- All agent types share the pool — every subagent the orchestrator spawns consumes a pool slot, regardless of type (execution-tier, planning-tier, or strategic)
- Fresh context per task — each agent starts clean via the Task tool with a SYNAPSE HANDOFF block. No agent reuse, no state carryover between tasks. Slots are fully flexible
- Default 3 slots, configurable in trust.toml as `max_pool_slots = 3`. Replaces the existing `max_parallel_executors = 3` (broader scope, same default)
- Queue with notification — when all slots are busy, new unblocked items wait. `/synapse:status` shows queued item count so users know work is waiting

**Work Queue and Assignment**
- Cross-epic parallelism — if the top-priority epic has only 1 unblocked task, remaining slots pull from lower-priority epics. Maximizes throughput across all active work
- Priority algorithm: epic priority first, then wave order — pick the highest-priority epic with unblocked work, then pick the next task in wave order within that epic. Validators/integration-checkers for completed work take priority over new execution (finish-first policy)
- Finish-first policy — when a task completes, its validation gets the next available slot before any new execution starts. Prevents piling up unvalidated work. Completes items end-to-end faster
- Idle + proactive prompt when all blocked — when all work across all epics is blocked (e.g., everything needs user approval), the pool goes idle and proactively tells the user that work is stalled (not just silently shown in `/synapse:status`)
- The orchestrator must track which epic each slot is working on to avoid accidentally starting decomposition of a second epic's features while the first is mid-wave (implementation detail for Claude)

**Agent Interaction (/synapse:focus agent)**
- Agent naming: A, B, C — sequential letters mapping to pool slots. `/synapse:focus agent A` to interact with slot A. Letters reset/reassign as agents finish and new ones start
- View + cancel — user can see agent status and cancel a running agent (kills it, frees the slot). No ability to send guidance mid-flight (agents run to completion or failure; the RPEV failure escalation handles issues)
- Cancel behavior: user chooses requeue or skip — after cancelling, prompt: "Requeue this task or skip it?" Requeue returns the task to 'ready' status (picked up by next available slot, git worktree discarded). Skip marks it as skipped in the task tree
- Agent detail view: summary card + recent activity — `/synapse:focus agent A` shows:
  - Agent letter, agent type (executor/validator/etc), task title, parent epic
  - Time running, current RPEV stage
  - Last 3-5 tool calls the agent made (e.g., "Read src/auth.ts", "Edit src/auth.ts")
  - Actions: [Cancel] [Back to status]

**Pool Visibility in /synapse:status**
- Placement: after epics, before suggested actions — epics stay at the top as the primary strategic view. Agent pool is a supporting section showing execution details
- One line per agent + queue summary:
  ```
  ### Agent Pool (2/3 active, 4 queued)
  - **A** [executor] JWT token refresh (Epic: Auth) — 3m
  - **B** [validator] Login flow tests (Epic: Auth) — 1m
  - **C** idle
  Queued (4): JWT logout, Session expiry, Password reset, +1 more
  ```
- No estimated token display for running agents — only show real data, never estimates
- Queue display: count + top 3 queued items — shows next 3 items in priority order so users know what's coming, plus "+N more" if additional items exist

**Token Usage Tracking**
- Log actual token usage per agent after completion — when a Task tool completes, capture the actual token count from the result and store it on the task (metadata or dedicated field)
- Display token usage on completed nodes — each completed task shows its token count in `/synapse:status`
- Aggregate upward — features sum their tasks' tokens, epics sum their features, project sums all epics. Gives cost visibility at every hierarchy level
- Format in status:
  ```
  **Epic: Auth System** [EXECUTING] (65% complete) — 142k tokens used
    - Feature: Login flow [DONE] — 48k tokens
    - Feature: JWT refresh [EXECUTING] — 31k tokens (2/4 tasks done)
    - Feature: Session mgmt [QUEUED]
  ```

### Claude's Discretion
- How to track pool state (in-memory during orchestrator session vs. persisted via stage documents)
- Exact mechanism for capturing token usage from Task tool results
- How to track recent agent activity (tool calls) for the focus view
- Internal data structure for the priority queue
- How to handle mid-wave slot reassignment when cross-epic work is available
- How `max_pool_slots` interacts with the existing wave execution model in pev-workflow.md

### Deferred Ideas (OUT OF SCOPE)
- Proactive push notifications — Phase 23 (Visibility + Notifications). Phase 21 uses proactive prompt only for "all work blocked" state
- Statusline progress indicator — Phase 23
- Send guidance to running agent — not implemented; agents run to completion. If needed, could be a future enhancement
- Real-time token tracking for running agents — only post-completion tracking implemented; live tracking deferred
- Per-agent-type pool partitioning — decided against (one generic pool), but could revisit if starvation becomes an issue
- Agent preemption — not implemented; agents run to completion unless cancelled by user
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| POOL-01 | Pool config in `trust.toml` defines max concurrent agent slots — the system respects the configured limit | Replace `max_parallel_executors` with `max_pool_slots` in trust.toml; synapse-startup.js injects pool config; orchestrator reads it for dispatch limit |
| POOL-02 | Unblocked work items are auto-assigned to available agent slots by priority — no manual agent dispatch required | Pool manager loop in orchestrator: finish-first then epic priority then wave order; cross-epic fill; idle prompt when all blocked |
| POOL-03 | `/synapse:focus agent C` shows what agent C is working on and allows interaction | Add `agent [A-Z]` argument parsing to focus.md; pool state document queried for slot details; cancel action with requeue/skip choice |
| POOL-04 | `/synapse:status` displays agent pool activity (active agents, their current tasks, idle slots) | Replace stub `### Agent Pool` section in status.md with live pool state; token aggregates on epic/feature lines |
</phase_requirements>

---

## Summary

Phase 21 is primarily an orchestrator behavior change with supporting visibility updates. The core work is in four areas: (1) wiring a pool manager into `synapse-orchestrator.md` and `pev-workflow.md` that controls Task tool dispatch via a priority queue, (2) extending `trust.toml` and `synapse-startup.js` to expose the new `max_pool_slots` config, (3) implementing agent pool state tracking via a pool stage document that persists slot assignments and token totals, and (4) updating `/synapse:status` and `/synapse:focus` to reflect live pool state.

The key architectural insight from CONTEXT.md is that the pool is a concurrency limiter on Task tool calls — the orchestrator already manages all subagent spawning. Phase 21 adds a cap, a priority queue, and visibility on top of the existing dispatch mechanism. No new MCP tools are needed. The task schema has no `tokens_used` field today; token storage will use the existing `store_document` + `update_task` pattern via the task's `tags` field (encoding `tokens_used=N` as a pipe-delimited tag entry) or via an RPEV stage document update — both patterns already work with existing tooling.

Token tracking has one important constraint: Claude's Task tool API returns `usage` data in the final result block. The orchestrator can read `result.usage.input_tokens + result.usage.output_tokens` after each Task tool call completes and store that integer on the task. The activity_log table has a `metadata` JSON column that can hold arbitrary key-value data including `tokens_used`, making it the lowest-friction storage path for per-task token counts without any schema migration.

**Primary recommendation:** Implement pool state as an in-session in-memory object augmented by a single pool-state document (doc_id: `pool-state-[project_id]`) for cross-session persistence. Token usage is stored in the activity_log `metadata` field on task completion and aggregated at display time by status.md. This avoids schema migrations and leverages existing patterns.

---

## Standard Stack

### Core (all already in project — no new dependencies)

| Library / File | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `packages/framework/agents/synapse-orchestrator.md` | current | Pool manager logic, dispatch loop | Already spawns all Task tool calls; pool adds cap + priority queue |
| `packages/framework/workflows/pev-workflow.md` | current | Wave execution protocol | Replace `max_parallel_executors` cap with pool-mediated dispatch |
| `packages/framework/config/trust.toml` | current | Pool slot config | Existing `[rpev]` section; add `max_pool_slots = 3`, remove `max_parallel_executors` |
| `packages/framework/hooks/synapse-startup.js` | current | Inject pool config into session | Already injects rpevContext; add `max_pool_slots` to that block |
| `packages/framework/commands/synapse/status.md` | current | Display pool section | Has stub `### Agent Pool` section to replace |
| `packages/framework/commands/synapse/focus.md` | current | Agent detail view | Add `agent [A-Z]` argument branch |
| `mcp__synapse__store_document` | current MCP tool | Pool state persistence | Fixed doc_id `pool-state-[project_id]` for cross-session resume |
| `mcp__synapse__update_task` | current MCP tool | Token usage + status update | Add `tags` update to encode `tokens_used=N` OR write to activity_log |
| Activity log service | current | Token usage audit trail | `logActivity()` accepts `metadata: {tokens_used: N}` |

### No new dependencies required

All implementation uses existing MCP tools, existing agent files, and existing JavaScript patterns in synapse-startup.js. No new npm packages needed.

---

## Architecture Patterns

### Recommended File Modification Set

```
packages/framework/config/
├── trust.toml          # max_pool_slots = 3 (replace max_parallel_executors)

packages/framework/hooks/
├── synapse-startup.js  # Inject max_pool_slots into rpevContext block

packages/framework/agents/
├── synapse-orchestrator.md  # Pool manager logic (dispatch loop, slot tracking, priority queue)

packages/framework/workflows/
├── pev-workflow.md     # Wave Execution: delegate to pool dispatch instead of direct Task calls

packages/framework/commands/synapse/
├── status.md           # Replace Agent Pool stub, add token aggregates to epic/feature display
├── focus.md            # Add "agent A/B/C" argument branch with detail view + cancel action
```

### Pattern 1: Pool State Document

**What:** A single Synapse document per project tracks the live pool state — which slots are active, what task each slot is running, start times, and last tool calls. Persisted so cross-session resumes can show what was in flight.

**When to use:** Write on every slot assignment change (task assigned, task completed, task cancelled). Read at `/synapse:status` and `/synapse:focus agent X`.

**doc_id convention:** `pool-state-[project_id]` — fixed pattern enables upsert versioning via `store_document`.

**Example pool state document content:**

```json
{
  "project_id": "my-project",
  "max_slots": 3,
  "slots": {
    "A": {
      "task_id": "01HXYZ123ABC",
      "task_title": "JWT token refresh",
      "agent_type": "executor",
      "epic_title": "Auth System",
      "epic_id": "01HABC456DEF",
      "started_at": "2026-03-06T12:00:00.000Z",
      "rpev_stage": "EXECUTING",
      "recent_tool_calls": [
        {"tool": "Read", "arg": "src/auth/jwt.ts", "at": "2026-03-06T12:01:30.000Z"},
        {"tool": "Edit", "arg": "src/auth/jwt.ts", "at": "2026-03-06T12:02:10.000Z"},
        {"tool": "Bash", "arg": "bun test src/auth", "at": "2026-03-06T12:03:05.000Z"}
      ]
    },
    "B": {
      "task_id": "01HXYZ999ZZZ",
      "task_title": "Login flow tests",
      "agent_type": "validator",
      "epic_title": "Auth System",
      "epic_id": "01HABC456DEF",
      "started_at": "2026-03-06T12:00:45.000Z",
      "rpev_stage": "VALIDATING",
      "recent_tool_calls": []
    },
    "C": null
  },
  "queue": [
    {"task_id": "01HQ001", "task_title": "JWT logout", "epic_id": "01HABC456DEF", "type": "executor"},
    {"task_id": "01HQ002", "task_title": "Session expiry", "epic_id": "01HABC456DEF", "type": "executor"},
    {"task_id": "01HQ003", "task_title": "Password reset", "epic_id": "01HABC999ZZZ", "type": "executor"}
  ],
  "tokens_by_task": {
    "01HDONE001": 48230,
    "01HDONE002": 12500
  },
  "last_updated": "2026-03-06T12:03:05.000Z"
}
```

**Store call:**

```
mcp__synapse__store_document({
  project_id: "[project_id]",
  doc_id: "pool-state-[project_id]",
  title: "Agent Pool State",
  category: "plan",
  status: "active",
  tags: "|pool-state|active|",
  content: JSON.stringify(poolState),
  actor: "synapse-orchestrator"
})
```

### Pattern 2: Pool Manager Dispatch Loop (orchestrator behavior)

**What:** The orchestrator runs a dispatch loop that maintains the slot assignments in-memory (augmented by the pool-state document for persistence). The loop follows the finish-first priority algorithm.

**Priority algorithm (in order):**

1. Pending validations for completed tasks (finish-first)
2. Pending integration checks for completed features (finish-first)
3. Highest-priority epic's next unblocked task (by wave order)
4. Next-priority epic's next unblocked task (cross-epic fill)
5. Idle (all work blocked or none remaining)

**Dispatch loop pseudocode to embed in orchestrator.md:**

```
## Pool Manager Protocol

### On session start:
1. Read pool-state document (doc_id: pool-state-[project_id]) if it exists
2. If slots show in-flight tasks, those Task tool calls may be orphaned — mark them as interrupted and re-queue or flag for user
3. Initialize in-memory slot map: { A: null, B: null, C: null } (up to max_pool_slots)

### Dispatch tick (run when a slot opens or new work arrives):
1. Count available slots = slots where value is null
2. If no available slots: stop, wait for next completion
3. Build work queue via priority algorithm:
   a. Pending validators for tasks with status "done" not yet validated (check stage docs)
   b. Pending integration-checkers for features with all tasks validated
   c. From highest-priority epic: next task in wave order with status "ready" and is_blocked=false
   d. Cross-epic fill: repeat (c) for lower-priority epics to fill remaining slots
4. Assign queue items to available slots (A fills before B fills before C)
5. For each assignment: spawn Task tool call with SYNAPSE HANDOFF block
6. Update pool-state document with new slot assignments
7. If work queue is empty after fill attempt: check if all pending work is blocked
   - If all blocked: emit proactive message "All unblocked work assigned. Items are waiting for your approval: [pending_approval list]"
   - If nothing left: emit "All work complete."

### On Task tool completion:
1. Record completion for that slot (agent letter)
2. If the task result contains usage data: extract total tokens (input+output), store in pool-state tokens_by_task and via update_task or activity_log
3. Mark slot as available (null)
4. Run dispatch tick
```

### Pattern 3: trust.toml Pool Config

**What:** Replace `max_parallel_executors` with `max_pool_slots` in the `[rpev]` section. Default stays 3.

**Before:**
```toml
[rpev]
max_parallel_executors = 3
```

**After:**
```toml
[rpev]
# Maximum concurrent agent slots in the pool (all agent types share this limit)
max_pool_slots = 3
```

**synapse-startup.js injection change** — add to the rpevContext block:

```javascript
// In rpevContext build block (around line 181 in synapse-startup.js):
const maxPoolSlots = trustToml.rpev.max_pool_slots ?? 3;

rpevLines.push(
  `  max_pool_slots: ${maxPoolSlots}  (default: 3, all agent types share this limit)`,
);
```

This makes `max_pool_slots` available to the orchestrator in session context without any hardcoding.

### Pattern 4: Token Usage Storage via update_task tags

**What:** After a Task tool call completes and returns its usage, store the token total on the task using the existing `update_task` tool. The cleanest approach is to store it in the task's `tags` field as a pipe-delimited entry.

**Example:**

```
mcp__synapse__update_task({
  project_id: "[project_id]",
  task_id: "[task_id]",
  tags: "[existing_tags]|tokens_used=48230|",
  actor: "synapse-orchestrator"
})
```

**Alternative — activity_log approach:** If the tags field is being used for other purposes and polluting it is undesirable, log to activity_log:

```
logActivity(db, projectId, "task_completed",
  task_id, "task",
  { tokens_used: 48230, agent_type: "executor" }
)
```

**Recommendation:** Use the `tags` field approach since `update_task` is already a Tool available to the orchestrator agent (no code path changes needed). The `activity_log` approach would require a new MCP tool or server-side call that is not accessible from the orchestrator agent's tool list.

**Token parsing pattern (in orchestrator.md):**

```
When a Task tool call completes and returns a result:
1. If result contains usage: { input_tokens: N, output_tokens: M }, compute total = N + M
2. Call update_task with tags: "[existing]|tokens_used=[total]|"
3. Update pool-state document: tokens_by_task["[task_id]"] = total
4. Free the slot and run dispatch tick
```

### Pattern 5: /synapse:status Pool Section (replace stub)

**What:** The current `status.md` has a placeholder stub for the Agent Pool section. Replace it with a live query of the pool-state document.

**Query pattern:**

```
Query pool-state document:
mcp__synapse__query_documents({
  project_id: "[project_id]",
  category: "plan",
  tags: "|pool-state|"
})
```

**Rendered output pattern:**

```markdown
### Agent Pool (2/3 active, 4 queued)
- **A** [executor] JWT token refresh (Epic: Auth) — 3m
- **B** [validator] Login flow tests (Epic: Auth) — 1m
- **C** idle
Queued (4): JWT logout, Session expiry, Password reset, +1 more
```

**Token aggregate format (on epic/feature lines above the pool section):**

```markdown
**Epic: Auth System** [EXECUTING] (65% complete) — 142k tokens used
  - Feature: Login flow [DONE] — 48k tokens
  - Feature: JWT refresh [EXECUTING] — 31k tokens (2/4 tasks done)
  - Feature: Session mgmt [QUEUED]
```

**Token aggregate calculation:** Query task tree, extract `tags` for each task, parse `|tokens_used=N|` entries. Sum leaf task tokens per feature; sum feature tokens per epic. Display as `Xk tokens` (divide by 1000, round).

**If no pool-state document exists** (orchestrator not yet active): Retain fallback message: "Agent pool not yet active. Run the orchestrator to start processing work."

### Pattern 6: /synapse:focus agent [A-Z]

**What:** Add a new argument branch for the `agent A/B/C` pattern in focus.md.

**Argument detection (add to step 1 of focus.md):**

```
- **Agent-based**: `/synapse:focus agent A` or `/synapse:focus agent B`
  Detect: argument matches /^agent\s+[A-Z]$/i
  Action: load pool-state document, find slot matching the letter, display agent detail view
```

**Agent detail view format:**

```markdown
## Agent C: [executor]

**Task:** JWT token refresh
**Epic:** Auth System
**Running:** 4m 23s
**Stage:** EXECUTING

### Recent Activity
- Read src/auth/jwt.ts (4m ago)
- Edit src/auth/jwt.ts (3m ago)
- Bash: bun test src/auth (2m ago)

### Actions
A) Cancel this agent
B) Back to status (`/synapse:status`)
```

**Cancel action flow:**

```
User selects Cancel:
1. Mark the slot as cancelling in pool-state document
2. Prompt: "Requeue this task or skip it?"
   - Requeue: call update_task(status: "ready") — pool will pick it up on next dispatch tick. Note: discard the git worktree (executor was using isolation: "worktree")
   - Skip: call update_task(status: "done", tags: "[existing]|skipped=true|") or is_cancelled: true
3. Free the slot in pool-state document (set to null)
4. Run dispatch tick to fill the slot
5. Confirm to user: "Agent C cancelled. Task '[title]' [requeued/skipped]."
```

**If no pool-state document exists or slot letter not found:**

```
"No agent is currently assigned to slot C. Use `/synapse:status` to see active agents."
```

### Anti-Patterns to Avoid

- **Spawning Task tool calls outside the pool manager:** The orchestrator must never spawn Task tool calls in pev-workflow.md Phase 3 directly — all Task calls go through the pool dispatch. Remove or replace direct Task calls in the wave execution section.
- **Resetting slot letters on every session:** Letters (A, B, C) map to slot indices, not task identity. A always = slot 0, B always = slot 1. They don't shift when a slot becomes free.
- **Blocking session on stale pool state:** If a pool-state document shows an in-flight task but the Task tool is not active, don't hang. Mark the slot as "interrupted" and re-queue the task. Pool state documents can go stale across session boundaries.
- **Aggregating tokens with get_task_tree:** The `get_task_tree` tool doesn't return the `tags` field content in a parsed form. The status command must parse the `|tokens_used=N|` pattern from raw tags strings returned in the tree nodes.
- **Storing token data without activity_log:** The `update_task` approach (via tags) is preferred because it is accessible from the orchestrator's tool list. Avoid adding a new MCP tool just for token storage.
- **Cross-epic slot contention on JIT decomposition:** When filling slots cross-epically, only assign executor/validator slots for features that are already decomposed. Do NOT trigger JIT decomposition of a lower-priority epic's feature just to fill a slot — that would start decomposition work in the wrong order.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pool state persistence | New DB table or schema migration | `store_document` with doc_id `pool-state-[project_id]` | Fixed doc_id enables upsert versioning; zero schema changes; existing tool in orchestrator toolset |
| Token storage per task | New `tokens_used` column on tasks table | `update_task` with `tags` field + `|tokens_used=N|` encoding | Tasks table has no metadata column; tags field is already a pipe-delimited store; schema migration is expensive |
| Agent activity tracking | Persistent tool call log in DB | In-memory `recent_tool_calls` array per slot, persisted to pool-state document | Pool-state doc already updated on every slot change; piggyback on that write |
| Priority queue | Custom heap or sorted structure | Ordered array rebuilt on each dispatch tick from `get_task_tree` | Task tree is the source of truth for priorities; rebuilding is correct behavior; no risk of stale priority cache |
| Worktree cleanup on cancel | Custom git command runner | Existing git isolation pattern — executor discards worktree on abort | Executor already runs in `isolation: "worktree"`; cancel = don't merge; the worktree expires naturally |

**Key insight:** The pool manager is behavioral specification in a markdown prompt file, not executable code. All persistence and data access flow through the existing MCP tool API. The orchestrator is an LLM agent that must follow the protocol — no new server-side infrastructure is required.

---

## Common Pitfalls

### Pitfall 1: Cross-Session Pool State Staleness

**What goes wrong:** Pool-state document shows slots A and B as in-flight after the user ends and resumes a session. The orchestrator tries to "wait" for those Tasks to complete, but they were already abandoned when the session ended.

**Why it happens:** Claude Code sessions are stateful per-session; Task tool calls do not persist across sessions.

**How to avoid:** On session startup, the orchestrator should read the pool-state document, identify any slots with non-null task assignments, check if those tasks are still in `in_progress` status, and emit a recovery prompt: "Found [N] abandoned in-flight tasks from previous session. Marking them as interrupted and re-queuing." Then: update_task(status: "ready") for each abandoned task, clear the slot in pool-state.

**Warning signs:** User resumes session and orchestrator hangs waiting for Task completions that never arrive.

### Pitfall 2: Finish-First Policy Causes Infinite Validation Loop

**What goes wrong:** Every time a slot opens, the finish-first check finds validations to run. Validators complete and queue integration checks. Integration checks complete and... the orchestrator keeps cycling through validation work while execution work for the next feature never starts.

**Why it happens:** Finish-first is correct but must be scoped to "pending validation for just-completed tasks in the current wave." Once all current-wave validations pass, the policy has been satisfied for that wave.

**How to avoid:** Finish-first priority applies to: validators for tasks completed this wave + integration checkers for features completed this round. Once those are clear, fill slots with next-wave executors. Don't re-run validations for tasks that are already validated.

**Warning signs:** Status shows only validators and integration-checkers running for minutes without any new executors starting.

### Pitfall 3: Agent Letter Reassignment Confusion

**What goes wrong:** Agent A finishes task X. Slot A is re-used for task Y. User runs `/synapse:focus agent A` expecting to see task X status, but sees task Y instead.

**Why it happens:** Agent letters are ephemeral slot identifiers, not task trackers. This is by design (from CONTEXT.md: "letters reset/reassign as agents finish and new ones start"). But users may not expect this.

**How to avoid:** The agent detail view should clearly show what is currently in that slot. If a user navigates to a just-completed agent slot that has already been reassigned, show the new task. Include a note in the focus output: "Slot A is now running a new task (previously: [old_task_title], completed [N]m ago)."

**Warning signs:** User confusion when `/synapse:focus agent A` shows different task than expected.

### Pitfall 4: Wave Execution Model Conflict

**What goes wrong:** The wave execution model in `pev-workflow.md` currently issues all Task tool calls in one turn: "Issue all Task tool calls in a single turn for true parallel execution." The pool manager changes this — it caps at `max_pool_slots` and may queue some wave tasks.

**Why it happens:** Wave execution was designed before the pool manager concept. The two protocols need reconciliation.

**How to avoid:** Update pev-workflow.md Phase 3 (Wave Execution) to say: "Dispatch wave tasks via pool manager — do NOT issue all Task calls in one turn. Instead, assign tasks to available slots up to max_pool_slots. When a slot completes, run dispatch tick to pull next queued task." The pool manager replaces the "issue all in one turn" instruction.

**Warning signs:** Orchestrator tries to spawn 8 executor Tasks for an 8-task wave but only 3 slots are available, causing incorrect concurrency.

### Pitfall 5: Tags Field Collision on Token Storage

**What goes wrong:** The `|tokens_used=N|` tag entry conflicts with other tags on the task, or the tag parsing regex is too greedy and double-counts.

**Why it happens:** Tags are stored as a pipe-delimited string with no schema validation on the values.

**How to avoid:** Parse token tags with a specific regex: `/\|tokens_used=(\d+)\|/`. When updating tags to add token count: check if `|tokens_used=` already exists (re-run scenario); if it does, replace the existing value rather than appending a second one. Pattern: `tags.replace(/\|tokens_used=\d+\|/, '') + '|tokens_used=' + total + '|'`.

**Warning signs:** Token aggregates show doubled values for retried tasks.

### Pitfall 6: JIT Decomposition Timing with Cross-Epic Fill

**What goes wrong:** Epic B (lower priority) has a feature that hasn't been decomposed yet. Epic A (higher priority) has all slots busy. The pool tries to fill remaining slots from Epic B but the feature has no tasks yet — triggering a JIT decomposition mid-wave of Epic A.

**Why it happens:** Cross-epic fill needs unblocked tasks to dispatch, but features that haven't been JIT-decomposed don't have tasks.

**How to avoid:** Cross-epic slot fill only applies to features that are already in EXECUTING stage (already have decomposed tasks). Don't trigger JIT decomposition of a lower-priority epic's features to fill cross-epic slots. Add this check to the dispatch algorithm: "For cross-epic fill, only pull tasks from features that are already in wave execution (have tasks with status 'ready' or 'pending')."

**Warning signs:** Lower-priority epic feature gets decomposed out of order, before higher-priority epics have their features decomposed.

---

## Code Examples

### trust.toml: Replace max_parallel_executors with max_pool_slots

```toml
# Source: packages/framework/config/trust.toml [rpev] section

[rpev]
explicit_gate_levels = ["project", "epic"]
proactive_notifications = false
# Maximum concurrent agent slots in the pool (all agent types share this limit)
max_pool_slots = 3
# Maximum retry attempts per layer before escalation
max_retries_task = 3
max_retries_feature = 2
max_retries_epic = 1
```

### synapse-startup.js: Inject max_pool_slots into rpevContext

```javascript
// Source: packages/framework/hooks/synapse-startup.js — extend existing rpevContext block
// After the existing rpevLines.push for gate levels (around line 215):

const maxPoolSlots = trustToml.rpev?.max_pool_slots ?? trustToml.rpev?.max_parallel_executors ?? 3;
rpevLines.push(
  "",
  `Pool: max_pool_slots=${maxPoolSlots} (all agent types share this limit)`,
  "Pool state doc_id: pool-state-[project_id] (query with query_documents tags: |pool-state|)",
);
```

### status.md: Pool Section Query + Token Aggregate Display

```markdown
<!-- Replace stub "### Agent Pool" section in status.md: -->

5b. **Query pool state:** Call `mcp__synapse__query_documents` with:
   - `category`: `"plan"`
   - `tags`: `"|pool-state|"`

   Parse the pool-state document content (JSON) to extract:
   - `slots` object: for each slot letter, current task assignment (or null = idle)
   - `queue` array: ordered list of queued work items
   - `tokens_by_task` map: task_id -> token count for completed tasks

   If no pool-state document found: show fallback "Agent pool not yet active."

5c. **Compute token aggregates from task tree:**
   For each task in the tree: parse tags field for `|tokens_used=(\d+)|`
   Sum per feature (feature tokens = sum of all leaf task tokens in feature)
   Sum per epic (epic tokens = sum of all feature tokens in epic)
   Format as: "Xk tokens" (divide by 1000, round to nearest integer)

   Show token totals on:
   - Completed features: "Feature: X [DONE] — 48k tokens"
   - In-progress features: "Feature: X [EXECUTING] — 31k tokens (2/4 tasks done)"
   - Epics with any completed work: "**Epic: X** [EXECUTING] (65% complete) — 142k tokens used"

### Agent Pool ({active}/{total} active, {queued} queued)

[For each slot letter A through max_pool_slots:]
- **A** [{agent_type}] {task_title} (Epic: {epic_title}) — {elapsed_time}
  [OR if null:] - **A** idle

[If queue has items:]
Queued ({count}): {title_1}, {title_2}, {title_3}[, +N more]

[If no pool-state doc:]
Agent pool not yet active. Run the orchestrator to process queued work.
```

### focus.md: Agent Argument Parsing

```markdown
<!-- Add to step 1 "Parse input" in focus.md: -->

- **Agent-based**: `/synapse:focus agent A`
  Detect: argument matches /^agent\s+([A-Za-z])$/i (extract the letter)
  Action: branch to "Agent Focus" flow (see below)

<!-- Add as a new step 4b "Agent Focus Flow": -->

4b. **If argument is agent-based (detected in step 1):**

   a. Extract slot letter (e.g., "A", "B", "C")
   b. Query pool-state document via `mcp__synapse__query_documents` with tags: `"|pool-state|"`
   c. Find the slot matching the letter in `content.slots`
   d. If slot is null: respond "Slot [letter] is currently idle. Use /synapse:status to see active agents."
   e. If slot has a task assignment: display agent detail view:

   ## Agent [letter]: [[agent_type]]

   **Task:** [task_title]
   **Epic:** [epic_title]
   **Running:** [elapsed time from started_at to now]
   **Stage:** [rpev_stage]

   ### Recent Activity
   [For each entry in recent_tool_calls (up to 5, most recent first):]
   - [tool] [arg] ([elapsed] ago)
   [If no recent tool calls: "No tool activity recorded yet."]

   ### Actions
   A) Cancel this agent
   B) Back to status (`/synapse:status`)

   f. If user selects "Cancel":
      - Confirm: "Cancel agent [letter] running '[task_title]'? The task will be [requeued/skipped]."
      - Present choice: "Requeue this task or skip it?"
        - Requeue: call `mcp__synapse__update_task(task_id, status: "ready")`, remove slot from pool-state
        - Skip: call `mcp__synapse__update_task(task_id, is_cancelled: true)`, remove slot from pool-state
      - Confirm: "Agent [letter] cancelled. Task '[title]' [requeued/skipped]."
      - Note in pool-state update: slot[letter] = null
```

### orchestrator.md: Pool Manager Protocol Section

```markdown
## Pool Manager Protocol

### Pool State Document

The pool-state document (doc_id: pool-state-[project_id]) tracks slot assignments,
queue, and token totals. Read and update it on every dispatch event.

Query:
  mcp__synapse__query_documents({ project_id, category: "plan", tags: "|pool-state|" })

Write (after every slot change):
  mcp__synapse__store_document({
    project_id, doc_id: "pool-state-[project_id]",
    title: "Agent Pool State", category: "plan", status: "active",
    tags: "|pool-state|active|", content: JSON.stringify(poolState),
    actor: "synapse-orchestrator"
  })

### Session Start: Pool Recovery

On session start (after reading stage documents):
1. Query pool-state document
2. For each slot with a non-null assignment:
   a. Check task status via get_task_tree — if status is "in_progress", the Task was abandoned
   b. Call update_task(status: "ready") to re-queue the task
   c. Set slot to null in pool-state
3. Log recovery to user: "Recovered [N] abandoned in-flight tasks, re-queued."
4. Run dispatch tick

### Dispatch Tick (run after any slot opens or new work is ready)

1. available_slots = count of null slots in pool-state.slots
2. If available_slots == 0: stop
3. Build priority-ordered work list:
   a. Validators: tasks with status "done" that have no validator-findings document yet
   b. Integration-checkers: features with all tasks validated (children_all_done = true) and no integration-findings document
   c. Executors: for each epic in priority order, next task with status "ready" and is_blocked=false, by wave order
   d. Cross-epic fill: repeat (c) for lower-priority epics to fill remaining available slots
      CONSTRAINT: only fill from features already in wave execution (have 'ready' tasks)
4. For each queued work item (up to available_slots):
   a. Find the next available slot letter
   b. Update pool-state.slots[letter] = { task_id, task_title, agent_type, epic_title, epic_id, started_at, rpev_stage, recent_tool_calls: [] }
   c. Append task to pool-state.queue (for display ordering)
   d. Spawn Task tool call with appropriate agent prompt and SYNAPSE HANDOFF block
5. Write updated pool-state document
6. If work list is empty after fill: check pending_approval in stage documents
   - If any pending approvals exist: "Pool idle — [N] items need your approval: [list]. Use /synapse:status to review."
   - If no pending approvals and no blocked work: "All work complete!"

### Task Completion Handler

When a Task tool call returns:
1. Identify which slot the task was running in (by task_id match)
2. Extract token usage: result.usage.input_tokens + result.usage.output_tokens (if available)
3. If tokens available:
   a. Call update_task with tags: existing + "|tokens_used=[total]|" (replace if already present)
   b. Update pool-state.tokens_by_task[task_id] = total
4. Set pool-state.slots[letter] = null
5. Write updated pool-state document
6. Run dispatch tick
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `max_parallel_executors` in trust.toml | `max_pool_slots` — broader scope, all agent types | Phase 21 | Pool covers executors, validators, decomposers — not just executors |
| Direct Task tool calls in pev-workflow.md wave execution | Pool-mediated dispatch via dispatch tick | Phase 21 | Concurrency capped across all agent types; priority queue enforced |
| No agent pool visibility in `/synapse:status` | Live pool section after epics | Phase 21 | User sees what agents are doing in real time |
| `/synapse:focus agent C` — deferred stub | Full agent detail view + cancel action | Phase 21 | User can monitor and cancel individual agents |
| No token tracking | Token count stored in task tags field after completion | Phase 21 | Cost visibility at task/feature/epic level |
| Manual dispatch (user triggers orchestrator) | Auto-dispatch to available slots | Phase 21 | "System drives, user unblocks" model fully operational |

**Deprecated/outdated after Phase 21:**
- `rpev.max_parallel_executors = 3` in trust.toml: removed, replaced by `max_pool_slots = 3`
- Wave execution instruction "Issue all Task tool calls in a single turn": replaced by pool dispatch
- `### Agent Pool [Phase 21 stub]` in status.md: replaced by live pool query

---

## Open Questions

1. **How does Claude Code's Task tool expose usage/token data?**
   - What we know: Claude's Task tool spawns a subagent. The result returned to the orchestrator is the subagent's final output text plus metadata.
   - What's unclear: Whether `result.usage` is accessible from within an orchestrator agent prompt that called `Task`. This is Claude Code API behavior, not directly inspectable from the codebase.
   - Recommendation: In the orchestrator prompt, instruct: "When a Task tool call completes, check if the result contains a `usage` field with `input_tokens` and `output_tokens`. If present, sum them and store via `update_task`. If not present, skip token storage for this task." This makes the behavior graceful regardless of API behavior — token tracking is best-effort, not critical path.

2. **Recent tool calls tracking in pool-state document**
   - What we know: The pool-state document's `recent_tool_calls` array is intended to show what each agent has done recently. But the orchestrator agent is not notified of subagent tool calls during execution — it only receives the final result.
   - What's unclear: Whether there is a way for the subagent (executor) to emit tool call summaries back to the orchestrator mid-execution.
   - Recommendation: Recent tool calls should be populated BY the executor/validator agent as part of their final result output, not tracked in real-time. Instruct all subagents: "In your final result, include a 'Recent tool calls' section listing the last 5 tool calls you made." The orchestrator parses this from the result text and writes it to pool-state. This is achievable today with the existing RPEV handoff pattern.

3. **Cancel without worktree cleanup command**
   - What we know: Executor tasks use `isolation: "worktree"`. When cancelled, the worktree should be discarded. But the orchestrator does not have a mechanism to kill a running Task tool call — it can only update the task status after the fact.
   - What's unclear: Whether Claude Code supports cancelling an in-flight Task tool call from the parent agent. If not, "cancel" may mean "mark as cancelled so when the executor finishes or self-reports its next status check, it stops."
   - Recommendation: Treat cancel as a soft signal. Update the task status to `is_cancelled: true` via `update_task`. The executor's Task Start Protocol (from Phase 19) should check task status at the start of each major phase and self-abort if `is_cancelled: true`. This is a convention-based cancellation, not a force-kill. Document this as a limitation in focus.md.

---

## Plan Structure Recommendation

Based on the scope, Phase 21 naturally breaks into 3 plans:

**Plan 21-01: Pool Config + Startup Hook**
- Replace `max_parallel_executors` with `max_pool_slots` in trust.toml
- Update synapse-startup.js to inject `max_pool_slots` into rpevContext
- Update all references to `max_parallel_executors` in agent files and workflow docs
- Files: trust.toml, synapse-startup.js, pev-workflow.md (config reference), synapse-orchestrator.md (config reference)

**Plan 21-02: Pool Manager in Orchestrator + pev-workflow**
- Add Pool Manager Protocol section to synapse-orchestrator.md
- Add Pool State Document specification to orchestrator
- Update pev-workflow.md Phase 3 (Wave Execution) to use pool-mediated dispatch
- Add Session Start pool recovery to orchestrator
- Add Task Completion Handler (token storage) to orchestrator
- Files: synapse-orchestrator.md, pev-workflow.md

**Plan 21-03: Visibility — status.md, focus.md, token aggregates**
- Replace stub Agent Pool section in status.md with live pool query + token aggregate display
- Add agent argument branch to focus.md with agent detail view and cancel action
- Files: status.md, focus.md

---

## Sources

### Primary (HIGH confidence)
- `/home/kanter/code/synapse/packages/framework/agents/synapse-orchestrator.md` — direct inspection of all Task tool dispatch points, subagent handoff pattern, tool list
- `/home/kanter/code/synapse/packages/framework/workflows/pev-workflow.md` — direct inspection of Phase 3 Wave Execution, `max_parallel_executors` reference
- `/home/kanter/code/synapse/packages/framework/config/trust.toml` — direct inspection of `[rpev]` section and `max_parallel_executors = 3`
- `/home/kanter/code/synapse/packages/framework/hooks/synapse-startup.js` — direct inspection of rpevContext injection pattern (lines 178-224)
- `/home/kanter/code/synapse/packages/framework/commands/synapse/status.md` — direct inspection of stub pool section (line 78-82)
- `/home/kanter/code/synapse/packages/framework/commands/synapse/focus.md` — direct inspection of deferred agent focus stub (line 158-159)
- `/home/kanter/code/synapse/packages/server/src/db/schema.ts` — confirmed: tasks table has no `tokens_used` column; tags field is Utf8 (pipe-delimited string)
- `/home/kanter/code/synapse/packages/server/src/tools/task-constants.ts` — confirmed: VALID_TASK_STATUSES includes "ready" (needed for requeue on cancel)
- `/home/kanter/code/synapse/packages/framework/config/agents.toml` — confirmed: synapse-orchestrator has `update_task` in allowed_tools (needed for token storage)
- `.planning/phases/21-agent-pool/21-CONTEXT.md` — full locked decisions and phase boundary

### Secondary (MEDIUM confidence)
- `.planning/phases/18-rpev-orchestration/18-RESEARCH.md` — stage document pattern established in Phase 18; pool-state document follows the same store_document upsert pattern
- `.planning/STATE.md` — confirmed Phase 21 depends on Phases 18 and 19 (both complete)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing tools confirmed in toolsets
- Trust.toml change: HIGH — direct code inspection; straightforward field rename
- synapse-startup.js change: HIGH — direct extension of existing rpevContext block pattern
- Pool manager protocol: HIGH — logical extension of existing wave execution model; all patterns established in Phase 18/19
- Token storage via tags field: MEDIUM — tags field is confirmed Utf8 pipe-delimited; parsing pattern is conventional; API-level `result.usage` availability in Task tool unconfirmed (see Open Questions)
- status.md pool section: HIGH — current stub identified; query pattern is store_document upsert with fixed doc_id; same as stage document pattern
- focus.md agent branch: HIGH — argument parsing pattern directly parallels existing path shorthand detection; all tools in allowed-tools list
- Recent tool calls tracking: MEDIUM — requires subagent cooperation (executor includes tool call list in final output); convention-based, not enforced

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain — no external libraries involved; pure prompt/config changes)
