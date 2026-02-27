# External Integrations

**Analysis Date:** 2026-02-27

## APIs & External Services

**Embedding Service:**
- Ollama local embeddings - Provides text-to-vector embedding via HTTP API
  - SDK/Client: Custom HTTP client (via native Node.js `fetch` or similar)
  - Endpoint: `POST /api/embed`
  - Model: `nomic-embed-text` (768-dimensional vectors)
  - Auth: None (local service, typically on localhost)
  - Env var: `OLLAMA_URL` (default: `http://localhost:11434`)
  - **Fail-fast behavior**: If Ollama is unavailable, embedding write operations throw clear error. Read operations on already-embedded data continue to work. No fallback provider (dirty data worse than no data).

**Model Context Protocol (MCP):**
- MCP server connection - Standard MCP protocol for communicating with Claude Code
  - SDK/Client: @modelcontextprotocol/sdk
  - Transport: stdio (standard input/output)
  - Auth: No explicit auth; controlled by client process
  - Direction: Bidirectional (server provides tools, client calls them)

## Data Storage

**Databases:**
- LanceDB (embedded)
  - Type: Vector database with embedded SQL and full-text search
  - Storage: Local filesystem (SQLite + Lance format)
  - Location: `.synapse/` directory (configurable via `SYNAPSE_DB_PATH`)
  - Client: @lancedb/lancedb (TypeScript SDK)
  - No remote connection required; runs in-process
  - **Tables**:
    - `documents` - Project knowledge chunks with embeddings (vectors, FTS, metadata)
    - `code_chunks` - Indexed source code with semantic metadata (file path, symbol name, scope chain)
    - `relationships` - Links between documents and code (doc-to-doc, code-to-code, auto-generated from imports)
    - `project_meta` - Project configuration and metadata
    - `activity_log` - Audit trail of all mutations (store, update, delete, index operations)

**File Storage:**
- Local filesystem only - No cloud storage integration
  - Project root files are scanned for source code indexing
  - Respects .gitignore patterns (via `ignore` package)
  - Supported extensions: `.ts`, `.tsx`, `.py`, `.rs`

**Caching:**
- None - LanceDB provides built-in performance via HNSW vector indexes and bitmap/FTS indexes
- File hash tracking for incremental indexing (stored in project_meta config)

## Authentication & Identity

**Auth Provider:**
- Custom session/context - No external identity service
- MCP client provides implicit auth via process ownership
- No token or credential exchange for core functionality
- Ollama service assumed to be trusted local process (no auth implemented)

## Monitoring & Observability

**Error Tracking:**
- None - Standard error propagation via MCP tool response
- Errors returned to client with descriptive messages and context
- Activity log tracks mutations for audit trail

**Logs:**
- Console/stderr logging (Node.js)
- Non-blocking health check on startup logs to stderr if Ollama unavailable
- Activity log table tracks all document operations (store, update, delete, index) with actor, timestamp, action metadata

**Metrics:**
- Index status tool provides reporting: total files indexed, chunks, languages, stale files count, last index time

## CI/CD & Deployment

**Hosting:**
- Local/developer machine - Designed to run as subprocess under Claude Code or other MCP client
- No cloud deployment in V1 scope
- Standalone MCP server process

**CI Pipeline:**
- None currently configured - V1 is design/implementation phase
- Planned test suite: unit tests (vitest), integration tests, E2E tests

**Build:**
- TypeScript compilation via `tsc` or `tsx`
- No Docker container in V1 scope
- Distributable as npm package (future: `npx synapse-mcp`)

## Environment Configuration

**Required env vars:**
- `OLLAMA_URL` - Ollama service endpoint (default: `http://localhost:11434`)
- `EMBED_MODEL` - Embedding model identifier (default: `nomic-embed-text`)
- `SYNAPSE_DB_PATH` - LanceDB database directory (default: `./.synapse`, relative to working directory)

**Optional env vars:**
- `NODE_ENV` - Set to `development` or `production` for logging/error detail levels

**Secrets location:**
- No secrets required in V1 - Ollama is local trusted service
- .env support recommended for future use (not currently implemented)

## Webhooks & Callbacks

**Incoming:**
- None - Synapse is request-response only via MCP tools
- No webhook endpoints exposed

**Outgoing:**
- None - Synapse does not call external APIs on its own initiative
- All external calls (Ollama embeddings) are synchronous, request-driven

## Project Knowledge Tools (Internal MCP Interface)

These are the tools exposed to Claude Code; not external integrations but important interface design:

**Document Management:**
- `init_project` - Create new project with tables, indexes, seed documents
- `store_document` - Add/version a knowledge document (requirements, decisions, patterns, etc.)
- `query_documents` - Filter documents by type, phase, tags, status
- `semantic_search` - Vector search across document knowledge base
- `update_document` - Modify document metadata without re-embedding
- `delete_document` - Archive or hard-delete documents
- `link_documents` - Create manual relationships between documents (doc-to-doc)

**Code Indexing & Search:**
- `index_codebase` - Scan source files, parse with tree-sitter, extract semantic chunks, embed and store
- `search_code` - Hybrid search (semantic + full-text) over indexed code
- `get_index_status` - Report indexing progress, languages breakdown, stale files

**Context Assembly:**
- `get_smart_context` - Two-phase context retrieval:
  - Overview phase: return summaries from documents and code, agent selects items
  - Detailed phase: fetch full content for selected docs, include 1-hop related items
- `project_overview` - Metadata, document counts, recent activity, high-priority items

## Code Analysis & Parsing

**AST Parsing Infrastructure:**
- tree-sitter with language-specific grammars:
  - TypeScript/TSX: extracts functions, classes, interfaces, type aliases, enums
  - Python: extracts functions, classes, decorators
  - Rust: extracts functions, structs, traits, impl blocks, modules, macros
- **Auto-relationship generation from imports:**
  - TypeScript: `import { X } from './module'` → `depends_on` relationships
  - Python: `from module import X` / `import module` → `depends_on` relationships
  - Rust: `use crate::module::Item` → `depends_on` relationships
  - Source field: `"ast_import"` (auto-generated, regenerated on re-index)

## Security Considerations

**Data Privacy:**
- All data stored locally (LanceDB in `.synapse/` directory)
- No cloud uploads or remote data transmission
- Ollama embeddings computed locally

**Credential Handling:**
- No API keys or credentials required for core functionality
- Ollama assumed to be trusted local service (no auth layer)
- Future: may require auth if Ollama deployed remotely

**Trust Boundary:**
- MCP client is trusted (runs in same process context as Claude Code)
- Ollama service is assumed trusted (local localhost connection)
- File system access uses .gitignore patterns to avoid sensitive files by default

---

*Integration audit: 2026-02-27*
