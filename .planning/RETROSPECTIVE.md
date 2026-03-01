# Retrospective: Synapse

## Milestone: v1.0 — Data Layer

**Shipped:** 2026-03-01
**Phases:** 9 | **Plans:** 24

### What Was Built

- MCP server with stdio transport, Zod-validated inputs, stderr-only logging
- LanceDB embedded database with 6 tables and Arrow schemas
- Embedding service via Ollama (nomic-embed-text, 768-dim) with fail-fast/graceful-degradation pattern
- 9 document tools with versioning, lifecycle tracking, and activity logging
- AST-aware code indexing via tree-sitter for TypeScript, Python, Rust
- Hybrid search (semantic + FTS via RRF) with two-phase smart context assembly
- 18 MCP tools total, 495 tests passing

### What Worked

- **Phase-per-capability structure**: Each phase delivered a cohesive vertical slice (embedding → documents → search → code). Clean dependency chains.
- **TDD approach**: Writing tests first in Phases 3-6 caught schema mismatches and integration issues early.
- **Milestone audit before close**: Running `/gsd:audit-milestone` revealed INT-01 (project_meta not seeded) and 5 doc accuracy issues. Phases 8-9 closed all gaps cleanly.
- **Forward-compatible schema**: Adding v2 fields (parent_id, depth, decision_type) in v1.0 avoids migration pain later.
- **3-day execution**: Tight scope definition enabled rapid delivery.

### What Was Inefficient

- **Phase 8/9 gap closure**: Could have caught project_meta seeding issue during Phase 2 if integration tests covered the full init→index→status flow.
- **SUMMARY frontmatter inconsistency**: requirements-completed frontmatter not standardized until Phase 6, creating documentation cleanup work in Phase 9.
- **Duplicated escapeSQL**: Noticed late; should have been extracted to shared module when index-codebase was built (Phase 6).

### Patterns Established

- `registerXTool(server, config)` pattern for all MCP tool registration
- Category-specific chunking strategies (semantic_section, paragraph, fixed_size)
- Delete+insert upsert pattern for LanceDB (no native upsert)
- Fail-fast writes / graceful-degradation reads for Ollama dependency
- Context header prefixing before embedding ("Document: {title} | Section: {header}")
- BTree index on project_id for multi-project scoping

### Key Lessons

- **Run integration tests across phase boundaries early** — INT-01 sat undetected through 6 phases
- **Standardize documentation conventions from Phase 1** — retrofitting is busywork
- **Audit before milestone close** — the audit caught real issues that would have shipped as tech debt

### Cost Observations

- Model mix: ~70% sonnet, ~30% opus (opus for planning/verification, sonnet for execution)
- Sessions: ~15 sessions across 3 days
- Notable: Phase 4 (Document Management) was the largest phase (4 plans, 155 tests) but executed smoothly due to clear requirement decomposition

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 9 |
| Plans | 24 |
| Tests | 495 |
| LOC | 18,561 |
| Timeline | 3 days |
| Requirements | 50/50 |
| Tech debt items | 4 (low severity) |
| Gap closure phases | 2 (Phases 8-9) |
