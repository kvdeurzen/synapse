# Pitfalls Research

**Domain:** Database-backed MCP server with vector search and code indexing (LanceDB + tree-sitter + Ollama + MCP SDK)
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH (majority verified against official docs, GitHub issues, and multiple sources)

---

## Critical Pitfalls

### Pitfall 1: stdout Contamination Silently Kills the MCP Transport

**What goes wrong:**
Any output written to stdout — `console.log()`, a dependency that prints a startup banner, a debug statement — corrupts the JSON-RPC stream. The MCP client receives data that doesn't parse as valid JSON-RPC and silently drops the connection. The server process continues running; the client hangs or shows cryptic errors like "Server transport closed unexpectedly" or "serde error: data did not match any variant of untagged enum JsonRpcMessage". This is the single most common MCP implementation failure.

**Why it happens:**
The stdio transport uses stdout exclusively for JSON-RPC messages (newline-delimited JSON). Developers habitually reach for `console.log()` for debugging. Third-party libraries (tree-sitter grammar loaders, LanceDB startup messages, node-gyp binding loaders) may also write to stdout. Any single stray character breaks the framing.

**How to avoid:**
- Redirect ALL logging to stderr from day one. Never use `console.log()` anywhere in the server code path.
- Use a logger configured to write to stderr: `new Console({ stdout: process.stderr, stderr: process.stderr })` or a library like `pino` with `destination: 2`.
- Audit every dependency for stdout writes on require/import.
- In tests, intercept stdout and assert it contains only valid JSON-RPC messages.
- Set `NODE_DEBUG=''` to suppress Node.js internal debug output if it leaks.

**Warning signs:**
- Client shows "connection closed" immediately after connecting, despite the server process staying alive.
- Error messages containing "JSON parse" or "untagged enum" on the client side.
- Works when tested with MCP Inspector (which may be more tolerant) but fails in Claude Code.
- Startup log messages are missing from stderr but also not visible — they went to stdout.

**Phase to address:** Phase 1 (MCP server scaffold). Establish the logging discipline before any other code is written. The pattern must be in place before any dependency is installed.

---

### Pitfall 2: Embedding Dimension Mismatch Corrupts the Vector Space Permanently

**What goes wrong:**
Once a LanceDB table is created with a `float32[768]` vector column, the dimension is fixed. If any rows are inserted with a different dimension — due to a model swap, a misconfiguration of Ollama's `num_ctx`, or a different model being substituted — LanceDB raises a FixedSizeList validation error or, worse, silently accepts the wrong-dimension vector (schema mismatch with nullable vs non-nullable vectors). Subsequent vector searches return wrong results or crash with confusing errors about dimension mismatch.

**Why it happens:**
Ollama's `nomic-embed-text` outputs 768 dimensions, but there are documented cases where Ollama launches with `num_ctx=8192` even though the model only supports 2048, causing crashes. The error message when you query with the wrong dimension is "very confusing" per the LanceDB issue tracker. Once bad vectors are inserted, they cannot be updated — LanceDB is append-only. The entire table must be dropped and rebuilt.

**How to avoid:**
- Assert embedding dimension on every batch before inserting into LanceDB. If the returned vector length != 768, throw and abort — never insert.
- The embedding service's `embed()` method must validate: `if (vector.length !== EXPECTED_DIM) throw new Error(...)`.
- Store `EXPECTED_DIM = 768` as a named constant imported by both the embedding service and the schema definition.
- On `init_project`, embed a known test string, verify the dimension, and fail fast with a clear message if wrong.
- Never allow changing `EMBED_MODEL` on an existing database without a full wipe + reindex.

**Warning signs:**
- LanceDB error: "Values length N is less than the length (768) multiplied by the value size..."
- Vector search returns completely irrelevant results despite correct text.
- Error: "TypeError: Table and inner RecordBatch schemas must be equivalent" on insert.
- The Ollama `/api/embed` response has an unexpected `embedding` array length.

**Phase to address:** Phase 2 (schema definition) and Phase 3 (embedding service). The dimension assertion must be in the embedding service before the first insert is possible.

---

### Pitfall 3: tree-sitter Native Bindings Fail Silently on Node.js Version Mismatch

**What goes wrong:**
The `tree-sitter` npm package is a native Node.js addon compiled against a specific `NODE_MODULE_VERSION`. If the Node.js version that runs the server differs from the version that compiled the prebuilt binary, the module fails to load with "The module was compiled against a different Node.js version using NODE_MODULE_VERSION 116. This version of Node.js requires NODE_MODULE_VERSION 108." The grammar packages (`tree-sitter-typescript`, `tree-sitter-python`, `tree-sitter-rust`) each have their own compiled `.node` files and can independently fail. In the worst case, the error is thrown at parse time (not at require time), so the MCP server starts successfully but crashes when `index_codebase` is called.

**Why it happens:**
tree-sitter ships prebuilt binaries for common Node.js versions. If the user's Node.js version doesn't match, `node-gyp rebuild` is required at install time, which requires a C++ build toolchain. In production/CI environments without build tools, this silently fails or produces an incompatible binary. Additionally, grammar packages (e.g., `tree-sitter-typescript` vs `@tree-sitter-grammars/tree-sitter-typescript`) sometimes have mismatched versions with the core `tree-sitter` package.

**How to avoid:**
- Lock Node.js version in `.nvmrc` and `package.json` `engines` field.
- Test `index_codebase` in CI on the target Node.js version, not just locally.
- Verify all grammar packages load on server startup (before accepting MCP connections): attempt to parse a trivial 1-line TypeScript, Python, and Rust snippet and throw if any grammar fails to load.
- Pin `tree-sitter` and all grammar package versions together; don't bump them independently.
- For grammar version alignment: `tree-sitter-typescript`, `tree-sitter-python`, `tree-sitter-rust` must all be compatible with the core `tree-sitter` package version.
- If build toolchain cannot be assumed, evaluate `web-tree-sitter` (WASM) as a fallback — but note WASM ABI compatibility issues between `web-tree-sitter` 0.26.x and WASM files built by `tree-sitter-cli` 0.20.x.

**Warning signs:**
- `npm install` completes without errors but `require('tree-sitter')` throws at runtime.
- Error message mentions `NODE_MODULE_VERSION`.
- `index_codebase` returns zero chunks for TypeScript files with no error message.
- Grammar loads successfully for one language but fails for another (version mismatch between individual grammar packages).

**Phase to address:** Phase 5 (code indexing). The grammar-load health check must run before the server accepts connections.

---

### Pitfall 4: LanceDB Fragment Accumulation Degrades Query Performance Over Time

**What goes wrong:**
LanceDB stores data in fragments. Each `add()` call (especially single-row inserts) creates a new fragment on disk. Parts of the query pipeline have O(N fragments) complexity. With Synapse's document chunking strategy — each `store_document` call creating multiple separate insert operations per chunk — the fragment count grows rapidly. After hundreds of documents, vector search latency climbs from milliseconds to seconds. LanceDB themselves document: "try to limit your dataset to 100 or so fragments."

**Why it happens:**
The natural implementation of `store_document` inserts chunks one-by-one (or calls `add()` per chunk). Each `add()` creates a new fragment. The incremental code indexer also creates new fragments per changed file. Without periodic compaction, the table becomes pathologically fragmented.

**How to avoid:**
- Always batch inserts: collect all chunks for a document into an array and call `table.add(allChunks)` once per document, not once per chunk.
- For `index_codebase`, batch all changed files' chunks into a single `add()` call per table.
- Schedule periodic compaction: call `table.optimize()` (which includes `compactFiles()`) after every N documents (e.g., every 50 `store_document` calls), or on server startup.
- Track fragment count via LanceDB table stats and log a warning when it exceeds 100.
- Never call `add()` in a loop for individual rows.

**Warning signs:**
- `semantic_search` or `search_code` latency increases from ~10ms to >1s on a small dataset.
- LanceDB table directory contains hundreds of `.lance` files.
- `index_codebase` for incremental changes is slower each time even though fewer files changed.

**Phase to address:** Phase 2 (database layer) and Phase 5 (code indexer). Batching pattern must be established in the persistence layer from the start.

---

### Pitfall 5: FTS Index Not Ready When Hybrid Search Is Called

**What goes wrong:**
LanceDB's `create_fts_index()` (or the equivalent in the Node.js client) returns immediately but builds the index asynchronously in the background. If `search_code` or `semantic_search` is called with `search_mode: "hybrid"` before the FTS index finishes building, the FTS component returns no results or errors, causing the RRF merge to produce biased rankings (only the vector side contributes). This is silent — no error is thrown; the search just returns fewer or different results.

**Why it happens:**
The async nature of index creation is documented but easy to miss. `init_project` creates the tables and then immediately tries to use them. Developers test with empty tables (no problem), then index a large codebase and immediately search — the FTS index isn't ready.

**How to avoid:**
- After calling `create_fts_index()`, poll until the index status shows it is ready (LanceDB provides an `index_stats()` method; check `unindexed_rows` reaches zero).
- Implement a `waitForIndex(table, indexName, timeoutMs)` utility that polls every 500ms with a configurable timeout.
- In `get_index_status`, report FTS index build status separately so agents know whether hybrid search results are reliable.
- During `index_codebase`, create FTS index before returning success to the caller.

**Warning signs:**
- Hybrid search returns the same results as pure vector search (FTS component contributing nothing).
- `get_index_status` shows `indexing_in_progress: true` but search calls proceed anyway.
- Freshly indexed codebase returns zero FTS hits for obvious keyword matches.

**Phase to address:** Phase 5 (code indexing) and Phase 4 (core document tools). Index creation must include a wait step.

---

## Moderate Pitfalls

### Pitfall 6: Ollama Model Unloaded Between Embedding Calls

**What goes wrong:**
Ollama defaults to unloading models from memory after 5 minutes of inactivity. For a local MCP server used intermittently (like during a coding session), the model is frequently cold on first use. Each cold start adds 3-10 seconds of delay before the first embedding completes. Worse, during `index_codebase` on a large codebase, if the operation takes longer than the keep-alive window (e.g., a pause while tree-sitter parses files), Ollama may unload and reload mid-indexing.

**How to avoid:**
- Set `OLLAMA_KEEP_ALIVE` environment variable to a long value (`24h` or `-1` for infinite) in the MCP server's environment configuration (`.mcp.json`).
- Alternatively, send `keep_alive: -1` in the `/api/embed` request body.
- Document this in the server's README so users know to configure their Ollama instance for persistent model loading.
- The non-blocking health check on startup should also warm up the model: send a dummy embed request to trigger loading before the first real tool call.

**Warning signs:**
- First `store_document` call after the server has been idle takes 10+ seconds.
- Ollama logs show "loading model" messages repeatedly throughout an indexing run.
- `index_codebase` reports success but total wall time is 5-10x longer than expected.

**Phase to address:** Phase 3 (embedding service). The startup health check should warm the model, and the `keep_alive` parameter should be included in all embed requests.

---

### Pitfall 7: Ollama Batch Size Causes OOM Crashes or Timeouts

**What goes wrong:**
Sending too many texts in a single Ollama `/api/embed` request causes the server to crash (OOM panic) or the HTTP client to time out and close the connection mid-request. Ollama then logs "aborting embedding request due to client closing the connection." Users have reported crashes with batch sizes of 32+ items with 2000-character inputs. A December 2025 Ollama panic: "caching disabled but unable to fit entire input in a batch" confirms batch size constraints were tightened.

**How to avoid:**
- Cap batch size at 16 texts per request. The embedding service must chunk large arrays into batches.
- Set HTTP client timeout generously (e.g., 120 seconds) but not infinite; abort and retry on timeout.
- Implement exponential backoff retry (3 attempts) for transient Ollama connection failures.
- Monitor total token count per batch, not just item count. A batch of 16 long documents may exceed `nomic-embed-text`'s 2048-token context limit per item.

**Warning signs:**
- `index_codebase` fails partway through with "connection reset by peer" or ECONNRESET.
- Ollama process memory grows unboundedly during a large indexing run.
- Embedding succeeds for small files but fails for files > 2000 characters.

**Phase to address:** Phase 3 (embedding service). Batching and retry logic must be built in from the start, not added as a hotfix.

---

### Pitfall 8: LanceDB Schema Frozen After First Write — Forward-Compatibility Trap

**What goes wrong:**
Once a LanceDB table is created with a specific Arrow schema and the first row is inserted, changing the schema is painful. Adding columns works but only populates new rows (existing rows get NULL). Changing a column's data type requires rewriting the entire column, which is resource-intensive. Dropping columns cannot be undone without a backup. For Synapse, the `parent_id`, `depth`, and `decision_type` v2 fields need to be in the schema from day one — if they're added later, all existing documents will have NULL values in those fields.

**How to avoid:**
- Define the complete schema — including v2 forward-compatibility fields — before writing any data. This is already stated in the project spec but bears emphasis: treat schema as immutable after first use.
- Mark v2 fields as nullable with sensible defaults (empty string for `parent_id`, 0 for `depth`).
- Maintain schema migrations as a versioned list if evolution is needed post-v1.
- Do not rely on LanceDB's schema inference from JavaScript objects — always define explicit Arrow schemas.

**Warning signs:**
- "TypeError: Table and inner RecordBatch schemas must be equivalent" when a code change alters the schema of inserted objects.
- NULL values in columns that should always have values, caused by schema evolution mid-stream.
- Inconsistent behavior between newly inserted and old documents in searches.

**Phase to address:** Phase 2 (schema definition). Get the schema right before any data is written.

---

### Pitfall 9: MCP Error Responses vs. Tool Exceptions — Silent Failure Mode

**What goes wrong:**
The MCP SDK does not automatically convert unhandled JavaScript exceptions into proper JSON-RPC error responses. In some versions of the Python SDK (and reportedly the TypeScript SDK has analogous behavior), an exception thrown inside a tool handler is swallowed and the client receives a "successful" response with the exception message in the content field — not a JSON-RPC error. Agents treat this as a successful tool call with unexpected content, leading to silent incorrect behavior rather than a visible error the agent can react to.

**How to avoid:**
- Wrap every tool handler body in a try/catch. In the catch block, return a structured error response (e.g., `{ success: false, error: "..." }`) rather than throwing.
- Reserve actual exceptions only for scenarios where the server itself should crash (unrecoverable state).
- For expected error conditions (Ollama unreachable, document not found, invalid input), return structured error objects through the normal response channel.
- Add integration tests that call tools with bad inputs and assert the response structure, not just that the call didn't throw.

**Warning signs:**
- Agent reports "success" for `store_document` but no document appears in the database.
- `semantic_search` returns an object containing "Error:" in the result content but with a 200 status.
- Error is only visible when manually inspecting MCP logs, not in the agent's reasoning.

**Phase to address:** Phase 4 (core MCP tools). Every tool handler must have a standard error wrapping pattern established before tools are built.

---

### Pitfall 10: tree-sitter Memory Leak in Long-Running Indexing Sessions

**What goes wrong:**
A known memory leak exists in tree-sitter's Node.js bindings (`src/parser.cc` `CallbackInput` class). The `input` callback captures the input string in a closure that is retained indefinitely by the C bindings, preventing garbage collection. During `index_codebase` on a large codebase (thousands of files), heap memory grows linearly with the total bytes parsed. The Node.js process can exhaust memory and crash mid-indexing.

**Why it happens:**
The C++ destructor for `CallbackInput` did not reset the `callback` and `partial_string` members, leaving references alive. This was found and fixed in the tree-sitter C++ source, but it depends on whether the installed version has the fix. Versions predating the fix will leak.

**How to avoid:**
- Verify the installed `tree-sitter` version includes the `CallbackInput` destructor fix (check the tree-sitter changelog or test by monitoring heap usage during a full indexing run with `--max-old-space-size` set low).
- Process files in bounded batches (e.g., 100 files) and allow GC between batches (`await new Promise(r => setImmediate(r))` yields to the event loop and enables GC).
- Monitor heap usage during `index_codebase`: if heap grows > 512MB, log a warning.
- Explicitly release the tree-sitter parser instance after parsing each file (set `parser = null` and allow GC).

**Warning signs:**
- Node.js process OOM crash during `index_codebase` on codebases > 500 files.
- Heap memory never stabilizes during indexing — grows monotonically.
- Incremental reindex of a handful of changed files consumes as much memory as a full reindex.

**Phase to address:** Phase 5 (code indexer). Build the indexer with explicit GC yield points between file batches.

---

### Pitfall 11: RRF k Parameter Not Tuned for Code Search Context

**What goes wrong:**
RRF uses the formula `score = 1/(k + rank)` where `k=60` is the standard default. Research shows that k=60 works well for general-purpose retrieval but that optimal k varies by domain. For code search where exact symbol name matches (FTS) should strongly outrank fuzzy semantic matches, a lower k (e.g., k=20) gives more weight to top-ranked FTS results. With k=60, a function named `authenticate` that appears at rank 1 in FTS and rank 15 in semantic search gets nearly the same score as a function with the opposite pattern. The result is that hybrid search degrades to "average" rather than "best of both."

**How to avoid:**
- Make k configurable rather than hardcoded. Default to k=60 for document search and k=20 for code search.
- Test with realistic queries: function name lookups, semantic descriptions ("error handling middleware"), and mixed queries.
- Measure: if FTS-rank-1 results aren't in the top 3 of hybrid results for exact-name queries, reduce k.
- Consider using separate RRF instances for `documents` and `code_chunks` searches.

**Warning signs:**
- Searching for a function by exact name returns it at rank 5+ in hybrid search even though FTS ranks it #1.
- Users report hybrid search is "no better than semantic only."
- FTS-only search finds what users want but hybrid blurs it with less relevant semantic matches.

**Phase to address:** Phase 6 (hybrid search). Set up test cases measuring hybrid search quality before shipping.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single-row LanceDB inserts per chunk | Simpler code path | Fragment accumulation, O(N) performance degradation | Never — always batch per document |
| Hardcoded k=60 for all RRF | Fewer config knobs | Suboptimal search quality for code queries | Acceptable in MVP; tune in Phase 6 |
| No compaction scheduler | Simpler operations | Table performance degrades after ~100 documents | MVP if compaction is called on startup |
| Skip FTS index wait | Faster `init_project` response | Hybrid search silently returns biased results | Never — always wait for index ready |
| `console.log()` for debug output | Faster development | Corrupts MCP stdio transport, breaks client connection | Never in production code path |
| No batch size cap in embedding service | Simpler embedding loop | OOM crashes on large codebases | Never — cap at 16 items from day one |
| Store embedding model name only in env, not in DB | Simpler config | Cannot detect model mismatch on reconnect | Never — store in project_meta table |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Ollama `/api/embed` | Using `/api/embeddings` (old endpoint) | Use `/api/embed` (current endpoint); both work but `/api/embed` supports batching properly |
| Ollama | Not setting `keep_alive` parameter | Pass `keep_alive: -1` in every `/api/embed` request body to prevent mid-session unloads |
| LanceDB `create_fts_index()` | Treating it as synchronous | Call `waitForIndex()` after; the API returns immediately, index builds async |
| LanceDB `table.add()` | Inserting rows with a vector field set to `null` | Validate vector is a non-null `Float32Array` of correct length before every insert |
| tree-sitter grammars | Importing `tree-sitter-typescript` which exports both TypeScript and TSX parsers | Must access the correct sub-export: `require('tree-sitter-typescript').typescript` not the root export |
| MCP SDK `StdioServerTransport` | Calling `server.connect(transport)` before all tools are registered | Register all tools synchronously before connecting the transport |
| MCP tool schemas | Using Zod `.optional()` for fields and assuming undefined means not provided | MCP passes missing fields as `undefined`; use `.optional().default(value)` or explicit undefined checks |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-chunk inserts into LanceDB | Search latency grows from 10ms to 1s+ over time | Batch all chunks per document in one `add()` call | ~50 documents with multi-chunk content |
| Synchronous file reading in `file-scanner.ts` | `index_codebase` blocks the event loop, MCP client times out | Use async file I/O (`fs.promises.readFile`) throughout | Codebases with > 100 files |
| No timeout on Ollama HTTP requests | `store_document` hangs indefinitely if Ollama crashes mid-request | Set a 120s timeout on every HTTP call to Ollama | Immediately if Ollama becomes unresponsive |
| Fetching all chunks for a document during `update_document` | Scales linearly with chunk count for metadata-only updates | LanceDB update-by-filter directly: `table.update({ where: "doc_id = '...'" }, { status: 'active' })` | Documents with > 20 chunks |
| Loading all code chunks into memory for relationship generation | OOM on large codebases | Process import analysis in streaming fashion, write relationships incrementally | Codebases with > 10k files |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Resolving `root_path` for `index_codebase` without normalization | Path traversal — agent could index `/etc/passwd` by passing `../../..` | Resolve to absolute path and validate it's within allowed roots; reject paths outside the working directory |
| Storing arbitrary content from `store_document` without size limits | Malicious agent could store gigabytes of data, filling disk | Enforce per-document content size limit (e.g., 1MB); return error if exceeded |
| Logging full document content to stderr | Sensitive data leaks into server logs visible to process-level observers | Log only IDs, chunk counts, and categories to stderr — never content |
| Using user-controlled `project_id` as a SQL filter without validation | SQL injection in LanceDB filter expressions | Validate `project_id` is alphanumeric/slug before using in any query filter |

---

## "Looks Done But Isn't" Checklist

- [ ] **LanceDB tables created:** Verify the `.synapse/` directory contains all 5 tables with correct Arrow schemas — not just the directory itself. Check with `table.schema()` after creation.
- [ ] **FTS index ready:** Creating the FTS index and then immediately searching returns hybrid results, not just vector results. Verify by running a keyword-only FTS search and checking it returns hits.
- [ ] **Embedding dimension validated:** The embedding service `embed()` method actively asserts returned vector length == 768. Without this assertion, a model swap silently corrupts the vector space.
- [ ] **Ollama fail-fast works:** When Ollama is not running, `store_document` returns a clear error; `semantic_search` on existing data still works. Both cases must be tested.
- [ ] **stdout is clean:** Start the MCP server and pipe stdout through `cat -A`. No non-JSON content should appear during startup, tool calls, or errors. All logs must appear on stderr.
- [ ] **tree-sitter grammars load for all 3 languages:** The startup health check must parse a trivial snippet in TypeScript, Python, AND Rust. One grammar can silently fail while others succeed.
- [ ] **Incremental indexing actually skips unchanged files:** After a full index, modify one file, reindex, and verify `skipped_unchanged` equals (total files - 1). Without this, every reindex is a full reindex.
- [ ] **Auto-relationships replace (not append) on reindex:** After reindexing a file, the old `ast_import` relationships for that file are removed and regenerated — not duplicated. Verify by counting relationships before and after for a file.
- [ ] **Versioning preserves old document as superseded:** After `store_document` with an existing `doc_id`, the old chunk rows have `status: 'superseded'` and the new rows have `version: 2`. Both must be present, not just the new ones.
- [ ] **MCP tool errors surface correctly:** Call a tool with invalid input (e.g., `store_document` without Ollama running). The MCP client must receive an error response, not a success response with error text in the content.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dimension mismatch — bad vectors inserted | HIGH | Drop and recreate the affected table; rerun `init_project` with `force: true`; reindex all documents and code |
| Fragment accumulation — severe performance degradation | LOW | Call `table.optimize()` on all tables; this is non-destructive and can be done live |
| FTS index missing or stale | LOW | Drop FTS index and recreate: `table.create_fts_index(['content'], { replace: true })` then wait for completion |
| stdout corruption — MCP transport broken | LOW | Identify the offending `console.log()` via binary search; fix and restart server |
| Ollama model mismatch — schema locked to wrong dimension | HIGH | Must wipe `.synapse/` directory and rebuild from scratch; no in-place migration possible |
| tree-sitter OOM crash mid-index | MEDIUM | Add `--max-old-space-size=4096` to Node.js flags; re-run `index_codebase`; may need to run in smaller batches via `include_patterns` |
| Duplicate auto-relationships after reindex | LOW | Run a deduplification query on the relationships table filtering `source = 'ast_import'`; re-run indexing with relationship cleanup fixed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| stdout corruption kills MCP transport | Phase 1: Project scaffold | Start server, pipe stdout through JSON parser — no non-JSON output during startup or any tool call |
| Embedding dimension mismatch | Phase 2: Schema + Phase 3: Embedding service | Call `embed()`, assert `vector.length === 768`; attempt insert with wrong dimension, verify rejection |
| tree-sitter native binding failure | Phase 5: Code indexer | Parse TS/Python/Rust snippets in startup health check; run on target Node.js version in CI |
| LanceDB fragment accumulation | Phase 2: Database layer | Count `.lance` files after 100 `store_document` calls; latency must remain under 100ms |
| FTS index not ready for hybrid search | Phase 4: Document tools + Phase 5: Code indexer | Create index, immediately search, verify FTS hits are present |
| Ollama model unloaded mid-session | Phase 3: Embedding service | Idle 6 minutes, then call `store_document`; total latency must be < 2s (model pre-warmed) |
| Ollama batch size OOM | Phase 3: Embedding service | Index a file > 10,000 characters; verify no crash; check batch size cap is enforced |
| Schema frozen after first write | Phase 2: Schema definition | Compare schema with PROJECT.md v2 fields; all forward-compat columns present before any data written |
| MCP exception swallowed as success | Phase 4: MCP tools | Call `store_document` with Ollama off; verify client receives error response, not success with error text |
| tree-sitter memory leak | Phase 5: Code indexer | Run `index_codebase` on 1000+ file codebase; heap must not grow unboundedly |
| RRF k value suboptimal for code search | Phase 6: Hybrid search | Search by exact function name; verify it ranks #1 in hybrid results |

---

## Sources

- [LanceDB Schema Evolution docs](https://docs.lancedb.com/tables/schema) — HIGH confidence (official docs)
- [LanceDB concurrent writes issue #213](https://github.com/lancedb/lancedb/issues/213) — HIGH confidence (official issue tracker)
- [LanceDB concurrent writes issue #1077 (S3)](https://github.com/lancedb/lancedb/issues/1077) — HIGH confidence
- [LanceDB FAQ OSS](https://docs.lancedb.com/faq/faq-oss) — HIGH confidence
- [LanceDB embedding dimension mismatch issue #1109](https://github.com/lancedb/lancedb/issues/1109) — HIGH confidence
- [LanceDB schema mismatch issue #1281](https://github.com/lancedb/lancedb/issues/1281) — MEDIUM confidence
- [LanceDB FTS index async creation](https://lancedb.com/docs/indexing/fts-index/) — HIGH confidence (official docs)
- [LanceDB compaction docs](https://lancedb.com/documentation/concepts/data.html) — HIGH confidence
- [tree-sitter Node.js version mismatch issue #169](https://github.com/tree-sitter/node-tree-sitter/issues/169) — HIGH confidence
- [tree-sitter WASM ABI incompatibility issue #5171](https://github.com/tree-sitter/tree-sitter/issues/5171) — HIGH confidence
- [tree-sitter memory leak analysis — Cosine Engineering](https://cosine.sh/blog/tree-sitter-memory-leak) — MEDIUM confidence (single technical blog post, specific and credible)
- [Ollama hanging on nomic-embed-text issue #3029](https://github.com/ollama/ollama/issues/3029) — HIGH confidence
- [Ollama keep-alive behavior — official FAQ](https://docs.ollama.com/faq) — HIGH confidence
- [Ollama keep_alive issue #6401](https://github.com/ollama/ollama/issues/6401) — MEDIUM confidence
- [Ollama embedding timeout issue (Roo Code) #5733](https://github.com/RooCodeInc/Roo-Code/issues/5733) — MEDIUM confidence
- [MCP stdio stdout corruption — claude-flow issue #835](https://github.com/ruvnet/claude-flow/issues/835) — HIGH confidence (aligns with official spec)
- [MCP official transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) — HIGH confidence
- [MCP implementation pitfalls — Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — MEDIUM confidence
- [MCP error handling — python-sdk issue #396](https://github.com/modelcontextprotocol/python-sdk/issues/396) — MEDIUM confidence (Python SDK, but pattern applies to TS)
- [RRF analysis — ACM Transactions on Information Systems](https://dl.acm.org/doi/10.1145/3596512) — HIGH confidence (peer-reviewed research)
- [RRF domain sensitivity — OpenSearch blog](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/) — MEDIUM confidence
- [Anything-llm LanceDB dimension issue #2156](https://github.com/Mintplex-Labs/anything-llm/issues/2156) — MEDIUM confidence (community issue)

---
*Pitfalls research for: MCP server with LanceDB vector database, tree-sitter code indexing, and Ollama embeddings*
*Researched: 2026-02-27*
