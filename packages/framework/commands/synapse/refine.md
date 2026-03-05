---
name: synapse:refine
description: Start or resume a refinement session — brainstorm ideas, track decisions, and shape requirements at any hierarchy level (epic, feature, or work package).
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__synapse__store_document
  - mcp__synapse__store_decision
  - mcp__synapse__check_precedent
  - mcp__synapse__get_smart_context
  - mcp__synapse__semantic_search
  - mcp__synapse__get_task_tree
  - mcp__synapse__create_task
---

## Objective

Run a structured brainstorming session that tracks decisions, surfaces what's missing, and persists state for cross-session continuity.

## Process

1. **Determine scope:** If the user provides arguments (e.g., `/synapse:refine "JWT auth"`), use that as the refinement target. If no arguments are provided, search for in-progress sessions by calling `mcp__synapse__semantic_search` with query `"refinement state"`, category `"plan"`. If an active session is found, offer to resume it:
   ```
   Found in-progress refinement: "[Item Title]" ([Level]) — last updated [date].
   Resume this session, or describe something new?
   ```
   If nothing is found and no arguments were given, ask: "What would you like to refine? You can describe a new epic, drill into an existing feature, or explore a work package."

2. **Detect hierarchy level:** Based on the refinement target, determine the RPEV level:
   - If it matches an existing epic in the task tree (checked via `mcp__synapse__get_task_tree`) → **Epic** level
   - If it matches a feature under an epic → **Feature** level
   - If it matches a work package under a feature → **Work Package** level
   - If it is a new concept with no task tree match → treat as a new **Epic** (or **Project** if it is top-level strategy)

   State the detected level clearly: "Refining at [LEVEL] level: [TITLE]"

3. **Load existing refinement state:** Call `mcp__synapse__semantic_search` with query `"[Item Title] refinement"`, category `"plan"` to find prior session documents. If found, load and display the current state before continuing:
   ```
   ## Resuming Refinement: [Item Title] ([Level])

   ### DECIDED (N decisions stored)
   - [Decision text] (Tier N, decision_id: ULID)

   ### OPEN (N decisions pending)
   - [Topic] — [why it matters]

   ### EMERGING (N topics surfaced)
   - [Topic] — [brief note]
   ```
   Note the `doc_id` from any existing refinement document — it will be used in step 8 to version rather than duplicate.

4. **Load context and precedents:**
   - Call `mcp__synapse__get_smart_context` with the item title to gather related decisions and documents
   - Call `mcp__synapse__check_precedent` with the item's key themes to surface any relevant prior decisions that constrain or inform this refinement
   - Present relevant context briefly: "Here's what Synapse knows about this area: [summary of key decisions and documents]"
   - If no existing context: "No prior decisions found for this topic — this is fresh territory."

5. **Run brainstorming session:** Act as a collaborative thinking partner, extending the brainstorm skill pattern with RPEV-aware decision tracking. Use Socratic questioning to explore the item:
   - **Clarifying:** "What problem does this solve for users?"
   - **Consequence:** "What happens if we don't address this?"
   - **Alternative surfacing:** "What other approaches have you considered?"
   - **Connection finding:** "How does this relate to [existing decision or epic]?"
   - **Assumption challenging:** "What are we taking for granted here?"

   Throughout the conversation, maintain and update three categories:
   - **DECIDED**: Statements the user has explicitly committed to. As each decision is made:
     1. Call `mcp__synapse__check_precedent` to verify consistency with prior decisions
     2. If consistent (or no conflict), call `mcp__synapse__store_decision` with tier appropriate to the hierarchy level:
        - Project/Epic decisions → Tier 0 or 1
        - Feature decisions → Tier 2
        - Work Package decisions → Tier 3
     3. Confirm: "[Decision text] stored (Tier N, decision_id: ULID)"
   - **OPEN**: Questions that must be resolved before refinement is complete at this level. Track these explicitly — they block the transition to Plan.
   - **EMERGING**: Topics that surfaced during discussion but have not been fully explored yet. Capture them so they are not lost when the session ends.

6. **Periodically surface decision state:** After every few exchanges, or when the user appears ready to pause, present the current decision tracker:
   ```
   ### Decision Tracker

   DECIDED (stored in Synapse):
   - [x] "Target: solo developers" (Tier 0, decision_id: 01ABC...)
   - [x] "Auth strategy: OAuth 2.0 with PKCE" (Tier 1, decision_id: 01DEF...)

   OPEN (must resolve before moving to Plan):
   - [ ] "Data retention policy — 30 days vs user-configurable?" (Tier 1)
   - [ ] "Multi-tenant support scope for v1?" (Tier 1)

   EMERGING (surfaced, not yet explored):
   - "Webhook delivery guarantees" — came up when discussing reliability
   - "API rate limiting strategy" — mentioned in auth discussion
   ```

7. **Check readiness (level-aware):** When the user signals they are wrapping up, or when all OPEN decisions are resolved, assess readiness against level-appropriate criteria:
   - **Project level:** All Tier 0 decisions captured? Requirements measurable? **User must explicitly signal "this foundation is solid"** — do not auto-transition at this level.
   - **Epic level:** Tier 1 decisions captured, acceptance criteria clear? **User must explicitly confirm readiness** — do not auto-transition at this level.
   - **Feature level:** Tier 2 decisions captured? Requirements testable?
   - **Work Package level:** Spec unambiguous enough to implement?

   If not ready: "Before we can move to planning, we still need to resolve: [OPEN items]. Want to explore those now, or park them for next session?"

   If ready: Present a readiness summary:
   ```
   ## Refinement Complete: [Item Title] ([Level])

   N decisions stored in Synapse (Tiers 0-N)
   All required decisions captured for this level
   N open questions parked for future sessions

   This item is ready for planning.
   ```

8. **Persist refinement state:** Call `mcp__synapse__store_document` with:
   - `project_id`: from session context (injected by synapse-startup hook)
   - `title`: `"Refinement: [Item Title] ([Level])"`
   - `category`: `"plan"`
   - `status`: `"active"` (if OPEN items remain) or `"done"` (if readiness confirmed)
   - `tags`: `"|refinement|[level]|[item_slug]|"`
   - `content`: Structured document with DECIDED/OPEN/EMERGING sections, session summary, and key insights from this session
   - `doc_id`: If resuming an existing session (found in step 3), pass the existing `doc_id` to create a new version rather than a duplicate
   - `actor`: `"synapse-orchestrator"`

9. **Close session:**
   - If readiness confirmed:
     ```
     ## Current Behavior (Phase 16)
     Refinement state saved. When the RPEV orchestrator is available (Phase 18),
     it will auto-trigger planning for this item. For now, the decisions are stored
     in Synapse and the item is ready for manual coordination.

     ## What's stored:
     - N decisions in Synapse DB (queryable by any future agent)
     - Refinement state document (retrievable next session via /synapse:refine)
     ```
   - If pausing (OPEN items remain):
     ```
     Session saved. Run `/synapse:refine` again to resume — your DECIDED, OPEN,
     and EMERGING items will be loaded automatically from where you left off.
     ```

## Anti-Patterns

- Do NOT make decisions for the user during Refine — surface options, ask questions, let the user decide
- Do NOT skip `check_precedent` before storing new decisions — consistency with existing decisions is non-negotiable
- Do NOT auto-transition to Plan at Project or Epic level — the user must explicitly signal readiness at these levels
- Always persist state before the session ends — context window may fill during rich brainstorming
- Use the existing `doc_id` when resuming to create a new version rather than duplicate documents

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
