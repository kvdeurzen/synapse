# Synapse — AI Agent Coordination Platform

## What This Is

Synapse is an MCP-based platform for AI agent coordination. The data layer (v1.0) provides 18 MCP tools for storing, querying, and searching project knowledge and source code via LanceDB with semantic/hybrid search. The coordination layer (v2.0) adds an orchestrator built on the Claude Agent SDK that coordinates 10 specialized agents through Synapse's MCP tools — with decision tracking as "case law," recursive task decomposition, tiered authority, and a skill loading system for project-specific behavior. Built as an open-source tool for the AI-assisted development community.

## Core Value

Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.

## Current Milestone: v2.0 Agentic Framework

**Goal:** Build a coordination layer on top of Synapse's data layer — 10 specialized agents orchestrated via the Claude Agent SDK, with decision precedent tracking, recursive task decomposition, and tiered authority enforcement.

**Target features:**
- Decision tracking system ("Case Law") with semantic precedent search
- Recursive task hierarchy (Epic → Feature → Component → Task)
- Orchestrator process using Claude Agent SDK
- 10 specialized agents with distinct authority and tool restrictions
- Skill loading system for project-specific agent behavior
- Config-based Trust-Knowledge Matrix for adaptive oversight
- Hook-based quality gates and tier enforcement
- Plan-Execute-Validate workflow

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0. -->

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

### Active

<!-- Current scope — v2.0 Agentic Framework. See REQUIREMENTS.md for REQ-IDs. -->

- [ ] Decision tracking: `decisions` LanceDB table with semantic search on rationale
- [ ] Decision tools: store_decision, query_decisions, check_precedent
- [ ] Task hierarchy: `tasks` LanceDB table with recursive parent_id
- [ ] Task tools: create_task, update_task, get_task_tree
- [ ] Orchestrator process using Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- [ ] 10 specialized agents: Product Strategist, Researcher, Architect, Decomposer, Plan Reviewer, Executor, Validator, Integration Checker, Debugger, Codebase Analyst
- [ ] Agent tier authority enforcement (Tier 0-3 decision hierarchy)
- [ ] Skill loading system: generic agents + project-specific skills injected at runtime
- [ ] Config-based Trust-Knowledge Matrix (per-domain autonomy levels)
- [ ] Hook-based quality gates (tier enforcement, precedent checking, tool audit)
- [ ] Plan-Execute-Validate (PEV) workflow with wave-based parallel execution

### Out of Scope

- GSD/BMad import tools — future milestone
- MCP resources and prompt templates — future milestone
- Additional code languages beyond TS/Python/Rust — future milestone
- Automated preference learning from past decisions — v2.0 uses explicit config, not ML
- Real-time collaboration (multiple users) — single-user orchestrator for now
- Web UI or dashboard — CLI/MCP interface only
- Cloud deployment / hosted service — local-first

## Context

**Shipped v1.0 (2026-03-01):** 18 MCP tools, 6 LanceDB tables, 495 tests passing, 18,561 LOC TypeScript. Synapse MCP server is fully operational as a data layer. 50/50 requirements satisfied, 9 phases complete. See `.planning/MILESTONES.md` and `.planning/milestones/v1.0-ROADMAP.md` for full details.

**Problem being solved:** The v1.0 data layer gives agents memory. The v2.0 coordination layer gives agents structure — knowing *what* to work on, *who* should do it, *what decisions* to respect, and *when* to ask the user. Without this, agents either operate in isolation (no coordination) or dump everything into a single context window (no scalability).

**Architecture:** Two-process design. Orchestrator spawns Synapse as an MCP subprocess via the Agent SDK's `mcpServers` config. Clean boundary: Synapse stores data, orchestrator controls workflow/authority/agent lifecycle.

**Agent roster:** 10 agents inspired by GSD's 11-agent architecture. Key patterns adopted: research-before-action, plan-then-verify loop (max 3 iterations), wave-based parallel execution, progressive verification (per-task → per-feature → per-epic → per-project).

**Skill loading:** Agent roles are generic templates. Skills are project-specific capabilities (domain knowledge, quality criteria, vocabulary) injected at runtime via the skill registry. This makes the framework domain-agnostic.

**Ollama:** Running locally with nomic-embed-text model available.

## Constraints

- **Embedding provider**: Ollama only — fail-fast, no fallback
- **Transport**: MCP stdio — standard for Claude Code, no HTTP server
- **Storage**: LanceDB embedded — zero-config, no separate database process
- **Code languages**: TypeScript, Python, Rust only (v1.0 scope, unchanged)
- **Vector dimensions**: 768 (nomic-embed-text) — all vectors must use same model
- **Agent SDK**: `@anthropic-ai/claude-agent-sdk` — no custom agent runtime
- **Trust matrix**: Config file, not DB table — simple and explicit
- **Orchestrator**: Same monorepo as Synapse, separate `orchestrator/` package

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
| Claude Agent SDK over custom runtime | Battle-tested, maintained by Anthropic, provides query(), subagents, hooks, MCP client | — Pending |
| 10 agents over 3 | Narrow focus per agent (GSD pattern); distinct cognitive tasks need distinct prompts/constraints | — Pending |
| Skills as prompt injection, not code plugins | Simpler, no runtime code loading; skills are system prompt content + quality criteria | — Pending |
| Trust matrix as config, not DB table | Explicit, auditable, no premature complexity; can migrate to DB later if needed | — Pending |
| Synapse/Orchestrator boundary: data vs control | Synapse stores data without knowing about agents; orchestrator knows about agents without owning storage | — Pending |

---
*Last updated: 2026-03-01 after v1.0 milestone completion*
