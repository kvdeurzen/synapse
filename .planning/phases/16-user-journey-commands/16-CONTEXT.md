# Phase 16: User Journey Commands - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

A new user has a clear, documented path from zero to running their first RPEV workflow. This phase creates the slash commands, designed for the recursive RPEV model (stubbing where the engine doesn't exist yet), and a user journey document describing the complete flow.

This phase builds the **command layer** — the user's touchpoints. The RPEV orchestration engine, level-aware agent behavior, and agent pool are separate subsequent phases that fill in the engine beneath these commands.

</domain>

<decisions>
## Implementation Decisions

### Process Model: Recursive RPEV
- The process is a **recursive Refine-Plan-Execute-Validate loop** at every hierarchy level (Project → Epic → Feature → Work Package), replacing the linear pipeline model
- Decisions only happen in Refine or Plan stages — Execute and Validate follow the plan
- The user's primary interaction is Refine (brainstorming + decisions); Plan, Execute, and Validate are system-driven
- Core interaction model: **"System drives, user unblocks"** — system works on highest-priority unblocked items, surfaces decision moments to the user
- Reference document: `.planning/brainstorm output/recursive-rpev-model.md`

### Command Set
Five user-facing commands, designed for the RPEV model:

1. **`/synapse:init`** — Project setup with interactive RPEV configuration
   - Creates project.toml, calls init_project, offers opt-in CLAUDE.md amendment
   - Interactive config walkthrough: trust/involvement levels, agent pool size, key RPEV preferences
   - Seeds trust.toml with user's choices for per-layer involvement gradient

2. **`/synapse:map`** — Codebase indexing
   - Wraps index_codebase with Ollama health check and progress feedback
   - Same scope as original design (CMD-02)

3. **`/synapse:refine`** — The primary user interaction (Refine stage of RPEV)
   - Works at **any hierarchy level** (epic, feature, work package) — detects level, adjusts behavior per level-aware readiness criteria
   - Brainstorm agent tracks open/decided/emerging decisions
   - Agent checks readiness criteria, then user confirms transition to Plan
   - Stores refinement state (decided/open/emerging) in Synapse DB via `store_document` — full continuity across sessions and /clear
   - Context window constraint: rich brainstorming fills context, so /clear between Refine and system-driven Plan is expected

4. **`/synapse:status`** — Full dashboard view
   - Epics in priority order, nested features with status icons
   - Blocked items highlighted with "⚠ N items need your input" section
   - Agent pool activity display (stubbed until agent pool phase lands)
   - Recent decisions and suggested actions

5. **`/synapse:focus`** — Navigate to specific items
   - **By name** (semantic, fuzzy matched): `/synapse:focus "JWT token refresh"`
   - **By path shorthand** (structural): `/synapse:focus 2.3.1` (Epic 2, Feature 3, WP 1)
   - Agent-based focus (`/synapse:focus agent C`) deferred to Agent Pool phase
   - Focus UX adapts to decision complexity and trust config:
     - Binary decisions → present options
     - Open-ended decisions → conversational engagement
     - Advisory mode → summary + decision prompt by default
     - Option to dive deeper (brainstorm) when the decision warrants it

### No Explicit /synapse:plan or /synapse:execute
- Planning is **system-driven** — auto-triggered after Refine completes (readiness confirmed)
- Execution is **auto-queued** via the agent pool — no user command needed
- User approves plans at certain levels per trust config, but doesn't manually trigger those stages
- User interaction for approvals happens via `/synapse:focus` when the system surfaces items needing attention

### Replacing /synapse:new-goal
- `/synapse:new-goal` is **deleted and replaced** by `/synapse:refine` — clean break
- The existing command's epic-creation logic moves into the RPEV orchestrator (Phase 18)
- `/synapse:status` is **evolved** from the existing status command

### Notification Model
- **Statusline indicator**: Claude Code status line shows blocked-item counter (e.g., "⚠ 2 blocked")
- **Configurable push/pull**: By default, blockers appear in /synapse:status (pull). Users can enable proactive notifications in trust config (push)
- Status line implementation is a stub in Phase 16 — full implementation in Visibility + Notifications phase

### Audience
- Primary audience: developer adopting Synapse for their project
- Two use cases: starting a new project with Synapse, or adding Synapse to an existing project
- Not focused on evaluators/tire-kickers — assumes commitment to adopt

### User Journey Documentation
- User journey document included in Phase 16, written based on the RPEV model vision
- Updated later as the engine matures in subsequent phases

### Claude's Discretion
- /synapse:map progress feedback format and Ollama-not-running error handling
- /synapse:init project name auto-detection strategy
- Exact stubbing approach for features that depend on later phases (RPEV engine, agent pool)
- Internal implementation of fuzzy name matching for /synapse:focus

</decisions>

<specifics>
## Specific Ideas

- The brainstorm agent during /synapse:refine should track a clear state: DECIDED (stored in Synapse), OPEN (must be resolved before refinement is complete), EMERGING (surfaced but not yet explored). This state persists across sessions.
- At Project/Epic level, the user explicitly signals "this foundation is solid" — the agent surfaces what's missing but doesn't auto-transition
- At Feature/Work Package level, the readiness gate can be lighter or automatic based on trust config
- /synapse:focus should feel like navigating a task board — summary first, drill down on demand
- A good brainstorming discussion can fill the context window, so session clearing between Refine and Plan is expected and natural
- The "system drives, user unblocks" pattern means /synapse:status should feel like checking a team dashboard, not driving each step manually

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse:status` command (`packages/framework/commands/synapse/status.md`): Existing status command — evolve into the full dashboard
- `synapse:new-goal` command (`packages/framework/commands/synapse/new-goal.md`): Being replaced, but its precedent-check and context-fetch patterns are reusable
- `synapse-startup.js`: Already reads project.toml, injects project_id — init command creates what startup reads
- `init_project` MCP tool: Creates LanceDB tables and seeds starter documents
- `index_codebase` MCP tool: Scans files, parses AST, creates embeddings
- `store_document` / `get_smart_context`: For persisting refinement state across sessions
- `get_task_tree`: For dashboard status display
- `check_precedent` / `store_decision`: For decision tracking during refinement

### Established Patterns
- Slash commands are markdown files in `packages/framework/commands/synapse/` with frontmatter (name, description, allowed-tools)
- Commands use MCP tools via `mcp__synapse__*` tool names
- Hooks are ESM `.js` files reading stdin JSON, writing stdout JSON
- product-strategist agent already handles Tier 0-1 decisions — refinement agent can build on this pattern
- trust.toml already has per-domain autonomy levels and approval thresholds — expand for per-layer involvement

### Integration Points
- `.synapse/config/project.toml`: Created by /synapse:init, read by synapse-startup.js
- `.synapse/config/trust.toml`: Expanded by /synapse:init with RPEV preferences
- `store_document` MCP tool: Refinement state and brainstorming output stored here
- `synapse-orchestrator` agent: Receives RPEV flow control in Phase 18
- `packages/framework/commands/synapse/`: Where new command files live
- `packages/framework/hooks/`: Statusline hook for blocked-item counter

</code_context>

<deferred>
## Deferred Ideas

- **Agent-based focus mode** (`/synapse:focus agent C`) — deferred to Agent Pool phase
- **Agent pool activity display** in /synapse:status — stubbed until Agent Pool phase
- **Proactive push notifications** — implementation deferred to Visibility + Notifications phase; trust config option seeded by /synapse:init
- **Detailed readiness criteria validation** — the command stubs readiness checks; full level-aware readiness gating lands in RPEV Orchestration phase

</deferred>

<milestone_impact>
## Milestone 3 Restructure

This phase's discussion revealed that the recursive RPEV model requires restructuring v3.0 phases. The agreed structure:

| # | Phase | Depends on | Notes |
|---|-------|------------|-------|
| 16 | User Journey Commands | 15 | This phase — commands + stubs |
| 17 | Tech Debt | 15 | Parallel with 16, clean code before rework |
| 18 | RPEV Orchestration | 16 | Refine stage, readiness gating, auto-queue, trust config expansion, decision persistence |
| 19 | Agent Prompts + Level-Awareness | 18 | Merges old agent prompt improvements + level-aware behavior |
| 20 | Skills Completion | 15 | Can parallel with 18-19 |
| 21 | Agent Pool | 18, 19 | Configurable slots, auto-assignment, work queue |
| 22 | Install Script | 19, 20 | After files stabilize |
| 23 | Visibility + Notifications | 21 | Statusline, blocked counter, project_overview progress |
| 24 | E2E Validation | 21, 22, 23 | Full RPEV cycle on real task |

**Changes from original:**
- Tech Debt moved earlier (clean code before rework)
- RPEV Orchestration added as new phase
- Agent Pool added as new phase
- Level-aware agents merged into Agent Prompts phase
- Notifications merged into Visibility phase
- Install Script moved later (after files stabilize)
- E2E Validation now validates full RPEV cycle, not just PEV

</milestone_impact>

---

*Phase: 16-user-journey-commands*
*Context gathered: 2026-03-05*
