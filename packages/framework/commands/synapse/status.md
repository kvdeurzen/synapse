---
name: synapse:status
description: Show the RPEV project dashboard — epics by priority, feature progress, blocked items needing user input, recent decisions, and suggested actions.
allowed-tools:
  - Read
  - mcp__synapse__get_task_tree
  - mcp__synapse__get_smart_context
  - mcp__synapse__project_overview
  - mcp__synapse__semantic_search
  - mcp__synapse__query_documents
---

## Objective

Display the full RPEV project dashboard: epics in priority order, blocked items that need user attention, recent decisions, agent pool status, and suggested next actions.

## Process

1. **Get project overview:** Call `mcp__synapse__project_overview` for high-level stats and all enhanced sections. The response now includes:
   - `counts_by_category`, `counts_by_status`, `total_documents`, `recent_activity`, `key_documents` — existing document stats
   - `task_progress` — per-epic rollup stats (total/done/blocked/in_progress, completion_percentage) and `rpev_stage` per epic; `undefined` if no tasks exist
   - `pool_status` — agent pool state (active_slots, total_slots, queued_count, slots array); `undefined` if no pool-state document exists
   - `needs_attention` — `approval_needed` and `failed` arrays from RPEV stage documents; present when task_progress is present

2. **Query supplementary RPEV context (if needed):** Call `mcp__synapse__query_documents` with:
   - `category`: `"plan"`
   - `tags`: `"rpev-stage"`
   - `actor`: `"synapse-orchestrator"`

   This is supplementary to `project_overview.task_progress` — use it when you need detailed stage doc content (notes, proposal_doc_id) beyond what project_overview provides. The basic `rpev_stage` per epic is already in `project_overview.task_progress.epics[].rpev_stage`.

   Also check for active refinement sessions via `mcp__synapse__semantic_search` with query `"refinement state"`, category `"plan"`, status `"active"` — refinement state documents are separate from stage documents.

3. **Get recent context:** Call `mcp__synapse__get_smart_context` in overview mode to retrieve recent decisions and activity.

4. **Get feature-level detail per epic:** For each epic where you need to show the feature breakdown, call `mcp__synapse__get_task_tree` with the epic's task_id. This provides child feature/component/task detail that is NOT included in `project_overview.task_progress` (which only provides epic-level rollup).

   **Token aggregation from get_task_tree results:** For each task in the tree, check its `tags` field for the pattern `|tokens_used=N|` using regex `/\|tokens_used=(\d+)\|/`. Sum token counts:
   - Per feature: sum all child task tokens
   - Per epic: sum all child feature tokens

   Format as `Nk tokens` (divide by 1000, round to nearest integer). Only show token count if > 0.

5. **Present RPEV dashboard:**

   When displaying RPEV stage badges for epics, use `project_overview.task_progress.epics[].rpev_stage` when available — it is more authoritative than task tree status for RPEV stage. If no stage document exists for an epic, fall back to inferring stage from task tree status.

   Full dashboard format:

   ```
   ## Synapse Dashboard

   ### Needs Your Attention

   [If needs_attention.approval_needed has items OR needs_attention.failed has items:]

   {total count} items need your attention:

   [For each approval_needed item:]
     {n}. [APPROVE] **{title}** [{level}] {stage} -- awaiting your review
        Involvement: {involvement} | `/synapse:focus "{title}"` to review

   [For each failed item:]
     {n}. [FAILED] **{title}** [{level}] -- {notes (first 100 chars)}
        `/synapse:focus "{title}"` to see diagnostic report

   [If both arrays are empty:]
   All clear -- no items currently need your input.

   ### Epics (by priority)

   **Epic: {title}** [{STAGE}] ({percent}% complete{blocked_suffix}){token_display}
     - Feature: {title} [{STATUS}]{token_display} -- {done}/{total} tasks done
   ```

   Where:
   - `{blocked_suffix}` is ` -- {N} blocked` if `rollup.blocked_count > 0`, empty string otherwise
   - `{token_display}` is ` -- {N}k tokens used` if total tokens > 0, omitted otherwise

   Example:
   ```
   **Epic: Auth System** [EXECUTING] (65% complete -- 2 blocked) -- 142k tokens used
     - Feature: Login flow [DONE] -- 48k tokens used
     - Feature: JWT refresh [EXECUTING] -- 31k tokens used (2/4 tasks done)
     - Feature: Session mgmt [QUEUED]
   ```

   ### Pool section

   Use `project_overview.pool_status` directly — no separate query_documents call needed.

   ```
   [If project_overview.pool_status exists:]
   ### Agent Pool ({active_slots}/{total_slots} active, {queued_count} queued)
   - **A** [{agent_type}] {task_title} (Epic: {epic_title}) -- {minutes_running}m
   - **B** idle
   - **C** idle
   Queued ({queued_count}): {top 3 queue item titles}, +{remaining} more

   [If project_overview.pool_status does not exist:]
   ### Agent Pool
   Agent pool not yet active. The orchestrator will start the pool when work is dispatched.
   ```

   Where:
   - active_slots/total_slots come from `pool_status.active_slots` / `pool_status.total_slots`
   - For each slot in `pool_status.slots`: if task_id is non-null, show letter, agent_type, task_title, epic_title, and running time (computed as now - started_at in minutes from the original pool-state doc via supplementary query if needed)
   - For each null slot: show "idle"
   - If queue is empty, omit the "Queued" line

   Use `/synapse:focus agent [letter]` to inspect an agent.

   ### Recent Decisions and Suggested Actions

   ```
   ### Recent Decisions
   - [Decision title] (Tier N, [date])
   - [Decision title] (Tier N, [date])

   ### Suggested Actions
   [Based on current state, suggest 1-3 next steps — examples:]
   - Resume refinement of Epic B (`/synapse:refine "Epic B title"`)
   - Review blocked item in Epic A (`/synapse:focus "blocked item"`)
   - Start a new epic (`/synapse:refine`)
   ```

6. **Handle empty state:**
   - If `project_overview.task_progress` is null/undefined (no tasks exist), check for active refinement sessions via semantic_search. If none found:
     ```
     ## Synapse Dashboard

     No work streams yet. Get started:
     - `/synapse:refine` — describe your first epic and start shaping it
     - `/synapse:map` — index your codebase for semantic search (if not done yet)
     ```
   - If `task_progress` exists but `task_progress.epics` is empty, show:
     ```
     No epics yet. Run `/synapse:refine` to start shaping your first epic.
     ```

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
