# Phase 7: Code Search and Integration Validation - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement code search tools (semantic, fulltext, hybrid via RRF) with rich result metadata. Extend get_smart_context to unify document and code search in a single response. Validate cross-table hybrid search quality with realistic data. Creating new indexing tools or modifying the indexing pipeline is out of scope (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Search result format
- Return trimmed snippet around match point with surrounding context lines, not full chunk content
- Scope chain returned as structured array (e.g., `["module:auth", "class:UserService", "method:login"]`), not formatted string
- Default result limit: 10, configurable via `limit` param up to 50
- Relevance explanation (score-only vs score+reason): Claude's discretion based on search infrastructure

### Unified search blending
- Results interleaved by relevance score across both tables, each result tagged with `source_type` ("document" or "code")
- Configurable bias parameter for weighting documents vs code (defaults to equal)
- When a code chunk and document are related (e.g., implementation ↔ spec), show both results with a relationship indicator linking them
- Code summaries in overview mode use code-specific format: symbol signature + docstring/first comment (not generic ~100-token text summary)
- Detailed mode accepts a unified ID list — tool resolves which table each ID belongs to internally
- Optional `source_types` parameter to limit which tables get_smart_context queries (defaults to both)
- When token budget is tight, fill by pure relevance ranking regardless of source type
- Response includes search metadata: total_matches, docs_returned, code_returned, truncated flag, tokens_used

### Filter behavior
- Multiple filters combine with AND logic (language=python AND symbol_type=function)
- When filters match zero results, return empty array with total_matches: 0 — no fallback, no hints
- `file_pattern` supports glob syntax (e.g., `src/**/*.ts`, `tests/*.spec.js`)
- Code-specific filters (language, symbol_type, file_pattern) only available on direct `search_code` calls — get_smart_context uses generic params only (query, limit, mode)

### Index status reporting
- Staleness determined by content hash mismatch (stored hash vs current file hash)
- Per-language breakdown includes file count and chunk count only (no symbol type breakdown)
- Facts-only output: total files, total chunks, last index time, per-language breakdown, stale file count — no recommendations or health hints
- Requires project_id parameter (project-scoped, consistent with other tools)

### Claude's Discretion
- Whether to include match reason alongside relevance score
- Exact snippet window size (lines of context around match)
- Content hash comparison implementation details
- RRF parameter tuning for cross-table search

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-code-search-and-integration-validation*
*Context gathered: 2026-02-28*
