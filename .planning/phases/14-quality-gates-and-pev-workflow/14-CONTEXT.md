# Phase 14: Quality Gates and PEV Workflow - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Hook-based enforcement in `.claude/hooks/` prevents agents from exceeding their authority (tier violations, tool allowlist violations). The Plan-Execute-Validate (PEV) workflow orchestrates progressive decomposition with wave-based parallel execution. The complete system can run a user goal through task decomposition, execution, and validation end-to-end with full rollback support.

Two orthogonal control axes:
1. **Decision authority** — Who can make what kinds of decisions (tier-based, enforced by hooks)
2. **Process orchestration** — How much autonomy does the PEV workflow have (layered approval threshold)

</domain>

<decisions>
## Implementation Decisions

### Hook Denial Behavior
- Actionable error messages on denial — tell the agent what to do next (e.g., "DENIED: executor cannot store Tier 1 decisions. Escalate to architect.")
- Agents learn their tier authority via SessionStart hook injection — hook reads trust.toml + agents.toml and injects structured context ("You are executor. Your tier authority: [3]. Tier 0-1 decisions require user collaboration.")
- Tier 0 decisions: the agent proactively collaborates with the user to refine the decision BEFORE storage. The hook is a safety net, not the primary mechanism. Agents should never rely on hooks catching unwarranted decisions.
- Most restrictive hook wins when multiple hooks fire (deny > ask > allow)
- Individual hook files per concern: tier-gate.js, tool-allowlist.js, precedent-gate.js, audit-log.js — matches existing pattern (synapse-audit.js, synapse-startup.js)
- Fail-closed on hook errors — if a hook crashes or gets bad input, deny the tool call. Errors are logged.
- Tool-allowlist hook (GATE-02) enforces Synapse MCP tools only — Claude Code built-in tools (Read, Write, etc.) are not gated
- Precedent gate: inject existing precedent context before decision storage. Mechanism (block vs inject) at Claude's discretion — the value is surfacing the information, not the gate mechanism.

### Audit and Observability
- Audit hook expanded to log ALL tool calls (not just Synapse MCP tools) with timestamp, agent identity, tool name, and result summary
- Token cost estimation per tool call — use input/output character count to estimate tokens, reuse existing token-estimator pattern from Synapse server

### PEV Trigger and User Experience
- Both natural language and structured command trigger supported — orchestrator normalizes both into the same pipeline
- Milestone checkpoint visibility — structured status blocks at wave boundaries (e.g., "Wave 2 complete: 3/3 tasks passed. Task A: auth middleware (done)...")
- Layered approval model with a single threshold setting:
  - `epic` — User approves feature breakdown. Everything below runs autonomously.
  - `feature` — User approves task decomposition within each feature.
  - `task` — User approves each task plan.
  - `none` — Fully autonomous end-to-end.
  - Current trust.toml `decomposition = "strategic"` maps to the `epic` threshold.
- Every approval point is conversational — not a binary yes/no gate. Options: approve, provide feedback/refine, or discuss further. This applies universally.
- Optional goal → multiple epics decomposition — orchestrator can decompose a big goal into multiple epics, but single-epic goals still work. No forced decomposition step.
- PEV state persisted for session resume — task tree tracks wave progress. Resume is user-triggered (slash command or natural language), not automatic on session start.

### Progressive Decomposition
- On-demand (JIT) decomposition: Epic→Features validated upfront, but Features→Tasks decomposed only when a feature is next to execute. Earlier features' outputs inform later decomposition.
- Decomposer ↔ Plan Reviewer verification loop uses the existing plan-reviewer agent (separate agent, not self-review). Clear separation — decomposer can't review its own work.

### Validation Strategy
- Mandatory validation tasks in decomposition: each task gets unit test expectations, each feature gets an "integration test" task, each epic gets an "epic integration" task
- Task-level: validator agent checks individual task output against spec
- Feature-level: integration-checker agent verifies contracts between tasks within a feature
- Epic-level: integration-checker validates cross-feature integration
- Validation triggers per task completion, but wave halts on any failure

### Execution Isolation
- Executors run in isolated git worktrees (Claude Code Task tool `isolation: "worktree"`)
- Merge strategy: per feature — all tasks within a feature complete + integration check passes → merge feature branch to main
- Sequential merge of task branches into feature branch (one at a time, resolve conflicts if needed)

### Failure Escalation and Rollback
- Cascading failure escalation through the layer hierarchy — failures bubble up until they hit the user's approval threshold
- Retry caps decrease up the stack: 3 retries at task level, 2 at feature level, 1 at epic level
- Debugger agent gets full context handoff on executor failure: task spec, what was attempted, error messages, relevant file paths
- Auto-revert failed tasks (git), keep passing tasks within the feature
- Escalation UX: present findings + propose revised plan. User can approve, refine, or discuss further.

### Claude's Discretion
- Retry agent selection (fresh executor vs. resume original) — Claude determines based on Task tool capabilities
- Precedent gate mechanism (inject vs. block-until-acknowledged)
- Exact structured status format for wave checkpoints
- Default parallel executor cap value (suggested 3-4, configurable)
- How to extend trust.toml/synapse.toml with PEV process control settings

</decisions>

<specifics>
## Specific Ideas

- Agents should proactively know their boundaries — the hook is a backstop, not the primary control. Agent awareness comes from SessionStart injection.
- "Once we allow auto-planning on a layer, that means we do not require user authorization to start execution" — planning trust implies execution trust at the same layer.
- Every approval step should explicitly allow providing additional insights or discussing ideas — not just approve/reject.
- Validation should be thought through during decomposition — the decomposer must consider how each child can be validated and what broader-scope tests become possible once a group of work is delivered.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse-audit.js`: PostToolUse hook pattern — logs Synapse MCP tool calls. Extend to log all tool calls with token estimates.
- `synapse-startup.js`: SessionStart hook pattern — injects context. Extend to inject agent identity and tier authority from trust.toml + agents.toml.
- `agents.toml`: Complete agent registry with `allowed_tools` lists per agent — source of truth for GATE-02 tool-allowlist enforcement.
- `trust.toml`: Tier authority matrix (`[tier_authority]`) — source of truth for GATE-01 tier enforcement. `[approval].decomposition` already exists.
- Agent `.md` files: All 10 agents defined with roles, constraints, tool lists, and examples.
- `src/utils/token-estimator.ts`: Token estimation utility in Synapse server — pattern to reuse for audit hook cost tracking.

### Established Patterns
- Hooks use stdin JSON parsing + stdout JSON output, exit(0) on success
- Silent fail pattern in hooks — `catch { process.exit(0) }` — needs to change to fail-closed for enforcement hooks
- Agent attribution via `actor` field in Synapse MCP tool calls
- Task tree with depth 0-3 (epic→feature→component→task) and dependency wiring

### Integration Points
- `.claude/hooks/` directory for new hook files (referenced in Claude Code settings)
- `packages/framework/workflows/` or `packages/framework/config/` for PEV workflow configuration
- Claude Code `Task` tool with `isolation: "worktree"` for parallel executor spawning
- Synapse MCP server task tree (create_task, update_task, get_task_tree) for wave state persistence
- Git worktree management for executor isolation and feature-level merge

</code_context>

<deferred>
## Deferred Ideas

- Epic-level validation agent (beyond integration-checker) — could be its own specialized role in a future phase
- Cost tracking dashboard / aggregation beyond per-call logging — future phase
- Per-domain hook configuration (different strictness for different domains) — future refinement

</deferred>

---

*Phase: 14-quality-gates-and-pev-workflow*
*Context gathered: 2026-03-02*
