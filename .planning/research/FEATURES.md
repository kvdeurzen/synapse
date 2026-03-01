# Feature Research — v2.0 Agentic Coordination Layer

**Domain:** Agentic coordination framework — decision tracking, task decomposition, agent specialization, skill loading, quality gates, PEV workflow
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (Claude Agent SDK hooks verified against official docs at HIGH confidence; task decomposition patterns at MEDIUM from academic papers and frameworks; decision tracking as "case law" is a novel Synapse-specific framing with LOW-MEDIUM confidence on existing comparable systems)

> **Scope note:** This file covers NEW features for v2.0 only. v1.0 features (document storage, code indexing, hybrid search, smart context assembly, relationship graph) are fully built and out of scope.

---

## Domain Overview: What Agentic Coordination Systems Do

Agentic coordination is the layer above data storage that gives multi-agent systems structure, authority, and memory-across-sessions. The core problems it solves:

1. **Who decides what?** Without authority levels, every agent can override every other agent. Decisions made in session 1 are invisible to agents in session 50.
2. **How big is a unit of work?** Tasks must fit in a context window to be executable. Without decomposition, agents either refuse (too big) or hallucinate (wrong scope).
3. **Who does which work?** Generalist agents waste tokens on context irrelevant to their role. Specialists with scoped tools are faster and more reliable.
4. **What does this agent know about this project?** Generic agents don't know domain vocabulary, quality criteria, or project conventions. Runtime skill injection solves this without training.
5. **How do you prevent bad actions?** Pre/post tool hooks let the orchestrator enforce policy at the boundary between the agent and the outside world.
6. **How do you validate work systematically?** PEV (Plan-Execute-Validate) loops with explicit iteration limits prevent infinite refinement while ensuring correctness.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any serious agentic coordination system must have. Missing these makes the system feel like a prototype, not a production tool.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Task storage with parent-child hierarchy | Every project management system (Jira, Linear, GitHub Projects) supports epics → tasks; agents expect the same structure | MEDIUM | Recursive parent_id in LanceDB `tasks` table; v1.0 schema already has parent_id and depth fields — minimal migration |
| Task status lifecycle | "todo → in_progress → done → blocked" is universal; status must propagate upward (parent blocked if child blocked) | LOW | Status rollup: parent is "blocked" if any child is blocked; "complete" when all children complete; "in_progress" otherwise |
| Decision logging with rationale | GSD, BMad, ConPort all log architectural decisions; agents expect decisions to persist across sessions | LOW | decisions table with summary, rationale, outcome fields; extends v1.0 documents table concept |
| Searchable decisions | Agents need to find past decisions by topic, not just by ID; FTS + semantic search are expected | MEDIUM | Synapse v1.0 hybrid search applies directly; decisions table gets same indexing pipeline as documents |
| Agent role definitions | Agent systems (LangGraph, CrewAI, AutoGen) all define agents by role + tool list + system prompt | LOW | Role definitions are config, not runtime DB; 10 named roles with distinct tool allowlists and system prompts |
| Orchestrator process | A top-level process that spawns agents, routes tasks, and enforces authority; all major frameworks have this | HIGH | Claude Agent SDK `query()` as orchestrator; Synapse MCP as data backend via `mcpServers` config |
| Pre-tool execution hooks | LangGraph, Agno, and the Claude Agent SDK all support hooks that run before tool calls; used for authorization and logging | MEDIUM | Claude Agent SDK `PreToolUse` hook with `permissionDecision: deny/allow/ask` — official, documented, HIGH confidence |
| Post-tool execution hooks | Logging, audit trail, result validation after tool execution; expected in any production agentic system | LOW | Claude Agent SDK `PostToolUse` hook with `additionalContext` field; can append validation results |
| Human-in-the-loop escalation | All enterprise agentic frameworks support escalation checkpoints; users expect a way to require approval | MEDIUM | Claude Agent SDK `PermissionRequest` hook for custom handling; `ask` permission decision pauses for approval |
| Subagent lifecycle tracking | When orchestrators spawn subagents, they need to know when subagents complete and whether they succeeded | LOW | Claude Agent SDK `SubagentStart` / `SubagentStop` hooks — first-class events with agent_id and transcript path |

### Differentiators (Competitive Advantage)

Features that set Synapse v2.0 apart from generic agent orchestration frameworks. These are the reason to use Synapse rather than LangGraph or CrewAI.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Decision precedent checking ("case law") | Before any agent makes a scoped decision, it checks Synapse for prior decisions on the same topic. Prevents contradictions across sessions. No comparable open-source system does this with semantic search | HIGH | Requires: decisions table, `check_precedent` MCP tool (semantic search over decisions), PreToolUse hook that calls check_precedent before write operations. Precedent is enforced by the orchestrator, not agents themselves |
| Recursive task decomposition to context-window size | Decomposer agent recursively breaks tasks until each leaf is <500 tokens of context. No existing open-source orchestrator enforces size limits at decomposition time | HIGH | Depth limit recommended: 5 levels (Epic → Feature → Component → Task → Subtask). Tasks are "executable" when: no children, clear success criteria, scoped to one agent role, estimated context < threshold |
| Tiered authority enforcement via hooks | Decision authority is enforced at the infrastructure level (hooks), not by asking agents to self-report their tier. Agents cannot override tier rules by ignoring them in their prompt | HIGH | Tier 0: orchestrator only (architecture changes, dependency decisions). Tier 1: senior agents with precedent check. Tier 2: executor agents with pre-approval. Tier 3: leaf agents, read-only decisions. Enforcement via PreToolUse hook inspecting which tool and which agent is calling |
| Config-based Trust-Knowledge Matrix | Per-domain autonomy levels in a YAML config (e.g., `ui: { autonomy: high, review_required: false }`, `security: { autonomy: low, review_required: true }`). No dynamic DB; explicit, auditable, version-controllable | MEDIUM | Trust matrix determines when `ask` vs `allow` vs `deny` fires in hooks. Domain is inferred from the task's category field. Single YAML file, hot-reloadable via `ConfigChange` hook |
| Skill loading system (project-specific agent behavior) | Generic agent roles + project-specific knowledge injected at runtime. The same "Researcher" agent has different quality criteria for a TypeScript API project vs a Rust CLI project | MEDIUM | Skills are SKILL.md-style markdown files in `.synapse/skills/`. Agent SDK's `UserPromptSubmit` hook or system prompt injection at agent spawn time. Skill = domain vocabulary + quality criteria + project conventions |
| Semantic precedent search (not just keyword) | "Should we use a service layer?" finds the prior ADR titled "Repository pattern over direct DB access" because they're semantically related. Keyword search misses this. | LOW | Uses Synapse v1.0 `semantic_search` over the decisions table. The `check_precedent` tool is a thin wrapper over existing search infrastructure — LOW implementation complexity because v1.0 built it |
| Wave-based parallel execution with DAG dependency tracking | Tasks in a wave execute in parallel if they have no dependencies between them. Wave N+1 starts only when all of wave N is complete. Dependency-aware, not just sequential | HIGH | DAG of task dependencies extracted from the task tree. Wave = set of tasks with no unresolved dependencies. Claude Agent SDK `SubagentStart` hooks track per-wave completion. Inspired by dag-executor pattern (verified in search results) |
| Progressive verification (task → feature → epic → project) | Validation isn't just "did it work?" — it runs at four granularities. A task validator checks unit output; a feature validator checks integration; an epic validator checks product coherence; a project validator checks architectural consistency | HIGH | Each granularity uses a different agent (Validator, Integration Checker, Plan Reviewer, Product Strategist). Triggered by status transitions in the task tree, not by time |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good for agentic coordination but create maintenance, complexity, or safety problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| ML-based preference learning from past decisions | "The system should learn my preferences automatically" | Requires inference over past data, training feedback loops, and version management of learned preferences. The false positive risk (wrong preference applied silently) exceeds the benefit at v2.0 scale | Explicit skill files and Trust-Knowledge Matrix config. Human-editable, version-controlled, auditable. If learning is needed later, it becomes a dedicated milestone |
| Dynamic agent spawning based on task analysis | "Spawn exactly the right agent for each task at runtime" | Agent specialization is a prompt engineering + tool restriction problem, not a dynamic spawning problem. Dynamic spawning adds orchestration complexity (managing arbitrary agent topologies) with minimal benefit if roles are well-defined | Fixed 10-agent roster with clear responsibilities. Orchestrator routes tasks to the appropriate fixed agent |
| Agents deciding their own tool permissions | "Trust agents to request only what they need" | LLMs cannot reliably self-impose restrictions; they will use the broadest permission available. Hooking this to actual enforcement requires infrastructure-level control anyway | Tool allowlists in agent definitions + PreToolUse enforcement in hooks. Agent cannot override. This is a safety non-negotiable |
| Global decision enforcement across all tool calls | "Every single action should check precedents" | Semantic search on every tool call creates massive latency and token overhead. Not all tool calls have decision implications | Precedent checking triggered only on: write operations (store_document, store_decision), on task creation (create_task), and by the Plan Reviewer agent before plan approval |
| Unbounded task decomposition depth | "Let agents decompose as deep as they need" | Depth > 5-6 creates coordination overhead that exceeds the benefit; leaf tasks become so small they're indistinguishable from single function calls; cycle detection becomes non-trivial | Depth limit of 5 (Epic=1, Feature=2, Component=3, Task=4, Subtask=5). Orchestrator rejects decomposition attempts that would exceed the limit |
| Agents collaborating via shared memory (blackboard) | "Agents should read each other's working memory" | Concurrent writes to shared state require locking; lock contention causes deadlocks; the blackboard pattern is well-studied as a source of coordination bugs | Agent outputs flow through the task tree as completion notes on `tasks` table fields. Orchestrator mediates all cross-agent information flow |
| Real-time agent monitoring dashboard | "I want to see what agents are doing live" | Web UI / dashboard is explicitly out of scope (see PROJECT.md). CLI-only for v2.0. Dashboard adds an entirely separate product surface | SubagentStart/Stop hooks write to the activity_log table (v1.0 already exists). Users can query it via existing project_overview or raw SQL |
| Automated rollback on validation failure | "If validation fails, undo the changes automatically" | Code changes are not easily reversible at the agent level; partial rollback creates worse state than the original failure; agents operating in git repos can't atomically undo file writes | Validation failure triggers a human escalation checkpoint (`ask` permission decision). Git history provides manual rollback capability |

---

## Feature Dependencies

```
[Orchestrator Process (Claude Agent SDK)]
    └──spawns──> [All 10 Specialized Agents]
    └──uses──> [Synapse MCP (v1.0 data layer, already built)]
    └──enforces via──> [Hook System (PreToolUse, PostToolUse)]
    └──requires──> [Agent Role Definitions (config)]
    └──requires──> [Trust-Knowledge Matrix (YAML config)]

[Decision Tracking (decisions table + tools)]
    └──requires──> [Synapse v1.0 embedding pipeline] (already built)
    └──requires──> [Synapse v1.0 hybrid search] (already built)
    └──enables──> [Precedent Checking (check_precedent tool)]
    └──enables──> [Tiered Authority Enforcement]

[Tiered Authority Enforcement]
    └──requires──> [Decision Tracking] (precedent lookup)
    └──requires──> [Hook System] (enforcement mechanism)
    └──requires──> [Agent Role Definitions] (which tier each role is)
    └──requires──> [Trust-Knowledge Matrix] (per-domain autonomy levels)

[Task Hierarchy (tasks table + tools)]
    └──requires──> [Synapse v1.0 schema foundations] (parent_id, depth fields — already seeded)
    └──enables──> [Recursive Decomposition]
    └──enables──> [Status Propagation]
    └──enables──> [Wave-Based Parallel Execution]

[Wave-Based Parallel Execution]
    └──requires──> [Task Hierarchy] (DAG derived from task tree)
    └──requires──> [Orchestrator Process] (wave controller)
    └──requires──> [Hook System] (SubagentStart/SubagentStop tracking)
    └──enhances──> [Progressive Verification]

[Skill Loading System]
    └──requires──> [Agent Role Definitions] (skills injected per role)
    └──requires──> [Orchestrator Process] (injection point at spawn time)
    └──enhances──> [All 10 Specialized Agents]

[Progressive Verification]
    └──requires──> [Task Hierarchy] (triggers on status transitions)
    └──requires──> [Wave-Based Parallel Execution] (verification runs after each wave)
    └──requires──> [Hook System] (SubagentStop → trigger verification)

[Plan-Execute-Validate Workflow]
    └──requires──> [Task Hierarchy] (plan = task tree)
    └──requires──> [Wave-Based Parallel Execution] (execute phase)
    └──requires──> [Progressive Verification] (validate phase)
    └──requires──> [Hook System] (iteration limit enforcement)
    └──requires──> [Decision Tracking] (validate phase checks precedents)
```

### Dependency Notes

- **Decision Tracking requires v1.0, not new infrastructure.** The decisions table is new, but embedding, hybrid search, and chunking are all v1.0. `check_precedent` is a thin MCP tool over `semantic_search`. LOW implementation cost relative to the value delivered.
- **Hook System is the enforcement layer for everything.** Authority enforcement, tier checking, precedent lookup, audit logging — all flow through PreToolUse/PostToolUse hooks. The Claude Agent SDK hook system is the infrastructure substrate that makes the whole authority model implementable.
- **Task Hierarchy bootstraps from v1.0 schema.** The `parent_id` and `depth` columns exist in the v1.0 schema already. New: `tasks` as a dedicated LanceDB table with status, assigned_agent, success_criteria, estimated_tokens, wave_number fields.
- **Skill Loading and Trust Matrix are config, not DB.** Both are YAML/markdown files, not tables. This keeps them simple, version-controllable, and auditable. The tradeoff is no runtime mutation — which is the point.
- **Progressive Verification depends on Wave Execution because verification is wave-scoped.** After each wave completes (SubagentStop fires for the last subagent in a wave), the orchestrator triggers the appropriate verification agent for that wave's scope level.

---

## MVP Definition

### Launch With (v2.0)

Minimum set to validate the coordination layer concept end-to-end.

- [ ] **decisions table + store_decision + query_decisions** — Decision persistence. Without this, precedent checking has no data. Required before everything else in the decision tracking chain.
- [ ] **check_precedent MCP tool** — Semantic search over decisions. The "case law" behavior. Thin wrapper over v1.0 search.
- [ ] **tasks table + create_task + update_task + get_task_tree** — Task hierarchy storage. Required for decomposition, wave execution, and status tracking.
- [ ] **Orchestrator process skeleton (Claude Agent SDK)** — The process that spawns Synapse as MCP subprocess and routes work to agents. Required to wire anything else together.
- [ ] **Agent role definitions (10 roles as config + system prompts)** — Without defined roles, you have one undifferentiated agent. This is pure config work, not code.
- [ ] **PreToolUse hook — tier enforcement** — Agents cannot call tools above their tier authority. This is the safety-critical hook that makes the authority model real, not aspirational.
- [ ] **PreToolUse hook — tool allowlist enforcement** — Each agent is constrained to its allowed tool set. Enforcement in the hook, not in the agent prompt.
- [ ] **Skill loading system (SKILL.md injection at spawn)** — Generic agents + project skills. Without this, all agents behave identically regardless of project domain.
- [ ] **Trust-Knowledge Matrix (YAML config)** — Per-domain autonomy levels. Determines when hooks return `ask` vs `allow`. Without this, the hook has no policy to enforce.
- [ ] **Wave-based parallel execution** — Task DAG → waves → parallel subagent spawning. Without this, execution is purely sequential and slow.
- [ ] **Plan-Execute-Validate loop (max 3 iterations)** — The core workflow loop. Plan Reviewer agent checks the plan before execution; Validator agent checks output after. Three-iteration limit prevents infinite refinement.
- [ ] **PostToolUse hook — audit logging** — Every tool call logged to activity_log (v1.0 table). Required for traceability and debugging.

### Add After Validation (v2.x)

Features to add once the coordination layer is running and being used in practice.

- [ ] **Progressive verification at epic/project granularity** — Task-level and feature-level verification in v2.0. Epic and project-level verification adds complexity that's only valuable once the lower levels are proven. Trigger: first completed epic.
- [ ] **SubagentStop → verification pipeline integration** — Hook-triggered verification after each wave. Requires stable hook infrastructure first. Trigger: 3+ full PEV cycles completed.
- [ ] **Decision enforcement in Plan Review phase** — Plan Reviewer agent checks whether the proposed plan contradicts existing decisions before execution starts. Trigger: a plan actually contradicted a decision in practice.
- [ ] **Agent SDK ConfigChange hook for hot-reload of Trust Matrix** — Reload YAML config without restarting orchestrator. Trigger: users report needing to adjust autonomy levels mid-session.
- [ ] **Decomposer depth estimation via token counting** — Currently depth limit is a fixed 5 levels. Adding token estimation of task scope enables dynamic stopping. Trigger: tasks at depth 3 are still too large for executors.

### Future Consideration (v3+)

Features to defer until v2.0 is validated in production.

- [ ] **GSD/BMad project import** — Import existing project structures into Synapse decision + task format. Complex format parsing; lower value than building the coordination layer itself. Defer until users request migration path.
- [ ] **ML preference learning** — Anti-feature until v2.0 is proven; requires training signal that only exists after extensive use.
- [ ] **Multi-user / collaborative orchestration** — Single-user orchestrator for now. Multi-user requires session isolation, conflict resolution, and concurrent task claiming. Out of scope.
- [ ] **MCP resources and prompt templates** — Useful but not blocking; v2.0 uses direct system prompts and skill injection instead.
- [ ] **Web UI / monitoring dashboard** — Explicitly out of scope per PROJECT.md. Activity log is queryable via MCP tools.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| decisions table + store/query/check_precedent | HIGH | LOW (v1.0 search already built) | P1 |
| tasks table + create/update/get_task_tree | HIGH | LOW (v1.0 schema foundations exist) | P1 |
| Orchestrator process skeleton | HIGH | MEDIUM (Agent SDK well-documented) | P1 |
| 10 agent role definitions (config + prompts) | HIGH | LOW (no code, pure config) | P1 |
| PreToolUse hook — tier + tool allowlist enforcement | HIGH (safety critical) | MEDIUM (hook API is straightforward) | P1 |
| Skill loading system | HIGH | LOW (SKILL.md injection at spawn) | P1 |
| Trust-Knowledge Matrix (YAML config) | HIGH | LOW (config file, no DB) | P1 |
| Wave-based parallel execution | HIGH | HIGH (DAG traversal, wave controller) | P1 |
| PEV loop (plan → execute → validate, max 3) | HIGH | HIGH (orchestration logic) | P1 |
| PostToolUse hook — audit logging | MEDIUM | LOW (async hook, writes to existing activity_log) | P1 |
| Tiered authority enforcement (Tier 0-3 decision hierarchy) | HIGH (safety critical) | MEDIUM (requires tier metadata on decisions) | P1 |
| Progressive verification (task + feature level) | MEDIUM | HIGH (multi-agent coordination) | P2 |
| SubagentStop → verification trigger integration | MEDIUM | MEDIUM (hook plumbing) | P2 |
| Decision enforcement in Plan Review | MEDIUM | LOW (Reviewer agent calls check_precedent) | P2 |
| ConfigChange hook for Trust Matrix hot-reload | LOW | LOW (one hook, one file reload) | P2 |
| Dynamic depth estimation via token counting | LOW | MEDIUM | P3 |
| GSD/BMad project import | MEDIUM | HIGH | P3 |
| Multi-user orchestration | LOW | VERY HIGH | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Should have, add when core is working
- P3: Nice to have, future milestone

---

## Domain-Specific Analysis: Each Research Question

### 1. Decision Tracking / "Case Law" Systems

**How precedent systems work in practice:**
Decision precedent systems store decisions with structured fields and make them searchable. The "case law" framing means: a prior decision on Topic X has authority over future decisions on Topic X. Searchability is required because agents won't know the exact title of a prior decision — they need semantic retrieval.

**What makes a decision searchable:**
- **Rationale field** with full-text content (what was decided and why) — most important for semantic search
- **Summary/title** for display and FTS keyword matching
- **Outcome** (accepted/rejected/superseded) for filtering active vs historical decisions
- **Scope tags** (domain, component, tier) for filtering without embedding lookup
- **Embedding on rationale + summary concatenated** — this is the semantic search target

**What makes a decision "enforceable":**
Enforcement is NOT in the decision itself. It's in the hook. The PreToolUse hook intercepts write operations, calls `check_precedent`, and if a blocking prior decision is found, returns `permissionDecision: deny` with the conflicting decision as `permissionDecisionReason`. The agent then sees the conflict and must either align with the prior decision or escalate to a higher tier to override it.

**Confidence:** MEDIUM. The "case law" pattern is a Synapse-original framing. No existing open-source system was found that does semantic precedent search with hook-based enforcement. The individual components (decision logging, semantic search, hook enforcement) are all well-understood separately.

### 2. Recursive Task Decomposition

**How task hierarchy systems work:**
Hierarchical Task Networks (HTNs) distinguish primitive tasks (directly executable) from compound tasks (requiring decomposition). The decomposition process is recursive until all tasks are primitive. In agent systems, "primitive" means: executable by a single agent in a single context window without further planning.

**What makes a task "executable":**
Based on research synthesis:
- No child tasks (it's a leaf node in the tree)
- Has explicit success_criteria field (verifiable output definition)
- Scoped to a single agent role (no cross-agent dependencies within the task)
- Estimated context < 500 tokens (fits in executor's working context after skill injection)
- Has no blocked dependencies (all prerequisite tasks are complete)

**Depth limits:**
5 levels is the practical maximum (Epic → Feature → Component → Task → Subtask). Research indicates depth > 5-6 creates coordination overhead exceeding the benefit. Leaf tasks at depth 5 should never require further decomposition if the decomposer applies the "500 token context" rule correctly. Orchestrator rejects `create_task` calls that would create a node at depth > 5.

**Status propagation:**
Upward rollup is the standard pattern (validated from Smartsheet, ServiceNow, Temporal Workflows documentation):
- Parent is `blocked` if ANY child is `blocked`
- Parent is `in_progress` if any child is `in_progress` and none are `blocked`
- Parent is `complete` if ALL children are `complete`
- Parent is `todo` if all children are `todo`

**Confidence:** MEDIUM. HTN and recursive decomposition are well-researched. Depth limits of 5 are empirically supported but not authoritative. The "500 token" threshold for executability is a Synapse-specific design choice, not an industry standard.

### 3. Agent Specialization

**Patterns for role constraints:**
All major frameworks (LangGraph, CrewAI, AutoGen) implement role constraints as: (a) a system prompt defining the role's purpose and behavior, and (b) a tool allowlist restricting what tools the agent can call. Enforcement in the hook layer is the correct approach because agent self-enforcement (via prompt instruction) is unreliable — LLMs use available tools regardless of prompt instructions under pressure.

**Model selection per role:**
Claude Agent Skills (official docs, HIGH confidence) support per-skill model override via YAML frontmatter. The same pattern applies to agent roles: Decomposer may use a reasoning model (Opus); Executor may use a faster model (Sonnet/Haiku) to reduce latency and cost.

**Authority levels:**
The industry is converging on 3-5 authority tiers. The Synapse Tier 0-3 design (orchestrator → senior agents → executors → leaf) is consistent with frameworks surveyed. Tiers are enforced via PreToolUse hooks that check which agent is calling which MCP tool and which tier that tool is restricted to.

**Confidence:** HIGH for the constraint approach (verified against official Agent SDK docs and multiple frameworks). MEDIUM for the specific 4-tier design.

### 4. Skill Loading

**How frameworks inject domain knowledge:**
Claude Agent Skills (official documentation, HIGH confidence) use a two-part architecture:
1. YAML frontmatter (name, description, allowed-tools, optional model override) — loaded at startup into the "meta-tool" description
2. Markdown body (detailed instructions, quality criteria, project vocabulary) — loaded only when the skill is invoked

The LLM selects which skill to load based on matching task intent against skill descriptions. The injection happens via hidden system messages appended to the conversation.

**For Synapse skill loading:**
Skills are not selected by the agent — they are explicitly injected by the orchestrator at spawn time based on agent role + project type. The orchestrator reads `.synapse/skills/<role>/<project-type>.md` and injects the content into the agent's system prompt before the first task. This is simpler than Claude Code's dynamic skill selection and avoids the security concern (malicious skill injection via long files) identified in 2025 research.

**Security consideration (LOW confidence, flag for phase research):**
2025 research found that the Claude Agent Skills format enables prompt injection attacks via malicious skill files. For Synapse, skills are stored in the project repository and managed by the user — not loaded from untrusted sources. This mitigates the primary attack vector. Still worth noting in PITFALLS.md.

**Confidence:** HIGH for the injection mechanism (official Agent SDK docs). MEDIUM for the security tradeoffs.

### 5. Quality Gates / Hooks

**Claude Agent SDK hook system (HIGH confidence — verified against official docs):**

Available hooks relevant to quality gates:
- `PreToolUse` — fires before any tool call; can `deny`, `allow`, or `ask`; can modify tool input via `updatedInput`; can inject system message context
- `PostToolUse` — fires after tool completes; can append `additionalContext` to tool result; used for audit logging
- `PostToolUseFailure` — fires on tool error; used for error tracking and recovery logic
- `PermissionRequest` — custom handling for permission dialogs; replaces default Claude Code permission UI
- `SubagentStart` / `SubagentStop` — track subagent lifecycle; used for wave completion detection and result aggregation
- `Stop` — agent execution complete; used for session cleanup

Hook enforcement hierarchy (official): `deny` > `ask` > `allow`. If any hook returns `deny`, the operation is blocked regardless of other hooks. Multiple hooks chain in array order.

**Hook patterns for quality gates:**
1. **Tier enforcement**: `PreToolUse` on any Synapse MCP write tool (`mcp__synapse__store_decision`, `mcp__synapse__store_document`) — check which agent is calling, what tier that agent is, whether the operation is in-tier
2. **Precedent checking**: `PreToolUse` on store_decision and store_document — call `check_precedent` synchronously; if conflict found, return `deny` with precedent as reason
3. **Audit trail**: `PostToolUse` async hook — write to activity_log table without blocking execution
4. **Wave completion**: `SubagentStop` — track which subagents have completed; trigger next wave when all current-wave subagents stop

**Confidence:** HIGH. Hook system fully documented at official Anthropic platform docs.

### 6. Plan-Execute-Validate Workflows

**How PEV loops work in multi-agent systems:**
PEV is the dominant pattern in production multi-agent systems (confirmed across Azure Architecture Center, PromptLayer, skywork.ai, and framework docs). The canonical structure:

1. **Plan phase**: Dedicated planning agent (Plan Reviewer) creates task tree from high-level objective. Output is a structured task tree in the tasks table, not a prose document.
2. **Execute phase**: Wave-based parallel execution of tasks. Each task assigned to appropriate specialized agent. Wave N+1 starts when wave N is complete.
3. **Validate phase**: Dedicated validation agent (Validator) checks task outputs against success_criteria. Failures trigger a second Plan-Execute-Validate iteration.
4. **Iteration limit**: 3 iterations maximum (confirmed as best practice across GSD and research sources). After 3 failures, escalate to human (PermissionRequest hook).

**What prevents infinite loops:**
- Hard iteration counter tracked by orchestrator (not agents — agents can't be trusted to count)
- Iteration counter stored in task metadata, not agent memory
- On iteration 3 failure: `permissionDecision: ask` fires; human sees the failure reason and decides whether to continue, modify the task, or abandon

**Sequential vs wave parallel:**
Sequential orchestration (Azure Architecture Center pattern) is appropriate for dependent tasks (Plan Reviewer → Executor → Validator). Wave parallel is appropriate for independent tasks within the same granularity level (multiple Executor agents handling different Tasks in the same Feature simultaneously). Synapse uses both: sequential for the PEV phases, wave parallel within the Execute phase.

**Confidence:** MEDIUM-HIGH. PEV loop is well-documented in the ecosystem. The specific iteration count of 3 and the wave-based execution model are validated by multiple independent sources.

---

## Synapse-Specific: Existing v1.0 Capabilities That Power v2.0

This section maps v2.0 features to v1.0 infrastructure already built, to avoid duplicating work.

| v2.0 Feature Need | v1.0 Capability Used | Gap to Fill |
|-------------------|---------------------|-------------|
| Decision semantic search | `semantic_search` tool over documents table | New: `decisions` table, `store_decision` and `query_decisions` tools that route to the same embedding pipeline |
| Precedent checking | `semantic_search` + `query_documents` with category filter | New: `check_precedent` as a named MCP tool with precedent-specific result format |
| Activity audit log | `activity_log` table already exists with all fields needed | New: systematic PostToolUse hook that writes to it |
| Task parent-child structure | `parent_id` and `depth` columns in documents table schema | New: dedicated `tasks` table with status, assigned_agent, success_criteria, wave_number, estimated_tokens |
| Task embeddings for search | Ollama nomic-embed-text pipeline (768-dim) | New: embed `task_description + success_criteria` concatenation |
| Project-scoped isolation | `project_id` on all tables | No gap — tasks table inherits same pattern |
| Knowledge retrieval for agents | `get_smart_context`, `semantic_search`, `search_code` | No gap — agents use these directly via MCP |

---

## Sources

- Claude Agent SDK hooks documentation (official): https://platform.claude.com/docs/en/agent-sdk/hooks — PreToolUse, PostToolUse, SubagentStart/Stop, PermissionRequest (HIGH confidence)
- Claude Agent Skills architecture: https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/ — SKILL.md format, injection mechanism, meta-tool pattern (MEDIUM confidence, verified against official SDK docs)
- Azure Architecture Center — AI Agent Orchestration Patterns: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns — sequential, concurrent, group chat patterns (HIGH confidence, official Microsoft docs)
- Agno guardrails documentation: https://www.agno.com/blog/guardrails-for-ai-agents — pre/post hook quality gate patterns (MEDIUM confidence)
- Task decomposition for coding agents (atoms.dev): https://atoms.dev/insights/task-decomposition-for-coding-agents-architectures-advancements-and-future-directions/a95f933f2c6541fc9e1fb352b429da15 — HTN patterns, primitive vs compound tasks (MEDIUM confidence)
- dag-executor skill (lobehub): https://lobehub.com/skills/erichowens-some_claude_skills-dag-executor — wave-based parallel execution pattern (MEDIUM confidence)
- Claude Agent SDK GitHub: https://github.com/anthropics/claude-agent-sdk-python — SDK overview (HIGH confidence)
- Agent Skills prompt injection risks: https://arxiv.org/abs/2510.26328 — security considerations for skill loading (MEDIUM confidence, academic paper)
- Task status rollup patterns: https://docs.temporal.io/child-workflows — Temporal child workflow status propagation (MEDIUM confidence)
- Multi-agent trust-autonomy framework: https://cloudsecurityalliance.org/blog/2025/12/16/enhancing-the-agentic-ai-security-scoping-matrix-a-multi-dimensional-approach — autonomy levels and per-domain controls (MEDIUM confidence)
- LangGraph orchestration patterns: https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/ — DAG-based orchestration (MEDIUM confidence)
- WebSearch: "Claude Agent SDK hooks before_tool_call after_tool_call anthropic 2025" — confirmed SDK hook names (MEDIUM confidence, verified against official docs)
- WebSearch: "wave based parallel agent execution dependencies task graph DAG orchestrator 2025" — wave execution pattern confirmed in multiple independent sources (MEDIUM confidence)

---

*Feature research for: Synapse v2.0 Agentic Coordination Layer*
*Researched: 2026-03-01*
