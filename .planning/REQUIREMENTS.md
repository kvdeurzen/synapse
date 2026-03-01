# Requirements: Synapse

**Defined:** 2026-02-27
**Updated:** 2026-03-01 (v2.0 pivoted to Claude Code framework — 65 requirements mapped)
**Core Value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The framework (built on Claude Code) ensures agents respect established decisions, decompose work progressively, and operate within configurable trust boundaries.

## v1.0 Requirements (Complete)

All 50 requirements shipped and verified. See traceability section for phase mapping.

<details>
<summary>v1.0 requirements (all complete)</summary>

### Foundation

- [x] **FOUND-01**: Server starts via stdio transport and connects to MCP clients (Claude Code, Cursor)
- [x] **FOUND-02**: Server accepts --db path CLI arg and OLLAMA_URL, EMBED_MODEL, SYNAPSE_DB_PATH env vars
- [x] **FOUND-03**: init_project creates LanceDB database with 5 tables (documents, code_chunks, relationships, project_meta, activity_log) and all indexes
- [x] **FOUND-04**: init_project seeds starter documents (project charter, ADR log template, implementation patterns, glossary)
- [x] **FOUND-05**: All queries are scoped by project_id for multi-project support
- [x] **FOUND-06**: Schema includes v2 forward-compatibility fields (parent_id, depth, decision_type) on documents table
- [x] **FOUND-07**: All logging goes to stderr only — no stdout contamination of MCP JSON-RPC stream

### Embedding Service

- [x] **EMBED-01**: Embedding service calls Ollama /api/embed with nomic-embed-text model (768 dimensions)
- [x] **EMBED-02**: Embedding service supports single and batch embedding
- [x] **EMBED-03**: Write operations (store_document, index_codebase) fail fast with clear error when Ollama is unreachable
- [x] **EMBED-04**: Read operations (semantic_search, search_code, query_documents) continue working without Ollama
- [x] **EMBED-05**: Non-blocking health check on startup logs warning if Ollama is down but server starts anyway
- [x] **EMBED-06**: Embedding dimension assertion prevents inserting vectors with wrong dimensions

### Document Management

- [x] **DOC-01**: User can store a document with title, content, category (12 types), and optional metadata via store_document
- [x] **DOC-02**: Documents are chunked at write time using category-specific strategies (semantic_section, paragraph, fixed_size) with configurable max size and overlap
- [x] **DOC-03**: Each chunk is prefixed with context header ("Document: {title} | Section: {header}") before embedding
- [x] **DOC-04**: store_document with existing doc_id creates new version (version + 1) and marks old chunks as superseded
- [x] **DOC-05**: User can query documents by category, phase, tags, status, and priority filters via query_documents
- [x] **DOC-06**: User can update document metadata (status, phase, tags, priority) without re-embedding via update_document
- [x] **DOC-07**: User can soft-delete (archive) or hard-delete documents via delete_document
- [x] **DOC-08**: project_overview returns document counts by category/status/phase, recent activity, and key documents (priority >= 4)
- [x] **DOC-09**: Documents follow lifecycle states: draft -> active -> approved, with superseded and archived transitions
- [x] **DOC-10**: Carry-forward categories (architecture_decision, design_pattern, glossary, code_pattern, dependency) are never auto-archived
- [x] **DOC-11**: All mutations are logged to activity_log with actor, action, and timestamp
- [x] **DOC-12**: store_document returns doc_id, chunk_count, version, and token_estimate

### Search

- [x] **SRCH-01**: User can run semantic search across documents with optional category, phase, tags, status filters and min_relevance threshold
- [x] **SRCH-02**: User can run full-text search across documents
- [x] **SRCH-03**: Hybrid search merges semantic and FTS results via Reciprocal Rank Fusion (k=60)
- [x] **SRCH-04**: get_smart_context overview phase returns summaries (~100 tokens each) from both documents and code_chunks tables (~2-4k tokens total)
- [x] **SRCH-05**: get_smart_context detailed phase fetches full content for agent-specified doc_ids with 1-hop relationship traversal
- [x] **SRCH-06**: get_smart_context respects max_tokens budget and truncates results to fit
- [x] **SRCH-07**: Search results include relevance scores and source attribution

### Relationships & Graph

- [x] **GRAPH-01**: User can create manual relationships between documents via link_documents with type (implements, depends_on, supersedes, references, contradicts, child_of, related_to)
- [x] **GRAPH-02**: link_documents supports bidirectional relationship creation
- [x] **GRAPH-03**: 1-hop graph traversal surfaces related documents when fetching context
- [x] **GRAPH-04**: Relationships track source attribution (manual vs ast_import) for distinguishing human-created from auto-generated edges

### Code Indexing

- [x] **CODE-01**: index_codebase scans project directory for .ts, .tsx, .py, .rs files respecting .gitignore patterns
- [x] **CODE-02**: Files are parsed with tree-sitter to extract AST-aware chunks at function/class/method/interface/type boundaries
- [x] **CODE-03**: Each code chunk includes symbol_name, symbol_type, scope_chain, imports, and exports metadata
- [x] **CODE-04**: Code chunks are prefixed with context header ("File: {path} | {symbol_type}: {scope_chain}") before embedding
- [x] **CODE-05**: Incremental indexing compares SHA-256 file hashes and only re-indexes changed files
- [x] **CODE-06**: Deleted files have their code_chunks and auto-generated relationships removed
- [x] **CODE-07**: Import/use statements are parsed to auto-generate depends_on relationships between files
- [x] **CODE-08**: Auto-generated relationships (source: "ast_import") are replaced on re-index to stay fresh
- [x] **CODE-09**: index_codebase returns files_scanned, files_indexed, chunks_created, skipped_unchanged counts
- [x] **CODE-10**: TypeScript, Python, and Rust languages are supported with appropriate tree-sitter grammars

### Code Search

- [x] **CSRCH-01**: User can search code via search_code with query, language, symbol_type, and file_pattern filters
- [x] **CSRCH-02**: Code search supports semantic, fulltext, and hybrid (RRF) search modes
- [x] **CSRCH-03**: Code search results include file_path, symbol_name, scope_chain, content, relevance_score, start_line, end_line
- [x] **CSRCH-04**: get_index_status returns total files indexed, total chunks, last index time, languages breakdown, stale files count

</details>

## v2.0 Requirements

Requirements for the Agentic Framework milestone. Each maps to roadmap phases 10-14.

### Decision Tracking (DEC)

- [x] **DEC-01**: Agent can store a decision with tier (0-3), subject, choice, rationale, and tags via store_decision
- [x] **DEC-02**: Decision rationale is embedded as a 768-dim vector for semantic precedent search
- [ ] **DEC-03**: Agent can query decisions by tier, status, subject, tags, and precedent flag via query_decisions
- [ ] **DEC-04**: Agent can check if a similar precedent exists via check_precedent with 0.85+ similarity threshold and decision_type pre-filtering
- [x] **DEC-05**: Decisions follow lifecycle: active -> superseded -> revoked
- [x] **DEC-06**: init_project creates the decisions table with Arrow schema, BTree indexes, and FTS index
- [x] **DEC-07**: All decision mutations are logged to activity_log
- [ ] **DEC-08**: check_precedent returns has_precedent boolean plus matching decisions with similarity scores

### Task Hierarchy (TASK)

- [x] **TASK-01**: Agent can create a task with parent_id, depth (0-3), title, description, and dependencies via create_task
- [x] **TASK-02**: Task tree supports 4 depth levels: Epic (0), Feature (1), Component (2), Task (3)
- [x] **TASK-03**: Agent can update task status, assigned_agent, priority, and other fields via update_task
- [x] **TASK-04**: Cascade status propagation: children_all_done signal computed at read time in get_task_tree rollup; no automatic parent status transitions; is_blocked does not cascade upward to parents
- [x] **TASK-05**: Agent can retrieve full task tree via get_task_tree with rollup statistics (total/complete/blocked counts)
- [x] **TASK-06**: get_task_tree uses JS-side BFS with root_id denormalization (max depth 5, 200-task cap)
- [x] **TASK-07**: Dependency cycles are detected and rejected on create_task and update_task
- [x] **TASK-08**: init_project creates the tasks table with Arrow schema and indexes
- [x] **TASK-09**: All task mutations are logged to activity_log
- [x] **TASK-10**: Task description is embedded as a 768-dim vector for semantic search

### Orchestrator Foundation (ORCH)

- [ ] **ORCH-01**: Framework repo (synapse-framework) has agents/, skills/, hooks/, workflows/, commands/, config/ directories mirroring .claude/ target layout
- [ ] **ORCH-02**: Synapse MCP server connection configured in config/synapse.toml with Claude Code settings.json as fallback
- [ ] **ORCH-03**: Session startup auto-detects open work streams via Synapse get_task_tree and get_smart_context, presenting project status
- [ ] **ORCH-04**: Work stream lifecycle: create new (natural language or /synapse:new-goal), resume existing, multiple parallel streams supported
- [ ] **ORCH-05**: TOML config files validated on startup — missing or malformed config produces clear error
- [ ] **ORCH-06**: Three-layer test harness: unit (hooks/config), integration (Synapse MCP with temp LanceDB), behavioral (auto-recorded JSON fixtures committed to git)
- [ ] **ORCH-07**: Full attribution — agent identity passed on all Synapse tool calls (decisions, tasks, activity log)
- [ ] **ORCH-08**: Prompt scorecards in test/scorecards/ define expected agent behaviors and score recorded outputs for regression testing

### Agent Specialization (ROLE)

- [ ] **ROLE-01**: 10 agent roles defined as markdown files in agents/ with system prompts and allowed_tools lists
- [ ] **ROLE-02**: Product Strategist (opus) handles Tier 0 decisions with mandatory user approval
- [ ] **ROLE-03**: Researcher (sonnet) is read-only — allowed_tools excludes state-modifying tools
- [ ] **ROLE-04**: Architect (opus) handles Tier 1-2 decisions and creates epic-level task structure
- [ ] **ROLE-05**: Decomposer (opus) breaks epics into executable leaf tasks within context window limits
- [ ] **ROLE-06**: Plan Reviewer (opus) verifies task plans against decisions before execution begins
- [ ] **ROLE-07**: Executor (sonnet) implements leaf tasks, constrained to Tier 3 decisions only
- [ ] **ROLE-08**: Validator (sonnet) checks completed tasks against specs and relevant decisions
- [ ] **ROLE-09**: Integration Checker (sonnet) validates cross-task integration at feature/epic boundaries
- [ ] **ROLE-10**: Debugger (sonnet) performs root-cause analysis on execution and validation failures
- [ ] **ROLE-11**: Codebase Analyst (sonnet) maintains codebase analysis via index_codebase and store_document
- [ ] **ROLE-12**: Agent allowed_tools lists enforced via hooks — no agent can call tools outside its definition
- [ ] **ROLE-13**: Agent markdown files ARE the system prompts — Claude Code loads them natively at spawn time

### Skill Loading (SKILL)

- [ ] **SKILL-01**: Skill registry in config/agents.toml maps project attributes (tech stack, domain) to skill bundles
- [ ] **SKILL-02**: Skills are markdown files in skills/ containing domain knowledge, quality criteria, and vocabulary
- [ ] **SKILL-03**: Skills are injected into agent context at spawn time via Claude Code's agent loading mechanism
- [ ] **SKILL-04**: Progressive skill loading: skill names in agent definition, full body loaded on demand
- [ ] **SKILL-05**: Per-agent skill budget enforced (max 2K tokens per skill, max 3 skills for Executor)
- [ ] **SKILL-06**: Skill content hash validated before injection to prevent tampering

### Trust & Authority (TRUST)

- [ ] **TRUST-01**: Trust-Knowledge Matrix stored as TOML config file (config/trust.toml)
- [ ] **TRUST-02**: Per-domain autonomy levels: autopilot (agent decides), co-pilot (agent proposes, user approves), advisory (agent suggests, user decides)
- [ ] **TRUST-03**: Tier 0 (Product Strategy) decisions always require user approval regardless of trust config
- [ ] **TRUST-04**: Trust config drives hook decisions: autopilot -> allow, co-pilot -> ask, advisory -> ask with explanation
- [ ] **TRUST-05**: Decision tier authority matrix maps each agent role to its permitted decision tiers
- [ ] **TRUST-06**: Configurable approval tiers for decomposition levels (advisory: approve all levels, co-pilot: approve epics only, autopilot: fully autonomous)

### Quality Gates (GATE)

- [ ] **GATE-01**: PreToolUse hook in hooks/ enforces tier authority — agents cannot store decisions above their permitted tier
- [ ] **GATE-02**: PreToolUse hook enforces tool allowlists — agents can only call tools in their agent definition's allowed_tools
- [ ] **GATE-03**: PreToolUse precedent-gate injects "check precedent first" context before decision storage
- [ ] **GATE-04**: PreToolUse user-approval hook returns "ask" for Tier 0 decisions
- [ ] **GATE-05**: PostToolUse audit hook logs all tool calls to file with timestamp, agent, tool, and result summary
- [ ] **GATE-06**: Every hook callback wrapped in top-level try/catch — hooks degrade gracefully under any input
- [ ] **GATE-07**: Hook ordering is tested: deny takes priority over ask over allow

### PEV Workflow (WFLOW)

- [ ] **WFLOW-01**: Plan-Execute-Validate workflow in workflows/ orchestrates Decomposer -> Executor -> Validator sequence
- [ ] **WFLOW-02**: PEV loop capped at 3 iterations; iteration 3 failure escalates to user
- [ ] **WFLOW-03**: Wave-based parallel execution: independent leaf tasks in the same wave execute concurrently via Claude Code Task tool
- [ ] **WFLOW-04**: Wave N+1 starts only after all tasks in wave N are validated complete
- [ ] **WFLOW-05**: Executor failures trigger Debugger agent for root-cause analysis before retry
- [ ] **WFLOW-06**: Decomposer <-> Plan Reviewer verification loop (max 3 iterations) gates execution start
- [ ] **WFLOW-07**: Progressive decomposition: Epic->Features validated for completeness before execution, Features->Tasks decomposed on demand when feature starts
- [ ] **WFLOW-08**: Full rollback support: tasks can be reopened and associated code changes reverted via git

## Future Requirements

Deferred beyond v2.0. Tracked but not in current roadmap.

### Progressive Verification (P2)

- **PVER-01**: Progressive verification at epic granularity (Integration Checker after related features complete)
- **PVER-02**: Progressive verification at project granularity (full Integration Check at milestone boundaries)
- **PVER-03**: SubagentStop hook wired to verification pipeline trigger

### Extended Features

- **EXT-01**: Additional language support (Go, Java, C++, C#)
- **EXT-02**: Export documents to markdown
- **EXT-03**: Import documents from markdown
- **EXT-04**: Batch store operations
- **EXT-05**: GSD/BMad import tools
- **EXT-06**: MCP resources and prompt templates
- **EXT-07**: ConfigChange hook for hot-reload of Trust-Knowledge Matrix without restart
- **EXT-08**: Decision enforcement in Plan Review phase (Plan Reviewer auto-calls check_precedent)

## Out of Scope

| Feature | Reason |
|---------|--------|
| ML-based preference learning | No training signal until significant post-usage data exists; explicit config is more predictable |
| Multi-user/collaborative orchestration | Requires session isolation, conflict resolution; single-user is sufficient for v2.0 |
| Dynamic agent spawning based on task analysis | Unnecessary complexity; 10 well-defined roles cover the workflow |
| Agents deciding their own tool permissions | Safety non-negotiable; hook enforcement is the correct model |
| Web UI or monitoring dashboard | CLI/MCP interface only; activity_log queryable via existing MCP tools |
| Cloud deployment / hosted service | Local-first; local Ollama + local LanceDB |
| HTTP/SSE transport | Stdio is standard for Claude Code; adds auth complexity with zero benefit |
| Multiple embedding providers | Mixing embedding spaces fractures vector search |
| Standalone Agent SDK orchestrator | Claude Code framework chosen over standalone process; Agent SDK decouple is a future option |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 (all Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-07 | Phase 1 | Complete |
| FOUND-03 | Phase 2 | Complete |
| FOUND-05 | Phase 2 | Complete |
| FOUND-06 | Phase 2 | Complete |
| EMBED-01 | Phase 3 | Complete |
| EMBED-02 | Phase 3 | Complete |
| EMBED-03 | Phase 3 | Complete |
| EMBED-04 | Phase 3 | Complete |
| EMBED-05 | Phase 3 | Complete |
| EMBED-06 | Phase 3 | Complete |
| FOUND-04 | Phase 4 | Complete |
| DOC-01 | Phase 4 | Complete |
| DOC-02 | Phase 4 | Complete |
| DOC-03 | Phase 4 | Complete |
| DOC-04 | Phase 4 | Complete |
| DOC-05 | Phase 4 | Complete |
| DOC-06 | Phase 4 | Complete |
| DOC-07 | Phase 4 | Complete |
| DOC-08 | Phase 4 | Complete |
| DOC-09 | Phase 4 | Complete |
| DOC-10 | Phase 4 | Complete |
| DOC-11 | Phase 4 | Complete |
| DOC-12 | Phase 4 | Complete |
| GRAPH-01 | Phase 4 | Complete |
| GRAPH-02 | Phase 4 | Complete |
| GRAPH-03 | Phase 4 | Complete |
| GRAPH-04 | Phase 4 | Complete |
| SRCH-01 | Phase 5 | Complete |
| SRCH-02 | Phase 5 | Complete |
| SRCH-03 | Phase 5 | Complete |
| SRCH-04 | Phase 5 | Complete |
| SRCH-05 | Phase 5 | Complete |
| SRCH-06 | Phase 5 | Complete |
| SRCH-07 | Phase 5 | Complete |
| CODE-01 | Phase 6 | Complete |
| CODE-02 | Phase 6 | Complete |
| CODE-03 | Phase 6 | Complete |
| CODE-04 | Phase 6 | Complete |
| CODE-05 | Phase 6 | Complete |
| CODE-06 | Phase 6 | Complete |
| CODE-07 | Phase 6 | Complete |
| CODE-08 | Phase 6 | Complete |
| CODE-09 | Phase 6 | Complete |
| CODE-10 | Phase 6 | Complete |
| CSRCH-01 | Phase 7 | Complete |
| CSRCH-02 | Phase 7 | Complete |
| CSRCH-03 | Phase 7 | Complete |
| CSRCH-04 | Phase 7 | Complete |

### v2.0 (Pending)

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEC-01 | Phase 10 | Complete |
| DEC-02 | Phase 10 | Complete |
| DEC-03 | Phase 10 | Pending |
| DEC-04 | Phase 10 | Pending |
| DEC-05 | Phase 10 | Complete |
| DEC-06 | Phase 10 | Complete |
| DEC-07 | Phase 10 | Complete |
| DEC-08 | Phase 10 | Pending |
| TASK-01 | Phase 11 | Complete |
| TASK-02 | Phase 11 | Complete |
| TASK-03 | Phase 11 | Complete |
| TASK-04 | Phase 11 | Complete |
| TASK-05 | Phase 11 | Complete |
| TASK-06 | Phase 11 | Complete |
| TASK-07 | Phase 11 | Complete |
| TASK-08 | Phase 11 | Complete |
| TASK-09 | Phase 11 | Complete |
| TASK-10 | Phase 11 | Complete |
| ORCH-01 | Phase 12 | Pending |
| ORCH-02 | Phase 12 | Pending |
| ORCH-03 | Phase 12 | Pending |
| ORCH-04 | Phase 12 | Pending |
| ORCH-05 | Phase 12 | Pending |
| ORCH-06 | Phase 12 | Pending |
| ORCH-07 | Phase 12 | Pending |
| ORCH-08 | Phase 12 | Pending |
| ROLE-01 | Phase 13 | Pending |
| ROLE-02 | Phase 13 | Pending |
| ROLE-03 | Phase 13 | Pending |
| ROLE-04 | Phase 13 | Pending |
| ROLE-05 | Phase 13 | Pending |
| ROLE-06 | Phase 13 | Pending |
| ROLE-07 | Phase 13 | Pending |
| ROLE-08 | Phase 13 | Pending |
| ROLE-09 | Phase 13 | Pending |
| ROLE-10 | Phase 13 | Pending |
| ROLE-11 | Phase 13 | Pending |
| ROLE-12 | Phase 13 | Pending |
| ROLE-13 | Phase 13 | Pending |
| SKILL-01 | Phase 13 | Pending |
| SKILL-02 | Phase 13 | Pending |
| SKILL-03 | Phase 13 | Pending |
| SKILL-04 | Phase 13 | Pending |
| SKILL-05 | Phase 13 | Pending |
| SKILL-06 | Phase 13 | Pending |
| TRUST-01 | Phase 13 | Pending |
| TRUST-02 | Phase 13 | Pending |
| TRUST-03 | Phase 13 | Pending |
| TRUST-04 | Phase 13 | Pending |
| TRUST-05 | Phase 13 | Pending |
| TRUST-06 | Phase 13 | Pending |
| GATE-01 | Phase 14 | Pending |
| GATE-02 | Phase 14 | Pending |
| GATE-03 | Phase 14 | Pending |
| GATE-04 | Phase 14 | Pending |
| GATE-05 | Phase 14 | Pending |
| GATE-06 | Phase 14 | Pending |
| GATE-07 | Phase 14 | Pending |
| WFLOW-01 | Phase 14 | Pending |
| WFLOW-02 | Phase 14 | Pending |
| WFLOW-03 | Phase 14 | Pending |
| WFLOW-04 | Phase 14 | Pending |
| WFLOW-05 | Phase 14 | Pending |
| WFLOW-06 | Phase 14 | Pending |
| WFLOW-07 | Phase 14 | Pending |
| WFLOW-08 | Phase 14 | Pending |

**Coverage:**
- v1.0 requirements: 50 total — 50 complete
- v2.0 requirements: 65 total (was 61, added ORCH-07, ORCH-08, TRUST-06, WFLOW-07, WFLOW-08)
- Mapped to phases: 65 (100% coverage)
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-03-01 — v2.0 pivoted to Claude Code framework, 65 requirements mapped to Phases 10-14*
