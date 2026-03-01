# Milestones: Synapse

## v1.0 Data Layer

**Shipped:** 2026-03-01
**Phases:** 9 (Phases 1-9) | **Plans:** 24 | **Tests:** 495
**LOC:** 18,561 TypeScript (7,346 source + 11,215 test)
**Timeline:** 3 days (2026-02-27 → 2026-03-01)

### Delivered

Complete MCP data layer with 18 tools for storing, querying, and searching project knowledge and source code via LanceDB with semantic/hybrid search.

### Key Accomplishments

1. MCP server with stdio transport, Zod-validated inputs, and stderr-only logging
2. LanceDB database with 6 tables, Arrow schemas, BTree indexes, and multi-project scoping
3. Embedding service via Ollama with fail-fast writes, graceful read degradation, and dimension assertions
4. 9 document tools covering store/query/search/update/delete/link/overview with lifecycle tracking
5. AST-aware code indexing via tree-sitter for TypeScript, Python, Rust with incremental re-indexing
6. Hybrid search (semantic + FTS via RRF) with two-phase smart context assembly across documents and code

### Tech Debt Carried Forward

- escapeSQL helper duplicated in init-project.ts and index-codebase.ts
- index_codebase overwrites project_meta.created_at on each run
- INT-02: AST import edges use file path IDs (unreachable from ULID-based get_related_documents)
- Missing requirements-completed frontmatter in several phase SUMMARYs

### Archives

- [Roadmap](milestones/v1.0-ROADMAP.md)
- [Requirements](milestones/v1.0-REQUIREMENTS.md)
- [Audit](milestones/v1.0-MILESTONE-AUDIT.md)

---
