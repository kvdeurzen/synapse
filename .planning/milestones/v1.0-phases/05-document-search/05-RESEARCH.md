# Phase 5: Document Search - Research

**Researched:** 2026-02-28
**Domain:** LanceDB vector search, FTS (BM25), hybrid RRF fusion, token-budget-aware context assembly
**Confidence:** HIGH

## Summary

Phase 5 implements four search tools on top of LanceDB 0.26.2 and the doc_chunks/documents tables built in Phases 2-4. LanceDB natively supports vector similarity search (returning `_distance`), full-text BM25 search (via `Index.fts()` + `table.search(query, "fts")`), and hybrid search with a built-in `RRFReranker` class that runs RRF server-side. All three capabilities are verified against the installed node_modules, not just documentation.

The smart context tool (`get_smart_context`) is a two-phase workflow layered on top of the search primitives: overview mode fetches brief summaries from documents without vector search (metadata scan + token budget), and detailed mode fetches full content for specific doc_ids with 1-hop relationship expansion sourced from the relationships table (already built in Phase 4). Token counting uses `gpt-tokenizer`'s `countTokens` (already in dependencies) for consistency with Phase 4 chunker.

The critical implementation decision: LanceDB's FTS index must be created on `doc_chunks.content` during `init_project` (alongside the BTree project_id indexes already created there). Because the schema is immutable but index creation is a separate operation, adding FTS index creation to `init_project` does not require schema changes — only an additional `createIndex` call inside the existing try/catch pattern.

**Primary recommendation:** Use LanceDB native APIs for all three search modes (vector via `.nearestTo()`, FTS via `.search(query, "fts")` or `.fullTextSearch()`, hybrid via `.nearestTo().fullTextSearch().rerank(RRFReranker)`). Implement RRF manually in JavaScript only as fallback; avoid it as the primary path since the native RRFReranker is confirmed present in 0.26.2.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Search result shape:**
- Metadata + snippet per result: title, doc_id, category, relevance score, and a ~100-200 token content snippet with the matching passage
- Relevance scores normalized to 0.0-1.0 range regardless of search method (vector, FTS, hybrid)
- Every result includes a `source` field ('document' or 'code') to identify which table it came from — even for document-only search in this phase
- Default result limit: 5 results per search call (agent can override with limit param)

**Smart context assembly:**
- Overview mode: ~100 tokens per document summary, fitting 20-40 docs in a 2-4k token budget
- Default max_tokens budget: 4000 tokens if the agent doesn't specify
- 1-hop graph expansion in detailed mode prioritizes by relationship type: depends_on and implements first, references and related_to after, within the token budget
- Truncation strategy: drop lowest-relevance documents entirely rather than truncating mid-content — no partial documents
- Smart context supports metadata filters (category, phase, tags, status) — agents can scope context assembly

**Hybrid ranking behavior:**
- Fixed RRF (Reciprocal Rank Fusion) merge with a fixed k parameter — Claude tunes k during implementation
- Three separate search tools: semantic_search, fulltext_search, and hybrid_search — agents choose the right tool for the job
- When Ollama is unreachable: semantic_search fails with clear error; hybrid_search falls back to FTS-only with warning; fulltext_search works normally
- Configurable min_score threshold parameter (default 0.0) — agent can set e.g. 0.3 to filter out low-relevance noise

**Filter and scope controls:**
- All metadata filters (category, phase, tags, status, priority) available on all search tools — agents can combine semantic query with metadata narrowing
- Tag filtering uses the same pipe-delimited LIKE matching as Phase 4's query_documents — consistent pattern across all tools
- Superseded documents excluded from search results by default — optional include_superseded flag for edge cases
- Filters narrow the candidate set before ranking, not post-filter

### Claude's Discretion
- RRF k parameter tuning
- FTS implementation approach (LanceDB native FTS if available, or custom)
- Snippet extraction algorithm (how to pick the most relevant ~100-200 tokens from a chunk)
- Internal caching or optimization strategies

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | User can run semantic search across documents with optional category, phase, tags, status filters and min_relevance threshold | LanceDB `.query().nearestTo(vector).where(predicate).limit(n)` — filter applied before vector search via pre-filter; `_distance` normalized to score |
| SRCH-02 | User can run full-text search across documents | LanceDB `Index.fts()` + `table.search(query, "fts")` returns BM25 `_score` field; index on `doc_chunks.content` |
| SRCH-03 | Hybrid search merges semantic and FTS results via Reciprocal Rank Fusion (k=60) | `lancedb.rerankers.RRFReranker.create(60)` confirmed in 0.26.2; `.nearestTo().fullTextSearch().rerank(reranker)` pipeline |
| SRCH-04 | get_smart_context overview phase returns summaries (~100 tokens each) from both documents and code_chunks tables (~2-4k tokens total) | gpt-tokenizer `countTokens` already in deps; metadata scan on documents table, no vector search needed; code_chunks for Phase 7 but table exists |
| SRCH-05 | get_smart_context detailed phase fetches full content for agent-specified doc_ids with 1-hop relationship traversal | relationships table already built (Phase 4); same pattern as get_related_documents; priority ordering: depends_on/implements before references/related_to |
| SRCH-06 | get_smart_context respects max_tokens budget and truncates results to fit | Drop-lowest-relevance truncation; countTokens per document; accumulate until budget exceeded then stop |
| SRCH-07 | Search results include relevance scores and source attribution | `_distance` → normalize to score; `_score` for FTS; `source` field = 'document'; chunk's `doc_id` for attribution |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lancedb/lancedb` | 0.26.2 (pinned) | Vector search, FTS, hybrid search, RRF reranking | Already installed; all search APIs confirmed in dist/query.d.ts and dist/rerankers/ |
| `gpt-tokenizer` | ^3.4.0 | Token counting for budget management in get_smart_context | Already in deps; used in chunker.ts; consistent cl100k_base BPE encoding |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `apache-arrow` | (transitive via lancedb) | RecordBatch type for RRFReranker API | Required for `rerankHybrid(query, vecResults, ftsResults)` signature |
| `ulidx` | ^2.4.1 | Already in deps | Not needed for search — no new rows created |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LanceDB native RRF | Manual JS RRF implementation | Native is faster and simpler; only use manual as fallback if native API fails |
| LanceDB native FTS | Custom tantivy integration | Native FTS is built in; no additional dependency needed |
| LanceDB `.fullTextSearch()` on Query | `.search(query, "fts")` syntax | Both work in 0.26.2; `.query().fullTextSearch()` is the fluent form that combines with `.where()` and `.nearestTo()` |

**Installation:** No new packages needed. All required capabilities are in already-installed dependencies.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── tools/
│   ├── semantic-search.ts       # semantic_search MCP tool
│   ├── fulltext-search.ts       # fulltext_search MCP tool
│   ├── hybrid-search.ts         # hybrid_search MCP tool
│   └── get-smart-context.ts     # get_smart_context MCP tool
test/
└── tools/
    ├── semantic-search.test.ts
    ├── fulltext-search.test.ts
    ├── hybrid-search.test.ts
    └── get-smart-context.test.ts
```

Each tool follows the Phase 4 two-export pattern: `searchFn(dbPath, projectId, args, config)` (testable core) + `registerXTool(server, config)` (MCP wrapper).

### Pattern 1: FTS Index Creation During init_project

**What:** The FTS index on `doc_chunks.content` must be created when the table is first initialized. `init_project` already creates BTree indexes in a try/catch; FTS index creation follows the same graceful degradation pattern.

**When to use:** One-time setup in `init_project.ts` alongside existing BTree index creation.

**Example:**
```typescript
// Source: dist/indices.d.ts — Index.fts() confirmed in lancedb 0.26.2
const docChunksTable = await db.openTable("doc_chunks");
try {
  await docChunksTable.createIndex("content", {
    config: lancedb.Index.fts({
      withPosition: true,
      stem: false,        // stem=false is safer for code/technical terms
      removeStopWords: false, // preserve all words for technical queries
      lowercase: true,
    }),
    replace: true,
  });
} catch (err) {
  logger.warn({ error: String(err) }, "FTS index creation failed — will be available after first insert");
}
```

**Critical note:** The FTS index creation is added to `init_project.ts`, not a new file. This is a modification to an existing tool, not a new tool. Only the `doc_chunks` table needs FTS indexing for Phase 5 (documents table is searched via doc_chunks). The `replace: true` option makes it idempotent on re-init.

### Pattern 2: Semantic Search (Vector)

**What:** Embed the query, run nearestTo on doc_chunks (status=active, project_id filter), join back to documents for metadata, normalize `_distance` to relevance score.

**When to use:** `semantic_search` tool implementation.

**Example:**
```typescript
// Source: context7 /lancedb/lancedb — nearestTo confirmed in 0.26.2
const queryVector = await embed([query], projectId, config);

// Pre-filter: superseded excluded, project scoped
// LanceDB applies WHERE before vector search (pre-filter by default)
let predicate = `project_id = '${projectId}' AND status = 'active'`;
if (category) predicate += ` AND category_filter = '${category}'`;
// Note: doc_chunks doesn't store category — must join via doc_id to documents

const rows = await docChunksTable
  .query()
  .nearestTo(queryVector[0])
  .where(`project_id = '${projectId}' AND status = 'active'`)
  .limit(limit * 2) // fetch 2x to allow post-join filtering
  .toArray();

// Normalize: cosine distance [0,2] → relevance [0,1]
// For l2 (default): distance 0 = identical; normalize by expected max
// Use cosine distance for semantic search
const score = 1 - (row._distance / 2); // cosine: distance in [0,2]
```

**Distance normalization:**
- LanceDB vector search returns `_distance` field (lower = more similar)
- With **cosine** distance metric: range is [0, 2], where 0 = identical, 2 = opposite
  - `relevance_score = 1.0 - (_distance / 2)` → maps to [0, 1]
- Use `.distanceType("cosine")` on the VectorQuery for semantic search
- FTS returns `_score` (BM25, unnormalized positive float) — normalize to [0,1] by dividing by observed max or using `score / (score + 1)` sigmoid

### Pattern 3: FTS Search

**What:** BM25 full-text search on doc_chunks.content using LanceDB native FTS.

**When to use:** `fulltext_search` tool. Also the fallback path inside `hybrid_search` when Ollama is unreachable.

**Example:**
```typescript
// Source: dist/query.d.ts — fullTextSearch() confirmed on StandardQueryBase
const rows = await docChunksTable
  .query()
  .fullTextSearch(query)
  .where(`project_id = '${projectId}' AND status = 'active'`)
  .limit(limit)
  .toArray();

// rows[i]._score = BM25 score (higher = more relevant)
// Normalize: sigmoid normalization score / (score + 1) maps to [0, 1]
const relevanceScore = row._score / (row._score + 1);
```

**Alternative syntax (both confirmed in 0.26.2):**
```typescript
// Short form — works for simple string queries
const rows = await table.search(query, "fts").where(predicate).limit(limit).toArray();
```

### Pattern 4: Hybrid Search with RRFReranker

**What:** LanceDB native hybrid: combine vector nearestTo + FTS fullTextSearch, rerank with RRFReranker.

**When to use:** `hybrid_search` tool. Falls back to FTS-only if Ollama unreachable.

**Example:**
```typescript
// Source: dist/rerankers/rrf.d.ts — RRFReranker.create(k?) confirmed in 0.26.2
// Source: dist/query.d.ts — rerank(reranker) on VectorQuery confirmed
import { rerankers } from "@lancedb/lancedb";

const reranker = await rerankers.RRFReranker.create(60); // k=60 default from REQUIREMENTS.md SRCH-03
const queryVector = await embed([query], projectId, config);

const rows = await docChunksTable
  .query()
  .nearestTo(queryVector[0])
  .distanceType("cosine")
  .fullTextSearch(query)
  .where(`project_id = '${projectId}' AND status = 'active'`)
  .rerank(reranker)
  .limit(limit)
  .toArray();

// rows[i]._relevance_score — RRF outputs a relevance score
// Already in [0,1] range from RRF algorithm
```

**Fallback when Ollama is unreachable:**
```typescript
const status = getOllamaStatus(); // from services/embedder.ts
if (status !== "ok") {
  // Fall back to FTS-only with warning in result
  logger.warn("Ollama unreachable — hybrid_search falling back to FTS-only");
  return fulltextSearch(dbPath, projectId, args, config);
}
```

### Pattern 5: Metadata Join After Chunk Search

**What:** doc_chunks does not store document metadata (title, category, phase, tags, status, priority). After getting chunk results, join to the documents table by doc_id.

**When to use:** All three search tools — results must include doc-level metadata.

**Example:**
```typescript
// Collect unique doc_ids from chunk results
const docIds = [...new Set(rows.map(r => r.doc_id as string))];

// Fetch doc metadata in one batch query
// IMPORTANT: must open fresh connection per Phase 04-03 lesson
const db = await connectDb(dbPath);
const docsTable = await db.openTable("documents");

const docRows = await docsTable
  .query()
  .where(`doc_id IN ('${docIds.join("','")}') AND project_id = '${projectId}' AND status != 'superseded'`)
  .toArray();

const docMap = new Map(docRows.map(r => [r.doc_id as string, r]));
```

**Important:** doc_chunks has `status` field (active/superseded for chunks). The documents table also has a `status` field. Chunk-level filter on `status = 'active'` is sufficient to exclude superseded doc content; the `include_superseded` flag controls whether to also check the parent document status.

### Pattern 6: Snippet Extraction (100-200 token window)

**What:** Extract the most relevant ~100-200 token window from a chunk's content as the result snippet.

**When to use:** All search tools need a content snippet per result.

**Recommended approach (Claude's Discretion):** Use the chunk's full content if it's already ≤200 tokens (doc_chunks store token_count). For longer chunks, find the query term in the text and extract a window around it.

**Example:**
```typescript
import { countTokens } from "gpt-tokenizer";

function extractSnippet(content: string, query: string, maxTokens = 150): string {
  const tokens = countTokens(content);
  if (tokens <= maxTokens) return content;

  // Find first occurrence of any query word and center the window
  const words = query.toLowerCase().split(/\s+/);
  const lower = content.toLowerCase();
  let bestPos = 0;
  for (const word of words) {
    const pos = lower.indexOf(word);
    if (pos !== -1) { bestPos = pos; break; }
  }

  // Extract a character window around bestPos, then trim to token budget
  const CHARS_PER_TOKEN = 4; // approximate
  const windowChars = maxTokens * CHARS_PER_TOKEN;
  const start = Math.max(0, bestPos - windowChars / 2);
  let snippet = content.slice(start, start + windowChars);

  // Trim to exact token budget
  while (countTokens(snippet) > maxTokens && snippet.length > 0) {
    snippet = snippet.slice(0, -10);
  }
  return (start > 0 ? "..." : "") + snippet.trimEnd() + (start + windowChars < content.length ? "..." : "");
}
```

### Pattern 7: get_smart_context Two-Phase Assembly

**What:** Overview mode = scan documents table for summaries, no vectors. Detailed mode = fetch full content by doc_id + 1-hop graph expansion.

**Overview mode:**
```typescript
// Metadata scan — no embedding needed
// Sort by priority DESC (lower number = higher priority), then by updated_at DESC
const rows = await docsTable
  .query()
  .where(predicate) // project_id + filters + status != 'superseded'
  .limit(100) // fetch more than needed, then budget-trim
  .toArray();

// Sort by priority (nulls last), then updated_at desc
rows.sort((a, b) => {
  const pa = (a.priority as number | null) ?? 999;
  const pb = (b.priority as number | null) ?? 999;
  if (pa !== pb) return pa - pb;
  return (b.updated_at as string).localeCompare(a.updated_at as string);
});

// Accumulate into token budget
let totalTokens = 0;
const results = [];
for (const row of rows) {
  // Generate ~100-token summary from content
  const summary = extractSummary(row.content as string, 100);
  const summaryTokens = countTokens(summary);
  if (totalTokens + summaryTokens > maxTokens) break; // drop-lowest strategy: stop adding
  results.push({ doc_id: row.doc_id, title: row.title, summary, ... });
  totalTokens += summaryTokens;
}
```

**Detailed mode + 1-hop expansion:**
```typescript
// 1. Fetch requested docs by doc_id
// 2. Query relationships for 1-hop neighbors (same as get_related_documents)
// 3. Priority order: depends_on, implements first; references, related_to after
const RELATIONSHIP_PRIORITY = {
  depends_on: 1, implements: 1,
  references: 2, related_to: 2,
  contradicts: 3, child_of: 3, supersedes: 3,
};

// 4. Accumulate: requested docs first (always included), then neighbors by priority until budget
```

### Anti-Patterns to Avoid

- **Fetching vectors in search results:** Never select the vector column in result rows — it's 768 floats (3KB per row). Use `.select([...columns_without_vector])` or let LanceDB omit it.
- **SQL injection in tag/phase filters:** Use the same character validation pattern as query_documents.ts (`/^[a-zA-Z0-9_-]+$/` for tags). Do not trust user strings directly in WHERE predicates.
- **Stale table objects:** Per Phase 04-03 lesson — open fresh `lancedb.connect()` + `openTable()` if reading after any write. For read-only search this is less critical but use consistent `connectDb()` helper.
- **Missing FTS index causing silent scan:** Without the FTS index, `fullTextSearch()` may fall back to a full table scan or fail. Create the index in init_project with replace=true.
- **Assuming `_distance` range for L2:** L2 distance has no fixed upper bound. Use cosine distance for semantic search to get a normalizable [0,2] range.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BM25 full-text scoring | Custom inverted index | `lancedb.Index.fts()` + `.search(q, "fts")` | LanceDB BM25 is Rust-native, handles stemming, stop words, position indexing |
| Reciprocal Rank Fusion | Manual rank computation loop | `rerankers.RRFReranker.create(k)` | Native Rust implementation; handles tie-breaking and edge cases correctly |
| Token counting | Character-based approximation | `gpt-tokenizer.countTokens()` | BPE-accurate; already in deps; consistent with chunker |
| Snippet extraction from large chunks | Re-chunking at query time | Char window + token trim (Pattern 6 above) | Simple and effective; chunks are already sized 100-500 tokens by Phase 4 |

**Key insight:** LanceDB 0.26.2 ships all three search modes natively in Rust. The TypeScript API is a thin wrapper. Custom implementations would be slower and less correct.

---

## Common Pitfalls

### Pitfall 1: FTS Index Not Created → Silent Failure or Full Scan
**What goes wrong:** Calling `.fullTextSearch(query)` on a table without an FTS index either errors or falls back to a full table scan with unexpected results.
**Why it happens:** FTS index must be explicitly created — it is not automatic on string columns.
**How to avoid:** Add FTS index creation to `init_project.ts` for the `doc_chunks` table (and optionally `documents` table). Use `replace: true` for idempotency. Wrap in the existing try/catch pattern.
**Warning signs:** FTS search returns 0 results for queries that should match; or performance is dramatically worse than expected.

### Pitfall 2: `_distance` Normalization Wrong for L2
**What goes wrong:** Using L2 distance (LanceDB default) but trying to normalize to [0,1] with a fixed divisor — L2 has no bounded upper limit, so normalization is unpredictable.
**Why it happens:** Distance type defaults to L2, but cosine is what we want for semantic similarity.
**How to avoid:** Always call `.distanceType("cosine")` on VectorQuery for semantic_search and hybrid_search. Normalize: `score = 1.0 - (_distance / 2)` (cosine range is [0,2]).

### Pitfall 3: Metadata Filters Must Pre-filter on doc_chunks, Not Just Documents
**What goes wrong:** Filtering by `category` requires joining doc_chunks to documents, since doc_chunks only stores `doc_id`, `project_id`, `status`. Filtering in the WHERE clause of a chunk search on `category` will fail because doc_chunks has no category column.
**Why it happens:** The doc_chunks schema (in schema.ts) has no category, phase, tags, priority columns — those are on documents.
**How to avoid:** Two approaches:
  1. Pre-fetch matching doc_ids from documents table with metadata filters, then use `doc_id IN (...)` in the chunk search predicate.
  2. Post-filter chunk results by joining to documents map and discarding non-matching docs.
  Approach 1 (pre-filter) is correct per the locked decision "Filters narrow the candidate set before ranking, not post-filter."

**Implementation strategy for metadata pre-filtering:**
```typescript
// 1. Pre-fetch doc_ids matching metadata filters
const docPredicate = buildDocPredicate(projectId, { category, phase, tags, status });
const matchingDocs = await docsTable.query().where(docPredicate).toArray();
const allowedDocIds = matchingDocs.map(r => r.doc_id as string);

if (allowedDocIds.length === 0) return { results: [] };

// 2. Build doc_id IN (...) filter for chunk search
const docIdFilter = `doc_id IN ('${allowedDocIds.join("','")}')`;
const chunkPredicate = `project_id = '${projectId}' AND status = 'active' AND ${docIdFilter}`;

// 3. Run vector/FTS search with combined predicate
```

### Pitfall 4: LanceDB `IN` clause size limits
**What goes wrong:** Building a `doc_id IN ('id1','id2',...)` predicate with thousands of doc_ids may hit SQL predicate length limits.
**Why it happens:** Large projects with many documents, combined with broad metadata filters, can produce very large IN clauses.
**How to avoid:** Cap pre-filter to a reasonable upper bound (e.g., 500 doc_ids). If more than 500 match, skip the pre-filter and do post-filter join instead.

### Pitfall 5: RRFReranker Requires Both Vec and FTS Results as RecordBatch
**What goes wrong:** The manual `rerankHybrid(query, vecResults, ftsResults)` API takes `RecordBatch` objects, not plain arrays. Using `.toArray()` loses the Arrow RecordBatch type.
**Why it happens:** The hybrid pipeline uses `.nearestTo().fullTextSearch().rerank()` which handles the RecordBatch internally. The `rerankHybrid` method is for custom reranking — avoid it.
**How to avoid:** Use the fluent hybrid API (`.nearestTo().fullTextSearch().rerank(reranker).toArray()`) rather than calling `rerankHybrid` directly. The fluent API handles Arrow types internally.

### Pitfall 6: get_smart_context Overview vs Detailed Are Different Code Paths
**What goes wrong:** Treating both modes as "search" when overview mode is actually a metadata scan.
**Why it happens:** The name implies it uses search, but overview mode only needs document summaries — not vector search, not FTS.
**How to avoid:** Overview mode: query documents table with metadata filters, sort by priority/recency, extract 100-token summaries, accumulate to budget. Detailed mode: fetch by doc_id list + 1-hop graph expansion. These are two completely different code paths in the same tool.

### Pitfall 7: Scores from Different Search Methods Are Not Comparable
**What goes wrong:** Mixing raw `_distance` from vector search with `_score` from FTS — they have completely different scales and semantics.
**Why it happens:** Vector `_distance` (lower=better); FTS `_score` BM25 (higher=better); these are incomparable.
**How to avoid:** Normalize both to [0,1] before exposing as `relevance_score`. For vector: `1.0 - (_distance / 2)` (cosine). For FTS: `_score / (_score + 1)` (sigmoid, maps positive reals to [0,1)). For hybrid RRF output: the score from `.rerank()` is already normalized.

---

## Code Examples

Verified patterns from installed LanceDB 0.26.2 dist files:

### Creating the FTS Index (init_project.ts modification)
```typescript
// Source: node_modules/@lancedb/lancedb/dist/indices.d.ts — Index.fts() confirmed
// Source: node_modules/@lancedb/lancedb/dist/native.d.ts — createIndex() confirmed
import * as lancedb from "@lancedb/lancedb";

const docChunksTable = await db.openTable("doc_chunks");
try {
  await docChunksTable.createIndex("content", {
    config: lancedb.Index.fts({
      withPosition: true,
      stem: false,
      removeStopWords: false,
      lowercase: true,
    }),
    replace: true,
  });
  logger.debug("FTS index created on doc_chunks.content");
} catch (err) {
  logger.warn({ error: String(err) }, "FTS index creation failed — will create on first data insert");
}
```

### Semantic Search
```typescript
// Source: context7 /lancedb/lancedb — nearestTo, distanceType, where, limit, toArray confirmed
const [queryVector] = await embed([query], projectId, config);

const rows = await docChunksTable
  .query()
  .nearestTo(queryVector)
  .distanceType("cosine")
  .where(`project_id = '${projectId}' AND status = 'active'`)
  .limit(limit)
  .toArray();

// Normalize cosine distance [0,2] → relevance [0,1]
const results = rows
  .map(row => ({
    chunk_id: row.chunk_id as string,
    doc_id: row.doc_id as string,
    content: row.content as string,
    _distance: row._distance as number,
    relevance_score: 1.0 - ((row._distance as number) / 2),
  }))
  .filter(r => r.relevance_score >= minScore);
```

### Full-Text Search
```typescript
// Source: dist/query.d.ts — fullTextSearch() on StandardQueryBase confirmed
const rows = await docChunksTable
  .query()
  .fullTextSearch(query)
  .where(`project_id = '${projectId}' AND status = 'active'`)
  .limit(limit)
  .toArray();

// Normalize BM25 score: sigmoid maps positive reals to [0,1)
const results = rows
  .map(row => ({
    chunk_id: row.chunk_id as string,
    doc_id: row.doc_id as string,
    content: row.content as string,
    relevance_score: (row._score as number) / ((row._score as number) + 1),
  }))
  .filter(r => r.relevance_score >= minScore);
```

### Hybrid Search
```typescript
// Source: dist/rerankers/rrf.d.ts — RRFReranker.create(k?) confirmed in 0.26.2
// Source: dist/query.d.ts — rerank(reranker: Reranker) on VectorQuery confirmed
import { rerankers } from "@lancedb/lancedb";

const reranker = await rerankers.RRFReranker.create(60);
const [queryVector] = await embed([query], projectId, config);

const rows = await docChunksTable
  .query()
  .nearestTo(queryVector)
  .distanceType("cosine")
  .fullTextSearch(query)
  .where(`project_id = '${projectId}' AND status = 'active'`)
  .rerank(reranker)
  .limit(limit)
  .toArray();

// RRF output score field: check actual field name at runtime
// Expected: _relevance_score or _score; normalize if needed
```

### Token Budget Accumulation (get_smart_context)
```typescript
// Source: gpt-tokenizer already in deps — countTokens confirmed in src/services/chunker.ts
import { countTokens } from "gpt-tokenizer";

function assembleWithBudget<T extends { content: string }>(
  items: T[],
  maxTokens: number,
  getSummary: (item: T) => string,
): Array<T & { summary: string; tokenCount: number }> {
  let used = 0;
  const results = [];
  for (const item of items) {
    const summary = getSummary(item);
    const tokens = countTokens(summary);
    if (used + tokens > maxTokens) break; // drop-lowest: stop adding (caller sorted by relevance/priority)
    results.push({ ...item, summary, tokenCount: tokens });
    used += tokens;
  }
  return results;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate FTS + vector search with manual merge | Native hybrid search with built-in rerankers | LanceDB 0.20+ | Simpler code, Rust-native performance |
| `table.search(query)` as the only vector search API | `table.query().nearestTo(vector)` fluent builder | LanceDB 0.20+ | Supports chaining with FTS, where, rerank |
| `table.create_fts_index()` (Python-style) | `table.createIndex(col, { config: Index.fts() })` | Current in 0.26.2 | TypeScript API is unified: same createIndex for all index types |

**Deprecated/outdated:**
- `table.search(vector).where()` shorthand: Still works but the fluent `.query().nearestTo()` form is preferred for hybrid combinations.
- Direct `rerankHybrid()` calls: Prefer the fluent `.rerank()` chain; `rerankHybrid` is for custom reranker implementations only.

---

## Open Questions

1. **RRF output score field name**
   - What we know: `RRFReranker` is confirmed in dist/rerankers/rrf.d.ts. RRF produces a merged score.
   - What's unclear: The exact field name in the result rows (`_relevance_score` vs `_score` vs something else) is not in the type definitions — only the return type `RecordBatch` is documented.
   - Recommendation: Add a test that logs result row keys after hybrid search to confirm the field name before building normalization logic. Expected: `_relevance_score` based on LanceDB convention.

2. **Pre-filter doc_id IN clause with large document sets**
   - What we know: SQL string predicates in LanceDB are passed to DataFusion. Large IN clauses may be slow.
   - What's unclear: The practical limit before performance degrades. No benchmarks available for this codebase's scale.
   - Recommendation: Implement with a cap of 200 doc_ids in the IN clause for Phase 5. Add a comment marking it as a future tuning point.

3. **FTS index availability after init_project on empty table**
   - What we know: Phase 02-03 decision confirmed BTree indexes succeed on empty tables in 0.26.2. The FTS index behavior may differ.
   - What's unclear: Whether `Index.fts()` on an empty `doc_chunks` table succeeds or requires at least one row.
   - Recommendation: Wrap in the existing try/catch pattern (same as BTree). The index will auto-update on first insert. This is already the established graceful degradation pattern.

---

## Validation Architecture

> nyquist_validation is NOT present in .planning/config.json — skipping this section per instructions.

*(The config.json has mode/depth/parallelization/commit_docs/model_profile/workflow keys but no `workflow.nyquist_validation` field. Skipping Validation Architecture section.)*

---

## Sources

### Primary (HIGH confidence)
- `/home/kanter/code/project_mcp/node_modules/@lancedb/lancedb/dist/rerankers/rrf.d.ts` — RRFReranker class, `create(k?)` static method, `rerankHybrid()` signature — confirmed directly from installed 0.26.2
- `/home/kanter/code/project_mcp/node_modules/@lancedb/lancedb/dist/query.d.ts` — `fullTextSearch()`, `rerank()`, `nearestTo()`, `distanceType()`, `_distance` field, `where()` — confirmed
- `/home/kanter/code/project_mcp/node_modules/@lancedb/lancedb/dist/indices.d.ts` — `Index.fts(options?: Partial<FtsOptions>)`, `FtsOptions` interface, `createIndex()` on NativeTable — confirmed
- `/home/kanter/code/project_mcp/node_modules/@lancedb/lancedb/dist/native.d.ts` — `createIndex()` method signature on NativeTable — confirmed
- Context7 `/lancedb/lancedb` — vector search, FTS, hybrid search TypeScript examples
- Context7 `/websites/lancedb` — hybrid search, RRF reranker, FTS index creation examples

### Secondary (MEDIUM confidence)
- `https://docs.lancedb.com/search/hybrid-search` — hybrid search pipeline, RRFReranker.create() TypeScript — consistent with what was found in installed dist files
- `https://docs.lancedb.com/search/full-text-search` — FTS query syntax, BM25 scoring — consistent with query.d.ts

### Tertiary (LOW confidence)
- RRF output field name `_relevance_score` — inferred from LanceDB Python conventions, not confirmed in TypeScript dist files. Must validate empirically.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs verified against installed node_modules dist files
- Architecture: HIGH — patterns derived from verified API + existing Phase 4 codebase conventions
- Pitfalls: HIGH (doc_chunks schema confirmed, filter strategy is logical); MEDIUM for pitfall around RRF score field name (not confirmed in dist)
- Validation architecture: N/A — nyquist_validation not configured

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (LanceDB 0.26.2 is pinned; APIs are stable for this version)
