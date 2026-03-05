---
phase: 18-rpev-orchestration
plan: 03
subsystem: orchestration
tags: [rpev, stage-documents, approval-ux, agent-permissions, commands]

# Dependency graph
requires:
  - phase: 18-02
    provides: RPEV workflow definition, stage document schema, synapse-orchestrator.md with store_document/link_documents/query_documents
provides:
  - /synapse:refine creates rpev-stage documents on readiness confirmation (bridges to orchestrator)
  - /synapse:status queries stage documents and surfaces pending approvals and failures
  - /synapse:focus two-tier approval UX: summary-first triage + discuss-deeper conversational review
  - agents.toml: store_document and link_documents granted to plan-reviewer, integration-checker, executor, validator
affects: [19-agent-pool, 21-specialist-agents, focus-command, refine-command, status-command]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rpev-stage-[task_id] doc_id pattern enables store_document upsert versioning"
    - "pending_approval flag in stage documents is the query key for /synapse:status"
    - "Two-tier approval UX: summary-first (Tier 1) + full conversational review (Tier 2)"

key-files:
  created: []
  modified:
    - packages/framework/commands/synapse/refine.md
    - packages/framework/commands/synapse/status.md
    - packages/framework/commands/synapse/focus.md
    - packages/framework/config/agents.toml

key-decisions:
  - "Two-tier approval UX in /synapse:focus: summary-first (Tier 1) for quick triage, discuss-deeper (Tier 2) for conversational review — mirrors how users actually evaluate plans"
  - "Stage document is more authoritative than task tree status for RPEV stage display in /synapse:status — avoids stale status mismatch"
  - "store_document and link_documents added to 4 specialist agents (plan-reviewer, integration-checker, executor, validator) as prep for Phase 19 AGENT-05/06/07 — no behavior change yet, only expanded permissions"

patterns-established:
  - "Stage document query pattern: query_documents with category=plan, tags=rpev-stage, parse JSON content for pending_approval"
  - "Approval UX pattern: always show summary-first, offer discuss-deeper as opt-in — never require full proposal read for simple approval"

requirements-completed: [RPEV-01, RPEV-06, RPEV-07]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 18 Plan 03: User-Facing RPEV Surface Summary

**RPEV stage documents wired to user commands: refine creates, status queries, focus provides two-tier approval UX (summary triage + conversational deep-dive)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-05T15:59:46Z
- **Completed:** 2026-03-05T16:02:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- /synapse:refine now creates `rpev-stage-[task_id]` documents with stage=PLANNING when readiness is confirmed, replacing the Phase 16 stub message with real RPEV integration
- /synapse:status queries stage documents for pending approvals and failures (more authoritative than task tree status), and the "Needs Your Input" section now shows involvement mode and stage doc notes
- /synapse:focus implements two-tier approval UX: Tier 1 (summary + Approve/Reject/Discuss options) and Tier 2 (full conversational review after loading proposal), plus structured failure options for exhausted-retry items
- agents.toml grants store_document and link_documents to plan-reviewer, integration-checker, executor, and validator as Phase 19 prep

## Task Commits

Each task was committed atomically:

1. **Task 1: Bridge /synapse:refine to RPEV stage documents** - `26cce4f` (feat)
2. **Task 2: Update /synapse:status and /synapse:focus for stage document integration + agents.toml** - `ca37ae5` (feat)

## Files Created/Modified
- `packages/framework/commands/synapse/refine.md` - Added query_documents to allowed-tools; step 1 checks for existing stage docs; step 7 adds involvement matrix note; step 9 replaced with RPEV stage document creation (store_document with rpev-stage-[task_id])
- `packages/framework/commands/synapse/status.md` - Added query_documents to allowed-tools; step 4 replaced with full RPEV stage document query; Needs Your Input section shows pending_approval items and failure flags; epic stage badges use stage doc data
- `packages/framework/commands/synapse/focus.md` - Added query_documents and update_task to allowed-tools; new step 7 implements two-tier approval UX with Approve/Reject/Discuss-deeper options and failure-mode diagnostic + structured recovery options
- `packages/framework/config/agents.toml` - store_document and link_documents added to plan-reviewer, integration-checker, executor, validator

## Decisions Made
- Two-tier approval UX in /synapse:focus: Tier 1 (summary-first, quick triage) followed by optional Tier 2 (full conversational review) — mirrors how users naturally evaluate proposals; avoids forcing full-document read for clear approvals
- Stage document is treated as more authoritative than task tree for RPEV stage display in /synapse:status — prevents stale status badges when task tree hasn't been updated by orchestrator yet
- store_document/link_documents granted to 4 specialist agents now (ahead of use) to avoid permission errors when Phase 19 AGENT-05/06/07 work begins

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 18 complete: RPEV involvement matrix (18-01), orchestrator workflow engine (18-02), and user-facing surface (18-03) are all in place
- The full RPEV loop is now defined: refine → stage doc created → orchestrator picks up → specialist agents run → focus shows approval UX → approval updates stage doc
- Phase 19 (Agent Pool) can proceed: specialist agents (plan-reviewer, integration-checker, executor, validator) already have the document-storage permissions they will need

---
*Phase: 18-rpev-orchestration*
*Completed: 2026-03-05*
