---
name: synapse:continue
description: Resume paused Synapse work — restores pipeline state from snapshot.
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__synapse__query_documents
  - mcp__synapse__get_task_tree
  - mcp__synapse__project_overview
  - mcp__synapse__get_smart_context
---

## Objective

Load the pause snapshot, validate it against live state, and resume the RPEV pipeline or session context exactly where work was left off.

## Process

1. **Load snapshot:** Read `.synapse/state/pause-snapshot.json`. If the file does not exist, stop and inform the user:
   > No paused work found. Use `/synapse:pause` to save your current work state first.

2. **Display snapshot summary:** Show what was paused:
   ```
   Paused work found:

   - Paused at: [paused_at timestamp, human-readable]
   - Pipeline: [active at stage X | no active pipeline]
   - In-progress tasks: [count]
   - Open refinements: [count]
   - Stop mode: [graceful | immediate]
   - Session context: [session_context value]
   ```

3. **Validate against live state:**

   a. **Task validation:** For each task_id in `in_progress_task_ids`, call:
      ```
      mcp__synapse__get_task_tree(project_id: "{project_id}", root_task_id: "{task_id}", actor: "synapse-gateway")
      ```
      Check if the task still exists and what its current status is. Note any that are now `done`, `blocked`, or missing.

   b. **Refinement validation:** For each doc_id in `pending_refinements`, call:
      ```
      mcp__synapse__query_documents(doc_id: "{doc_id}", actor: "synapse-gateway")
      ```
      Check if the document still exists.

   c. **Git divergence check:** Run:
      ```bash
      git rev-parse HEAD
      git log --oneline {revert_to_commit}..HEAD
      ```
      Compare current HEAD to snapshot's `revert_to_commit`. If commits have been made since the pause, note them.

4. **Handle stale snapshot:** If tasks have been completed, deleted, or their status changed since the pause:
   > Since you paused, the following has changed:
   > - Task [id]: was in_progress, now [status]
   > - [N] commits made since pause: [commit list]
   >
   > How would you like to proceed?
   > A) Continue with the adjusted state (skip completed tasks)
   > B) Discard the snapshot and start fresh

   Wait for user to choose. If B, delete the snapshot file and stop.

5. **Handle immediate stop mode:** If `stop_mode` was `"immediate"` and `revert_to_commit` differs from current HEAD, warn:
   > Note: This work was paused with immediate stop mode. The following commits were made since the pause snapshot and may contain partial work:
   > [git log output]
   >
   > Review these commits before resuming. Do you want to continue?

   Wait for user confirmation before proceeding.

6. **Resume pipeline (if `pipeline_active` was true):**

   Reconstruct the pipeline entry point based on `pipeline_stage`:
   - `"REFINING"` — Re-enter the refinement flow. Call `mcp__synapse__query_documents` to load the active refinement documents. Present the refinement state to the user and offer to continue.
   - `"PLANNING"` — Dispatch the Orchestrator with the captured epic task_id and context to continue the planning pipeline.
   - `"EXECUTING"` or `"VALIDATING"` — Dispatch the Orchestrator with the active epic/feature/task context. The orchestrator will inspect pool state (via `pool_state_doc_id`) and resume dispatching work from the current position.

   Provide the Orchestrator with the following context from the snapshot:
   - `active_epic_task_id`
   - `active_feature_task_ids`
   - `in_progress_task_ids` (any that are still pending — skip those already done)
   - `pool_state_doc_id`

7. **Resume non-pipeline session (if `pipeline_active` was false):**

   Display the session context and help the user pick up where they left off:
   > Resuming session: [session_context]

   If `pending_refinements` is non-empty:
   > You had [N] open refinement session(s). Run `/synapse:refine` to continue.

   Load and display recent smart context:
   ```
   mcp__synapse__get_smart_context(project_id: "{project_id}", mode: "overview", max_tokens: 2000, actor: "synapse-gateway")
   ```

8. **Delete snapshot:** After successful resume (or when user discards):
   ```bash
   rm .synapse/state/pause-snapshot.json
   ```

## Attribution

All Synapse tool calls MUST include `actor: "synapse-gateway"` for audit trail:
- `mcp__synapse__get_task_tree(actor: "synapse-gateway", ...)`
- `mcp__synapse__query_documents(actor: "synapse-gateway", ...)`
- `mcp__synapse__project_overview(actor: "synapse-gateway", ...)`
- `mcp__synapse__get_smart_context(actor: "synapse-gateway", ...)`
