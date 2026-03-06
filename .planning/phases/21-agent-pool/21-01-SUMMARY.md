---
phase: 21-agent-pool
plan: 01
subsystem: framework
tags: [agent-pool, orchestrator, pev-workflow, trust-config, pool-manager]
dependency_graph:
  requires: [20-skills-completion]
  provides: [pool-manager-protocol, pool-config, pool-mediated-dispatch]
  affects: [synapse-orchestrator, pev-workflow, trust-config, synapse-startup]
tech_stack:
  added: []
  patterns: [pool-dispatch-loop, finish-first-policy, token-capture, session-recovery]
key_files:
  created: []
  modified:
    - packages/framework/config/trust.toml
    - packages/framework/hooks/synapse-startup.js
    - packages/framework/agents/synapse-orchestrator.md
    - packages/framework/workflows/pev-workflow.md
    - packages/framework/src/config.ts
    - packages/framework/test/unit/config.test.ts
decisions:
  - "max_pool_slots replaces max_parallel_executors as the canonical pool capacity config key -- covers all agent types (executor, validator, integration-checker), not just executors"
  - "Pool state document uses doc_id pool-state-[project_id] with category plan and tags |pool-state|active| for upsert versioning and status-command query"
  - "Finish-first policy: validator for completed task gets next available slot before any new execution dispatch begins -- scoped to current wave only"
  - "Cross-epic fill reads only features already in EXECUTING stage -- no JIT decomposition triggered to fill empty slots"
  - "Session recovery re-queues orphaned in-flight tasks (previous session slots) via update_task(status: ready) before running dispatch tick"
  - "Token capture uses |tokens_used=N| tag pattern on update_task; regex /\\|tokens_used=(\\d+)\\|/ extracts value for replace-on-retry"
metrics:
  duration: "4 minutes"
  completed: "2026-03-06"
  tasks_completed: 3
  files_modified: 6
---

# Phase 21 Plan 01: Agent Pool Infrastructure Summary

Agent pool infrastructure wired: max_pool_slots config in trust.toml, injection into session context via synapse-startup.js, Pool Manager Protocol added to synapse-orchestrator.md with finish-first dispatch loop and token capture, and pev-workflow.md updated to delegate wave execution to pool dispatch.

## What Was Built

### Task 1: trust.toml + synapse-startup.js pool config

- Replaced `max_parallel_executors = 3` with `max_pool_slots = 3` in `[rpev]` section of trust.toml. The comment clarifies that all agent types share this limit (not just executors).
- Added pool config injection block to synapse-startup.js inside the `if (trustToml && trustToml.rpev)` block. Reads `trustToml.rpev.max_pool_slots ?? 3` and pushes an "## Agent Pool Config" section into `rpevLines`. Appears in orchestrator's session additionalContext.

### Task 2: Pool Manager Protocol in synapse-orchestrator.md

Added a complete "## Pool Manager Protocol" section (inserted between Wave Execution Protocol and Failure Escalation Protocol) covering:

- **Pool State Document**: `doc_id: pool-state-[project_id]`, full JSON schema with slots map (A/B/C), queue array, tokens_by_task map, last_updated
- **Session Start Recovery**: Read pool-state on start, identify orphaned slots, call `update_task(status: "ready")` to re-queue, clear slots, run dispatch tick
- **Priority Algorithm**: 5-priority finish-first dispatch -- pending validators first, then pending integration checks, then highest-priority epic's next task by wave order, then cross-epic fill, then idle check
- **Dispatch Loop Pseudocode**: Concrete pseudocode with slot assignment, agent_type determination (validator/integration-checker/executor), and pool-state write
- **On Task Completion**: Slot identification, token extraction, `|tokens_used=N|` tag update, pool-state write, slot free, dispatch tick
- **Token Usage Storage**: `|tokens_used=N|` tag pattern with replace-on-retry regex
- **Anti-Patterns**: No direct Task calls, no all-in-one-turn wave dispatch, slot letters are indices not task identity, no cross-epic JIT decomposition

Updated Wave Execution Protocol: replaced `rpev.max_parallel_executors` reference with `max_pool_slots`, replaced "Issue all Task calls in one turn" with Pool Manager delegation.

### Task 3: pev-workflow.md pool-mediated dispatch

- Configuration section: `rpev.max_parallel_executors` -> `rpev.max_pool_slots` with updated description
- Wave Identification step 3: references Pool Manager instead of direct cap
- Wave N Processing: replaced 3-step direct Task dispatch with 4-step pool-mediated dispatch including finish-first policy, slot assignment, token capture, and dispatch tick
- Subagent Constraints: added "All Task tool calls are mediated by the Pool Manager" bullet

## Decisions Made

- `max_pool_slots` replaces `max_parallel_executors` as the canonical pool capacity config key. Covers all agent types (executor, validator, integration-checker), not just executors. Rationale: the pool is a shared resource -- naming it after executors was misleading.
- Pool state document `doc_id: pool-state-[project_id]` follows the established `rpev-stage-[task_id]` pattern -- fixed doc_id enables store_document upsert versioning, not duplication.
- Finish-first policy is wave-scoped: validators for completed tasks in the current wave get priority over starting new task execution. After all current-wave validations pass, the next wave begins.
- Cross-epic fill is read-only: only pulls tasks from features already in EXECUTING stage. Does not trigger JIT decomposition to fill slots -- prevents priority inversion where lower-priority epics' decomposition work runs before higher-priority execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript config.ts schema out of sync with renamed config key**
- **Found during:** Overall verification (grep for max_parallel_executors)
- **Issue:** `TrustConfigSchema` in `packages/framework/src/config.ts` still defined `pev.max_parallel_executors` as the field name. The `config.test.ts` tests validated and expected this old name. With the rename to `max_pool_slots` in trust.toml, the schema and tests were incorrect.
- **Fix:** Updated `TrustConfigSchema` to use `max_pool_slots` in both the `.object()` definition and the `.default()` fallback. Updated all 4 test references in `config.test.ts` (2 TOML fixture usages, 2 `expect` assertions, 1 test name).
- **Files modified:** `packages/framework/src/config.ts`, `packages/framework/test/unit/config.test.ts`
- **Commit:** 8ad5689
- **Verification:** All 26 config tests pass (`bun test test/unit/config.test.ts` -- 26 pass, 0 fail)

## Self-Check: PASSED

All files found on disk. All 4 task commits found in git log.

| Check | Result |
|-------|--------|
| packages/framework/config/trust.toml | FOUND |
| packages/framework/hooks/synapse-startup.js | FOUND |
| packages/framework/agents/synapse-orchestrator.md | FOUND |
| packages/framework/workflows/pev-workflow.md | FOUND |
| packages/framework/src/config.ts | FOUND |
| packages/framework/test/unit/config.test.ts | FOUND |
| .planning/phases/21-agent-pool/21-01-SUMMARY.md | FOUND |
| commit 307ecbe (Task 1) | FOUND |
| commit e7e8691 (Task 2) | FOUND |
| commit 2dedcee (Task 3) | FOUND |
| commit 8ad5689 (Deviation fix) | FOUND |
