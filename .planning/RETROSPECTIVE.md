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

## Milestone: v2.0 — Agentic Framework

**Shipped:** 2026-03-02
**Phases:** 6 | **Plans:** 19

### What Was Built

- Decision tracking tools (store_decision, query_decisions, check_precedent) with semantic precedent search
- Recursive task hierarchy (create_task, update_task, get_task_tree) with cascade propagation and cycle detection
- Claude Code framework: agents/, skills/, hooks/, workflows/, config/ with TOML validation and three-layer test harness
- 10 specialized agents as markdown system prompts with per-agent allowed_tools and tier authority
- Skill loading system: 7 built-in skills, token budgets, hash validation, agents.toml skill assignment
- Quality gate hooks: fail-closed tier-gate, tool-allowlist, fail-open precedent-gate, all-tool audit-log
- PEV workflow document and config: progressive decomposition, wave execution, failure escalation, rollback
- Bun workspace monorepo consolidation (server + framework, 708 tests passing)

### What Worked

- **Wave-based plan execution**: Phases 14's 4 plans executed in parallel waves — hooks and audit in Wave 1, config and agent extensions in Wave 2. Average 3 min per plan.
- **TDD for config schemas**: RED→GREEN commits caught Zod 4 nested default behavior (`.default({})` doesn't apply nested field defaults) immediately. Would have been a subtle production bug.
- **Agent prompt as markdown file**: The "agent IS its markdown file" pattern eliminated template loading complexity. Claude Code loads them natively.
- **Monorepo consolidation timing (Phase 13.1)**: Inserting the monorepo merge between Phase 13 and 14 prevented path reference divergence. Doing it later would have compounded.
- **UAT verification**: Phase 14 UAT caught no issues — all 12 tests passed. The hooks, config, and agent prompts worked as designed.

### What Was Inefficient

- **REQUIREMENTS.md tracking fell behind**: 24 of 65 v2.0 requirements were completed but never checked off in the traceability table. The SUMMARY files had the truth; REQUIREMENTS.md became stale. Fixed during milestone archival.
- **No milestone audit**: Skipped `/gsd:audit-milestone` — relied on per-phase UAT instead. This is acceptable for v2.0 (mostly config/prompt/hook work) but should be done for milestones with complex cross-phase integration.
- **Phase 13.1 was slow**: The monorepo merge (Phase 13.1) took 39 min across 2 plans vs ~5 min average for other plans. Path reference updates across two codebases required careful verification.

### Patterns Established

- Fail-closed enforcement hooks (deny on any error), fail-open advisory hooks (exit 0 silently on error)
- Agent prompt extension: append new sections, never modify existing ones
- Multi-root config path resolution: try cwd, packages/framework, import.meta.url relative
- TOML config with Zod validation and anti-drift tests (actual config files validated against schemas in CI)
- Skill SKILL.md files targeting 400-600 tokens each (well under 2K warning threshold)
- Bun workspace monorepo: shared tsconfig.base.json, single biome.json, aggregate test scripts

### Key Lessons

1. **Keep REQUIREMENTS.md checkboxes updated during execution** — stale traceability tables create milestone completion busywork
2. **Zod 4 nested defaults require explicit default objects** — `.default({})` does NOT apply nested field defaults when parent key is absent
3. **Monorepo consolidation should happen early** — the longer two repos diverge, the harder the merge
4. **Phase UAT is sufficient for config/prompt phases** — full milestone audit is more valuable for code-heavy milestones with cross-phase dependencies

### Cost Observations

- Model mix: ~60% sonnet (execution), ~30% opus (planning), ~10% haiku (research)
- Sessions: ~12 sessions across 4 days
- Notable: Phase 14 (4 plans, 3 min each = 12 min total) was the fastest phase — clean plan decomposition and wave parallelization paid off

---

## Cross-Milestone Trends

| Metric | v1.0 | v2.0 |
|--------|------|------|
| Phases | 9 | 6 |
| Plans | 24 | 19 |
| Tests | 495 | 708 (cumulative) |
| LOC | 18,561 | 14,661 (cumulative) |
| Timeline | 3 days | 4 days |
| Requirements | 50/50 | 65/65 |
| Tech debt items | 4 (low severity) | 3 carried from v1.0 |
| Gap closure phases | 2 (Phases 8-9) | 0 |
| Avg plan duration | ~8 min | ~6 min |
