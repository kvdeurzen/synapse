# Phase 6: Code Indexing - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the AST-aware code indexing pipeline: scan TypeScript, Python, and Rust files with tree-sitter symbol extraction, embed code chunks with context headers, track file hashes for incremental re-indexing, remove stale chunks on deletion, and auto-generate relationship edges from import statements. Code search and cross-table unified search are Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Chunking granularity
- Both class overview AND individual method chunks — class signature/docstring gets its own chunk, each method/function is a separate chunk with class as scope context
- Index all top-level declarations including private constants, config objects, type aliases, enums, and module-level code
- Scope chain uses dot notation (e.g., "db.UserRepo.save")
- Large chunks (functions/classes exceeding ~200 lines) are split into sequential parts to preserve embedding quality

### Edge case handling
- Syntax errors: partial index + warning — extract whatever symbols tree-sitter can recover, log warning for unparseable sections
- Large files: index normally with size warning above threshold (e.g., 5000 lines), no hard skip
- Embedding service down: fail fast with clear error — consistent with Phase 3's fail-fast design
- Progress: log per-file progress to stderr during indexing runs (not just final counts)

### Import relationship depth
- Static imports only — no dynamic imports (`import()`, `importlib.import_module()`)
- Skip external packages — only create depends_on edges between files that exist in the indexed project
- Re-exports create edges — `export { foo } from './bar'` creates a depends_on edge same as regular imports
- Barrel files create all re-export edges — an index.ts that re-exports from 10 modules gets 10 outgoing edges
- Wildcard imports create module-level edge — `from module import *` creates depends_on to the source module file
- Rust `mod` declarations create depends_on edges — `mod submodule;` means parent depends on submodule
- Edge granularity: file-level depends_on edges with imported symbol names as optional metadata on the edge

### Indexing exclusions
- Sensible default exclusion list beyond .gitignore: node_modules, __pycache__, target/, dist/, build/, .git/
- Test files (*.test.*, *.spec.*, test_*, *_test.*) are indexed but tagged with metadata flag 'test' so search can filter them
- index_codebase accepts optional exclude_patterns and include_patterns parameters — defaults work out of the box, agents/users can customize
- No auto-detection of generated/vendored code — rely on user-provided exclusion patterns

### Claude's Discretion
- Exact large chunk split threshold and strategy
- Default exclusion list contents beyond the ones listed
- Tree-sitter grammar configuration details
- Database batch size and indexing performance tuning
- Exact test file detection heuristics

</decisions>

<specifics>
## Specific Ideas

- Scope chain should feel natural: `MyClass.myMethod` not `MyClass/myMethod`
- Test file tagging enables search filtering without losing test code from the index
- File-level edges with symbol metadata is a pragmatic middle ground — core relationship is simple (A depends on B) but imported symbols are available when useful
- Progress logging to stderr follows MCP convention (stderr for diagnostics, stdout for protocol)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-code-indexing*
*Context gathered: 2026-02-28*
