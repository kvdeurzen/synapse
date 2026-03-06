# Phase 21: Agent Pool - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Configurable pool of agent slots that auto-assigns to highest-priority unblocked work, enabling the "system drives, user unblocks" model. This phase implements the pool manager, work queue, agent dispatch, agent interaction via `/synapse:focus agent`, pool visibility in `/synapse:status`, and token usage tracking. Proactive push notifications are Phase 23's scope. The statusline hook is Phase 23's scope.

</domain>

<decisions>
## Implementation Decisions

### Slot Model and Sizing
- **One generic pool** — no per-type partitioning. A single pool of N slots. The orchestrator assigns any available slot to the next highest-priority work, choosing the right agent type (executor, validator, integration-checker, debugger, decomposer, etc.) per task
- **All agent types share the pool** — every subagent the orchestrator spawns consumes a pool slot, regardless of type (execution-tier, planning-tier, or strategic)
- **Fresh context per task** — each agent starts clean via the Task tool with a SYNAPSE HANDOFF block. No agent reuse, no state carryover between tasks. Slots are fully flexible
- **Default 3 slots**, configurable in trust.toml as `max_pool_slots = 3`. Replaces the existing `max_parallel_executors = 3` (broader scope, same default)
- **Queue with notification** — when all slots are busy, new unblocked items wait. `/synapse:status` shows queued item count so users know work is waiting

### Work Queue and Assignment
- **Cross-epic parallelism** — if the top-priority epic has only 1 unblocked task, remaining slots pull from lower-priority epics. Maximizes throughput across all active work
- **Priority algorithm: epic priority first, then wave order** — pick the highest-priority epic with unblocked work, then pick the next task in wave order within that epic. Validators/integration-checkers for completed work take priority over new execution (finish-first policy)
- **Finish-first policy** — when a task completes, its validation gets the next available slot before any new execution starts. Prevents piling up unvalidated work. Completes items end-to-end faster
- **Idle + proactive prompt when all blocked** — when all work across all epics is blocked (e.g., everything needs user approval), the pool goes idle and proactively tells the user that work is stalled (not just silently shown in `/synapse:status`)
- The orchestrator must track which epic each slot is working on to avoid accidentally starting decomposition of a second epic's features while the first is mid-wave (implementation detail for Claude)

### Agent Interaction (/synapse:focus agent)
- **Agent naming: A, B, C** — sequential letters mapping to pool slots. `/synapse:focus agent A` to interact with slot A. Letters reset/reassign as agents finish and new ones start
- **View + cancel** — user can see agent status and cancel a running agent (kills it, frees the slot). No ability to send guidance mid-flight (agents run to completion or failure; the RPEV failure escalation handles issues)
- **Cancel behavior: user chooses requeue or skip** — after cancelling, prompt: "Requeue this task or skip it?" Requeue returns the task to 'ready' status (picked up by next available slot, git worktree discarded). Skip marks it as skipped in the task tree
- **Agent detail view: summary card + recent activity** — `/synapse:focus agent A` shows:
  - Agent letter, agent type (executor/validator/etc), task title, parent epic
  - Time running, current RPEV stage
  - Last 3-5 tool calls the agent made (e.g., "Read src/auth.ts", "Edit src/auth.ts")
  - Actions: [Cancel] [Back to status]

### Pool Visibility in /synapse:status
- **Placement: after epics, before suggested actions** — epics stay at the top as the primary strategic view. Agent pool is a supporting section showing execution details
- **One line per agent + queue summary:**
  ```
  ### Agent Pool (2/3 active, 4 queued)
  - **A** [executor] JWT token refresh (Epic: Auth) — 3m
  - **B** [validator] Login flow tests (Epic: Auth) — 1m
  - **C** idle
  Queued (4): JWT logout, Session expiry, Password reset, +1 more
  ```
- **No estimated token display for running agents** — only show real data, never estimates
- **Queue display: count + top 3 queued items** — shows next 3 items in priority order so users know what's coming, plus "+N more" if additional items exist

### Token Usage Tracking
- **Log actual token usage per agent after completion** — when a Task tool completes, capture the actual token count from the result and store it on the task (metadata or dedicated field)
- **Display token usage on completed nodes** — each completed task shows its token count in `/synapse:status`
- **Aggregate upward** — features sum their tasks' tokens, epics sum their features, project sums all epics. Gives cost visibility at every hierarchy level
- **Format in status:**
  ```
  **Epic: Auth System** [EXECUTING] (65% complete) — 142k tokens used
    - Feature: Login flow [DONE] — 48k tokens
    - Feature: JWT refresh [EXECUTING] — 31k tokens (2/4 tasks done)
    - Feature: Session mgmt [QUEUED]
  ```

### Claude's Discretion
- How to track pool state (in-memory during orchestrator session vs. persisted via stage documents)
- Exact mechanism for capturing token usage from Task tool results
- How to track recent agent activity (tool calls) for the focus view
- Internal data structure for the priority queue
- How to handle mid-wave slot reassignment when cross-epic work is available
- How `max_pool_slots` interacts with the existing wave execution model in pev-workflow.md

</decisions>

<specifics>
## Specific Ideas

- The pool is essentially a concurrency limiter on Task tool calls — the orchestrator already spawns fresh subagents, this just adds a cap and priority queue
- Token tracking enables informed decisions about cost: "This epic cost 500k tokens, should we continue with the next one?"
- The finish-first policy (validate before executing new) prevents the failure mode where 3 tasks execute in parallel, all fail, and 3 validators then queue up
- Agent letters (A, B, C) are ephemeral — they map to slots, not to specific tasks. When Agent A finishes and a new task starts in that slot, it's still Agent A
- Cross-epic parallelism with finish-first creates a natural flow: slot opens → check for pending validations first → check highest-priority epic → check lower-priority epics → idle if nothing available

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse-orchestrator.md`: Already manages subagent spawning via Task tool — needs pool manager logic added
- `pev-workflow.md`: Wave execution already caps at `max_parallel_executors` — evolve to use pool manager
- `trust.toml`: Has `max_parallel_executors = 3` under `[rpev]` — replace with `max_pool_slots = 3`
- `synapse-startup.js`: Injects trust.toml config into session — extend for pool config
- Task tree: Already has priority, dependencies, `is_blocked` propagation — pool reads this for assignment
- Stage documents: RPEV state tracking via `store_document` — pool can use these to track active agents
- `/synapse:status` command: Already has epic display, RPEV stage badges, suggested actions — add pool section between epics and actions
- `/synapse:focus` command: Already supports item navigation — extend with `agent A/B/C` syntax

### Established Patterns
- Subagents spawned via Task tool get fresh context with SYNAPSE HANDOFF block (Phase 19)
- Executor subagents use `isolation: "worktree"` for git isolation
- Subagents cannot spawn other subagents — orchestrator manages all spawning
- Stage documents are single source of truth for RPEV state (doc_id: `rpev-stage-[task_id]`)
- Activity logging via `activity_log` table — could extend for token tracking

### Integration Points
- `pev-workflow.md` Phase 3 (Wave Execution): Replace direct Task tool calls with pool-mediated dispatch
- `trust.toml` `[rpev]` section: Replace `max_parallel_executors` with `max_pool_slots`
- `synapse-orchestrator.md`: Add pool manager responsibilities (dispatch loop, slot tracking, priority queue)
- `/synapse:status`: Add Agent Pool section after epics, add token usage aggregates to epic/feature display
- `/synapse:focus`: Add `agent A/B/C` argument parsing and agent detail view with cancel action
- Task schema or metadata: Store token usage per completed task for aggregation

</code_context>

<deferred>
## Deferred Ideas

- **Proactive push notifications** — Phase 23 (Visibility + Notifications). Phase 21 uses proactive prompt only for "all work blocked" state
- **Statusline progress indicator** — Phase 23
- **Send guidance to running agent** — not implemented; agents run to completion. If needed, could be a future enhancement
- **Real-time token tracking for running agents** — only post-completion tracking implemented; live tracking deferred
- **Per-agent-type pool partitioning** — decided against (one generic pool), but could revisit if starvation becomes an issue
- **Agent preemption** — not implemented; agents run to completion unless cancelled by user

</deferred>

---

*Phase: 21-agent-pool*
*Context gathered: 2026-03-06*
