# Phase 5: Document Search - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement search capabilities for project documents: semantic search (vector), full-text search (FTS), hybrid RRF-merged search, and a two-phase smart context assembly tool (get_smart_context) with token-budget-aware assembly and 1-hop graph expansion. All search operates on the doc_chunks and documents tables built in Phases 2-4. Code search is Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Search result shape
- Metadata + snippet per result: title, doc_id, category, relevance score, and a ~100-200 token content snippet with the matching passage
- Relevance scores normalized to 0.0-1.0 range regardless of search method (vector, FTS, hybrid)
- Every result includes a `source` field ('document' or 'code') to identify which table it came from — even for document-only search in this phase
- Default result limit: 5 results per search call (agent can override with limit param)

### Smart context assembly
- Overview mode: ~100 tokens per document summary, fitting 20-40 docs in a 2-4k token budget
- Default max_tokens budget: 4000 tokens if the agent doesn't specify
- 1-hop graph expansion in detailed mode prioritizes by relationship type: depends_on and implements first, references and related_to after, within the token budget
- Truncation strategy: drop lowest-relevance documents entirely rather than truncating mid-content — no partial documents
- Smart context supports metadata filters (category, phase, tags, status) — agents can scope context assembly

### Hybrid ranking behavior
- Fixed RRF (Reciprocal Rank Fusion) merge with a fixed k parameter — Claude tunes k during implementation
- Three separate search tools: semantic_search, fulltext_search, and hybrid_search — agents choose the right tool for the job
- When Ollama is unreachable: semantic_search fails with clear error; hybrid_search falls back to FTS-only with warning; fulltext_search works normally
- Configurable min_score threshold parameter (default 0.0) — agent can set e.g. 0.3 to filter out low-relevance noise

### Filter and scope controls
- All metadata filters (category, phase, tags, status, priority) available on all search tools — agents can combine semantic query with metadata narrowing
- Tag filtering uses the same pipe-delimited LIKE matching as Phase 4's query_documents — consistent pattern across all tools
- Superseded documents excluded from search results by default — optional include_superseded flag for edge cases
- Filters narrow the candidate set before ranking, not post-filter

### Claude's Discretion
- RRF k parameter tuning
- FTS implementation approach (LanceDB native FTS if available, or custom)
- Snippet extraction algorithm (how to pick the most relevant ~100-200 tokens from a chunk)
- Internal caching or optimization strategies

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key constraint is consistency with Phase 4's established patterns (pipe-delimited tags, superseded exclusion, activity logging).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-document-search*
*Context gathered: 2026-02-28*
