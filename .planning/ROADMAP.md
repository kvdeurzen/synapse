# Roadmap: Synapse

## Milestones

- ✅ **v1.0 Data Layer** - Phases 1-9 (shipped 2026-03-01)
- 🚧 **v2.0 Agentic Framework** - Phases 10-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 Data Layer (Phases 1-9) - SHIPPED 2026-03-01</summary>

### Phase 1: MCP Foundation
**Goal**: A running MCP server that accepts connections via stdio, registers tools with Zod-validated inputs, and provably writes nothing to stdout
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-07
**Success Criteria** (what must be TRUE):
  1. Claude Code can connect to the server via stdio and list its registered tools
  2. Server accepts --db path CLI arg and OLLAMA_URL, EMBED_MODEL, SYNAPSE_DB_PATH env vars at startup
  3. Piping the server's stdout through a JSON parser produces no parse errors (no console.log contamination)
  4. All server log output appears on stderr, none on stdout
**Plans**: 2 plans

Plans:
- [x] 01-01: Project scaffolding, config loader, logger, shared types
- [x] 01-02: MCP server with stdio transport, ping/echo tools, stdout smoke test

### Phase 2: Database Schema
**Goal**: All 5 LanceDB tables exist with complete Arrow schemas — including v2 forward-compatibility fields — and the batched insert pattern is established before any data is written
**Depends on**: Phase 1
**Requirements**: FOUND-03, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. init_project creates all 5 tables (documents, code_chunks, relationships, project_meta, activity_log) with correct schemas and indexes
  2. Every table includes a project_id column with BTree index for multi-project query scoping
  3. Documents table includes v2 forward-compatibility fields (parent_id, depth, decision_type) as nullable columns
  4. Re-running init_project on an existing database does not overwrite data (idempotent)
**Plans**: 3 plans

Plans:
- [x] 02-01: Arrow schemas, LanceDB connection, init_project skeleton
- [x] 02-02: Index creation, project_id scoping, idempotent init
- [x] 02-03: Integration tests for schema correctness and idempotency

### Phase 3: Embedding Service
**Goal**: A shared embedding service that embeds text via Ollama, asserts correct dimensions on every vector, fails fast on write paths when Ollama is unreachable, and allows read paths to continue without embeddings
**Depends on**: Phase 2
**Requirements**: EMBED-01, EMBED-02, EMBED-03, EMBED-04, EMBED-05, EMBED-06
**Success Criteria** (what must be TRUE):
  1. Calling embed() with a single string or array of strings returns 768-dimension vectors from Ollama's nomic-embed-text model
  2. Calling store_document when Ollama is unreachable returns a clear error — it does not silently store a document without embeddings
  3. Calling query_documents when Ollama is unreachable returns results — read operations continue without embeddings
  4. Server startup logs a warning when Ollama is unreachable but the server still starts and registers tools
  5. Attempting to insert a vector that is not 768 dimensions throws an assertion error with a clear message before touching the database
**Plans**: 2 plans

Plans:
- [x] 03-01: Error types, embedding service core (embed, cache, retry, batch, dimension assertion) via TDD
- [x] 03-02: Health check, startup wiring, ping tool update, write/read path patterns

### Phase 4: Document Management
**Goal**: All document tools are operational — agents can store, version, query, update, delete, link, and get an overview of project documents with lifecycle state tracking and automatic activity logging
**Depends on**: Phase 3
**Requirements**: FOUND-04, DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04
**Success Criteria** (what must be TRUE):
  1. An agent can call init_project and immediately receive a populated project with starter documents (charter, ADR log, coding guidelines, glossary)
  2. An agent can store a document and receive back a doc_id, chunk_count, version number, and token estimate — storing the same doc_id again creates version 2 and marks v1 chunks as superseded
  3. An agent can filter documents by category, phase, tags, status, and priority via query_documents without triggering any embedding calls
  4. An agent can update document metadata (status, phase, tags, priority) via update_document without the document being re-chunked or re-embedded
  5. An agent can create bidirectional relationships between documents via link_documents with source attribution distinguishing manual from auto-generated edges
**Plans**: 4 plans

Plans:
- [x] 04-01: store_document with chunking, versioning, activity logging
- [x] 04-02: query_documents, update_document, delete_document
- [x] 04-03: project_overview, document lifecycle, carry-forward categories
- [x] 04-04: link_documents, relationship types, bidirectional creation

### Phase 5: Document Search
**Goal**: Agents can find relevant project knowledge via semantic search, full-text search, hybrid RRF-merged search, and the two-phase smart context tool that assembles token-budget-aware context from both overview summaries and detailed content with 1-hop graph expansion
**Depends on**: Phase 4
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, SRCH-07
**Success Criteria** (what must be TRUE):
  1. An agent can run semantic_search with a natural language query and receive ranked results with relevance scores, source attribution, and optional category/phase/tags/status filters
  2. An agent can call get_smart_context in overview mode and receive ~100-token summaries totaling 2-4k tokens — then call it again in detailed mode for specific doc_ids and receive full content with documents reachable via 1-hop relationships included
  3. Hybrid search results visibly differ from pure vector results — FTS re-ranks exact keyword matches higher than vector-only would
  4. get_smart_context respects a max_tokens budget and truncates results rather than exceeding it
  5. All search results include relevance scores and identify which table (documents vs code_chunks) they originated from
**Plans**: 4 plans

Plans:
- [x] 05-01: semantic_search with filters and relevance scores
- [x] 05-02: FTS and hybrid RRF merge
- [x] 05-03: get_smart_context overview phase
- [x] 05-04: get_smart_context detailed phase with 1-hop traversal and token budget

### Phase 6: Code Indexing
**Goal**: The code indexing pipeline scans TypeScript, Python, and Rust files with AST-aware symbol extraction, embeds code chunks with context headers, tracks file hashes for incremental re-indexing, removes stale chunks on deletion, and auto-generates relationship edges from import statements
**Depends on**: Phase 3
**Requirements**: CODE-01, CODE-02, CODE-03, CODE-04, CODE-05, CODE-06, CODE-07, CODE-08, CODE-09, CODE-10
**Success Criteria** (what must be TRUE):
  1. An agent can call index_codebase on a mixed TypeScript/Python/Rust project and receive files_scanned, files_indexed, chunks_created, and skipped_unchanged counts
  2. Running index_codebase a second time with no file changes shows 0 files re-indexed (all skipped via SHA-256 hash comparison)
  3. Deleting a file and re-running index_codebase removes that file's code_chunks and its auto-generated relationship edges from the database
  4. Each indexed code chunk includes symbol_name, symbol_type, scope_chain, imports, exports metadata and was embedded with a "File: {path} | {symbol_type}: {scope_chain}" context header
  5. Import statements are parsed to create depends_on relationships between files — re-indexing replaces these edges rather than appending duplicates
**Plans**: 5 plans

Plans:
- [x] 06-01: tree-sitter grammar setup, TypeScript parser
- [x] 06-02: Python and Rust parsers, scope_chain extraction
- [x] 06-03: index_codebase tool, file scanning, gitignore support
- [x] 06-04: Incremental indexing (SHA-256 hashing), deleted file cleanup
- [x] 06-05: Auto-relationship generation from imports, ast_import source attribution

### Phase 7: Code Search and Integration Validation
**Goal**: Agents can search code via semantic, fulltext, and hybrid modes with rich result metadata; get_smart_context searches both documents and code_chunks tables together; and cross-table hybrid search quality is validated with realistic data
**Depends on**: Phase 5, Phase 6
**Requirements**: CSRCH-01, CSRCH-02, CSRCH-03, CSRCH-04
**Success Criteria** (what must be TRUE):
  1. An agent can call search_code with a query and receive results including file_path, symbol_name, scope_chain, content, relevance_score, start_line, and end_line for each match
  2. search_code supports language, symbol_type, and file_pattern filters that visibly narrow results
  3. An agent can call get_index_status and see total files indexed, total chunks, last index time, per-language breakdown, and stale file count
  4. A get_smart_context overview call against a project with both stored documents and indexed code returns summaries from both tables in a single response
**Plans**: 2 plans

Plans:
- [x] 07-01: search_code tool with semantic, fulltext, hybrid modes and code-specific filters
- [x] 07-02: get_index_status tool, get_smart_context cross-table extension

### Phase 8: Fix project_meta Integration Wiring
**Goal**: Seed project_meta row in init_project so last_index_at is tracked correctly, and fix index_codebase to use upsert semantics for project_meta updates
**Depends on**: Phase 2, Phase 6, Phase 7
**Requirements**: CSRCH-04 (re-verified), CODE-10 (re-verified)
**Gap Closure**: Closes INT-01 (critical), Flow 6 (Incremental Re-index / Stale Detection)
**Success Criteria** (what must be TRUE):
  1. After init_project, project_meta table contains a row with last_index_at as null (not empty table)
  2. After index_codebase, project_meta.last_index_at is set to current timestamp (upsert works regardless of existing row)
  3. get_index_status returns non-null last_index_at after an init_project -> index_codebase flow
  4. Running index_codebase twice updates (not duplicates) the project_meta row
**Plans**: 1 plan

Plans:
- [x] 08-01: Seed project_meta row in init_project, fix delete+insert upsert in index_codebase

### Phase 9: Tech Debt Documentation Cleanup
**Goal**: Fix stale requirement descriptions, missing summary frontmatter, and inaccurate tool descriptions identified by the v1 audit
**Depends on**: Phase 8
**Requirements**: Documentation accuracy (no requirement status changes)
**Gap Closure**: Closes 5 tech debt items from audit
**Success Criteria** (what must be TRUE):
  1. 03-01-SUMMARY.md includes EMBED-01, EMBED-02, EMBED-06 in requirements-completed frontmatter
  2. REQUIREMENTS.md DOC-01 description matches actual category count (12, not 17)
  3. REQUIREMENTS.md FOUND-04 description matches locked decision ("Implementation Patterns")
  4. delete_project tool description accurately reflects table count
**Plans**: 1 plan

Plans:
- [x] 09-01: Fix 03-01-SUMMARY.md frontmatter, DOC-01/FOUND-04 descriptions, delete_project table count

</details>

### 🚧 v2.0 Agentic Framework (In Progress)

**Milestone Goal:** Build a coordination layer on top of Synapse's data layer — 10 specialized agents orchestrated as a Claude Code framework (agents, skills, hooks, workflows), with decision precedent tracking, progressive task decomposition, configurable trust tiers, and hook-based authority enforcement.

**Phase Numbering (v2.0):**
Starting at Phase 10. Dependency order is strict: 10 -> 11 -> 12 -> 13 -> 14.

- [x] **Phase 10: Decision Tracking Tooling** - Add decisions table and three MCP tools (store_decision, query_decisions, check_precedent) to the Synapse server
- [x] **Phase 11: Task Hierarchy Tooling** - Add tasks table and three MCP tools (create_task, update_task, get_task_tree) with cascade status propagation
- [ ] **Phase 12: Framework Bootstrap** - Create synapse-framework repo with agents/, skills/, hooks/, workflows/, commands/, config/ directories; TOML config; Synapse MCP wiring; session lifecycle; three-layer test harness
- [ ] **Phase 13: Agent Specialization, Skill Loading, and Trust** - Define 10 agent markdown files with tool allowlists, skill registry with token budgets, and Trust-Knowledge Matrix TOML config
- [ ] **Phase 14: Quality Gates and PEV Workflow** - Implement hook-based enforcement modules and the Plan-Execute-Validate workflow with wave-based parallel execution

## Phase Details

### Phase 10: Decision Tracking Tooling
**Goal**: Agents can store architectural decisions with semantic rationale embeddings and query precedent — three new MCP tools following the existing registerXTool pattern, backed by a new decisions LanceDB table
**Depends on**: Phase 9 (v1.0 complete)
**Requirements**: DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08
**Research flag**: Standard patterns — skip research-phase
**Success Criteria** (what must be TRUE):
  1. An agent can store a decision with tier (0-3), subject, choice, rationale, and tags via store_decision and receive a decision_id back
  2. An agent can query decisions by tier, status, subject, and tags via query_decisions with results ranked by relevance
  3. An agent can call check_precedent with a proposed decision and receive a has_precedent boolean plus matching decisions with similarity scores — threshold is 0.85+
  4. init_project creates the decisions table with Arrow schema, BTree indexes, and FTS index alongside the existing tables
  5. A decision can be superseded (active -> superseded -> revoked lifecycle) and superseded decisions are excluded from precedent results by default
**Plans**: 2 plans

Plans:
- [x] 10-01: Decision schema, types, constants, init_project extension, store_decision tool (TDD)
- [x] 10-02: query_decisions + check_precedent tools, server wiring (TDD)

### Phase 11: Task Hierarchy Tooling
**Goal**: Agents can create and manage a recursive task tree (Epic/Feature/Component/Task) with cascade status propagation, dependency cycle detection, and BFS tree retrieval — three new MCP tools in the Synapse server
**Depends on**: Phase 10
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, TASK-09, TASK-10
**Research flag**: Standard patterns — skip research-phase
**Success Criteria** (what must be TRUE):
  1. An agent can create a task with parent_id, depth (0=Epic, 1=Feature, 2=Component, 3=Task), title, description, and dependencies via create_task
  2. An agent can retrieve a full task tree rooted at any epic via get_task_tree with rollup statistics (total/complete/blocked counts) — BFS traversal capped at depth 5, 200-task max
  3. Completing all children of a parent task automatically propagates "complete" status to the parent; blocking any child propagates "blocked" to the parent
  4. Creating a task with a dependency cycle (A depends on B, B depends on A) is rejected with a clear error
  5. init_project creates the tasks table and all required indexes alongside the existing tables
**Plans**: 3 plans

Plans:
- [x] 11-01: Task schema (TASKS_SCHEMA, TaskRowSchema, task-constants.ts), create_task tool with cycle detection (TDD)
- [x] 11-02: update_task, get_task_tree tools with cascade status propagation and BFS retrieval
- [x] 11-03: Gap closure — REQUIREMENTS.md updated (6 checkboxes, 6 traceability rows, TASK-04 wording corrected)

### Phase 12: Framework Bootstrap
**Goal**: The synapse-framework repo exists with the full directory structure (agents/, skills/, hooks/, workflows/, commands/, config/), TOML-based configuration, Synapse MCP wiring via Claude Code settings, work stream session lifecycle (create/resume/parallel), and a three-layer test harness (unit/integration/behavioral) with auto-recording fixtures
**Depends on**: Phase 11
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07, ORCH-08
**Architecture**: Claude Code framework (not standalone Agent SDK process). Agents, skills, hooks, and workflows are files that Claude Code loads natively. Uses Claude Code subscription. Decouple to Agent SDK possible later — orchestration logic is portable.
**Repo structure**: Three repos — synapse-server (this repo, data layer), synapse-framework (new, agent framework), synapse-example (new, demo project)
**Research flag**: Standard patterns — skip research-phase; test harness must be established here (all subsequent phases depend on it)
**Success Criteria** (what must be TRUE):
  1. The synapse-framework repo has agents/, skills/, hooks/, workflows/, commands/, config/ directories mirroring the .claude/ target layout
  2. config/synapse.toml configures the Synapse MCP server connection (db path, Ollama URL) with Claude Code settings.json as fallback
  3. Session startup auto-detects open work streams by calling get_task_tree and get_smart_context, presenting project status to the user
  4. A user can create a new work stream (natural language goal or /synapse:new-goal command), and multiple parallel work streams are supported
  5. TOML config files are validated on startup — missing or malformed config/synapse.toml, config/trust.toml, or config/secrets.toml produces a clear error
  6. Three-layer test harness works: unit tests for hooks/config (mocked, no API), integration tests against real Synapse with temp LanceDB (no API), behavioral tests with auto-recorded JSON fixtures (no API after first recording)
  7. Agent identity is passed on all Synapse tool calls — decisions and tasks track which agent performed each operation
  8. Prompt scorecards in test/scorecards/ define expected agent behaviors and score recorded outputs for regression testing
**Plans**: TBD

### Phase 13: Agent Specialization, Skill Loading, and Trust
**Goal**: All 10 specialized agents are defined as markdown files in agents/ with system prompts, allowed_tools lists, and tier assignments; the skill registry injects project-specific behavior at spawn time; and the Trust-Knowledge Matrix TOML config drives per-domain autonomy levels with configurable approval tiers
**Depends on**: Phase 12
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07, ROLE-08, ROLE-09, ROLE-10, ROLE-11, ROLE-12, ROLE-13, SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05, TRUST-06
**Research flag**: Flag for research-phase — agent prompt engineering is iterative; Trust-Knowledge Matrix TOML schema has no reference implementation
**Success Criteria** (what must be TRUE):
  1. All 10 agents (Product Strategist, Researcher, Architect, Decomposer, Plan Reviewer, Executor, Validator, Integration Checker, Debugger, Codebase Analyst) exist as markdown files in agents/ with system prompts and allowed_tools lists — loaded by Claude Code at spawn time
  2. Each agent's system prompt IS the markdown file — no separate template loading needed; Claude Code reads agent files natively
  3. The skill registry reads markdown skill files from skills/, maps project attributes to skill bundles via config/agents.toml, and injects skill content into agent context — per-agent skill budget enforced (max 2K tokens per skill, max 3 skills for Executor)
  4. Skill content hashes are validated before injection to prevent tampered skill files from executing
  5. The Trust-Knowledge Matrix in config/trust.toml defines per-domain autonomy levels (autopilot/co-pilot/advisory), a decision tier authority map per agent role, and configurable approval tiers for decomposition levels
**Plans**: TBD

### Phase 14: Quality Gates and PEV Workflow
**Goal**: Hook-based enforcement in .claude/hooks/ prevents agents from exceeding their authority; the Plan-Execute-Validate workflow orchestrates progressive decomposition with wave-based parallel execution; and the complete system can run a user goal through task decomposition, execution, and validation end-to-end with full rollback support
**Depends on**: Phase 13
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-06, GATE-07, WFLOW-01, WFLOW-02, WFLOW-03, WFLOW-04, WFLOW-05, WFLOW-06, WFLOW-07, WFLOW-08
**Research flag**: Flag for research-phase — wave controller and Claude Code Task tool parallel execution patterns have limited public implementation examples
**Success Criteria** (what must be TRUE):
  1. A PreToolUse hook in hooks/ denies any store_decision call from an agent whose permitted tier is lower than the decision tier being stored — the denial happens before the tool executes
  2. A PreToolUse hook denies any tool call not present in the calling agent's allowed_tools list from its agent definition
  3. A PostToolUse hook logs every tool call to file with timestamp, agent identity, tool name, and result summary — the hook does not block the agent
  4. Every hook callback survives being called with null or malformed input without throwing an unhandled exception — hooks degrade gracefully under any input
  5. A user can trigger the PEV workflow with a goal, watch Decomposer progressively decompose (Epic→Features validated, then Features→Tasks on demand), Executors process independent tasks in parallel waves via Claude Code Task tool, Validators check each task, and iteration 3 failure escalates to the user rather than silently looping
**Plans**: TBD

## Progress

**Execution Order:**
v1.0 complete: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 (all shipped 2026-03-01)
v2.0 in progress: 10 -> 11 -> 12 -> 13 -> 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Foundation | v1.0 | 2/2 | Complete | 2026-02-27 |
| 2. Database Schema | v1.0 | 3/3 | Complete | 2026-02-27 |
| 3. Embedding Service | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. Document Management | v1.0 | 4/4 | Complete | 2026-02-28 |
| 5. Document Search | v1.0 | 4/4 | Complete | 2026-02-28 |
| 6. Code Indexing | v1.0 | 5/5 | Complete | 2026-02-28 |
| 7. Code Search and Integration Validation | v1.0 | 2/2 | Complete | 2026-03-01 |
| 8. Fix project_meta Integration Wiring | v1.0 | 1/1 | Complete | 2026-03-01 |
| 9. Tech Debt Documentation Cleanup | v1.0 | 1/1 | Complete | 2026-03-01 |
| 10. Decision Tracking Tooling | v2.0 | Complete    | 2026-03-01 | 2026-03-01 |
| 11. Task Hierarchy Tooling | v2.0 | Complete    | 2026-03-01 | 2026-03-01 |
| 12. Framework Bootstrap | v2.0 | 0/TBD | Not started | - |
| 13. Agent Specialization, Skill Loading, and Trust | v2.0 | 0/TBD | Not started | - |
| 14. Quality Gates and PEV Workflow | v2.0 | 0/TBD | Not started | - |
