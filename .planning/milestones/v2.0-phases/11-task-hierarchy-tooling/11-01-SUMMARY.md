---
phase: 11-task-hierarchy-tooling
plan: 01
subsystem: database
tags: [lancedb, arrow, zod, tasks, hierarchy, cycle-detection, embeddings]

# Dependency graph
requires:
  - phase: 10-decision-tracking-tooling
    provides: "store_decision pattern, RelationshipRowSchema, logActivity, embed interfaces used as template"
provides:
  - TASKS_SCHEMA Arrow schema (19 fields, Bool for is_blocked/is_cancelled, 768-dim nullable vector)
  - TaskRowSchema Zod validation with depth 0-3, status/priority/agent enums, boolean flags
  - task-constants.ts with VALID_TASK_STATUSES, VALID_TASK_PRIORITIES, VALID_DEPTHS, DEPTH_NAMES, VALID_AGENT_ROLES
  - create_task MCP tool with parent validation, DFS cycle detection, embedding, is_blocked auto-computation
  - detectCycles function (exported, 3-color DFS, handles self-loops/direct/transitive cycles)
  - init_project extended to 8 tables (adds tasks with BTree + FTS indexes)
affects:
  - 11-02-update-task (depends on tasks table, TaskRowSchema, detectCycles)
  - 11-03-get-task-tree (depends on root_id denormalization, tasks table)
  - 12-orchestrator-integration (depends on create_task tool being available)

# Tech tracking
tech-stack:
  added: [Bool (apache-arrow), task-constants.ts pattern]
  patterns:
    - Bool fields for boolean task state (is_blocked, is_cancelled) in Arrow schema
    - DFS 3-color cycle detection exported from tool module for unit testing
    - root_id denormalization for O(1) subtree queries (root_id = task_id for epics, inherited for others)
    - Dependency edge direction: from_id = dependent (blocked), to_id = dependency (blocker)
    - INVALID_DEPTH, TASK_NOT_FOUND, DEPENDENCY_NOT_FOUND, CYCLE_DETECTED error codes

key-files:
  created:
    - src/tools/task-constants.ts
    - src/tools/create-task.ts
    - test/tools/create-task.test.ts
  modified:
    - src/db/schema.ts
    - src/tools/init-project.ts
    - src/server.ts
    - test/db/init-project.test.ts
    - test/db/schema.test.ts
    - test/db/delete-project.test.ts
    - test/tools/get-index-status.test.ts
    - test/tools/search-code.test.ts

key-decisions:
  - "Bool type used for is_blocked/is_cancelled Arrow schema fields (not Int32) — LanceDB supports Bool natively"
  - "detectCycles exported from create-task.ts for unit testing — avoids integration-only coverage"
  - "root_id = task_id for epics (depth=0), inherited from parent.root_id for all other depths — enables O(1) subtree queries"
  - "Dependency edge: from_id = dependent task, to_id = blocker task — consistent with graph convention"
  - "New tasks always start with status=pending, no status field accepted at creation time"
  - "Ollama embedding is fail-fast at create_task (not graceful degradation like check_precedent reads)"

patterns-established:
  - "Task constants module (task-constants.ts) follows decision-constants.ts pattern exactly"
  - "detectCycles(existingEdges, proposedEdges) — pure function, fetches existing from DB, merges proposed, runs DFS"
  - "is_blocked recomputation: after inserting dependency rows, fetch deps and update task if any not done/cancelled"

requirements-completed: [TASK-01, TASK-02, TASK-07, TASK-08, TASK-09, TASK-10]

# Metrics
duration: 9min
completed: 2026-03-01
---

# Phase 11 Plan 01: Task Hierarchy Data Model and create_task Tool Summary

**Arrow TASKS_SCHEMA with Bool fields, DFS cycle detection in detectCycles, and create_task MCP tool with parent depth validation, dependency tracking, and is_blocked auto-computation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-01T17:27:56Z
- **Completed:** 2026-03-01T17:36:56Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Established tasks data model: TASKS_SCHEMA (19 fields, Bool for is_blocked/is_cancelled), TaskRowSchema Zod validation, and task-constants.ts with all enums
- Implemented create_task MCP tool with complete parent depth validation, DFS cycle detection, semantic embedding, dependency relationship storage, and is_blocked auto-computation
- Extended init_project from 7 to 8 tables (tasks table with BTree + FTS indexes)
- Server now registers 22 tools (was 21)
- Full test suite: 586 tests pass (was 536 pre-phase-11)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define task constants, Arrow schema with Bool fields, extend init_project** - `577e373` (feat)
2. **Task 1 RED: Failing tests** - (included in pre-commit schema test updates)
3. **Task 2 RED: Failing tests for create_task** - `2d35968` (test)
4. **Task 2 GREEN: Implement create_task + server wiring + auto-fixes** - `e990be2` (feat)

**Plan metadata:** (in final docs commit)

_Note: TDD tasks have RED (failing test) and GREEN (passing implementation) commits_

## Files Created/Modified
- `src/tools/task-constants.ts` - VALID_TASK_STATUSES, VALID_TASK_PRIORITIES, VALID_DEPTHS, DEPTH_NAMES, VALID_AGENT_ROLES
- `src/db/schema.ts` - TASKS_SCHEMA (19 fields with Bool), TaskRowSchema Zod schema, TABLE_NAMES/TABLE_SCHEMAS updated to 8 entries
- `src/tools/init-project.ts` - FTS index on tasks.title, description updated to "8 LanceDB tables"
- `src/tools/create-task.ts` - createTask core, detectCycles (exported), registerCreateTaskTool MCP registration
- `src/server.ts` - registerCreateTaskTool import and registration (22 tools)
- `test/tools/create-task.test.ts` - 26 tests: hierarchy creation, cycle detection unit tests, activity logging, validation errors
- `test/db/init-project.test.ts` - Updated expectations from 7 to 8 tables
- `test/db/schema.test.ts` - Added TASKS_SCHEMA and TaskRowSchema test cases
- `test/db/delete-project.test.ts` - Updated tables_cleaned expectation from 7 to 8
- `test/tools/get-index-status.test.ts` - Updated tool count from 21 to 22
- `test/tools/search-code.test.ts` - Updated tool count from 21 to 22

## Decisions Made
- Bool type used for is_blocked/is_cancelled in TASKS_SCHEMA (LanceDB supports Bool natively; not Int32)
- detectCycles exported from create-task.ts — allows direct unit testing without integration setup
- root_id = task_id for epics (depth=0), inherited from parent.root_id for all others — enables O(1) subtree queries in get_task_tree
- Dependency edge direction: from_id = dependent task (blocked), to_id = dependency task (blocker) — consistent with graph convention
- New tasks always start with status "pending" — no status field accepted at creation time
- Ollama embedding is fail-fast at create_task level (unlike check_precedent which degrades gracefully, because task creation is a write operation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test expectations for 8 tables and 22 tools**
- **Found during:** Task 2 full regression suite run
- **Issue:** delete-project.test.ts expected 7 tables (tables_cleaned=7), get-index-status.test.ts and search-code.test.ts expected tool count 21
- **Fix:** Updated all three test files to reflect new counts: 8 tables, 22 tools
- **Files modified:** test/db/delete-project.test.ts, test/tools/get-index-status.test.ts, test/tools/search-code.test.ts
- **Verification:** `bun test` — 586 pass, 0 fail
- **Committed in:** e990be2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing test expectations for 7 tables/21 tools needed updating for new 8 table/22 tool reality)
**Impact on plan:** Required auto-fix for test correctness. No scope creep.

## Issues Encountered
None — implementation matched plan exactly. The Bool Arrow type worked without issues.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- tasks table exists with correct schema and indexes
- create_task tool registered and tested (22 tools total)
- root_id denormalization ready for get_task_tree O(1) subtree queries (Plan 11-02)
- detectCycles can be reused by update_task when adding new dependency edges
- Plan 11-02 (update_task + get_task_tree) can proceed immediately

---
*Phase: 11-task-hierarchy-tooling*
*Completed: 2026-03-01*
