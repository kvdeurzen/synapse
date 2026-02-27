# Feature Research

**Domain:** Database-backed MCP server for project knowledge management and code search
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH (ecosystem well-surveyed via WebFetch of ConPort, Claude Context, CodeGrok; confirmed against multiple sources)

---

## Ecosystem Context

The MCP "Knowledge & Memory" category is the single largest server category with 283+ servers as of early 2026, yet almost no tool combines project knowledge management with code search. The gap Synapse fills is real: ConPort handles project knowledge but not code; Claude Context handles code search but not project knowledge; no existing tool does both with a unified embedding pipeline and relationship graph.

**Tools studied:** ConPort (Context Portal), Claude Context (Zilliztech), CodeGrok MCP, Code Context MCP, Code-Index-MCP, LanceDB memory-pro plugin, Knowledge Graph RAG MCP, Zep Knowledge Graph MCP, mcp-server-tree-sitter

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any MCP knowledge/code tool. Missing these = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Document storage and retrieval by category | Every knowledge tool stores categorized docs; ConPort has decisions, patterns, progress as first-class types | LOW | Categories: requirement, architecture_decision, design_pattern, etc. — exactly what's in initial_plan.md |
| Full-text search | Users expect keyword search; ConPort, CodeGrok, Claude Context all provide it | LOW | LanceDB FTS5 covers this; must work without Ollama running |
| Semantic (vector) search | Ecosystem has shifted: vector search is now baseline, not differentiating | MEDIUM | All serious 2026 tools have it; hybrid (BM25 + vector) is the new baseline |
| Hybrid search (vector + FTS combined) | Claude Context, ConPort v2, CodeGrok all implement hybrid; users expect it | MEDIUM | RRF is the standard fusion method; LanceDB supports both natively |
| Code indexing with language-aware chunking | Any code search MCP must chunk at symbol/function boundaries, not fixed sizes | HIGH | Tree-sitter is the de-facto standard (used in CodeGrok, Claude Context, mcp-server-tree-sitter) |
| Incremental code re-indexing | Users won't tolerate full re-indexing on every code change; file hashing is table stakes | MEDIUM | SHA-256 per file is the standard approach (used in CodeGrok, Claude Context) |
| Multi-project support via project_id scoping | ConPort uses workspace_id; Claude Context scopes by root_path; expected for any non-toy tool | LOW | All queries must be project-scoped at the DB level |
| Document metadata filtering | Users filter by status, phase, category, tags; ConPort does all of these | LOW | Bitmap indexes on category/phase/status; BTree on project_id |
| Project initialization | First-class init that creates DB, tables, and seeds starter documents | LOW | ConPort's workspace detection is a pain point; explicit init_project is better |
| Project overview / dashboard | Counts by category, recent activity, key documents — ConPort has get_recent_activity_summary | LOW | Expected as a starting point for agents entering a project |
| stdio MCP transport | All dev tools (Claude Code, Cursor, Roocode) use stdio; HTTP is an afterthought for local dev | LOW | Non-negotiable; everything in the ecosystem does stdio |

### Differentiators (Competitive Advantage)

Features that set Synapse apart. Existing tools don't have these, or do them poorly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unified knowledge + code search in one server | No existing tool does this. Agents today run ConPort + Claude Context as separate servers with no shared context | HIGH | Synapse's core differentiator; single embedding pipeline, cross-table search in get_smart_context |
| Two-phase smart context assembly (overview then detailed) | Prevents "context smearing" — forcing 50 chunks on agent unconditionally. Agent reads summaries, picks what to load fully | HIGH | This pattern is not in ConPort, Claude Context, or CodeGrok. Mirrors how developers actually work. LOW confidence this is novel — no existing implementation found |
| AST-generated relationship graph (code imports → depends_on links) | Code relationships auto-maintained from AST import statements. No manual maintenance. Re-index = fresh graph | HIGH | ConPort has manual link_conport_items but no auto-generation; Claude Context has no relationship graph |
| 1-hop graph traversal in context retrieval | When fetching docs, automatically surface connected docs (requirement → ADR that implements it) | MEDIUM | Knowledge Graph RAG MCP does BFS traversal, but not combined with vector search in single tool |
| Document versioning via superseded rows | Full history preserved; append-only for LanceDB's Lance format; version counter on every doc | MEDIUM | ConPort has get_item_history for Product/Active Context only; no per-document versioning for decisions/patterns |
| Document lifecycle management (draft → active → approved → superseded) | Agents can track document maturity; "approved" ADRs carry more authority than "draft" | LOW | ConPort has no lifecycle states for decisions or patterns; Claude Context has no document model at all |
| Token-budget-aware result trimming | get_smart_context respects max_tokens budget; prevents context overflow | LOW | ConPort returns everything; Claude Context has no token awareness. Token management is a known MCP pain point |
| Code symbol metadata in search results (scope_chain, symbol_type, imports) | "UserService.authenticate is a method in auth/user-service.ts, imports from crypto" is more useful than a raw code snippet | HIGH | CodeGrok provides symbol_name + docstring; Synapse adds scope_chain + imports + line numbers |
| Carry-forward document categories (never auto-archived) | architecture_decision, design_pattern, glossary, code_pattern survive phase transitions automatically | LOW | Differentiates from ConPort which has no automatic carry-forward logic |
| source attribution on relationships (manual vs ast_import) | Agents can distinguish human-created relationships from auto-generated code graph edges | LOW | No existing tool distinguishes these; useful for re-indexing (only regenerate ast_import edges) |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems and should be deliberately avoided in v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| HTTP/SSE transport alongside stdio | "More flexible deployment" / cloud integration | Adds auth complexity, security surface, deployment complexity with zero benefit for local dev workflows; 8.5% of MCP servers with OAuth have done this correctly | Stick to stdio; add HTTP in v2 only if real demand emerges |
| Multiple embedding providers (OpenAI, VoyageAI, Gemini fallback) | "What if Ollama is down?" / "I want better embeddings" | Mixing embedding spaces fractures vector search; a doc embedded with OpenAI is not comparable to one embedded with Ollama | Fail-fast on missing Ollama; dirty data is worse than no data. This is an explicit Synapse design decision |
| Automatic context injection (push, not pull) | "Just give me what's relevant automatically" | Forces context on agents instead of letting them decide; wastes tokens; ConPort's approach of "load everything" is the failure mode | Two-phase: overview (pull) then detailed (pull) — agent decides what to load |
| Full graph traversal (multi-hop) | "Follow relationships all the way to their conclusion" | Exponential blowup; fetching 5 hops from a well-connected node returns the entire graph | 1-hop traversal only; agent can call again to go deeper |
| Real-time file watching / auto-index on save | "Keep the index fresh automatically" | Background processes cause issues (ConPort's Python process orphaning bug is the canonical example); adds concurrency complexity | Explicit index_codebase calls; get_index_status shows stale files; agent calls when needed |
| Agent role profiles with per-role context filtering | "Different agents get different context" | Adds complexity that belongs in v2; requires understanding agent identity which MCP doesn't natively support | Single unified get_smart_context for v1; role profiles in v2 |
| Slash commands and workflow management | "Built-in planning workflow" | Belongs in the orchestration layer (GSD, BMad), not the knowledge store; mixes concerns | MCP tools only; workflow in v2 |
| Automatic reranking via cross-encoder | "Better search results" | Requires additional model inference on results; latency cost exceeds benefit at v1 scale; RRF fusion already handles signal combination | RRF fusion without reranker for v1; reranker in v2 when latency budget is validated |
| Full-text search across 20+ languages | "Support everything" | v1 supports TypeScript, Python, Rust — the three languages GSD projects use; adding more languages adds grammar deps without validating the core | Add languages in v2 based on actual demand |

---

## Feature Dependencies

```
[Project Initialization (init_project)]
    └──required by──> [All document tools]
    └──required by──> [All code tools]
    └──required by──> [Project overview]

[Embedding Service (Ollama)]
    └──required by──> [store_document] (write path)
    └──required by──> [index_codebase] (write path)
    └──NOT required by──> [query_documents] (metadata filter only)
    └──NOT required by──> [get_index_status]
    └──NOT required by──> [project_overview]

[store_document]
    └──enables──> [semantic_search]
    └──enables──> [query_documents]
    └──enables──> [get_smart_context (overview, documents side)]

[index_codebase]
    └──requires──> [AST chunker (tree-sitter)]
    └──requires──> [file scanner + hash tracker]
    └──enables──> [search_code]
    └──enables──> [get_smart_context (overview, code side)]
    └──enables──> [auto-generated relationships]

[AST auto-relationship generation]
    └──requires──> [index_codebase]
    └──enhances──> [get_smart_context (detailed, 1-hop traversal)]
    └──enhances──> [link_documents (complements manual linking)]

[get_smart_context — overview phase]
    └──requires──> [store_document OR index_codebase] (needs data to summarize)
    └──produces──> [doc_ids for detailed phase]

[get_smart_context — detailed phase]
    └──requires──> [get_smart_context — overview phase] (agent workflow)
    └──requires──> [link_documents OR auto-relationships] (for 1-hop traversal)

[link_documents]
    └──requires──> [store_document] (both source and target must exist)

[update_document]
    └──requires──> [store_document] (doc must exist)

[delete_document]
    └──requires──> [store_document] (doc must exist)

[Hybrid search (RRF)]
    └──requires──> [vector index (HNSW-SQ)]
    └──requires──> [FTS index (BM25)]
    └──enhances──> [semantic_search]
    └──enhances──> [search_code]
    └──enhances──> [get_smart_context]

[Document versioning]
    └──requires──> [store_document with existing doc_id]
    └──enhances──> [query_documents (status filter excludes superseded by default)]
```

### Dependency Notes

- **init_project requires nothing but must precede everything**: Tables are created at init; tools fail gracefully if tables don't exist.
- **Embedding Service failure is write-only**: All read/query tools work without Ollama. Only store_document and index_codebase fail.
- **get_smart_context detailed requires overview first**: This is an agent workflow dependency, not a code dependency. Overview returns doc_ids; detailed uses them.
- **Auto-relationships require index_codebase**: They're generated as a side effect of indexing, not a separate step. This means relationships stay fresh with every index run.
- **Hybrid search requires both indexes**: If FTS index is missing, fall back to vector-only. If vector index is missing, fall back to FTS. Both missing = no search.

---

## MVP Definition

### Launch With (v1)

Minimum viable product that validates the core concept and serves the target users (GSD/BMad/SuperClaude users).

- [x] **init_project** — creates database, tables, indexes, and seeds starter docs; without this nothing works
- [x] **store_document** — chunking + embedding + versioning + relationship linking; the core write path
- [x] **query_documents** — metadata filter queries (no embedding needed); fastest retrieval path
- [x] **semantic_search** — vector + FTS hybrid search with RRF; the core read path
- [x] **get_smart_context** — two-phase overview+detailed; the flagship differentiator; what makes Synapse useful vs just a doc store
- [x] **update_document** — metadata updates without re-embedding; needed for lifecycle management
- [x] **delete_document** — soft and hard delete; needed for data hygiene
- [x] **link_documents** — manual relationship linking; needed for knowledge graph
- [x] **project_overview** — dashboard; expected entry point for agents
- [x] **index_codebase** — AST-aware code indexing with incremental updates; needed to differentiate from ConPort
- [x] **search_code** — hybrid search over code_chunks; needed to validate code search half of the product
- [x] **get_index_status** — shows index health; needed for debugging and operator visibility

### Add After Validation (v1.x)

Features to add once core is working and being used.

- [ ] **Additional language support (Go, Java, C#)** — trigger: users request specific languages that aren't TS/Python/Rust
- [ ] **Export to markdown** — ConPort has this; useful for documentation generation; trigger: users ask for it
- [ ] **Import from markdown** — trigger: users want to migrate existing project docs into Synapse
- [ ] **Batch store operations** — ConPort has batch_log_items; trigger: agents report N+1 tool call overhead on project initialization
- [ ] **Activity log queries** — expose activity_log table via query tool; trigger: agents need audit trail access

### Future Consideration (v2+)

Features to defer until v1 is validated.

- [ ] **Agent role profiles with per-role context assembly** — token budgets, mandatory/primary/secondary doc types per role; requires understanding of agent identity and role system design
- [ ] **Slash commands and phase management workflow** — planning workflow belongs in the orchestration layer, not knowledge store; defer to v2 agentic workflow milestone
- [ ] **GSD/BMad import tools** — useful for onboarding existing projects; requires format knowledge; defer
- [ ] **MCP resources and prompt templates** — useful but not blocking core functionality
- [ ] **Task decomposition (understand → scope → plan → subdivide → execute → validate)** — the full agentic project management vision from PROJECT.md; complex enough to be its own milestone
- [ ] **User preference learning system** — remembering "always use Tailwind"; complex, requires inference layer
- [ ] **Automated validation pipeline** — parent agent review + user checkpoints; requires multi-agent orchestration
- [ ] **Decision threshold system** — auto-resolve low-impact decisions; requires calibration over time

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| init_project | HIGH | LOW | P1 |
| store_document with chunking + embedding | HIGH | MEDIUM | P1 |
| semantic_search (hybrid) | HIGH | MEDIUM | P1 |
| get_smart_context (two-phase) | HIGH | HIGH | P1 |
| index_codebase (AST tree-sitter) | HIGH | HIGH | P1 |
| search_code | HIGH | LOW (builds on indexer) | P1 |
| query_documents | HIGH | LOW | P1 |
| link_documents + 1-hop traversal | MEDIUM | MEDIUM | P1 |
| update_document / delete_document | MEDIUM | LOW | P1 |
| project_overview | MEDIUM | LOW | P1 |
| get_index_status | LOW | LOW | P1 |
| Document versioning (superseded rows) | MEDIUM | LOW | P1 |
| Document lifecycle states | MEDIUM | LOW | P1 |
| Auto-relationship from AST imports | HIGH | MEDIUM | P1 |
| Incremental indexing (hash tracking) | HIGH | MEDIUM | P1 |
| Export to markdown | LOW | LOW | P2 |
| Import from markdown | LOW | LOW | P2 |
| Batch store operations | LOW | LOW | P2 |
| Additional language support (Go, Java) | MEDIUM | MEDIUM | P2 |
| Agent role profiles | HIGH | HIGH | P3 |
| Slash commands + workflow | HIGH | HIGH | P3 |
| Task decomposition system | HIGH | VERY HIGH | P3 |
| User preference learning | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | ConPort | Claude Context | CodeGrok MCP | Synapse (planned) |
|---------|---------|----------------|--------------|-------------------|
| Document storage by category | Yes (decisions, patterns, progress, custom) | No | No | Yes (17 categories) |
| Code indexing | No | Yes | Yes | Yes |
| Semantic search (documents) | Yes (vector) | N/A | N/A | Yes (hybrid) |
| Semantic search (code) | No | Yes (hybrid) | Yes (vector) | Yes (hybrid) |
| Hybrid search (BM25 + vector) | Partial (FTS only, not fused) | Yes (RRF) | No (vector only) | Yes (RRF both tables) |
| AST-aware code chunking | No | Yes | Yes (tree-sitter) | Yes (tree-sitter, 3 languages) |
| Incremental indexing | No | No (reimplied) | Yes (mtime-based) | Yes (SHA-256 hash) |
| Relationship graph | Manual only (link_conport_items) | No | No | Manual + auto-generated from AST |
| Graph traversal in retrieval | No | No | No | Yes (1-hop) |
| Smart context assembly | No | No | No | Yes (two-phase overview+detailed) |
| Document versioning | Partial (Product/Active Context only) | No | No | Yes (all documents, version counter) |
| Document lifecycle states | No | No | No | Yes (draft→active→approved→superseded) |
| Token budget awareness | No | No | No | Yes (max_tokens on get_smart_context) |
| Multi-project support | Yes (workspace_id) | Yes (root_path scope) | Yes | Yes (project_id) |
| Symbol metadata (scope_chain, imports) | No | No | Yes (symbol_name, docstring) | Yes (scope_chain + imports + exports) |
| Cross-table unified search | No | No | No | Yes (get_smart_context searches docs + code) |
| Local/embedded (no cloud required) | Yes (SQLite) | No (Zilliz Cloud) | Yes | Yes (LanceDB) |
| Embedding provider | Python sentence-transformers | OpenAI/VoyageAI | nomic-ai/CodeRankEmbed (local) | Ollama nomic-embed-text (local) |
| Language support | N/A (no code) | 20+ extensions | 9 languages | TS, Python, Rust (v1) |
| stdio MCP transport | Yes | Yes | Yes | Yes |

---

## Sources

- ConPort (Context Portal) GitHub: https://github.com/GreatScottyMac/context-portal — features and tool list verified via WebFetch (MEDIUM confidence)
- ConPort issue tracker: https://github.com/GreatScottyMac/context-portal/issues — pain points confirmed via WebFetch (MEDIUM confidence)
- Claude Context (Zilliztech): https://github.com/zilliztech/claude-context — features and token savings verified via WebFetch (MEDIUM confidence)
- CodeGrok MCP (HackerNoon): https://hackernoon.com/codegrok-mcp-semantic-code-search-that-saves-ai-agents-10x-in-context-usage — AST chunking details (MEDIUM confidence)
- MCP server tree-sitter FEATURES.md: https://github.com/wrale/mcp-server-tree-sitter/blob/main/FEATURES.md — language support data (MEDIUM confidence)
- MCP Knowledge Bases 2026 roundup: https://desktopcommander.app/blog/best-mcp-servers-for-knowledge-bases-in-2026 — ecosystem gaps analysis (LOW confidence, single source)
- MCP design principles: https://www.matt-adams.co.uk/2025/08/30/mcp-design-principles.html — anti-patterns (MEDIUM confidence)
- LanceDB hybrid search: https://lancedb.com/docs/search/ — RRF and BM25 capabilities (HIGH confidence, official docs)
- WebSearch: "MCP server code search semantic indexing features 2026" — ecosystem overview (LOW confidence, verified by above)
- WebSearch: "knowledge graph MCP server relationship document linking graph traversal feature 2025" — relationship graph ecosystem (LOW confidence, verified partially)

---

*Feature research for: MCP-based project knowledge and code search server (Synapse)*
*Researched: 2026-02-27*
