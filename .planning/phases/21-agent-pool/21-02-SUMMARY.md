---
phase: 21-agent-pool
plan: 02
subsystem: framework
tags: [agent-pool, pool-visibility, status-command, focus-command, token-aggregation, cancel-action]
dependency_graph:
  requires: [21-01]
  provides: [pool-visibility-ui, agent-detail-view, cancel-action-flow]
  affects: [synapse-status, synapse-focus]
tech_stack:
  added: []
  patterns: [pool-state-query, token-aggregation, agent-detail-view, cancel-requeue-skip]
key_files:
  created: []
  modified:
    - packages/framework/commands/synapse/status.md
    - packages/framework/commands/synapse/focus.md
decisions:
  - "Agent-based detection checked first in focus.md parse step -- /^agent\\s+[A-Z]$/i must precede name-based check since 'agent A' is valid name-based input"
  - "Cancel action updates pool-state document directly and calls update_task -- slot cleared immediately, dispatch tick fills it on next cycle"
metrics:
  duration: "2 minutes"
  completed: "2026-03-06"
  tasks_completed: 2
  files_modified: 2
---

# Phase 21 Plan 02: Pool Visibility and Agent Interaction Summary

Live pool section in /synapse:status with active agents, idle slots, queue display, and token aggregates; agent detail view and cancel action in /synapse:focus with requeue/skip choice.

## What Was Built

### Task 1: Live Agent Pool Section and Token Aggregates in status.md

Replaced the Phase 21 stub in the Agent Pool section with a live pool-state document query and rendering instructions:

- **Pool query**: `mcp__synapse__query_documents` with tags `|pool-state|` retrieves the pool-state document written by the orchestrator in Plan 01
- **Active slot display**: For each non-null slot, shows agent letter, agent_type in brackets, task_title, parent epic title, and running time computed as `(now - started_at)` in minutes
- **Idle slot display**: Null slots show "idle"
- **Queue display**: Shows count and first 3 queued item titles by priority order; "+N more" if queue exceeds 3; omits "Queued" line if queue is empty
- **Fallback**: If no pool-state document exists, displays "Agent pool not yet active" message
- **Inspection link**: "Use `/synapse:focus agent [letter]` to inspect an agent"

Token aggregation added to step 2 (task tree extraction):

- Regex `/\|tokens_used=(\d+)\|/` extracts token counts from task `tags` field
- Per-feature: sum all child task tokens; per-epic: sum all child feature tokens
- Format: `Nk tokens` (divide by 1000, round to integer); omit if total is 0
- Epic and feature display lines updated to include ` -- Nk tokens used` suffix

Example output after changes:
```
**Epic: Auth System** [EXECUTING] (65% complete) -- 142k tokens used
  - Feature: Login flow [DONE] -- 48k tokens used
  - Feature: JWT refresh [EXECUTING] -- 31k tokens used (2/4 tasks done)
  - Feature: Session mgmt [QUEUED]

### Agent Pool (2/3 active, 1 queued)
- **A** [executor] JWT token refresh (Epic: Auth System) -- 12m
- **B** [validator] Login flow (Epic: Auth System) -- 3m
- **C** idle
Queued (1): JWT logout
```

### Task 2: Agent-Based Focus with Detail View and Cancel Action in focus.md

Added a third input mode to /synapse:focus and implemented the full agent interaction flow:

**Input detection (step 1) updated:**
- Agent-based checked FIRST before name-based and path shorthand
- Detection regex: `/^agent\s+[A-Z]$/i`
- Routing: agent-based -> step 8, path shorthand -> step 2, name-based -> step 3
- Ordering prevents "agent A" from being fuzzy-matched as a task name

**Step 8 (new) — Agent detail view:**

- Queries pool-state document via `mcp__synapse__query_documents` with tags `|pool-state|`
- Handles four cases:
  1. No pool-state document: "Agent pool not yet active" + status link
  2. Slot letter exceeds max_slots: out-of-range message with valid range
  3. Slot is null (idle): "Agent {letter}: idle" with status link
  4. Slot is assigned: full detail view

**Detail view when slot is active:**
```
## Agent A: [executor]

**Task:** JWT token refresh
**Epic:** Auth System
**Running:** 12m 34s
**Stage:** EXECUTING

### Recent Activity
- Edit src/auth/jwt.ts (1m ago)
- Read src/auth/jwt.ts (2m ago)

### Actions
A) Cancel this agent
B) Back to status (`/synapse:status`)
```

**Cancel action flow:**
1. Confirmation prompt: "Cancel Agent A running '{task_title}'? This will stop the agent."
2. Choice prompt: Requeue or Skip
   - **Requeue**: `update_task(status: "ready")` — returns task to pool queue; worktree cleanup automatic
   - **Skip**: `update_task(status: "done", tags: "[existing]|skipped=true|")` — marks as complete-skipped
3. `store_document` with updated pool-state JSON (slot set to null)
4. Confirmation with outcome: "Agent A cancelled. Task 'JWT token refresh' has been requeued."

**Deferred message removed:**
The "Agent-based focus is deferred to Phase 21" paragraph is deleted. The feature is now fully implemented.

## Decisions Made

- Agent-based detection checked first in focus.md parse step — `/^agent\s+[A-Z]$/i` must precede name-based check since "agent A" is valid name-based input. Priority: agent-based > path shorthand > name-based.
- Cancel action updates pool-state document directly and calls `update_task` — slot is cleared immediately; pool dispatch tick fills it on next cycle. No orchestrator signal needed.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files found on disk. Both task commits found in git log.

| Check | Result |
|-------|--------|
| packages/framework/commands/synapse/status.md | FOUND |
| packages/framework/commands/synapse/focus.md | FOUND |
| commit 72a290b (Task 1 — status.md) | FOUND |
| commit 0861ca4 (Task 2 — focus.md) | FOUND |
| pool-state query in status.md | FOUND |
| tokens_used aggregation in status.md | FOUND |
| Phase 21 stub removed from status.md | CONFIRMED |
| agent [A-Z] detection in focus.md | FOUND |
| pool-state query in focus.md | FOUND |
| Cancel this agent in focus.md | FOUND |
| deferred to Agent Pool removed from focus.md | CONFIRMED |
| requeue in focus.md | FOUND |
