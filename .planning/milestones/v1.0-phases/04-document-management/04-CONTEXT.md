# Phase 4: Document Management - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement all document management tools — store, version, query, update, delete, link, overview — with lifecycle state tracking and automatic activity logging. Agents can manage project knowledge through 9 MCP tools. Search capabilities (semantic, FTS, hybrid, smart context) are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Starter Document Templates
- Structural scaffolds: section headers with brief explanations of what goes where, agent fills in real content
- Stored as regular v1 documents in LanceDB — agents update them via store_document creating v2+
- Configurable starter set: init_project accepts optional list of starter document types (not fixed at 4)
- Default starters: project charter, ADR log, implementation patterns, glossary
- "Coding guidelines" replaced with "Implementation Patterns" — captures reusable technical decisions, not coding style rules
- Both `plan` and `task_spec` categories must include objectives and measurable/testable outcomes in their scaffold structure

### Chunking Configuration
- Default chunk size target: ~500 tokens
- semantic_section strategy: respect section boundaries when possible, split oversized sections that exceed max chunk size, preserve section header in each sub-chunk
- Hardcoded category-to-strategy mapping (not configurable per project)
- ~10% overlap (~50 tokens) between adjacent chunks to preserve context at boundaries

### Document Category Taxonomy (12 categories, down from original 17)

**Carry-forward (never auto-archive):**
- `architecture_decision` — ADRs, architecture choices
- `design_pattern` — High-level design patterns used in the project
- `glossary` — Project terminology and definitions
- `code_pattern` — Reusable code conventions and patterns
- `dependency` — External dependencies, version constraints

**Planning:**
- `plan` — Structured decomposition that can nest (project → sub-plans → actionable items). Includes objectives and measurable outcomes.
- `task_spec` — Leaf-level actionable work item. Includes objectives and measurable/testable outcomes.
- `requirement` — Requirements, acceptance criteria, constraints. Captures WHAT must be true, not HOW.

**Implementation:**
- `technical_context` — Agent-facing knowledge about how the system works: API contracts, config decisions, deployment notes. Not user-facing docs.
- `change_record` — Breaking changes, migrations, deprecations, schema changes.

**Knowledge:**
- `research` — Investigation results, spike findings, technology evaluations. Knowledge produced when exploring options.
- `learning` — Lessons learned, debugging insights, "things we discovered". Prevents repeating mistakes.

### Retrieval Path (query_documents)
- Returns metadata + ~100-token summaries (consistent with two-phase retrieval pattern)
- Supports inventory browsing (filter by category/phase) and status-driven workflow (filter by status)
- Multiple filters combine as AND only — OR logic requires separate queries
- Default result limit: 20 documents (agent can override via limit parameter)

### Tool Response Design
- Minimal confirmation + key IDs — no prose in responses
- Structured errors: {error: 'ERROR_CODE', message: 'Human-readable description'}
- store_document returns: doc_id, version, chunk_count, token_estimate
- project_overview: dashboard summary — counts by category/status, recent activity (last 5 actions), key documents (priority >= 4)

### Claude's Discretion
- Category-to-chunking-strategy mapping details (which of the 12 categories get semantic_section vs paragraph vs fixed_size)
- Loading skeleton and empty state handling
- Exact error code naming conventions
- Activity log detail level and actor format
- Lifecycle state transition validation rules
- Exact fields returned by each tool beyond the core decisions above

</decisions>

<specifics>
## Specific Ideas

- Retrieval pattern should follow the "Claude skill memory" philosophy: semantic search narrows candidates → return headers/summaries for agent review → agent requests full content for relevant items only. This avoids context bloat.
- Documents are not files on disk — they live in LanceDB, chunked and embedded, searchable by meaning. This is core to Synapse's value proposition.
- Plans can nest recursively (plan → sub-plan → sub-plan → task_spec) using relationships. The `parent_id` and `depth` v2 fields in the schema support this.
- Starter documents should feel like empty project scaffolding — structure that invites the agent to fill in real content, not boilerplate to customize.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-document-management*
*Context gathered: 2026-02-28*
