---
name: synapse:new-goal
description: Create a new Synapse work stream from a user goal. Produces an epic in the task tree and begins progressive decomposition.
allowed-tools:
  - Read
  - Bash
  - mcp__synapse__create_task
  - mcp__synapse__store_decision
  - mcp__synapse__check_precedent
  - mcp__synapse__get_smart_context
---

## Objective

Create a new work stream (epic) in Synapse from the user's goal.

## Process

1. **Gather context:** Ask the user to describe their goal. If arguments are provided, use them as the goal description.

2. **Check precedent:** Call `mcp__synapse__check_precedent` with the goal to find related prior decisions.
   - If precedent exists, summarize it for the user before proceeding
   - This ensures we don't contradict established decisions

3. **Check existing work:** Call `mcp__synapse__get_smart_context` in overview mode to understand current project state.
   - Look for overlapping or related work streams
   - Surface any relevant context

4. **Create the epic:** Call `mcp__synapse__create_task` with:
   - `depth: 0` (epic level)
   - `title`: concise goal statement
   - `description`: full user intent with context from steps 2-3
   - `actor`: "synapse-orchestrator"
   - `project_id`: current project ID

5. **Confirm and offer next steps:**
   - Report the created epic (task_id, title)
   - Offer to begin decomposition into features
   - Or let the user refine the goal first

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
