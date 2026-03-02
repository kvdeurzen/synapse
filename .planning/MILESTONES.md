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

## v2.0 Agentic Framework

**Shipped:** 2026-03-02
**Phases:** 6 (Phases 10-14, plus 13.1 inserted) | **Plans:** 19 | **Tests:** 708 (612 server + 96 framework)
**LOC:** 14,661 TypeScript (10,025 server + 4,636 framework)
**Timeline:** 4 days (2026-02-27 → 2026-03-02)
**Commits:** 94

### Delivered

Coordination layer on top of Synapse's data layer — 10 specialized agents orchestrated as a Claude Code framework with decision precedent tracking, recursive task decomposition, configurable trust tiers, hook-based authority enforcement, and Plan-Execute-Validate workflow.

### Key Accomplishments

1. Decision tracking with semantic precedent search — store_decision, query_decisions, check_precedent tools with 0.85+ similarity threshold
2. Recursive task hierarchy — create_task, update_task, get_task_tree with cascade status propagation and cycle detection (Epic/Feature/Component/Task)
3. Framework bootstrap — agents/, skills/, hooks/, workflows/, config/ with TOML validation, three-layer test harness, MCP integration client
4. 10 specialized agents with trust boundaries — markdown agent definitions, skill loader with token budgets, Trust-Knowledge Matrix config
5. Monorepo consolidation — synapse-server + synapse-framework into Bun workspace monorepo with 708 tests passing
6. Quality gates and PEV workflow — fail-closed enforcement hooks, all-tool audit logging, Plan-Execute-Validate workflow with wave-based parallel execution

### Tech Debt Carried Forward

- v1.0 escapeSQL duplication and project_meta.created_at overwrite still present
- v1.0 INT-02 (AST import edges use file paths vs ULIDs) still open
- REQUIREMENTS.md checkbox tracking fell behind during execution (fixed during archival)

### Archives

- [Roadmap](milestones/v2.0-ROADMAP.md)
- [Requirements](milestones/v2.0-REQUIREMENTS.md)

---
