# Architecture

**Analysis Date:** 2026-02-27

## Pattern Overview

**Overall:** MCP Server with Database-Backed Knowledge and Code Search

**Key Characteristics:**
- Multi-layer separation: MCP tools, business logic, database, external services
- Event-driven document lifecycle with versioning and status tracking
- Dual-table indexing: documents (project knowledge) and code_chunks (source code)
- Hybrid search combining semantic (vector) and full-text search via Reciprocal Rank Fusion
- Incremental code indexing using file hashing for efficiency
- Auto-generated relationships from AST-parsed imports for self-maintaining knowledge graph

## Layers

**MCP Tools Layer:**
- Purpose: Expose project knowledge and code search capabilities via Model Context Protocol
- Location: `src/tools/`
- Contains: 11 tool implementations (store_document, query_documents, semantic_search, search_code, etc.)
- Depends on: Core business logic (chunking, embeddings, search, indexing)
- Used by: Claude Code and other AI agents via stdio transport

**Business Logic Layer:**
- Purpose: Orchestrate core operations (document chunking, code indexing, hybrid search, relationship management)
- Location: `src/chunking/`, `src/code/`, `src/query/`
- Contains: Chunking strategies, AST-aware code parsing, search algorithms, graph traversal
- Depends on: Database layer, embedding service, language support
- Used by: MCP tools, server initialization

**Database Layer:**
- Purpose: Persistent storage of documents, code chunks, relationships, project metadata, activity logs
- Location: `src/db/`
- Contains: LanceDB connection management, Arrow schema definitions for 5 tables
- Depends on: Apache Arrow, LanceDB libraries
- Used by: All business logic and tools

**Embedding Service Layer:**
- Purpose: Convert text and code to vector embeddings for semantic search
- Location: `src/embeddings/`
- Contains: Ollama provider with fail-fast strategy, health checks, batch embedding
- Depends on: External Ollama service (nomic-embed-text model, 768 dimensions)
- Used by: Document storage, code indexing, semantic search operations

**Server Layer:**
- Purpose: MCP server setup, tool registration, stdio transport
- Location: `src/server.ts`, `src/index.ts`
- Contains: McpServer initialization, tool registration, CLI argument parsing, environment configuration
- Depends on: All other layers, @modelcontextprotocol/sdk
- Used by: Claude Code and other MCP clients

**Type System:**
- Purpose: Type-safe definitions for all domain entities
- Location: `src/types/`
- Contains: DocumentRow, CodeChunkRow, RelationshipRow, ProjectMetaRow, ActivityLogRow, enums for categories/phases/status
- Depends on: Zod for schema validation
- Used by: All layers for type safety and validation

## Data Flow

**Document Storage and Retrieval:**

1. Agent calls `store_document` with title, content, category, metadata
2. Chunking dispatcher (`src/chunking/chunker.ts`) selects strategy based on category
3. Content split into chunks with overlap as per category-specific config (semantic_section, paragraph, or fixed_size)
4. Each chunk prefixed with context header: `"Document: {title} | Section: {header}\n"`
5. Embedding service embeds each chunk via Ollama (batch if multiple)
6. Chunks inserted into documents table with vector, metadata, versioning info
7. Activity logged to activity_log table
8. Returns `{ doc_id, chunk_count, version, token_estimate }`

**Code Indexing:**

1. Agent calls `index_codebase` with optional root_path, include/exclude patterns
2. File scanner recursively discovers .ts, .tsx, .py, .rs files respecting .gitignore
3. For each file:
   - Compare SHA-256 hash against stored hash in project_meta
   - If unchanged, skip (incremental indexing)
   - If changed/new: parse with tree-sitter to extract AST
4. AST walker extracts semantic chunks at function/class/method boundaries
5. Each chunk enriched with symbol_name, symbol_type, scope_chain, imports, exports
6. Context header prepended: `"File: {path} | {symbol_type}: {scope_chain}\nImports: {imports}\n"`
7. Each chunk embedded via Ollama
8. Chunks inserted into code_chunks table with language, line numbers, file_path
9. Import statements parsed and auto-relationships created:
   - TypeScript: relative import resolution
   - Python: module path resolution
   - Rust: crate::, super::, self:: resolution
10. Old auto-generated relationships (source: "ast_import") replaced with fresh ones
11. Returns `{ files_scanned, files_indexed, chunks_created, skipped_unchanged }`

**Semantic Search:**

1. Agent calls `semantic_search` with query, optional filters (category, phase, tags, status)
2. Query embedded via Ollama
3. Vector search on documents table (HNSW-SQ index, cosine distance)
4. Results filtered by min_relevance threshold
5. Trimmed to token_budget if set
6. Returns ranked results with relevance scores

**Hybrid Search (Code Search):**

1. Agent calls `search_code` with query, language, symbol_type, file_pattern
2. Three search modes supported:
   - **Semantic**: vector search on code_chunks
   - **Fulltext**: FTS on content column
   - **Hybrid**: RRF fusion of both
3. RRF scoring: `score(item) = Σ 1/(k+rank_i)` for each result list (k=60)
4. Results filtered by language, symbol_type, file_pattern
5. Returns ranked results with file_path, symbol_name, scope_chain, line numbers, relevance

**Smart Context Assembly (Two-Phase):**

**Phase 1 — Overview:**
1. Agent calls `get_smart_context` with task_description, default depth="overview"
2. Hybrid search on both documents and code_chunks (top 15 semantic + top 15 FTS each)
3. RRF merge deduplicated by doc_id/file_path
4. Return summaries only: doc_id, title, category, relevance_score, first ~100 tokens of content
5. Total output: ~2k-4k tokens (lightweight overview for agent to decide what to fetch)

**Phase 2 — Detailed:**
1. Agent calls `get_smart_context` with depth="detailed", includes `doc_ids: string[]`
2. Fetch full content for requested docs
3. Graph traversal: follow 1-hop relationships from requested docs
4. Assemble context bundle with sections: requirements, architecture decisions, patterns, code, risks
5. Truncate to max_tokens budget
6. Return structured context with source attribution

**State Management:**

- **Document versioning:** store_document with existing doc_id creates new version, marks old as superseded
- **Status lifecycle:** draft → active → approved, or any → archived (soft delete)
- **Activity log:** all mutations logged with actor, action, timestamp for audit trail
- **Incremental state:** file hashes stored in project_meta config, checked on reindex
- **Relationship source tracking:** auto-generated (source: "ast_import") vs. manual (source: "manual")

## Key Abstractions

**Document (Logical):**
- Purpose: Represents a piece of project knowledge (requirement, architecture decision, design pattern, etc.)
- Examples: `src/tools/store-document.ts`, `src/tools/query-documents.ts`
- Pattern: Divided into chunks at write time, each chunk stored and embedded separately; chunks share doc_id and version for retrieval and versioning

**Code Chunk:**
- Purpose: Represents a semantic unit of source code (function, class, method, interface, type alias)
- Examples: `src/code/ast-chunker.ts`, `src/tools/index-codebase.ts`, `src/tools/search-code.ts`
- Pattern: Extracted via AST parsing, enriched with symbol metadata (name, type, scope_chain), embedded separately from documents

**Relationship:**
- Purpose: Models connections between documents and code (dependencies, implementations, references, contradictions)
- Examples: `src/query/graph-traversal.ts`, `src/tools/link-documents.ts`
- Pattern: Manual links created via link_documents tool; auto-generated links from AST imports with source tracking for regeneration on reindex

**Hybrid Search:**
- Purpose: Combine semantic (vector) and full-text search results for better recall
- Examples: `src/query/hybrid-search.ts`
- Pattern: RRF (Reciprocal Rank Fusion) merges two ranked lists without score normalization; k=60 standard constant

**Chunking Strategy:**
- Purpose: Split documents into optimal-sized pieces for embedding and retrieval
- Examples: `src/chunking/strategies.ts`, `src/chunking/chunker.ts`
- Pattern: Category-based dispatch to semantic_section (markdown headings), paragraph (double newlines), or fixed_size (char count); per-category max_size, overlap, and strategy config

**File Scanner:**
- Purpose: Discover source files for indexing while respecting project boundaries and build artifacts
- Examples: `src/code/file-scanner.ts`
- Pattern: Recursive directory walk, .gitignore-aware filtering, supported extension whitelist, skip common build/cache dirs

**Hash Tracker:**
- Purpose: Implement incremental indexing by tracking file change state
- Examples: `src/code/hash-tracker.ts`
- Pattern: SHA-256 per file stored in project_meta config, compared on reindex to skip unchanged files

## Entry Points

**`src/index.ts`:**
- Location: `src/index.ts`
- Triggers: Process startup (when Claude Code connects)
- Responsibilities: Parse CLI args (--db path), read env vars (OLLAMA_URL, EMBED_MODEL), initialize embedding service, connect to LanceDB, create MCP server, register tools, start stdio transport

**`src/server.ts`:**
- Location: `src/server.ts`
- Triggers: MCP server initialization
- Responsibilities: Create McpServer instance, register all 11 tools with descriptions/inputs/outputs, set up error handlers, coordinate with database and embedding layers

**`init_project` Tool:**
- Location: `src/tools/init-project.ts`
- Triggers: Agent call to initialize a new project
- Responsibilities: Create LanceDB tables and indexes, insert project_meta row, seed with template documents (charter, ADR log, guidelines, glossary), return project_id

**`store_document` Tool:**
- Location: `src/tools/store-document.ts`
- Triggers: Agent stores project knowledge (requirements, decisions, patterns, etc.)
- Responsibilities: Chunk content, embed chunks via Ollama, insert into documents table with versioning, create relationships if specified, log to activity_log

**`index_codebase` Tool:**
- Location: `src/tools/index-codebase.ts`
- Triggers: Agent indexes source code for search
- Responsibilities: Scan files, detect changes via hashing, parse changed files with tree-sitter, extract semantic chunks, embed, insert into code_chunks, create auto-relationships from imports

**`get_smart_context` Tool:**
- Location: `src/tools/smart-context.ts`
- Triggers: Agent assembles context for a task or phase
- Responsibilities: Execute two-phase retrieval (overview summaries, then detailed content on request), merge results from documents and code tables, truncate to token budget, return structured context

## Error Handling

**Strategy:** Fail-fast on embedding service unavailability, graceful degradation on read operations

**Patterns:**

- **Ollama unavailable on write:** `store_document` and `index_codebase` throw clear error (not silent degradation). Mixing embeddings from different models fractures vector space and breaks semantic search. Write operations explicitly require Ollama; read operations continue to work on existing data.

- **Ollama unavailable on startup:** Non-blocking health check logs warning; server starts anyway so queries work. Embedding operations fail when attempted, not at startup.

- **Database errors:** Propagate with context about which operation failed (store, query, index) and which file/document was affected.

- **Missing files during indexing:** Skip with logged warning; continue indexing other files. Deleted files: remove their code_chunks and auto-generated relationships.

- **Embedding dimension mismatch:** Detect on startup and fail fast if Ollama model changes (would break all vector comparisons).

- **Chunking edge cases:** Empty documents default to single empty chunk; extremely large single tokens (>3000 chars) split on statement boundaries; oversized document chunks capped per category config.

## Cross-Cutting Concerns

**Logging:**
- Approach: Activity log table (`src/types/project.ts` ActivityLogRow) records all mutations: store, update, delete, relationship creation
- Fields: project_id, doc_id, action (store/update/delete/link), actor, detail (JSON), created_at
- Enables audit trail and project timeline

**Validation:**
- Approach: Zod schemas for all tool inputs; category/phase/status/relationship_type enums enforced at insert time
- Per-tool validation in `src/tools/` using schema definitions from `src/types/`
- Database schema validation via Apache Arrow (type-checked at insert)

**Authentication:**
- Approach: MCP protocol layer (Claude Code manages auth); Synapse trusts the client
- Multi-project support: All queries filtered by project_id; no isolation within a project
- Audit trail: activity_log tracks actor field to record who performed each action

**Token Management:**
- Approach: Estimate tokens pre-embedding via `src/utils/token-estimator.ts` (stored in documents table)
- get_smart_context respects token_budget parameter, truncates results to fit
- Overview phase returns summaries (~100 tokens each) to stay within budget before detailed fetch

**Performance:**
- Vector search: HNSW-SQ index on documents.vector and code_chunks.vector (cosine distance)
- Bitmap indexes on category, phase, status, language, symbol_type for fast filtering
- BTree indexes on project_id, doc_id, file_path for range/exact lookups
- FTS index on content with stemming and stop words
- Incremental indexing avoids re-embedding unchanged files

---

*Architecture analysis: 2026-02-27*
