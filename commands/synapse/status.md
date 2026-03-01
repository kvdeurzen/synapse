---
name: synapse:status
description: Show current Synapse work stream status including active epics, feature progress, and recent activity.
allowed-tools:
  - Read
  - mcp__synapse__get_task_tree
  - mcp__synapse__get_smart_context
  - mcp__synapse__project_overview
---

## Objective

Display the current state of all active Synapse work streams.

## Process

1. **Get project overview:** Call `mcp__synapse__project_overview` to get high-level project state.

2. **Find active epics:** Call `mcp__synapse__get_task_tree` for each active epic (depth=0, status != "done").
   - Extract rollup statistics: completion_percentage, done_count, total_descendants
   - Identify blocked tasks and their block reasons

3. **Get recent context:** Call `mcp__synapse__get_smart_context` in overview mode for recent decisions and activity.

4. **Present status report:**
   ```
   ## Project Status

   ### Active Work Streams

   **[Epic Title]** (XX% complete)
   - Features: X/Y done
   - Blocked: Z tasks
   - Recent: [last activity]

   ### Recent Decisions
   - [decision summaries]

   ### Next Steps
   - [suggested actions based on current state]
   ```

5. **Offer actions:** Based on status, suggest:
   - Resume a blocked task
   - Start the next unblocked feature
   - Create a new work stream

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
