# Phase 6: Code Indexing - Research

**Researched:** 2026-02-28
**Domain:** AST-aware code parsing, tree-sitter, incremental file indexing, relationship extraction
**Confidence:** MEDIUM-HIGH (tree-sitter grammar version compatibility is the key risk)

## Summary

Phase 6 builds the `index_codebase` MCP tool: scan TypeScript/Python/Rust files, parse each with tree-sitter to extract AST-aware symbol chunks, embed chunks with context headers, track file hashes for incremental re-indexing, remove stale chunks on deletion, and auto-generate `depends_on` relationship edges from import statements.

The project already has all the scaffolding needed. The `code_chunks` table schema is defined and provisioned by `init_project` (Phase 2). The `embed()` function, `insertBatch()`, `connectDb()`, and the `relationships` table with `source: "ast_import"` support are all in place. The core new work is (1) installing and wiring tree-sitter grammars, (2) implementing the file scanner with gitignore/exclusion support, (3) writing the symbol extractor for each language, (4) implementing the chunk splitter for large symbols, and (5) implementing incremental hash tracking plus stale-chunk/edge cleanup.

The `tree-sitter` Node.js native bindings (NAPI-based, version 0.25.1) work with Bun because Bun implements 95%+ of the Node-API interface. Grammar packages (`tree-sitter-typescript`, `tree-sitter-python`, `tree-sitter-rust`) must be installed alongside the core `tree-sitter` package. Grammar package versions sometimes lag the core (e.g., tree-sitter-typescript is 0.23.2, tree-sitter-python is 0.25.0, tree-sitter-rust is 0.24.0) — this is a MEDIUM-confidence risk area that must be verified with an actual install before finalizing. The existing STATE.md already flags this risk.

**Primary recommendation:** Use native `tree-sitter` Node.js bindings (not web-tree-sitter WASM); use the `ignore` npm package for .gitignore-compliant path filtering; use Bun's built-in `fs.promises.glob` or `Bun.Glob` for file discovery; follow the existing tool pattern (core function + registerXTool wrapper) throughout.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Chunking granularity**
- Both class overview AND individual method chunks — class signature/docstring gets its own chunk, each method/function is a separate chunk with class as scope context
- Index all top-level declarations including private constants, config objects, type aliases, enums, and module-level code
- Scope chain uses dot notation (e.g., "db.UserRepo.save")
- Large chunks (functions/classes exceeding ~200 lines) are split into sequential parts to preserve embedding quality

**Edge case handling**
- Syntax errors: partial index + warning — extract whatever symbols tree-sitter can recover, log warning for unparseable sections
- Large files: index normally with size warning above threshold (e.g., 5000 lines), no hard skip
- Embedding service down: fail fast with clear error — consistent with Phase 3's fail-fast design
- Progress: log per-file progress to stderr during indexing runs (not just final counts)

**Import relationship depth**
- Static imports only — no dynamic imports (`import()`, `importlib.import_module()`)
- Skip external packages — only create depends_on edges between files that exist in the indexed project
- Re-exports create edges — `export { foo } from './bar'` creates a depends_on edge same as regular imports
- Barrel files create all re-export edges — an index.ts that re-exports from 10 modules gets 10 outgoing edges
- Wildcard imports create module-level edge — `from module import *` creates depends_on to the source module file
- Rust `mod` declarations create depends_on edges — `mod submodule;` means parent depends on submodule
- Edge granularity: file-level depends_on edges with imported symbol names as optional metadata on the edge

**Indexing exclusions**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CODE-01 | index_codebase scans project directory for .ts, .tsx, .py, .rs files respecting .gitignore patterns | `ignore` npm package for gitignore-spec filtering + Bun.Glob/fs.promises.glob for recursive scan |
| CODE-02 | Files are parsed with tree-sitter to extract AST-aware chunks at function/class/method/interface/type boundaries | `tree-sitter` 0.25.1 native Node.js bindings + language grammars; node types documented per language |
| CODE-03 | Each code chunk includes symbol_name, symbol_type, scope_chain, imports, and exports metadata | code_chunks schema already provisioned in Phase 2; all fields present |
| CODE-04 | Code chunks are prefixed with context header ("File: {path} \| {symbol_type}: {scope_chain}") before embedding | Pattern mirrors existing DOC-03 context headers; embed() service already in place |
| CODE-05 | Incremental indexing compares SHA-256 file hashes and only re-indexes changed files | Node.js `crypto` (already imported by embedder.ts) + file_hash field already in code_chunks schema |
| CODE-06 | Deleted files have their code_chunks and auto-generated relationships removed | table.delete() pattern established by delete-document.ts; predicate-based delete on file_path |
| CODE-07 | Import/use statements are parsed to auto-generate depends_on relationships between files | tree-sitter node types identified: import_statement (TS), import_statement (Python), use_declaration + mod_item (Rust) |
| CODE-08 | Auto-generated relationships (source: "ast_import") are replaced on re-index to stay fresh | Delete-then-reinsert pattern; source field already in relationships schema |
| CODE-09 | index_codebase returns files_scanned, files_indexed, chunks_created, skipped_unchanged counts | Simple counter accumulation during walk; return shape defined |
| CODE-10 | TypeScript, Python, and Rust languages are supported with appropriate tree-sitter grammars | Grammar packages: tree-sitter-typescript (TS+TSX), tree-sitter-python, tree-sitter-rust |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tree-sitter` | 0.25.1 | Native Node.js bindings to the tree-sitter C parser | The canonical Node.js interface; NAPI-based so compatible with Bun; faster than web-tree-sitter WASM |
| `tree-sitter-typescript` | 0.23.2 | TypeScript + TSX grammar | Official tree-sitter grammar maintained by the same org |
| `tree-sitter-python` | 0.25.0 | Python grammar | Official tree-sitter grammar |
| `tree-sitter-rust` | 0.24.0 | Rust grammar | Official tree-sitter grammar |
| `ignore` | ^6.0 | .gitignore spec-compliant pattern matching | Used by ESLint, Prettier; most accurate gitignore spec implementation available |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (built-in) | — | SHA-256 file hashing | Already used by embedder.ts; no new install |
| `node:fs` (built-in) | — | File reading and stats | Already used throughout the project |
| `node:path` (built-in) | — | Path normalization and resolution | Required for cross-platform relative path handling |
| `Bun.Glob` / `fs.promises.glob` | — | Recursive directory scanning | Already available in Bun; no install |
| `ulidx` | ^2.4.1 | Chunk ID generation | Already a project dependency |
| `zod` | ^4.0.0 | Input validation | Already a project dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tree-sitter` (native) | `web-tree-sitter` (WASM) | WASM runs in all JS envs including browsers but is considerably slower; native bindings are faster and already proven Bun-compatible |
| `ignore` | `micromatch` / custom regex | `ignore` follows the gitignore spec exactly; micromatch is for glob patterns not gitignore semantics |
| `Bun.Glob` | `fast-glob`, `glob` npm | Bun.Glob is built-in, zero dependency; fast-glob is the best npm fallback if Bun.Glob proves insufficient |

**Installation:**
```bash
bun add tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-rust ignore
```

> **WARNING (MEDIUM confidence):** Grammar package versions (typescript 0.23.2, rust 0.24.0) lag behind core 0.25.1. Installation with `--legacy-peer-deps` may be required. Verify actual install succeeds before writing plan tasks. The existing STATE.md flags this as a blocker/concern for Phase 6.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── tools/
│   └── index-codebase.ts        # MCP tool registration + indexCodebase() core function
├── services/
│   └── code-indexer/
│       ├── scanner.ts            # File system walk + gitignore/exclusion filtering
│       ├── parser.ts             # tree-sitter parser initialization per language
│       ├── extractor.ts          # AST traversal, symbol extraction, large-chunk splitting
│       ├── import-resolver.ts    # Import path normalization + filter-to-project-files
│       └── chunk-builder.ts      # Assemble ChunkRow from extracted symbol + embed
test/
├── tools/
│   └── index-codebase.test.ts    # Full integration tests for indexCodebase()
└── services/
    └── code-indexer/
        ├── scanner.test.ts
        ├── extractor.test.ts
        └── import-resolver.test.ts
```

The scanner, parser, and extractor can alternatively live in a single `src/services/code-indexer.ts` file if complexity is manageable — the important constraint is the established pattern of separating core logic from MCP tool registration.

### Pattern 1: Tool Registration (established pattern — follow exactly)

**What:** Every tool has a `coreFunction(dbPath, projectId, args, config)` export and a `registerXTool(server, config)` export. The MCP handler calls `coreFunction` inside try/catch and returns `{ success, data }` or `{ success: false, error }`.

**When to use:** Always — this is the project's established pattern for all 15 existing tools.

```typescript
// Source: established project pattern (see src/tools/store-document.ts)
export async function indexCodebase(
  dbPath: string,
  projectId: string,
  args: IndexCodebaseArgs,
  config: SynapseConfig,
): Promise<IndexCodebaseResult> { ... }

export function registerIndexCodebaseTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool("index_codebase", { ... }, async (args) => {
    const log = createToolLogger("index_codebase");
    const start = Date.now();
    try {
      const data = await indexCodebase(config.db, parsed.project_id, parsed, config);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data }) }] };
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: String(err) }) }] };
    }
  });
}
```

### Pattern 2: tree-sitter Parser Setup (verified from Context7 docs)

**What:** Initialize one parser per language, set grammar, then call `parser.parse(sourceCode)`. Grammar packages export language objects directly. TypeScript needs special handling — `tree-sitter-typescript` exports both `typescript` and `tsx`.

```typescript
// Source: tree-sitter Node.js docs (https://tree-sitter.github.io/node-tree-sitter/)
import Parser from "tree-sitter";
import TypeScriptLang from "tree-sitter-typescript";
import PythonLang from "tree-sitter-python";
import RustLang from "tree-sitter-rust";

// TypeScript grammar has two dialects
const tsParser = new Parser();
tsParser.setLanguage(TypeScriptLang.typescript);  // for .ts files
const tsxParser = new Parser();
tsxParser.setLanguage(TypeScriptLang.tsx);         // for .tsx files

const pyParser = new Parser();
pyParser.setLanguage(PythonLang);

const rsParser = new Parser();
rsParser.setLanguage(RustLang);

// Parse source
const tree = tsParser.parse(sourceCode);
const root = tree.rootNode;
```

### Pattern 3: AST Node Traversal for Symbol Extraction

**What:** Walk the AST recursively, identify top-level symbol nodes, extract name and content range, then emit one chunk per symbol (plus one chunk per class/struct for the overview).

**Key node types per language (verified from Context7 official grammar test files):**

**TypeScript/TSX:**
- `function_declaration` — top-level functions (name via `firstNamedChild` or `.childForFieldName('name')`)
- `class_declaration` — classes
- `method_definition` — methods inside class_body
- `arrow_function` (when assigned to a `const` via `lexical_declaration`) — common TS pattern
- `interface_declaration` — interfaces
- `type_alias_declaration` — type aliases
- `enum_declaration` — enums
- `import_statement` — imports (for edge extraction)
- `export_statement` — re-exports (has `source` field for `export {...} from "..."` re-exports)

**Python:**
- `function_definition` — top-level and nested functions
- `class_definition` — classes
- `decorated_definition` — decorators wrapping function_definition or class_definition
- `import_statement` — plain imports (`import foo`)
- `import_from_statement` — `from foo import bar` (includes `wildcard_import` for `*`)

**Rust:**
- `function_item` — functions (including `impl` block methods)
- `struct_item` — structs
- `enum_item` — enums
- `trait_item` — traits
- `impl_item` — impl blocks (emit overview chunk; emit each function_item inside as method chunk)
- `type_item` — type aliases
- `const_item` — constants
- `use_declaration` — `use` imports (for edge extraction)
- `mod_item` — `mod submodule;` (creates depends_on edge per user decision)

**Example traversal:**
```typescript
// Walk named children of root node
function extractSymbols(root: Parser.SyntaxNode, source: string): SymbolExtraction[] {
  const symbols: SymbolExtraction[] = [];
  for (const node of root.namedChildren) {
    if (EXTRACTABLE_NODE_TYPES_TS.has(node.type)) {
      const name = getNodeName(node);
      symbols.push({
        symbol_name: name,
        symbol_type: normalizeNodeType(node.type),
        scope_chain: name ?? "",
        start_line: node.startPosition.row + 1,
        end_line: node.endPosition.row + 1,
        content: source.slice(node.startIndex, node.endIndex),
      });
    }
  }
  return symbols;
}
```

### Pattern 4: SHA-256 Incremental Hash Check

**What:** Before parsing a file, compute its SHA-256 hash and query the existing max `file_hash` for that file's chunks. If they match, skip re-indexing.

```typescript
// Source: Node.js crypto (built-in) — same crypto module used in embedder.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

// Query existing hash from code_chunks table
const existingChunks = await codeChunksTable
  .query()
  .where(`file_path = '${relPath}' AND project_id = '${projectId}'`)
  .limit(1)
  .toArray();

if (existingChunks.length > 0 && existingChunks[0].file_hash === currentHash) {
  skipped_unchanged++;
  continue;
}
```

### Pattern 5: Stale Chunk Cleanup (deletion + relationship replacement)

**What:** On re-index of a changed file, delete old chunks first, then insert new ones. On deletion of a file, also delete its `ast_import` relationships. Always delete-then-reinsert ast_import relationships (not upsert) to avoid duplicates.

```typescript
// Source: established project pattern (see src/tools/delete-document.ts)

// Step 1: Delete stale chunks for changed/deleted file
await codeChunksTable.delete(
  `file_path = '${relPath}' AND project_id = '${projectId}'`
);

// Step 2: Delete stale auto-generated edges for this file
await relTable.delete(
  `from_id = '${relPath}' AND source = 'ast_import' AND project_id = '${projectId}'`
);

// Step 3: Insert new chunks + edges (only if file still exists)
```

### Pattern 6: Large Chunk Splitting

**What:** If a symbol's line range exceeds the threshold (~200 lines per user decision), split its source text into sequential parts with overlap, labeling them "MyFunc (part 1/3)", etc.

**Strategy (Claude's discretion):** Use character-based splitting with ~8000 chars per part and ~200 char overlap, matching the existing `splitFixedSize` pattern in `chunker.ts`. This prevents embedding quality degradation for very long functions.

### Pattern 7: Context Header Construction

**What:** Every code chunk is embedded with a context prefix. The prefix format is mandated by CODE-04.

```typescript
// Source: CODE-04 requirement; mirrors DOC-03 pattern from Phase 4
const contextHeader = `File: ${relPath} | ${symbol_type}: ${scope_chain}`;
const embeddingText = `${contextHeader}\n\n${chunkContent}`;
// Store embeddingText as chunk content (same as document chunks)
```

### Pattern 8: File Scanner with Exclusion

**What:** Walk the project root recursively, filter by language extension, apply .gitignore rules + hardcoded exclusions + user patterns.

```typescript
// Source: Bun docs (https://bun.com/docs/runtime/glob) + ignore npm package
import Ignore from "ignore";
import { readFileSync } from "node:fs";

const ig = Ignore();
// Load .gitignore if present
try {
  ig.add(readFileSync(join(projectRoot, ".gitignore"), "utf8"));
} catch { /* no .gitignore */ }
// Add hardcoded exclusions
ig.add(["node_modules", "__pycache__", "target/", "dist/", "build/", ".git"]);
// Add user-provided patterns
if (args.exclude_patterns) ig.add(args.exclude_patterns);

// Scan
const glob = new Bun.Glob("**/*.{ts,tsx,py,rs}");
for await (const file of glob.scan({ cwd: projectRoot, absolute: false })) {
  if (ig.ignores(file)) continue;
  // process file
}
```

### Anti-Patterns to Avoid

- **Parsing with regex instead of tree-sitter:** Even a simple "find all `function` keywords" will break on multiline strings, comments, template literals. Use the AST.
- **Using `table.update()` for chunk re-indexing:** LanceDB update requires knowing the row; delete + reinsert is the correct pattern for code chunks (same as doc versioning).
- **Creating relationship edges without checking file existence:** External package imports must be filtered before inserting edges. Check that the resolved path is in the indexed file set.
- **Global parser instances across async boundaries:** tree-sitter's Node.js binding parsers are not thread-safe. Use one parser per language per call, or pool carefully.
- **Reading entire file tree into memory:** Use async iteration (Bun.Glob.scan) and process files one at a time to avoid OOM on large codebases.
- **Embedding entire file as one chunk:** Defeats the purpose of AST-aware chunking; each symbol must be its own embedded chunk.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .gitignore pattern matching | Custom regex matcher | `ignore` npm package | The gitignore spec has 30+ edge cases (negation, directory-only patterns, anchoring, character ranges). `ignore` is the reference implementation. |
| AST parsing for TypeScript/Python/Rust | Custom regex/string parser | `tree-sitter` + grammar packages | Regex cannot handle nested scopes, multiline constructs, or syntax error recovery. tree-sitter handles all of these. |
| File walking/globbing | Manual `fs.readdir` recursion | `Bun.Glob` | Built-in, async iteration, fast; handles symlink loops; no extra dependency |
| SHA-256 hashing | Custom checksum | `node:crypto createHash('sha256')` | Already used in embedder.ts; built-in module |
| File-level relationship deduplication | Query + conditional insert | Delete-then-reinsert all ast_import edges for a file on each re-index | Simpler, correct, no race condition; mirrors how Phase 4 handles chunk superseding |

**Key insight:** The parsing domain (AST extraction) is where correctness is hardest to achieve manually. A tree-sitter grammar handles all the edge cases in a given language's syntax so you never have to.

---

## Common Pitfalls

### Pitfall 1: Grammar Package Version Mismatch
**What goes wrong:** `tree-sitter-typescript` (0.23.2) or `tree-sitter-rust` (0.24.0) fails to load under `tree-sitter` core 0.25.1 with a cryptic "Invalid language object" or ABI version error.
**Why it happens:** Grammar packages expose a C ABI version that must match the core. Older grammars may have ABI version below what 0.25.x expects.
**How to avoid:** Run `bun add tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-rust` and immediately test that all three parsers can parse a trivial snippet. If ABI mismatch, try pinning `tree-sitter` to 0.21.x or use `tree-sitter-compat` as a shim.
**Warning signs:** Error contains "Invalid language" or "Expected ABI" or "undefined is not a function" when calling `setLanguage()`.

### Pitfall 2: TypeScript Requires Two Grammar Objects
**What goes wrong:** `.tsx` files fail to parse or return wrong node types when using the `typescript` grammar.
**Why it happens:** `tree-sitter-typescript` exports two grammars: `.typescript` and `.tsx`. They are different parsers. Using `typescript` for a `.tsx` file often partially works but may miss JSX constructs.
**How to avoid:** Always dispatch: `.ts` files → `TypeScriptLang.typescript`, `.tsx` files → `TypeScriptLang.tsx`.
**Warning signs:** JSX tags inside `.tsx` files appear as `ERROR` nodes in the AST.

### Pitfall 3: Rust `use_declaration` Path Resolution
**What goes wrong:** `use my_crate::module;` generates a depends_on edge to `my_crate/module`, which does not exist as a local file.
**Why it happens:** Rust use paths can refer to external crates, stdlib, or local modules. External crate names never resolve to local files.
**How to avoid:** After resolving a `use_declaration` path, check if the resulting `.rs` file exists in the scanned file set before creating an edge. Drop it silently if not found.
**Warning signs:** Large number of depends_on edges to non-existent paths in the relationships table.

### Pitfall 4: Import Path Resolution for TypeScript
**What goes wrong:** `import { foo } from "./utils"` does not resolve to a real file because TypeScript allows extension-less imports.
**Why it happens:** TypeScript bare imports rely on the TypeScript compiler's module resolution, which tries `.ts`, `.tsx`, `.d.ts` in order. The indexer must replicate this.
**How to avoid:** For each import source string: (1) try as-is, (2) append `.ts`, (3) append `.tsx`, (4) append `/index.ts`, (5) append `/index.tsx`. Use the first that exists in the scanned file set.
**Warning signs:** Zero or very few relationship edges created for a TypeScript project.

### Pitfall 5: Python Relative Imports
**What goes wrong:** `from . import utils` or `from ..models import User` create edges to wrong paths.
**Why it happens:** Relative imports are relative to the importing file's package directory, not the project root.
**How to avoid:** Resolve relative imports using the importing file's directory as the base. Count dots to determine how many levels up to go. Only create edge if resolved path is in the scanned file set.
**Warning signs:** Edges with paths like `.` or `..` in `to_id`.

### Pitfall 6: Large file scan blocking the event loop
**What goes wrong:** Indexing a large codebase blocks for tens of seconds because all file I/O is synchronous.
**Why it happens:** `readFileSync` on thousands of large files blocks Bun's event loop.
**How to avoid:** Use `Bun.file(path).text()` or `fs.promises.readFile()` for async file reads. Process files in the async for-await loop so I/O can interleave.
**Warning signs:** Server becomes unresponsive during indexing; other MCP calls time out.

### Pitfall 7: Scope chain for nested classes/functions
**What goes wrong:** A method `save()` inside class `UserRepo` inside module `db` gets scope_chain `save` instead of `db.UserRepo.save`.
**Why it happens:** Simple AST walkers only see the immediate parent, not the full nesting.
**How to avoid:** Pass a `parentScope` string through the recursive traversal. When descending into a class body, push the class name: `const childScope = parentScope ? "${parentScope}.${className}" : className`.
**Warning signs:** All scope_chains are single-level names with no dots.

### Pitfall 8: LanceDB predicate injection
**What goes wrong:** A file path containing a single quote (e.g., `my's/file.ts`) breaks the SQL predicate string.
**Why it happens:** LanceDB predicates are raw SQL strings (same pattern used throughout the project). Single quotes in file paths break the string literal.
**How to avoid:** Either escape single quotes in file paths before building predicates (`path.replace(/'/g, "''")`) or restrict the scan to paths that won't contain quotes (rare in practice). Document this limitation.
**Warning signs:** LanceDB throws a SQL parse error during indexing of paths with special characters.

---

## Code Examples

Verified patterns from official sources:

### tree-sitter: Basic parse and node traversal
```typescript
// Source: https://tree-sitter.github.io/node-tree-sitter/classes/Parser-1.html
import Parser from "tree-sitter";
import TypeScriptLang from "tree-sitter-typescript";

const parser = new Parser();
parser.setLanguage(TypeScriptLang.typescript);

const tree = parser.parse(`
  export class UserRepo {
    async save(user: User): Promise<void> { }
  }
`);

// Access root children
for (const node of tree.rootNode.namedChildren) {
  console.log(node.type);         // "export_statement" or "class_declaration"
  console.log(node.startPosition); // { row: 1, column: 2 }
  console.log(node.endPosition);   // { row: 3, column: 3 }
}
```

### TypeScript: extract import module paths
```typescript
// Source: Context7 tree-sitter-typescript corpus
// import_statement has: import_clause (what) + string (from where)
function extractTsImports(root: Parser.SyntaxNode, source: string): string[] {
  const sources: string[] = [];
  for (const node of root.namedChildren) {
    if (node.type === "import_statement" || node.type === "export_statement") {
      // The string child is the module path (e.g., "./utils")
      const sourceStr = node.namedChildren.find(c => c.type === "string");
      if (sourceStr) {
        // strip quotes
        sources.push(source.slice(sourceStr.startIndex + 1, sourceStr.endIndex - 1));
      }
    }
  }
  return sources;
}
```

### Python: parse import_from_statement
```typescript
// Source: Context7 tree-sitter-python corpus
// import_from_statement: module (dotted_name or relative_import) + names
function extractPyImports(root: Parser.SyntaxNode): Array<{module: string, relative: boolean}> {
  const imports = [];
  for (const node of root.namedChildren) {
    if (node.type === "import_from_statement") {
      const moduleNode = node.namedChildren[0]; // dotted_name or relative_import
      const isRelative = moduleNode?.type === "relative_import";
      const name = moduleNode?.text ?? "";
      imports.push({ module: name, relative: isRelative });
    }
    if (node.type === "import_statement") {
      // plain "import foo" — treat as external, skip edge creation
    }
  }
  return imports;
}
```

### Rust: use_declaration and mod_item
```typescript
// Source: Context7 tree-sitter-rust corpus
// use_declaration: use abc; use phrases::japanese; etc.
// mod_item: mod submodule; (without body = file reference)
function extractRustDeps(root: Parser.SyntaxNode): string[] {
  const paths: string[] = [];
  for (const node of root.namedChildren) {
    if (node.type === "use_declaration") {
      // node.text = "use phrases::japanese::*;" — extract path, filter external
      paths.push(node.text);
    }
    if (node.type === "mod_item") {
      const name = node.childForFieldName("name")?.text;
      if (name) paths.push(name); // mod submodule; → depends on submodule.rs
    }
  }
  return paths;
}
```

### SHA-256 file hashing
```typescript
// Source: Node.js crypto docs; same pattern as embedder.ts cache key
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function hashFile(filePath: string): string {
  const content = readFileSync(filePath);  // Buffer
  return createHash("sha256").update(content).digest("hex");
}
```

### ignore package: gitignore-compliant path filtering
```typescript
// Source: https://github.com/kaelzhang/node-ignore
import Ignore from "ignore";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function buildIgnoreFilter(projectRoot: string, excludePatterns: string[]): Ignore.Ignore {
  const ig = Ignore();
  const gitignorePath = join(projectRoot, ".gitignore");
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, "utf8"));
  }
  // Hardcoded defaults
  ig.add(["node_modules/", "__pycache__/", "target/", "dist/", "build/", ".git/"]);
  // User-provided extras
  ig.add(excludePatterns);
  return ig;
}

// Usage — paths must be relative to projectRoot for ignore to work correctly
if (ig.ignores(relPath)) continue;
```

### LanceDB: delete by predicate (established project pattern)
```typescript
// Source: established project pattern (src/tools/delete-document.ts)
// Delete all code_chunks for a file
await codeChunksTable.delete(
  `file_path = '${escapeSQL(relPath)}' AND project_id = '${projectId}'`
);

// Delete auto-generated edges for this file (as from_id)
await relTable.delete(
  `from_id = '${escapeSQL(relPath)}' AND source = 'ast_import' AND project_id = '${projectId}'`
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Line-based chunking for code | AST-aware symbol-boundary chunking | 2023-2024 (cAST paper) | Average 5.5pt improvement on RepoEval retrieval benchmarks |
| Separate parser per language | tree-sitter unified grammar framework | 2018+ | One parsing API for all languages; incremental re-parse |
| Binary lockfiles (bun.lockb) | Text lockfile (bun.lock) | Bun 1.3.9 | Already handled in project (see STATE.md decision 01-01) |
| grammar packages require native compile | Prebuilt NAPI binaries | 2021+ | No build toolchain needed at install time |

**Deprecated/outdated:**
- `web-tree-sitter` WASM for Node.js: Technically works but significantly slower than native bindings; only needed for browser environments. Not applicable here.
- `node-bindings` / `nan`: Old Node.js native addon system. tree-sitter 0.21+ migrated to NAPI. No longer relevant.

---

## Open Questions

1. **Grammar version compatibility with Bun 1.3.9 + tree-sitter 0.25.1**
   - What we know: Bun implements 95%+ Node-API; tree-sitter uses NAPI; grammar versions lag core (typescript 0.23.2, rust 0.24.0)
   - What's unclear: Whether ABI version mismatch causes runtime errors; whether `--legacy-peer-deps` is needed
   - Recommendation: Wave 0 of Plan 1 must be "install packages and write a smoke test parsing each language's trivial snippet" before any other implementation work. If fails, fallback to pinning `tree-sitter` to an older version that matches grammar ABIs (e.g., 0.21.x).

2. **Rust `use_declaration` path-to-file resolution**
   - What we know: Rust use paths use `::` separators, may include `super::`, `self::`, `crate::`, external crate names
   - What's unclear: Exact algorithm to go from `use my_crate::models::User` to a `.rs` file path
   - Recommendation: Implement a best-effort resolver: strip leading `crate::` / `self::`, replace `::` with `/`, check if resulting `src/{path}.rs` or `{path}/mod.rs` exists in the file set. Skip if not found.

3. **Test file detection heuristics (Claude's discretion)**
   - What we know: User wants `*.test.*`, `*.spec.*`, `test_*`, `*_test.*` tagged with `is_test: true` metadata
   - What's unclear: Exact field name in code_chunks schema (no `is_test` field exists in current schema)
   - Recommendation: Store test tag in the existing `imports` JSON field as part of file-level metadata, OR use `symbol_type = "test_file"` convention. Needs a concrete decision during planning: either add a boolean column `is_test` to code_chunks schema (requires schema migration) or encode in an existing JSON field.

4. **doc_id semantics for code_chunks**
   - What we know: code_chunks has a `doc_id` field (required, non-nullable)
   - What's unclear: What doc_id should be for code chunks — they aren't documents
   - Recommendation: Use the file's relative path as doc_id for code chunks (consistent, unique per file, enables "delete all chunks for doc_id = file_path"). This mirrors how the relationships table uses arbitrary IDs as from_id/to_id.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json`. Skipping this section.

*(Note: config.json has keys `mode`, `depth`, `parallelization`, `commit_docs`, `model_profile`, `workflow.research`, `workflow.plan_check`, `workflow.verifier` — no `nyquist_validation` key. Skipping Validation Architecture section as instructed.)*

---

## Sources

### Primary (HIGH confidence)
- Context7 `/tree-sitter/tree-sitter` — Node.js binding API, parser.parse(), rootNode traversal
- Context7 `/tree-sitter/tree-sitter-typescript` — import_statement, export_statement, class_declaration, method_definition, arrow_function node types; TSX vs TypeScript dialect distinction
- Context7 `/tree-sitter/tree-sitter-python` — function_definition, class_definition, import_from_statement, import_statement, relative_import node types
- Context7 `/tree-sitter/tree-sitter-rust` — use_declaration, mod_item, function_item, struct_item, impl_item, enum_item node types
- Existing project code (`src/db/schema.ts`) — code_chunks table columns already confirmed
- Existing project code (`src/tools/delete-document.ts`) — LanceDB predicate delete pattern
- Existing project code (`src/services/embedder.ts`) — embed() API, SHA-256 via node:crypto already used

### Secondary (MEDIUM confidence)
- [tree-sitter v0.25.1 Node.js docs](https://tree-sitter.github.io/node-tree-sitter/index.html) — confirmed version 0.25.1 is current
- [Bun Node-API docs](https://bun.com/docs/runtime/node-api) — Bun implements 95%+ Node-API; NAPI addons work
- [Bun Glob docs](https://bun.com/docs/runtime/glob) — Bun.Glob.scan() async iterator, fs.promises.glob with exclude option
- WebSearch: grammar package versions (tree-sitter-typescript 0.23.2, tree-sitter-python 0.25.0, tree-sitter-rust 0.24.0) — unverified via official docs but consistent across multiple sources
- [ignore npm package](https://github.com/kaelzhang/node-ignore) — gitignore-spec implementation, used by ESLint/Prettier

### Tertiary (LOW confidence)
- WebSearch: Bun + tree-sitter NAPI compatibility works — consistent with known Bun Node-API support but not directly tested in this project
- WebSearch: `--legacy-peer-deps` may be needed for grammar install — mentioned in community posts, not in official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — tree-sitter grammar packages are well-known but version compatibility with Bun + core 0.25.1 must be confirmed empirically (flagged in STATE.md)
- Architecture: HIGH — mirrors established project patterns; code_chunks schema already in place; LanceDB delete/insert patterns proven across 15 tools
- AST node types: HIGH — verified against official grammar test corpus via Context7
- Pitfalls: MEDIUM-HIGH — most from direct analysis of the implementation; grammar version pitfall is confirmed risk from STATE.md

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (tree-sitter ecosystem is stable; grammar package versions unlikely to change soon)
