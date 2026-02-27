# Stack Research

**Domain:** Database-backed MCP server with vector search and AST-aware code indexing
**Project:** Synapse
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH (most findings verified via official docs/npm; a few version details from WebSearch only)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.x (latest) | Primary language | Type safety for complex schemas; required by MCP SDK; de-facto standard for Node.js tooling |
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP server scaffolding, tool registration, stdio transport | Official Anthropic SDK; v1.x is the production-recommended branch; v2 pre-alpha released but not stable until Q1 2026 |
| `@lancedb/lancedb` | 0.26.2 | Embedded vector database (documents + code_chunks tables) | Zero-config embedded deployment, native vector + FTS + scalar indexes in one library, Lance columnar format is append-friendly for versioned rows, TypeScript-native SDK |
| `tree-sitter` | 0.25.1 | AST parsing for code indexing | Node-API bindings (stable, no NAN), incremental parsing, industry standard (VS Code, Neovim, GitHub), single API for multi-language grammars |
| `zod` | 4.x (latest ~4.3.6) | MCP tool input schema validation | Required peer dependency of `@modelcontextprotocol/sdk` v1.27+; MCP SDK switched Zod peer dep to v4 |
| `apache-arrow` | (peer dep of lancedb) | LanceDB schema definitions for typed tables | Required for defining Arrow schemas with typed vector columns in `@lancedb/lancedb` |

**CRITICAL VERSION NOTE — Zod:** The MCP TypeScript SDK main branch (v2 pre-alpha) requires Zod v4 as a peer dependency. Confirm the v1.27.x production branch also requires Zod v4 before pinning. If v1.27.x still uses Zod v3, you must not install Zod v4 as it has breaking API changes. Verify by checking `@modelcontextprotocol/sdk@1.27.1` peerDependencies in node_modules. **Confidence: MEDIUM** (WebSearch indicates v4 requirement but context was from the v2 pre-alpha README).

### Language Grammars (tree-sitter)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tree-sitter-typescript` | 0.23.2 | TypeScript + TSX grammar for AST parsing | Always — primary target language |
| `tree-sitter-python` | 0.25.0 | Python grammar for AST parsing | Always — v1 language target |
| `tree-sitter-rust` | 0.24.0 | Rust grammar for AST parsing | Always — v1 language target |

**Note on grammar version pinning:** Grammar packages version independently from `tree-sitter` core. The grammar package versions above were last published 5-9 months ago; they target tree-sitter core 0.22+ (Node-API era). Confirm compatibility with `tree-sitter@0.25.1` before pinning. If you see "node type 'function_declaration' not found" errors, update grammars.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ollama` | latest | Ollama HTTP client for embedding generation | Use the official `ollama` npm package instead of raw `fetch` — handles streaming and typed responses; the embed endpoint is `POST /api/embed` with `model` + `input` array |
| `ignore` | latest | .gitignore-aware file filtering for code scanner | Always — prevents indexing node_modules, .git, build artifacts; same library used by ESLint and Prettier |
| `uuid` | 13.x | UUIDv4/v7 generation for document IDs | Always; alternatively use `crypto.randomUUID()` from Node.js stdlib (available since Node 19.9+) — no dep needed if targeting Node 20+ |

**Alternative to `uuid` package:** Node.js 20+ stdlib provides `crypto.randomUUID()` with no external dependency. Given this is a developer tool requiring a modern Node.js environment anyway, prefer the stdlib. If you need UUIDv7 (sortable by time, better for DB insertion order), the `uuid` package v13 provides `v7()`. **Recommendation: use `crypto.randomUUID()` for simplicity unless UUIDv7 is desired.**

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | Run TypeScript files directly during development | Faster than ts-node (esbuild-based, no type checking); use for `dev` script and quick iteration. Current version: 4.21.0 |
| `vitest` | Unit and integration testing | Current version: ~4.x; Vite-powered, ESM-native, fast; preferred over Jest for ESM + TypeScript projects. Run with `vitest run` (CI) or `vitest watch` (dev) |
| `typescript` | TypeScript compiler | Use for type checking in CI (`tsc --noEmit`); tsx handles runtime transpilation |
| `@types/node` | Node.js type definitions | Required for Buffer, crypto, fs, path types |

---

## Installation

```bash
# Core runtime dependencies
npm install @modelcontextprotocol/sdk @lancedb/lancedb apache-arrow zod

# Embedding client
npm install ollama

# AST parsing
npm install tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-rust

# File scanning utility
npm install ignore

# Dev dependencies
npm install -D typescript tsx vitest @types/node
```

**Post-install check:** Run `node -e "require('@lancedb/lancedb')"` to verify the native binary compiled correctly. LanceDB ships pre-compiled binaries via `napi-rs`; if the binary for your platform is missing, the install will fail with a native module error.

---

## Alternatives Considered

### Vector Database: LanceDB vs ChromaDB vs SQLite-vec vs Qdrant

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@lancedb/lancedb` 0.26.2 | ChromaDB | If you need Python-first API and are OK with a separate server process at scale; not better for TypeScript embedded use case |
| `@lancedb/lancedb` 0.26.2 | `sqlite-vec` + `better-sqlite3` | If you need a single SQLite file, don't need FTS, and have ≤ 100K vectors; simpler but no native FTS or HNSW index |
| `@lancedb/lancedb` 0.26.2 | Qdrant (local) | If you need higher query throughput at 10M+ vectors; Qdrant requires a separate server process (400MB RAM always-on), making it inappropriate for an embedded dev tool |

**Why LanceDB wins for Synapse:** Zero-config embedded deployment (no server process), single library covers vector search + FTS + scalar indexes (bitmap, btree, label-list), native TypeScript SDK, Lance format is append-optimized (matches versioned-row architecture), and real-world benchmarks show 4MB RAM when idle vs Qdrant's 400MB. The "SQLite of vector databases" positioning matches Synapse's zero-ops developer tool goal exactly.

### AST Parsing: tree-sitter vs alternatives

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `tree-sitter` 0.25.1 | `@babel/parser` | If only parsing TypeScript/JSX and you don't need Python/Rust; Babel produces a detailed AST but is TypeScript-only |
| `tree-sitter` 0.25.1 | TypeScript Compiler API (`typescript` package) | If you need full type resolution (not just AST structure); 10x slower, complex API, TypeScript-only |
| `tree-sitter` 0.25.1 | `acorn` / `espree` | JavaScript/TypeScript only, no Python/Rust; fine for single-language tooling |

**Why tree-sitter wins:** Single API surface for TypeScript + Python + Rust, incremental re-parsing (only changed nodes), used by VS Code language server protocol internals, fast (written in C with Node-API bindings), robust error recovery (continues parsing malformed files). For multi-language code indexing, there is no credible alternative.

### Embedding Model: nomic-embed-text v1 vs alternatives

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `nomic-embed-text` (v1, 768-dim via Ollama) | `nomic-embed-text-v1.5` (768-dim) | v1.5 has Matryoshka training — useful if you want to reduce vector dimensions later. At 768 dims, performance is nearly identical (MTEB: v1=62.39, v1.5=62.28). Use v1.5 if you want the option to shrink vectors to 512/256 dims later without re-embedding |
| `nomic-embed-text` | `mxbai-embed-large` (1024-dim) | Higher quality at cost of larger vector storage and slower queries |
| `nomic-embed-text` | OpenAI `text-embedding-3-small` (1536-dim) | Cloud dependency, costs money, breaks offline-capable constraint |
| `nomic-embed-text` | `all-MiniLM-L6-v2` (384-dim) | Faster and smaller but lower quality; nomic-embed-text outperforms on long-context tasks (relevant for code chunks) |

**Recommendation on v1 vs v1.5:** Use `nomic-embed-text` (v1) as specified in the plan for simplicity. If you later want dimension flexibility without re-embedding, switch to v1.5 — but only if upgrading the entire corpus at once (mixing embeddings from different model checkpoints fractures the vector space, consistent with the fail-fast design).

**IMPORTANT:** The Ollama API changed — the current endpoint is `POST /api/embed` (batch-capable, returns `embeddings[]`) not `POST /api/embeddings` (the deprecated single-text endpoint). The `ollama` npm package's `embed()` method uses the correct endpoint automatically. If calling the REST API directly, use `/api/embed`.

### TypeScript Runtime: tsx vs ts-node vs native Node.js

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `tsx` 4.21.0 | `ts-node` | If you need TypeScript type checking at runtime (tsx skips this); for this project, run `tsc --noEmit` separately in CI |
| `tsx` 4.21.0 | Native Node.js `--experimental-strip-types` | Node.js 22.6+ has built-in TypeScript stripping; could eliminate `tsx` dep entirely, but still experimental as of 2026-02 |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `vectordb` (old LanceDB package) | Deprecated; replaced by `@lancedb/lancedb` | `@lancedb/lancedb` |
| `@modelcontextprotocol/sdk` v2 pre-alpha (main branch) | Explicitly marked "not stable, do not use in production until Q1 2026 stable release"; breaking changes ongoing | `@modelcontextprotocol/sdk@1.27.1` |
| `ts-node` | Slower than `tsx`, requires additional peer deps (TypeScript + SWC), complex configuration for ESM | `tsx` |
| `sqlite-vss` | Deprecated; superseded by `sqlite-vec` | `sqlite-vec` (if you ever switch DBs) |
| `NAN`-based tree-sitter grammars | Pre-0.22 grammars used NAN instead of Node-API; will fail with tree-sitter 0.22+ | Grammars 0.22+ (all current official grammars use Node-API) |
| `fetch` for Ollama | Raw fetch is fine but requires handling auth, error parsing, stream management manually | `ollama` npm package — official client with typed responses |
| Zod v3 + MCP SDK v1.27+ | Version conflict risk if SDK v1.27.x requires Zod v4; verify peer deps before mixing | Confirm Zod version from actual SDK peerDependencies |
| `@types/uuid` | Not needed for uuid v13 — the package ships its own TypeScript types | No action needed |

---

## Stack Patterns by Variant

**If you want to skip the `uuid` package:**
- Use `crypto.randomUUID()` from Node.js stdlib (Node 20+)
- No external dependency, same UUIDv4 quality
- Only add `uuid` package if you need UUIDv7 (time-sortable, better for DB ordering)

**If nomic-embed-text is unavailable at startup:**
- Health check on startup: `GET http://localhost:11434/api/tags` — verify model is listed
- Fail-fast on write operations (`store_document`, `index_codebase`)
- Read operations (queries on already-embedded data) continue to work
- Log a clear warning: "Ollama unavailable — write operations disabled. Reads still functional."

**If LanceDB native binary fails to load:**
- This is a platform/architecture issue with pre-compiled napi-rs binaries
- Check if your Node.js version matches the binary target (Node 18, 20, 22 binaries ship)
- `npm rebuild @lancedb/lancedb` to force local compile (requires Rust toolchain)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@lancedb/lancedb@0.26.2` | Node 18, 20, 22 | Pre-compiled binaries for these versions ship; others require local Rust compile |
| `@lancedb/lancedb@0.26.2` | `apache-arrow` (pinned by lancedb) | Do not manually install a different apache-arrow version; let lancedb manage its own arrow dep to avoid type mismatches |
| `tree-sitter@0.25.1` | `tree-sitter-typescript@0.23.2`, `tree-sitter-python@0.25.0`, `tree-sitter-rust@0.24.0` | All grammar packages use Node-API (not NAN); verify these exact versions work together at install time |
| `@modelcontextprotocol/sdk@1.27.1` | `zod@4.x` | Verify: SDK v1.27.x peerDependencies must be checked at install; if v3, use zod@3.x |
| `tsx@4.21.0` | `typescript@5.x` | tsx uses esbuild internally and doesn't require TypeScript to be installed, but type checking via `tsc` still needs the `typescript` package |
| `vitest@4.x` | `typescript@5.x` | No additional config needed for TypeScript tests |

---

## Key API Patterns (Verified)

### MCP Server Setup (v1.27.x)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "synapse", version: "1.0.0" });

// Recommended API (registerTool, not the older server.tool())
server.registerTool(
  "store_document",
  {
    title: "Store Document",
    description: "Store a document chunk in the knowledge base",
    inputSchema: z.object({
      title: z.string(),
      content: z.string(),
      category: z.enum(["requirement", "architecture_decision", ...]),
    }),
  },
  async (args) => {
    // implementation
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### LanceDB Index Creation (Verified)

```typescript
import * as lancedb from "@lancedb/lancedb";

// Vector index — use hnswSq for HNSW + Scalar Quantization
await table.createIndex("vector", { config: lancedb.Index.hnswSq() });

// FTS index
await table.createIndex("content", { config: lancedb.Index.fts() });

// Scalar indexes
await table.createIndex("category", { config: lancedb.Index.bitmap() });
await table.createIndex("project_id", { config: lancedb.Index.btree() });
```

**Note on HNSW:** In LanceDB TypeScript SDK, `Index.hnswSq()` is the top-level HNSW + Scalar Quantization option (not `IVF_HNSW_SQ` as named in Python docs). The `hnswSq()` and `hnswPq()` static methods are confirmed to exist on the `Index` class. Use `hnswSq()` for the documents and code_chunks vector columns.

### LanceDB FTS API (Verified)

```typescript
// Create FTS index
await table.createIndex("content", { config: lancedb.Index.fts() });

// Search using FTS
const results = await table.search("authentication", "fts")
  .select(["id", "content", "category"])
  .limit(20)
  .toArray();
```

### Ollama Embedding (Verified)

```typescript
import ollama from "ollama";

// Single embedding
const response = await ollama.embed({
  model: "nomic-embed-text",
  input: "The quick brown fox",
});
const vector: number[] = response.embeddings[0]; // 768 dimensions

// Batch embedding (multiple strings at once)
const batchResponse = await ollama.embed({
  model: "nomic-embed-text",
  input: ["text one", "text two", "text three"],
});
const vectors: number[][] = batchResponse.embeddings; // one per input
```

---

## Sources

- `@modelcontextprotocol/sdk@1.27.1` — npm registry search + GitHub releases page (https://github.com/modelcontextprotocol/typescript-sdk/releases) — **MEDIUM confidence** (WebSearch confirmed version; main branch README confirmed Zod v4 peer dep but this is the v2 pre-alpha)
- `@lancedb/lancedb@0.26.2` — GitHub releases page (https://github.com/lancedb/lancedb/releases) — **HIGH confidence** (official release page)
- LanceDB `Index` class — official JS SDK reference (https://lancedb.github.io/lancedb/js/classes/Index/) — **HIGH confidence** (official docs, confirmed `hnswSq()`, `fts()`, `bitmap()`, `btree()` methods)
- LanceDB FTS API — official docs (https://docs.lancedb.com/search/full-text-search) via WebSearch — **MEDIUM confidence**
- `tree-sitter@0.25.1` — official docs (https://tree-sitter.github.io/node-tree-sitter/index.html) — **HIGH confidence**
- `tree-sitter-typescript@0.23.2` — WebSearch npm results — **MEDIUM confidence** (version confirmed by multiple sources)
- `tree-sitter-python@0.25.0`, `tree-sitter-rust@0.24.0` — WebSearch npm results — **MEDIUM confidence**
- `zod@4.3.6` — WebSearch npm results (multiple sources agree) — **MEDIUM confidence**
- `tsx@4.21.0` — WebSearch npm results — **MEDIUM confidence**
- `vitest@4.x` — WebSearch (https://vitest.dev/) — **MEDIUM confidence**
- `nomic-embed-text` (768-dim, v1) — official Ollama library page (https://ollama.com/library/nomic-embed-text) — **HIGH confidence**
- Ollama `/api/embed` endpoint — official Ollama docs (https://docs.ollama.com/capabilities/embeddings) — **HIGH confidence**
- LanceDB vs ChromaDB vs Qdrant comparison — multiple WebSearch sources including Zilliz comparison, benchmarks — **MEDIUM confidence**

---

## Open Questions (Verify Before Implementing)

1. **Zod v3 vs v4 in `@modelcontextprotocol/sdk@1.27.1`:** The v2 pre-alpha README says Zod v4 is required. Confirm the v1.27.x production branch has the same requirement by running `cat node_modules/@modelcontextprotocol/sdk/package.json | grep zod` after install. This affects all input schema definitions.

2. **apache-arrow version management:** Do not explicitly install `apache-arrow` unless LanceDB's installation leaves it out. Let `@lancedb/lancedb` pull in its own pinned version. Mismatched arrow versions cause TypeScript type errors that are hard to debug.

3. **`tree-sitter-typescript` grammar version:** Version 0.23.2 was published over a year ago. Check if tree-sitter org has published a newer version that matches tree-sitter core 0.25.x. Run `npm info tree-sitter-typescript versions` to see full list.

4. **LanceDB 0.27.0 breaking change:** v0.27.0-beta.0 changes `create_table()` and `Table.add()` to accept `RecordBatch` directly. Do NOT upgrade to 0.27.x until it reaches stable and you've validated the new insert API pattern. Pin `@lancedb/lancedb` to `"0.26.2"` (exact) in package.json.

---
*Stack research for: Synapse MCP server with embedded vector database and AST-aware code indexing*
*Researched: 2026-02-27*
