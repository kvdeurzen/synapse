---
status: complete
phase: 06-code-indexing
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md
started: 2026-02-28T18:00:00Z
updated: 2026-02-28T18:02:00Z
---

## Current Test

[testing complete]

## Tests

### 1. index_codebase Tool Discoverable
expected: The index_codebase tool appears in the MCP server's tool list. When you list available tools (e.g., via tools/list), you should see "index_codebase" as one of the 16 registered tools.
result: pass
verified_by: code inspection — server.ts:86 calls registerIndexCodebaseTool(server, config)

### 2. First-Time Code Indexing
expected: Calling index_codebase with a project_id and root_path pointing to a codebase scans supported files (.ts, .tsx, .py, .rs), extracts symbols (functions, classes, imports), embeds them, and stores code_chunks rows. The response includes stats: files_scanned, files_indexed, chunks_created, edges_created.
result: pass
verified_by: integration test "scans files, creates code_chunks with correct metadata" — verifies all required fields, 768-dim vectors, relative file paths, counter accuracy

### 3. Incremental Indexing Skips Unchanged Files
expected: Running index_codebase a second time on the same codebase (no file changes) returns skipped_unchanged > 0 and files_indexed = 0. Only changed or new files get re-indexed.
result: pass
verified_by: two integration tests — "skips unchanged files on second index" (skipped_unchanged=2, files_indexed=0) and "re-indexes changed file and replaces old chunks" (files_indexed=1, skipped_unchanged=1, old chunks replaced)

### 4. Deleted File Cleanup
expected: After deleting a source file from disk and re-running index_codebase, the response shows files_deleted > 0. The deleted file's code_chunks and import edges are removed from the database.
result: pass
verified_by: integration test "removes code_chunks and ast_import edges for deleted files" — verifies files_deleted=1, zero code_chunks for deleted file, zero ast_import edges from deleted file

### 5. Gitignore and Exclusion Filtering
expected: Files listed in .gitignore (e.g., node_modules/, dist/) are NOT indexed. The scanner respects gitignore rules and default exclusions. Only supported source files outside exclusions appear in the scan.
result: pass
verified_by: scanner tests — "excludes node_modules by default", "respects .gitignore patterns" (secrets/, *.secret.ts filtered), DEFAULT_EXCLUSIONS contains node_modules/, __pycache__/, target/

### 6. Ollama Fail-Fast Check
expected: If Ollama is not running when you call index_codebase, it immediately returns an error indicating Ollama is unreachable — before doing any file scanning or parsing work.
result: pass
verified_by: two integration tests — "throws OllamaUnreachableError when Ollama is unreachable" and "throws OllamaUnreachableError when Ollama model is missing"

### 7. Multi-Language AST Parsing
expected: index_codebase correctly parses TypeScript/TSX, Python, and Rust files. Symbols extracted include functions, classes, interfaces/traits, structs, enums, and imports for each language. Each chunk includes symbol_name, symbol_type, scope_chain, start_line, end_line.
result: pass
verified_by: 27 extractor tests (TS: function/class/interface/enum/type_alias/export/import; Python: function/class/decorated/import; Rust: function/struct/enum/trait/impl/type/const/static/use/mod) + 14 parser tests (TS/TSX/Python/Rust grammar dispatch + caching)

### 8. Import Edge Creation
expected: After indexing, file-to-file dependency edges (ast_import type) are created in the relationships table. For example, if file A imports from file B, an edge from A to B exists. Re-indexing replaces old edges (no duplicates).
result: pass
verified_by: integration test "replaces ast_import edges on re-index" — verifies edges_created > 0, edge count matches DB rows, delete-then-reinsert prevents duplicates; also validated by 28 import-resolver tests covering TS/Python/Rust resolution

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
