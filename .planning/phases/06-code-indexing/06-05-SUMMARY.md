---
phase: 06-code-indexing
plan: 05
subsystem: database
tags: [lancedb, tree-sitter, mcp, fts, code-indexing]

requires:
  - phase: 06-04
    provides: registerIndexCodebaseTool export, indexCodebase orchestrator, CodeChunkRowSchema
  - phase: 06-03
    provides: import-resolver, resolveImports
  - phase: 02-02
    provides: initProject with FTS index pattern, table creation logic

provides:
  - index_codebase tool registered in MCP server (tool 16 of 16)
  - FTS index on code_chunks.content in initProject (Phase 7 prep)
  - Clean TypeScript compilation across entire project
  - All CODE-01 through CODE-10 requirements implemented

affects:
  - 07-code-search (FTS index on code_chunks.content enables fulltext code search)

tech-stack:
  added: []
  patterns:
    - "asLang() cast: bridge tree-sitter grammar Language type incompatibility (language:unknown vs Language recursive) via unknown intermediate cast"
    - "exactOptionalPropertyTypes: build options objects conditionally (if val !== undefined) before passing to typed params"

key-files:
  created: []
  modified:
    - src/server.ts
    - src/tools/init-project.ts
    - src/services/code-indexer/parser.ts
    - src/tools/index-codebase.ts

key-decisions:
  - "Tree-sitter grammar Language type mismatch: grammar packages expose language:unknown vs tree-sitter core Language recursive type — bridged via asLang() cast function through unknown intermediate"
  - "index_codebase registered last in createServer() after registerGetSmartContextTool — maintains existing tool order"
  - "code_chunks FTS index uses stem=false, removeStopWords=false to preserve code identifiers exactly (same rationale as doc_chunks)"

patterns-established:
  - "asLang() cast pattern: use helper function to cast grammar Language to Parser.Language via unknown — documents the type incompatibility clearly without suppressing errors globally"

requirements-completed:
  - CODE-01
  - CODE-02
  - CODE-03
  - CODE-04
  - CODE-05
  - CODE-06
  - CODE-07
  - CODE-08
  - CODE-09
  - CODE-10

duration: 5min
completed: 2026-02-28
---

# Phase 6 Plan 05: Server Wiring and Phase 6 Completion Summary

**index_codebase MCP tool registered as tool 16/16; FTS index on code_chunks.content added for Phase 7 code search; TypeScript type errors in parser.ts and index-codebase.ts fixed; 449 tests pass**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-28T17:42:24Z
- **Completed:** 2026-02-28T17:47:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Registered index_codebase as the 16th MCP tool in createServer() — tool now discoverable via MCP tools/list
- Added FTS index creation on code_chunks.content in initProject inside the tables_created > 0 guard, preparing Phase 7 code search
- Fixed two TypeScript errors blocking `bun tsc --noEmit`: tree-sitter Language type mismatch in parser.ts, and exactOptionalPropertyTypes violation in index-codebase.ts
- All 449 tests pass with 0 regressions; all CODE-01 through CODE-10 requirements fully implemented

## Task Commits

Each task was committed atomically:

1. **Task 1: Add FTS index on code_chunks.content in init_project** - `80496f4` (feat)
2. **Task 2: Register index_codebase tool in server.ts and run full validation** - `cb17fb6` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `/home/kanter/code/project_mcp/src/tools/init-project.ts` - Added FTS index block for code_chunks.content inside tables_created > 0 guard
- `/home/kanter/code/project_mcp/src/server.ts` - Added registerIndexCodebaseTool import and registration (toolCount now 16)
- `/home/kanter/code/project_mcp/src/services/code-indexer/parser.ts` - Added asLang() cast helper to bridge tree-sitter Language type incompatibility
- `/home/kanter/code/project_mcp/src/tools/index-codebase.ts` - Fixed exactOptionalPropertyTypes: build scanOpts conditionally

## Decisions Made

- **Tree-sitter Language cast via asLang():** Grammar packages export `language: unknown` but tree-sitter core expects `language: Language` (recursive). Bridged with `asLang(lang: unknown): Parser.Language` cast helper — documents the mismatch at the site without global suppression
- **exactOptionalPropertyTypes fix:** ScanOptions has `exclude_patterns?: string[]` — Zod-inferred types produce `string[] | undefined`, which doesn't satisfy `exactOptionalPropertyTypes`. Fixed by conditionally building the options object only when values are defined (same pattern as Phase 05-04 fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript errors in parser.ts blocking bun tsc --noEmit**
- **Found during:** Task 2 validation (bun tsc --noEmit step)
- **Issue:** Tree-sitter grammar packages define `Language.language: unknown` but tree-sitter core's `setLanguage()` expects `Parser.Language` which has `language: Language` (recursive). TypeScript reports 4 errors at parser.ts lines 22, 30, 38, 46.
- **Fix:** Added `asLang()` helper function that casts via unknown to Parser.Language. Updated all 4 setLanguage() calls to use asLang().
- **Files modified:** src/services/code-indexer/parser.ts
- **Verification:** bun tsc --noEmit passes clean
- **Committed in:** cb17fb6 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed exactOptionalPropertyTypes violation in index-codebase.ts**
- **Found during:** Task 2 validation (bun tsc --noEmit step)
- **Issue:** Passing `{ exclude_patterns: args.exclude_patterns, include_patterns: args.include_patterns }` (where both can be `string[] | undefined`) to `scanFiles()` which expects `ScanOptions` with `exactOptionalPropertyTypes: true`. Cannot assign `string[] | undefined` to `string[]` in an optional property.
- **Fix:** Build scanOpts object conditionally — only set the property if the value is not undefined.
- **Files modified:** src/tools/index-codebase.ts
- **Verification:** bun tsc --noEmit passes clean; bun test 449 pass
- **Committed in:** cb17fb6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were blocking completion of Task 2 validation. No scope creep — fixes targeted pre-existing type errors in files created by previous plans (06-01 through 06-04) that were only exposed when bun tsc --noEmit was run across the full project.

## Issues Encountered

- `bun tsc --noEmit` revealed two TypeScript type errors in Phase 6 files created by prior plans (06-01, 06-04). Both were classified as Rule 3 blocking issues and fixed inline before committing Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 (Code Indexing) is complete: all CODE-01 through CODE-10 requirements implemented
- Phase 7 (Code Search) can begin immediately: code_chunks table has FTS index, index_codebase tool is registered and callable
- 449 tests passing, TypeScript compiles clean, no regressions

## Self-Check: PASSED

- FOUND: src/server.ts (modified — registerIndexCodebaseTool, 16 toolCount++ calls)
- FOUND: src/tools/init-project.ts (modified — code_chunks FTS index block)
- FOUND: src/services/code-indexer/parser.ts (modified — asLang() cast helper)
- FOUND: src/tools/index-codebase.ts (modified — conditional scanOpts)
- FOUND: .planning/phases/06-code-indexing/06-05-SUMMARY.md (created)
- COMMIT 80496f4: feat(06-05): add FTS index on code_chunks.content in init_project — VERIFIED
- COMMIT cb17fb6: feat(06-05): register index_codebase tool in server.ts; fix TS type errors — VERIFIED
- bun tsc --noEmit: PASSES (0 errors)
- bun test: 449 pass, 0 fail

---
*Phase: 06-code-indexing*
*Completed: 2026-02-28*
