# Project Research Summary

**Project:** Synapse
**Domain:** Database-backed MCP server — project knowledge management + AST-aware code search
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH

## Executive Summary

Synapse occupies a genuine gap in the MCP ecosystem: 283+ MCP knowledge/memory servers exist, yet none combine project document management with code search in a single server sharing an embedding pipeline. The closest competitors (ConPort for knowledge, Claude Context for code search) operate as separate servers with no shared context, no unified search, and no intelligent context assembly. Synapse can own the "unified project brain" niche by providing cross-table hybrid search, two-phase smart context assembly, AST-derived relationship graphs, and document versioning — features absent from all surveyed competitors.

The recommended implementation is a TypeScript/Node.js MCP server using LanceDB as an embedded vector database (zero-config, no external process), tree-sitter for multi-language AST parsing, and Ollama with `nomic-embed-text` (768-dim) for local embeddings. This stack is the "SQLite of vector databases" applied to a developer tool: no server processes, no cloud dependencies, no ops overhead. The architecture cleanly separates write paths (chunking, embedding, indexing) from read paths (hybrid search with RRF, graph traversal) with thin tool handlers as orchestration only. Suggested build order progresses types → schema → DB → embedding → document tools → code indexer → full integration, allowing each layer to be tested in isolation.

The top risks are (1) stdout contamination silently breaking the MCP stdio transport — discipline must be established in Phase 1 before any other code is written; (2) embedding dimension mismatch permanently corrupting the LanceDB vector space — validated with an assertion in the embedding service before any insert; and (3) LanceDB fragment accumulation degrading search performance — mitigated by always batching inserts per document, never per chunk. All three risks have known prevention patterns and must be addressed proactively rather than reactively.

---

## Key Findings

### Recommended Stack

The stack is mature and well-suited to the problem. `@modelcontextprotocol/sdk@1.27.1` (production branch) handles MCP protocol scaffolding via stdio transport. `@lancedb/lancedb@0.26.2` provides embedded vector + FTS + scalar indexes in a single library with zero configuration — pin this version exactly, as 0.27.x-beta has a breaking insert API change. `tree-sitter@0.25.1` with three grammar packages (TypeScript, Python, Rust) enables multi-language AST parsing at editor speed. `ollama` npm package handles Ollama embedding calls correctly via the current `/api/embed` batch endpoint. One critical version detail requires on-install verification: the Zod peer dependency (v3 vs v4) for `@modelcontextprotocol/sdk@1.27.1` must be confirmed by inspecting the installed SDK's `package.json` — the v2 pre-alpha mandates Zod v4, but the v1.27.x production branch may still use v3.

**Core technologies:**
- `@modelcontextprotocol/sdk@1.27.1`: MCP server scaffolding, tool registration, stdio transport — official Anthropic SDK, production-stable v1.x branch
- `@lancedb/lancedb@0.26.2`: Embedded vector database — zero-config, covers vector + FTS + scalar indexes natively, 4MB RAM idle vs Qdrant's 400MB
- `tree-sitter@0.25.1` + grammar packages: Multi-language AST parsing — single API for TS/Python/Rust, incremental parsing, robust error recovery
- `nomic-embed-text` via Ollama: Local embedding model, 768-dim, 8192-token context — no cloud dependency, strong MTEB scores for long-context code chunks
- `zod` (version TBD at install): MCP tool input schema validation — required peer dep of MCP SDK; validate version before pinning
- `typescript@5.x` + `tsx@4.21.0` + `vitest@4.x`: TypeScript language, dev-time transpilation (esbuild-based), and testing framework

### Expected Features

The MCP knowledge/code search ecosystem has matured enough that hybrid search (BM25 + vector), AST-aware code chunking, incremental indexing, and multi-project support are table stakes — expected by users, not differentiators. Synapse's differentiators are the features no surveyed tool currently provides together: cross-table unified search, two-phase smart context assembly (prevents context smearing), AST-derived relationship graph with 1-hop traversal, document versioning via append-only superseded rows, and token-budget-aware context assembly.

**Must have (table stakes):**
- `init_project` — creates DB, tables, indexes, seeds starter docs; prerequisite for all other tools
- `store_document` — chunking + embedding + versioning; core write path
- `query_documents` — metadata filter queries (no embedding required; fastest retrieval)
- `semantic_search` — hybrid vector + FTS with RRF; core read path
- `get_smart_context` — two-phase overview + detailed assembly; the flagship differentiator
- `index_codebase` — AST-aware code indexing with incremental SHA-256 hash tracking
- `search_code` — hybrid search over code chunks
- `link_documents` — manual relationship creation
- `update_document`, `delete_document` — lifecycle management
- `project_overview` — agent entry point dashboard
- `get_index_status` — index health visibility

**Should have (competitive differentiators):**
- Two-phase smart context (overview summaries first → agent selects → detailed fetch with 1-hop graph expansion) — no competitor has this
- AST auto-generated relationship graph from import statements — regenerated on every `index_codebase` run, zero manual maintenance
- Document versioning (superseded rows, version counter) — ConPort only does this for Product/Active Context
- Document lifecycle states (draft → active → approved → superseded) — absent from all competitors
- Token-budget-aware result trimming on `get_smart_context` — no competitor has this
- Source attribution on relationships (`manual` vs `ast_import`) — enables selective reindex of only auto-generated edges

**Defer (v2+):**
- Additional language support (Go, Java, C#) — add based on demand, not speculation
- Agent role profiles with per-role context filtering — requires agent identity infrastructure MCP doesn't yet provide
- HTTP/SSE transport — adds auth complexity, no local dev benefit
- Automatic file watching / real-time index — background processes cause orphaning issues (ConPort's documented failure mode)
- Multi-hop graph traversal — exponential blowup risk; 1-hop is the correct v1 constraint
- Cross-encoder reranking — latency cost unvalidated at v1 scale; RRF fusion is sufficient

### Architecture Approach

Synapse follows a layered architecture where the MCP tools layer is a thin orchestration wrapper over four independent service layers: chunking (pure, no I/O), embedding (Ollama HTTP, fail-fast), code indexing (tree-sitter + hash tracker pipeline), and query (hybrid search + graph traversal). LanceDB is accessed exclusively through `db/connection.ts` — no other layer touches the LanceDB API directly. This separation makes every layer independently unit-testable and prevents tool handlers from becoming monolithic. Two tables (`documents` and `code_chunks`) are kept separate by design; their schemas are incompatible and their lifecycles are independent. Smart context merges results at query time.

**Major components:**
1. `server.ts` / MCP Tools Layer — tool registration (Zod validation), routing to service functions, MCP response formatting; thin by design
2. `embeddings/embedding-service.ts` — Ollama HTTP client, startup health check, fail-fast on write operations, batch embedding with size cap
3. `chunking/` — content-type-aware document splitting; semantic_section / paragraph / fixed_size strategies per category
4. `code/` (indexer, ast-chunker, file-scanner, hash-tracker, language-support) — tree-sitter AST pipeline; SHA-256 incremental state; auto-relationship generation from imports
5. `query/` (hybrid-search, graph-traversal) — RRF merge of vector + FTS results; 1-hop relationship expansion; pure computation, no I/O
6. `db/` (connection, schema) — LanceDB connect; 5-table Arrow schema definitions; isolated storage layer
7. `types/` — shared TypeScript interfaces for all rows and enums; owned by no single component

### Critical Pitfalls

1. **stdout contamination kills MCP transport** — Any `console.log()` or dependency startup banner on stdout corrupts the JSON-RPC stream silently. Prevention: configure all logging to stderr from day one (before any other code is written); add a startup test that pipes stdout through a JSON parser.

2. **Embedding dimension mismatch permanently corrupts LanceDB** — Once a wrong-dimension vector is inserted, the table must be dropped and rebuilt. Prevention: assert `vector.length === 768` in the embedding service before every insert; fail fast with a clear message on any mismatch.

3. **LanceDB fragment accumulation degrades search performance** — Each separate `add()` call creates a new fragment; O(N fragments) query complexity causes latency to climb from 10ms to 1s+ after ~50-100 documents. Prevention: always batch all chunks for a document into a single `add()` call, never insert per-chunk in a loop.

4. **FTS index builds asynchronously — hybrid search silently biases to vector-only** — `create_fts_index()` returns immediately; if search is called before the index finishes, FTS contributes nothing to RRF and the bias is invisible. Prevention: implement `waitForIndex()` polling after every index creation; `get_index_status` must expose FTS readiness.

5. **tree-sitter native bindings fail on Node.js version mismatch** — The parser loads a platform-compiled binary; a mismatched `NODE_MODULE_VERSION` causes a crash at parse time (not require time), so the server starts but `index_codebase` silently fails. Prevention: lock Node.js version in `.nvmrc` + `package.json engines`; startup health check must parse a trivial snippet in all 3 languages before accepting connections.

---

## Implications for Roadmap

Based on the architecture's natural dependency order and pitfall prevention requirements, six phases are suggested.

### Phase 1: MCP Foundation and Logging Discipline

**Rationale:** The stdout contamination pitfall (critical, silent, impossible to debug later) must be addressed before a single line of business logic is written. This phase establishes the project structure, logging conventions, and MCP server scaffold. All future phases build on this foundation.

**Delivers:** Running MCP server that accepts connections, registers zero-implementation stub tools, logs to stderr only, and passes a stdout-cleanliness test.

**Addresses:** Project initialization, stdio transport, Zod input validation scaffolding.

**Avoids:** Pitfall 1 (stdout contamination). Pitfall 9 (MCP exceptions swallowed as success — establish error wrapping pattern here).

**Research flag:** Standard pattern, no additional research needed. MCP SDK patterns are well-documented.

---

### Phase 2: Database Schema and Storage Layer

**Rationale:** LanceDB schema is frozen after the first write. All v2 forward-compatibility fields must be defined before any data is written. This phase also establishes the batched insert pattern that prevents fragment accumulation.

**Delivers:** `db/schema.ts` with complete Arrow schemas for all 5 tables (documents, code_chunks, relationships, project_meta, activity_log), including nullable v2 fields. `db/connection.ts` with table creation, gated index creation (after seed data), and `table.optimize()` on startup.

**Addresses:** Versioning schema (version, status columns), multi-project support (project_id columns with BTree index), tag storage as JSON-serialized string (avoids bitmap-on-array issue), forward-compatibility fields.

**Avoids:** Pitfall 4 (fragment accumulation — batch insert pattern established here). Pitfall 8 (schema frozen after first write — define complete schema now). Anti-pattern 5 (one table for docs and code — explicitly separate from the start). Anti-pattern 6 (tags as Arrow List type).

**Research flag:** Standard pattern. LanceDB Arrow schema API is well-documented with high-confidence sources.

---

### Phase 3: Embedding Service

**Rationale:** The embedding service is a shared dependency of both document storage and code indexing. Its fail-fast contract, batch size cap (16 items max), dimension assertion, and Ollama keep-alive configuration must be correct before any other write path is built.

**Delivers:** `embeddings/embedding-service.ts` with startup health check (warm model + verify 768-dim output), batch embedding with size cap, `keep_alive: -1` in every request, exponential backoff retry, and explicit `vector.length === 768` assertion before any insert.

**Addresses:** Fail-fast on write operations, read operations continue without Ollama, OLLAMA_URL env var configurability.

**Avoids:** Pitfall 2 (dimension mismatch). Pitfall 6 (Ollama model unloaded mid-session). Pitfall 7 (Ollama batch size OOM). Anti-pattern 3 (silent embedding failure).

**Research flag:** Standard pattern. Ollama API is well-documented with high-confidence sources.

---

### Phase 4: Document Tools (Core Knowledge Management)

**Rationale:** Document tools (init_project, store_document, query_documents, semantic_search, get_smart_context, link_documents, update_document, delete_document, project_overview) form the first complete vertical slice — a working, testable MCP server. Code indexing is deferred to Phase 5 because document tools don't depend on tree-sitter and are independently testable. Competitive differentiation vs ConPort is fully validated here.

**Delivers:** All 9 document-focused tools working end-to-end. Hybrid search (RRF) over documents table. Two-phase smart context assembly. Manual relationship linking. Document versioning (superseded rows). FTS index with `waitForIndex()` guard. Full error wrapping in every tool handler. `get_smart_context` is the complexity flagship of this phase.

**Addresses:** Table stakes (init, store, query, search, overview). Differentiators (two-phase context, document versioning, lifecycle states, token budget awareness, 1-hop graph traversal, relationship source attribution).

**Avoids:** Pitfall 5 (FTS not ready for hybrid search — waitForIndex() implemented here). Pitfall 9 (MCP exceptions swallowed — error wrapping established in every handler). Anti-pattern 1 (business logic in tool handlers). Anti-pattern 2 (vector index before data). Anti-pattern 4 (filtering superseded after vector search — pre-filter applied).

**Research flag:** `get_smart_context` two-phase design has no verified reference implementation in the ecosystem — this is novel territory. Consider a focused research pass on context assembly patterns before implementing this tool specifically. All other document tools follow well-established patterns.

---

### Phase 5: Code Indexing Pipeline

**Rationale:** Code indexing depends on tree-sitter (native bindings requiring careful setup), file scanning, hash tracking, and the embedding service from Phase 3. It introduces the most complex data flow (AST parse → symbol extract → embed → insert + relationship generation) and the only pitfall with O(memory) risk (tree-sitter memory leak on large codebases). Separating this into its own phase allows isolated testing and clear scope boundaries.

**Delivers:** `code/` directory complete: `language-support.ts` (extension → grammar map), `file-scanner.ts` (gitignore-aware), `hash-tracker.ts` (SHA-256 in project_meta config JSON), `ast-chunker.ts` (symbol extraction with scope_chain, imports), `indexer.ts` (incremental orchestration + auto-relationship generation). Tools: `index_codebase`, `search_code`, `get_index_status`. Startup grammar health check (parse trivial snippets in all 3 languages before accepting connections).

**Addresses:** AST-aware chunking (function/class/method boundaries), incremental indexing (skips unchanged files), auto-generated relationships from imports (replaces not appends on reindex), symbol metadata (scope_chain, imports, exports) in search results, get_index_status for operator visibility.

**Avoids:** Pitfall 3 (tree-sitter Node.js version mismatch — startup health check for all 3 grammars). Pitfall 10 (tree-sitter memory leak — file batch processing with GC yield points, explicit parser release). Integration gotcha (tree-sitter-typescript sub-export for `.typescript` not root).

**Research flag:** This phase has the most implementation risk. Tree-sitter Node-API grammar compatibility (core 0.25.1 vs grammars 0.23-0.25) should be verified against an actual install before finalizing grammar package versions. The tree-sitter memory leak fix should be confirmed present in the targeted version.

---

### Phase 6: Hybrid Search Tuning and Integration Validation

**Rationale:** Hybrid search quality (RRF k parameter, FTS index configuration) can only be validated with real data from both tables. Cross-table `get_smart_context` (searching documents + code_chunks together) needs end-to-end integration testing. RRF k tuning (k=60 default for documents, k=20 for code exact-name queries) requires realistic test cases to validate.

**Delivers:** Tuned hybrid search with domain-specific RRF k values (configurable, not hardcoded). Cross-table smart context validated with both document and code data in LanceDB. Performance validation: fragment count < 100, search latency < 100ms at 10k+ chunks, incremental reindex skips unchanged files (verified by count), auto-relationships replace not append on reindex. Full "Looks Done But Isn't" checklist from PITFALLS.md verified.

**Addresses:** Search quality validation, cross-table integration, performance baselines.

**Avoids:** Pitfall 11 (RRF k not tuned for code search). Fragment accumulation verification. FTS index readiness verification across all tables.

**Research flag:** No additional research needed. This is validation and tuning work against known patterns.

---

### Phase Ordering Rationale

- **Phase 1 must be first:** stdout contamination is silent and permanent until fixed; the logging discipline must predate all other code.
- **Phase 2 before Phase 4:** Schema is immutable after first write; all forward-compatibility columns must exist before any document is stored.
- **Phase 3 before Phases 4 and 5:** Embedding service is a shared dependency of both document storage and code indexing; its fail-fast contract, dimension assertion, and batch cap must be correct before either write path uses it.
- **Phase 4 before Phase 5:** Document tools form a complete vertical slice that validates core architecture patterns (tool handlers, hybrid search, RRF, graph traversal) before introducing tree-sitter's native binary complexity.
- **Phase 5 after Phase 4:** Code indexing builds on the proven embedding service and hybrid search infrastructure; native binding issues are isolated to this phase.
- **Phase 6 last:** Tuning and integration validation requires real data from both tables; it cannot precede the tools that produce that data.

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (get_smart_context):** Two-phase context assembly has no verified reference implementation in the MCP ecosystem. Before implementation, research context assembly patterns in RAG literature and validate the overview-then-detailed workflow with a working prototype.
- **Phase 5 (tree-sitter):** Grammar package compatibility with tree-sitter core 0.25.1 must be verified against an actual `npm install` before finalizing versions. The `CallbackInput` memory leak fix status in the targeted version requires explicit confirmation.

Phases with standard patterns (skip additional research):
- **Phase 1:** MCP SDK stdio scaffold is fully documented with high-confidence official sources.
- **Phase 2:** LanceDB Arrow schema API is well-documented; patterns for all 5 tables are derivable from official docs.
- **Phase 3:** Ollama embedding API and fail-fast embedding service pattern are well-documented.
- **Phase 6:** Tuning and validation work; patterns are established, execution is needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core libraries (LanceDB, MCP SDK, tree-sitter) verified via official docs and release pages. One critical gap: Zod v3 vs v4 in MCP SDK v1.27.1 must be verified at install time — the v2 pre-alpha README confirms Zod v4, but v1.27.x production branch is unconfirmed |
| Features | MEDIUM-HIGH | Ecosystem well-surveyed (9 competitor tools studied). Feature matrix is solid. One LOW-confidence gap: "two-phase context assembly is novel" claim rests on no existing implementation being found — absence of evidence is not evidence of absence |
| Architecture | HIGH | Official LanceDB and MCP SDK docs provide high-confidence patterns for all major components. Tree-sitter patterns are MEDIUM (multiple sources agree). Build order is logical and validated against dependency graph |
| Pitfalls | MEDIUM-HIGH | Majority verified against official docs and GitHub issues with direct links. Two MEDIUM-confidence items: tree-sitter memory leak (single credible technical blog post + source code analysis), RRF k sensitivity (peer-reviewed research + community blog) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Zod version for MCP SDK v1.27.1:** Run `cat node_modules/@modelcontextprotocol/sdk/package.json | grep -A5 peerDependencies` immediately after `npm install` and confirm Zod version before writing any schema code. If v3, do not install Zod v4.

- **tree-sitter grammar compatibility at install time:** After installing `tree-sitter@0.25.1` with all three grammar packages, verify all three load by running the startup health check parsing script. Grammar versions in STACK.md are MEDIUM-confidence; the actual compatible versions may differ.

- **LanceDB `apache-arrow` version management:** Do not explicitly install `apache-arrow`; let `@lancedb/lancedb` manage its own pinned version. Mismatched arrow versions cause TypeScript type errors that are difficult to diagnose.

- **Two-phase smart context novelty:** If a reference implementation is found during planning research for Phase 4, use it. If none exists, the design in ARCHITECTURE.md (overview → agent selection → detailed with graph expansion) is internally consistent and should be prototyped early in Phase 4 before the full tool is built.

- **LanceDB 0.27.x watch:** Pin to `"0.26.2"` (exact) in package.json. The 0.27.x-beta introduces a breaking change to the insert API (`create_table()` and `Table.add()` accept `RecordBatch` directly). Do not upgrade until stable.

---

## Sources

### Primary (HIGH confidence)
- LanceDB Official Docs (docs.lancedb.com) — hybrid search, vector indexes, FTS index, versioning, compaction
- LanceDB JS SDK Reference (lancedb.github.io/lancedb/js) — `Index.hnswSq()`, `Index.fts()`, `Index.bitmap()`, `Index.btree()` methods confirmed
- LanceDB GitHub Releases (github.com/lancedb/lancedb/releases) — version 0.26.2 confirmed
- MCP Official Architecture Docs (modelcontextprotocol.io/docs/learn/architecture) — stdio transport specification
- MCP TypeScript SDK GitHub (github.com/modelcontextprotocol/typescript-sdk) — tool registration pattern
- Ollama Official Library (ollama.com/library/nomic-embed-text) — 768-dim, 8192 context confirmed
- Ollama Embeddings Docs (docs.ollama.com/capabilities/embeddings) — `/api/embed` batch endpoint confirmed
- tree-sitter Node.js Bindings (github.com/tree-sitter/node-tree-sitter) — Node-API binding patterns
- LanceDB GitHub Issues (#213, #1077, #1109, #1281) — fragment accumulation, dimension mismatch behaviors confirmed
- tree-sitter GitHub Issues (#169 node version mismatch, #5171 WASM ABI) — binary compatibility behaviors confirmed
- Ollama GitHub Issues (#3029, #6401) — keep-alive behavior and hang patterns confirmed
- RRF — ACM Transactions on Information Systems — peer-reviewed k parameter analysis

### Secondary (MEDIUM confidence)
- ConPort GitHub (github.com/GreatScottyMac/context-portal) — features and pain points via WebFetch
- Claude Context / Zilliztech GitHub — features and token savings
- CodeGrok MCP (hackernoon.com) — AST chunking architecture details
- MCP server tree-sitter FEATURES.md (github.com/wrale/mcp-server-tree-sitter) — language support comparison
- LanceDB vs ChromaDB vs Qdrant comparison — multiple WebSearch sources, Zilliz comparison
- RAG Chunking Strategy Benchmark 2026 (medium.com) — chunking strategy rationale
- GraphRAG traversal patterns (Elastic blog) — 1-hop graph traversal pattern
- MCP implementation pitfalls (Nearform) — stdout contamination confirmation
- tree-sitter memory leak analysis (cosine.sh/blog) — single credible technical source with source code citations
- RRF domain sensitivity (OpenSearch blog) — k parameter tuning rationale

### Tertiary (LOW confidence)
- MCP Knowledge Bases 2026 roundup (desktopcommander.app) — ecosystem gap analysis; single source, used only to confirm pattern already visible in competitor analysis
- WebSearch "MCP server code search semantic indexing features 2026" — ecosystem overview, validated by above sources

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
