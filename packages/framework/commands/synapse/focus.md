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
---

## Objective

Navigate to a specific item in the project hierarchy and present its full context — status, decisions, related documents, and actionable options.

## Process

1. **Parse input:** The user provides either:
   - **Name-based**: `/synapse:focus "JWT token refresh"` or `/synapse:focus auth strategy`
   - **Path shorthand**: `/synapse:focus 2.3.1` (digits separated by dots)
   - **No argument**: Ask "What would you like to focus on? You can use a name (fuzzy matched) or a path like 2.3 (Epic 2, Feature 3)."

   Detect which mode by checking if the argument matches `/^\d+(\.\d+)*$/` (path shorthand) or is text (name-based).

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

**Deferred features:**
- **Agent-based focus** (`/synapse:focus agent C`) is deferred to the Agent Pool phase. If the user tries this pattern, respond: "Agent-based focus will be available when the Agent Pool is active (Phase 21). For now, use item names or path shorthand."

**Anti-patterns:**
- Do NOT show raw task_ids to the user — show titles and path shorthand only
- Do NOT assume path shorthand positions are stable across sessions (they reflect current priority order)
- Always include `actor: "synapse-orchestrator"` in all MCP calls

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
