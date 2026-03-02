# Synapse — AI Agent Coordination Platform

## What This Is

Synapse is an MCP-based platform for AI agent coordination. It consists of two layers: the **data layer** (v1.0) provides 18 MCP tools for storing, querying, and searching project knowledge and source code via LanceDB with semantic/hybrid search. The **coordination layer** (v2.0) provides a Claude Code framework with 10 specialized agents, decision precedent tracking as "case law," recursive task decomposition (Epic/Feature/Component/Task), tiered authority enforcement via hooks, a skill loading system for project-specific behavior, and a Plan-Execute-Validate workflow with wave-based parallel execution. Built as an open-source tool for the AI-assisted development community.

## Core Value

Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.

## Requirements

### Validated

- ✓ LanceDB embedded database with 6 tables (documents, doc_chunks, code_chunks, relationships, project_meta, activity_log) — v1.0
- ✓ Embedding service via Ollama (nomic-embed-text, 768-dim) with fail-fast on unavailability — v1.0
- ✓ Document chunking with category-specific strategies (semantic_section, paragraph, fixed_size) — v1.0
- ✓ 9 document tools: init_project, store_document, query_documents, semantic_search, get_smart_context, link_documents, update_document, delete_document, project_overview — v1.0
- ✓ 3 code tools: index_codebase, search_code, get_index_status — v1.0
- ✓ AST-aware code indexing via tree-sitter for TypeScript, Python, and Rust — v1.0
- ✓ Incremental code indexing using file hash comparison — v1.0
- ✓ Auto-generated relationships from import/use statements — v1.0
- ✓ Hybrid search via Reciprocal Rank Fusion (semantic + FTS) — v1.0
- ✓ Two-phase smart context assembly (overview summaries, then detailed fetch) — v1.0
- ✓ 1-hop graph traversal for relationship-aware context — v1.0
- ✓ Document versioning (superseded rows, version counter) — v1.0
- ✓ Document lifecycle (draft → active → approved → superseded/archived) — v1.0
- ✓ Multi-project support via project_id — v1.0
- ✓ Schema foundations for v2 decomposition (parent_id, depth, decision_type fields) — v1.0
- ✓ MCP stdio transport with stderr-only logging — v1.0
- ✓ Zod-validated tool inputs — v1.0
- ✓ Decision tracking with semantic precedent search (store_decision, query_decisions, check_precedent) — v2.0
- ✓ Recursive task hierarchy with cascade status propagation and cycle detection (create_task, update_task, get_task_tree) — v2.0
- ✓ Claude Code framework with agents/, skills/, hooks/, workflows/, config/ directories and TOML config validation — v2.0
- ✓ 10 specialized agents (Product Strategist, Researcher, Architect, Decomposer, Plan Reviewer, Executor, Validator, Integration Checker, Debugger, Codebase Analyst) as markdown system prompts — v2.0
- ✓ Skill loading system with token budgets, hash validation, and per-agent skill assignment via agents.toml — v2.0
- ✓ Trust-Knowledge Matrix (per-domain autonomy levels, tier authority map, configurable approval tiers) — v2.0
- ✓ Hook-based quality gates: fail-closed tier enforcement, tool allowlist enforcement, advisory precedent checking, all-tool audit logging — v2.0
- ✓ Plan-Execute-Validate workflow with progressive decomposition, wave-based parallel execution, failure escalation ladder, and rollback support — v2.0

### Active

(No active requirements — next milestone not yet planned)

### Out of Scope

- GSD/BMad import tools — future milestone
- MCP resources and prompt templates — future milestone
- Additional code languages beyond TS/Python/Rust — future milestone
- Automated preference learning from past decisions — explicit config is more predictable
- Real-time collaboration (multiple users) — single-user orchestrator for now
- Web UI or dashboard — CLI/MCP interface only
- Cloud deployment / hosted service — local-first
- Standalone Agent SDK orchestrator — Claude Code framework chosen; Agent SDK decouple is a future option

## Context

**Shipped v1.0 (2026-03-01):** 18 MCP tools, 6 LanceDB tables, 495 tests passing, 18,561 LOC TypeScript. Complete data layer. 50/50 requirements satisfied. See `.planning/MILESTONES.md`.

**Shipped v2.0 (2026-03-02):** Coordination layer added — 10 specialized agents, 6 hook scripts, 7 skill directories, TOML config system, PEV workflow. 708 tests passing (612 server + 96 framework), 14,661 LOC total. 65/65 requirements satisfied. See `.planning/MILESTONES.md`.

**Architecture:** Bun workspace monorepo with `packages/server/` (data layer) and `packages/framework/` (coordination layer). Server runs as an MCP subprocess via stdio. Framework is a Claude Code native integration — agents, skills, hooks, and workflows are files that Claude Code loads directly. Clean boundary: server stores data, framework controls workflow/authority/agent lifecycle.

**Agent roster:** 10 agents with narrow cognitive focus. 4 Opus-tier (Product Strategist, Architect, Decomposer, Plan Reviewer) for high-judgment tasks, 6 Sonnet-tier (Researcher, Executor, Validator, Integration Checker, Debugger, Codebase Analyst) for execution tasks. Each has distinct allowed_tools lists enforced by hooks.

**Skill loading:** Agent roles are generic templates. Skills are project-specific capabilities (domain knowledge, quality criteria, vocabulary) injected at spawn time via the skill registry in agents.toml. 7 built-in skills: typescript, react, python, vitest, sql, bun, tailwind.

**Ollama:** Running locally with nomic-embed-text model available.

## Constraints

- **Embedding provider**: Ollama only — fail-fast, no fallback
- **Transport**: MCP stdio — standard for Claude Code, no HTTP server
- **Storage**: LanceDB embedded — zero-config, no separate database process
- **Code languages**: TypeScript, Python, Rust only
- **Vector dimensions**: 768 (nomic-embed-text) — all vectors must use same model
- **Framework**: Claude Code native — agents/skills/hooks/workflows as files, not standalone process
- **Trust matrix**: TOML config file, not DB table — simple and explicit
- **Monorepo**: Bun workspace with packages/server/ and packages/framework/

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LanceDB embedded over Postgres/SQLite+pgvector | Zero-config, vector + FTS + SQL in one, append-friendly Lance format | ✓ Good |
| Chunk at write time, not query time | Better embedding quality at ~512 tokens; avoids runtime chunking overhead | ✓ Good |
| Fail-fast on missing Ollama | Mixed embedding spaces fracture vector search; reads still work without Ollama | ✓ Good |
| Versioning via superseded rows | Full history preserved, append-friendly for Lance format | ✓ Good |
| RRF for hybrid search | Simple, no score normalization needed, well-proven in literature | ✓ Good |
| Two-phase get_smart_context | Agent controls what it loads instead of being force-fed 50+ chunks | ✓ Good |
| tree-sitter for code parsing | Fast, incremental, multi-language; industry standard (VS Code, Neovim) | ✓ Good |
| Separate code_chunks table | Different schema from documents; avoids polluting doc queries; independent indexing lifecycle | ✓ Good |
| Auto relationships from AST imports | Knowledge graph stays fresh without manual maintenance; imports are ground truth | ✓ Good |
| Include v2 schema foundations in v1 | parent_id, depth, decision_type fields now; cheaper than migration later | ✓ Good |
| Open source from the start | Building for the community, not just personal use | ✓ Good |
| Claude Code framework over standalone Agent SDK | Native integration with Claude Code subscription; agents/skills/hooks load as files; avoids separate process management | ✓ Good |
| 10 agents over 3 | Narrow focus per agent (GSD pattern); distinct cognitive tasks need distinct prompts/constraints | ✓ Good |
| Skills as prompt injection, not code plugins | Simpler, no runtime code loading; skills are markdown content + quality criteria | ✓ Good |
| Trust matrix as TOML config, not DB table | Explicit, auditable, no premature complexity; can migrate to DB later if needed | ✓ Good |
| Synapse/Framework boundary: data vs control | Server stores data without knowing about agents; framework knows about agents without owning storage | ✓ Good |
| Fail-closed enforcement hooks, fail-open advisory hooks | Enforcement (tier-gate, tool-allowlist) must deny on any error; advisory (precedent-gate) should not block on error | ✓ Good |
| PEV workflow as agent-consumed markdown | Orchestrator reads and follows pev-workflow.md via reasoning, not runtime code | ✓ Good |
| Bun workspace monorepo | Shared deps hoisted, single test/lint commands, shared tsconfig.base.json | ✓ Good |

---
*Last updated: 2026-03-02 after v2.0 milestone completion*
