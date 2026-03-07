---
name: synapse:status
description: Show the RPEV project dashboard — epics by priority, feature progress, blocked items needing user input, recent decisions, and suggested actions.
allowed-tools:
  - Read
  - mcp__synapse__get_task_tree
  - mcp__synapse__get_smart_context
  - mcp__synapse__project_overview
  - mcp__synapse__query_documents
---

## Objective

Display the full RPEV project dashboard: epics in priority order, blocked items that need user attention, recent decisions, agent pool status, and suggested next actions.

## Process

1. **Get project overview:** Call `mcp__synapse__project_overview` for high-level stats and all enhanced sections. The response includes:
   - `counts_by_category`, `counts_by_status`, `total_documents`, `recent_activity`, `key_documents` — document stats
   - `task_progress` — per-epic rollup stats (total/done/blocked/in_progress, completion_percentage) and `rpev_stage` per epic; `undefined` if no tasks exist
   - `pool_status` — agent pool state (active_slots, total_slots, queued_count, slots array); `undefined` if no pool-state document exists
   - `needs_attention` — `approval_needed` and `failed` arrays from RPEV stage documents; present when task_progress is present

2. **Discover epic IDs:** Call `mcp__synapse__get_smart_context(project_id: "{project_id}", mode: "overview", max_tokens: 2000)` to get the project summary which includes top-level epic task IDs. Alternatively, call `mcp__synapse__query_documents(category: "plan", tags: "rpev-stage")` to find all RPEV stage documents, which include task_ids. Extract all unique epic-level task_ids from the project_overview `task_progress.epics` array.

3. **Get per-epic shallow trees:** For each epic, call `mcp__synapse__get_task_tree(project_id: "{project_id}", root_task_id: "{epic_task_id}", max_depth: 2)`. This returns the epic + features + work packages, but NOT leaf tasks. The rollup stats on each node already contain `done_count`, `total_descendants`, and `completion_percentage`. This is O(epics) calls, not O(1), but each call is small.

   **Token aggregation from shallow tree results:** For each task node returned, check its `tags` field for the pattern `|tokens_used=N|` using regex `/\|tokens_used=(\d+)\|/`. Sum token counts:
   - Per feature: sum all child task tokens
   - Per epic: sum all child feature tokens

   Format as `Nk tokens` (divide by 1000, round to nearest integer). Only show token count if > 0.

4. **Query RPEV stage documents:** Call `mcp__synapse__query_documents` with:
   - `category`: `"plan"`
   - `tags`: `"rpev-stage"`
   - `actor`: `"synapse-orchestrator"`

   Parse each returned document's content (JSON) to extract:
   - Items with `pending_approval: true` — these need user attention
   - Items with `stage: "REFINING"` — active refinement sessions
   - Items with notes containing failure/retry information — these are flagged failures
   - Items with `stage: "EXECUTING"` or `"VALIDATING"` — in-progress work

5. **Get recent context:** Call `mcp__synapse__get_smart_context` in overview mode to retrieve recent decisions and activity.

6. **Render using a FIXED template.** The agent MUST follow this template exactly -- no reformatting, no alternative layouts:

   When displaying RPEV stage badges for epics, use stage document data when available -- it is more authoritative than task tree status for RPEV stage. If a stage document exists for an epic (matched by `rpev-stage-[task_id]`), use its `stage` field for the stage badge. If no stage document exists, fall back to inferring stage from task tree status.

   ```
   ## Synapse Dashboard

   ### Epics (by priority)

   {For each epic, sorted by priority (ascending value = higher priority):}
   **{epic.title}** [{RPEV_STAGE from stage doc, or inferred}] ({epic.rollup.completion_percentage}% complete){token_display}
   {For each feature child:}
     - {feature.title} [{STATUS}]{token_display} -- {feature.rollup.done_count}/{feature.rollup.total_descendants} done
   {End features}

   {End epics}

   ### Needs Your Input

   {If any stage docs with pending_approval=true:}
   {N} items need your attention:
     1. **{title}** [{level}] {stage} -- {notes from stage doc}
        `/synapse:focus "{title}"` to review

   {If any stage docs with failure notes:}
   {N} items have issues:
     1. **{title}** [{level}] {stage} -- retries exhausted
        `/synapse:focus "{title}"` for diagnostic report

   {If none:}
   All clear -- no items need your input.

   ### Agent Pool

   {Render pool section from project_overview.pool_status:}

   {If pool_status exists:}
   ### Agent Pool ({active_slots}/{total_slots} active, {queued_count} queued)
   - **A** [{agent_type}] {task_title} (Epic: {epic_title}) -- {minutes_running}m
   - **B** idle
   Queued ({queued_count}): {top 3 queue item titles}, +{remaining} more

   {If pool_status does not exist:}
   ### Agent Pool
   Agent pool not yet active. The orchestrator will start the pool when work is dispatched.

   Use `/synapse:focus agent [letter]` to inspect an agent.

   ### Recent Decisions
   - [Decision title] (Tier N, [date])
   - [Decision title] (Tier N, [date])

   ### Suggested Actions
   [Based on current state, suggest 1-3 next steps -- examples:]
   - Resume refinement of Epic B (`/synapse:refine "Epic B title"`)
   - Review blocked item in Epic A (`/synapse:focus "blocked item"`)
   - Start a new epic (`/synapse:refine`)
   ```

7. **Handle empty state:**
   - If `project_overview.task_progress` is null/undefined (no tasks exist):
     ```
     ## Synapse Dashboard

     No work streams yet. Get started:
     - `/synapse:refine` — describe your first epic and start shaping it
     - `/synapse:map` — index your codebase for semantic search (if not done yet)
     ```
   - If `task_progress` exists but `task_progress.epics` is empty:
     ```
     No epics yet. Run `/synapse:refine` to start shaping your first epic.
     ```

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
