# Architecture Research

**Domain:** Database-backed MCP server — project knowledge + code search (Synapse)
**Researched:** 2026-02-27
**Confidence:** HIGH (LanceDB, MCP SDK patterns verified via official docs; tree-sitter patterns MEDIUM via multiple sources)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     MCP Host (Claude Code / AI Agent)            │
│                     stdio transport (JSON-RPC 2.0)               │
└──────────────────────────────┬───────────────────────────────────┘
                               │ stdin/stdout
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MCP Transport Layer                            │
│            StdioServerTransport  (single connection)             │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MCP Tools Layer (server.ts)                    │
│  McpServer   ─── tool registration via server.tool(name, zod, fn)│
│                                                                   │
│  Document Tools:            Code Tools:                          │
│  init_project               index_codebase                       │
│  store_document             search_code                          │
│  query_documents            get_index_status                     │
│  semantic_search                                                  │
│  get_smart_context                                                │
│  link_documents                                                   │
│  update_document                                                  │
│  delete_document                                                  │
│  project_overview                                                 │
└──────┬───────────────────────┬──────────────────────────────────┘
       │                       │
       ▼                       ▼
┌──────────────┐     ┌─────────────────────────────────────────────┐
│  Query Layer │     │              Write Layer                     │
│              │     │                                              │
│ hybrid-      │     │  Chunking            Code Indexer            │
│ search.ts    │     │  ─────────           ───────────             │
│ (RRF merge)  │     │  chunker.ts          indexer.ts              │
│              │     │  strategies.ts       ast-chunker.ts          │
│ graph-       │     │  configs.ts          file-scanner.ts         │
│ traversal.ts │     │                      hash-tracker.ts         │
│ (1-hop)      │     │                      language-support.ts     │
└──────┬───────┘     └────────────┬────────────────────────────────┘
       │                          │
       │  ┌───────────────────────┘
       │  │
       ▼  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Embedding Service                               │
│         embedding-service.ts   (Ollama, fail-fast)               │
│         POST http://localhost:11434/api/embed                     │
│         model: nomic-embed-text  |  dims: 768  |  ctx: 8192      │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   LanceDB (embedded, Lance format)                │
│                                                                   │
│  ┌─────────────┐ ┌───────────────┐ ┌──────────────┐             │
│  │  documents  │ │  code_chunks  │ │relationships │             │
│  │  (per chunk)│ │  (per symbol) │ │  (graph)     │             │
│  │  vector FTS │ │  vector FTS   │ └──────────────┘             │
│  └─────────────┘ └───────────────┘                               │
│  ┌─────────────┐ ┌───────────────┐                               │
│  │ project_meta│ │ activity_log  │                               │
│  └─────────────┘ └───────────────┘                               │
│                                                                   │
│  Storage: ./.synapse/   (configurable via --db flag)             │
└──────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `server.ts` / MCP Tools Layer | Tool registration, input validation (Zod), routing calls to services | Chunking layer, Code Indexer, Query Layer, LanceDB connection |
| `embedding-service.ts` | Ollama HTTP calls, fail-fast error propagation, health check on startup | Ollama process (external), called by store_document and indexer |
| `chunking/` | Content-type-aware document splitting before embedding | Called by store_document tool; returns chunks to be embedded |
| `code/` | Tree-sitter AST parsing, file scanning, hash-based incremental state, auto-relationship extraction | Called by index_codebase tool; writes to code_chunks + relationships tables |
| `query/hybrid-search.ts` | RRF merge of vector search + FTS results from LanceDB | Called by semantic_search, search_code, get_smart_context |
| `query/graph-traversal.ts` | 1-hop relationship expansion given starting doc_ids | Called by get_smart_context (detailed phase) |
| `db/connection.ts` | LanceDB connect, table open/create, index creation | Called once at startup; table handles passed to all other layers |
| `db/schema.ts` | Apache Arrow schema definitions for all 5 tables | Imported by connection.ts; defines columns and vector dimensions |

---

## Recommended Project Structure

```
src/
├── index.ts                    # Entry point: parse args, call server start
├── server.ts                   # McpServer instantiation + all tool registrations
├── config.ts                   # CLI arg parsing (--db path), env vars (OLLAMA_URL, EMBED_MODEL)
│
├── db/
│   ├── connection.ts           # lancedb.connect(), table open/create, index creation
│   └── schema.ts               # Apache Arrow schemas for all 5 tables
│
├── embeddings/
│   └── embedding-service.ts    # OllamaProvider, health check, single + batch embed
│
├── chunking/
│   ├── chunker.ts              # Dispatcher: picks strategy by doc category
│   ├── strategies.ts           # semantic_section, paragraph, fixed_size implementations
│   └── configs.ts              # Per-category max_chars, overlap, strategy defaults
│
├── tools/
│   ├── init-project.ts
│   ├── store-document.ts
│   ├── query-documents.ts
│   ├── semantic-search.ts
│   ├── smart-context.ts
│   ├── link-documents.ts
│   ├── update-document.ts
│   ├── delete-document.ts
│   ├── project-overview.ts
│   ├── index-codebase.ts
│   ├── search-code.ts
│   └── index-status.ts
│
├── code/
│   ├── indexer.ts              # Orchestrates full/incremental indexing, auto-relationship generation
│   ├── ast-chunker.ts          # tree-sitter parse → symbol extraction → chunk records
│   ├── file-scanner.ts         # Recursive scan, .gitignore respect (ignore package)
│   ├── hash-tracker.ts         # SHA-256 per file, stored in project_meta config JSON
│   └── language-support.ts     # Extension → language map, grammar loader
│
├── query/
│   ├── hybrid-search.ts        # RRF(k=60) merge of vector + FTS result lists
│   └── graph-traversal.ts      # 1-hop expand: fetch relationships, return adjacent doc_ids
│
├── types/
│   ├── documents.ts            # DocumentRow type, category/phase/status enums
│   ├── code.ts                 # CodeChunkRow, language and symbol_type enums
│   ├── relationships.ts        # RelationshipRow, relationship_type enum
│   └── project.ts              # ProjectMetaRow, ActivityLogRow
│
└── utils/
    ├── uuid.ts                 # UUID v4 generation
    └── token-estimator.ts      # Rough token count from character count
```

### Structure Rationale

- **`db/`:** Isolated database layer. Only place that touches LanceDB APIs — makes swapping storage possible and keeps connection lifecycle in one file.
- **`embeddings/`:** Single embedding provider with explicit fail-fast contract. Isolated so the fail-fast behavior is tested independently.
- **`chunking/`:** Separate from tools so chunking strategies can be unit-tested without MCP overhead.
- **`code/`:** Code indexing is a distinct pipeline with its own state (hash tracker) and dependencies (tree-sitter). Keeping it separate from `tools/` prevents tools from becoming monolithic.
- **`query/`:** Pure computation — RRF and graph traversal have no I/O side effects and can be unit tested in isolation.
- **`tools/`:** Thin orchestration layer. Each file imports from other layers and handles MCP-specific concerns (Zod validation, content response format). Avoids business logic here.
- **`types/`:** Shared types not owned by any single component.

---

## Architectural Patterns

### Pattern 1: MCP Tool Registration with Zod

**What:** Each tool is registered on `McpServer` with a Zod input schema and an async handler. The SDK validates inputs before calling the handler.
**When to use:** Every tool in the system — this is the MCP SDK standard pattern.
**Trade-offs:** Zod adds a dependency but provides runtime validation and auto-generates JSON Schema for tool discovery. The McpServer class handles JSON-RPC protocol details.

**Example:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "synapse", version: "1.0.0" });

server.tool(
  "store_document",
  "Store and embed a project document into Synapse",
  {
    title: z.string().describe("Human-readable document title"),
    content: z.string().describe("Full markdown content to chunk and embed"),
    category: z.enum(["requirement", "architecture_decision", "design_pattern"])
      .describe("Document category determines chunking strategy"),
    phase: z.enum(["inception", "elaboration", "construction"]).optional()
      .describe("Project phase this document belongs to"),
    tags: z.array(z.string()).optional()
      .describe("Searchable tags for filtering"),
    doc_id: z.string().optional()
      .describe("Provide to update an existing document (creates new version)"),
  },
  async (args) => {
    const result = await storeDocument(args); // delegates to business logic
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Important:** All Zod fields need `.describe()` calls — MCP clients use these descriptions to help the LLM understand parameters. Missing descriptions degrade LLM tool use quality.

---

### Pattern 2: LanceDB Table Schema with Apache Arrow

**What:** LanceDB tables are defined using Apache Arrow schemas. The vector column must specify fixed dimensions matching the embedding model.
**When to use:** Table initialization in `db/connection.ts` on first run.
**Trade-offs:** Arrow schema is verbose but enforces types at the storage level. Schema evolution requires explicit migration or table recreation.

**Example:**
```typescript
import * as arrow from "apache-arrow";
import * as lancedb from "@lancedb/lancedb";

const documentsSchema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false),
  new arrow.Field("doc_id", new arrow.Utf8(), false),
  new arrow.Field("chunk_index", new arrow.Int32(), false),
  new arrow.Field("content", new arrow.Utf8(), false),
  new arrow.Field("summary", new arrow.Utf8(), false),
  new arrow.Field(
    "vector",
    new arrow.FixedSizeList(768, new arrow.Field("item", new arrow.Float32())),
    false
  ),
  new arrow.Field("category", new arrow.Utf8(), false),
  new arrow.Field("status", new arrow.Utf8(), false),
  new arrow.Field("tags", new arrow.Utf8(), false),       // JSON-serialized array
  new arrow.Field("project_id", new arrow.Utf8(), false),
  new arrow.Field("created_at", new arrow.Utf8(), false),
]);

const db = await lancedb.connect("./.synapse");
const table = await db.createTable("documents", [], { schema: documentsSchema });

// Create vector index (needs at least ~1000 rows to be effective)
await table.createIndex("vector", {
  config: lancedb.Index.ivfPq({ numPartitions: 256, numSubVectors: 96 }),
});

// Create FTS index
await table.createIndex("content", {
  config: lancedb.Index.fts({ lowerCase: true, stem: true }),
});
```

**Note on index timing:** LanceDB recommends creating ANN vector indexes only after accumulating a few thousand rows. For v1 with small initial datasets, brute-force search is faster and correct. Add index creation to `init_project` but make it conditional on row count, or defer to a maintenance command.

---

### Pattern 3: Hybrid Search with Reciprocal Rank Fusion

**What:** Run vector search and FTS in parallel, merge ranked lists using RRF(k=60). No score normalization needed — RRF uses rank positions only.
**When to use:** Default for `semantic_search`, `search_code`, and the retrieval phase of `get_smart_context`.
**Trade-offs:** Two queries instead of one, but results are significantly better than either alone. RRF is simpler than learned reranking and needs no training data.

**Example:**
```typescript
import * as lancedb from "@lancedb/lancedb";

async function hybridSearch(
  table: lancedb.Table,
  query: string,
  queryVector: number[],
  limit: number
) {
  const reranker = new lancedb.rerankers.RRFReranker();

  const results = await table
    .query()
    .nearestTo(queryVector)             // vector branch
    .fullTextSearch(query)              // FTS branch
    .rerank(reranker)                   // RRF merge
    .select(["id", "doc_id", "content", "summary", "category"])
    .limit(limit)
    .toArray();

  return results;
}
```

**Important:** The FTS index must exist before calling `.fullTextSearch()`. If it doesn't exist, LanceDB throws. Guard with a readiness check at startup.

---

### Pattern 4: Tree-Sitter AST Symbol Extraction

**What:** Parse source files with tree-sitter, walk the AST to extract function/class boundaries, emit one chunk per top-level symbol (plus sub-chunks for methods).
**When to use:** `ast-chunker.ts` during `index_codebase`. Applied to every .ts/.py/.rs file.
**Trade-offs:** AST parsing is fast and incremental (tree-sitter is used by VS Code and Neovim at editor speed). The main complexity is handling per-language node type differences.

**Example:**
```typescript
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

function extractSymbols(source: string, filePath: string): CodeChunk[] {
  const tree = parser.parse(source);
  const chunks: CodeChunk[] = [];

  function walk(node: Parser.SyntaxNode, scopeChain: string) {
    if (node.type === "function_declaration" || node.type === "class_declaration") {
      const name = node.childForFieldName("name")?.text ?? "anonymous";
      const symbolType = node.type === "function_declaration" ? "function" : "class";
      chunks.push({
        symbolName: name,
        symbolType,
        scopeChain: scopeChain ? `${scopeChain}.${name}` : name,
        content: source.slice(node.startIndex, node.endIndex),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    }
    for (const child of node.children) {
      walk(child, /* update scope */);
    }
  }

  walk(tree.rootNode, "");
  return chunks;
}
```

**Important:** tree-sitter node type names differ per language. Maintain a per-language node type map in `language-support.ts` rather than hardcoding in `ast-chunker.ts`.

---

### Pattern 5: Two-Phase Context Assembly (Smart Context)

**What:** Phase 1 returns summaries only (2k-4k tokens). The agent decides what to fetch. Phase 2 returns full content for selected doc_ids plus 1-hop graph neighbors.
**When to use:** `get_smart_context` exclusively — the agent should always drive what it loads.
**Trade-offs:** Requires two round-trips but prevents context smearing (irrelevant chunks filling the context window). Mirrors how a developer scans an index then opens specific files.

**Data flow:**
```
Agent calls get_smart_context(task="implement auth", depth="overview")
    │
    ▼
Embed task description → vector query
Run hybrid search on documents + code_chunks (top 15 each) → RRF merge
Deduplicate by doc_id, pick first chunk per doc as representative
Return: [{ doc_id, title, category, relevance_score, summary }]  -- ~3k tokens
    │
    ▼
Agent reviews list, picks doc_ids: ["uuid-1", "uuid-4"]
Agent calls get_smart_context(doc_ids=["uuid-1","uuid-4"], depth="detailed")
    │
    ▼
Fetch all chunks for requested doc_ids
Run graph_traversal(doc_ids) → 1-hop neighbors from relationships table
Assemble sections: requirements, ADRs, patterns, code, risks
Truncate to max_tokens budget
Return structured context bundle with source attribution
```

---

### Pattern 6: Fail-Fast Embedding Service

**What:** On startup, attempt a non-blocking health check to Ollama. If write operations (store_document, index_codebase) are called and Ollama is unavailable, throw a clear error immediately — do not silently continue.
**When to use:** embedding-service.ts is the single chokepoint for all embedding calls.
**Trade-offs:** Hard fail on write operations is intentional. Mixing embeddings from different models or at different times with different models fractures the vector space — similarity scores become meaningless across mixed populations. Read operations (semantic_search, query_documents) continue working because they embed the query at call time and compare against existing vectors (same model assumption).

```typescript
class EmbeddingService {
  private isAvailable = true;

  async healthCheck(): Promise<void> {
    // Called at startup, non-blocking — logs warning, does NOT throw
    try {
      await fetch(`${this.ollamaUrl}/api/tags`);
      this.isAvailable = true;
    } catch {
      this.isAvailable = false;
      console.warn("Ollama unavailable — write operations will fail until Ollama is reachable");
    }
  }

  async embed(text: string): Promise<number[]> {
    // Called on every write — throws if unavailable
    if (!this.isAvailable) {
      throw new Error(
        "Ollama embedding service is not available. " +
        "Ensure Ollama is running with nomic-embed-text loaded. " +
        "Read-only queries still work."
      );
    }
    // ... actual embed call
  }
}
```

---

### Pattern 7: Versioning via Superseded Rows (Append-Only)

**What:** LanceDB's Lance format is append-optimized. Rather than updating rows in-place, new document versions are inserted with `status: "superseded"` on old chunks and a new `version` number on new chunks. The same `doc_id` spans both the old and new versions.
**When to use:** Whenever `store_document` is called with an existing `doc_id`.
**Trade-offs:** Queries must filter `status != "superseded"` by default. Storage grows with each update. This is acceptable for documentation-scale data and preserves full history. Hard delete is available via `delete_document(hard_delete=true)`.

---

### Pattern 8: Incremental Code Indexing via File Hashing

**What:** Store SHA-256 hash per file in `project_meta.config` JSON. On `index_codebase`, compare current hash against stored hash. Only re-parse and re-embed changed files. Remove code_chunks rows for deleted files.
**When to use:** `index_codebase` (default mode). `full_reindex=true` bypasses this.
**Trade-offs:** File-level granularity is coarse but simple. A file with one changed line is re-chunked entirely. This is acceptable — LanceDB appends are fast and the re-embedding cost is the real bottleneck.

---

## Data Flow

### Write Flow: Document Storage

```
Agent calls store_document(title, content, category, tags)
    │
    ▼
Zod validation (server.ts)
    │
    ▼
Chunker.chunk(content, category)
  → picks strategy (semantic_section / paragraph / fixed_size)
  → splits content into N chunks with overlap
  → prepends context header: "Document: {title} | Section: {header}"
    │
    ▼
EmbeddingService.embedBatch(chunks)
  → POST /api/embed to Ollama  [fail-fast if unavailable]
  → returns float32[768] per chunk
    │
    ▼
If doc_id provided:
  → LanceDB UPDATE: set status="superseded" on existing doc_id chunks
New chunks → INSERT into documents table (new version number)
If related_to provided → INSERT into relationships table
INSERT into activity_log
    │
    ▼
Return { doc_id, chunk_count, version, token_estimate }
```

### Write Flow: Code Indexing

```
Agent calls index_codebase(root_path)
    │
    ▼
FileScanner.scan(root_path)
  → recursive walk, respects .gitignore
  → filters by .ts / .tsx / .py / .rs extensions
  → returns [filePath, ...]
    │
    ▼
HashTracker.getChangedFiles(files)
  → load stored hashes from project_meta.config
  → SHA-256 each current file
  → return { changed: [], deleted: [], unchanged: [] }
    │
    ▼
For each changed file:
  AstChunker.parse(filePath, source)
    → tree-sitter parse → AST
    → walk AST, extract symbols (function/class/method/etc)
    → extract imports for relationship generation
    → return [CodeChunk, ...]
  EmbeddingService.embedBatch(chunks)
    → prepend: "File: {path} | {symbol_type}: {scope_chain}\nImports: {imports}"
    → POST to Ollama
  INSERT chunks into code_chunks table
    │
    ▼
Auto-relationship generation:
  → resolve import paths to file paths
  → DELETE old "ast_import" relationships for changed files
  → INSERT new depends_on / child_of relationships
    │
    ▼
For each deleted file:
  → DELETE from code_chunks WHERE file_path = deletedPath
  → DELETE relationships WHERE source="ast_import" AND source_doc_id contains file
    │
    ▼
HashTracker.save(updatedHashes)
Return { files_scanned, files_indexed, chunks_created, skipped_unchanged }
```

### Read Flow: Hybrid Search

```
Agent calls semantic_search(query, doc_type?, tags?, limit?)
    │
    ▼
EmbeddingService.embed(query)  → float32[768]
    │
    ▼
HybridSearch.search(table, query, queryVector, filters, limit)
  → table.query()
       .nearestTo(queryVector)      // vector branch: cosine similarity
       .fullTextSearch(query)       // FTS branch: BM25 Tantivy
       .rerank(RRFReranker)         // merge via rank positions
       .where("category = ? AND status = 'active'")  // metadata filter
       .limit(limit)
       .toArray()
    │
    ▼
Filter by min_relevance, trim to token_budget
Return ranked results with relevance scores
```

### Read Flow: Smart Context (Two-Phase)

```
Phase 1 — Overview:
Agent calls get_smart_context(task_description, depth="overview")
  → embed task → hybrid search documents (top 15) + code_chunks (top 15)
  → RRF merge across both result lists
  → deduplicate: one representative chunk per doc_id
  → fetch summary field (or first 100 tokens of content) per doc
  → return: [{ doc_id, title, category, relevance_score, summary }]

Phase 2 — Detailed:
Agent calls get_smart_context(doc_ids=[...], depth="detailed")
  → fetch ALL chunks WHERE doc_id IN (requested_ids) AND status != "superseded"
  → graph_traversal(doc_ids) → 1-hop neighbors via relationships table
  → assemble into sections: requirements, ADRs, patterns, code, risks
  → truncate to max_tokens budget
  → return structured context bundle
```

---

## Suggested Build Order

This order respects dependencies — each layer is testable before the next is added.

| Order | Component | Depends On | What You Can Test |
|-------|-----------|------------|-------------------|
| 1 | `types/` | Nothing | Type compilation only |
| 2 | `db/schema.ts` | `types/` | Schema parses without error |
| 3 | `db/connection.ts` | `schema.ts` | LanceDB connects, tables and indexes created |
| 4 | `embeddings/embedding-service.ts` | Nothing (calls Ollama HTTP) | Health check, single embed, fail-fast behavior |
| 5 | `chunking/` | `types/` | Chunking strategies in pure unit tests, no DB |
| 6 | `utils/` | Nothing | Token estimator, UUID generation |
| 7 | `tools/init-project.ts` | `db/`, `types/` | End-to-end: project created, tables initialized |
| 8 | `tools/store-document.ts` | `chunking/`, `embeddings/`, `db/` | Chunk → embed → insert round trip |
| 9 | `query/hybrid-search.ts` | `db/` | Hybrid search returns ranked results |
| 10 | `tools/semantic-search.ts` | `query/`, `embeddings/`, `db/` | Full search flow |
| 11 | `query/graph-traversal.ts` | `db/` | 1-hop traversal from relationships table |
| 12 | `tools/smart-context.ts` | `query/`, `db/` | Two-phase context assembly |
| 13 | `tools/query-documents.ts`, `tools/update-document.ts`, `tools/delete-document.ts`, `tools/link-documents.ts`, `tools/project-overview.ts` | `db/` | CRUD operations |
| 14 | `code/language-support.ts` | Nothing | Extension detection, grammar load |
| 15 | `code/file-scanner.ts` | `language-support.ts` | Scan finds .ts/.py/.rs, respects .gitignore |
| 16 | `code/hash-tracker.ts` | `db/` | Hash read/write from project_meta config |
| 17 | `code/ast-chunker.ts` | `language-support.ts` | AST parse → symbol extraction (pure) |
| 18 | `code/indexer.ts` | All `code/`, `embeddings/`, `db/` | Full indexing pipeline |
| 19 | `tools/index-codebase.ts`, `tools/search-code.ts`, `tools/index-status.ts` | `code/`, `query/`, `db/` | Code indexing + search flow |
| 20 | `server.ts` + `index.ts` | All tools | Full MCP server wires everything |

**Phase 1 MVP (document tools working):** Steps 1-13 + 20
**Phase 2 (code indexing):** Steps 14-19
**Phase 3 (full integration + e2e tests):** Verify cross-table smart context with both docs and code

---

## Anti-Patterns

### Anti-Pattern 1: Business Logic in Tool Handlers

**What people do:** Put chunking, embedding, and search logic directly inside tool handler functions in `server.ts` or individual `tools/*.ts` files.
**Why it's wrong:** Tool handlers become untestable (require a running MCP server). Logic can't be shared between tools. File grows to 500+ lines.
**Do this instead:** Tool handlers are thin orchestrators. They validate input (Zod), call service functions, and format output. All logic lives in `chunking/`, `code/`, `query/`, `embeddings/`.

### Anti-Pattern 2: Creating Vector Indexes Before Loading Data

**What people do:** Call `table.createIndex("vector", ...)` immediately after `createTable()` with an empty table.
**Why it's wrong:** LanceDB IVF-based indexes need data for training partitions. Creating an index on zero rows produces an unusable index or throws. Brute-force search is correct and fast for small tables.
**Do this instead:** Create the vector index after `init_project` completes its seed document insertions, or gate index creation on row count (create only when > 1000 rows).

### Anti-Pattern 3: Silent Embedding Failure

**What people do:** Catch Ollama connection errors and continue inserting documents with empty or zero vectors.
**Why it's wrong:** Zero vectors destroy the vector space. Similarity searches return garbage — every document is equidistant. This is worse than having no documents at all. The failure is silent and hard to detect later.
**Do this instead:** Fail-fast. Throw on embed failure. Let the tool return an error to the agent. Data integrity > availability for write operations.

### Anti-Pattern 4: Filtering Status After Vector Search

**What people do:** Run vector search with no filter, retrieve all versions including superseded ones, then filter in application code.
**Why it's wrong:** Superseded chunks pollute the top-k results. The vector search returns k results total, and if 60% are old versions, the agent sees stale content.
**Do this instead:** Apply `WHERE status != 'superseded'` as a pre-filter in LanceDB before the vector search. LanceDB supports metadata pre-filtering before ANN search.

### Anti-Pattern 5: One Table for Documents and Code

**What people do:** Store document chunks and code chunks in the same table with a `source_type` column.
**Why it's wrong:** Documents and code have different schemas (code has `symbol_type`, `scope_chain`, `file_path`, `start_line`; documents have `category`, `phase`, `priority`). Mixed schemas require many nullable columns. Code indexing lifecycle (triggered by file changes) is independent from document lifecycle. Queries on one type scan the other unnecessarily.
**Do this instead:** Separate `documents` and `code_chunks` tables with purpose-built schemas. Join happens at the query layer (hybrid-search.ts and smart-context.ts search both and merge results).

### Anti-Pattern 6: Storing Tags as LanceDB Array Type

**What people do:** Store tags as a native Arrow `List<Utf8>` column expecting bitmap index support for array values.
**Why it's wrong:** LanceDB bitmap indexes don't support array types. Tag filtering requires application-level filtering which is slower.
**Do this instead:** Store tags as `JSON.stringify(["tag1", "tag2"])` in a Utf8 column. Filter with a LIKE query or deserialize in application code after fetching results. At v1 scale this is fast enough.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Ollama | HTTP POST to `$OLLAMA_URL/api/embed` (default: localhost:11434) | Fail-fast on write ops. Non-blocking health check on startup. Configurable via `OLLAMA_URL` env var. |
| tree-sitter grammars | Native Node.js bindings via `tree-sitter` npm package + language packages (`tree-sitter-typescript`, `tree-sitter-python`, `tree-sitter-rust`) | Grammar loading happens at indexer init. Node.js binding uses C extension (prebuilt binaries). |
| LanceDB | In-process embedded library — no network, no external process | Data stored in `.synapse/` directory. Single connection per server process. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Tools → Chunking | Direct function call | `chunker.ts` is pure (no I/O), returns chunks synchronously |
| Tools → EmbeddingService | Async HTTP via `embedding-service.ts` | Single instance shared across all tools. Fail-fast. |
| Tools → DB | Async LanceDB table methods | Table handles initialized at startup, passed to tools or accessed via singleton |
| Code Indexer → EmbeddingService | Same async HTTP path as document tools | Same singleton, same fail-fast behavior |
| Query Layer → DB | Direct LanceDB query builder methods | Hybrid search builds query chain (nearestTo + fullTextSearch + rerank) |
| Smart Context → Query + Graph | Calls hybridSearch then graphTraversal | Sequential: search first, expand second |
| server.ts → All Tools | Import + direct call inside handler | Tool handlers call service functions, return MCP content array |

---

## Scaling Considerations

This is a single-user, embedded, local tool. Scaling in the traditional sense does not apply. The relevant scaling axis is **codebase size and document count**.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k chunks (small project) | Brute-force ANN search (no index). Index creation deferred. Sub-100ms queries. |
| 1k-50k chunks (medium codebase ~10k files) | Create IVF_HNSW_SQ vector index. FTS index already in place. BTree indexes on `project_id`, `file_path`. |
| 50k-500k chunks (large monorepo) | Increase `numPartitions` in IVF config. Consider `IVF_HNSW_SQ` over `IVF_PQ` for better recall. Incremental indexing becomes critical. Hash tracking saves substantial embedding cost. |
| Multiple projects (separate `project_id`) | All tables already include `project_id`. BTree index on `project_id` ensures cross-project queries are fast. No architecture change needed. |

**First bottleneck:** Embedding throughput from Ollama. `nomic-embed-text` on CPU is ~50-100 tokens/second. A 10k-file codebase initial index takes minutes. Batch embedding (already in plan) is the mitigation.
**Second bottleneck:** LanceDB query time without vector index. Brute-force over 100k+ vectors is slow. Solution: create index after data load.

---

## Sources

- [LanceDB Official Docs — Hybrid Search](https://docs.lancedb.com/search/hybrid-search) — HIGH confidence
- [LanceDB Official Docs — Vector Indexes](https://docs.lancedb.com/indexing/vector-index) — HIGH confidence
- [LanceDB Official Docs — FTS Index](https://docs.lancedb.com/indexing/fts-index) — HIGH confidence
- [LanceDB Official Docs — Versioning](https://docs.lancedb.com/tables/versioning) — HIGH confidence
- [MCP Architecture Overview — Official](https://modelcontextprotocol.io/docs/learn/architecture) — HIGH confidence
- [MCP TypeScript SDK — GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — HIGH confidence
- [MCP Tool Registration Pattern — mcpcat.io guide](https://mcpcat.io/guides/adding-custom-tools-mcp-server-typescript/) — MEDIUM confidence (tutorial, matches SDK docs)
- [tree-sitter Node.js Bindings — GitHub](https://github.com/tree-sitter/node-tree-sitter) — HIGH confidence
- [nomic-embed-text — Ollama Library](https://ollama.com/library/nomic-embed-text) — HIGH confidence (768-dim, 8192 context confirmed)
- [RAG Chunking Strategy Benchmark 2026 — Medium](https://medium.com/@derrickryangiggs/rag-pipeline-deep-dive-ingestion-chunking-embedding-and-vector-search-abd3c8bfc177) — MEDIUM confidence
- [GraphRAG traversal patterns — Elastic blog](https://www.elastic.co/search-labs/blog/rag-graph-traversal) — MEDIUM confidence
- [LanceDB MCP server reference implementation — GitHub](https://github.com/RyanLisse/lancedb_mcp) — MEDIUM confidence (community project, shows real patterns)

---

*Architecture research for: Synapse — Database-backed MCP server (project knowledge + code search)*
*Researched: 2026-02-27*
