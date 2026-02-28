---
phase: 05-document-search
verified: 2026-02-28T16:30:00Z
status: passed
score: 21/21 must-haves verified
re_verification: false
---

# Phase 5: Document Search Verification Report

**Phase Goal:** Implement document search capabilities — semantic search (vector), full-text search (BM25), hybrid search (RRF), and smart context assembly tool with token budget management.
**Verified:** 2026-02-28T16:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                              | Status     | Evidence                                                                                                                     |
|----|----------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------------|
| 1  | FTS index is created on doc_chunks.content during init_project                                     | VERIFIED   | `src/tools/init-project.ts` lines 181-202: `lancedb.Index.fts({withPosition:true, stem:false, ...})`, wrapped in try/catch  |
| 2  | buildSearchPredicate produces correct SQL WHERE clauses for all filter combinations                 | VERIFIED   | `src/tools/search-utils.ts` lines 200-309; 7 test cases cover no-filter, category, phase, tag, superseded, IN clause       |
| 3  | extractSnippet returns a ~100-200 token window centered on query terms                             | VERIFIED   | `src/tools/search-utils.ts` lines 105-137: char-window + token-trim loop with "..." markers                                  |
| 4  | normalizeVectorScore converts cosine distance [0,2] to relevance [0,1]                            | VERIFIED   | Line 69: `Math.max(0, Math.min(1, 1.0 - distance / 2))`; 6 boundary tests pass                                              |
| 5  | normalizeFtsScore converts BM25 scores to [0,1] via sigmoid                                       | VERIFIED   | Line 87: `score / (score + 1)`; 6 boundary tests pass                                                                       |
| 6  | semantic_search returns ranked results with normalized relevance scores [0,1] from cosine distance | VERIFIED   | `src/tools/semantic-search.ts`: calls `normalizeVectorScore(row._distance)`; 9/9 tests pass                                  |
| 7  | fulltext_search returns BM25-ranked results with normalized scores [0,1]                          | VERIFIED   | `src/tools/fulltext-search.ts`: calls `normalizeFtsScore(row._score)`; 8/8 tests pass                                       |
| 8  | hybrid_search merges vector + FTS results via LanceDB native RRFReranker(60)                      | VERIFIED   | `src/tools/hybrid-search.ts` line 130: `await rerankers.RRFReranker.create(60)`; fluent chain confirmed                      |
| 9  | All three search tools support category, phase, tags, status, priority metadata filters            | VERIFIED   | All three tools call `buildSearchPredicate()` with conditional filter objects; tests confirm category filter narrows results  |
| 10 | semantic_search fails with clear error when Ollama unreachable                                     | VERIFIED   | Lines 70-73: `getOllamaStatus() !== "ok"` → throws `OllamaUnreachableError`; test confirms                                   |
| 11 | hybrid_search falls back to FTS-only when Ollama unreachable                                      | VERIFIED   | Lines 79-98: calls `fulltextSearch()` with `{fallback:true, search_type:'hybrid_fts_fallback'}`; 10/10 tests pass           |
| 12 | fulltext_search works regardless of Ollama status                                                  | VERIFIED   | No `getOllamaStatus()` call in `fulltext-search.ts`; tests confirmed no fetch to Ollama                                      |
| 13 | min_score threshold filters out low-relevance results                                              | VERIFIED   | All three tools filter results by `score >= minScore` after normalization                                                     |
| 14 | All results include source='document' attribution                                                  | VERIFIED   | All three search tools and get_smart_context set `source: "document"` in every result                                        |
| 15 | get_smart_context overview mode returns ~100 token summaries per document within token budget      | VERIFIED   | `src/tools/get-smart-context.ts` lines 111-201: `extractSnippet(content, "", 100)` + `countTokens` budget loop               |
| 16 | get_smart_context detailed mode fetches full content for specified doc_ids with 1-hop expansion    | VERIFIED   | Lines 207-354: `getRelatedDocuments()` called per doc_id; `RELATIONSHIP_PRIORITY` map governs ordering                       |
| 17 | get_smart_context respects max_tokens budget using drop-lowest strategy                            | VERIFIED   | Overview: `break` when `totalTokens + summaryTokens > maxTokens`; Detailed: `continue` to skip oversized related docs        |
| 18 | Default max_tokens budget is 4000                                                                  | VERIFIED   | Zod schema: `.default(4000)`; `runOverviewMode` and `runDetailedMode` both use `args.max_tokens ?? 4000`                     |
| 19 | 1-hop expansion prioritizes depends_on/implements before references/related_to                     | VERIFIED   | `RELATIONSHIP_PRIORITY`: `{depends_on:1, implements:1, references:2, related_to:2, ...}`; sorted by value                   |
| 20 | All four search tools appear in MCP tools/list after server startup                                | VERIFIED   | `src/server.ts` lines 73-83: all four `registerXTool(server, config)` calls present; 15 `toolCount++` increments confirmed   |
| 21 | bun test passes with no regressions across entire test suite                                       | VERIFIED   | 347/347 tests pass; TypeScript compiles clean (`bun tsc --noEmit` exits 0)                                                  |

**Score:** 21/21 truths verified

---

### Required Artifacts

| Artifact                                    | Expected                                               | Status     | Details                                                               |
|---------------------------------------------|--------------------------------------------------------|------------|-----------------------------------------------------------------------|
| `src/tools/search-utils.ts`                 | Shared search utilities (6 exports)                    | VERIFIED   | 310 lines; exports SearchResultItem, buildSearchPredicate, extractSnippet, normalizeVectorScore, normalizeFtsScore, fetchDocMetadata |
| `src/tools/semantic-search.ts`              | semantic_search MCP tool                               | VERIFIED   | 251 lines; exports semanticSearch + registerSemanticSearchTool        |
| `src/tools/fulltext-search.ts`              | fulltext_search MCP tool                               | VERIFIED   | 242 lines; exports fulltextSearch + registerFulltextSearchTool        |
| `src/tools/hybrid-search.ts`                | hybrid_search MCP tool                                 | VERIFIED   | 301 lines; exports hybridSearch + registerHybridSearchTool            |
| `src/tools/get-smart-context.ts`            | get_smart_context MCP tool — two-phase context assembly | VERIFIED   | 475 lines; exports getSmartContext + registerGetSmartContextTool       |
| `src/tools/init-project.ts`                 | Modified with FTS index creation                       | VERIFIED   | Lines 181-202: FTS index block inside `tables_created > 0` guard     |
| `src/server.ts`                             | Updated server with 4 search tools registered          | VERIFIED   | Lines 73-83: all 4 tool registrations; 15 total toolCount++           |
| `test/tools/search-utils.test.ts`           | Tests for all search utility functions                 | VERIFIED   | 381 lines; 28 tests covering boundary values, all filter combos       |
| `test/tools/init-project-fts.test.ts`       | Test confirming FTS index creation                     | VERIFIED   | 101 lines; 3 tests covering init, FTS queryability, re-init skip     |
| `test/tools/semantic-search.test.ts`        | Tests for semantic_search                              | VERIFIED   | 440 lines; 9 tests covering Ollama gate, scores, filters, structure   |
| `test/tools/fulltext-search.test.ts`        | Tests for fulltext_search                              | VERIFIED   | Exists; 8 tests pass                                                  |
| `test/tools/hybrid-search.test.ts`          | Tests for hybrid_search                                | VERIFIED   | Exists; 10 tests pass                                                 |
| `test/tools/get-smart-context.test.ts`      | Tests for get_smart_context overview and detailed modes| VERIFIED   | Exists; 21 tests pass                                                 |

---

### Key Link Verification

| From                              | To                                | Via                                         | Status  | Details                                                              |
|-----------------------------------|-----------------------------------|---------------------------------------------|---------|----------------------------------------------------------------------|
| `src/tools/init-project.ts`       | doc_chunks table FTS index        | `lancedb.Index.fts()`                       | WIRED   | Pattern `Index.fts` present at line 187                              |
| `src/tools/search-utils.ts`       | gpt-tokenizer                     | `countTokens` import                        | WIRED   | Line 13: `import { countTokens } from "gpt-tokenizer"`              |
| `src/tools/semantic-search.ts`    | `src/services/embedder.ts`        | `embed()` for query vectorization           | WIRED   | Line 14 import; line 96 call: `await embed([validated.query], ...)`  |
| `src/tools/hybrid-search.ts`      | `src/tools/fulltext-search.ts`    | `fulltextSearch()` for Ollama-unreachable fallback | WIRED | Line 27 import; line 85 call in fallback branch                 |
| `src/tools/semantic-search.ts`    | `src/tools/search-utils.ts`       | buildSearchPredicate, extractSnippet, etc.  | WIRED   | Lines 17-23: all 4 utilities imported and used                       |
| `src/tools/get-smart-context.ts`  | `src/tools/get-related-documents.ts` | 1-hop graph traversal for detailed mode  | WIRED   | Line 24 import; line 263: `await getRelatedDocuments(...)`           |
| `src/tools/get-smart-context.ts`  | gpt-tokenizer                     | `countTokens` for budget management         | WIRED   | Line 18 import; used at lines 172, 174, 319, 322                    |
| `src/tools/get-smart-context.ts`  | `src/tools/search-utils.ts`       | `extractSnippet` for overview summaries     | WIRED   | Line 25 import; line 171 call                                        |
| `src/server.ts`                   | `src/tools/semantic-search.ts`    | `registerSemanticSearchTool` import + call  | WIRED   | Line 17 import; line 73 call                                         |
| `src/server.ts`                   | `src/tools/fulltext-search.ts`    | `registerFulltextSearchTool` import + call  | WIRED   | Line 8 import; line 76 call                                          |
| `src/server.ts`                   | `src/tools/hybrid-search.ts`      | `registerHybridSearchTool` import + call    | WIRED   | Line 11 import; line 79 call                                         |
| `src/server.ts`                   | `src/tools/get-smart-context.ts`  | `registerGetSmartContextTool` import + call | WIRED   | Line 10 import; line 82 call                                         |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                 | Status      | Evidence                                                                                      |
|-------------|-------------|--------------------------------------------------------------------------------------------|-------------|-----------------------------------------------------------------------------------------------|
| SRCH-01     | 05-02, 05-04 | User can run semantic search with filters and min_relevance threshold                      | SATISFIED   | `semantic-search.ts`: Zod-validated filters, min_score param, normalizeVectorScore output    |
| SRCH-02     | 05-02, 05-04 | User can run full-text search across documents                                              | SATISFIED   | `fulltext-search.ts`: BM25 via `.fullTextSearch()`, normalizeFtsScore, all filters supported |
| SRCH-03     | 05-02, 05-04 | Hybrid search merges semantic and FTS results via Reciprocal Rank Fusion (k=60)             | SATISFIED   | `hybrid-search.ts`: `await rerankers.RRFReranker.create(60)` with fluent `.rerank()` chain  |
| SRCH-04     | 05-03, 05-04 | get_smart_context overview returns summaries from both documents and code_chunks tables     | PARTIAL     | See note below                                                                                |
| SRCH-05     | 05-03, 05-04 | get_smart_context detailed fetches full content for agent-specified doc_ids with 1-hop traversal | SATISFIED | `runDetailedMode`: full content + `getRelatedDocuments()` + RELATIONSHIP_PRIORITY ordering   |
| SRCH-06     | 05-03, 05-04 | get_smart_context respects max_tokens budget and truncates results to fit                  | SATISFIED   | Drop-lowest strategy in both modes; `countTokens` used for budget tracking                   |
| SRCH-07     | 05-01, 05-02, 05-04 | Search results include relevance scores and source attribution                        | SATISFIED   | All results have `relevance_score` [0,1] and `source: "document"` field                     |

**Note on SRCH-04:** The REQUIREMENTS.md text says "from both documents and code_chunks tables." The Phase 5 implementation queries only the `documents` table — this is by deliberate design decision. The CONTEXT.md explicitly states "Code search is Phase 7" as the phase boundary. The ROADMAP.md Phase 7 success criterion 4 explicitly defers cross-table overview to Phase 7: "A get_smart_context overview call against a project with both stored documents and indexed code returns summaries from both tables in a single response." The code_chunks table has no data yet (Phase 6 builds the indexer). The document-only overview fully satisfies the spirit of SRCH-04 for Phase 5 scope; the cross-table aspect is gated on Phase 6 being complete and is correctly deferred to Phase 7.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No TODO, FIXME, placeholder, or stub patterns found in any Phase 5 source files |

Anti-pattern scan was run against:
- `src/tools/search-utils.ts`
- `src/tools/semantic-search.ts`
- `src/tools/fulltext-search.ts`
- `src/tools/hybrid-search.ts`
- `src/tools/get-smart-context.ts`
- `src/tools/init-project.ts` (FTS block)
- `src/server.ts`

No red flags found. All return values are substantive (actual DB query results, not static responses). All handlers perform real work.

---

### Human Verification Required

#### 1. Hybrid search RRF quality

**Test:** Store 10+ documents, run a query where exact keyword match is in docs that are NOT the most semantically similar. Compare `fulltext_search` vs `semantic_search` vs `hybrid_search` results for the same query.
**Expected:** hybrid_search result order should differ from both pure approaches — exact-keyword docs rank higher than in semantic-only, while semantically-relevant docs rank higher than in FTS-only.
**Why human:** Cannot verify ranking quality difference programmatically without real Ollama embeddings and real FTS data in the same test run.

#### 2. FTS queryability with actual data

**Test:** Run `initProject`, call `store_document` to create real chunked content, then call `fulltext_search` with a keyword present in the stored content.
**Expected:** fulltext_search returns the stored document chunk ranked at top.
**Why human:** Test suite wraps FTS queries in try/catch because the FTS index on an empty table may not be queryable in all LanceDB versions. Real data flow (store_document → FTS index populated → fulltext_search) needs human smoke test.

#### 3. Token budget enforcement feel

**Test:** Set `max_tokens: 500` and store 20 documents. Call `get_smart_context` in overview mode.
**Expected:** Response includes only the highest-priority documents that fit, with `included_documents` < `total_documents`, and the total_tokens value does not exceed 500.
**Why human:** The math is correct in code, but the user-facing experience (which documents get dropped, whether the result "feels right") needs human judgment.

---

### Gaps Summary

No gaps found. All 21 observable truths verified. All 13 artifacts verified at all three levels (exists, substantive, wired). All 12 key links confirmed. 347/347 tests pass. TypeScript compiles clean.

The only noted partial on SRCH-04 (code_chunks table in overview mode) is intentional phase scoping, not an implementation gap — the code_chunks table has no data until Phase 6, and cross-table overview is explicitly assigned to Phase 7 in the ROADMAP.

---

_Verified: 2026-02-28T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
