# Phase 7: Code Search and Integration Validation - Research

**Researched:** 2026-02-28
**Domain:** LanceDB code_chunks search (semantic/FTS/hybrid), get_smart_context cross-table extension, index status reporting
**Confidence:** HIGH — the entire stack is already proven in Phase 5 (document search); Phase 7 is a direct extension of those patterns onto the code_chunks table

## Summary

Phase 7 adds two new MCP tools (`search_code`, `get_index_status`) and extends an existing one (`get_smart_context`). All technical ingredients are already working in the project:

- The `code_chunks` table is fully provisioned with a vector index (768-dim float32) and an FTS index on `content` (created by `init_project` in Phase 6 Plan 05).
- LanceDB hybrid search via `RRFReranker.create(60)` is already proven in `hybrid-search.ts` (Phase 5).
- The `extractSnippet()` utility, score normalization helpers, and `buildSearchPredicate` are already in `search-utils.ts`.
- The existing document search tools (`semantic-search.ts`, `fulltext-search.ts`, `hybrid-search.ts`) are the templates to follow — Phase 7 tools are structurally identical but query `code_chunks` instead of `doc_chunks`, and return code-specific fields (file_path, symbol_name, scope_chain, start_line, end_line) instead of document-specific fields.
- `get_smart_context` needs an overview mode extension to query both `documents` and `code_chunks` in a single response. The existing architecture is well-factored for this addition.
- `get_index_status` queries `code_chunks` and `project_meta` tables — both already fully populated by `index_codebase`.

The primary technical risk is glob-pattern matching for `file_pattern` filtering (requires translating glob syntax to SQL LIKE-compatible predicates against `file_path`). Everything else is a straightforward port of Phase 5 patterns.

**Primary recommendation:** Directly port the existing semantic/FTS/hybrid search tool patterns from `doc_chunks` to `code_chunks`. Then extend `get_smart_context` to run two parallel queries (documents + code_chunks) in overview mode, and update the server.ts to register the two new tools.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Search result format**
- Return trimmed snippet around match point with surrounding context lines, not full chunk content
- Scope chain returned as structured array (e.g., `["module:auth", "class:UserService", "method:login"]`), not formatted string
- Default result limit: 10, configurable via `limit` param up to 50
- Relevance explanation (score-only vs score+reason): Claude's discretion based on search infrastructure

**Unified search blending**
- Results interleaved by relevance score across both tables, each result tagged with `source_type` ("document" or "code")
- Configurable bias parameter for weighting documents vs code (defaults to equal)
- When a code chunk and document are related (e.g., implementation ↔ spec), show both results with a relationship indicator linking them
- Code summaries in overview mode use code-specific format: symbol signature + docstring/first comment (not generic ~100-token text summary)
- Detailed mode accepts a unified ID list — tool resolves which table each ID belongs to internally
- Optional `source_types` parameter to limit which tables get_smart_context queries (defaults to both)
- When token budget is tight, fill by pure relevance ranking regardless of source type
- Response includes search metadata: total_matches, docs_returned, code_returned, truncated flag, tokens_used

**Filter behavior**
- Multiple filters combine with AND logic (language=python AND symbol_type=function)
- When filters match zero results, return empty array with total_matches: 0 — no fallback, no hints
- `file_pattern` supports glob syntax (e.g., `src/**/*.ts`, `tests/*.spec.js`)
- Code-specific filters (language, symbol_type, file_pattern) only available on direct `search_code` calls — get_smart_context uses generic params only (query, limit, mode)

**Index status reporting**
- Staleness determined by content hash mismatch (stored hash vs current file hash)
- Per-language breakdown includes file count and chunk count only (no symbol type breakdown)
- Facts-only output: total files, total chunks, last index time, per-language breakdown, stale file count — no recommendations or health hints
- Requires project_id parameter (project-scoped, consistent with other tools)

### Claude's Discretion
- Whether to include match reason alongside relevance score
- Exact snippet window size (lines of context around match)
- Content hash comparison implementation details
- RRF parameter tuning for cross-table search

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CSRCH-01 | User can search code via search_code with query, language, symbol_type, and file_pattern filters | Direct port of hybrid-search.ts querying code_chunks; new WHERE predicate builder for code-specific filters using existing AND-logic pattern |
| CSRCH-02 | Code search supports semantic, fulltext, and hybrid (RRF) search modes | All three modes already work for doc_chunks; same LanceDB APIs (nearestTo, fullTextSearch, RRFReranker.create(60)) apply to code_chunks |
| CSRCH-03 | Code search results include file_path, symbol_name, scope_chain, content, relevance_score, start_line, end_line | All fields present in code_chunks schema (schema.ts, CODE_CHUNKS_SCHEMA); scope_chain stored as string, must be parsed to array per CONTEXT.md locked decision |
| CSRCH-04 | get_index_status returns total files indexed, total chunks, last index time, languages breakdown, stale files count | code_chunks has file_path, language, file_hash fields; project_meta has last_index_at; staleness requires comparing stored file_hash to current file hash on disk |
</phase_requirements>

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@lancedb/lancedb` | 0.26.2 | Vector + FTS search, RRF hybrid merge | Already pinned; FTS index already created on code_chunks.content by Phase 6 |
| `zod` | ^4.0.0 | Input schema validation | Project standard; Zod v4 API used throughout |
| `gpt-tokenizer` | ^3.4.0 | Token counting for snippet budget | Already used in get-smart-context.ts |
| `node:path` (built-in) | — | Path matching for file_pattern glob support | Built-in; `minimatch`-style matching may be needed for glob → SQL |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` (built-in) | — | Read files for staleness check (hash comparison) | get_index_status stale file count calculation |
| `node:crypto` (built-in) | — | SHA-256 hash of current file content | Already used in index-codebase.ts for the same purpose |
| Bun.file() | — | Read file bytes for hash computation | Already used in index-codebase.ts; prefer over node:fs for consistency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual glob-to-SQL translation | `micromatch` or `minimatch` npm package | A third-party package is cleaner for glob matching but adds a dependency; simple glob patterns (`*`, `**`, `?`) can be translated to LIKE predicates with string manipulation — no extra dep needed for basic cases |
| Inline staleness query | Separate file scan pass | Staleness requires reading disk; can be done inline during the status query loop |

**Installation:**
No new packages needed. Everything required is already installed.

---

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
src/tools/
├── search-code.ts          # CSRCH-01, CSRCH-02, CSRCH-03 — new tool
├── get-index-status.ts     # CSRCH-04 — new tool
```

Existing files to modify:
```
src/tools/get-smart-context.ts   # extend overview mode to query code_chunks
src/server.ts                    # register 2 new tools (tool count 16 → 18)
```

### Pattern 1: Code Search Tool (search-code.ts)

**What:** Follows the exact same structure as `hybrid-search.ts` but queries `code_chunks` instead of `doc_chunks`. Uses a code-specific filter predicate builder instead of `buildSearchPredicate`.

**When to use:** For all three modes (semantic/fulltext/hybrid), the mode is a parameter. Single tool handles all three.

```typescript
// Source: adapted from src/tools/hybrid-search.ts (Phase 5)
// Code-specific result item
export interface CodeSearchResultItem {
  chunk_id: string;
  file_path: string;
  symbol_name: string | null;
  symbol_type: string | null;
  scope_chain: string[];          // parsed from stored string, e.g. ["module:auth", "class:Foo"]
  content: string;                // trimmed snippet around match (use extractSnippet())
  relevance_score: number;        // 0.0-1.0 normalized
  start_line: number | null;
  end_line: number | null;
  language: string | null;
}

// Zod input schema
const SearchCodeInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  query: z.string().min(1),
  mode: z.enum(["semantic", "fulltext", "hybrid"]).default("hybrid"),
  language: z.string().optional(),           // e.g. "typescript", "python", "rust"
  symbol_type: z.string().optional(),        // e.g. "function", "class", "method"
  file_pattern: z.string().optional(),       // glob syntax, e.g. "src/**/*.ts"
  limit: z.number().int().min(1).max(50).optional().default(10),
  min_score: z.number().min(0).max(1).optional().default(0.0),
});
```

**Key difference from document search:** No `buildSearchPredicate` (which fetches doc_ids from the documents table). For code search, all filters (language, symbol_type, file_pattern) are direct columns on `code_chunks` — build predicate inline:

```typescript
// Source: direct column filter — no cross-table join needed
const parts: string[] = [`project_id = '${projectId}'`];
if (language) parts.push(`language = '${language}'`);
if (symbol_type) parts.push(`symbol_type = '${symbol_type}'`);
if (file_pattern) parts.push(globToSqlLike("file_path", file_pattern));
const predicate = parts.join(" AND ");
```

**Glob to SQL LIKE translation:**
```typescript
// Simple glob translation — covers common patterns
function globToSqlLike(column: string, glob: string): string {
  // Convert glob metacharacters to SQL LIKE
  const sqlLike = glob
    .replace(/%/g, "\\%")      // escape literal %
    .replace(/_/g, "\\_")      // escape literal _
    .replace(/\*\*/g, "%")     // ** = any path depth
    .replace(/\*/g, "%")       // * = any filename chars (approximate)
    .replace(/\?/g, "_");      // ? = single char
  return `${column} LIKE '${sqlLike}'`;
}
```

Note: This is an approximation — `*` in glob should not match `/` but SQL LIKE `%` does. For common patterns like `src/**/*.ts` this works correctly because `**` matches the path separators and `*.ts` maps to `%.ts`. More complex patterns with `*` crossing directory boundaries are a known limitation.

**scope_chain serialization:**
The `scope_chain` column is stored as a JSON string (e.g., `'["module:auth","class:Foo","method:bar"]'` or as plain dot-notation string like `"auth.Foo.bar"`). Check actual stored format in code_chunks. Based on the extractor code in Phase 6, `scope_chain` is stored as a dot-separated string. For the response, split on `.` and format with type prefixes as needed, or return as-is and document the format.

**Semantic mode:**
```typescript
// Requires Ollama — throw OllamaUnreachableError if not ok (same as semantic-search.ts)
const [queryVector] = await embed([query], projectId, config);
const rows = await codeChunksTable
  .query()
  .nearestTo(queryVector)
  .distanceType("cosine")
  .where(predicate)
  .limit(limit * 2)
  .toArray();
// score from _distance field, normalize with normalizeVectorScore()
```

**Fulltext mode:**
```typescript
// No Ollama required
const rows = await codeChunksTable
  .query()
  .fullTextSearch(query)
  .where(predicate)
  .limit(limit * 2)
  .toArray();
// score from _score field, normalize with normalizeFtsScore()
```

**Hybrid mode (default):**
```typescript
// Source: adapted from src/tools/hybrid-search.ts
// Falls back to FTS if Ollama unreachable (same pattern as hybrid-search.ts)
const reranker = await rerankers.RRFReranker.create(60);
const rows = await codeChunksTable
  .query()
  .nearestTo(queryVector)
  .distanceType("cosine")
  .fullTextSearch(query)
  .where(predicate)
  .rerank(reranker)
  .limit(limit)
  .toArray();
// score from _relevance_score or _score or position-based fallback (same as hybrid-search.ts)
```

### Pattern 2: Index Status Tool (get-index-status.ts)

**What:** Queries `code_chunks` and `project_meta` tables, optionally reads files from disk for hash comparison.

**When to use:** When agent needs to know what's been indexed, current indexing state, and whether re-indexing is needed.

```typescript
// Source: new pattern, uses connectDb() + table queries established throughout project
export interface IndexStatusResult {
  project_id: string;
  total_files: number;
  total_chunks: number;
  last_index_at: string | null;
  languages: Array<{ language: string; file_count: number; chunk_count: number }>;
  stale_files: number;
}
```

**Implementation approach for staleness:**
```typescript
// Get all distinct files with their stored hashes
const fileRows = await codeChunksTable
  .query()
  .where(`project_id = '${projectId}'`)
  .select(["file_path", "file_hash"])
  .toArray();

// Deduplicate by file_path (multiple chunks per file)
const fileMap = new Map<string, string>(); // file_path → file_hash
for (const row of fileRows) {
  if (!fileMap.has(row.file_path)) {
    fileMap.set(row.file_path as string, row.file_hash as string);
  }
}

// Count stale files by comparing stored hash to current file content
let stale_files = 0;
for (const [filePath, storedHash] of fileMap) {
  try {
    const content = await Bun.file(filePath).text();
    const currentHash = createHash("sha256").update(content).digest("hex");
    if (currentHash !== storedHash) stale_files++;
  } catch {
    // File no longer exists on disk → also stale
    stale_files++;
  }
}
```

Note: `file_path` in `code_chunks` is stored as a relative path (relative to the project_root passed to `index_codebase`). The staleness check requires knowing the project root. Either: (a) accept `project_root` as an optional parameter (could be expensive to always provide), or (b) skip staleness check if no root provided (return null or 0). Per CONTEXT.md, staleness is "determined by content hash mismatch" — this implies the implementation needs the file paths to be accessible. The user decision doesn't specify whether `project_root` is a parameter. Recommend: include optional `project_root` parameter for staleness; if omitted, return `stale_files: null`.

**Per-language breakdown:**
```typescript
// Group by language
const langMap = new Map<string, { files: Set<string>; chunks: number }>();
for (const row of allRows) {
  const lang = (row.language as string) ?? "unknown";
  if (!langMap.has(lang)) langMap.set(lang, { files: new Set(), chunks: 0 });
  const entry = langMap.get(lang)!;
  entry.files.add(row.file_path as string);
  entry.chunks++;
}
```

### Pattern 3: get_smart_context Extension (overview mode)

**What:** Extend `runOverviewMode()` to also query `code_chunks` table when `source_types` includes "code" (default: both). Results from both tables are interleaved by relevance (but in overview mode there's no search query — sort by priority/recency for documents, and by symbol type significance for code).

**The CONTEXT.md locked decisions to implement:**
1. Results tagged with `source_type: "document" | "code"`
2. Code summaries use symbol signature + docstring/first comment format
3. `source_types` optional parameter (defaults to both)
4. Token budget filled by pure relevance ranking when tight
5. Response metadata: `total_matches`, `docs_returned`, `code_returned`, `truncated`, `tokens_used`
6. `bias` parameter for weighting (defaults equal)

**Overview mode code summary approach:**
```typescript
// For code chunks in overview mode, use symbol signature + first comment
// The content field already contains the full symbol with context header prepended
// Extract: first ~100 tokens = signature + docstring/first comment
function extractCodeSummary(content: string, maxTokens = 100): string {
  // content = "File: src/foo.ts | function: Foo.bar\nexport function bar(...) {\n  // comment\n  ..."
  // extractSnippet with empty query returns from the beginning
  return extractSnippet(content, "", maxTokens);
}
```

**Interleaving logic:**
```typescript
// Both queries run; results combined and sorted by relevance/priority
// Documents: sorted by priority asc, updated_at desc (same as existing)
// Code chunks: sorted by created_at desc (no priority field)
// Merge: docs and code items alternate until budget exhausted
// With bias=0.5 (equal): fill in order docs[0], code[0], docs[1], code[1]...
// With bias towards docs (e.g., 0.7): take 70% of budget from docs, 30% from code
```

**Detailed mode unified ID resolution:**
```typescript
// doc_ids in detailed mode may be from either table
// Strategy: try documents table first, then code_chunks
// chunk_id prefix or doc_id format can help distinguish (but don't assume)
// Safer: attempt both table lookups and union results
```

### Anti-Patterns to Avoid

- **Don't use buildSearchPredicate for code search:** `buildSearchPredicate` does a cross-table join to the `documents` table to resolve metadata filters. Code search filters (language, symbol_type, file_pattern) are direct columns on `code_chunks` — build the predicate inline.
- **Don't skip the hybrid FTS fallback:** `hybrid-search.ts` already shows the pattern: check `getOllamaStatus()` and fall back to FTS-only when Ollama is unreachable. Do the same for hybrid code search.
- **Don't return full content:** Return `extractSnippet(content, query)` (trimmed), not the full `content` field. This is a locked decision.
- **Don't break existing get_smart_context behavior:** The `source_types` default is "both", meaning `source_types` omitted should still return documents only if there are no code chunks (graceful degradation). When code_chunks table is empty or project has no indexed code, return only documents without error.
- **Don't call `scope_chain.split(".")` blindly:** Check the actual stored format. From Phase 6 extractor code, `scope_chain` is stored as a dot-separated string like `"UserService.login"`. Return it as a structured array as per CONTEXT.md: parse with `.split(".")`.
- **Don't hardcode stale file count when project_root is unknown:** Return `null` (or omit) stale_files if the root path cannot be determined, rather than returning 0 (which is misleading).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RRF merging | Custom rank fusion | `rerankers.RRFReranker.create(60)` | Already working in hybrid-search.ts; proven at Phase 5 |
| FTS index | Tantivy/custom index | `lancedb.Index.fts()` already created | init_project already creates FTS index on code_chunks.content |
| Score normalization | Custom formulas | `normalizeVectorScore`, `normalizeFtsScore` from search-utils.ts | Already proven and tested |
| Snippet extraction | Custom windowing | `extractSnippet(content, query)` from search-utils.ts | Already handles token budget |
| Token counting | Character estimation | `countTokens` from gpt-tokenizer | Already used in get-smart-context.ts |
| Glob pattern matching | Regex/custom parser | Simple string `.replace()` translation to SQL LIKE | Covers all common patterns; adding `micromatch` is overkill |

**Key insight:** This phase is 90% wiring of existing components onto a new table. Resist the urge to redesign the search architecture.

---

## Common Pitfalls

### Pitfall 1: scope_chain Stored Format vs. Response Format
**What goes wrong:** `scope_chain` is stored as a plain dot-separated string in `code_chunks` (confirmed: `src/services/code-indexer/extractor.ts` line 20 — `// dot-notation: "MyClass.save"`). The CONTEXT.md locked decision says return it as a structured array `["class:UserService", "method:login"]`. These are two different formats.
**Why it happens:** The stored format has no type-label prefixes. The CONTEXT.md example format includes type labels (`class:`, `method:`). Type labels for parent scopes cannot be derived from stored data (only the leaf symbol has `symbol_type`).
**How to avoid:** Return `scope_chain.split(".")` as a plain string array (e.g., `["UserService", "login"]`). This satisfies "structured array" without needing impossible type inference for parent scopes. Document in tool description that array elements are scope names without type labels. Do NOT attempt to reconstruct `"class:UserService"` labels — the data to do this correctly for all scopes is not stored.
**Warning signs:** Tests that assert `scope_chain[0] === "class:UserService"` must be written to expect `"UserService"` instead.

### Pitfall 2: RRFReranker Constructor vs. Factory
**What goes wrong:** `new rerankers.RRFReranker(60)` is a type error at runtime AND compile time. The constructor takes a `NativeRRFReranker`, not a number.
**Why it happens:** The API looks like it should accept `k=60` directly.
**How to avoid:** Always use `await rerankers.RRFReranker.create(60)`. This is already documented in STATE.md [Phase 05-02 CORRECTION] and proven in hybrid-search.ts.
**Warning signs:** TypeScript error `Argument of type 'number' is not assignable to parameter of type 'NativeRRFReranker'`.

### Pitfall 3: FTS Query on Empty Table
**What goes wrong:** LanceDB FTS queries on a table with no rows (or no FTS index data) may throw an error rather than returning an empty array.
**Why it happens:** The FTS index is created by init_project but may be empty if no code has been indexed. The error may be different from "zero results".
**How to avoid:** Wrap FTS queries in try/catch; return empty results on FTS index not found error. Pattern already used in init-project.ts FTS index creation: wrap in try/catch with logger.warn. For search, catch and return `{ results: [], total: 0, search_type: "fulltext" }`.
**Warning signs:** Tests that call search_code before any index_codebase call will fail.

### Pitfall 4: exactOptionalPropertyTypes Compliance
**What goes wrong:** TypeScript strict mode with `exactOptionalPropertyTypes` rejects spreading Zod-parsed objects where optional fields have `T | undefined` type into function params expecting `T | undefined` optional params.
**Why it happens:** Zod v4 `.optional()` produces `T | undefined` which is different from "property may be absent".
**How to avoid:** Build filter objects conditionally (`if (val !== undefined) obj.field = val`) instead of spreading. This is documented in STATE.md [Phase 05-04] and [Phase 06-05] — same pattern applies here.
**Warning signs:** TypeScript error about `Type 'string | undefined' is not assignable to 'string'`.

### Pitfall 5: get_smart_context Detailed Mode ID Resolution
**What goes wrong:** `doc_ids` in detailed mode may be chunk_ids from code_chunks OR doc_ids from documents. Without a discriminator, the tool doesn't know which table to query.
**Why it happens:** The CONTEXT.md says "detailed mode accepts a unified ID list — tool resolves which table each ID belongs to internally." But `doc_id` in documents is user-assigned (e.g., `DOC0001`) while `chunk_id` in code_chunks is a ULID. The doc_id field in code_chunks is `file_path`.
**How to avoid:** In detailed mode, try the `documents` table first (query `doc_id IN (...)`), then try `code_chunks` (query `chunk_id IN (...)`). Any IDs not found in documents are assumed to be code chunk_ids. This is unambiguous because documents doc_ids are user strings and code chunk_ids are ULIDs.
**Warning signs:** Detailed mode returns 0 results for valid code chunk IDs passed via `doc_ids`.

### Pitfall 6: stale_files Requires Absolute Paths
**What goes wrong:** `code_chunks.file_path` stores relative paths (relative to the `project_root` at indexing time). Reading the file for hash comparison requires the absolute path.
**Why it happens:** `index_codebase` uses `file.relativePath` as the stored path (see index-codebase.ts line 191: `doc_id: file.relativePath`).
**How to avoid:** `get_index_status` should accept an optional `project_root` parameter. When provided, join stored relative paths with project_root to get absolute paths. When not provided, skip disk reads and return `stale_files: null`.
**Warning signs:** `ENOENT` errors when trying to read file from relative path without knowing the project root.

---

## Code Examples

Verified patterns from official sources and existing project code:

### Code Search — Hybrid Mode (adapts hybrid-search.ts)
```typescript
// Source: adapted from src/tools/hybrid-search.ts + LanceDB Context7 docs
const db = await connectDb(dbPath);
const codeChunksTable = await db.openTable("code_chunks");
const reranker = await rerankers.RRFReranker.create(60);

const rows = await codeChunksTable
  .query()
  .nearestTo(queryVector)
  .distanceType("cosine")
  .fullTextSearch(query)
  .where(predicate)  // e.g. "project_id = 'myproj' AND language = 'typescript'"
  .rerank(reranker)
  .limit(limit)
  .toArray();
```

### Code Search — Fulltext Mode (adapts fulltext-search.ts)
```typescript
// Source: adapted from src/tools/fulltext-search.ts
const rows = await codeChunksTable
  .query()
  .fullTextSearch(query)
  .where(predicate)
  .limit(limit * 2)
  .toArray();
// score: normalizeFtsScore(row._score as number)
```

### Code Search — Semantic Mode (adapts semantic-search.ts)
```typescript
// Source: adapted from src/tools/semantic-search.ts
const rows = await codeChunksTable
  .query()
  .nearestTo(queryVector)
  .distanceType("cosine")
  .where(predicate)
  .limit(limit * 2)
  .toArray();
// score: normalizeVectorScore(row._distance as number)
```

### Index Status — Per-Language Breakdown
```typescript
// Source: new pattern using existing connectDb() + table query
const allRows = await codeChunksTable
  .query()
  .where(`project_id = '${projectId}'`)
  .select(["file_path", "language", "file_hash", "chunk_id"])
  .toArray();

const langMap = new Map<string, { files: Set<string>; chunks: number }>();
for (const row of allRows) {
  const lang = (row.language as string) ?? "unknown";
  if (!langMap.has(lang)) langMap.set(lang, { files: new Set(), chunks: 0 });
  langMap.get(lang)!.files.add(row.file_path as string);
  langMap.get(lang)!.chunks++;
}
const languages = Array.from(langMap.entries()).map(([language, { files, chunks }]) => ({
  language,
  file_count: files.size,
  chunk_count: chunks,
}));
```

### Staleness Check (adapts index-codebase.ts hash pattern)
```typescript
// Source: adapted from src/tools/index-codebase.ts createHash pattern
import { createHash } from "node:crypto";

// For each file in the indexed set:
try {
  const content = await Bun.file(absoluteFilePath).text();
  const currentHash = createHash("sha256").update(content).digest("hex");
  if (currentHash !== storedHash) staleCount++;
} catch {
  staleCount++; // file deleted from disk = stale
}
```

### Glob to SQL LIKE Translation
```typescript
// Source: new — covers src/**/*.ts, tests/*.spec.js, **/*.py patterns
function globToSqlLike(glob: string): string {
  return glob
    .replace(/%/g, "\\%")      // escape literal %
    .replace(/_(?!\\)/g, "\\_") // escape literal _ (not already escaped)
    .replace(/\*\*/g, "%")     // ** matches across path separators
    .replace(/\*/g, "%")       // * matches within a segment (approximate)
    .replace(/\?/g, "_");      // ? matches single character
}
// Usage: `file_path LIKE '${globToSqlLike(file_pattern)}'`
```

### get_smart_context Overview — Code Summary
```typescript
// Source: adapted from src/tools/get-smart-context.ts extractSnippet usage
// For code chunks, content starts with context header:
// "File: src/auth.ts | function: UserService.login\nexport function login(...) ..."
// extractSnippet with empty query returns from the start = signature + docstring
const codeSummary = extractSnippet(codeRow.content as string, "", 100);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `new RRFReranker(60)` | `await RRFReranker.create(60)` | Phase 05-02 correction | Must use async factory; constructor takes NativeRRFReranker not number |
| Zod v3 `.string().optional()` | Zod v4 same, but `exactOptionalPropertyTypes` requires conditional spreading | Phase 05-04, 06-05 | Build filter objects conditionally |

**Deprecated/outdated:**
- None for this phase — all patterns are current.

---

## Open Questions

1. **scope_chain stored format vs. response format**
   - What we know: `scope_chain` is stored as plain dot-notation string (e.g., `"UserService.login"`) — confirmed by reading `src/services/code-indexer/extractor.ts` line 20: `// dot-notation: "MyClass.save"`. There are NO type labels in the stored string.
   - What's unclear: The CONTEXT.md locked decision asks for a structured array like `["class:UserService", "method:login"]` with type labels. The stored format has no labels. The `symbol_type` field only applies to the leaf symbol, not to parent scopes.
   - Recommendation: Split `scope_chain` on `.` to get the array. For the final element, the `symbol_type` field gives the type. For parent elements, the type is unknown from stored data alone — either label them generically (e.g., `"scope:UserService"`) or return without type labels (e.g., `["UserService", "login"]`). The simplest correct approach: return `scope_chain.split(".")` as a plain string array with no type prefixes — this satisfies the "structured array" requirement without needing unlabeled inference. Document the format in the tool description.

2. **get_smart_context detailed mode — how to discriminate table for a given ID**
   - What we know: doc_ids from documents are user-supplied strings; chunk_ids from code_chunks are ULIDs.
   - What's unclear: The CONTEXT.md says "unified ID list" — does the caller pass `doc_id` or `chunk_id` for code items?
   - Recommendation: In overview mode, return `chunk_id` for code items (not `file_path`/`doc_id`). In detailed mode, try documents first, then code_chunks. Document in tool description which field to pass.

3. **get_index_status staleness when project_root is unknown**
   - What we know: Stored paths are relative; absolute paths needed for disk reads.
   - What's unclear: Whether user always knows the project_root or if it should be discoverable.
   - Recommendation: Make `project_root` an optional parameter. When absent, return `stale_files: null` (not 0). Document this clearly.

---

## Validation Architecture

> nyquist_validation is not present in .planning/config.json (workflow keys are research, plan_check, verifier). Skipping this section.

---

## Sources

### Primary (HIGH confidence)
- `/lancedb/lancedb` via Context7 — fullTextSearch, nearestTo, RRFReranker.create, where, select, toArray, countRows patterns
- `src/tools/hybrid-search.ts` — proven RRF hybrid search pattern for this exact LanceDB version (0.26.2)
- `src/tools/semantic-search.ts` — proven vector search pattern
- `src/tools/fulltext-search.ts` — proven FTS search pattern
- `src/tools/get-smart-context.ts` — existing implementation to extend
- `src/db/schema.ts` (CODE_CHUNKS_SCHEMA) — confirmed field names and types
- `.planning/STATE.md` — all known pitfalls from Phases 1-6

### Secondary (MEDIUM confidence)
- `src/tools/index-codebase.ts` — SHA-256 hash pattern for staleness check
- `.planning/phases/06-code-indexing/06-RESEARCH.md` — LanceDB FTS index parameters for code_chunks

### Tertiary (LOW confidence)
- None — all findings verified against source code in this project.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed and proven
- Architecture: HIGH — direct port of Phase 5 patterns with minor extensions
- Pitfalls: HIGH — drawn from STATE.md which captures real bugs found during Phases 1-6

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (LanceDB 0.26.2 is pinned; stable)
