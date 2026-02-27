# Codebase Structure

**Analysis Date:** 2026-02-27

## Directory Layout

```
project_mcp/
├── src/                                  # Source code
│   ├── index.ts                         # Entry point: parse CLI args, init server
│   ├── server.ts                        # MCP server setup, tool registration
│   ├── config.ts                        # Environment and CLI configuration
│   │
│   ├── db/
│   │   ├── connection.ts                # LanceDB connection, table initialization
│   │   └── schema.ts                    # Apache Arrow schema definitions (5 tables)
│   │
│   ├── embeddings/
│   │   └── embedding-service.ts         # Ollama provider, fail-fast strategy, batch embedding
│   │
│   ├── chunking/
│   │   ├── chunker.ts                   # Chunking dispatcher (strategy selection)
│   │   ├── strategies.ts                # semantic_section, paragraph, fixed_size strategies
│   │   └── configs.ts                   # Per-category chunk settings (max size, overlap, strategy)
│   │
│   ├── tools/                           # MCP tool implementations (11 tools)
│   │   ├── init-project.ts              # Initialize new project + seed templates
│   │   ├── store-document.ts            # Store/version project knowledge
│   │   ├── query-documents.ts           # Filter documents by category, phase, tags, status
│   │   ├── semantic-search.ts           # Vector search on documents
│   │   ├── smart-context.ts             # Two-phase context assembly (overview + detailed)
│   │   ├── link-documents.ts            # Create manual relationships between docs
│   │   ├── update-document.ts           # Update metadata (no re-embedding)
│   │   ├── delete-document.ts           # Soft/hard delete documents
│   │   ├── project-overview.ts          # Project metadata + stats
│   │   ├── index-codebase.ts            # Scan, parse, embed source code
│   │   ├── search-code.ts               # Hybrid search on code chunks
│   │   └── index-status.ts              # Indexing status, breakdown by language
│   │
│   ├── code/                            # Code indexing and parsing
│   │   ├── indexer.ts                   # Orchestrate full/incremental indexing
│   │   ├── ast-chunker.ts               # tree-sitter AST parsing + semantic chunking
│   │   ├── file-scanner.ts              # Recursive file discovery (.gitignore aware)
│   │   ├── hash-tracker.ts              # File hash state for incremental indexing
│   │   └── language-support.ts          # Language detection, grammar loading
│   │
│   ├── query/
│   │   ├── hybrid-search.ts             # Reciprocal Rank Fusion (semantic + FTS)
│   │   └── graph-traversal.ts           # 1-hop relationship traversal
│   │
│   ├── types/
│   │   ├── documents.ts                 # DocumentRow, category/phase/status enums
│   │   ├── code.ts                      # CodeChunkRow, language/symbol_type enums
│   │   ├── relationships.ts             # RelationshipRow, relationship_type enum
│   │   ├── project.ts                   # ProjectMetaRow, ActivityLogRow
│   │   └── index.ts                     # Type exports (barrel file)
│   │
│   └── utils/
│       ├── uuid.ts                      # UUID generation
│       └── token-estimator.ts           # Approximate token count (for budgeting)
│
├── test/                                 # Test files
│   ├── unit/                            # Unit tests
│   │   ├── chunking.test.ts
│   │   ├── ast-chunker.test.ts
│   │   ├── token-estimator.test.ts
│   │   ├── hybrid-search.test.ts
│   │   ├── file-scanner.test.ts
│   │   └── hash-tracker.test.ts
│   │
│   ├── integration/
│   │   ├── embedding-service.test.ts    # Mock Ollama
│   │   ├── lancedb-store-query.test.ts  # LanceDB store/query cycle
│   │   └── tree-sitter-samples.test.ts  # AST parsing for .ts, .py, .rs samples
│   │
│   └── e2e/
│       └── workflow.test.ts             # Full flow: init → store → index → search
│
├── package.json                         # Dependencies + build/test scripts
├── tsconfig.json                        # TypeScript configuration
├── vitest.config.ts                     # Test runner config
├── .gitignore                           # Standard ignores (node_modules, dist, build, etc.)
└── README.md                            # Project overview + setup guide
```

## Directory Purposes

**`src/`:**
- Purpose: All source code
- Contains: TypeScript implementation of MCP server, tools, database, indexing, search
- Key files: `index.ts` (entry), `server.ts` (MCP setup), `config.ts` (configuration)

**`src/db/`:**
- Purpose: Database layer
- Contains: LanceDB connection management, Arrow schema definitions for documents, code_chunks, relationships, project_meta, activity_log tables
- Key files: `connection.ts` (initialization), `schema.ts` (table schemas)

**`src/embeddings/`:**
- Purpose: Embedding service abstraction
- Contains: Ollama provider, health checks, batch embedding
- Key files: `embedding-service.ts` (main service)

**`src/chunking/`:**
- Purpose: Document chunking strategies
- Contains: Three strategies (semantic_section, paragraph, fixed_size), category-based dispatcher, per-category configuration
- Key files: `chunker.ts` (dispatcher), `strategies.ts` (implementations), `configs.ts` (settings)

**`src/tools/`:**
- Purpose: MCP tool implementations
- Contains: 11 tools exposing project knowledge and code search capabilities
- Key files: Each tool in its own file named `{tool-name}.ts`

**`src/code/`:**
- Purpose: Code indexing and parsing
- Contains: tree-sitter AST parsing, semantic chunking, file discovery, incremental indexing, language support
- Key files: `indexer.ts` (orchestration), `ast-chunker.ts` (parsing), `file-scanner.ts` (discovery)

**`src/query/`:**
- Purpose: Search and relationship traversal
- Contains: Hybrid search via RRF, 1-hop graph traversal
- Key files: `hybrid-search.ts` (search), `graph-traversal.ts` (relationships)

**`src/types/`:**
- Purpose: Type definitions and enums
- Contains: All domain entities (DocumentRow, CodeChunkRow, etc.), category/phase/status/relationship_type enums
- Key files: `documents.ts`, `code.ts`, `relationships.ts`, `project.ts`, `index.ts` (barrel)

**`src/utils/`:**
- Purpose: Utility functions
- Contains: UUID generation, token estimation
- Key files: `uuid.ts`, `token-estimator.ts`

**`test/`:**
- Purpose: Test files
- Contains: Unit tests, integration tests, E2E tests
- Organization: Subdirectories for unit, integration, e2e; file names match source files with `.test.ts` suffix

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main entry point; parses CLI args, initializes server
- `src/server.ts`: MCP server creation and tool registration

**Configuration:**
- `src/config.ts`: Environment variables and CLI argument parsing
- `package.json`: Dependencies, build/test/start scripts
- `tsconfig.json`: TypeScript compiler options
- `vitest.config.ts`: Test runner configuration

**Core Logic:**
- `src/db/schema.ts`: Database schema definitions for all 5 tables
- `src/db/connection.ts`: LanceDB initialization
- `src/embeddings/embedding-service.ts`: Embedding provider (Ollama)
- `src/chunking/chunker.ts`: Chunking strategy dispatcher
- `src/code/indexer.ts`: Code indexing orchestration
- `src/query/hybrid-search.ts`: Search fusion algorithm

**Tools:**
- `src/tools/store-document.ts`: Document storage and versioning
- `src/tools/index-codebase.ts`: Code indexing entry point
- `src/tools/search-code.ts`: Code search entry point
- `src/tools/semantic-search.ts`: Document vector search
- `src/tools/smart-context.ts`: Two-phase context assembly
- `src/tools/query-documents.ts`: Document filtering

**Type Definitions:**
- `src/types/documents.ts`: DocumentRow type, category/phase/status enums
- `src/types/code.ts`: CodeChunkRow type, language/symbol_type enums
- `src/types/relationships.ts`: RelationshipRow type, relationship_type enum
- `src/types/project.ts`: ProjectMetaRow, ActivityLogRow types

**Testing:**
- `test/unit/chunking.test.ts`: Chunking strategy tests
- `test/unit/hybrid-search.test.ts`: RRF algorithm tests
- `test/integration/lancedb-store-query.test.ts`: Database round-trip tests
- `test/e2e/workflow.test.ts`: Full feature workflow test

## Naming Conventions

**Files:**
- Tool files: `{tool-name}.ts` (kebab-case, e.g., `store-document.ts`)
- Type files: `{entity}.ts` (kebab-case, e.g., `code-chunks.ts` in types/)
- Test files: `{source-file}.test.ts` (match source name with .test.ts suffix)
- Utility files: `{function-name}.ts` (kebab-case, e.g., `token-estimator.ts`)
- Config files: `{system}.ts` (kebab-case, e.g., `embedding-service.ts`, `db/connection.ts`)

**Directories:**
- Feature directories: lowercase plural (src/tools/, src/types/, src/utils/)
- Test directories: feature-based (unit/, integration/, e2e/)
- Database subdirectory: `db/`
- Code indexing subdirectory: `code/`
- Search subdirectory: `query/`

**TypeScript Exports/Imports:**
- Barrel files: `src/types/index.ts` exports all types
- Import paths: Use directory path `import { DocumentRow } from './types'` (via barrel)
- Avoid star imports except in barrel files

## Where to Add New Code

**New Tool (e.g., "batch_delete_documents"):**
- Implementation: `src/tools/batch-delete-documents.ts`
- Register in: `src/server.ts` (add to tool registration array)
- Type inputs: Create Zod schema and type in `src/tools/batch-delete-documents.ts` or reuse from `src/types/`
- Tests: `test/unit/batch-delete-documents.test.ts` or `test/integration/` if it needs database

**New Language Support (e.g., Go):**
- AST grammar: Add to `tree-sitter` imports in `src/code/language-support.ts`
- Detection: Add `.go` extension to supported list in `src/code/file-scanner.ts`
- AST node extraction: Add Go node types to `src/code/ast-chunker.ts`
- Symbol types: Add Go-specific types (interface, package, receiver method) to `src/types/code.ts` if needed
- Tests: Add sample Go file to `test/integration/tree-sitter-samples.test.ts`

**New Chunking Strategy (e.g., "code_block_aware"):**
- Implementation: Add function to `src/chunking/strategies.ts`
- Config: Add entry to strategy map in `src/chunking/configs.ts`
- Registration: Reference in `src/chunking/chunker.ts` dispatcher
- Tests: `test/unit/chunking.test.ts`

**New Document Category (e.g., "meeting_notes"):**
- Type definition: Add to category enum in `src/types/documents.ts`
- Default config: Add to `src/chunking/configs.ts` (max_size, overlap, strategy)
- Tests: Update category tests in `test/unit/` and `test/integration/`

**New Tool Input Validation:**
- Define Zod schema in tool file (e.g., `src/tools/store-document.ts`)
- Use schema to validate tool input in MCP handler
- Export schema for reuse in tests

**Utilities:**
- Shared helpers: `src/utils/{function-name}.ts`
- Export from barrel: `src/utils/index.ts`
- Import: `import { functionName } from './utils'`

## Special Directories

**`.synapse/` (Database):**
- Purpose: LanceDB embedded database directory
- Generated: Yes (created by `init_project`)
- Committed: No (in .gitignore)
- Contains: Binary LanceDB files for documents, code_chunks, relationships, project_meta, activity_log tables
- Configuration: Path specified via `--db` CLI flag (default: `./.synapse`)

**`node_modules/` (Dependencies):**
- Purpose: Installed npm packages
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)
- Contains: @lancedb/lancedb, @modelcontextprotocol/sdk, tree-sitter, zod, etc.

**`dist/` (Compiled Output):**
- Purpose: Compiled JavaScript from TypeScript
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)
- Contains: .js and .d.ts files, matching src/ structure

**`.git/` (Version Control):**
- Purpose: Git repository
- Generated: Yes (by `git init`)
- Committed: Yes (internal to .git)

---

*Structure analysis: 2026-02-27*
