# Refine-Plan-Execute-Validate (RPEV) Workflow

This workflow document is read by the synapse-orchestrator agent. It defines the complete lifecycle for executing a user goal through the RPEV model: Refine, Plan, Execute, and Validate. All RPEV execution follows this document.

## Configuration

RPEV behavior is controlled by `config/trust.toml` under the `[rpev]` and `[rpev.involvement]` sections:

- `rpev.explicit_gate_levels`: Levels where user must explicitly signal readiness (default: ["project", "epic"])
- `rpev.proactive_notifications`: Whether to push notifications outside `/synapse:status` (default: false)
- `rpev.involvement`: Per-level × per-stage involvement matrix (see Involvement Resolution below)
- `rpev.domain_overrides`: Domain-specific involvement overrides (e.g., security tasks escalated to co-pilot)
- `rpev.max_pool_slots`: Maximum concurrent agent slots in the pool -- all agent types share this limit (default: 3)
- `rpev.max_retries_task`: Task-level retry cap (default: 3)
- `rpev.max_retries_feature`: Feature-level retry cap (default: 2)
- `rpev.max_retries_epic`: Epic-level retry cap (default: 1)

The involvement matrix is injected into session context by the startup hook — agents do not read trust.toml directly.

## Stage Document Schema

Every item in the RPEV flow gets exactly one stage document. This is the single source of truth for RPEV state. The fixed `doc_id` enables versioning: calling `store_document` with the same `doc_id` creates a new version rather than a duplicate.

**Schema:**

- `doc_id`: `"rpev-stage-[task_id]"` — fixed pattern, never use a ULID here
- `category`: `"plan"`
- `title`: `"RPEV Stage: [Item Title] ([Level])"`
- `tags`: `"|rpev-stage|[level]|[stage_lowercase]|"`
- `status`: `"active"`
- `content` (JSON string):
  - `stage`: `REFINING | PLANNING | EXECUTING | VALIDATING | DONE`
  - `level`: `project | epic | feature | work_package`
  - `task_id`: the task's ULID
  - `involvement`: the resolved involvement mode for the current stage
  - `pending_approval`: `true | false` — this is what `/synapse:status` queries
  - `proposal_doc_id`: doc_id of the proposal document if pending approval, otherwise null
  - `last_updated`: ISO timestamp
  - `notes`: brief state note (e.g., failure summary, "monitoring", "retries exhausted")

**Concrete example — creating or updating a stage document:**

```
mcp__synapse__store_document({
  project_id: "[project_id from session context]",
  doc_id: "rpev-stage-01HXYZ123ABC",
  title: "RPEV Stage: JWT Token Refresh (Feature)",
  category: "plan",
  status: "active",
  tags: "|rpev-stage|feature|planning|",
  content: JSON.stringify({
    stage: "PLANNING",
    level: "feature",
    task_id: "01HXYZ123ABC",
    involvement: "autopilot",
    pending_approval: false,
    proposal_doc_id: null,
    last_updated: new Date().toISOString(),
    notes: ""
  }),
  actor: "synapse-orchestrator"
})
```

**Key properties:**
- `pending_approval: true` is what `/synapse:status` queries to build the "Needs Your Input" section
- `proposal_doc_id` lets `/synapse:focus` load the proposal document directly without re-fetching the task tree
- Fixed `doc_id` (`rpev-stage-[task_id]`) prevents duplicate documents — `store_document` upserts in place

**Querying all active RPEV items:**

```
mcp__synapse__query_documents({
  project_id: "[project_id]",
  category: "plan",
  tags: "|rpev-stage|"
})
```

## Involvement Resolution

The involvement matrix (injected into session context by the startup hook) controls behavior at every stage transition. Resolution algorithm:

1. Identify the item's `level` (project/epic/feature/work_package) and the `stage` being entered (refine/plan/execute/validate)
2. Look up `{level}_{stage}` key in the injected `rpev.involvement` matrix for the base mode
3. Check `rpev.domain_overrides`: for each override key `{domain}_{stage}`, if the item has a matching domain tag, compare the override mode rank to the base mode rank
4. Involvement mode ordering (most to least user involvement): `drives(5) > co-pilot(4) > reviews(3) > monitors(2) > autopilot(1)`
5. Take the strictest (highest rank) between base mode and all matching domain overrides

**Behavior for each resolved mode:**

- **`drives`**: The user initiates this stage — the orchestrator does not proceed. Set `pending_approval: true` in the stage document with `notes: "waiting-for-user"`. Surface in `/synapse:status`. Do not proceed until user explicitly signals readiness.

- **`co-pilot`**: Execute the stage work (e.g., run Planner for a plan stage), store the output as a proposal document, set `pending_approval: true` with `proposal_doc_id` pointing to the proposal. Wait for user approval via `/synapse:focus`. Plan Auditor runs before user sees the proposal — only quality-checked proposals are presented.

- **`reviews`**: Execute the stage work, store output as a proposal document, set `pending_approval: true` with `proposal_doc_id`. User reviews after completion (agent does the work, then pauses for review). Differs from co-pilot: work is done first, then reviewed.

- **`autopilot`**: Execute the stage work, advance to the next stage automatically. No user involvement. Update stage document to next stage with `pending_approval: false`.

- **`monitors`**: Execute the stage work, advance to the next stage. Set `notes: "monitoring"` in stage document. User can intervene via `/synapse:focus`. Differs from autopilot: a brief notification appears in `/synapse:status` that work proceeded.

**Default involvement matrix (from trust.toml):**

| Level | Refine | Plan | Execute | Validate |
|-------|--------|------|---------|----------|
| project | drives | co-pilot | monitors | monitors |
| epic | co-pilot | reviews | autopilot | monitors |
| feature | reviews | autopilot | autopilot | autopilot |
| work_package | autopilot | autopilot | autopilot | autopilot |

## Phase 0: Refine

The Refine stage is handled by `/synapse:refine` — it is not orchestrator-spawned. This phase documents the bridge from refine completion to plan stage entry.

1. The user works with `/synapse:refine` to clarify goals, surface decisions, and resolve ambiguity
2. During refinement, decisions are stored via `store_decision` (DECIDED/OPEN/EMERGING states)
3. When the user signals readiness (or involvement mode allows auto-transition):
   - `/synapse:refine` creates or updates the stage document: `stage: "REFINING" → "PLANNING"`
   - Sets `pending_approval` based on the resolved involvement mode for `{level}_plan`
   - If involvement mode for refine is `drives` or `co-pilot`, user must explicitly confirm readiness (enforced by `/synapse:refine` step 7)
4. Decision state from Refine persists automatically: DECIDED items stored via `store_decision` are available to the Plan stage via `check_precedent` and `get_smart_context` — no manual handoff needed
5. The orchestrator detects items with `stage: "PLANNING"` in their stage documents on session start and proceeds accordingly

## Phase 1: Goal Intake and Epic Creation

The RPEV workflow begins when `/synapse:refine` confirms readiness for an item, or when the orchestrator detects a stage document with `stage: "PLANNING"`.

On session start, check for stage documents in PLANNING state via `query_documents` with tag `|rpev-stage|`. These are items ready for planning.

1. Normalize the goal into a goal statement (from stage document or direct user input)
2. Call `check_precedent` for related existing work — surface any relevant prior decisions
3. Create root epic via `create_task` (depth=0) with goal as title if not already created
4. Create stage document: `doc_id: rpev-stage-[task_id]`, `stage: "PLANNING"`, `level: "project"` or appropriate level
5. Resolve involvement mode for `{level}_plan`:
   - `drives` or `co-pilot`: Present feature decomposition proposal for user approval before proceeding
   - `reviews`: Proceed with decomposition, then present for review
   - `autopilot` or `monitors`: Proceed without user involvement
6. All approval interactions are conversational: approve, reject with feedback, or discuss further

## Phase 2: Progressive Decomposition

### Step 2a: Epic -> Features

1. Spawn Planner subagent via Task tool to decompose epic into features (depth=1 tasks)
   - Pass: `project_id`, `task_id`, `rpev_stage_doc_id: "rpev-stage-[task_id]"`, relevant decisions from `check_precedent`
2. Planner creates feature tasks with descriptions, acceptance criteria, and mandatory validation tasks:
   - Each feature gets an "integration test" child task
   - The epic gets an "epic integration" task
3. Spawn Plan Auditor subagent to verify feature decomposition
   - Max 3 review cycles (Planner <-> Plan Auditor loop)
   - If plan rejected after 3 cycles: escalate to user
4. Resolve involvement mode for `{level}_plan`:
   - `drives` or `co-pilot`: Present feature list for user approval before proceeding
   - `reviews`: Execute decomposition, then present feature list for user review
   - `autopilot` or `monitors`: Proceed without user involvement
5. Update stage document: `stage: "PLANNING"`, `pending_approval` per involvement mode

### Step 2b: Feature -> Tasks (JIT / On-Demand)

Features are decomposed into tasks (depth=2/3) only when the feature is next to execute — NOT upfront. Earlier features' outputs inform later decomposition.

For each feature when it becomes active:

1. Spawn Planner subagent to decompose feature into component/task-level items
   - Pass: `project_id`, `task_id`, `rpev_stage_doc_id`, relevant decisions
2. Planner creates leaf tasks with:
   - Description and acceptance criteria
   - Unit test expectations
   - Dependencies on other tasks within the feature
   - `context_refs`: decision_ids and document_ids relevant to each leaf task
3. Spawn Plan Auditor to verify task decomposition (max 3 review cycles)
4. Resolve involvement mode for `{level}_plan`:
   - `drives` or `co-pilot`: Present task list to user
   - `reviews`: Execute decomposition, then present
   - `autopilot` or `monitors`: Proceed without user involvement
5. Identify execution waves: group independent tasks into parallel waves
6. Update stage document: `stage: "PLANNING"`, record involvement mode

## Phase 3: Wave Execution

For each feature:

### Wave Identification

1. Analyze task dependencies within the feature
2. Group independent tasks into waves (tasks with no unmet dependencies = Wave 1, etc.)
3. Cap parallel agents at `rpev.max_pool_slots` -- all Task tool calls go through the orchestrator's Pool Manager

### Entering Execution

Update stage document: `stage: "EXECUTING"`, `pending_approval: false`, `last_updated: [now]`

### Wave N Processing

1. Dispatch wave tasks via the Pool Manager Protocol (defined in synapse-orchestrator.md):
   - For each task in the wave, assign to an available pool slot
   - Pool slots are capped at max_pool_slots (default 3)
   - If more tasks than slots: excess tasks queue and dispatch as slots free up
   - Each executor subagent spawned via Task tool with `isolation: "worktree"`
   - Include SYNAPSE HANDOFF block in each Task prompt
   - The Pool Manager handles slot assignment, not this workflow
2. As each executor completes:
   - Pool Manager captures token usage from Task result
   - Pool Manager frees the slot and runs dispatch tick
   - Dispatch tick assigns next queued task (or validator per finish-first policy)
3. Finish-first policy: when a task completes, its Validator gets the next available slot before any new execution starts
4. After all wave tasks are executed AND validated: proceed to next wave
5. If any validation fails: HALT wave, trigger Failure Escalation (Phase 4)
6. After all feature waves complete: spawn Integration Checker for feature-level validation
7. If integration passes: merge feature branch to main (sequential merge of task branches into feature branch first)
8. Update stage document: `stage: "VALIDATING"`
9. After validation passes: update stage document: `stage: "DONE"`, `pending_approval: false`
10. Emit wave checkpoint status block:

```
## Wave {N} Complete -- Feature: {feature_title} ({done}/{total} tasks)

| Task | Status | Agent | Notes |
|------|--------|-------|-------|
| {task_title} | done | executor | {brief summary} |
...

Integration check: PASSED/FAILED
Next: {next_feature_or_epic_integration} ({task_count} tasks ready)
```

### Wave N+1

Wave N+1 starts ONLY after ALL tasks in wave N are validated complete.

## Phase 4: Failure Escalation

Failed items are flagged via stage document: set `notes` to failure summary, set `pending_approval: true` if user intervention is needed. These appear in `/synapse:status` as flagged items requiring attention.

### Task-Level Failure

1. Spawn Debugger subagent with full context: task spec, what was attempted, error messages, relevant file paths
2. Debugger produces a diagnostic document (stored via `store_document(category: "debug_report")`) and links it to the failing task
3. Update stage document: set `notes` to failure summary
4. Auto-revert failed task's git changes (git revert or worktree discard)
5. Retry executor with debugger report in context
6. Track retry count per task — cap at `rpev.max_retries_task` (default 3)
7. If retries exhausted: auto-escalate to feature level. Update stage document: `notes: "task retries exhausted, escalated to feature level"`

**Keep successful work on partial wave failure** — only retry the failed task. If a revised plan invalidates earlier work, that is handled through replanning, not pre-emptive rollback.

### Feature-Level Failure

1. Aggregate task failure context
2. When user focuses on the item via `/synapse:focus`: show Debugger's diagnostic report plus structured options: Retry with guidance / Redefine the task / Skip and continue / Escalate to parent level
3. Set `pending_approval: true` in stage document — this surfaces in `/synapse:status` as a flagged item
4. Cap at `rpev.max_retries_feature` retries at this level (default 2)
5. If retries exhausted: auto-escalate to epic level. Update stage document: `notes: "feature retries exhausted, escalated to epic level"`

### Epic-Level Failure

1. Present comprehensive failure report to user
2. Options: revise epic approach, descope features, or abort
3. Cap at `rpev.max_retries_epic` retries (default 1)
4. If retries exhausted: set stage document `pending_approval: true`, `notes: "retries exhausted — needs user guidance"`. This shows in `/synapse:status` as a critical flag requiring manual intervention. Halt RPEV workflow until user provides guidance.

### Auto-Escalation Ladder

```
Executor failure
  → Debugger analysis
  → Retry executor with report
  → (retries exhausted) → Feature-level retry
  → (retries exhausted) → Epic-level retry
  → (retries exhausted) → Stop + flag for user via stage document
```

## Phase 5: Epic Completion

After all features pass feature-level integration:

1. Spawn Integration Checker for epic-level validation (cross-feature integration)
2. If epic integration passes: mark epic task as complete via `update_task(status: "done")`
3. Update stage document: `stage: "DONE"`, `pending_approval: false`
4. Present final status summary to user
5. Store completion decision via `store_decision` for project history

## Execution Isolation

- Each executor runs in an isolated git worktree (`Task` tool with `isolation: "worktree"`)
- Merge strategy: per-feature
  1. All tasks within a feature complete + integration check passes
  2. Sequential merge of task branches into feature branch
  3. Merge feature branch to main
- Auto-revert failed tasks (git), keep passing tasks within the feature

## Session Resume

On session start, the orchestrator queries for stage documents with tag `|rpev-stage|` to find items in progress:

```
mcp__synapse__query_documents({
  project_id: "[project_id]",
  category: "plan",
  tags: "|rpev-stage|"
})
```

For each active stage document:
- Note the current stage and level
- Check `pending_approval` — items with `pending_approval: true` need attention
- Resume from the current stage of each active item
- Present items needing input first, then offer to continue in-progress work

## Subagent Constraints

- Subagents spawned via Task tool CANNOT spawn other subagents — orchestrator manages all spawning
- Fresh executor per retry (not resumed original) — pass debugger's document in context for continuity
- Planner and Plan Auditor are separate agents (Planner cannot review its own work)
- All subagents receive `project_id`, `task_id`, and `rpev_stage_doc_id` in every Task call handoff
- All Task tool calls are mediated by the Pool Manager -- the orchestrator never issues Task calls directly outside the pool dispatch loop
