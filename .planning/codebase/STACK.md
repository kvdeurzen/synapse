# Technology Stack

**Analysis Date:** 2026-02-27

## Languages

**Primary:**
- TypeScript 5.x - All source code, MCP server, tools, and utilities
- Python (supported via tree-sitter indexing) - Code parsing and AST analysis target language
- Rust (supported via tree-sitter indexing) - Code parsing and AST analysis target language

## Runtime

**Environment:**
- Node.js 18+ (for running TypeScript/JavaScript)
- Ollama local embedding service (separate process, external dependency)

**Package Manager:**
- npm (or yarn/pnpm compatible)
- Lockfile: package-lock.json (implied, not yet created)

## Frameworks

**Core:**
- @modelcontextprotocol/sdk - MCP server framework for Claude integration
- LanceDB (@lancedb/lancedb) - Embedded vector database with SQL + FTS support

**AST & Code Analysis:**
- tree-sitter - Fast, incremental AST parsing for code indexing
- tree-sitter-typescript - TypeScript/TSX grammar for AST extraction
- tree-sitter-python - Python grammar for AST extraction
- tree-sitter-rust - Rust grammar for AST extraction

**Data & Validation:**
- Zod - Schema validation and type definition for API inputs
- apache-arrow - Arrow schema definitions for LanceDB table structure

**Utilities:**
- uuid - Document and chunk ID generation
- ignore - .gitignore-aware file filtering for code scanning

**Testing:**
- Vitest - Fast unit and integration test framework
- @types/node - TypeScript definitions for Node.js APIs

## Key Dependencies

**Critical:**
- @lancedb/lancedb - Embedded vector database; core storage layer for documents, code chunks, relationships, and metadata. No external database server required.
- @modelcontextprotocol/sdk - MCP server SDK for bidirectional communication with Claude Code and other MCP clients via stdio transport.
- tree-sitter - Production-grade AST parser with incremental parsing; enables semantic code indexing and import relationship extraction.
- zod - Input validation for MCP tool parameters; prevents invalid data from entering the system.

**Infrastructure:**
- apache-arrow - Schema definitions for all LanceDB tables (documents, code_chunks, relationships, project_meta, activity_log); ensures type safety at storage layer.
- uuid - Generates unique identifiers for documents, chunks, and relationships with no external coordination.
- ignore - Respects .gitignore patterns during file scanning; avoids indexing vendored code, node_modules, build artifacts.
- tsx - TypeScript execution and bundling; simplifies development and MCP server startup.

## Configuration

**Environment:**
- `OLLAMA_URL` - Ollama service endpoint (default: `http://localhost:11434`)
- `EMBED_MODEL` - Embedding model name (default: `nomic-embed-text`, 768 dimensions)
- `SYNAPSE_DB_PATH` - LanceDB database directory (default: `./.synapse`)

**Build:**
- `tsconfig.json` - TypeScript configuration (compiler options, paths, targets)
- No additional build configuration files needed (tsx handles execution directly)

## Platform Requirements

**Development:**
- Node.js 18 or later
- npm (or compatible package manager)
- TypeScript 5.x compiler
- Ollama service running locally with `nomic-embed-text` model available
- Supported source code formats: TypeScript, Python, Rust (for code indexing)

**Production/Runtime:**
- Node.js 18+
- Ollama service accessible at configured `OLLAMA_URL`
- Filesystem access for LanceDB embedded database (stored in `SYNAPSE_DB_PATH`)
- MCP client (Claude Code or other MCP-compatible AI)

**Database:**
- LanceDB uses embedded SQLite + local file storage; no separate database server required
- Database directory created at runtime in `.synapse/` (configurable)
- Requires read/write access to filesystem

## Deployment Model

**MCP Server:**
- Runs as a subprocess controlled by Claude Code (or other MCP client)
- Communication via stdio (standard input/output)
- Entry point: `npx synapse-mcp` or `tsx src/index.ts`
- Single-process, non-distributed architecture

**Embedding Service:**
- External dependency: Ollama must be running separately
- Called via HTTP POST requests to `/api/embed` endpoint
- Non-blocking health check on startup; reads continue if Ollama unavailable
- Write operations (store_document, index_codebase) fail fast if Ollama unreachable (prevents corrupting vector space)

---

*Stack analysis: 2026-02-27*
