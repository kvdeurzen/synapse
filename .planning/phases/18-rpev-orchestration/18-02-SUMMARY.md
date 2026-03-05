---
phase: 18-rpev-orchestration
plan: "02"
subsystem: orchestration
tags: [rpev, workflow, agent, orchestrator, stage-documents, involvement-matrix]

requires:
  - phase: 18-rpev-orchestration-01
    provides: trust.toml expansion with [rpev.involvement] matrix and startup hook RPEV injection

provides:
  - RPEV workflow spec (pev-workflow.md) with Stage Document Schema, Involvement Resolution algorithm, Phase 0 (Refine), and involvement matrix enforcement at all decision points
  - synapse-orchestrator.md updated for RPEV: Involvement Matrix section replacing Approval Tiers, Stage Document Management, Subagent Handoff Protocol, RPEV-aware session startup

affects:
  - 18-rpev-orchestration (plans 03)
  - 19-agent-prompt-quality
  - 21-agent-pool
  - refine.md (bridge from refine completion to stage document creation)
  - status.md (queries stage documents for pending_approval items)
  - focus.md (two-tier approval UX using proposal_doc_id from stage document)

tech-stack:
  added: []
  patterns:
    - "Stage document pattern: fixed doc_id rpev-stage-[task_id] enables store_document upsert/versioning without duplicate documents"
    - "Involvement resolution: strictest mode wins (drives > co-pilot > reviews > monitors > autopilot) including domain overrides"
    - "Subagent handoff: every Task call includes project_id, task_id, rpev_stage_doc_id — subagents do not inherit session context"

key-files:
  created: []
  modified:
    - packages/framework/workflows/pev-workflow.md
    - packages/framework/agents/synapse-orchestrator.md

key-decisions:
  - "pev-workflow.md kept its filename for backward compatibility — content fully transitions from PEV to RPEV"
  - "Stage document schema uses fixed doc_id (rpev-stage-[task_id]) not ULID — enables in-place versioning via store_document upsert"
  - "Involvement mode resolution always checks domain overrides and takes strictest (highest user involvement) — domain override silence bug prevention"
  - "Subagent Handoff Protocol in orchestrator is the authoritative pattern — every Task call must include project_id, task_id, rpev_stage_doc_id"
  - "mcp__synapse__store_document, mcp__synapse__link_documents, mcp__synapse__query_documents added to orchestrator frontmatter tools list"

patterns-established:
  - "Pattern: RPEV stage document — single source of truth per item, fixed doc_id, pending_approval flag for /synapse:status queries"
  - "Pattern: Involvement matrix enforcement — resolve mode at every stage transition, not once at session start"
  - "Pattern: Failure flag via stage document — notes + pending_approval=true surfaces failures in /synapse:status without proactive interruption"

requirements-completed: [RPEV-01, RPEV-03, RPEV-04, RPEV-05, RPEV-08]

duration: 4min
completed: 2026-03-05
---

# Phase 18 Plan 02: RPEV Orchestration Engine Summary

**RPEV workflow spec and orchestrator updated with stage document tracking, 16-cell involvement matrix enforcement, and subagent handoff protocol — full Refine-Plan-Execute-Validate engine now documented**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T15:51:29Z
- **Completed:** 2026-03-05T15:55:45Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Rewrote `pev-workflow.md` as the authoritative RPEV workflow: added Stage Document Schema (canonical rpev-stage-[task_id] pattern with concrete `store_document` example), Involvement Resolution algorithm (5-mode with domain overrides and strictness ordering), Phase 0 (Refine) as the bridge from refine completion to plan stage, and involvement matrix checks replacing approval_threshold at all decision points
- Updated `synapse-orchestrator.md` to fully implement RPEV: added 3 new MCP tools (store_document, link_documents, query_documents) to frontmatter, replaced Approval Tiers with Involvement Matrix section, added Stage Document Management and Subagent Handoff Protocol sections, updated Session Startup Protocol to query stage documents, and added RPEV stage updates at each wave transition
- Established the stage document as the single source of truth for RPEV state: fixed doc_id pattern prevents duplicates, pending_approval flag is the query key for /synapse:status, proposal_doc_id enables /synapse:focus to load proposals without re-fetching task tree

## Task Commits

Each task was committed atomically:

1. **Task 1: Update pev-workflow.md to RPEV workflow with stage documents** - `1042775` (feat)
2. **Task 2: Update synapse-orchestrator.md for RPEV flow** - `adad45f` (feat)

## Files Created/Modified

- `packages/framework/workflows/pev-workflow.md` - Full rewrite: PEV → RPEV with Stage Document Schema, Involvement Resolution, Phase 0 (Refine), updated Phase 1 trigger, involvement matrix enforcement throughout, failure escalation with status flags, stage document queries for session resume
- `packages/framework/agents/synapse-orchestrator.md` - RPEV update: new tools in frontmatter, Involvement Matrix section, Stage Document Management, Subagent Handoff Protocol, RPEV-aware session startup, failure escalation with auto-escalation ladder

## Decisions Made

- **File renaming deferred**: `pev-workflow.md` kept its filename for backward compatibility. The content fully transitions from PEV to RPEV but the orchestrator reference path remains unchanged.
- **Stage document schema locked**: `doc_id: rpev-stage-[task_id]` (fixed, never ULID) is canonical. This enables `store_document` to upsert in-place, creating versions not duplicates. This is the same proven pattern as refinement state documents in `refine.md`.
- **Involvement mode strictness ordering**: `drives(5) > co-pilot(4) > reviews(3) > monitors(2) > autopilot(1)` — domain overrides always take the strictest (most user involvement) between base and override. Prevents silent domain override failures.
- **Subagent context handoff**: Every Task call must include `project_id`, `task_id`, `rpev_stage_doc_id` — subagents do NOT inherit session context. This is documented as a protocol (not optional guidance) to prevent "project not found" failures.

## Deviations from Plan

None — plan executed exactly as written. Both files were fully rewritten per the detailed action specifications.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- RPEV workflow engine is fully documented — pev-workflow.md and synapse-orchestrator.md are ready for plan 03 (refine.md bridge update and trust.toml expansion)
- Stage document schema is the foundation for status.md (pending_approval queries) and focus.md (two-tier approval UX using proposal_doc_id) — both depend on this spec
- Subagent handoff protocol is established and referenced by orchestrator — specialist agent updates (plans in waves 2+) can reference this pattern

---
*Phase: 18-rpev-orchestration*
*Completed: 2026-03-05*
