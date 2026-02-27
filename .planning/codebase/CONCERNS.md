# Codebase Concerns

**Analysis Date:** 2026-02-27

## Tech Debt

**Agent prompt size and context window management:**
- Issue: Agent specifications are extremely detailed (gsd-planner.md is 1275 lines, gsd-executor.md 469 lines, gsd-debugger.md 1246 lines)
- Files: `.claude/agents/gsd-planner.md`, `.claude/agents/gsd-executor.md`, `.claude/agents/gsd-debugger.md`, `.claude/agents/gsd-verifier.md`
- Impact: Agents loaded in full consume substantial context window. As agents scale and GSD framework grows, this will degrade agent reasoning quality and response times
- Fix approach: Implement lazy loading of agent rules; split monolithic agent specs into modular rule files (core, deviation, checkpoint, etc.); use references/includes instead of inline duplication

**Dependency on external tools binary (gsd-tools.cjs):**
- Issue: Agents rely on `./.claude/get-shit-done/bin/gsd-tools.cjs` for state management, phase info, roadmap queries. Binary is not tracked as source code
- Files: All agents call `node ./.claude/get-shit-done/bin/gsd-tools.cjs` (gsd-planner.md, gsd-executor.md, gsd-verifier.md, etc.)
- Impact: If binary is corrupted, out of sync with spec, or lost, entire GSD workflow breaks silently (agents make assumptions about tool output format)
- Fix approach: Version control gsd-tools source code; add integration tests verifying tool output format matches agent expectations; add schema validation in agents

**Manual phase/task header parsing in ROADMAP.md:**
- Issue: gsd-roadmapper.md requires specific markdown headers (`### Phase X:`) that are hand-written and parsed by downstream tools
- Files: `.claude/agents/gsd-roadmapper.md` (line ~470), `.planning/ROADMAP.md` (structural dependency)
- Impact: Header format changes, missing headers, or typos break phase lookups silently. No validation that headers match phase_number in JSON
- Fix approach: Use structured YAML frontmatter in ROADMAP.md for phase metadata; validate headers with regex before execution; add self-check to roadmapper

## Known Bugs

**Checkpoint type ambiguity in executor continuation:**
- Symptoms: When executor resumes from checkpoint, it may mis-classify checkpoint type if prompt context is incomplete or unclear
- Trigger: `<completed_tasks>` in continuation prompt lacks clear checkpoint type; executor reads from SUMMARY instead of prompt
- Files: `.claude/agents/gsd-executor.md` (continuation_handling section, line ~267)
- Workaround: Ensure prompt context always includes explicit checkpoint type label
- Root cause: Checkpoint type extracted from plan file only on first run; continuation relies on prompt hints which may be incomplete

**Deviation rule application not idempotent:**
- Symptoms: If executor applies RULE 2 (auto-add critical functionality), then restarted mid-task, same functionality may be added twice
- Trigger: Executor crashes mid-task after running deviation checks but before committing
- Files: `.claude/agents/gsd-executor.md` (deviation rules, line ~115)
- Workaround: Manual git cleanup, re-run task
- Root cause: Deviation rules run inline; no idempotent marker prevents double-apply on restart

**Mandatory file read not enforced:**
- Symptoms: Agent specifications document `<files_to_read>` as mandatory but agents don't fail if block is missing
- Trigger: Orchestrator omits `<files_to_read>` block in spawning prompt
- Files: All agents (gsd-mapper.md line 19, gsd-executor.md line 15, etc.) state requirement but don't validate
- Workaround: Manually add block to prompt
- Root cause: Validation happens in agent logic (informal), not enforced at interface level

## Security Considerations

**State file contains execution history and decisions:**
- Risk: `.planning/STATE.md` accumulates all phase decisions, execution times, and metrics. If leaked, reveals project strategy and timing
- Files: `.planning/STATE.md` (created by state update commands)
- Current mitigation: File is git-tracked by default (not in .gitignore), so committed to repo
- Recommendations: Add STATE.md to .gitignore; document that sensitive information (dates, decision timing) should not be in phase files; add option to anonymize STATE.md for sharing

**Tool binary execution without validation:**
- Risk: gsd-tools.cjs is a binary executed with `node` without integrity checks. If compromised, can modify any phase files or state
- Files: `./.claude/get-shit-done/bin/gsd-tools.cjs`
- Current mitigation: Binary is local to project only
- Recommendations: Add checksum verification before execution; use subcommand whitelist (only allow expected commands); document tool input/output contract

**Ollama integration with fail-fast design:**
- Risk: Ollama connection required for write operations (store_document, index_codebase). Network unavailability causes silent failures (Synapse MCP only)
- Files: `initial_plan.md` (embedding service design, line 219)
- Current mitigation: Health check logged on startup (non-blocking)
- Recommendations: Add explicit connection timeout on write operations; return clear error message when Ollama unavailable; provide fallback for read-only mode without embeddings

## Performance Bottlenecks

**Recursive agent spawning in debug workflow:**
- Problem: gsd-debugger.md supports nested investigation (subagent isolation), potentially spawning multiple Claude contexts in series
- Files: `.claude/agents/gsd-debugger.md` (subagent protocol, ~line 400)
- Measurement: No quantified data, but architectural pattern suggests O(N) context cost per debug depth level
- Cause: Each debug subagent receives full agent spec + problem context; no context reuse between levels
- Improvement path: Implement debug context summary (key findings, tested hypotheses) that passes to next level instead of full context; cap debug depth to 3 levels

**Hybrid search (RRF) with large document sets:**
- Problem: Synapse semantic_search and get_smart_context run RRF over potentially 1000s of documents
- Files: `initial_plan.md` (hybrid-search.ts design, line 414)
- Measurement: Not yet implemented; estimated O(N) where N = result set size
- Cause: RRF requires ranking both semantic and FTS results, merging without early termination
- Improvement path: Implement early stopping (stop after top K results); use approximate nearest neighbor search instead of full vector search; add document filtering before RRF

**Incremental indexing with file hash tracking:**
- Problem: Code indexing uses SHA-256 per file, stored in project_meta config. As codebase scales to 1000+ files, hash comparison becomes bottleneck
- Files: `initial_plan.md` (hash-tracker.ts design, line 378)
- Measurement: Not yet implemented; hash comparison is O(N*hash_time)
- Cause: Simple linear scan of file hashes; no index or tree structure
- Improvement path: Use Merkle tree or content-addressable storage (CAS) instead; implement delta compression for large files

## Fragile Areas

**Agent specification interdependencies not documented:**
- Files: `.claude/agents/` (all agents)
- Why fragile: Agents reference each other (executor mentions checkpoint_return_format from gsd-executor, verifier checks artifacts from executor), but no explicit dependency map. Changes to one agent's output format break others silently
- Common failures: SUMMARY.md format change breaks verification logic; phase numbering scheme change breaks roadmapper's phase lookup
- Safe modification: Before changing any agent output format, grep all agents for consumers; update all consumers in same commit
- Test coverage: No integration tests validating agent-to-agent contract (SUMMARY format, STATE.md schema, ROADMAP phase structure)

**Checkpoint protocol with multiple checkpoint types:**
- Files: `.claude/agents/gsd-executor.md` (checkpoint_protocol, line ~200)
- Why fragile: Three checkpoint types (human-verify, decision, human-action) with subtly different executor behavior. Misclassifying type causes wrong continuation path
- Common failures: Executor auto-approves decision checkpoint (should wait for user choice); human-verify checkpoint treated as human-action (requires manual input not needed)
- Safe modification: Add explicit type validation before checkpoint handling; test each type with sample continuation prompts
- Test coverage: Only checkpoint:human-verify documented in examples; other types not tested

**Tree-sitter AST parsing with language detection fallback:**
- Files: `initial_plan.md` (language-support.ts design, line 355, ast-chunker.ts line 321)
- Why fragile: Assumes file extension reliably indicates language. Mixed-language files (.tsx files containing embedded CSS/HTML), unusual extensions, or missing extensions cause incorrect grammar selection
- Common failures: .tsx file parsed as TypeScript only (embedded JSX not handled); .config files with unknown extension fall back to default (wrong AST structure)
- Safe modification: Test with edge cases first (.config.js, .vue, .astro); add fallback to content sniffing if extension detection fails
- Test coverage: Language support mentioned in v1 scope (TypeScript, Python, Rust); other languages untested

## Scaling Limits

**Embedded LanceDB with single project**
- Current capacity: Single-file LanceDB embedded in project; no sharding or multi-instance support
- Limit: ~500GB database file size (filesystem limit); Vector queries become slow beyond 1M chunks
- Symptoms at limit: Vector search p95 latency > 5s; disk I/O bottleneck; update operations lock entire DB
- Scaling path: Migrate to cloud LanceDB (if available); implement sharding by project_id; add caching layer (Redis) for frequent queries

**MCP stdio transport single connection**
- Current capacity: Single stdio connection per MCP server instance; no multiplexing
- Limit: ~10-50 concurrent tool calls before queue depth causes timeouts
- Symptoms at limit: Tool calls timeout; Claude context resets waiting for response
- Scaling path: Implement connection pooling if MCP protocol supports it; add async tool execution with callbacks instead of blocking calls

**Ollama embedding model size and throughput**
- Current capacity: nomic-embed-text (768-dim) requires ~2GB GPU memory; batch embedding API supports ~100 embeddings per request
- Limit: ~50 embeddings/sec on typical GPU; bottleneck when indexing large codebases (>10k files) or storing documents in bulk
- Symptoms at limit: Document storage timeouts; index_codebase progress stalls; write operations timeout (fail-fast)
- Scaling path: Add batching and async embedding queue; switch to smaller embedding model (e.g., all-MiniLM-L6-v2, 384-dim); implement local caching of embeddings

## Dependencies at Risk

**tree-sitter language grammars (external git submodules):**
- Risk: tree-sitter-typescript, tree-sitter-python, tree-sitter-rust are separate npm packages; breaking updates can occur without notice
- Impact: AST parsing fails silently (returns empty tree); code chunks not created; imports not parsed for relationship generation
- Migration plan: Pin to major.minor versions only; add tests with sample files after updates; have fallback to regex-based parsing if AST fails

**Apache Arrow for schema definitions:**
- Risk: Arrow schema versioning may not be backward compatible; LanceDB format changes could make old databases unreadable
- Impact: Can't migrate data between Synapse versions; entire knowledge graph lost on schema change
- Migration plan: Document schema version in project_meta; implement migration scripts; export data to JSON before major upgrades

**Ollama project lifecycle uncertainty:**
- Risk: Ollama is young project; changes to API format, model availability, or maintenance status unknown
- Impact: nomic-embed-text model removed; Ollama API changes; project abandoned (no upstream support)
- Migration plan: Identify alternative embedding providers (HuggingFace, Replicate); implement provider abstraction layer; periodically test model availability

## Missing Critical Features

**Conflict resolution for auto-generated relationships:**
- Problem: tree-sitter AST relationships are auto-generated from imports; no mechanism to manually override or suppress incorrect inferences
- Current workaround: None; incorrect relationships pollute the knowledge graph
- Blocks: Can't model subtle architectural constraints (e.g., "this module uses X internally but shouldn't be considered dependent on it")
- Implementation complexity: Low (add manual_relationship.ignore list in relationships table with source=manual, rank > ast_import)

**Document versioning without full history:**
- Problem: store_document creates new version with old marked superseded, but old versions not queryable as full history
- Current workaround: Grep ACTIVITY_LOG table to find old version IDs
- Blocks: Can't show document evolution or revert to previous versions
- Implementation complexity: Medium (add version query tools, archive old chunks instead of superseding)

**Code search with symbol cross-references:**
- Problem: search_code finds functions and classes, but can't show "what calls this function" or "what classes inherit from this"
- Current workaround: Grep for function name manually
- Blocks: Can't navigate codebase semantically; refactoring impact analysis requires manual inspection
- Implementation complexity: Medium (add reverse dependency index in relationships table; query from target back to source)

**Query result pagination and streaming:**
- Problem: All query tools return full result set; no pagination or streaming for large result sets
- Current workaround: Client-side filtering (not available to agents)
- Blocks: Semantic search returning 1000+ results consumes full context; no way to iterate
- Implementation complexity: Low (add limit/offset to query tools; stream results in JSON array with continuation token)

## Test Coverage Gaps

**MCP server end-to-end with Claude Code:**
- What's not tested: Full tool registration, execution, response format round-trip in actual Claude Code environment
- Risk: Tools may fail when called from Claude Code due to transport issues, serialization errors, or prompt format mismatches
- Priority: High
- Difficulty to test: Need Claude Code plugin testing environment; can't replicate stdio transport locally without MCP test harness

**Chunking edge cases (empty docs, extremely long symbols, Unicode):**
- What's not tested: Behavior with empty documents, functions with 50KB of code, symbol names with non-ASCII characters
- Risk: Chunking fails silently (empty chunks, dropped content); embeddings produce garbage vectors; search returns wrong results
- Priority: Medium
- Difficulty to test: Need synthetic test cases; edge cases are hard to trigger in real code

**Incremental indexing correctness:**
- What's not tested: Full incremental index cycle (index initial set → modify files → re-index → verify only changed files touched)
- Risk: Files not re-indexed when they should be; old chunks not deleted; relationships not refreshed; state inconsistency
- Priority: High
- Difficulty to test: Need file system state tracking; hard to validate without examining LanceDB internals

**Error recovery in concurrent MCP tool calls:**
- What's not tested: What happens when embedding service fails mid-call; LanceDB connection drops; Ollama crashes during batch embedding
- Risk: Partial data written (some chunks embedded, some not); inconsistent state (document created but chunks not); silent failures
- Priority: High
- Difficulty to test: Need to inject failures at specific points; requires transaction support testing

## Architectural Concerns

**Agent specification brittleness with CLI tool contracts:**
- Issue: Agents depend on exact output format of gsd-tools commands (JSON schema for phase info, specific field names, error messages). Changes break silently
- Files: All agents make assumptions about tool output (gsd-planner.md line 942, gsd-executor.md line 40, gsd-verifier.md line 113)
- Impact: Tool version mismatch causes agents to fail with "undefined" errors or incorrect behavior
- Fix approach: Add version negotiation to gsd-tools (--version flag); agents check compatibility before use; add schema validation in agent initialization

**Two-phase context assembly in get_smart_context:**
- Issue: Overview phase returns summaries; agent decides what to fetch; detailed phase fetches full content. This requires agent to maintain state across two calls
- Files: `initial_plan.md` (get_smart_context design, line 275)
- Impact: If agent context resets between phases, it loses track of which documents to fetch; overview summaries not passed to detailed call
- Fix approach: Return phase state token in overview response; agent includes token in detailed request; validate token server-side to reconstruct context

**Auto-generated relationships with source attribution:**
- Issue: Relationships marked with source="ast_import" can be regenerated during re-index. Manual relationships mixed in same table. No clear ownership
- Files: `initial_plan.md` (auto-relationship generation, line 364)
- Impact: Manual relationship accidentally deleted during re-index if UI doesn't filter by source; can't distinguish user-edited from auto-generated in queries
- Fix approach: Use separate relationship tables (auto_relationships vs manual_relationships); or add strong unique constraint on auto relationships to prevent accidental deletion

---

*Concerns audit: 2026-02-27*
*Update as issues are fixed or new ones discovered*
