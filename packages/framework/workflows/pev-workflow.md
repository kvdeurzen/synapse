# Plan-Execute-Validate (PEV) Workflow

This workflow document is read by the synapse-orchestrator agent. It defines the complete lifecycle for executing a user goal through progressive task decomposition, wave-based parallel execution, and validation.

## Configuration

PEV behavior is controlled by `config/trust.toml` under the `[pev]` section:

- `approval_threshold`: "epic" | "feature" | "task" | "none"
- `max_parallel_executors`: Maximum concurrent executor subagents per wave (default: 3)
- `max_retries_task`: Task-level retry cap (default: 3)
- `max_retries_feature`: Feature-level retry cap (default: 2)
- `max_retries_epic`: Epic-level retry cap (default: 1)

## Trigger

The PEV workflow is triggered when:

- A user describes a goal (natural language or /synapse:new-goal command)
- The orchestrator normalizes the input into a goal statement

## Phase 1: Goal Intake and Epic Creation

1. Normalize trigger into a goal statement
2. Call `check_precedent` for related existing work
3. Create root epic via `create_task` (depth=0) with goal as title
4. Read `trust.toml` pev.approval_threshold to determine approval behavior:
   - "epic": Present feature list for user approval; autonomous below
   - "feature": Present task list per feature for user approval
   - "task": Present each task plan for user approval
   - "none": Fully autonomous end-to-end
5. Every approval point is conversational: options are approve, provide feedback/refine, or discuss further

## Phase 2: Progressive Decomposition

### Step 2a: Epic -> Features

1. Spawn Decomposer subagent via Task tool to decompose epic into features (depth=1 tasks)
2. Decomposer creates feature tasks with descriptions, acceptance criteria, and mandatory validation tasks:
   - Each feature gets an "integration test" child task
   - The epic gets an "epic integration" task
3. Spawn Plan Reviewer subagent to verify feature decomposition
   - Max 3 review cycles (Decomposer <-> Plan Reviewer loop)
   - If plan rejected after 3 cycles: escalate to user
4. If approval_threshold requires it, present feature list to user for approval

### Step 2b: Feature -> Tasks (JIT / On-Demand)

Features are decomposed into tasks (depth=2/3) only when the feature is next to execute -- NOT upfront.
Earlier features' outputs inform later decomposition.

For each feature when it becomes active:

1. Spawn Decomposer subagent to decompose feature into component/task-level items
2. Decomposer creates leaf tasks with:
   - Description and acceptance criteria
   - Unit test expectations
   - Dependencies on other tasks within the feature
3. Spawn Plan Reviewer to verify task decomposition (max 3 review cycles)
4. If approval_threshold = "feature" or "task": present to user
5. Identify execution waves: group independent tasks into parallel waves

## Phase 3: Wave Execution

For each feature:

### Wave Identification

1. Analyze task dependencies within the feature
2. Group independent tasks into waves (tasks with no unmet dependencies = Wave 1, etc.)
3. Cap parallel executors at `pev.max_parallel_executors` per wave

### Wave N Processing

1. For each task in the wave, spawn executor subagent via Task tool:
   - Use `isolation: "worktree"` for git isolation
   - Pass task spec, acceptance criteria, and relevant context in the prompt
   - Multiple Task tool calls in a single turn for parallel execution
2. Await all executor results
3. For each completed task: spawn Validator subagent to check output against spec
4. If any validation fails: HALT wave, trigger Failure Escalation (Phase 4)
5. If all validations pass: proceed to next wave
6. After all feature waves complete: spawn Integration Checker for feature-level validation
7. If integration passes: merge feature branch to main (sequential merge of task branches into feature branch first)
8. Emit wave checkpoint status block:

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

### Task-Level Failure

1. Spawn Debugger subagent with full context: task spec, what was attempted, error messages, relevant file paths
2. Debugger produces a diagnostic document (stored via store_document)
3. Auto-revert failed task's git changes (git revert or worktree discard)
4. Retry executor with debugger report in context
5. Track retry count (max: pev.max_retries_task, default 3)
6. If retries exhausted: escalate to feature level

### Feature-Level Failure

1. Aggregate task failure context
2. Present findings to user with options: approve revised plan, provide guidance, or abort feature
3. Max pev.max_retries_feature retries at this level (default 2)
4. If retries exhausted: escalate to epic level

### Epic-Level Failure

1. Present comprehensive failure report to user
2. Options: revise epic approach, descope features, or abort
3. Max pev.max_retries_epic retries (default 1)
4. If retries exhausted: halt PEV workflow, present all findings to user

### PEV Loop Cap

The overall PEV loop is capped at 3 iterations. On iteration 3 failure, escalate to user rather than silently looping. Present:

- What was attempted (all 3 iterations)
- What failed and why
- Proposed alternatives or manual intervention needed

## Phase 5: Epic Completion

After all features pass feature-level integration:

1. Spawn Integration Checker for epic-level validation (cross-feature integration)
2. If epic integration passes: mark epic task as complete
3. Present final status summary to user
4. Store completion decision via store_decision for project history

## Execution Isolation

- Each executor runs in an isolated git worktree (`Task` tool with `isolation: "worktree"`)
- Merge strategy: per-feature
  1. All tasks within a feature complete + integration check passes
  2. Sequential merge of task branches into feature branch
  3. Merge feature branch to main
- Auto-revert failed tasks (git), keep passing tasks within the feature

## Session Resume

PEV state is persisted in the Synapse task tree:

- Task status tracks wave progress (pending/in_progress/done/failed)
- Resume is user-triggered (not automatic on session start)
- On resume: read task tree, identify current wave position, continue from last incomplete wave

## Subagent Constraints

- Subagents spawned via Task tool CANNOT spawn other subagents -- orchestrator manages all spawning
- Fresh executor per retry (not resumed original) -- pass debugger's document in context for continuity
- Decomposer and Plan Reviewer are separate agents (Decomposer cannot review its own work)
