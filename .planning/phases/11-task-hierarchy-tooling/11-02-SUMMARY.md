---
phase: 11-task-hierarchy-tooling
plan: "02"
subsystem: task-management
tags: [lancedb, bfs, rollup-stats, dependency-graph, cycle-detection, embedding, tdd]

# Dependency graph
requires:
  - phase: 11-task-hierarchy-tooling-plan-01
    provides: create_task tool, task schema, task-constants, detectCycles exported function
provides:
  - update_task MCP tool with selective re-embedding, cycle-safe dependency replacement, is_blocked propagation
  - get_task_tree MCP tool with BFS traversal, rollup stats, truncation, filter support
  - 24 total MCP tools registered in server.ts (Phase 11 complete)
affects: [12-orchestrator-integration, 14-pev-wave-controller]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LanceDB table handles are snapshot-based: always open fresh connections after writes from different connections"
    - "Two-pass tree assembly: pass 1 = BFS with caps, pass 2 = DFS post-order rollup computation"
    - "Dependency cycle detection using what-if graph: project edges MINUS current task edges PLUS proposed edges"
    - "Subtree fetch via root_id denormalization: fetch entire epic subtree, prune to requested root in JS"

key-files:
  created:
    - src/tools/update-task.ts
    - src/tools/get-task-tree.ts
    - test/tools/update-task.test.ts
    - test/tools/get-task-tree.test.ts
  modified:
    - src/server.ts
    - test/tools/get-index-status.test.ts
    - test/tools/search-code.test.ts

key-decisions:
  - "LanceDB table handles are snapshot-based: reads from a table opened before a write (from another connection) return stale data — fix by opening fresh connections after writes"
  - "get_task_tree fetches entire epic subtree (via root_id) then prunes to requested subtree in JS — single-query approach works for epics, non-epics need the full epic fetch"
  - "children_all_done = false for leaf nodes (vacuously false — no children to be all done); true only when ALL direct children have status done"
  - "Dependency replacement uses what-if graph approach: fetch all project edges, subtract old task edges, add proposed edges, run detectCycles — no partial state written on cycle"

patterns-established:
  - "Open fresh LanceDB connections for post-update reads (snapshot isolation gotcha)"
  - "Export recomputeIsBlocked and recomputeDependentsIsBlocked from update-task.ts for reuse in future tools"
  - "Two-pass tree: BFS for structure + caps, then DFS post-order for rollup stats"

requirements-completed: [TASK-03, TASK-04, TASK-05, TASK-06]

# Metrics
duration: 13min
completed: 2026-03-01
---

# Phase 11 Plan 02: update_task + get_task_tree Summary

**update_task with selective re-embedding and is_blocked cascade, get_task_tree with BFS assembly and rollup stats — all 24 MCP tools registered**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-01T17:40:19Z
- **Completed:** 2026-03-01T17:53:38Z
- **Tasks:** 2 (TDD, each with RED + GREEN phases)
- **Files modified:** 7

## Accomplishments
- update_task: selective re-embedding (only on title/description change), full dependency replacement with cycle detection via what-if graph approach, is_blocked propagation to direct dependents on status=done or is_cancelled=true, TASK_NOT_FOUND and INVALID_TRANSITION error handling, activity logging
- get_task_tree: BFS tree assembly from root_id denormalization, post-order rollup stats (total_descendants, done_count, blocked_count, in_progress_count, children_all_done, completion_percentage), max_depth and max_tasks caps with truncation indicators, filter support with collapsed nodes
- 24 total MCP tools registered in server.ts — Phase 11 complete (task hierarchy toolset)
- 612 tests passing across 37 files (26 new tests from this plan)

## Task Commits

Each task was committed atomically (TDD pattern: RED then GREEN):

1. **Task 1 RED: update_task failing tests** - `0d56bf9` (test)
2. **Task 1 GREEN: update_task implementation** - `6cf67f2` (feat)
3. **Task 2 RED: get_task_tree failing tests** - `1266afd` (test)
4. **Task 2 GREEN: get_task_tree + server wiring** - `b1ecb82` (feat)

**Plan metadata:** (this commit - docs)

_Note: TDD tasks have RED + GREEN commits each_

## Files Created/Modified
- `src/tools/update-task.ts` - update_task core logic, recomputeIsBlocked, recomputeDependentsIsBlocked, MCP registration
- `src/tools/get-task-tree.ts` - getTaskTree BFS assembly, rollup stats, filter support, MCP registration
- `test/tools/update-task.test.ts` - 13 TDD tests for update_task
- `test/tools/get-task-tree.test.ts` - 13 TDD tests for get_task_tree
- `src/server.ts` - Added registerUpdateTaskTool (tool 23) and registerGetTaskTreeTool (tool 24)
- `test/tools/get-index-status.test.ts` - Updated tool count assertion (22->24)
- `test/tools/search-code.test.ts` - Updated tool count assertion (22->24)

## Decisions Made
- LanceDB table handles are snapshot-based: reads from a table opened before a write (from another connection) return stale data. Tests must open fresh `lancedb.connect()` after `updateTask()` to see current values. This is normal LanceDB behavior, not a bug.
- get_task_tree uses a two-step fetch: first get the root task to find its epic `root_id`, then fetch all tasks WHERE `(root_id = epicRootId OR task_id = epicRootId)`. The plan's single-query approach `(root_id = rootId OR task_id = rootId)` only works for epics since non-epics have `root_id = epicId`.
- Dependency replacement uses a what-if graph: fetch all project edges, subtract current task's edges, add proposed edges, run detectCycles. If cycle detected, no writes happen. If no cycle, delete old edges then insert new.
- children_all_done semantics: false for leaf nodes (no children to be "all done"), true only when ALL direct children have status "done" regardless of grandchild status.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale LanceDB table reads in tests**
- **Found during:** Task 1 (update_task TDD GREEN phase)
- **Issue:** Two tests ("re-embeds when title changes", "sets updated_at on every update") opened a LanceDB table reference before calling `updateTask()`, then re-read from the same reference after. Since `updateTask()` opens its own connection, the original table reference held a stale snapshot.
- **Fix:** Updated tests to open fresh `lancedb.connect()` calls after the update operation to read current state.
- **Files modified:** test/tools/update-task.test.ts
- **Verification:** Both tests passed after fix; LanceDB snapshot behavior confirmed via debug test
- **Committed in:** 6cf67f2 (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Fixed get_task_tree subtree fetch for non-epic roots**
- **Found during:** Task 2 (get_task_tree TDD GREEN phase)
- **Issue:** Plan's single-query `WHERE (root_id = rootTaskId OR task_id = rootTaskId)` assumes `root_id` can be set to a feature/component level task. But schema stores `root_id` as the epic (depth=0) for all tasks. Querying `root_id = featureF1` returned only the feature itself, no descendants.
- **Fix:** Two-step approach: (1) fetch root task to get its `epicRootId`, (2) fetch all tasks `WHERE (root_id = epicRootId OR task_id = epicRootId)`. BFS then prunes to the requested subtree.
- **Files modified:** src/tools/get-task-tree.ts
- **Verification:** "returns sub-tree rooted at feature" test passed; all 13 get_task_tree tests pass.
- **Committed in:** b1ecb82 (Task 2 GREEN commit)

**3. [Rule 1 - Bug] Updated tool count assertions from 22 to 24**
- **Found during:** Task 2 (full test suite run after server.ts update)
- **Issue:** Two pre-existing tests (get-index-status.test.ts, search-code.test.ts) asserted `toolCount === 22` which was correct after Plan 01 (create_task). Adding update_task and get_task_tree raised the count to 24.
- **Fix:** Updated both assertions to `expect(toolCount).toBe(24)` with updated descriptions.
- **Files modified:** test/tools/get-index-status.test.ts, test/tools/search-code.test.ts
- **Verification:** Full test suite passes with 612 tests.
- **Committed in:** b1ecb82 (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 1 stale test assertion)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. LanceDB snapshot behavior and root_id schema constraints not anticipated in plan, fixed at implementation time.

## Issues Encountered
- LanceDB table snapshot isolation required reading back state via fresh connections in tests. Documented as pattern for future phases.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 11 complete: create_task + update_task + get_task_tree all registered (24 total tools)
- requirements TASK-01 through TASK-10 complete
- Ready for Phase 12 (Orchestrator Integration) — task hierarchy data layer is complete
- children_all_done signal ready for Phase 14's PEV wave controller

## Self-Check: PASSED

All created files verified:
- FOUND: src/tools/update-task.ts
- FOUND: src/tools/get-task-tree.ts
- FOUND: test/tools/update-task.test.ts
- FOUND: test/tools/get-task-tree.test.ts
- FOUND: 11-02-SUMMARY.md

All commits verified:
- FOUND: 0d56bf9 (update_task RED)
- FOUND: 6cf67f2 (update_task GREEN)
- FOUND: 1266afd (get_task_tree RED)
- FOUND: b1ecb82 (get_task_tree GREEN)

Server: 24 toolCount++ registrations confirmed.

---
*Phase: 11-task-hierarchy-tooling*
*Completed: 2026-03-01*
