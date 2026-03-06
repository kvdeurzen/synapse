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

1. **Get project overview:** Call `mcp__synapse__project_overview` for high-level stats (document counts, code index counts, overall project health).

2. **Get task tree:** Call `mcp__synapse__get_task_tree` with sufficient depth to show epics and their features. Extract:
   - All epics, sorted by priority (ascending priority value = higher priority)
   - Per-epic: completion percentage, done/total features, current RPEV stage (REFINING, PLANNING, EXECUTING, VALIDATING, BACKLOG, DONE)
   - Blocked items: tasks with status `"blocked"` and their block reasons
   - Items needing user input: blocked items where the block reason involves a decision or user action (not a technical dependency)

   **Token aggregation:** For each task in the tree, check its `tags` field for the pattern `|tokens_used=N|` using regex `/\|tokens_used=(\d+)\|/`. Sum token counts:
   - Per feature: sum all child task tokens
   - Per epic: sum all child feature tokens

   Format as `Nk tokens` (divide by 1000, round to nearest integer). Only show token count if > 0.

3. **Get recent context:** Call `mcp__synapse__get_smart_context` in overview mode to retrieve recent decisions and activity.

4. **Query RPEV stage documents:** Call `mcp__synapse__query_documents` with:
   - `category`: `"plan"`
   - `tags`: `"rpev-stage"`
   - `actor`: `"synapse-orchestrator"`

   Parse each returned document's content (JSON) to extract:
   - Items with `pending_approval: true` — these need user attention
   - Items with `stage: "REFINING"` — active refinement sessions
   - Items with notes containing failure/retry information — these are flagged failures
   - Items with `stage: "EXECUTING"` or `"VALIDATING"` — in-progress work

   Also still check for active refinement sessions via `mcp__synapse__semantic_search` with query `"refinement state"`, category `"plan"`, status `"active"` — refinement state documents are separate from stage documents.

5. **Present RPEV dashboard:**

   When displaying RPEV stage badges for epics, use stage document data when available — it is more authoritative than task tree status for RPEV stage. If a stage document exists for an epic (matched by `rpev-stage-[task_id]`), use its `stage` field for the stage badge. If no stage document exists, fall back to inferring stage from task tree status.

   Update the epic/feature display to include token aggregates:

   ```
   **Epic: {title}** [{STAGE}] ({percent}% complete){token_display}
     - Feature: {title} [{STATUS}]{token_display} -- {done}/{total} tasks done
   ```

   Where `{token_display}` is:
   - If total tokens > 0: ` -- {N}k tokens used`
   - If total tokens = 0: omit entirely

   Example:
   ```
   **Epic: Auth System** [EXECUTING] (65% complete) -- 142k tokens used
     - Feature: Login flow [DONE] -- 48k tokens used
     - Feature: JWT refresh [EXECUTING] -- 31k tokens used (2/4 tasks done)
     - Feature: Session mgmt [QUEUED]
   ```

   Full dashboard format:

   ```
   ## Synapse Dashboard

   ### Epics (by priority)

   **Epic A** [EXECUTING] (65% complete) -- 142k tokens used
     - Feature 1 [DONE] -- 48k tokens used
     - Feature 2 [IN PROGRESS] -- 31k tokens used (2/4 work packages done)
     - Feature 3 [PENDING]

   **Epic B** [REFINING] (0% complete)
     - Refinement in progress — 3 decisions made, 2 open
     - Last refined: [date]

   **Epic C** [BACKLOG]
     - Not yet refined

   ### Needs Your Input

   [If any stage documents have pending_approval=true:]
   N items need your attention:
     1. [Item Title] [[LEVEL]] [STAGE] — [describe what's needed based on stage doc notes]
        Involvement mode: [mode] | Use `/synapse:focus "[title]"` to review
     2. ...

   [If any stage documents have failure notes:]
   N items have issues:
     1. [Item Title] [[LEVEL]] [STAGE] — retries exhausted, needs guidance
        Use `/synapse:focus "[title]"` to see diagnostic report

   [If no pending items:]
   All clear — no items currently need your input.

   ### Agent Pool

   Query the pool-state document:
   ```
   mcp__synapse__query_documents({
     project_id: "[project_id]",
     category: "plan",
     tags: "|pool-state|"
   })
   ```

   If a pool-state document is found, parse its JSON content and render:

   ```
   ### Agent Pool ({active_count}/{max_slots} active, {queue_length} queued)
   - **A** [{agent_type}] {task_title} (Epic: {epic_title}) -- {minutes_running}m
   - **B** [{agent_type}] {task_title} (Epic: {epic_title}) -- {minutes_running}m
   - **C** idle
   Queued ({queue_length}): {top 3 queue item titles}, +{remaining} more
   ```

   Where:
   - active_count = number of non-null slots
   - For each non-null slot: show letter, agent_type in brackets, task_title, parent epic, and running time computed as (now - started_at) in minutes
   - For each null slot: show "idle"
   - Queue display: show count + first 3 queued item titles by priority order. If more than 3 items, append "+N more"
   - If queue is empty, omit the "Queued" line

   Use `/synapse:focus agent [letter]` to inspect an agent.

   If no pool-state document exists:
   ```
   ### Agent Pool
   Agent pool not yet active. The orchestrator will start the pool when work is dispatched.
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

6. **Handle empty state:** If no epics exist and no active refinement sessions are found:
   ```
   ## Synapse Dashboard

   No work streams yet. Get started:
   - `/synapse:refine` — describe your first epic and start shaping it
   - `/synapse:map` — index your codebase for semantic search (if not done yet)
   ```

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
