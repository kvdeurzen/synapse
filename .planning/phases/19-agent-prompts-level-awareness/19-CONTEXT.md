# Phase 19: Agent Prompts + Level-Awareness - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

All 11 agent `.md` files reliably use Synapse MCP tools, pass context in handoffs, store findings as documents, handle errors appropriately, and adjust behavior based on hierarchy level. This phase modifies agent prompts (markdown files) and the orchestrator's handoff protocol. It does NOT change runtime code, hooks, or MCP tools — it changes what agents are instructed to do.

</domain>

<decisions>
## Implementation Decisions

### MCP-First Principle
- One-liner motivation + rules: "Synapse stores project decisions and context. Query it first to avoid wasting tokens re-discovering what's already known."
- **Context from Synapse, code from filesystem:** Agents query Synapse for decisions, task specs, documents, and context (get_smart_context, query_decisions, get_task_tree). They read/write actual source code via filesystem tools (Read, Write, Edit, Grep).
- **Code discovery via MCP when location unknown, direct filesystem when location provided:** If the task spec or handoff tells the agent which files to touch, go straight to filesystem. If the agent needs to find related code or understand broader context, use search_code/get_smart_context first. Objective: token efficiency.
- **Bidirectional — read context AND write results:** Agents read from Synapse at start and write findings/summaries back at end. Creates a complete audit trail in Synapse. Aligns with AGENT-05/06/07.
- **Trust the index:** Agents use search_code without checking staleness. User/orchestrator responsible for running /synapse:map periodically.
- **Pre-fetch varies by agent tier:** Opus agents (decomposer, architect, product-strategist, plan-reviewer) get broad context for high-judgment decisions. Sonnet agents (executor, validator, debugger, etc.) get targeted context for spec-following.

### Prompt Section Structure
- **Shared template + agent-specific sequences:** Every agent gets the same "Synapse MCP as Single Source of Truth" header section (motivation + principles + error handling). Then each gets its own "Key Tool Sequences" section with role-specific workflows and literal parameter examples.
- **Tool reference table per agent:** A 3-column table (Tool | Purpose | When to use) at the top of the MCP section listing only the Synapse tools this agent has access to. Agent doesn't see tools it can't call.
- **Standard document naming:** `{agent}-{task_id}` pattern for all agent output documents. E.g., `executor-summary-task_abc123`, `validator-findings-task_abc123`. Predictable, queryable, agent name baked in for audit trail.

### Error Handling Protocol
- **Two tiers — hard halt vs soft warning:**
  - **Hard halt:** Write operations (store_document, update_task, create_task, store_decision) — if these fail, data is lost. Agent stops and reports tool name + error message to orchestrator.
  - **Soft warning:** Read operations (check_precedent, query_decisions, search_code, get_smart_context) — empty results or timeouts noted in output document's "Warnings" section but agent continues with available info.
- **Minimal halt report:** On hard halt, agent reports tool name and error message only. Orchestrator decides whether to retry or escalate.
- **Soft warnings noted in output document:** Agent adds a "Warnings" section to its output document listing any MCP read failures. Creates paper trail without blocking.
- **MCP unreachable = immediate halt:** If the first MCP call fails with connection error, agent halts with "Synapse MCP server unreachable" message. No point continuing without data access.

### Level-Aware Behavior
- **All agents are multi-level:** Every agent that handles multiple hierarchy levels gets a level-behavior section. In the RPEV model, Validate runs at every level (feature needs cross-task integration check, epic needs capability delivery check). Debugger operates at any level (task-level code bugs, feature-level integration failures).
- **Full sections for decision-makers, brief for executors:** Orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker get full 4-level mapping (epic/feature/component/task). Executor, validator, debugger, researcher, codebase-analyst get a shorter 2-tier section.
- **Level injected in handoff prompt:** Orchestrator includes `hierarchy_level` in the structured handoff block when spawning subagents. Agent prompt maps each level to behavioral adjustments. Dynamic, no extra tool calls.
- **Both scope + context adjust per level:** At higher levels: broader decisions, more context fetched, cross-cutting concerns. At lower levels: narrower scope, targeted context, concrete implementation.
- **Executor stays leaf-only:** Executor is always spawned for depth-3 tasks (leaf implementation). Feature/epic-level execution is coordination handled by the orchestrator spawning multiple executors.
- **Debugger at any level:** Debugger can be spawned for task-level implementation bugs AND feature/epic-level integration failures. At higher levels, it examines cross-task interactions rather than single-file code.
- **Integration-checker at feature/epic level only:** Fires after a set of child items complete at a given level. Does not operate at task level (that's the validator's job).
- **Validator uses stage document as validation source:** At higher levels, the RPEV stage document (created during Plan stage) defines what each level should deliver. Validator reads stage doc + task tree to verify aggregate result matches the plan.
- **Domain mode injected by startup hook:** synapse-startup.js reads trust.toml and adds the current domain mode to the session context block (alongside project_id). Every agent sees it automatically. Orchestrator doesn't need to pass it per-task.

### Handoff Protocol
- **IDs only — agent fetches its own context:** Orchestrator passes project_id, task_id, hierarchy_level, rpev_stage_doc_id. Subagent calls get_smart_context / get_task_tree to fetch what it needs. Keeps handoff small.
- **Structured handoff block format:**
  ```
  --- SYNAPSE HANDOFF ---
  project_id: xyz
  task_id: abc
  hierarchy_level: task
  rpev_stage_doc_id: rpev-stage-abc
  --- END HANDOFF ---
  ```
  Agent prompt tells it to parse this block first. Consistent, auditable.
- **Decomposer curates context_refs:** As the decomposer breaks down work, it queries Synapse for relevant documents/decisions and attaches their IDs to each leaf task's context_refs. Decomposer already calls get_smart_context — this extends it to save what it found.
- **Mandatory ref fetch by executor/validator:** Executor and validator always call get_smart_context with the context_refs doc_ids before starting. If refs are empty, the fetch is a no-op. Ensures they have full curated context.

### Claude's Discretion
- Exact wording of the "MCP as Single Source of Truth" motivation sentence
- Tool reference table formatting and column widths
- Level-behavior mapping details for each specific agent (what "broader scope" means for architect vs product-strategist)
- How to integrate new sections with existing agent prompt content without disrupting current structure
- Exact structured handoff block delimiter style

</decisions>

<specifics>
## Specific Ideas

- The objective behind MCP-first is **token efficiency** — agents should never waste tokens re-discovering what Synapse already knows
- When a task's handoff already specifies file locations, the executor should go straight to filesystem — no MCP discovery overhead
- Document naming pattern `{agent}-{task_id}` makes the audit trail queryable by both agent type and task
- The two-tier error handling (halt vs warning) prevents agents from silently losing data on write failures while not blocking on benign read empty-results

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- All 11 agent `.md` files in `packages/framework/agents/` — modification targets
- `agents.toml` in `packages/framework/config/` — already has store_document + link_documents granted to executor, validator, plan-reviewer, integration-checker (Phase 18 prep)
- `synapse-startup.js` — already injects project_id; will need domain mode injection added (AGENT-09)
- Existing "Key Tool Sequences" sections in executor.md and validator.md — partial patterns to build on
- Existing "Attribution" sections in all agents — pattern for consistent section placement

### Established Patterns
- Agent frontmatter uses YAML: `name`, `description`, `tools`, `skills`, `model`, `color` — need to add `mcpServers: ["synapse"]`
- No agent currently has `mcpServers` in frontmatter — this is a new field for all 11
- Orchestrator uses Task tool for subagent spawning — handoff protocol changes go in orchestrator.md's agent routing section
- trust.toml already has per-domain autonomy levels — domain mode available for startup hook injection

### Integration Points
- `packages/framework/agents/*.md` — all 11 files modified
- `packages/framework/config/agents.toml` — no changes needed (permissions already granted in Phase 18)
- `packages/framework/hooks/synapse-startup.js` — domain mode injection (AGENT-09)
- `synapse-orchestrator.md` — handoff protocol and structured block format
- `decomposer.md` — context_refs curation during decomposition

</code_context>

<deferred>
## Deferred Ideas

- **Auto-reindex process** — a separate background process that compares file hashes and reindexes when code changes. Noted for next milestone.
- **Skill content injection** — SKILL.md content injected into agent prompts. Phase 20 scope.
- **Agent pool dispatch** — how orchestrator auto-assigns agents to work queue items. Phase 21 scope.

</deferred>

---

*Phase: 19-agent-prompts-level-awareness*
*Context gathered: 2026-03-05*
