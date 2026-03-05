---
name: synapse:status
description: Show the RPEV project dashboard — epics by priority, feature progress, blocked items needing user input, recent decisions, and suggested actions.
allowed-tools:
  - Read
  - mcp__synapse__get_task_tree
  - mcp__synapse__get_smart_context
  - mcp__synapse__project_overview
  - mcp__synapse__semantic_search
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

3. **Get recent context:** Call `mcp__synapse__get_smart_context` in overview mode to retrieve recent decisions and activity.

4. **Check for active refinement sessions:** Call `mcp__synapse__semantic_search` with query `"refinement state"`, category `"plan"`, status `"active"` to find in-progress brainstorming sessions. Include these in the epic display under their respective epics.

5. **Present RPEV dashboard:**
   ```
   ## Synapse Dashboard

   ### Epics (by priority)

   **Epic A** [EXECUTING] (65% complete)
     - Feature 1 [DONE]
     - Feature 2 [IN PROGRESS] — 2/4 work packages done
     - Feature 3 [PENDING]

   **Epic B** [REFINING] (0% complete)
     - Refinement in progress — 3 decisions made, 2 open
     - Last refined: [date]

   **Epic C** [BACKLOG]
     - Not yet refined

   ### Needs Your Input

   [If blocked items exist:]
   N items need your attention:
     1. Epic B / Feature 4 — decision needed: "Auth strategy"
     2. Epic A / Feature 2 / WP 3 — blocked: "API spec unclear"

   Use `/synapse:focus "item name"` or `/synapse:focus 2.4` to navigate to a specific item.

   [If no blocked items:]
   All clear — no items currently need your input.

   ### Agent Pool
   [Phase 21 stub] Agent pool not yet active. When available, this section will show
   active agents and their current tasks.

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
