---
name: synapse:pause
description: Pause active Synapse work — saves pipeline state for later resumption.
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__synapse__query_documents
  - mcp__synapse__get_task_tree
  - mcp__synapse__project_overview
---

## Objective

Save a full state snapshot of the current work context to `.synapse/state/pause-snapshot.json` so it can be resumed later. Supports pausing at any point — whether an RPEV pipeline is active or not.

## Process

1. **Detect pipeline state:** Call `mcp__synapse__project_overview` (with `actor: "synapse-gateway"`) to check for active task progress and pool status. Call `mcp__synapse__get_task_tree` for any active epics to find in-progress tasks. Query RPEV stage documents:
   ```
   mcp__synapse__query_documents(category: "plan", tags: "rpev-stage", actor: "synapse-gateway")
   ```
   An RPEV pipeline is considered active if any tasks have status `in_progress` or there are pool slots in use.

2. **Detect open refinements:** Call:
   ```
   mcp__synapse__query_documents(category: "refinement", actor: "synapse-gateway")
   ```
   Collect all doc_ids of in-progress refinement sessions.

3. **Capture current git HEAD:**
   ```bash
   git rev-parse HEAD
   ```
   Store the SHA as `revert_to_commit`.

4. **If pipeline is active (in-progress tasks exist):** Present the user with two choices:

   > **Pausing with active work — choose a stop mode:**
   >
   > **A) Graceful drain** — Snapshot is saved. In-flight agents will finish their current tasks naturally. The pipeline will not dispatch new work. Run `/synapse:continue` in a new session to resume from the next pending task.
   >
   > **B) Immediate stop** — Snapshot is saved now, with the current git SHA recorded as `revert_to_commit`. Partial work since that commit may need review. Run `/synapse:continue` to resume.

   Wait for the user to choose A or B. Set `stop_mode` to `"graceful"` for A or `"immediate"` for B.

5. **If no pipeline active:** Still save a snapshot with `pipeline_active: false`. Use conversation context to write a brief `session_context` summary (e.g., "User was refining the authentication epic" or "Exploring payment integration options"). Include any open refinement doc_ids in `pending_refinements`.

   Set `stop_mode: "graceful"` (no active agents to stop).

6. **Collect snapshot fields:**
   - From step 1: active epic task_id, active feature task_ids (in-progress), in-progress leaf task_ids, current pipeline stage from stage documents, pool_state_doc_id (format: `pool-state-{project_id}`)
   - From step 2: pending_refinements (array of doc_ids)
   - From step 3: revert_to_commit (git SHA)
   - From step 4/5: stop_mode

7. **Ensure the state directory exists:**
   ```bash
   mkdir -p .synapse/state
   ```

8. **Write snapshot:** Use the Write tool to create `.synapse/state/pause-snapshot.json` with this schema:
   ```json
   {
     "paused_at": "<ISO timestamp — use new Date().toISOString()>",
     "pipeline_active": true,
     "pipeline_stage": "REFINING|PLANNING|EXECUTING|VALIDATING",
     "active_epic_task_id": "<ULID or null>",
     "active_feature_task_ids": ["<ULIDs>"],
     "in_progress_task_ids": ["<ULIDs>"],
     "pool_state_doc_id": "pool-state-<project_id>",
     "pending_refinements": ["<doc_ids>"],
     "session_context": "<brief human-readable summary of what was in progress>",
     "revert_to_commit": "<git SHA>",
     "stop_mode": "graceful|immediate"
   }
   ```
   For fields with no data (e.g., no active epic), use `null` or `[]` as appropriate.

9. **Confirm to user:** Display a summary of what was captured:
   ```
   Snapshot saved to .synapse/state/pause-snapshot.json

   Captured:
   - Pipeline: [active at stage X | no active pipeline]
   - In-progress tasks: [N tasks | none]
   - Open refinements: [N sessions | none]
   - Git SHA: [first 8 chars]
   - Stop mode: [graceful | immediate]

   Run /synapse:continue in any future session to resume.
   ```

## Attribution

All Synapse tool calls MUST include `actor: "synapse-gateway"` for audit trail:
- `mcp__synapse__project_overview(actor: "synapse-gateway", ...)`
- `mcp__synapse__get_task_tree(actor: "synapse-gateway", ...)`
- `mcp__synapse__query_documents(actor: "synapse-gateway", ...)`
