# Phase 18: RPEV Orchestration - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The recursive RPEV engine drives work forward — Refine completion triggers Plan, Plan triggers Execute via work queue, Validate reports results. Trust config controls user involvement at each level. This phase implements the orchestration logic: readiness gating, stage transitions, trust config expansion, and decision persistence. The agent pool (dispatch/auto-assignment) and visibility (statusline/notifications) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Stage Transition Model
- Refine completion marks items as "ready for plan" in the task tree status — minimal stub, no separate queue structure
- The actual work queue and agent pool dispatch is Phase 21's scope
- Until Phase 21 lands, queued items appear in `/synapse:status` but require manual triggering
- At levels below `explicit_gate_levels`, transitions happen automatically with a brief notification ("notify then proceed")
- At Project/Epic level, user explicitly signals readiness (carried forward from Phase 16)

### RPEV Stage Tracking
- Stage tracked via **document-based tracking** — store RPEV stage as a Synapse document (via `store_document`) linked to the task
- No new field on the task schema — keeps task schema clean
- Orchestrator stores/updates a stage document per item, queryable via `get_smart_context`

### Approval Interaction
- Items needing approval appear in `/synapse:status` as "needs approval"
- User navigates via `/synapse:focus` to see the proposal — fits the "user unblocks" model
- **Two-tier approval UX**: summary + approve/reject/discuss by default. An explicit "Let's discuss this deeper" option switches to conversational review mode for complex decisions
- Rejection + feedback goes back to the specialist agent (Decomposer/Planner) for a new attempt — up to 3 review cycles per the existing spec
- Plan Reviewer agent runs **before** user sees the proposal — only quality-checked proposals are presented
- Multiple pending approvals shown individually in `/synapse:status` (no batching)

### Trust Config Expansion
- `[rpev.involvement]` section with **per-level × per-stage** involvement matrix (4 levels × 4 stages = 16 entries)
- Involvement modes: `drives`, `co-pilot`, `reviews`, `autopilot`, `monitors` — each with **concrete, strict behavior**:
  - `drives` = user initiates the action
  - `co-pilot` = agent proposes, user approves
  - `reviews` = agent does, user reviews output
  - `autopilot` = agent does, no user involvement
  - `monitors` = agent does, user notified + can intervene (pause/redirect/escalate)
- **Default gradient:**
  - Project: refine=drives, plan=approves, execute=monitors, validate=monitors
  - Epic: refine=co-pilot, plan=reviews, execute=autopilot, validate=monitors
  - Feature: refine=reviews, plan=autopilot, execute=autopilot, validate=autopilot
  - Work Package: all autopilot
- Users only override specific cells they want to change
- **Per-domain overrides** supported via `[rpev.domain_overrides]` — e.g., `security.execute = "co-pilot"` to escalate involvement for specific domains regardless of level

### Failure Escalation
- Failed items appear in `/synapse:status` with a flag — **status flag only**, no proactive interruption
- When user focuses on a failed item via `/synapse:focus`: show Debugger agent's diagnostic report (root cause, attempted fixes) + structured options: Retry with guidance / Redefine the task / Skip and continue / Escalate to parent level
- **Auto-escalate to parent** when retries exhausted: task fails → feature-level retry, feature fails → epic-level retry, epic fails → stop and flag for user
- Retry caps remain: task=3, feature=2, epic=1
- **Keep successful work** on partial wave failure — only retry the failed task. If a revised plan invalidates earlier work, that's handled through replanning, not pre-emptive rollback

### Claude's Discretion
- Document schema for RPEV stage tracking (category, fields, linking strategy)
- How to represent "ready for plan"/"ready for execute" in task status (reuse existing "ready" status or metadata)
- Internal wave identification algorithm (grouping independent tasks from dependency graph)
- Checkpoint format for wave progress reporting
- How orchestrator detects and resumes interrupted sessions

</decisions>

<specifics>
## Specific Ideas

- The queue is a minimal stub: mark items as "ready for plan"/"ready for execute" in the task tree. Phase 21 builds the real work queue and agent pool dispatch on top of this
- Approval UX should feel like quick triage by default (summary + options), with depth available on demand (conversational review) — user never forced into slow mode for simple approvals
- Involvement modes are strict/concrete, not guidelines — the orchestrator enforces exact behavior per mode. This makes the system predictable and trustworthy
- Successful work from partial wave failures is kept. Git worktrees can be adjusted and new plans set into motion if revisions invalidate earlier work

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse-orchestrator.md`: Full agent spec with PEV workflow, wave execution, failure escalation ladder — ready to be updated for RPEV
- `pev-workflow.md`: Complete workflow spec with 5 phases, JIT decomposition, merge strategy — needs RPEV stage additions
- `trust.toml`: Existing config with `[rpev]` section (seeded by Phase 16), per-domain autonomy, tier authority — expand with involvement matrix
- `refine.md`: Working command with decision tracking (DECIDED/OPEN/EMERGING), readiness checks — needs bridge to orchestrator
- All MCP tools fully implemented: `create_task`, `update_task`, `get_task_tree`, `store_decision`, `check_precedent`, `store_document`, `get_smart_context`
- `synapse-startup.js`: Injects project context and tier authority — expand for RPEV stage awareness

### Established Patterns
- Slash commands are markdown files in `packages/framework/commands/synapse/` with frontmatter
- Agent specs are markdown files in `packages/framework/agents/` — orchestrator follows reasoning, not runtime code
- Trust config is TOML format, parsed by hooks and injected into agent context
- Task tree uses depth 0-3 (Epic → Feature → Component → Task) with dependency tracking and is_blocked propagation
- Documents support versioning via `store_document` with same doc_id — suitable for stage tracking

### Integration Points
- `refine.md` → orchestrator: Bridge the "readiness confirmed" signal to stage document creation
- `trust.toml` `[rpev]` section: Expand with involvement matrix and domain overrides
- `synapse-orchestrator.md`: Update from PEV to RPEV model with stage transitions
- `pev-workflow.md`: Update with RPEV stage tracking and document-based stage persistence
- `/synapse:status` command: Needs to read stage documents and display approval-needed items
- `/synapse:focus` command: Needs approval interaction flow (two-tier: summary→conversational)

</code_context>

<deferred>
## Deferred Ideas

- **Work queue and agent pool dispatch** — Phase 21 (Agent Pool). Phase 18 stubs with task tree status markers
- **Proactive push notifications** — Phase 23 (Visibility + Notifications). Phase 18 uses status flags only
- **Statusline progress indicator** — Phase 23
- **Agent-based focus** (`/synapse:focus agent C`) — Phase 21
- **Wave state persistence across sessions** — may need refinement during E2E validation (Phase 24)

</deferred>

---

*Phase: 18-rpev-orchestration*
*Context gathered: 2026-03-05*
