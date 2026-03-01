---
phase: 07-code-search-and-integration-validation
plan: 02
subsystem: code-search
tags: [lancedb, mcp-tools, typescript, code-indexing, cross-table-search]

requires:
  - phase: 07-01
    provides: search_code tool with semantic/fulltext/hybrid modes; code_chunks table structure

provides:
  - get_index_status MCP tool: total_files, total_chunks, last_index_at, per-language breakdown, stale_files
  - Extended get_smart_context with source_types (documents/code/both) and bias parameters
  - Unified cross-table overview mode: documents + code_chunks in a single ranked response
  - Detailed mode unified ID resolution: chunk_ids resolved from code_chunks table alongside doc_ids
  - OverviewCodeItem type: symbol signature + first comment summary format for code items
  - OverviewResult extended with code_items, total_matches, docs_returned, code_returned, truncated, tokens_used metadata

affects:
  - Any agent workflow using get_smart_context (now returns both documents and code by default)
  - Agents monitoring indexing status

tech-stack:
  added: []
  patterns:
    - "Per-language file/chunk breakdown via Set deduplication on file_path"
    - "Staleness check via SHA-256 hash comparison: stored hash vs current disk content"
    - "null vs 0 for stale_files: null means 'not checked', 0 means 'checked, none stale'"
    - "Bias weighting for merged relevance ranking: higher bias = higher weighted score"
    - "Graceful degradation on code_chunks table absence (try/catch in unified overview)"
    - "Unified ID resolution: documents-first fallback to code_chunks for unmatched IDs"

key-files:
  created:
    - src/tools/get-index-status.ts
    - test/tools/get-index-status.test.ts
  modified:
    - src/tools/get-smart-context.ts
    - src/server.ts
    - test/tools/get-smart-context.test.ts
    - test/tools/search-code.test.ts

key-decisions:
  - "stale_files returns null (not 0) when project_root not provided — null means unchecked, 0 means checked and fresh"
  - "source_types defaults to 'both' — get_smart_context queries both documents and code_chunks by default"
  - "bias parameter weights relevance before merging: doc_score = baseScore * (1+bias), code_score = baseScore * (1+(1-bias))"
  - "Token budget filled by merged relevance ranking regardless of source type (CONTEXT.md locked decision)"
  - "Detailed mode unified ID list: try documents first, then code_chunks for unmatched IDs (Pitfall 5 pattern)"
  - "Tool count is now 18 after get_index_status registration"

requirements-completed: [CSRCH-04]

duration: 9min
completed: 2026-03-01
---

# Phase 7 Plan 02: Code Search and Integration Validation Summary

**get_index_status tool with SHA-256 staleness detection and get_smart_context unified cross-table overview returning documents + code_chunks with bias-weighted relevance merging**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-01T05:14:03Z
- **Completed:** 2026-03-01T05:23:00Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments

- Implemented `get_index_status` MCP tool returning total_files, total_chunks, last_index_at, per-language breakdown (file_count + chunk_count per language), and stale_files (null when project_root not provided, count of changed/deleted files when provided)
- Extended `get_smart_context` overview mode to query both documents and code_chunks tables, merging candidates by bias-weighted relevance scores and filling token budget from merged ranking
- Extended `get_smart_context` detailed mode to resolve unified ID list (chunk_ids from code_chunks alongside doc_ids from documents)
- Server now registers 18 tools total

## Task Commits

Each task was committed atomically:

1. **Task 1: get_index_status tool with staleness detection** - `fd8c673` (feat)
2. **Task 2: Extended get_smart_context with code_chunks support** - `f5011db` (feat)

## Files Created/Modified

- `/home/kanter/code/project_mcp/src/tools/get-index-status.ts` - New tool: getIndexStatus core function + registerGetIndexStatusTool MCP wrapper
- `/home/kanter/code/project_mcp/test/tools/get-index-status.test.ts` - 9 tests: empty project, per-language breakdown, stale_files null behavior, staleness detection, deleted file counting, server registration
- `/home/kanter/code/project_mcp/src/tools/get-smart-context.ts` - Extended: OverviewCodeItem type, source_types/bias Zod params, unified overview mode, unified ID resolution in detailed mode, extended OverviewResult
- `/home/kanter/code/project_mcp/src/server.ts` - Added registerGetIndexStatusTool import and registration (tool count 18)
- `/home/kanter/code/project_mcp/test/tools/get-smart-context.test.ts` - 10 new tests for source_types, bias, metadata fields, code chunk resolution; 2 source assertion updates
- `/home/kanter/code/project_mcp/test/tools/search-code.test.ts` - Updated tool count assertion from 17 to 18

## Decisions Made

- `stale_files` returns `null` (not 0) when `project_root` not provided — avoids misleading "no stale files" when we simply haven't checked
- `source_types` defaults to `"both"` — unified behavior by default, backward-compatible via optional `source_types: "documents"` for old behavior
- Bias parameter applies as: `doc_weightedScore = baseScore * (1 + bias)` and `code_weightedScore = baseScore * (1 + (1-bias))`, so bias=1.0 maximally favors documents, bias=0.0 maximally favors code
- Detailed mode uses "documents first, then code_chunks for misses" pattern — zero overhead when all IDs are documents

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated source field assertion in two existing tests**
- **Found during:** Task 2 (extending get_smart_context)
- **Issue:** Two existing tests checked `result.source === "document"` but the new default source_types="both" returns source="both"
- **Fix:** Updated assertions to accept either "document" or "both" (both are valid under the extended type)
- **Files modified:** test/tools/get-smart-context.test.ts
- **Verification:** 21 existing tests still pass
- **Committed in:** f5011db (Task 2 commit)

**2. [Rule 1 - Bug] Updated tool count assertion in search-code.test.ts**
- **Found during:** Task 2 (full test suite run)
- **Issue:** search-code.test.ts checked toolCount === 17 but new get_index_status registration makes it 18
- **Fix:** Updated assertion to expect 18 tools
- **Files modified:** test/tools/search-code.test.ts
- **Verification:** Full test suite passes (488/488)
- **Committed in:** f5011db (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - test assertion updates for legitimate behavior changes)
**Impact on plan:** Both fixes were necessary to maintain test correctness after intentional behavior changes. No scope creep.

## Issues Encountered

None - plan executed without significant issues. TypeScript compiled cleanly throughout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 7 plans complete (07-01 and 07-02) — CSRCH-01 through CSRCH-04 done
- v1.0 milestone complete: 18 MCP tools registered, 488 tests passing
- Project is ready for v1 release: MCP foundation, database schema, embedding service, document management, document search, code indexing, and code search all implemented

---
*Phase: 07-code-search-and-integration-validation*
*Completed: 2026-03-01*

## Self-Check: PASSED

All created files exist and all task commits verified:
- FOUND: src/tools/get-index-status.ts
- FOUND: src/tools/get-smart-context.ts (modified)
- FOUND: src/server.ts (modified)
- FOUND: test/tools/get-index-status.test.ts
- FOUND: .planning/phases/07-code-search-and-integration-validation/07-02-SUMMARY.md
- FOUND: commit fd8c673 (Task 1 - get_index_status)
- FOUND: commit f5011db (Task 2 - extended get_smart_context)
