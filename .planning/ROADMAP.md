# Roadmap: Synapse

## Overview

Synapse is built in seven phases derived from its natural dependency graph. Phase 1 establishes the MCP scaffold and stdout discipline — the one pitfall that silently breaks everything if deferred. Phase 2 locks the database schema before any data touches it. Phase 3 builds the shared embedding service that both document and code write paths depend on. Phase 4 delivers all document management tools and relationship linking. Phase 5 delivers all search capabilities including two-phase smart context assembly. Phase 6 delivers the code indexing pipeline. Phase 7 delivers code search and validates the cross-table integration that makes Synapse a unified project brain rather than two separate tools.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: MCP Foundation** - Scaffold stdio MCP server with stderr-only logging discipline before any business logic is written
- [ ] **Phase 2: Database Schema** - Define and freeze all 5 LanceDB table schemas with v2 forward-compatibility fields before any data is written
- [ ] **Phase 3: Embedding Service** - Build the shared Ollama embedding service with fail-fast on writes, dimension assertion, and startup health check
- [ ] **Phase 4: Document Management** - Implement all 9 document tools with versioning, lifecycle, relationships, and activity logging
- [ ] **Phase 5: Document Search** - Implement hybrid search (RRF), semantic search, FTS, and two-phase smart context assembly
- [ ] **Phase 6: Code Indexing** - Build AST-aware tree-sitter indexing pipeline with incremental hashing and auto-relationship generation
- [ ] **Phase 7: Code Search and Integration Validation** - Implement code search tools and validate cross-table unified search end-to-end

## Phase Details

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
  - [ ] 01-01-PLAN.md — Project scaffolding, config loader, logger, shared types
  - [ ] 01-02-PLAN.md — MCP server with stdio transport, ping/echo tools, stdout smoke test

### Phase 2: Database Schema
**Goal**: All 5 LanceDB tables exist with complete Arrow schemas — including v2 forward-compatibility fields — and the batched insert pattern is established before any data is written
**Depends on**: Phase 1
**Requirements**: FOUND-03, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. init_project creates all 5 tables (documents, code_chunks, relationships, project_meta, activity_log) with correct schemas and indexes
  2. Every table includes a project_id column with BTree index for multi-project query scoping
  3. Documents table includes v2 forward-compatibility fields (parent_id, depth, decision_type) as nullable columns
  4. Re-running init_project on an existing database does not overwrite data (idempotent)
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

### Phase 7: Code Search and Integration Validation
**Goal**: Agents can search code via semantic, fulltext, and hybrid modes with rich result metadata; get_smart_context searches both documents and code_chunks tables together; and cross-table hybrid search quality is validated with realistic data
**Depends on**: Phase 5, Phase 6
**Requirements**: CSRCH-01, CSRCH-02, CSRCH-03, CSRCH-04
**Success Criteria** (what must be TRUE):
  1. An agent can call search_code with a query and receive results including file_path, symbol_name, scope_chain, content, relevance_score, start_line, and end_line for each match
  2. search_code supports language, symbol_type, and file_pattern filters that visibly narrow results
  3. An agent can call get_index_status and see total files indexed, total chunks, last index time, per-language breakdown, and stale file count
  4. A get_smart_context overview call against a project with both stored documents and indexed code returns summaries from both tables in a single response
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7
Note: Phase 6 depends on Phase 3 (not Phase 5), so Phases 5 and 6 could run in parallel if desired — but sequential execution is the default.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MCP Foundation | 1/2 | In Progress|  |
| 2. Database Schema | 0/TBD | Not started | - |
| 3. Embedding Service | 0/TBD | Not started | - |
| 4. Document Management | 0/TBD | Not started | - |
| 5. Document Search | 0/TBD | Not started | - |
| 6. Code Indexing | 0/TBD | Not started | - |
| 7. Code Search and Integration Validation | 0/TBD | Not started | - |
