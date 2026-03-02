# Synapse — Database-Backed Project Knowledge & Code Search MCP Server

## Context

Existing AI development frameworks (GSD, BMad, SuperClaude) store all project documentation in markdown files. This causes: (1) documentation bloat as files grow, (2) subagents receiving too much or too little context, (3) design decisions being forgotten across phases, and (4) context window waste from loading full documents.

**Synapse** combines two capabilities in one MCP server:
1. **Project knowledge** (like ConPort) — requirements, architecture decisions, design patterns, etc. stored as tagged, queryable chunks
2. **Code search** (like Claude Context) — the actual codebase indexed with AST-aware chunking for semantic code search

Both use the same LanceDB database and embedding pipeline, giving agents a unified interface to query both "what was decided" and "how it was implemented."

**V1 scope**: MCP server with core document tools + code indexing/search. Framework workflow (phases, agent roles, slash commands) deferred to v2.

---

## Architecture Overview

```
Claude Code / Any AI Agent
        │
        │ MCP (stdio)
        ▼
┌─────────────────────┐
│   Synapse MCP Server │
│   (TypeScript)       │
├─────────────────────┤
│  Document Tools:     │
│  - store_document    │
│  - query_documents   │
│  - semantic_search   │
│  - get_smart_context │
│  - link_documents    │
│  - update_document   │
│  - delete_document   │
│  - project_overview  │
│  - init_project      │
│                      │
│  Code Search Tools:  │
│  - index_codebase    │
│  - search_code       │
│  - get_index_status  │
├─────────────────────┤
│  Code Indexer        │
│  (tree-sitter AST)   │
├─────────────────────┤
│  Embedding Service   │
│  (Ollama, fail-fast) │
├─────────────────────┤
│  LanceDB (embedded)  │
│  5 tables:           │
│  - documents         │
│  - code_chunks       │
│  - relationships     │
│  - project_meta      │
│  - activity_log      │
└─────────────────────┘
```

**Tech stack**: TypeScript, LanceDB, @modelcontextprotocol/sdk, Ollama (nomic-embed-text), tree-sitter (AST parsing), Zod

---

## Implementation Steps

### Step 1: Project scaffold

Create the project structure with package.json, tsconfig.json, and directory layout.

```
project_mcp/
  package.json
  tsconfig.json
  src/
    index.ts                    # Entry point
    server.ts                   # MCP server setup + tool registration
    config.ts                   # CLI args + env config
    db/
      connection.ts             # LanceDB connect + table init
      schema.ts                 # Arrow schema definitions for all tables
    embeddings/
      embedding-service.ts      # Ollama provider, fail-fast on unavailability
    chunking/
      chunker.ts                # Chunking dispatcher
      strategies.ts             # paragraph, semantic-section, fixed-size
      configs.ts                # Per-category chunk settings
    tools/
      store-document.ts
      query-documents.ts
      semantic-search.ts
      smart-context.ts
      link-documents.ts
      update-document.ts
      delete-document.ts
      project-overview.ts
      init-project.ts
      index-codebase.ts         # Code indexing tool
      search-code.ts            # Code search tool
      index-status.ts           # Indexing status tool
    code/
      indexer.ts                # Orchestrates full/incremental indexing
      ast-chunker.ts            # tree-sitter AST parsing + chunking
      file-scanner.ts           # File discovery (respects .gitignore)
      hash-tracker.ts           # File hash state for incremental indexing
      language-support.ts       # Language detection + grammar loading
    query/
      hybrid-search.ts          # Reciprocal Rank Fusion
      graph-traversal.ts        # 1-hop relationship traversal
    types/
      documents.ts              # DocumentRow, enums, metadata types
      code.ts                   # CodeChunkRow, language types
      relationships.ts          # RelationshipRow
      project.ts                # ProjectMetaRow, ActivityLogRow
    utils/
      uuid.ts
      token-estimator.ts
  test/
    ...
```

**Dependencies**:
- `@lancedb/lancedb` — embedded vector DB
- `@modelcontextprotocol/sdk` — MCP server SDK
- `zod` — input validation
- `apache-arrow` — schema definitions for LanceDB
- `uuid` — document IDs
- `tree-sitter` — AST parsing for code indexing
- `tree-sitter-typescript` — TypeScript/TSX grammar
- `tree-sitter-python` — Python grammar
- `tree-sitter-rust` — Rust grammar
- `ignore` — .gitignore-aware file filtering

**Dev dependencies**: `typescript`, `tsx`, `vitest`, `@types/node`

---

### Step 2: Types and schema (`src/types/`, `src/db/schema.ts`)

Define all TypeScript types and LanceDB Arrow schemas.

**Document categories**:
`requirement`, `architecture_decision`, `design_pattern`, `task_plan`, `research`, `api_spec`, `guideline`, `glossary`, `test_strategy`, `risk`, `implementation_note`, `code_pattern`, `dependency`, `config`, `decision_log`, `progress`, `custom`

**Phases**: `inception`, `elaboration`, `construction`, `transition`, `maintenance`

**Status**: `draft`, `active`, `approved`, `superseded`, `archived`

**Relationship types**: `implements`, `depends_on`, `supersedes`, `references`, `contradicts`, `child_of`, `related_to`

**Documents table schema** (primary table — each row is one chunk):
| Column | Type | Purpose |
|---|---|---|
| id | string | UUID per chunk |
| doc_id | string | Logical document ID (shared across chunks) |
| chunk_index | int32 | Position within logical document |
| chunk_count | int32 | Total chunks in document |
| version | int32 | Monotonic version number |
| title | string | Human-readable title |
| content | string | Chunk text content |
| summary | string | Short summary of chunk |
| vector | float32[768] | nomic-embed-text embedding |
| category | string | Document category enum |
| phase | string | Project phase enum |
| status | string | Document status enum |
| tags | string | JSON-serialized string array |
| priority | int32 | 1-5 (5 = critical) |
| author | string | Who created it |
| source | string | Origin: "conversation", "import", "agent" |
| created_at | string | ISO 8601 timestamp |
| updated_at | string | ISO 8601 timestamp |
| project_id | string | Multi-project support |
| token_estimate | int32 | Approx token count |
| metadata | string | JSON blob for type-specific data |

**Code chunks table** (separate table for indexed source code):
| Column | Type | Purpose |
|---|---|---|
| id | string | UUID per chunk |
| file_path | string | Relative path from project root |
| file_hash | string | SHA-256 of file content (for incremental indexing) |
| language | string | Detected language (typescript, python, etc.) |
| chunk_index | int32 | Position within file |
| chunk_count | int32 | Total chunks in file |
| content | string | Code chunk content |
| symbol_name | string | Function/class/method name (if applicable) |
| symbol_type | string | "function", "class", "method", "interface", "type", "struct", "enum", "trait", "impl", "module", "other" |
| scope_chain | string | Nesting path, e.g. "UserService.authenticate" |
| vector | float32[768] | Embedding vector |
| start_line | int32 | Line number where chunk starts |
| end_line | int32 | Line number where chunk ends |
| imports | string | JSON array of imported symbols |
| exports | string | JSON array of exported symbols |
| indexed_at | string | ISO 8601 timestamp |
| project_id | string | Multi-project support |

**Indexes on code_chunks**:
- Vector: HNSW-SQ on `vector` (cosine distance)
- BTree: `file_path`, `project_id`, `symbol_name`
- Bitmap: `language`, `symbol_type`
- FTS: `content` (with stemming)

**Relationships table**: `id`, `source_doc_id`, `target_doc_id`, `relationship_type`, `description`, `strength` (0-1), `source` ("manual" | "ast_import"), `created_at`, `project_id`

**Project meta table**: `project_id`, `name`, `description`, `current_phase`, `created_at`, `updated_at`, `config` (JSON)

**Activity log table**: `id`, `project_id`, `doc_id`, `action`, `actor`, `detail` (JSON), `created_at`

**Indexes**:
- Vector: HNSW-SQ on `documents.vector` (cosine distance)
- Bitmap: `category`, `phase`, `status`
- BTree: `project_id`, `doc_id`
- FTS: `content` (with stemming, stop words, lowercase)

---

### Step 3: Embedding service (`src/embeddings/embedding-service.ts`)

- **OllamaProvider**: calls `POST /api/embed` with model `nomic-embed-text` (768 dimensions). Supports single and batch embedding.
- **Fail-fast on unavailability**: If Ollama is unreachable, embedding operations throw a clear error — `store_document` and `index_codebase` will fail. This is intentional: mixing embeddings from different models fractures the vector space and makes semantic search unreliable. Read-only operations (queries on already-embedded data) continue to work.
- **Health check on startup**: Non-blocking check that logs a warning if Ollama is down. The server starts regardless (queries still work), but write operations will fail until Ollama is available.
- **No fallback provider**: Dirty data is worse than no data.

---

### Step 4: Chunking (`src/chunking/`)

**Chunking strategies**:
- `semantic_section`: split on markdown headings (##, ###), merge small sections, split oversized ones on paragraph boundaries
- `paragraph`: split on double newlines, accumulate until max size
- `fixed_size`: character-count based split with overlap

**Per-category defaults**:
| Category | Max chunk (chars) | Overlap | Strategy |
|---|---|---|---|
| requirement | 1500 | 100 | semantic_section |
| architecture_decision | 2500 | 200 | semantic_section |
| design_pattern | 2000 | 150 | semantic_section |
| task_plan | 2000 | 100 | paragraph |
| research | 1500 | 200 | paragraph |
| api_spec | 2000 | 100 | semantic_section |
| glossary | 800 | 0 | paragraph |
| default/other | 1500 | 150 | paragraph |

Each chunk is prefixed with `"Document: {title} | Section: {header}\n"` before embedding to improve vector relevance.

---

### Step 5: Core MCP tools (`src/tools/`)

#### `init_project`
- Input: `name`, `description`, `tech_stack?`, `constraints?`
- Creates tables, indexes, project_meta row, seed documents (project charter, ADR log template, coding guidelines, glossary)
- Returns `project_id`

#### `store_document`
- Input: `title`, `content`, `category`, `phase?`, `tags?`, `priority?`, `status?`, `metadata?`, `doc_id?` (for updates), `related_to?`
- Chunks content, embeds each chunk via Ollama, inserts into documents table
- If `doc_id` provided: marks old version as `superseded`, creates new version with `version + 1`
- Creates relationships if `related_to` provided
- Logs to activity_log
- Returns `{ doc_id, chunk_count, version, token_estimate }`

#### `query_documents`
- Input: `doc_type?`, `phase?`, `tags?`, `status?`, `limit?`, `include_content?`, `order_by?`
- Builds SQL WHERE clause from filters
- Returns matching documents (metadata only if `include_content=false`)

#### `semantic_search`
- Input: `query`, `doc_type?`, `phase?`, `tags?`, `status?`, `limit?`, `min_relevance?`, `token_budget?`
- Embeds query, runs vector search with filters
- Filters by min_relevance threshold
- Trims results to token_budget if set
- Returns ranked results with relevance scores

#### `get_smart_context`
- Input: `task_description`, `max_tokens?`, `include_categories?`, `depth?` ("overview" | "detailed")
- **Two-phase iterative retrieval** (avoids context smearing from force-feeding 50+ chunks):

  **Phase 1 — Overview** (`depth: "overview"`, default):
  1. Semantic + FTS hybrid search across docs and code (top 15 candidates each)
  2. RRF merge, deduplicate by doc_id
  3. Return **summaries only**: doc_id, title, category, relevance_score, summary (first ~100 tokens per doc)
  4. The agent reads the overview and decides which documents to fetch in full
  5. Lightweight: ~2k-4k tokens total

  **Phase 2 — Detailed** (`depth: "detailed"`):
  - Input includes `doc_ids: string[]` — specific documents to fetch in full
  - Fetches full content for requested docs
  - Follows 1-hop relationships from those docs to surface connected items
  - Assembles into sections: requirements, architecture decisions, patterns, code, risks
  - Truncates to `max_tokens` budget
  - Returns structured context bundle with source attribution

  This mirrors how a developer works: scan the index, then read the relevant pages. The agent controls what it loads instead of being force-fed.

#### `link_documents`
- Input: `source_doc_id`, `target_doc_id`, `relationship_type`, `description?`, `strength?`, `bidirectional?`
- Inserts into relationships table
- If bidirectional, inserts reverse edge
- **Note**: manual linking is kept for doc ↔ doc relationships (e.g., requirement → architecture decision) where the agent makes the connection. Code ↔ code relationships are auto-generated (see Step 6).

#### `update_document`
- Input: `doc_id`, `status?`, `phase?`, `tags_add?`, `tags_remove?`, `priority?`
- Updates metadata on all chunks with matching doc_id (no re-embedding)
- Logs to activity_log

#### `delete_document`
- Input: `doc_id`, `hard_delete?`
- Soft: sets status to `archived`
- Hard: removes rows from documents + relationships tables
- Logs to activity_log

#### `project_overview`
- Input: `include_recent_activity?`
- Returns: project metadata, document counts by category/status/phase, recent activity, key documents (priority >= 4)

---

### Step 6: Code indexing (`src/code/`)

#### AST-aware code chunking (`src/code/ast-chunker.ts`)

Uses **tree-sitter** to parse source code into AST, then extracts semantic chunks at function/class/method boundaries.

**Process per file**:
1. Detect language from file extension via `language-support.ts`
2. Parse with tree-sitter using the appropriate grammar
3. Walk the AST to extract top-level entities: functions, classes, structs, traits, impl blocks, interfaces, type aliases, exports
4. For classes/structs/impl blocks: also extract methods as sub-entities
5. Each entity becomes a chunk, enriched with:
   - `symbol_name`: the function/class/struct/trait name
   - `symbol_type`: "function", "class", "method", "interface", "type", "struct", "enum", "trait", "impl"
   - `scope_chain`: nesting path (e.g., `UserService.authenticate` or `MyStruct::new`)
   - `imports`: parsed import/use statements from file header
   - `exports`: what this file exports (pub items in Rust, export in TS, __all__ in Python)
6. Prepend context header before embedding: `"File: {path} | {symbol_type}: {scope_chain}\nImports: {imports}\n"`
7. If a single entity exceeds max chunk size (3000 chars), split on statement/block boundaries with overlap

**tree-sitter AST node types to extract** (per language):

| Language | Functions | Classes / Structs / Traits | Methods | Other |
|---|---|---|---|---|
| TypeScript | `function_declaration`, `arrow_function` (exported), `method_definition` | `class_declaration`, `interface_declaration` | `method_definition`, `public_field_definition` | `type_alias_declaration`, `enum_declaration` |
| Python | `function_definition` | `class_definition` | `function_definition` (inside class) | `decorated_definition` |
| Rust | `function_item` | `struct_item`, `enum_item`, `trait_item` | `function_item` (inside `impl_item`) | `impl_item`, `type_item`, `mod_item`, `macro_definition` |

**Import/use statement parsing** (for auto-relationship generation):

| Language | Import pattern | tree-sitter node type |
|---|---|---|
| TypeScript | `import { X } from './module'` | `import_statement` |
| Python | `from module import X` / `import module` | `import_from_statement`, `import_statement` |
| Rust | `use crate::module::Item` / `use super::*` | `use_declaration` |

**V1 language support**: TypeScript, Python, Rust

#### File scanner (`src/code/file-scanner.ts`)

- Recursively scans project directory for source files
- Respects `.gitignore` patterns (using the `ignore` npm package)
- Filters by supported extensions: `.ts`, `.tsx`, `.py`, `.rs`
- Skips: `node_modules`, `.git`, `dist`, `build`, `target`, `.synapse`, `__pycache__`, `*.min.js`

#### Automatic relationship generation (`src/code/indexer.ts`)

During `index_codebase`, after AST parsing, **auto-populate the relationships table** from import statements:

- **TypeScript**: parse `import { X } from './module'` → resolve relative imports to file paths
- **Python**: parse `from module import X` / `import module` → resolve to file paths (using Python module resolution: dots → directories)
- **Rust**: parse `use crate::module::Item` / `use super::Item` → resolve `crate::` to project root `src/`, `super::` to parent module, `self::` to current module
- Create `depends_on` relationships: `fileA → fileB`
- For class/trait inheritance (`extends`, `implements`, `: TraitName`): create `child_of` relationships
- For re-exports (`pub use`, `__all__`): create `references` relationships
- All auto-generated relationships get `source: "ast_import"` in metadata so they can be distinguished from manual links and regenerated on re-index

This makes the knowledge graph **self-maintaining** for code dependencies. When files are re-indexed, their old auto-generated relationships are replaced with fresh ones derived from the current AST.

#### Incremental indexing (`src/code/hash-tracker.ts`)

Simple file-hash approach (not Merkle trees — sufficient for v1):
- Maintains a `Record<filePath, { hash: string, indexedAt: string }>` in the project_meta config
- On `index_codebase`: compare current SHA-256 of each file against stored hash
- Only re-chunk and re-embed files that changed
- Deleted files: remove their code_chunks and their auto-generated relationships from the table

#### Code search tools (`src/tools/`)

##### `index_codebase`
- Input: `root_path?` (defaults to project root), `include_patterns?`, `exclude_patterns?`, `full_reindex?`
- Scans files, detects changes via hash comparison
- Chunks changed files with tree-sitter, embeds via Ollama
- Stores in `code_chunks` table
- Returns `{ files_scanned, files_indexed, chunks_created, skipped_unchanged }`

##### `search_code`
- Input: `query`, `language?`, `symbol_type?`, `file_pattern?`, `limit?`, `search_mode?` ("semantic" | "fulltext" | "hybrid")
- Hybrid search (RRF) over code_chunks table
- Filters by language, symbol_type, file_path pattern
- Returns ranked results with: file_path, symbol_name, scope_chain, content, relevance_score, start_line, end_line

##### `get_index_status`
- Input: none
- Returns: total files indexed, total chunks, last index time, languages breakdown, stale files count

#### Integration with `get_smart_context`

The `get_smart_context` tool searches both tables:
- **Overview phase**: returns summaries from both `documents` and `code_chunks`, labeled by source
- **Detailed phase**: when the agent requests specific items, code chunks include the full function/class content with file path and line numbers
- Auto-generated import relationships surface connected code files (e.g., "this file depends on auth.ts, which you might also want to see")

---

### Step 7: Hybrid search (`src/query/hybrid-search.ts`)

**Reciprocal Rank Fusion (RRF)** merges semantic and full-text results:
```
score(doc) = Σ  1 / (k + rank_in_list_i)    for each result list i
```
With k=60 (standard constant). No score normalization needed.

**Graph traversal** (`src/query/graph-traversal.ts`): given a set of doc_ids, fetches all relationships from the relationships table, follows 1 hop, returns related doc_ids with relationship metadata.

---

### Step 8: MCP server entry point (`src/server.ts`, `src/index.ts`)

- Parse CLI args: `--db <path>` (default: `./.synapse`)
- Read env vars: `OLLAMA_URL`, `EMBED_MODEL`
- Connect to LanceDB
- Initialize EmbeddingService (non-blocking health check)
- Create McpServer, register all tools
- Connect via StdioServerTransport

**MCP configuration** (`.mcp.json`):
```json
{
  "mcpServers": {
    "synapse": {
      "command": "npx",
      "args": ["synapse-mcp"],
      "env": {
        "SYNAPSE_DB_PATH": "./.synapse",
        "OLLAMA_URL": "http://localhost:11434",
        "EMBED_MODEL": "nomic-embed-text"
      }
    }
  }
}
```

---

### Step 9: Tests (`test/`)

- **Unit**: chunking strategies, AST chunker, token estimator, RRF fusion, tag parsing, file scanner, hash tracker
- **Integration**: embedding service (mock Ollama), LanceDB store/query cycle, tree-sitter parsing for sample files
- **E2E**: init_project → store_document → index_codebase → semantic_search → search_code → get_smart_context

---

## Document lifecycle

```
store_document (new)
       │
       ▼
  [status: draft]  ──update──►  [status: active]  ──update──►  [status: approved]
       │                              │
       │                              │ store_document(doc_id=existing)
       │                              ▼
       │                    [status: superseded]
       │                    (old version; new version created)
       │
       │ delete_document
       ▼
  [status: archived]  (still searchable, lower ranking)
```

**Carry-forward types** (never auto-archived): `architecture_decision`, `design_pattern`, `glossary`, `code_pattern`, `dependency`

---

## Key design decisions

| Decision | Rationale |
|---|---|
| LanceDB embedded | Zero-config, no server process, vector + FTS + SQL in one |
| Chunk at write time | Better embedding quality at ~512 tokens; avoids runtime chunking |
| Ollama local embeddings | Free, private, offline-capable; nomic-embed-text is 768-dim |
| Fail-fast on missing Ollama | Dirty data (mixed embedding spaces) is worse than no data; reads still work |
| Versioning via superseded rows | Full history preserved, append-friendly for Lance format |
| Tags as JSON string | LanceDB doesn't support array bitmap indexes; JSON + app filter is fine at expected scale |
| RRF for hybrid search | Simple, no score normalization needed, well-proven |
| 1-hop graph traversal | Keeps context focused, avoids exponential blowup |
| MCP stdio transport | Standard for Claude Code, no HTTP server needed |
| tree-sitter for code parsing | Fast, incremental, multi-language; industry standard (used by VS Code, Neovim) |
| Separate code_chunks table | Different schema from documents; avoids polluting doc queries with code; independent indexing lifecycle |
| File hash for incremental index | Simpler than Merkle trees; sufficient for v1 scale; SHA-256 per file |
| Context header prepended before embedding | "File: path | function: name" dramatically improves vector relevance for code |
| Auto-generated relationships from imports | Knowledge graph stays fresh without manual maintenance; AST imports are ground truth |
| Two-phase get_smart_context | Prevents context smearing; agent controls what it loads instead of being force-fed 50 chunks |

---

## V2 roadmap (not in scope now)

- Additional language support: Go, Java, C++, C#
- Agent role profiles with per-role context assembly (token budgets, mandatory/primary/secondary doc types)
- Slash commands (`/init-project`, `/plan-phase`, `/execute`, `/verify`, `/status`, `/search`)
- Phase management workflow with readiness gates
- GSD/BMad import tools
- MCP resources and prompt templates
- MCPorter-style skill wrappers to reduce tool description overhead

---

## Verification plan

1. **Ollama check**: `curl http://localhost:11434/api/tags` — verify Ollama is running and nomic-embed-text is available
2. **Build**: `npm run build` — TypeScript compiles without errors
3. **Unit tests**: `npm test` — chunking, RRF, token estimation pass
4. **Manual MCP test**: configure in `.mcp.json`, start Claude Code, run:
   - Call `init_project` → verify `.synapse/` directory created with LanceDB tables
   - Call `store_document` with a requirement → verify chunking and embedding
   - Call `semantic_search` with a related query → verify relevant results returned
   - Call `store_document` with a second doc + `related_to` → verify relationship created
   - Call `get_smart_context` with a task description → verify context bundle includes both docs
   - Call `project_overview` → verify counts and recent activity
5. **Code indexing test**: place sample .ts, .py, and .rs files (with imports/use between them) in a test directory, call `index_codebase` → verify code_chunks table populated with correct symbol_name, scope_chain, language
6. **Auto-relationship test**: verify that import statements between test files generated `depends_on` relationships with `source: "ast_import"` in the relationships table
7. **Code search test**: call `search_code` with a query matching a function name → verify it returns the right file and line numbers
8. **Incremental index test**: modify one file, call `index_codebase` again → verify only the changed file is re-indexed (check `skipped_unchanged` count) and its auto-relationships are refreshed
9. **Smart context overview**: call `get_smart_context` with default depth → verify it returns summaries (not full content) from both docs and code
10. **Smart context detailed**: call `get_smart_context` with `depth: "detailed"` and specific `doc_ids` → verify it returns full content for requested docs only, plus 1-hop related items
11. **Fail-fast test**: stop Ollama, call `store_document` → verify it returns a clear error (not silent degradation). Call `semantic_search` on existing data → verify reads still work
