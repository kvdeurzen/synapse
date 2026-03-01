---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-03-01T05:10:44Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 22
  completed_plans: 21
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content
**Current focus:** Phase 7 — Code Search and Integration Validation

## Current Position

Phase: 7 of 7 (Code Search and Integration Validation)
Plan: 1 of 2 in phase 07 (plan 01 complete — search_code tool with semantic/fulltext/hybrid modes, 469 tests pass)
Status: Plan 07-01 COMPLETE — search_code registered as tool 17, all three search modes implemented, CSRCH-01/02/03 done
Last activity: 2026-03-01 — Plan 07-01 complete: search_code MCP tool implemented and registered

Progress: [█████████░] 95% (Phase 7: 1/2 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 5 min
- Total execution time: ~0.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-mcp-foundation | 2/2 | 9 min | 4.5 min |
| 02-database-schema | 3/3 | 12 min | 4 min |
| 03-embedding-service | 2/2 | 8 min | 4 min |
| 04-document-management | 4/4 | 28 min | 7 min |
| 05-document-search | 3/5 | ~11 min | ~4 min |

**Recent Trend:**
- Last 5 plans: 3 min, 8 min, 6 min, 4 min, 4 min
- Trend: stable

*Updated after each plan completion*
| Phase 05-document-search P03 | 4 | 2 tasks | 2 files |
| Phase 05-document-search P02 | 419 | 2 tasks | 6 files |
| Phase 05-document-search P04 | 3 | 1 tasks | 5 files |
| Phase 06-code-indexing P01 | 5 | 2 tasks | 7 files |
| Phase 06-code-indexing P03 | 4 | 2 tasks | 2 files |
| Phase 06-code-indexing P04 | 4 | 2 tasks | 2 files |
| Phase 06-code-indexing P05 | 5 | 2 tasks | 4 files |
| Phase 07-code-search P01 | 3 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-build]: stdout contamination must be addressed in Phase 1 before any business logic — research confirmed this is silent and permanent if deferred
- [Pre-build]: LanceDB schema is immutable after first write — Phase 2 must define all columns (including v2 forward-compatibility fields) before Phase 4 stores any documents
- [Pre-build]: Pin @lancedb/lancedb to exactly 0.26.2 — 0.27.x-beta has a breaking insert API change
- [Pre-build]: Do not explicitly install apache-arrow — let lancedb manage its own pinned version to avoid TypeScript type errors
- [01-01]: Zod v4.3.6 resolved (not v3) — pinned to ^4.0.0; Zod v4 uses z.string({ error: msg }) for invalid_type customization
- [01-01]: bun@1.3.9 generates bun.lock (text format) not bun.lockb (binary) — committed as lockfile
- [01-01]: Config subprocess tests use temp file + `bun run file.ts -- args` to avoid bun flag collision with --db
- [01-02]: McpServer._registeredTools is a plain object (not Map) — use bracket notation in tests
- [01-02]: Tool count tracked as module-level counter (private field on TypeScript type)
- [01-02]: notifications/initialized must be sent after initialize before subsequent MCP requests
- [01-02]: registerXTool(server, config, ...) pattern established for all future tool registrations
- [Phase 02-01]: Apache-arrow types imported from 'apache-arrow' (transitive dep) not '@lancedb/lancedb' — lancedb TypeScript index.d.ts does not re-export Arrow types
- [Phase 02-01]: Zod v4 ZodIssue.path is PropertyKey[] (includes symbols) — use .map(String) for safe string conversion in error formatting
- [Phase 02-02]: TABLE_SCHEMAS null guard — Record<string,Schema> index returns Schema|undefined in strict TS; explicit guard throws informative error instead of non-null assertion
- [Phase 02-02]: BTree index graceful degradation — createIndex wrapped in try/catch with logger.warn; init_project succeeds even if empty-table index fails (RESEARCH.md Pitfall 3)
- [Phase 02-02]: Two-export pattern: initProject/deleteProject core functions exported separately from registerXTool wrappers — core is testable without MCP server
- [Phase 02-03]: LanceDB 0.26.2 creates BTree indexes on empty tables successfully — graceful degradation try/catch is a safety net, not a known-failure path
- [Phase 02-03]: init-project.ts keeps resolve(dbPath) for return value (database_path) after calling connectDb(dbPath) — connectDb resolves internally but doesn't expose absPath
- [Phase 03-01]: Used _setFetchImpl() test hook for mockable fetch injection — simpler than Bun mock.module
- [Phase 03-01]: AbortSignal.timeout() for 30s per-request timeout — no manual abort controller needed
- [Phase 03-01]: Fail-fast on OllamaModelNotFoundError and EmbedDimensionError; retry on transient errors (TypeError, DOMException, HTTP 5xx)
- [Phase 03-02]: checkOllamaHealth uses GET /api/tags metadata endpoint — no test embed call on startup
- [Phase 03-02]: Model name matching handles ':latest' tag suffix via startsWith() — nomic-embed-text matches nomic-embed-text:latest
- [Phase 03-02]: startServer() warns but does NOT abort on unreachable Ollama — server starts in all cases
- [Phase 03-02]: Module-level ollamaStatus defaults to 'unreachable' until checkOllamaHealth runs — safe default for write-path callers
- [Phase 04-01]: doc_chunks vector field is nullable to support starter documents without embeddings
- [Phase 04-01]: gpt-tokenizer (pure JS BPE, cl100k_base, Bun-compatible) selected for token counting
- [Phase 04-01]: logActivity actor hardcoded to 'agent' — MCP SDK has no caller identity
- [Phase 04-01]: Category-to-strategy hardcoded: 7 semantic_section, 3 paragraph, 2 fixed_size; unknown defaults to semantic_section
- [Phase 04-02]: Runtime Zod validation in storeDocument() core function — TypeScript types erased at runtime, explicit parse() required for correctness
- [Phase 04-02]: LanceDB returns FixedSizeList as Float32Array (typed array) not plain Array — test assertions use .length not Array.isArray()
- [Phase 04-02]: Max version detection uses reduce() over all rows — LanceDB query ordering not guaranteed with .where() filter
- [Phase 04-02]: Embed rollback: delete document row if embed() throws to prevent orphaned metadata
- [Phase 04-02]: Starter seeding guarded by tables_created > 0 — idempotent on re-init
- [Phase 04-03]: LanceDB table objects cache state — must open fresh lancedb.connect() + openTable() to read updated rows after table.update()
- [Phase 04-03]: update_document excludes superseded rows via predicate (status != 'superseded') — superseded docs return DOC_NOT_FOUND, not INVALID_TRANSITION
- [Phase 04-03]: IntoSql type required for table.update() values: Record<string, IntoSql> not Record<string, unknown>
- [Phase 04-03]: Hard delete pre-counts chunks/relationships before deletion to populate activity log metadata and return values
- [Phase 04-04]: VALID_RELATIONSHIP_TYPES exported from link-documents.ts — get-related-documents imports it rather than duplicating
- [Phase 04-04]: Bidirectional dedup: link_documents checks reverse direction before creating to prevent partial failures
- [Phase 04-04]: get_related_documents queries outgoing and incoming separately then resolves doc metadata in JS
- [Phase 04-04]: Recent activity limit 50 then JS sort — LanceDB .where() has no ORDER BY support
- [Phase 05-01]: FTS index on empty doc_chunks table gracefully degrades — wrapped in try/catch same as BTree; init_project succeeds regardless
- [Phase 05-01]: Metadata pre-filter in buildSearchPredicate capped at 200 doc_ids (RESEARCH.md pitfall 4); beyond that postFilterRequired=true
- [Phase 05-01]: normalizeFtsScore sigmoid (score/(score+1)) — maps positive reals to [0,1), 0 for score<=0
- [Phase 05-01]: normalizeVectorScore uses 1-(d/2) clamped — cosine distance [0,2] to relevance [0,1]
- [Phase 05-03]: get_smart_context max_tokens min=500 — tests use 500+ with overflow-designed content for budget enforcement
- [Phase 05-03]: get_smart_context requested docs always included regardless of budget; only related/expanded docs are budget-gated
- [Phase 05-03]: 1-hop graph expansion keeps highest-priority relationship when doc appears via multiple paths (dedup by RELATIONSHIP_PRIORITY)
- [Phase 05-02]: RRFReranker CORRECTION (see 05-04): new rerankers.RRFReranker(60) was incorrect — constructor takes NativeRRFReranker, not a number; use await RRFReranker.create(60)
- [Phase 05-02]: hybridSearch falls back to fulltextSearch() when Ollama status is not 'ok' — both 'unreachable' and 'model_missing' trigger fallback with search_type='hybrid_fts_fallback'
- [Phase 05-04]: exactOptionalPropertyTypes compliance: build filter objects conditionally (if val !== undefined) rather than spreading Zod-parsed args with T|undefined fields
- [Phase 05-04]: RRFReranker.create(60) async factory required — constructor takes NativeRRFReranker not number; new RRFReranker(60) was both a type error and runtime bug
- [Phase 06-02]: Context headers prepended in extractSymbols dispatch (not in language-specific functions) — avoids double-prepend if extractors are reused directly
- [Phase 06-02]: Rust impl_item scope chain uses typeNode.text (implementing type name) not "Type for Trait" string — ensures method scope chains read "Point.method" not "Point for Display.method"
- [Phase 06-02]: Python import_from_statement with relative_import emits raw relative path (e.g., ".models") — import-resolver in Plan 03 normalizes to file paths
- [Phase 06-02]: lexical_declaration with non-arrow-function initializer → symbol_type="constant" — indexes config objects, MAX_RETRIES, top-level consts per user decision
- [Phase 06-01]: tree-sitter Bun NAPI workaround: index.js Bun code path expects prebuilds/linux-x64/tree-sitter.node but bun install builds to build/Release/ — postinstall script copies binary; CXXFLAGS=-std=c++20 required for compilation
- [Phase 06-01]: Grammar packages tree-sitter-typescript@0.23.2, tree-sitter-python@0.25.0, tree-sitter-rust@0.24.0 use prebuilt linux-x64 binaries — ABI compatibility with core 0.25.0 confirmed, no compilation needed for grammars
- [Phase 06-code-indexing]: super:: in Rust resolved as filesystem parent directory traversal — from src/db/connection.rs, super::models → src/models.rs; progressive segment matching for crate:: handles type-level use statements
- [Phase 06-04]: indexCodebase processes files sequentially (not parallel) to avoid OOM from tree-sitter + Ollama memory pressure
- [Phase 06-04]: doc_id = file_path for code_chunks rows — enables join-free lookup by file path (CODE-03)
- [Phase 06-04]: ast_import edges use delete-then-reinsert strategy on every index cycle — prevents duplicates (CODE-08)
- [Phase 06-04]: is_test flag embedded in imports JSON field (not a dedicated column) — avoids schema change, preserves forward compat
- [Phase 06-04]: project_meta.last_index_at update is non-critical: wrapped in try/catch so indexing never fails on metadata update error
- [Phase 06-05]: Tree-sitter grammar Language type mismatch: grammar packages expose language:unknown vs tree-sitter core Language recursive type — bridged via asLang() cast function through unknown intermediate
- [Phase 06-05]: exactOptionalPropertyTypes compliance in index-codebase.ts: build scanOpts conditionally instead of spreading Zod-parsed fields with T|undefined type (same pattern as 05-04)
- [Phase 07-01]: Code search uses inline predicate builder (not buildSearchPredicate from search-utils) — code_chunks has no cross-table metadata join; language/symbol_type/file_path are direct columns
- [Phase 07-01]: scope_chain stored as dot-notation string in DB, returned as string[] by splitting on '.' — no type label prefixes (Pitfall 1)
- [Phase 07-01]: Default limit for search_code is 10 (vs 5 for document search tools) per CONTEXT.md
- [Phase 07-01]: globToSqlLike: escape %, _ then convert ** to %, * to %, ? to _ for SQL LIKE predicates

### Pending Todos

- [Phase 3]: Zod peer dependency confirmed as v4.3.6 for @modelcontextprotocol/sdk@1.27.1 — RESOLVED, use Zod v4 API patterns

### Blockers/Concerns

- [Phase 6 RESOLVED]: tree-sitter grammar package compatibility confirmed — grammars use prebuilt linux-x64 binaries; core tree-sitter requires CXXFLAGS=-std=c++20 + prebuilds path workaround; all working under Bun

## Session Continuity

Last session: 2026-03-01
Stopped at: Completed 07-code-search-and-integration-validation/07-01-PLAN.md (search_code tool, 469 tests pass, CSRCH-01/02/03 done)
Resume file: None
