---
name: synapse:focus
description: Navigate to a specific item in the project hierarchy — by name (fuzzy search) or path shorthand (e.g., 2.3.1 for Epic 2, Feature 3, Work Package 1).
allowed-tools:
  - Read
  - mcp__synapse__get_task_tree
  - mcp__synapse__semantic_search
  - mcp__synapse__get_smart_context
  - mcp__synapse__check_precedent
  - mcp__synapse__store_document
  - mcp__synapse__store_decision
  - mcp__synapse__create_task
  - mcp__synapse__query_documents
  - mcp__synapse__update_task
---

## Objective

Navigate to a specific item in the project hierarchy and present its full context — status, decisions, related documents, and actionable options.

## Process

1. **Parse input:** The user provides either:
   - **Agent-based**: `/synapse:focus agent A` or `/synapse:focus agent B`
   - **Name-based**: `/synapse:focus "JWT token refresh"` or `/synapse:focus auth strategy`
   - **Path shorthand**: `/synapse:focus 2.3.1` (digits separated by dots)
   - **No argument**: Ask "What would you like to focus on? You can use a name (fuzzy matched) or a path like 2.3 (Epic 2, Feature 3)."

   Detect which mode by checking in this order:
   1. Agent-based FIRST: if argument matches `/^agent\s+[A-Z]$/i` — go to step 8
   2. Path shorthand: if argument matches `/^\d+(\.\d+)*$/` — go to step 2
   3. Name-based: any other text — go to step 3

   (Agent-based must be checked first since "agent A" would otherwise be treated as a name search.)

2. **Resolve item — Path shorthand mode:**
   - Call `mcp__synapse__get_task_tree` with `actor: "synapse-orchestrator"` to get the full task tree
   - Sort epics by priority (or creation order if no priority set)
   - Parse the path: `2.3.1` means the 2nd epic in priority order, its 3rd child (feature), that feature's 1st child (work package)
   - If the index is out of range, respond: "Path 2.3.1 doesn't match — Epic 2 only has 2 features. Here's what's available:" then show the relevant tree section
   - Note in output: "Positions reflect current priority order and may change if items are reprioritized."

3. **Resolve item — Name-based mode:**
   - Call `mcp__synapse__semantic_search` with the user's text as query, `limit: 5`, `actor: "synapse-orchestrator"`
   - Also call `mcp__synapse__get_task_tree` with `actor: "synapse-orchestrator"` and search task titles for partial matches
   - Cross-reference: prefer task tree matches (they have hierarchy context) over document-only matches
   - If multiple matches: present them ranked by relevance and let the user choose
   - If no match: "No items found matching '[query]'. Here's what exists:" then show the top-level epic list

4. **Present item context:** Once the item is resolved, display a comprehensive view:
   ```
   ## Focus: [Item Title]

   **Level:** [Epic/Feature/Work Package]
   **Status:** [RPEV stage — Refining/Planning/Executing/Done]
   **Priority:** [N] of [total at this level]
   **Parent:** [Parent item title] (if not top-level)

   ### Progress
   [If has children:]
   - Children: X/Y complete
   - Blocked: Z items
   [If leaf:]
   - Status: [current status]

   ### Decisions
   [Relevant decisions from check_precedent and get_smart_context]
   - [Decision title] (Tier N) — [brief rationale]

   ### Related Documents
   [From get_smart_context focused mode]
   - [Document title] ([category])

   ### Open Questions
   [If refinement session exists with OPEN items:]
   - [Open question from refinement state]
   ```

   To populate Decisions and Related Documents, call:
   - `mcp__synapse__check_precedent` with the item title as query, `actor: "synapse-orchestrator"`
   - `mcp__synapse__get_smart_context` with `mode: "focused"`, the item title as query, `actor: "synapse-orchestrator"`

5. **Offer contextual actions:** Based on item state, suggest appropriate next steps:
   - **If item is blocked:** "This item needs a decision. Would you like to explore the options?" Then start an inline refinement session (using the same brainstorming approach as /synapse:refine).
   - **If item is in Refining state:** "Resume refinement? (`/synapse:refine "[title]"`)"
   - **If item is in Planning/Executing:** "This item is being handled by the system. Check `/synapse:status` for overall progress."
   - **If item is Done:** "This item is complete. Review its validation results?"
   - **If item doesn't exist yet but user described it:** "This doesn't exist yet. Would you like to create it as a new [epic/feature/work package]?"

6. **Handle blocked items (decision engagement):** When the focused item needs a decision:
   - Present the decision context clearly:
     ```
     ### Decision Needed: [Decision topic]

     **Context:** [Why this decision matters at this level]
     **Options explored:** [If any from prior sessions]

     What's your thinking on this?
     ```
   - Adapt engagement to decision complexity:
     - Binary decisions: Present options directly ("Option A: X, Option B: Y — which direction?")
     - Open-ended decisions: Start conversational engagement ("What factors are most important here?")
   - Store any decision made via `mcp__synapse__store_decision` with `actor: "synapse-orchestrator"`

7. **Handle pending approval (two-tier UX):** After presenting item context (step 4), check if the item has an RPEV stage document with `pending_approval: true`. To check: call `mcp__synapse__query_documents` with category `"plan"`, tags `"rpev-stage"` and look for a document with doc_id matching `"rpev-stage-[task_id]"`.

   If `pending_approval` is true and `proposal_doc_id` is set:

   a. **Load the proposal:** Call `mcp__synapse__get_smart_context` with the `proposal_doc_id` to retrieve the full proposal document.

   b. **Present summary-first view (Tier 1 — quick triage):**
      ```
      ## Proposal: [Item Title]

      **Stage:** [current stage] | **Level:** [level] | **Involvement mode:** [mode]
      **Quality check:** [If Plan Reviewer ran: "Passed" or note]

      ### Summary
      [2-3 sentence summary extracted from the proposal document]

      ### Key decisions in this proposal
      - [Decision 1]
      - [Decision 2]

      ### Options
      A) **Approve** — proceed with this plan
      B) **Reject** — send back with your feedback
      C) **Discuss deeper** — conversational review of the full proposal
      ```

   c. **If user chooses Approve:**
      - Update stage document: set `pending_approval: false`, advance `stage` to next phase (e.g., PLANNING -> EXECUTING)
      - Update task status if needed: call `mcp__synapse__update_task` with `status: "in_progress"`
      - Confirm: "Approved. The orchestrator will proceed with [next stage]."

   d. **If user chooses Reject:**
      - Ask for specific feedback: "What should be changed? Your guidance will be passed to the [Decomposer/Planner] for revision."
      - Update stage document: set `notes` to rejection feedback, keep `pending_approval: true`
      - The orchestrator will detect this on next session start and re-run the specialist agent with feedback (max 3 review cycles per WFLOW-06)

   e. **If user chooses Discuss Deeper (Tier 2 — conversational review):**
      - Load and display the full proposal document content
      - Switch to conversational mode: ask clarifying questions, explore concerns, let the user probe details
      - After discussion, re-present options A (Approve) and B (Reject)

   If `pending_approval` is true but NO `proposal_doc_id`:
   - This is a "drives" mode item waiting for user initiation, or a failed item
   - If stage notes indicate failure: present the Debugger's diagnostic report (fetch via get_smart_context) plus options:
     ```
     ### Failed Item: [Title]

     **Diagnostic:** [summary from debugger report]
     **Retries used:** [N] of [max]

     Options:
     A) Retry with guidance — provide direction for the next attempt
     B) Redefine the task — rethink the approach
     C) Skip and continue — mark as skipped, proceed with other work
     D) Escalate to parent — push this up to [parent level] for re-evaluation
     ```
   - If stage is REFINING/waiting: "This item is waiting for you to refine it. Run `/synapse:refine \"[title]\"` to start."

8. **Handle agent-based focus:** When the argument matches `/^agent\s+[A-Z]$/i`:

   a. Extract the slot letter (uppercase).

   b. Query the pool-state document:
      ```
      mcp__synapse__query_documents({
        project_id: "[project_id]",
        category: "plan",
        tags: "|pool-state|"
      })
      ```

   c. If no pool-state document found:
      ```
      Agent pool is not yet active. The orchestrator will start the pool when work is dispatched.
      Use `/synapse:status` for current project state.
      ```

   d. Parse the pool-state document JSON. Look up the requested slot letter in the `slots` map.

   e. If the slot letter exceeds max_slots (e.g., user asks for Agent D when max_slots=3):
      ```
      Agent pool has {max_slots} slots (A through {last_letter}). Slot {letter} does not exist.
      Use `/synapse:status` to see active agents.
      ```

   f. If the slot is null (idle):
      ```
      ## Agent {letter}: idle

      No task currently assigned to this slot.
      Use `/synapse:status` to see overall pool activity.
      ```

   g. If the slot has an assigned task, render the detail view:
      ```
      ## Agent {letter}: [{agent_type}]

      **Task:** {task_title}
      **Epic:** {epic_title}
      **Running:** {minutes}m {seconds}s
      **Stage:** {rpev_stage}

      ### Recent Activity
      {For each entry in recent_tool_calls (last 3-5), newest first:}
      - {tool} {arg} ({time_ago} ago)

      {If recent_tool_calls is empty:}
      No activity recorded yet.

      ### Actions
      A) Cancel this agent
      B) Back to status (`/synapse:status`)
      ```

      Computing running time: subtract `started_at` from current time.
      Computing time_ago for tool calls: subtract `at` from current time.

   h. **Cancel action flow:** If the user selects Cancel (option A):
      1. Confirm: "Cancel Agent {letter} running '{task_title}'? This will stop the agent."
      2. After user confirms, prompt: "What should happen to the task?"
         - **Requeue**: "Returning task to queue. It will be picked up by the next available slot."
           Call `mcp__synapse__update_task({ project_id, task_id: [slot.task_id], status: "ready", actor: "synapse-orchestrator" })`
           Note: the executor's git worktree is discarded automatically (isolation: "worktree" handles cleanup).
         - **Skip**: "Marking task as skipped."
           Call `mcp__synapse__update_task({ project_id, task_id: [slot.task_id], status: "done", tags: "[existing_tags]|skipped=true|", actor: "synapse-orchestrator" })`
      3. Update pool-state document: set the slot to null, remove from queue if present.
         Call `mcp__synapse__store_document` with the updated pool-state JSON.
      4. Confirm: "Agent {letter} cancelled. Task '{task_title}' has been [requeued/skipped]. The pool manager will fill the slot on next dispatch."

**Anti-patterns:**
- Do NOT show raw task_ids to the user — show titles and path shorthand only
- Do NOT assume path shorthand positions are stable across sessions (they reflect current priority order)
- Always include `actor: "synapse-orchestrator"` in all MCP calls

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
