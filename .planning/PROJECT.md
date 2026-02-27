# Synapse — Database-Backed Project Knowledge & Code Search MCP Server

## What This Is

Synapse is an MCP server that gives AI agents a unified interface for storing, querying, and searching both project knowledge (requirements, architecture decisions, design patterns) and source code. Documents are chunked and embedded at write time into LanceDB, enabling semantic search, hybrid search (vector + FTS), and smart context assembly — all without loading full markdown files into context windows. Built as an open-source tool for the AI-assisted development community.

## Core Value

Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The two-phase smart context (overview then detailed) puts the agent in control of what it loads.

## Requirements

### Validated

- ✓ Existing codebase structure with src/ layout — existing
- ✓ TypeScript project configuration — existing
- ✓ MCP server entry point scaffolding — existing

### Active

- [ ] LanceDB embedded database with 5 tables (documents, code_chunks, relationships, project_meta, activity_log)
- [ ] Embedding service via Ollama (nomic-embed-text, 768-dim) with fail-fast on unavailability
- [ ] Document chunking with category-specific strategies (semantic_section, paragraph, fixed_size)
- [ ] 9 document tools: init_project, store_document, query_documents, semantic_search, get_smart_context, link_documents, update_document, delete_document, project_overview
- [ ] 3 code tools: index_codebase, search_code, get_index_status
- [ ] AST-aware code indexing via tree-sitter for TypeScript, Python, and Rust
- [ ] Incremental code indexing using file hash comparison
- [ ] Auto-generated relationships from import/use statements
- [ ] Hybrid search via Reciprocal Rank Fusion (semantic + FTS)
- [ ] Two-phase smart context assembly (overview summaries, then detailed fetch)
- [ ] 1-hop graph traversal for relationship-aware context
- [ ] Document versioning (superseded rows, version counter)
- [ ] Document lifecycle (draft → active → approved → superseded/archived)
- [ ] Multi-project support via project_id
- [ ] Schema foundations for v2 decomposition (parent_id, depth, decision_type fields)

### Out of Scope

- Agent role profiles with per-role context assembly — v2 (agentic workflow milestone)
- Slash commands and phase management workflow — v2
- GSD/BMad import tools — v2
- MCP resources and prompt templates — v2
- Additional languages beyond TS/Python/Rust — v2
- Task decomposition and planning workflow — v2
- User preference learning system — v2
- Automated validation pipeline — v2

## Context

**Existing codebase:** There is existing code in the project directory, but Synapse itself is a fresh build. The codebase map documents the current state at `.planning/codebase/`.

**Problem being solved:** AI dev frameworks (GSD, BMad, SuperClaude) store project docs in flat markdown files. This causes documentation bloat, subagents getting wrong-sized context, forgotten decisions, and wasted context window tokens. Synapse replaces flat files with chunked, embedded, queryable storage.

**V2 vision — agentic project management:** Synapse will grow into a project management layer where large projects get gradually decomposed into executable tasks. The flow: understand → scope → plan → subdivide into subplans → execute → validate upward. Key v2 concepts:
- Tasks are "executable" when completable within a context window (~200k tokens) with testable deliverables
- Three-layer validation: automated tests, parent agent review, user checkpoints at milestones
- Decision system: threshold-based auto-resolution for low-impact decisions (configurable), user involvement for new decision points with suggestions + pros/cons, accumulated preference learning from past decisions
- Both style preferences ("always use Tailwind") and architectural patterns ("JWT with refresh tokens") are remembered and reused

**Ollama:** Running locally with nomic-embed-text model available.

## Constraints

- **Embedding provider**: Ollama only — fail-fast, no fallback. Dirty data (mixed embedding spaces) is worse than no data
- **Transport**: MCP stdio — standard for Claude Code, no HTTP server
- **Storage**: LanceDB embedded — zero-config, no separate database process
- **Code languages v1**: TypeScript, Python, Rust only
- **Vector dimensions**: 768 (nomic-embed-text) — all vectors must use same model
- **Schema forward-compatibility**: Include parent_id, depth, decision_type fields in v1 schema to support v2 decomposition without migration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LanceDB embedded over Postgres/SQLite+pgvector | Zero-config, vector + FTS + SQL in one, append-friendly Lance format | — Pending |
| Chunk at write time, not query time | Better embedding quality at ~512 tokens; avoids runtime chunking overhead | — Pending |
| Fail-fast on missing Ollama | Mixed embedding spaces fracture vector search; reads still work without Ollama | — Pending |
| Versioning via superseded rows | Full history preserved, append-friendly for Lance format | — Pending |
| RRF for hybrid search | Simple, no score normalization needed, well-proven in literature | — Pending |
| Two-phase get_smart_context | Agent controls what it loads instead of being force-fed 50+ chunks | — Pending |
| tree-sitter for code parsing | Fast, incremental, multi-language; industry standard (VS Code, Neovim) | — Pending |
| Separate code_chunks table | Different schema from documents; avoids polluting doc queries; independent indexing lifecycle | — Pending |
| Auto relationships from AST imports | Knowledge graph stays fresh without manual maintenance; imports are ground truth | — Pending |
| Include v2 schema foundations in v1 | parent_id, depth, decision_type fields now; cheaper than migration later | — Pending |
| Open source from the start | Building for the community, not just personal use | — Pending |

---
*Last updated: 2026-02-27 after initialization*
