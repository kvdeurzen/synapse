# Phase 4: Document Management - Research

**Researched:** 2026-02-28
**Domain:** LanceDB CRUD, text chunking, token counting, document versioning, graph relationships
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Starter documents**: Structural scaffolds (section headers + brief explanations). Stored as regular v1 documents in LanceDB. Agents update via store_document creating v2+. Configurable starter set: init_project accepts optional list of starter document types (not fixed at 4). Default starters: project charter, ADR log, implementation patterns, glossary. "Implementation Patterns" replaces "Coding Guidelines". Both `plan` and `task_spec` categories must include objectives and measurable/testable outcomes in scaffold structure.
- **Chunking configuration**: Default chunk size ~500 tokens. `semantic_section` strategy: respect section boundaries, split oversized sections, preserve section header in each sub-chunk. Hardcoded category-to-strategy mapping (not configurable). ~10% overlap (~50 tokens) between adjacent chunks.
- **Document Category Taxonomy (12 categories)**:
  - Carry-forward (never auto-archive): `architecture_decision`, `design_pattern`, `glossary`, `code_pattern`, `dependency`
  - Planning: `plan`, `task_spec`, `requirement`
  - Implementation: `technical_context`, `change_record`
  - Knowledge: `research`, `learning`
- **Retrieval (query_documents)**: Returns metadata + ~100-token summaries. Filters: category, phase, tags, status, priority. Multiple filters combine as AND only. Default result limit: 20.
- **Tool response design**: Minimal confirmation + key IDs. Structured errors: `{error: 'ERROR_CODE', message: 'Human-readable description'}`. store_document returns: `doc_id`, `version`, `chunk_count`, `token_estimate`. project_overview: counts by category/status, recent activity (last 5 actions), key documents (priority >= 4).

### Claude's Discretion

- Category-to-chunking-strategy mapping details (which of the 12 categories get semantic_section vs paragraph vs fixed_size)
- Loading skeleton and empty state handling
- Exact error code naming conventions
- Activity log detail level and actor format
- Lifecycle state transition validation rules
- Exact fields returned by each tool beyond the core decisions above

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-04 | init_project seeds starter documents (project charter, ADR log, implementation patterns, glossary) | Seeding uses insertBatch pattern from batch.ts; starter content stored as DocumentRow with v1, status=active |
| DOC-01 | store_document with title, content, category (12 types), optional metadata | MCP tool registration pattern from init-project.ts; Zod input validation; embed() from embedder.ts |
| DOC-02 | Documents chunked at write time using category-specific strategies with configurable max size and overlap | @langchain/textsplitters RecursiveCharacterTextSplitter.fromLanguage("markdown") for semantic_section; hand-roll paragraph + fixed_size |
| DOC-03 | Each chunk prefixed with context header before embedding | String concatenation: `"Document: {title} \| Section: {header}"` before passing to embed() |
| DOC-04 | store_document with existing doc_id creates new version, marks old chunks as superseded | table.update() with where predicate on doc_id + project_id; then insertBatch new chunks with incremented version |
| DOC-05 | query_documents filters by category, phase, tags, status, priority — no embedding calls | table.query().where(SQL predicate).limit(N).toArray() — pure metadata scan |
| DOC-06 | update_document: update metadata (status, phase, tags, priority) without re-embedding | table.update({ where: predicate, values: { status, phase, tags, priority, updated_at } }) |
| DOC-07 | delete_document: soft-delete (archive) or hard-delete | Soft: table.update() set status='archived'. Hard: table.delete() predicate on doc_id; also delete related chunks and relationships |
| DOC-08 | project_overview: counts by category/status/phase, recent activity, key documents (priority >= 4) | Multiple table.countRows(filter) calls + activity_log query ordered by created_at desc limit 5 |
| DOC-09 | Documents follow lifecycle states: draft → active → approved, superseded, archived | State machine validation in TypeScript before write; transitions table as locked decision |
| DOC-10 | Carry-forward categories never auto-archived | Transition guard: reject archive/supersede for carry-forward categories unless explicit force flag |
| DOC-11 | All mutations logged to activity_log with actor, action, timestamp | insertBatch to activity_log table after each successful mutation |
| DOC-12 | store_document returns doc_id, chunk_count, version, token_estimate | Computed from chunking result: chunks.length, sum of token counts per chunk using gpt-tokenizer |
| GRAPH-01 | link_documents: create manual relationships with type (implements, depends_on, supersedes, references, contradicts, child_of, related_to) | insertBatch to relationships table with source='manual' |
| GRAPH-02 | link_documents supports bidirectional relationship creation | Insert two rows (from→to and to→from) when bidirectional=true |
| GRAPH-03 | 1-hop graph traversal surfaces related documents when fetching context | query relationships WHERE from_id = doc_id, then query documents for those to_ids (Phase 5 search integration point) |
| GRAPH-04 | Relationships track source attribution (manual vs ast_import) | `source` field already in RELATIONSHIPS_SCHEMA; link_documents hardcodes source='manual' |
</phase_requirements>

---

## Summary

Phase 4 builds all document CRUD tools on top of the LanceDB infrastructure established in Phases 1-3. The core technical challenge is implementing a versioning system (old chunks marked superseded when a document is re-stored) combined with a chunking pipeline that converts raw text into overlapping, context-prefixed chunks before embedding. The schema (documents, relationships, activity_log) is fully defined and immutable — no schema migrations needed.

The stack is already established: LanceDB 0.26.2 for persistence, embed() from embedder.ts for vector generation, ulidx for ID generation, Zod v4 for validation, and the registerXTool / core-function separation pattern from prior phases. The one new dependency needed is `gpt-tokenizer` (v3.4.0) for token counting — pure JavaScript, no WASM, works in Bun. For text splitting, `@langchain/textsplitters` provides a proven `RecursiveCharacterTextSplitter.fromLanguage("markdown")` for semantic_section strategy; paragraph and fixed_size strategies are simple enough to hand-roll.

The nine tools to implement are: `store_document`, `query_documents`, `update_document`, `delete_document`, `project_overview`, `link_documents`, and the FOUND-04 extension to `init_project` for starter document seeding. The `get_document` (fetch full content by doc_id) and 1-hop traversal in `get_smart_context` are also in scope for this phase per GRAPH-03, though full search integration is Phase 5.

**Primary recommendation:** Follow the exact registerXTool / core-function pattern from init-project.ts. Build a single `chunkDocument()` service function that all write paths call. Use gpt-tokenizer countTokens for token estimation. Use table.update() for metadata-only changes (never re-embed). Always log to activity_log after every successful mutation.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @lancedb/lancedb | 0.26.2 (pinned) | All table CRUD: add, update, delete, query, countRows | Already installed; breaking API change in 0.27.x — do not upgrade |
| ulidx | 2.4.1 | Generate doc_id, chunk_id, relationship_id, log_id | Already installed; monotonic sort order = natural insertion order |
| zod | ^4.0.0 (resolves 4.3.6) | Input validation for all MCP tool args | Already installed; established Zod v4 patterns |
| gpt-tokenizer | ^3.4.0 | Count tokens per chunk for token_estimate return value | Pure JS, no WASM, fastest npm tokenizer, works in Bun |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @langchain/textsplitters | ^1.0.1 | semantic_section chunking via RecursiveCharacterTextSplitter.fromLanguage("markdown") | Only for semantic_section strategy; pulls js-tiktoken as dep |
| lru-cache | ^11.2.6 | Already used in embedder for embedding cache | No new usage in Phase 4 |
| pino | latest | Structured logging to stderr | Already installed; use createToolLogger pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gpt-tokenizer | tiktoken (WASM) | tiktoken requires WASM, slower startup in Bun; gpt-tokenizer is pure JS, faster |
| @langchain/textsplitters | Custom regex splitter | LangChain handles edge cases (code blocks, nested headers, overlapping windows); hand-rolling introduces subtle bugs at section boundaries |
| gpt-tokenizer | Counting characters / 4 | Character/4 is a rough estimate; gpt-tokenizer gives accurate counts for the cl100k_base encoding used by modern models |

**Installation:**
```bash
bun add gpt-tokenizer@^3.4.0 @langchain/textsplitters@^1.0.1
```

Note: `@langchain/textsplitters` depends on `js-tiktoken` which will install automatically. This does not conflict with `gpt-tokenizer` — they are separate packages.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── db/
│   ├── schema.ts          # (existing) Arrow + Zod schemas
│   ├── connection.ts      # (existing) connectDb()
│   └── batch.ts           # (existing) insertBatch()
├── services/
│   ├── embedder.ts        # (existing) embed(), checkOllamaHealth()
│   └── chunker.ts         # NEW: chunkDocument(), tokenize helpers
├── tools/
│   ├── init-project.ts    # EXTEND: add starter document seeding
│   ├── store-document.ts  # NEW
│   ├── query-documents.ts # NEW
│   ├── update-document.ts # NEW
│   ├── delete-document.ts # NEW
│   ├── project-overview.ts # NEW
│   └── link-documents.ts  # NEW
└── server.ts              # EXTEND: register all new tools
test/
├── services/
│   └── chunker.test.ts    # NEW: unit tests for chunking logic
├── tools/
│   ├── store-document.test.ts
│   ├── query-documents.test.ts
│   ├── update-document.test.ts
│   ├── delete-document.test.ts
│   ├── project-overview.test.ts
│   └── link-documents.test.ts
└── db/
    └── init-project.test.ts  # EXTEND: test starter doc seeding
```

### Pattern 1: Core Function + MCP Tool Registration Separation

Every tool follows the pattern established in init-project.ts and delete-project.ts:

**What:** Export a pure async core function (e.g., `storeDocument(dbPath, projectId, args)`) separately from `registerStoreDocumentTool(server, config)`. Core functions are testable without an MCP server.

**When to use:** Every tool in this phase, without exception.

**Example:**
```typescript
// Source: pattern from src/tools/init-project.ts
export async function storeDocument(
  dbPath: string,
  projectId: string,
  args: StoreDocumentArgs,
  config: SynapseConfig,
): Promise<StoreDocumentResult> {
  // ... pure logic, no MCP dependency
}

export function registerStoreDocumentTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool("store_document", { inputSchema: z.object({...}) }, async (args) => {
    const result = await storeDocument(config.db, args.project_id, args, config);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
}
```

### Pattern 2: Document Versioning via Supersede + Insert

**What:** When storing a document with an existing doc_id, increment the version, mark all old chunks as superseded (via `table.update()`), then insert the new chunks.

**When to use:** Any time store_document receives a doc_id that already exists in the documents table.

**Example:**
```typescript
// Source: LanceDB Context7 docs + project patterns
// Step 1: find existing version
const existing = await db.openTable("documents");
const rows = await existing.query()
  .where(`doc_id = '${docId}' AND project_id = '${projectId}'`)
  .select(["version"])
  .limit(1)
  .toArray();

const newVersion = rows.length > 0 ? (rows[0].version as number) + 1 : 1;

// Step 2: mark old chunks superseded (if re-versioning)
if (rows.length > 0) {
  const chunksTable = await db.openTable("code_chunks"); // actually documents_chunks — see note
  // For document chunks: they live in the documents table itself? No — see architecture note below
}

// Step 3: insert new document row + new chunk rows
await insertBatch(documentsTable, [newDocRow], DocumentRowSchema);
```

**Architecture note on chunks storage:** The DOCUMENTS_SCHEMA has a `content` field (full text) and no separate vector field. The CODE_CHUNKS_SCHEMA has a `vector` field and references `doc_id`. Document chunks (embeddings for Phase 5 semantic search) will need a storage decision:

- **Option A**: Reuse `code_chunks` table with a `file_path` set to the `doc_id` and `language` set to the category — minimal schema change.
- **Option B**: Add a separate `doc_chunks` table — cleaner separation but requires schema changes (LanceDB schemas are immutable after first write, so this table must be created in Phase 4's init_project extension).

**Recommendation**: Add a `doc_chunks` table in Phase 4. Since `init_project` creates tables idempotently via `existOk: true`, the new table can be added to TABLE_NAMES/TABLE_SCHEMAS and existing databases will get it on next init_project call. The doc_chunks table needs: chunk_id, project_id, doc_id, chunk_index, content, vector (768-dim), header, version, status (active/superseded), token_count, created_at.

### Pattern 3: Metadata-Only Update (No Re-embedding)

**What:** Use `table.update()` to change status/phase/tags/priority without touching chunk vectors.

**When to use:** update_document tool, and soft-delete (set status=archived).

**Example:**
```typescript
// Source: LanceDB Context7 docs
await table.update({
  where: `doc_id = '${docId}' AND project_id = '${projectId}'`,
  values: {
    status: args.status,
    updated_at: new Date().toISOString(),
  },
});
```

### Pattern 4: SQL Predicate Filtering (No Vectors)

**What:** Use `table.query().where(predicate).limit(N).toArray()` for metadata-only queries.

**When to use:** query_documents (all filters), project_overview counts, activity_log recent events.

**Example:**
```typescript
// Source: LanceDB Context7 docs
const parts: string[] = [`project_id = '${projectId}'`];
if (args.category) parts.push(`category = '${args.category}'`);
if (args.status)   parts.push(`status = '${args.status}'`);
if (args.phase)    parts.push(`phase = '${args.phase}'`);
// tags: stored as JSON string — use LIKE for simple matching or contains()
// priority: numeric filter
if (args.priority !== undefined) parts.push(`priority >= ${args.priority}`);

const predicate = parts.join(" AND ");
const rows = await table.query()
  .where(predicate)
  .limit(args.limit ?? 20)
  .toArray();
```

**Tags filtering caveat:** Tags are stored as a JSON string (e.g., `'["typescript","backend"]'`). SQL `LIKE '%"typescript"%'` works for simple tag matching but is fragile. Alternative: store tags as space-separated or pipe-separated for simpler LIKE queries. Decision left to Claude's discretion — recommend pipe-separated: `|typescript|backend|` for reliable `LIKE '%|typescript|%'` matching.

### Pattern 5: Chunking Pipeline

**What:** Convert a document's content into overlapping, context-prefixed chunks with embeddings.

**When to use:** store_document (new documents and new versions).

**Example (semantic_section strategy):**
```typescript
// Source: @langchain/textsplitters Context7 docs
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

async function chunkDocument(
  title: string,
  content: string,
  strategy: "semantic_section" | "paragraph" | "fixed_size",
): Promise<Array<{ content: string; header: string; tokenCount: number }>> {
  if (strategy === "semantic_section") {
    const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
      chunkSize: 500,   // target tokens — note: splitter counts chars; calibrate
      chunkOverlap: 50,
    });
    const docs = await splitter.createDocuments([content]);
    return docs.map((doc, i) => {
      const header = extractSectionHeader(doc.pageContent) ?? title;
      const contextPrefix = `Document: ${title} | Section: ${header}`;
      const prefixed = `${contextPrefix}\n\n${doc.pageContent}`;
      return { content: prefixed, header, tokenCount: countTokens(prefixed) };
    });
  }
  // paragraph: split on \n\n
  // fixed_size: split on character count with overlap
}
```

**Token counting:**
```typescript
// Source: gpt-tokenizer v3.4.0 API
import { countTokens } from "gpt-tokenizer";

const n = countTokens("Hello world"); // returns number
```

**Important:** `gpt-tokenizer` defaults to `cl100k_base` encoding (GPT-4 family). `nomic-embed-text` uses a different tokenizer internally, but for the purposes of estimating chunk size and returning `token_estimate` to the agent, cl100k_base is a sufficient approximation. The actual token count used by nomic-embed-text may differ slightly.

**Chunking strategy → category mapping (Claude's discretion — recommended):**

| Strategy | Categories | Rationale |
|----------|-----------|-----------|
| `semantic_section` | plan, task_spec, requirement, technical_context, architecture_decision, design_pattern, research | Markdown-structured with headers; section boundaries are meaningful |
| `paragraph` | learning, change_record, glossary | Prose-heavy; paragraph boundaries are natural units |
| `fixed_size` | code_pattern, dependency | Short entries, no natural boundaries; fixed size + overlap is appropriate |

### Pattern 6: Activity Log Write

**What:** After every successful mutation, append a row to activity_log.

**When to use:** After store_document, update_document, delete_document, link_documents.

**Example:**
```typescript
// Source: project pattern from batch.ts + schema.ts
import { ulid } from "ulidx";

async function logActivity(
  db: lancedb.Connection,
  projectId: string,
  actor: string,
  action: string,
  targetId: string,
  targetType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const table = await db.openTable("activity_log");
  await insertBatch(
    table,
    [{
      log_id: ulid(),
      project_id: projectId,
      actor,
      action,
      target_id: targetId,
      target_type: targetType,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: new Date().toISOString(),
    }],
    ActivityLogRowSchema,
  );
}
```

**Actor format (Claude's discretion — recommended):** Use `"agent"` as the default actor string for all MCP-invoked actions. This is consistent and simple. The MCP SDK does not expose caller identity, so a static string is the only practical option.

### Anti-Patterns to Avoid

- **Re-embedding on metadata update**: Never call embed() inside update_document. Metadata changes (status, phase, tags, priority) must only touch the documents table, never the doc_chunks table.
- **Storing tags as arrays in LanceDB**: LanceDB stores arrays as Arrow list types. Tags were defined as `Utf8` (string) in the existing schema — store as serialized string, not array. Changing the schema is not possible post-creation.
- **SQL injection via project_id/doc_id**: Always validate both IDs against the slug regex before interpolating into SQL predicates. Existing ProjectIdSchema in init-project.ts can be reused. doc_id (ULID format) can be validated with a similar regex.
- **Logging before write succeeds**: Write the document row first, then log to activity_log. If the write fails, the log entry would be misleading.
- **Forgetting the doc_chunks table in FOUND-04**: init_project seeding must happen AFTER all tables exist including the new doc_chunks table. The seeding logic goes in the extended initProject() function.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Custom word-count estimator | gpt-tokenizer countTokens | BPE tokenization is non-trivial; word counts are inaccurate for code/symbols; off-by-factor errors cause context budget issues for agents |
| Markdown section splitting | Regex-based header parser | @langchain/textsplitters RecursiveCharacterTextSplitter | Edge cases: code blocks with `#` comments, nested headers, headers in blockquotes, headers immediately followed by another header |
| ID generation | UUID v4 / Date.now() | ulidx ulid() | ULIDs are already the project standard; monotonically sortable; avoids collision risk from Date.now() |
| SQL predicate building | String concatenation with user input | Slug-validated IDs + hardcoded field names | LanceDB has no parameterized query support; validation is the safety mechanism |

**Key insight:** The most dangerous hand-roll in this phase is the chunking logic. A naive regex header splitter will fail on documents where `#` appears inside fenced code blocks. LangChain's splitter handles this correctly.

---

## Common Pitfalls

### Pitfall 1: doc_chunks Table Not Defined Before Seeding

**What goes wrong:** init_project seeding creates starter documents but doc_chunks table doesn't exist yet (it wasn't in Phase 3 schema). insertBatch to a non-existent table throws.

**Why it happens:** The TABLE_NAMES and TABLE_SCHEMAS arrays in schema.ts need to be updated for Phase 4 to include doc_chunks. The init_project function iterates TABLE_NAMES — if doc_chunks isn't there, the table never gets created.

**How to avoid:** Add doc_chunks to TABLE_NAMES and TABLE_SCHEMAS as the very first task in the phase. Verify with an `await db.tableNames()` assertion in init-project tests.

**Warning signs:** "No schema registered for table 'doc_chunks'" error in initProject.

### Pitfall 2: Version Query Returns Multiple Rows

**What goes wrong:** store_document queries for the current version with `limit(1)` but the documents table may have multiple rows for the same doc_id if previous versioning was partially applied.

**Why it happens:** LanceDB is append-only (no upsert on documents table). A failed store attempt between "write new doc row" and "mark old superseded" can leave orphaned rows.

**How to avoid:** Query for `MAX(version)` by filtering doc_id + project_id and sorting descending with limit(1). Then use version number robustly. Consider: always supersede ALL rows for a doc_id that are not already superseded, not just the "latest" one, to handle corruption.

**Warning signs:** `chunk_count` on re-store is double the expected value; `version` jumps by more than 1.

### Pitfall 3: LanceDB table.update() Requires At Least One Row to Match

**What goes wrong:** update_document called with a doc_id that doesn't exist returns success (no error), but nothing was updated. Agent sees a success response for a no-op.

**Why it happens:** LanceDB's `table.update()` does not error when the WHERE predicate matches zero rows.

**How to avoid:** After every update call, verify the update took effect by calling `table.countRows(predicate)`. If count is 0, return a structured error `{ error: 'DOC_NOT_FOUND', message: 'Document ${docId} not found in project ${projectId}' }`.

**Warning signs:** update_document returns success but the document's metadata is unchanged in subsequent queries.

### Pitfall 4: Tags Stored as String — LIKE Matching Edge Cases

**What goes wrong:** Tag filter on query_documents matches partial tag names (e.g., searching for tag `"type"` matches a document tagged `"typescript"`).

**Why it happens:** Using SQL `LIKE '%type%'` on a pipe-separated string like `|typescript|backend|` incorrectly matches if the delimiter is not properly anchored.

**How to avoid:** Use delimiter-anchored format `|typescript|backend|` and query with `LIKE '%|typescript|%'`. The `|` prefix+suffix on the stored string ensures exact match. Alternatively, use comma+space separator and query `LIKE '%, typescript,%'` — but pipe is cleaner.

**Warning signs:** query_documents returns documents that don't have the requested tag.

### Pitfall 5: Starter Documents Embedded Before Ollama Health Check Resolves

**What goes wrong:** init_project is called before Ollama is available. Starter document seeding tries to call embed() and fails with OllamaUnreachableError, causing the entire init_project to fail.

**Why it happens:** Starter documents are stored as regular LanceDB rows (per locked decision). The DOC-03 requirement says chunks are embedded at write time.

**How to avoid:** Starter documents should be stored WITHOUT embedding (no vector) during seeding — they are scaffolds, not yet real content. The doc_chunks table rows for starters can be inserted with a placeholder null vector or skip chunk creation entirely until the agent first updates them. However: the doc_chunks schema has `vector` as non-nullable (it's a FixedSizeList). Options:

1. Make starter seeding embed the templates using embed() — but then init_project fails without Ollama.
2. Store starter document rows only (in documents table), skip doc_chunks rows until first update via store_document — simplest approach, consistent with "scaffolds that agents fill in."
3. Store doc_chunks with zero vectors `new Array(768).fill(0)` as placeholder — these won't return meaningful semantic search results, which is acceptable for starters.

**Recommendation:** Option 2 — insert into documents table only during seeding. The chunk insertion happens when the agent stores real content. This avoids Ollama dependency at init time. Document that starters have 0 chunks in the seed response.

**Warning signs:** init_project fails with OllamaUnreachableError when seeding starter documents.

### Pitfall 6: Bidirectional link_documents Creates Duplicate Relationships

**What goes wrong:** Calling link_documents(A, B, bidirectional=true) twice creates 4 rows (2 pairs of A→B and B→A).

**Why it happens:** The relationships table has no uniqueness constraint in LanceDB (no primary key enforcement on inserts).

**How to avoid:** Before inserting, check if the relationship already exists:
```typescript
const existing = await table.query()
  .where(`from_id = '${fromId}' AND to_id = '${toId}' AND type = '${type}' AND project_id = '${projectId}'`)
  .limit(1)
  .toArray();
if (existing.length > 0) {
  return { error: 'RELATIONSHIP_EXISTS', message: '...' };
}
```

**Warning signs:** project_overview shows inflated relationship counts; graph traversal returns duplicate results.

### Pitfall 7: project_overview countRows on Large Tables is Slow

**What goes wrong:** project_overview calls countRows() with multiple filter predicates; with thousands of documents this becomes noticeably slow.

**Why it happens:** LanceDB BTree indexes are created on `project_id` (from Phase 2 init). Filtering by category/status additionally requires a full scan of the project's rows.

**How to avoid:** Keep the result set reasonable — project_overview is meant as a dashboard, not a full audit. The default limit of 20 on query_documents and the last-5 limit on recent activity are already scoped. Accept that counts may be slightly slow at large scale — this is a v1 trade-off. For Phase 4, do not add optimization; document it as a known scaling concern.

**Warning signs:** project_overview takes > 500ms on a project with 500+ documents.

---

## Code Examples

Verified patterns from official sources:

### LanceDB: Query with Filter + Limit + toArray
```typescript
// Source: Context7 /lancedb/lancedb — Query.md
const rows = await table.query()
  .where("project_id = 'my-proj' AND category = 'research' AND status = 'active'")
  .limit(20)
  .toArray();
```

### LanceDB: Update Metadata
```typescript
// Source: Context7 /lancedb/lancedb — CRUD operations
await table.update({
  where: `doc_id = '${docId}' AND project_id = '${projectId}'`,
  values: {
    status: "approved",
    updated_at: new Date().toISOString(),
  },
});
```

### LanceDB: Hard Delete
```typescript
// Source: Context7 /lancedb/lancedb — CRUD operations
await table.delete(`doc_id = '${docId}' AND project_id = '${projectId}'`);
```

### LanceDB: Count Rows with Filter
```typescript
// Source: Context7 /lancedb/lancedb — Table.md
const count = await table.countRows(`project_id = '${projectId}' AND category = 'research'`);
```

### gpt-tokenizer: Count Tokens
```typescript
// Source: gpt-tokenizer v3.4.0 (npm registry verified, pure JS)
import { countTokens } from "gpt-tokenizer";

const tokenCount = countTokens("Document: My Title | Section: Introduction\n\nThis is the content...");
```

### @langchain/textsplitters: Markdown Section Chunking
```typescript
// Source: Context7 /websites/langchain — text splitter docs
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 2000,   // characters, not tokens — calibrate based on testing
  chunkOverlap: 200, // ~10% of chunkSize
});
const docs = await splitter.createDocuments([markdownContent]);
// Each doc.pageContent is one chunk (string)
```

**Note on chunkSize units:** `@langchain/textsplitters` `chunkSize` is measured in **characters**, not tokens. A 500-token chunk at ~4 chars/token ≈ 2000 characters. Set `chunkSize: 2000, chunkOverlap: 200` and then verify with `countTokens()` that resulting chunks are near 500 tokens. Actual calibration may vary by content type.

### ulidx: Generate IDs
```typescript
// Source: project established pattern (Phase 1-3)
import { ulid } from "ulidx";

const docId = ulid();       // e.g., "01KJHHDSDBJXFA3HF60NRY63ME"
const chunkId = ulid();
const relationshipId = ulid();
const logId = ulid();
```

### Starter Document Seeding Pattern
```typescript
// Source: pattern from init-project.ts + insertBatch.ts
import { ulid } from "ulidx";

const now = new Date().toISOString();
const starterDocs = buildStarterDocuments(projectId, starterTypes ?? DEFAULT_STARTERS);

const docsTable = await db.openTable("documents");
await insertBatch(docsTable, starterDocs.map(d => ({
  doc_id: ulid(),
  project_id: projectId,
  title: d.title,
  content: d.content,
  category: d.category,
  status: "active",
  version: 1,
  created_at: now,
  updated_at: now,
  tags: "",        // no tags on starters
  phase: null,
  priority: null,
  parent_id: null,
  depth: null,
  decision_type: null,
})), DocumentRowSchema);
// No doc_chunks rows — starters have 0 embeddings until agent updates them
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tiktoken (WASM) for token counting | gpt-tokenizer v3 (pure JS BPE) | ~2024 | No WASM load overhead; works in Bun without native bindings |
| LangChain Python splitters | @langchain/textsplitters v1.x (standalone TS pkg) | 2024 | Split off from main langchain package; lighter weight |
| LanceDB 0.27.x (beta) | LanceDB 0.26.2 (pinned) | Project decision | 0.27.x has breaking insert API; locked at 0.26.2 |

**Deprecated/outdated:**
- `tiktoken` (WASM variant): Requires native bindings or WASM; slower startup; use gpt-tokenizer instead for pure-JS token counting.
- `langchain` (full package): Heavy dependency with Python-compat shims; use `@langchain/textsplitters` standalone package instead.

---

## Open Questions

1. **doc_chunks table schema — vector nullability for starter documents**
   - What we know: The CODE_CHUNKS_SCHEMA uses `new Field("vector", new FixedSizeList(768, ...), false)` — non-nullable. This means every row must have a valid 768-dim vector.
   - What's unclear: If starters skip doc_chunks entirely (Option 2 in Pitfall 5), this is fine. But if we later need to search documents that were seeded, they'll have no chunks until the agent re-stores them.
   - Recommendation: Define the doc_chunks table with `vector` as nullable OR use zero-vector placeholder. Nullable is cleaner semantically. Since this is a NEW table added in Phase 4 (not yet written to disk), the schema can be defined fresh. Use `new Field("vector", new FixedSizeList(768, ...), true)` — nullable — so starters can be stored with `null` vector.

2. **project_overview: "~100-token summaries" from documents table**
   - What we know: CONTEXT.md says query_documents returns metadata + ~100-token summaries. The documents table has a `content` field (full text). There is no separate `summary` column in DOCUMENTS_SCHEMA.
   - What's unclear: Should summaries be truncated content (first N chars), or stored separately, or computed on-the-fly?
   - Recommendation: Truncate content to ~400 characters on read (approximately 100 tokens). No new column needed. Add a helper: `content.slice(0, 400) + (content.length > 400 ? '...' : '')`. This avoids schema changes and keeps Phase 4 self-contained.

3. **GRAPH-03: 1-hop graph traversal — is this Phase 4 or Phase 5?**
   - What we know: GRAPH-03 says "1-hop graph traversal surfaces related documents when fetching context." This is listed as a Phase 4 requirement.
   - What's unclear: The implementation surface for GRAPH-03 is get_smart_context, which is the Phase 5 search tool. Should Phase 4 expose a standalone `get_related_documents(doc_id)` tool or wait until get_smart_context is built in Phase 5?
   - Recommendation: Implement `get_related_documents` as a simple tool in Phase 4 that queries the relationships table for `from_id = doc_id` and returns the related document metadata. This satisfies GRAPH-03 without requiring the full get_smart_context context-assembly logic.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — this section is skipped per instructions.

(Config contains `workflow.research`, `workflow.plan_check`, `workflow.verifier` but no `nyquist_validation` key. Skipping Validation Architecture section.)

---

## Sources

### Primary (HIGH confidence)
- Context7 `/lancedb/lancedb` — table.update(), table.delete(), table.query().where().limit().toArray(), table.countRows(filter), mergeInsert API
- Context7 `/websites/langchain` — RecursiveCharacterTextSplitter.fromLanguage("markdown"), chunkSize/chunkOverlap parameters
- npm registry (direct fetch) — gpt-tokenizer latest=3.4.0, ulidx latest=2.4.1, @langchain/textsplitters latest=1.0.1
- Project source code — schema.ts (all table schemas, Zod validators), batch.ts (insertBatch), embedder.ts (embed(), checkOllamaHealth()), init-project.ts (registerXTool pattern), delete-project.ts (core/registration split)
- package.json — confirmed dependencies: @lancedb/lancedb@0.26.2, ulidx@2.4.1, zod@^4.0.0

### Secondary (MEDIUM confidence)
- WebSearch verified: gpt-tokenizer is pure JS (no WASM), countTokens function confirmed from multiple sources including GitHub README
- WebSearch verified: @langchain/textsplitters is a standalone package separated from main langchain, lighter weight
- WebFetch philna.sh — confirmed @langchain/textsplitters MarkdownNodeParser for heading-based splitting; llm-chunk as simpler alternative

### Tertiary (LOW confidence)
- Recommendation to use pipe-separated tags `|tag|` — project convention, not documented externally; should be validated during implementation
- chunkSize=2000 chars ≈ 500 tokens estimate — based on ~4 chars/token rule of thumb; actual calibration depends on content type

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions confirmed from npm registry; packages verified against project constraints
- Architecture: HIGH — LanceDB CRUD patterns confirmed from Context7; project patterns read directly from source
- Pitfalls: MEDIUM-HIGH — most derived from reading existing code + LanceDB behavior; Pitfall 7 (perf) is LOW confidence (no benchmark data)

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable libraries; gpt-tokenizer and lancedb move slowly)
