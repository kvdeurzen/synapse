---
phase: 05-document-search
plan: "01"
subsystem: search-foundation
tags: [fts, search-utils, lancedb, token-counting, score-normalization]
dependency_graph:
  requires:
    - 04-document-management/04-01 (doc_chunks table with content column)
    - 04-document-management/04-02 (storeDocument creates doc_chunks rows)
  provides:
    - FTS index on doc_chunks.content (created at init_project time)
    - search-utils.ts shared utilities (normalizers, snippet extractor, predicate builder, metadata fetcher)
  affects:
    - 05-02 (semantic_search will use search-utils)
    - 05-03 (fulltext_search depends on FTS index + search-utils)
    - 05-04 (hybrid_search uses both)
    - 05-05 (get_smart_context uses extractSnippet + fetchDocMetadata)
tech_stack:
  added: []
  patterns:
    - FTS index creation in try/catch (same graceful degradation pattern as BTree index)
    - Metadata pre-filter via doc_id IN (...) with 200-doc cap
    - Sigmoid normalization for BM25 (score/(score+1))
    - Character-window + token-trim snippet extraction
key_files:
  created:
    - src/tools/search-utils.ts
    - test/tools/init-project-fts.test.ts
    - test/tools/search-utils.test.ts
  modified:
    - src/tools/init-project.ts
decisions:
  - "FTS index on empty doc_chunks table gracefully degrades: wrapped in same try/catch as BTree index — init_project succeeds even if FTS index fails"
  - "Metadata pre-filter capped at 200 doc_ids (RESEARCH.md pitfall 4); beyond that, postFilterRequired=true is returned to caller"
  - "normalizeFtsScore uses sigmoid (score/(score+1)) — maps positive reals to [0,1), returns 0 for score<=0"
  - "normalizeVectorScore uses 1-(d/2) with clamp to [0,1] — maps cosine distance [0,2] to relevance [0,1]"
  - "extractSnippet uses ~4 chars/token heuristic for initial window, then exact token-trim loop"
  - "Tag validation in buildSearchPredicate uses same /^[a-zA-Z0-9_-]+$/ pattern as query-documents.ts for consistency"
metrics:
  duration_seconds: 211
  duration_display: "~3 min"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  tests_added: 31
  completed_date: "2026-02-28"
---

# Phase 5 Plan 01: FTS Index and Search Utilities Summary

**One-liner:** FTS index on doc_chunks.content added to init_project with graceful degradation, plus shared search-utils.ts module providing score normalization, snippet extraction, metadata pre-filtering, and batch doc metadata fetch.

## What Was Built

### Task 1: FTS Index in init_project (commit 8f84e2c)

Modified `src/tools/init-project.ts` to create an FTS index on the `doc_chunks.content` column immediately after table creation. Placed inside the `if (tables_created > 0)` guard (fresh databases only), before the starter document seeding block.

FTS index configuration:
- `withPosition: true` — enables phrase queries
- `stem: false` — preserves technical terms exactly (no stemming of "embeddings" to "embed")
- `removeStopWords: false` — keeps all words including common ones (technical queries often need them)
- `lowercase: true` — normalizes case for matching
- `replace: true` — idempotent on re-init

The index creation is wrapped in the same try/catch pattern as the existing BTree indexes. If FTS index creation fails on an empty table, a warning is logged and init_project continues successfully — the index will be created on first data insert.

### Task 2: Shared Search Utilities (commit b71cb72)

Created `src/tools/search-utils.ts` with 6 exports:

1. **`SearchResultItem` interface** — common result shape with doc_id, chunk_id, title, category, status, relevance_score (0.0-1.0), snippet (~100-200 tokens), and source ('document' | 'code').

2. **`normalizeVectorScore(distance)`** — converts cosine distance [0,2] to relevance [0,1] via `1.0 - (distance / 2)`. Clamped to [0,1] for safety.

3. **`normalizeFtsScore(score)`** — converts BM25 score to [0,1] via sigmoid `score / (score + 1)`. Returns 0 for score <= 0.

4. **`extractSnippet(content, query, maxTokens=150)`** — extracts a token-budget-aware snippet:
   - Pass-through if content already fits budget
   - Finds first query word occurrence (case-insensitive)
   - Extracts character window (~4 chars/token) centered on that position
   - Trims to exact token budget (10-char increments from end)
   - Adds "..." prefix/suffix markers as needed

5. **`fetchDocMetadata(dbPath, projectId, docIds)`** — batch-fetches `DocMeta` (title, category, status, phase, tags, priority) from the documents table for given doc_ids. Returns `Map<string, DocMeta>`.

6. **`buildSearchPredicate(projectId, filters, opts?)`** — builds WHERE clause for doc_chunks queries:
   - Always includes `project_id = '{projectId}'` and `status = 'active'` (unless `includeSuperseded`)
   - Pre-fetches matching doc_ids from documents table for metadata filters (category, phase, tags, status, priority)
   - Caps pre-filter at 200 doc_ids (RESEARCH.md pitfall 4); sets `postFilterRequired: true` if exceeded
   - Tag validation: rejects tags not matching `/^[a-zA-Z0-9_-]+$/`
   - Returns `{ predicate, docMap, postFilterRequired? }`

## Test Coverage

| File | Tests | What's Covered |
|------|-------|----------------|
| test/tools/init-project-fts.test.ts | 3 | Init completes, FTS queryable after insert, re-init skips FTS creation |
| test/tools/search-utils.test.ts | 28 | Boundary values for normalization, snippet extraction edge cases, predicate building with all filter combos, tag validation, fetchDocMetadata |

Total: 31 new tests. All 297 tests in the full suite pass (no regressions).

## Verification Results

1. `bun test test/tools/init-project-fts.test.ts` — 3/3 pass
2. `bun test test/tools/search-utils.test.ts` — 28/28 pass
3. `bun test` — 297/297 pass (no regressions)
4. `grep "Index.fts" src/tools/init-project.ts` — confirmed
5. All 6 exports confirmed in src/tools/search-utils.ts

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files
- [x] `src/tools/search-utils.ts` — created
- [x] `test/tools/init-project-fts.test.ts` — created
- [x] `test/tools/search-utils.test.ts` — created
- [x] `src/tools/init-project.ts` — modified (FTS index block added)

### Commits
- [x] `8f84e2c` — feat(05-01): add FTS index creation
- [x] `b71cb72` — feat(05-01): create shared search utility module
