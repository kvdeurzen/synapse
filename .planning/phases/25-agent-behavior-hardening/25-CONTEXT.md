# Phase 25: Agent Behavior Hardening - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning
**Source:** Phase 24 E2E Failure Log (40 issues, 28 DEGRADED in scope)

<domain>
## Phase Boundary

This phase fixes agent behavior issues discovered during the Phase 24 E2E run on rpi-camera-py. The RPEV cycle ran end-to-end but produced 28 DEGRADED issues that make the workflow confusing, wasteful, and hard to audit. This phase hardens agent prompts (`.md` files), slash command prompts, and hooks to make the RPEV cycle usable — not just functional.

**In scope:** Agent prompt changes, slash command prompt changes, hook JS fixes. All changes are to prompt text or hook logic — no new MCP tools, no schema changes, no server code.

**Out of scope:** Claude Code platform limitations (#14 MCP JSON display, #9 no side-channel for status), decomposer depth (#18), parallel store_decision cascade (#27).

</domain>

<decisions>
## Implementation Decisions

### Group A: Orchestrator Prompt Hardening (synapse-orchestrator.md)
Issues: #10, #11, #12, #13, #15, #16, #19, #21, #23, #28, #29, #30, #31, #32, #34, #35

- **RPEV stage boundaries (#31):** Orchestrator MUST persist a stage document (rpev-stage-[task_id]) at each Refine→Plan→Execute→Validate transition. Gate check: verify stage document exists before proceeding to next stage.
- **Terse output (#11, #23):** Add output budget rule — orchestrator uses a progress template per dispatch cycle, not free-form narration. Cap at 3 lines per task dispatch, 5 lines per stage transition.
- **Delegate bookkeeping (#12, #21, #28, #29):** Executor marks its own tasks done via update_task. Orchestrator does NOT update individual task status. Parent tasks (features, epics) only marked done after get_task_tree confirms all children done.
- **Git workflow (#15, #16):** Orchestrator creates feature branch before dispatching executors. Executor creates atomic commit per task. Orchestrator verifies commit exists (git log check) before accepting task as done.
- **Task tree integrity (#29, #35):** Before marking any parent done, orchestrator MUST call get_task_tree and verify all children are `done`. Orchestrator calls update_task(is_blocked: false) when dependencies resolve, instead of tracking in its own context.
- **Research step (#19, #34):** Plan stage MUST spawn researcher agent before decomposer. After decomposition, MUST spawn plan_reviewer to verify against stored decisions.
- **Re-index (#30):** After Execute stage completes, orchestrator triggers index_codebase before starting Validate stage.
- **Plan document (#32):** Decomposer stores plan rationale as a document (category: "plan") via store_document.
- **Pool state (#13):** Orchestrator writes pool-state document when dispatching/completing agents.
- **Context clearing (#10):** Orchestrator suggests /clear between major RPEV stages (included in stage transition output).

### Group B: Slash Command Prompt Fixes
Issues: #5, #6, #17, #26, #33, #36

- **status.md (#5, #33):** Add structured output template (markdown table format). Use filtered get_task_tree queries with parent_id parameter. Progressive disclosure: summary first, detail on request.
- **refine.md (#6, #26, #36):** Trust code index — do NOT spawn Explore agent if get_smart_context returns code summaries. Persist refinement summary at phase boundary (before offering to proceed to Plan). Surface UX dimension for decisions that affect developer experience.
- **init.md (#17):** Add commit step after all files created — `git add .synapse/ .claude/ && git commit`.

### Group C: Hook/Infrastructure Fixes
Issues: #37, #38

- **audit-log.js (#37):** Fix agent attribution — extract agent name from Claude Code session context or subagent metadata, not just tool_input.actor. Target: ≥80% correct attribution.
- **Session summary (#38):** Add end-of-cycle aggregation that reads audit log and produces a summary document with per-agent token counts, tool call counts, and total cost estimate.

### Claude's Discretion
- Exact wording of orchestrator prompt instructions
- Progress template format
- Order of implementation across groups
- Whether session summary is a hook or orchestrator responsibility

</decisions>

<specifics>
## Specific Implementation References

### Files to modify:
- `packages/framework/agents/synapse-orchestrator.md` — Group A (16 issues)
- `.claude/commands/synapse/status.md` + `packages/framework/commands/synapse/status.md` — Group B (#5, #33)
- `.claude/commands/synapse/refine.md` + `packages/framework/commands/synapse/refine.md` — Group B (#6, #26, #36)
- `.claude/commands/synapse/init.md` + `packages/framework/commands/synapse/init.md` — Group B (#17)
- `.claude/hooks/audit-log.js` + `packages/framework/hooks/audit-log.js` — Group C (#37)
- New or modified hook for session summary — Group C (#38)

### Key patterns already established:
- Stage documents: `rpev-stage-[task_id]` (Phase 18)
- Agent findings as documents: `{agent}-findings-{task_id}` (Phase 19)
- Pool state: `pool-state-[project_id]` (Phase 21)
- SYNAPSE HANDOFF block format (Phase 19-03)
- Task Start Protocol (Phase 19-03)

### E2E validation reference:
- Full failure log: `.planning/phases/24-e2e-validation/24-FAILURE-LOG.md`
- Terminal log: `.planning/phases/24-e2e-validation/24 Claude Code terminal.log`

</specifics>

<deferred>
## Deferred Ideas

- #9: /synapse:status during execution (architectural — needs side-channel, Claude Code platform limitation)
- #18: Decomposer task granularity (needs deeper decomposer rework, beyond prompt changes)
- #27: Parallel store_decision cascade (Claude Code platform limitation with sibling tool calls)

</deferred>

---

*Phase: 25-agent-behavior-hardening*
*Context gathered: 2026-03-07 from Phase 24 E2E Failure Log*
