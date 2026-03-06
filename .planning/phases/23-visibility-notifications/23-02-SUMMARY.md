---
phase: 23-visibility-notifications
plan: "02"
subsystem: server-tools, framework-commands
tags: [project-overview, task-progress, pool-status, needs-attention, rpev, dashboard]
dependency_graph:
  requires: []
  provides: [enhanced-project-overview, needs-attention-dashboard]
  affects: [project-overview-tool, status-command]
tech_stack:
  added: []
  patterns: [tdd, getTaskTree-composition, document-tag-query]
key_files:
  created: []
  modified:
    - packages/server/src/tools/project-overview.ts
    - packages/server/test/tools/project-overview.test.ts
    - packages/framework/commands/synapse/status.md
decisions:
  - "project_overview composes getTaskTree per epic internally — callers no longer need separate get_task_tree calls for epic-level rollup stats"
  - "needs_attention always initialized when task_progress exists (even if both arrays empty) — callers can safely access without null check"
  - "rpev_stage_counts only added to epic entry when at least one child task has a stage doc — avoids empty objects"
  - "Pool slots array preserves all slot letters (including null/idle) so UI can render all N slots consistently"
metrics:
  duration: 6min
  completed_date: "2026-03-06"
  tasks_completed: 2
  files_modified: 3
---

# Phase 23 Plan 02: Enhanced project_overview Dashboard Summary

Single `project_overview` call now returns per-epic task tree progress, RPEV stage counts, agent pool status, and needs-attention items — replacing the previous multi-call pattern for /synapse:status.

## What Was Built

### Task 1: Enhanced project_overview with task_progress, pool_status, needs_attention

Extended `packages/server/src/tools/project-overview.ts` with three new optional sections:

**task_progress**: Queries all depth=0 tasks (epics), calls `getTaskTree` per epic to get rollup stats, then matches RPEV stage documents to populate `rpev_stage` per epic and `rpev_stage_counts` for child tasks.

**pool_status**: Reads the `|pool-state|` tagged document and maps its JSON content to a normalized structure with `active_slots`, `total_slots`, `queued_count`, and a `slots` array (one entry per slot letter).

**needs_attention**: Built from RPEV stage documents — `approval_needed` array (pending_approval=true) and `failed` array (notes matching `/retries? exhausted|failed|needs guidance/i`).

All new fields are `undefined` when data is absent (backward compatible).

### Task 2: Updated /synapse:status

Rewrote `packages/framework/commands/synapse/status.md` to:
- Consume `project_overview.task_progress`, `pool_status`, and `needs_attention` directly
- Render a **"Needs Your Attention"** section with `[APPROVE]` and `[FAILED]` text badges before the Epics list
- Show inline blocked counts on epic lines: `(65% complete -- 2 blocked)`
- Pool section reads from `project_overview.pool_status` instead of a separate `query_documents` call
- `get_task_tree` kept in `allowed-tools` for feature-level detail within each epic

## Tests

32 tests in `packages/server/test/tools/project-overview.test.ts` — all pass.

New test groups added:
- `task_progress`: epics array, required fields, rollup with children, rpev_stage from stage docs, rpev_stage_counts
- `pool_status`: populated from pool-state doc, undefined when absent
- `needs_attention`: empty arrays when no issues, approval_needed with pending_approval=true, failed with failure notes
- backward compatibility: all original fields still returned with tasks present

Full server test suite: 638 tests, 0 failures.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Verified files exist:
- `packages/server/src/tools/project-overview.ts` — FOUND
- `packages/server/test/tools/project-overview.test.ts` — FOUND
- `packages/framework/commands/synapse/status.md` — FOUND

Verified commits:
- `cfe519b` — test(23-02): add failing tests (TDD RED)
- `1161ab0` — feat(23-02): enhance project_overview (TDD GREEN)
- `5ad9120` — feat(23-02): update /synapse:status

## Self-Check: PASSED
