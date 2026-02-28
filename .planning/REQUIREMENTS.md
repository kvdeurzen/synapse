# Requirements: Synapse

**Defined:** 2026-02-27
**Core Value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Server starts via stdio transport and connects to MCP clients (Claude Code, Cursor)
- [x] **FOUND-02**: Server accepts --db path CLI arg and OLLAMA_URL, EMBED_MODEL, SYNAPSE_DB_PATH env vars
- [x] **FOUND-03**: init_project creates LanceDB database with 5 tables (documents, code_chunks, relationships, project_meta, activity_log) and all indexes
- [ ] **FOUND-04**: init_project seeds starter documents (project charter, ADR log template, coding guidelines, glossary)
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

- [ ] **DOC-01**: User can store a document with title, content, category (17 types), and optional metadata via store_document
- [x] **DOC-02**: Documents are chunked at write time using category-specific strategies (semantic_section, paragraph, fixed_size) with configurable max size and overlap
- [x] **DOC-03**: Each chunk is prefixed with context header ("Document: {title} | Section: {header}") before embedding
- [ ] **DOC-04**: store_document with existing doc_id creates new version (version + 1) and marks old chunks as superseded
- [ ] **DOC-05**: User can query documents by category, phase, tags, status, and priority filters via query_documents
- [ ] **DOC-06**: User can update document metadata (status, phase, tags, priority) without re-embedding via update_document
- [ ] **DOC-07**: User can soft-delete (archive) or hard-delete documents via delete_document
- [ ] **DOC-08**: project_overview returns document counts by category/status/phase, recent activity, and key documents (priority >= 4)
- [ ] **DOC-09**: Documents follow lifecycle states: draft → active → approved, with superseded and archived transitions
- [ ] **DOC-10**: Carry-forward categories (architecture_decision, design_pattern, glossary, code_pattern, dependency) are never auto-archived
- [x] **DOC-11**: All mutations are logged to activity_log with actor, action, and timestamp
- [ ] **DOC-12**: store_document returns doc_id, chunk_count, version, and token_estimate

### Search

- [ ] **SRCH-01**: User can run semantic search across documents with optional category, phase, tags, status filters and min_relevance threshold
- [ ] **SRCH-02**: User can run full-text search across documents
- [ ] **SRCH-03**: Hybrid search merges semantic and FTS results via Reciprocal Rank Fusion (k=60)
- [ ] **SRCH-04**: get_smart_context overview phase returns summaries (~100 tokens each) from both documents and code_chunks tables (~2-4k tokens total)
- [ ] **SRCH-05**: get_smart_context detailed phase fetches full content for agent-specified doc_ids with 1-hop relationship traversal
- [ ] **SRCH-06**: get_smart_context respects max_tokens budget and truncates results to fit
- [ ] **SRCH-07**: Search results include relevance scores and source attribution

### Relationships & Graph

- [ ] **GRAPH-01**: User can create manual relationships between documents via link_documents with type (implements, depends_on, supersedes, references, contradicts, child_of, related_to)
- [ ] **GRAPH-02**: link_documents supports bidirectional relationship creation
- [ ] **GRAPH-03**: 1-hop graph traversal surfaces related documents when fetching context
- [ ] **GRAPH-04**: Relationships track source attribution (manual vs ast_import) for distinguishing human-created from auto-generated edges

### Code Indexing

- [ ] **CODE-01**: index_codebase scans project directory for .ts, .tsx, .py, .rs files respecting .gitignore patterns
- [ ] **CODE-02**: Files are parsed with tree-sitter to extract AST-aware chunks at function/class/method/interface/type boundaries
- [ ] **CODE-03**: Each code chunk includes symbol_name, symbol_type, scope_chain, imports, and exports metadata
- [ ] **CODE-04**: Code chunks are prefixed with context header ("File: {path} | {symbol_type}: {scope_chain}") before embedding
- [ ] **CODE-05**: Incremental indexing compares SHA-256 file hashes and only re-indexes changed files
- [ ] **CODE-06**: Deleted files have their code_chunks and auto-generated relationships removed
- [ ] **CODE-07**: Import/use statements are parsed to auto-generate depends_on relationships between files
- [ ] **CODE-08**: Auto-generated relationships (source: "ast_import") are replaced on re-index to stay fresh
- [ ] **CODE-09**: index_codebase returns files_scanned, files_indexed, chunks_created, skipped_unchanged counts
- [ ] **CODE-10**: TypeScript, Python, and Rust languages are supported with appropriate tree-sitter grammars

### Code Search

- [ ] **CSRCH-01**: User can search code via search_code with query, language, symbol_type, and file_pattern filters
- [ ] **CSRCH-02**: Code search supports semantic, fulltext, and hybrid (RRF) search modes
- [ ] **CSRCH-03**: Code search results include file_path, symbol_name, scope_chain, content, relevance_score, start_line, end_line
- [ ] **CSRCH-04**: get_index_status returns total files indexed, total chunks, last index time, languages breakdown, stale files count

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Agentic Workflow

- **AGENT-01**: Task decomposition system (understand → scope → plan → subdivide → execute → validate)
- **AGENT-02**: Agent role profiles with per-role context assembly and token budgets
- **AGENT-03**: User preference learning (style preferences + architectural patterns)
- **AGENT-04**: Decision threshold system (auto-resolve low-impact, involve user on new decisions with suggestions/pros/cons)
- **AGENT-05**: Three-layer validation pipeline (automated tests, parent agent review, user checkpoints)
- **AGENT-06**: Slash commands and phase management workflow

### Extended Features

- **EXT-01**: Additional language support (Go, Java, C++, C#)
- **EXT-02**: Export documents to markdown
- **EXT-03**: Import documents from markdown
- **EXT-04**: Batch store operations
- **EXT-05**: GSD/BMad import tools
- **EXT-06**: MCP resources and prompt templates

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTP/SSE transport | Adds auth complexity and security surface with zero benefit for local dev; stdio is standard |
| Multiple embedding providers | Mixing embedding spaces fractures vector search; fail-fast on Ollama is intentional |
| Automatic context injection (push model) | Forces context on agents; two-phase pull model is better |
| Multi-hop graph traversal (>1 hop) | Exponential blowup; agent can call again to go deeper |
| Real-time file watching / auto-index | Background processes cause orphaned process bugs; explicit index_codebase is safer |
| Cross-encoder reranking | Additional model inference latency exceeds benefit at v1 scale; RRF is sufficient |
| 20+ language support | TS/Python/Rust covers target users; add languages based on demand |
| Mobile/web client | MCP server is a dev tool; stdio transport only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

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
| FOUND-04 | Phase 4 | Pending |
| DOC-01 | Phase 4 | Pending |
| DOC-02 | Phase 4 | Complete |
| DOC-03 | Phase 4 | Complete |
| DOC-04 | Phase 4 | Pending |
| DOC-05 | Phase 4 | Pending |
| DOC-06 | Phase 4 | Pending |
| DOC-07 | Phase 4 | Pending |
| DOC-08 | Phase 4 | Pending |
| DOC-09 | Phase 4 | Pending |
| DOC-10 | Phase 4 | Pending |
| DOC-11 | Phase 4 | Complete |
| DOC-12 | Phase 4 | Pending |
| GRAPH-01 | Phase 4 | Pending |
| GRAPH-02 | Phase 4 | Pending |
| GRAPH-03 | Phase 4 | Pending |
| GRAPH-04 | Phase 4 | Pending |
| SRCH-01 | Phase 5 | Pending |
| SRCH-02 | Phase 5 | Pending |
| SRCH-03 | Phase 5 | Pending |
| SRCH-04 | Phase 5 | Pending |
| SRCH-05 | Phase 5 | Pending |
| SRCH-06 | Phase 5 | Pending |
| SRCH-07 | Phase 5 | Pending |
| CODE-01 | Phase 6 | Pending |
| CODE-02 | Phase 6 | Pending |
| CODE-03 | Phase 6 | Pending |
| CODE-04 | Phase 6 | Pending |
| CODE-05 | Phase 6 | Pending |
| CODE-06 | Phase 6 | Pending |
| CODE-07 | Phase 6 | Pending |
| CODE-08 | Phase 6 | Pending |
| CODE-09 | Phase 6 | Pending |
| CODE-10 | Phase 6 | Pending |
| CSRCH-01 | Phase 7 | Pending |
| CSRCH-02 | Phase 7 | Pending |
| CSRCH-03 | Phase 7 | Pending |
| CSRCH-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 — Traceability updated after roadmap creation*
