---
phase: 04-document-management
plan: 01
subsystem: database
tags: [lancedb, apache-arrow, zod, gpt-tokenizer, langchain-textsplitters, chunking, activity-log]

# Dependency graph
requires:
  - phase: 02-database-schema
    provides: "LanceDB schema patterns (TABLE_NAMES, TABLE_SCHEMAS, insertBatch, Zod row validation), established Arrow schema conventions"
  - phase: 03-embedding-service
    provides: "Embedder service patterns; 768-dim vector dimension confirmed"

provides:
  - "doc_chunks Arrow schema with nullable 768-dim vector field"
  - "DocChunkRowSchema Zod validator"
  - "doc_chunks added to TABLE_NAMES and TABLE_SCHEMAS"
  - "chunkDocument() with semantic_section, paragraph, and fixed_size strategies"
  - "Category-to-strategy mapping for all 12 document categories"
  - "Context header prefixing: 'Document: {title} | Section: {header}'"
  - "Token counting via gpt-tokenizer countTokens (cl100k_base BPE)"
  - "logActivity() audit helper using insertBatch + ActivityLogRowSchema"

affects: [04-02, 04-03, 04-04, 05-code-indexing]

# Tech tracking
tech-stack:
  added: [gpt-tokenizer@3.4.0, "@langchain/textsplitters@1.0.1"]
  patterns:
    - "RecursiveCharacterTextSplitter.fromLanguage('markdown') for semantic_section chunking"
    - "Hand-rolled paragraph splitter on double-newline boundaries"
    - "Hand-rolled fixed_size splitter with character overlap"
    - "Context prefix pattern: 'Document: {title} | Section: {header}'"
    - "logActivity called AFTER successful mutation, never before"

key-files:
  created:
    - src/services/chunker.ts
    - src/services/activity-log.ts
    - test/services/chunker.test.ts
    - test/services/activity-log.test.ts
  modified:
    - src/db/schema.ts
    - src/tools/init-project.ts
    - test/db/init-project.test.ts
    - test/db/schema.test.ts
    - test/db/delete-project.test.ts
    - package.json
    - bun.lock

key-decisions:
  - "doc_chunks vector field is nullable (supports starter docs without embeddings)"
  - "doc_chunks placed before code_chunks in TABLE_NAMES order"
  - "Actor hardcoded to 'agent' in logActivity (MCP SDK has no caller identity)"
  - "Category-to-strategy mapping hardcoded; 7 categories to semantic_section, 3 to paragraph, 2 to fixed_size"
  - "Default fallback for unknown categories is semantic_section"
  - "gpt-tokenizer cl100k_base BPE encoding for token counting (pure JS, no WASM, Bun-compatible)"

patterns-established:
  - "Chunker returns ChunkResult[] with content (prefixed), header, tokenCount, chunkIndex"
  - "logActivity signature: (db, projectId, action, targetId, targetType, metadata?)"
  - "All chunk content includes context prefix before embedding"

requirements-completed: [DOC-02, DOC-03, DOC-11]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 4 Plan 01: Document Management Infrastructure Summary

**doc_chunks Arrow schema, three-strategy document chunker with context prefixing and BPE token counting, and activity log helper using gpt-tokenizer and @langchain/textsplitters**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T07:46:58Z
- **Completed:** 2026-02-28T07:52:54Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Extended schema.ts with DOC_CHUNKS_SCHEMA (Arrow, 11 fields, nullable 768-dim vector) and DocChunkRowSchema (Zod), plus TABLE_NAMES/TABLE_SCHEMAS updated to include doc_chunks
- Built src/services/chunker.ts with chunkDocument() implementing three strategies (semantic_section via RecursiveCharacterTextSplitter, paragraph hand-rolled, fixed_size hand-rolled), category-to-strategy mapping for all 12 document types, context header prefixing, and gpt-tokenizer BPE token counting
- Built src/services/activity-log.ts with logActivity() using insertBatch + ActivityLogRowSchema, actor hardcoded to "agent", ULID for log_id
- 36 new tests added (27 chunker + 9 activity-log), all passing; full suite 154 pass 0 fail

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, add doc_chunks schema, and build chunking service** - `9fd1283` (feat)
2. **Task 2: Build activity log helper and tests; fix table count regressions** - `5920b3a` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified

- `src/db/schema.ts` - Extended with DOC_CHUNKS_SCHEMA, DocChunkRowSchema, doc_chunks in TABLE_NAMES and TABLE_SCHEMAS
- `src/services/chunker.ts` - Document chunking service: chunkDocument(), countTokens, getCategoryStrategy, ChunkResult type
- `src/services/activity-log.ts` - logActivity() audit helper using insertBatch
- `test/services/chunker.test.ts` - 27 tests covering all strategies, context headers, token counting, edge cases
- `test/services/activity-log.test.ts` - 9 tests covering insertion, ULID format, metadata serialization, chronological ordering
- `src/tools/init-project.ts` - Updated description comment to reflect 6 tables
- `test/db/init-project.test.ts` - Updated table count 5->6, added doc_chunks to TABLE_NAMES list
- `test/db/schema.test.ts` - Updated TABLE_NAMES count assertion 5->6
- `test/db/delete-project.test.ts` - Updated tables_cleaned assertions 5->6
- `package.json` - Added gpt-tokenizer@3.4.0 and @langchain/textsplitters@1.0.1
- `bun.lock` - Updated lockfile

## Decisions Made

- **Nullable vector field**: doc_chunks vector is nullable (third arg `true` to `new Field`) to support starter documents stored without embeddings — matches Research Pitfall 5 Option 2 hybrid
- **doc_chunks position in TABLE_NAMES**: Placed before code_chunks (documents, doc_chunks, code_chunks, ...) — init_project creates tables in this order; doc_chunks must exist before any document tool runs
- **gpt-tokenizer**: Pure JS BPE tokenizer (cl100k_base), no WASM, Bun-compatible — selected over tiktoken which requires WASM
- **RecursiveCharacterTextSplitter.fromLanguage('markdown')**: Used for semantic_section to respect markdown structure; chunkSize=2000 chars, chunkOverlap=200 chars
- **logActivity called AFTER mutation**: Design per research anti-pattern documentation — never log before write succeeds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in extractSectionHeader**
- **Found during:** Task 1 (chunker service)
- **Issue:** `match[1]` typed as `string | undefined` even after truthy match check — TS2532: Object is possibly 'undefined'
- **Fix:** Changed to `match?.[1] ? match[1].trim() : null` using optional chain per Biome's `useOptionalChain` rule
- **Files modified:** src/services/chunker.ts
- **Verification:** `bunx tsc --noEmit` passes, Biome passes
- **Committed in:** 9fd1283 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed test table count regressions after adding doc_chunks**
- **Found during:** Task 2 verification (full test suite run)
- **Issue:** 5 pre-existing tests hardcoded table count as 5; adding doc_chunks increased count to 6, breaking: init-project.test.ts (2 tests), schema.test.ts (1 test), delete-project.test.ts (2 tests)
- **Fix:** Updated all hardcoded counts from 5 to 6; added "doc_chunks" to init-project.test.ts local TABLE_NAMES array; updated init-project.ts description comment
- **Files modified:** test/db/init-project.test.ts, test/db/schema.test.ts, test/db/delete-project.test.ts, src/tools/init-project.ts
- **Verification:** `bun test` — 154 pass, 0 fail
- **Committed in:** 5920b3a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 bugs — TypeScript error, test count regressions)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- gpt-tokenizer and @langchain/textsplitters installed cleanly; no dependency conflicts
- Biome formatter required line-break reformatting of long Array.from() call in test (fixed during Task 1)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- doc_chunks table schema ready for Plans 02-04 (store_document, update_document, delete_document, link_documents)
- chunkDocument() ready to be called by store_document in Plan 02
- logActivity() ready to be called by all mutation tools in Plans 02-04
- All 154 tests pass, TypeScript compiles clean, Biome passes

---
*Phase: 04-document-management*
*Completed: 2026-02-28*

## Self-Check: PASSED

All files present:
- src/db/schema.ts - FOUND
- src/services/chunker.ts - FOUND
- src/services/activity-log.ts - FOUND
- test/services/chunker.test.ts - FOUND
- test/services/activity-log.test.ts - FOUND
- .planning/phases/04-document-management/04-01-SUMMARY.md - FOUND

All commits present:
- 9fd1283 - FOUND (Task 1)
- 5920b3a - FOUND (Task 2)
