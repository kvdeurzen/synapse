# Project Research Summary

**Project:** Synapse v2.0 — Agentic Coordination Layer
**Domain:** Multi-agent orchestration on top of existing MCP/LanceDB knowledge server
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

Synapse v2.0 is an agentic coordination layer built on top of a fully operational v1.0 MCP knowledge server. The v2.0 work adds the infrastructure that transforms Synapse from a data retrieval tool into a structured multi-agent system with decision authority, task decomposition, and persistent memory across sessions. The recommended approach is to extend the existing LanceDB/Bun/TypeScript stack with a single new dependency — the `@anthropic-ai/claude-agent-sdk` — housed in an isolated `orchestrator/` package, while adding six new MCP tools (three for decisions, three for tasks) to the Synapse server. No new infrastructure, no new databases, no message brokers: the entire v2.0 feature set is built on what v1.0 already provides, extended through well-documented Agent SDK patterns.

The build order is determined by dependencies, not arbitrary sequencing. Decision tracking must come before precedent enforcement; task hierarchy must come before wave execution; both must come before the orchestrator that uses them. The orchestrator package must be stable before specialized agents are defined; agents must be defined before the hook enforcement layer is meaningful; hooks must be in place before the full Plan-Execute-Validate loop can run safely. This creates a clean five-phase ladder: decisions tooling (Phase 8), tasks tooling (Phase 9), orchestrator bootstrap (Phase 10), agent specialization (Phase 11), hook enforcement + PEV workflow (Phase 12). Phases 8 and 9 are pure MCP server work with no orchestrator dependency. Phases 10-12 build the orchestrator layer incrementally.

The primary risks are infrastructure-level, not algorithmic. The Agent SDK's silent failure mode for MCP subprocess connection errors is the single most dangerous pitfall: if the Synapse subprocess fails to start, the orchestrator continues silently with no tools, producing plausible-looking but data-free output. A single init-message status check guards against this and must be the first thing the orchestrator implements. The second risk is hook correctness: unhandled exceptions in hook callbacks terminate the entire orchestrator run. Every hook must be wrapped in try/catch from the first line written. Beyond these two guards, the architecture is well-understood and the research has HIGH confidence across all four areas.

---

## Key Findings

### Recommended Stack

The v1.0 stack is entirely unchanged. The only new dependency for v2.0 is `@anthropic-ai/claude-agent-sdk@^0.2.63`, installed exclusively in a new `orchestrator/` directory with its own `package.json`. This separation keeps the Synapse MCP server process lean and prevents the orchestrator's agent loop runtime from leaking into the data layer. Bun is explicitly first-class for the SDK (Anthropic acquired Bun in 2026; `options.executable: 'bun'` is in the official SDK spec). Use `bun run`, not `bun build` — a known bundling issue with `import.meta.url` path resolution affects `bun build` only (GitHub issue #150, closed Feb 19, 2026).

**Core technologies:**
- `@anthropic-ai/claude-agent-sdk@^0.2.63`: Agent loop, subagents, MCP client, hook system — use V1 `query()` API; V2 preview (`send()` + `stream()`) is not production-ready
- `@lancedb/lancedb@0.26.2` (unchanged): Two new tables (`decisions`, `tasks`) follow existing Apache Arrow schema patterns; no version change needed
- `ollama` nomic-embed-text 768-dim (unchanged): Reused for `decisions.rationale` embedding; same 768-dim vector space as existing doc_chunks — do not add a second embedding provider
- `zod@^4.0.0` (unchanged): Already in project; declare explicitly in `orchestrator/package.json` as the SDK peer dep supports both v3.24.1+ and v4
- `ulidx@^2.4.1` (unchanged): ULID generation for `decision_id` and `task_id`; re-declare in orchestrator package

**Critical constraint:** Do NOT install `@anthropic-ai/sdk` separately alongside `@anthropic-ai/claude-agent-sdk` — the agent SDK wraps the client SDK internally; dual installation causes version conflicts. Do NOT use `bun build` to bundle the orchestrator.

### Expected Features

The v2.0 feature set divides cleanly into what must ship at launch (P1) and what can follow once the coordination layer is proven in practice (P2/P3). All P1 features have a direct dependency path; none can be skipped without breaking the system.

**Must have (table stakes) — all P1:**
- Decision persistence with semantic search (`decisions` table + `store_decision`, `query_decisions`, `check_precedent` MCP tools)
- Task hierarchy storage with parent-child structure and status lifecycle (`tasks` table + `create_task`, `update_task`, `get_task_tree` MCP tools)
- Orchestrator process skeleton: spawns Synapse as MCP subprocess via Agent SDK `mcpServers` config; session lifecycle management
- Ten named agent roles with explicit tool allowlists, tier assignments, and injected system prompts (Planner/opus, Executor/sonnet, Validator/sonnet, and seven supporting roles)
- PreToolUse hooks enforcing tier authority and tool allowlists at the infrastructure level (not in prompts)
- PostToolUse hook: async audit logging to file (not back to Synapse — avoids circular dependency and latency)
- Skill loading system: SKILL.md-style markdown files injected deterministically into agent system prompts at spawn time — not the model-invoked filesystem pattern
- Trust-Knowledge Matrix: per-domain autonomy levels in a YAML config; determines when hooks return `ask` vs `allow` vs `deny`
- Wave-based parallel execution: task DAG extracted from task tree; wave N+1 starts only when all of wave N is complete
- Plan-Execute-Validate loop capped at 3 iterations; iteration 3 failure escalates to human via `permissionDecision: "ask"`

**Should have (competitive differentiators) — P2 after validation:**
- Progressive verification at epic and project granularity (task + feature level sufficient for v2.0 launch)
- SubagentStop hook wired to verification pipeline trigger (add after 3+ full PEV cycles completed)
- Decision enforcement in Plan Review phase (Plan Reviewer calls `check_precedent` before plan approval)
- `ConfigChange` hook for hot-reload of Trust-Knowledge Matrix YAML without restarting orchestrator

**Defer (v3+):**
- ML-based preference learning from past decisions (anti-feature; no training signal until post-usage)
- Multi-user or collaborative orchestration (requires session isolation, conflict resolution — out of scope)
- GSD/BMad project import (format parsing complexity exceeds coordination layer value at this stage)
- Web UI or real-time monitoring dashboard (explicitly out of scope per PROJECT.md; activity_log queryable via MCP tools)
- Dynamic agent spawning based on task analysis (unnecessary complexity if roles are well-defined)
- Agents deciding their own tool permissions (safety non-negotiable; hook enforcement is the correct model)

### Architecture Approach

The architecture is a strict two-layer system: `orchestrator/` (control layer, Claude Agent SDK) communicates with Synapse MCP server (data layer, MCP protocol) via stdio subprocess. The orchestrator never imports from `src/` — all data exchange is MCP JSON-RPC. This boundary is a hard constraint: LanceDB is single-process embedded; two processes cannot share the same database connection. The Agent SDK handles the full MCP lifecycle (spawn, handshake, reconnect, SIGTERM on session end). All 10 specialized agents are subagents of the single orchestrator — the SDK enforces a flat two-level hierarchy (orchestrator → subagents only); subagents cannot spawn subagents.

**Major components:**
1. `orchestrator/src/orchestrator.ts` — Core class wrapping `query()`; manages session lifecycle, init-message MCP status guard, PEV loop sequencing, wave controller
2. `orchestrator/src/hooks/` — Four modules: tier-enforcement, precedent-gate, user-approval (PreToolUse); tool-audit (PostToolUse async); every callback requires top-level try/catch — unhandled exceptions are fatal to the orchestrator run
3. `orchestrator/src/agents/` — Ten `AgentDefinition` factory functions built at runtime; skill content injected into system prompts at construction time (deterministic, not model-invoked)
4. `orchestrator/src/skill-registry.ts` — Reads markdown skill files; maps project attributes to skill bundles; progressive loading (names only at init, full body on demand); per-agent skill budget enforced
5. `src/tools/store-decision.ts`, `query-decisions.ts`, `check-precedent.ts` — Three new MCP tools following existing `registerXTool` pattern; `check_precedent` wraps v1.0 `semantic_search` with 0.85+ threshold and `decision_type` pre-filter
6. `src/tools/create-task.ts`, `update-task.ts`, `get-task-tree.ts` — Three new MCP tools; `get_task_tree` assembles hierarchy in JavaScript via iterative BFS (LanceDB/DataFusion does not support `WITH RECURSIVE`)
7. `src/db/schema.ts` additions — `DECISIONS_SCHEMA` (768-dim vector on subject + rationale) and `TASKS_SCHEMA` (with `root_id` denormalized for single-query ancestry lookup and `depth` for depth-scoped queries)

### Critical Pitfalls

1. **MCP subprocess silent failure** — The Agent SDK does NOT throw when the Synapse subprocess fails to connect; it emits `status: "failed"` in `system/init` and continues with no tools. Guard: check `message.mcp_servers` in the first message from every `query()` call; throw if any server shows `status !== "connected"`. This guard must be built before anything else in the orchestrator.

2. **Hook exceptions terminate the orchestrator** — Unhandled exceptions in hook callbacks propagate directly to the `query()` generator and crash the entire run with no graceful degradation. Guard: wrap every hook callback in top-level try/catch; add a hook test harness that calls each hook with null/undefined inputs and asserts no throw.

3. **Subagents cannot spawn subagents** — The SDK enforces a two-level hierarchy by design; `Task` must not appear in any subagent's `tools` array. Always specify `tools` explicitly on every `AgentDefinition` — never omit it (omitting inherits all parent tools including `Task`).

4. **stdio buffer deadlock** — Large MCP tool responses (> ~64KB) can deadlock the stdio pipe; both sides block waiting for the other. Guard: enforce per-tool response size limits on all Synapse tools (cap `get_smart_context` at 8K tokens, `query_decisions` at 20 results); set `max_turns` and wall-clock timeout on every `query()` call.

5. **Semantic drift in precedent matching** — The `check_precedent` similarity threshold must be 0.85+ (not the 0.70 default for document search); short decision rationale text produces noisier embeddings. Always pre-filter by `decision_type` before vector search. Enforce minimum rationale length of 50 tokens.

6. **Skill token budget exhaustion** — Injecting all skill content into all agent system prompts can consume 20K+ tokens before any task context arrives. Guard: use progressive disclosure; cap each skill body at 2,000 tokens; enforce per-agent skill budget (Executor: 3 skills max).

7. **Orphaned tasks after orchestrator crash** — Tasks left `"in_progress"` after a crash never receive status propagation. Guard: implement `reconcile_task_tree(epic_id)` and run it at orchestrator startup; treat tasks stalled for > 2 hours as `"stalled"`.

---

## Implications for Roadmap

The architecture's dependency graph determines the phase structure. Each phase is independently testable and delivers a verifiable increment. Phases 8-9 (MCP server additions) can be parallelized if two developers are available.

### Phase 8: Decision Tracking Tooling (Synapse MCP)
**Rationale:** Decision data must exist before any precedent enforcement can run. This is pure MCP server work with no orchestrator dependency. Builds directly on v1.0 embedding and hybrid search infrastructure, which is already proven.
**Delivers:** `decisions` table in LanceDB; three new MCP tools (`store_decision`, `query_decisions`, `check_precedent`); updated `init_project` to create the table; semantic precedent search at 0.85+ threshold with `decision_type` pre-filtering; `status` field and `supersede_decision` operation for decision lifecycle management.
**Addresses:** Decision persistence (P1 table stakes), semantic precedent search (P1 differentiator)
**Avoids:** Semantic drift (calibrate threshold before any decision data is stored); stale decision cache (`status` field and supersede operation built from day one)
**Research flag:** Standard patterns — follows existing `registerXTool` + Arrow schema pattern exactly; skip research-phase

### Phase 9: Task Hierarchy Tooling (Synapse MCP)
**Rationale:** Task hierarchy must exist before wave execution and the PEV loop can function. The `root_id` denormalized field and `depth` field must be in the schema before any task data is written — retrofitting is expensive. The iterative BFS approach for `get_task_tree` must replace any attempt at recursive SQL from the start.
**Delivers:** `tasks` table with `root_id`, `depth`, `depends_on`, `status`, `assigned_agent` fields; three new MCP tools (`create_task`, `update_task`, `get_task_tree`); cascade status propagation in `update_task`; BFS tree traversal capped at depth 5 with 200-task max; `reconcile_task_tree` for startup health check.
**Addresses:** Task hierarchy (P1 table stakes), status lifecycle (P1 table stakes), recursive decomposition foundation (P1 differentiator)
**Avoids:** Recursive CTE attempt (`WITH RECURSIVE` never used in Synapse code); orphaned task stall (cascade propagation built into `update_task` from the start)
**Research flag:** Standard patterns — follows existing tool registration pattern; skip research-phase

### Phase 10: Orchestrator Bootstrap
**Rationale:** The orchestrator process cannot be useful until both decisions and tasks tooling exist in Synapse. The init-message MCP status check is the most critical safety mechanism in the entire v2.0 system and must be the first thing implemented.
**Delivers:** `orchestrator/` package with separate `package.json`; `Orchestrator` class wrapping `query()` with session lifecycle management; `buildSynapseConfig()` MCP subprocess configuration; Zod-validated config loading; init-message status guard (throws if `status !== "connected"`); mock/record/replay test harness established before any live API tests; basic end-to-end connectivity test (orchestrator spawns Synapse, calls `project_overview`, verifies response).
**Uses:** `@anthropic-ai/claude-agent-sdk@^0.2.63`, Bun runtime via `bun run` (never `bun build`)
**Avoids:** MCP silent failure (init-message guard is first thing built); stdio deadlock (response size limits enforced on Synapse tools before integration testing); `bun build` bundling issue
**Research flag:** Standard patterns for SDK init; skip research-phase. NOTE: mock/record/replay test harness must be established here — every subsequent phase depends on it to avoid burning API tokens in unit tests.

### Phase 11: Specialized Agent Definitions + Skill Loading
**Rationale:** Agents are pure configuration (AgentDefinition objects), but they must exist before hook enforcement is meaningful (hooks reference agent tier authority). Skill loading is conceptually simple but the token budget system must precede the first skill injection.
**Delivers:** Ten `AgentDefinition` factory functions with explicit `tools` arrays (no `Task` in any of them); `TIER_AUTHORITY` map in `decision-tiers.ts`; skill registry reading markdown files and mapping project attributes to skill bundles; progressive skill loading (names at init, full body on demand); per-agent skill budget enforcement; system prompt templates as `.md` files loaded at runtime; Trust-Knowledge Matrix as YAML config.
**Addresses:** Agent role definitions (P1), skill loading (P1 differentiator), Trust-Knowledge Matrix (P1)
**Avoids:** Subagents spawning subagents (`Task` absent from all 10 subagent `tools` arrays; every `tools` field explicitly specified); skill token budget exhaustion (progressive loading enforced from the first skill); skill injection attack surface (content hash validation in registry)
**Research flag:** Agent prompt engineering is inherently iterative — flag the first full agent role for research-phase before all 10 are built. The Trust-Knowledge Matrix YAML schema is a Synapse-original design with no established reference implementation to validate against.

### Phase 12: Hook Enforcement + Plan-Execute-Validate Workflow
**Rationale:** Hooks are only meaningful once agents exist (they reference tier authority). The PEV loop is only testable once hooks enforce the safety model. This phase closes the loop from data layer through execution to validation — the first time the full coordination system can be exercised end-to-end.
**Delivers:** Four hook modules with mandatory try/catch wrappers (tier-enforcement, precedent-gate, user-approval, tool-audit); hook ordering integration tests (deny-before-allow chain verified); PEV loop with max 3 iterations and human escalation on failure; wave-based parallel execution via `Promise.all()` over `query()` calls; `PreCompact` hook archiving session state to `project_meta`; full end-to-end integration test: user prompt → task tree → decisions → wave execution → validation.
**Addresses:** PreToolUse tier and allowlist enforcement (P1 safety-critical), PostToolUse audit logging (P1), wave-based parallel execution (P1 differentiator), PEV loop (P1 core workflow)
**Avoids:** Hook exceptions terminating orchestrator (try/catch in every hook); `bypassPermissions` global mode (use `"default"`; hooks handle what agents can do); hook ordering bugs (chain integration tests explicitly); context compaction losing session state (`PreCompact` hook wired to `project_meta` write)
**Research flag:** The PEV loop wave controller and SubagentStop completion detection pattern are architecturally novel with few public implementations as reference. Flag for research-phase before implementation of the wave controller specifically.

### Phase Ordering Rationale

- **Phases 8-9 before 10-12:** The orchestrator's value comes from coordinating work through Synapse tools. Building tools first means Phase 10 can do a real end-to-end test immediately, not a mocked one.
- **Phases 8-9 are parallelizable:** They have no dependency on each other. If two developers are available, decisions tooling and task hierarchy tooling can be built concurrently.
- **Phase 10 before 11:** Skill loading and agent definitions require the orchestrator's `query()` infrastructure to run them; agents cannot be tested without the orchestrator.
- **Phase 11 before 12:** Hook enforcement references agent tier authority from `TIER_AUTHORITY`; hooks are meaningless without agents to enforce against.
- **All P1 differentiators depend on the full ladder:** Precedent checking, tiered authority, wave execution, and PEV loop all require the complete Phase 8-12 stack. There are no shortcuts — each phase is a genuine prerequisite for the next.

### Research Flags

Phases needing deeper research during planning:
- **Phase 11 (Agent specialization):** The 10-agent role design and system prompt engineering are iterative. The first full agent role should go through `/gsd:research-phase` to validate prompt patterns before all 10 are built. Trust-Knowledge Matrix YAML schema has no industry reference implementation.
- **Phase 12 (PEV workflow — wave controller specifically):** Wave-based parallel execution with SubagentStop completion detection has limited public implementation examples. Flag the wave controller module for research-phase before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 8 (Decisions tooling):** Follows existing `registerXTool` + Arrow schema pattern exactly; HIGH confidence from v1.0 build; no novel patterns.
- **Phase 9 (Tasks tooling):** Same pattern as Phase 8; BFS tree traversal is textbook; `root_id` denormalization is standard practice.
- **Phase 10 (Orchestrator bootstrap):** Agent SDK `query()` initialization is fully documented with official examples; the init-message status check is trivially implementable.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `@anthropic-ai/claude-agent-sdk` verified via official Anthropic docs; Bun first-class support confirmed via official acquisition announcement; LanceDB SQL limits confirmed via DataFusion upstream GitHub issue; all v1.0 technologies unchanged and proven in production |
| Features | MEDIUM-HIGH | Hook system and Agent SDK features at HIGH from official docs; task decomposition depth limits at MEDIUM from academic and practitioner sources; "case law" precedent pattern is Synapse-original with no directly comparable open-source system to validate against |
| Architecture | HIGH | All major patterns verified against official Agent SDK docs (MCP subprocess config, AgentDefinition type, hook signatures, two-level hierarchy constraint); LanceDB single-process embedded constraint is a hard fact, not an assumption |
| Pitfalls | HIGH | Silent MCP failure, hook exception fatality, and subagent spawning constraint confirmed via official docs and SDK GitHub issues; stdio deadlock confirmed via claude-agent-sdk-python issue #145; skill injection attack surface confirmed via peer-reviewed arXiv papers (2510.26328, 2601.17548) |

**Overall confidence:** HIGH

### Gaps to Address

- **"Case law" precedent system:** No existing open-source system was found that combines semantic precedent search with hook-based enforcement. The individual components are proven; the combination is Synapse-original. Validate the 0.85 similarity threshold and `decision_type` pre-filtering during Phase 8 implementation — may require adjustment based on actual embedding distribution.
- **Trust-Knowledge Matrix YAML schema:** The per-domain autonomy level design is validated conceptually against the multi-agent trust literature but has no reference implementation. Define the schema in Phase 11 and validate against at least two concrete use cases before finalizing.
- **PEV loop iteration count of 3:** Multiple independent sources cite 3 iterations as a best practice, but this is not derived from formal analysis. Monitor in early usage and adjust if 3 proves too few for complex tasks or too many for simple ones.
- **Skill token budgets:** The 2,000-token per-skill and 30% context window caps are derived from practitioner guidance, not benchmarks specific to nomic-embed-text or claude-sonnet-4-6. Profile during Phase 11 and adjust based on measurements.
- **Wave execution under load:** The `Promise.all()` approach is sufficient for single-user local use, but the interaction between concurrent subagents and the single Synapse MCP stdio connection needs empirical validation. The MCP stdio layer serializes requests, but latency and ordering behavior under load is untested.

---

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — `query()` signature, `Options` type, `AgentDefinition`, hook types, V1 vs V2 API distinction
- [Claude Agent SDK Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks) — full `HookEvent` enum, `HookCallback` signature, `permissionDecision` output shape, deny > ask > allow priority rule
- [Claude Agent SDK MCP Integration](https://platform.claude.com/docs/en/agent-sdk/mcp) — `mcpServers` config, stdio transport, tool naming convention `mcp__<server>__<tool>`
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents) — two-level hierarchy constraint; "subagents cannot spawn their own subagents" explicitly stated
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) — session resume, V1 vs V2 distinction, subagent lifecycle
- [Bun joins Anthropic](https://bun.com/blog/bun-joins-anthropic) — Bun first-class support; `options.executable: 'bun'` is strategic priority
- [claude-agent-sdk-python Issue #145](https://github.com/anthropics/claude-agent-sdk-python/issues/145) — stdio deadlock on large MCP responses confirmed
- [claude-agent-sdk-python Issue #207](https://github.com/anthropics/claude-agent-sdk-python/issues/207) — MCP server silent failure mode confirmed
- [claude-agent-sdk-typescript Issue #150](https://github.com/anthropics/claude-agent-sdk-typescript/issues/150) — `bun build` path resolution issue; `bun run` unaffected; closed Feb 19, 2026
- [DataFusion Issue #9554](https://github.com/apache/datafusion/issues/9554) — recursive CTEs opt-in and not enabled in LanceDB's default configuration
- [Agent Skills Prompt Injection — arXiv 2510.26328](https://arxiv.org/abs/2510.26328) — skill injection attack surface; peer-reviewed October 2025
- [Prompt Injection on Agentic Coding Assistants — arXiv 2601.17548](https://arxiv.org/html/2601.17548v1) — adversarial skill content patterns; peer-reviewed 2026
- [Azure Architecture Center — AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — sequential vs concurrent orchestration; PEV loop pattern; official Microsoft docs

### Secondary (MEDIUM confidence)
- [AGNT.gg SDK cheatsheet](https://agnt.gg/articles/claude-agent-sdk-cheatsheet) — `HookCallbackMatcher` shape, `PermissionMode` values (verified against official docs)
- [DeepWiki SDK reference](https://deepwiki.com/anthropics/claude-agent-sdk-typescript/9-reference) — Node 18+ minimum, Zod peer dep range (`^3.24.1 OR ^4.0.0`)
- [Claude Agent Skills deep dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/) — SKILL.md format, meta-tool pattern, model-invoked selection behavior (confirms deterministic injection requires prompt concatenation)
- [Stop Stuffing Your System Prompt — Medium 2026](https://pessini.medium.com/stop-stuffing-your-system-prompt-build-scalable-agent-skills-in-langgraph-a9856378e8f6) — progressive skill disclosure pattern; aligns with official SDK design
- [Task decomposition for coding agents — atoms.dev](https://atoms.dev/insights/task-decomposition-for-coding-agents-architectures-advancements-and-future-directions/a95f933f2c6541fc9e1fb352b429da15) — HTN patterns, primitive vs compound task definition, depth limit rationale
- [dag-executor skill — lobehub](https://lobehub.com/skills/erichowens-some_claude_skills-dag-executor) — wave-based parallel execution pattern
- [Cloud Security Alliance — multi-agent trust-autonomy framework](https://cloudsecurityalliance.org/blog/2025/12/16/enhancing-the-agentic-ai-security-scoping-matrix-a-multi-dimensional-approach) — per-domain autonomy level design; Tier 0-3 structure consistency
- [SkillJect: Stealthy Skill-Based Prompt Injection — arXiv 2602.14211](https://arxiv.org/html/2602.14211) — skill injection attack escalation patterns
- npm WebSearch — `@anthropic-ai/claude-agent-sdk@0.2.63` confirmed current as of 2026-02-28

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
