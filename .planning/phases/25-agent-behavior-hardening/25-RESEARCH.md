# Phase 25: Agent Behavior Hardening - Research

**Researched:** 2026-03-07
**Domain:** Agent prompt engineering, slash command prompts, JavaScript hook authoring (Claude Code / Synapse Framework)
**Confidence:** HIGH — all findings derived from direct code inspection of the current repository. No external library APIs involved. No external sources needed.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Group A: Orchestrator Prompt Hardening (synapse-orchestrator.md)**
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

**Group B: Slash Command Prompt Fixes**
Issues: #5, #6, #17, #26, #33, #36

- **status.md (#5, #33):** Add structured output template (markdown table format). Use filtered get_task_tree queries with parent_id parameter. Progressive disclosure: summary first, detail on request.
- **refine.md (#6, #26, #36):** Trust code index — do NOT spawn Explore agent if get_smart_context returns code summaries. Persist refinement summary at phase boundary (before offering to proceed to Plan). Surface UX dimension for decisions that affect developer experience.
- **init.md (#17):** Add commit step after all files created — `git add .synapse/ .claude/ && git commit`.

**Group C: Hook/Infrastructure Fixes**
Issues: #37, #38

- **audit-log.js (#37):** Fix agent attribution — extract agent name from Claude Code session context or subagent metadata, not just tool_input.actor. Target: ≥80% correct attribution.
- **Session summary (#38):** Add end-of-cycle aggregation that reads audit log and produces a summary document with per-agent token counts, tool call counts, and total cost estimate.

### Claude's Discretion
- Exact wording of orchestrator prompt instructions
- Progress template format
- Order of implementation across groups
- Whether session summary is a hook or orchestrator responsibility

### Deferred Ideas (OUT OF SCOPE)
- #9: /synapse:status during execution (architectural — needs side-channel, Claude Code platform limitation)
- #18: Decomposer task granularity (needs deeper decomposer rework, beyond prompt changes)
- #27: Parallel store_decision cascade (Claude Code platform limitation with sibling tool calls)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ABH-01 | RPEV stages have explicit boundaries — stage documents persisted at each transition, gate checks verify prerequisites before proceeding | Orchestrator prompt analysis: stage document pattern established (rpev-stage-[task_id]), gate check protocol must be added as explicit pre-transition assertions |
| ABH-02 | Orchestrator delegates bookkeeping to subagents — executors mark their own tasks done, validators update their own findings, orchestrator context stays lean | Executor prompt analysis: update_task call already exists but orchestrator also calls it (duplicate); delegation protocol requires removing orchestrator-side task status updates and adding tree-integrity check before parent completion |
| ABH-03 | Executors create atomic commits per task and orchestrator verifies commits exist before marking tasks done | Git workflow gap: executor.md has no `git add/commit` step; orchestrator has no commit verification step; both need new instruction blocks |
| ABH-04 | /synapse:status output is consistent across runs and uses filtered queries that scale to 100+ task trees | status.md analysis: unfiltered get_task_tree fetches entire tree; no structured output template; agent has formatting discretion — needs template and parent_id-filtered queries |
| ABH-05 | Audit log entries have correct agent attribution (not "unknown") for at least 80% of calls | audit-log.js analysis: extracts actor from tool_input.actor only; Claude Code PostToolUse hook input includes session_id but NOT agent identity — attribution must come from tool_input.actor fields consistently populated by agents |
| ABH-06 | A second E2E run on rpi-camera-py shows measurably fewer issues than the first run (target: 0 BLOCKER, <10 DEGRADED) | Validation criterion — all ABH-01 through ABH-05 fixes contribute; no specific research finding, verified by running the E2E scenario |
</phase_requirements>

---

## Summary

Phase 25 is entirely a prompt-engineering and hook-authoring phase. All changes are to `.md` files and JavaScript hook files — no MCP server code, no schema changes, no new tools. The phase addresses 27 DEGRADED issues from the Phase 24 E2E run organized into three groups: orchestrator prompt hardening (16 issues), slash command prompt fixes (6 issues), and hook infrastructure fixes (2 issues).

The core patterns and documents needed already exist in the codebase. Stage documents (`rpev-stage-[task_id]`), pool state documents (`pool-state-[project_id]`), agent findings (`{agent}-findings-{task_id}`), and SYNAPSE HANDOFF blocks are all established conventions. The work is to enforce these patterns more strictly through explicit instructions and add missing steps (gate checks, commit verification, plan documents, session summary).

The audit log attribution problem (#37) is the highest-risk item. The Claude Code PostToolUse hook input does NOT include agent identity metadata beyond what agents pass explicitly in tool_input.actor. The solution is to ensure all agent prompts consistently include `actor` in every MCP call — the hook can then extract it reliably. Session summary (#38) can be implemented as a plain JS script that reads and aggregates `.synapse-audit.log`, triggered by the orchestrator or as a post-RPEV step.

**Primary recommendation:** Implement in Group order (A → B → C) because Group A orchestrator changes are the highest-impact fixes and Group C (hook changes) requires coordinating the two copies of each file (`.claude/` and `packages/framework/`).

---

## Standard Stack

### Core (already established — no new dependencies)

| Component | Version | Purpose | Status |
|-----------|---------|---------|--------|
| `packages/framework/agents/synapse-orchestrator.md` | current | Primary orchestrator prompt | Modify (Group A) |
| `packages/framework/agents/executor.md` | current | Executor agent prompt | Modify (Group A — atomic commits) |
| `packages/framework/agents/decomposer.md` | current | Decomposer agent prompt | Modify (Group A — store plan doc) |
| `.claude/commands/synapse/status.md` | current | /synapse:status prompt | Modify (Group B) |
| `.claude/commands/synapse/refine.md` | current | /synapse:refine prompt | Modify (Group B) |
| `.claude/commands/synapse/init.md` | current | /synapse:init prompt | Modify (Group B) |
| `.claude/hooks/audit-log.js` | current | PostToolUse audit logging | Modify (Group C) |
| `packages/framework/` mirrors | current | Canonical copies for install.sh | Must stay in sync with `.claude/` copies |

### Mirror Rule (CRITICAL)

Every file that exists in both `.claude/` and `packages/framework/` MUST be updated in both locations. The `.claude/` directory is the live copy for the development environment. `packages/framework/` is the source that `install.sh` copies from. If only one is updated, the other diverges.

**Files with mirrors:**
- `.claude/commands/synapse/status.md` ↔ `packages/framework/commands/synapse/status.md`
- `.claude/commands/synapse/refine.md` ↔ `packages/framework/commands/synapse/refine.md`
- `.claude/commands/synapse/init.md` ↔ `packages/framework/commands/synapse/init.md`
- `.claude/hooks/audit-log.js` ↔ `packages/framework/hooks/audit-log.js`
- `packages/framework/agents/synapse-orchestrator.md` (only in `packages/framework/`, no `.claude/agents/` mirror)
- `packages/framework/agents/executor.md` (only in `packages/framework/`, no `.claude/agents/` mirror)
- `packages/framework/agents/decomposer.md` (only in `packages/framework/`, no `.claude/agents/` mirror)

### Session Summary Script (new file — Group C)

A new script to aggregate `.synapse-audit.log` into a summary document. Decision (Claude's discretion): implement as an orchestrator step rather than a hook, because:
- Hooks fire on every tool use; session summary should fire once per RPEV cycle
- The orchestrator already knows when a cycle completes; a hook cannot reliably detect this
- A plain JS/Bun script called by the orchestrator via Bash is simpler and more testable

Proposed path: `packages/framework/scripts/session-summary.js` (new), with mirror at `.claude/scripts/session-summary.js`.

---

## Architecture Patterns

### Established Patterns (used as-is)

**Stage Document Pattern** (Phase 18-02, HIGH confidence)
```
doc_id: "rpev-stage-{task_id}"
category: "plan"
tags: "|rpev-stage|{level}|{stage_lowercase}|"
content: JSON string with stage, level, task_id, involvement, pending_approval, last_updated, notes
```
Gate check: before transitioning to next stage, call `query_documents(category: "plan", tags: "|rpev-stage|")` and parse the document content to verify current stage.

**Executor Self-Update Pattern** (Phase 19, AGENT-05/07, HIGH confidence)
```
# executor.md — end of task sequence:
1. store_document(doc_id: "executor-summary-{task_id}", ...)  -- already exists
2. link_documents(...)  -- already exists
3. update_task(task_id: "{task_id}", status: "done", actor: "executor")  -- already exists
# ADD: git commit step between implementation and store_document
```

**Pool State Document Pattern** (Phase 21-agent-pool, HIGH confidence)
```
doc_id: "pool-state-{project_id}"
Written by orchestrator on every slot assignment change
```
The orchestrator prompt already documents this but the E2E run showed it was never actually written. The fix is to strengthen the language from "should" to "MUST" and add explicit "when to write" trigger points.

**SYNAPSE HANDOFF Block** (Phase 19-03, HIGH confidence)
6-field format already established. All subagent Task calls already use it.

### New Patterns Required

**RPEV Gate Check Pattern** (needed for ABH-01)

Add to orchestrator before each stage transition:

```
## Stage Gate Check Protocol

Before transitioning from stage X to stage Y:
1. Call query_documents(category: "plan", tags: "|rpev-stage|")
2. Find the document where content.task_id == current_task_id
3. Verify content.stage == "X" (current stage, not a future state)
4. If document missing or stage mismatch: HALT. Do not proceed. Report: "Stage gate: expected stage X document for task {task_id}, found {actual}. Cannot proceed."
5. If gate passes: write updated stage document with new stage = "Y", then proceed
```

**Progress Template Pattern** (needed for ABH-02 / #11, #23)

Replace free-form narration with a fixed template. Each dispatch cycle:
```
> [RPEV-STAGE] {stage_emoji} {task_title} — Slot {letter} | {done}/{total} tasks done
```
Stage transitions (max 5 lines):
```
> Stage transition: {PREV} → {NEXT}
> Gate check: PASSED ({N} stage docs verified)
> Context cleared — continue with /synapse:status to see state
> Next: {what happens next, 1 line}
```

**Atomic Commit Protocol** (needed for ABH-03, executor.md)

Add after implementation, before `store_document`:
```
## Git Commit Protocol (MANDATORY)

After implementing the task and running tests:
1. `git add -A` (or specific files changed)
2. `git commit -m "feat({task_title_slug}): {one-line summary} [task:{task_id}]"`
   - Include task_id in commit message for traceability
   - Use conventional commit format
3. Verify commit: `git log --oneline -1` -- confirm the commit appears
4. Include the commit SHA in your implementation summary document
```

**Commit Verification Protocol** (needed for ABH-03, orchestrator.md)

Add to "On Task Completion" section:
```
## Commit Verification (after executor reports done)

Before accepting a task as complete:
1. `git log --oneline --grep="task:{task_id}"` -- verify commit exists
2. If no commit found: task is NOT complete.
   Re-queue the task with note "executor reported done but no commit found".
3. If commit found: proceed with pool dispatch tick.
```

**Filtered Status Query Pattern** (needed for ABH-04, status.md)

Replace the current unfiltered `get_task_tree` call:
```
# Current (broken for large trees):
get_task_tree(project_id: "{project_id}")  -- returns 235+ lines

# Fixed (scaled):
# Step 1: Get top-level epics only
get_task_tree(project_id: "{project_id}", depth: 1)  -- epics only
# Step 2: For each epic, get features only when needed
get_task_tree(project_id: "{project_id}", task_id: "{epic_id}", depth: 1)  -- features of one epic
```
NOTE: Verify that `get_task_tree` actually supports `depth` parameter and `task_id` for subtree query — this needs confirmation from the MCP tool signatures.

**UX Decision Dimension Pattern** (needed for ABH-02 / #36, refine.md)

When a decision has both a technical dimension AND a developer experience dimension, the refine prompt should surface both:
```
Technical decision: {choice} — e.g., "use SSH for hardware tests"
UX decision (surface separately): {DX impact} — e.g., "how does developer configure Pi address, what happens on Pi unreachable"
```

### Anti-Patterns to Avoid

- **Orchestrator updating leaf task status:** Executor owns `update_task(status: "done")`. Orchestrator only updates RPEV stage documents and pool state.
- **Parent marked done without tree verification:** Never `update_task(epic_id, status: "done")` without `get_task_tree` verification that all children have `status: "done"`.
- **is_blocked managed in orchestrator context:** When a dependency resolves, call `update_task(task_id: "{blocked_id}", is_blocked: false)` immediately — do not track unblocking internally.
- **Free-form narration:** Orchestrator output is bounded by the progress template. No pipeline narration ("Next I will spawn executor for task B which depends on task A...").
- **Exploring files when code index has content:** If `get_smart_context` returns code summaries, do not spawn Explore agent. Trust the index.
- **Refinement summary stored only at session end:** Must store refinement document BEFORE offering "proceed to Plan?" so partial sessions are always persisted.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session summary aggregation | Custom aggregator with complex logic | Simple `fs.readFileSync` + `JSON.parse` loop on `.synapse-audit.log` | The log is already NDJSON; line-by-line parsing is 20 lines of JS |
| Agent identity detection in hooks | Introspection into Claude Code internals | Always pass `actor` explicitly in every MCP tool call from agent prompts | Claude Code PostToolUse hook input has no agent identity field beyond what the tool input carries |
| Structured status output | Complex template engine | Fixed markdown template in status.md with literal backtick-delimited format string | Agent follows a template more reliably when it's literal text, not a description of a template |
| Git branch management | Custom branch tracking in pool state | Standard git commands via Bash in executor/orchestrator | Git already tracks this; no need to duplicate in Synapse documents |

**Key insight:** This phase is about enforcing discipline in agent behavior through explicit textual instructions in prompts. The failure patterns from Phase 24 were not capability gaps — the agents understood how to use the tools. They were instruction gaps — the prompts did not force the correct sequence.

---

## Common Pitfalls

### Pitfall 1: Missing the Framework Mirror
**What goes wrong:** `.claude/` copy is updated but `packages/framework/` copy is not (or vice versa). On next `install.sh` run, users get the old version from the package.
**Why it happens:** Easy to forget the copy relationship; the two paths look independent.
**How to avoid:** Every plan task that modifies a command or hook MUST list both file paths explicitly. Enforce at plan creation time.
**Warning signs:** Files with different content after the task but same name pattern.

### Pitfall 2: Overloading the Orchestrator Prompt
**What goes wrong:** Adding 16 new instruction sections to synapse-orchestrator.md makes it so long that the orchestrator starts ignoring later sections (LLM context window attention drift).
**Why it happens:** Each fix is reasonable in isolation; combined they create a 600-line prompt.
**How to avoid:** Prefer compact, rule-based language over narrative explanations. Use tables for protocols. Each new rule should be ≤5 lines.
**Warning signs:** synapse-orchestrator.md exceeds ~800 lines.

### Pitfall 3: Audit Attribution Fix — Wrong Approach
**What goes wrong:** Trying to infer agent identity from Claude Code's session or hook data rather than from tool_input.actor.
**Why it happens:** The failure log says "91% unknown" which sounds like a hook problem. But it's actually an agent prompt compliance problem — agents don't consistently pass `actor`.
**Root cause from code inspection:** `audit-log.js` line 29: `agent: toolInput.actor || toolInput.assigned_agent || "unknown"`. The logic is correct. The problem is that 91% of tool calls don't have `actor` in `tool_input`.
**How to avoid:** The fix is in agent prompts, not in audit-log.js logic. Strengthen the Attribution section in every agent prompt to make `actor` mandatory on every MCP call. audit-log.js can add fallback heuristics (e.g., log all fields of tool_input to help debugging) but the root fix is prompt-side.
**Warning signs:** If audit-log.js is rewritten to do complex introspection, that's the wrong path.

### Pitfall 4: get_task_tree depth/parent_id Parameter Assumptions
**What goes wrong:** status.md instructs the agent to pass `depth: 1` or `task_id` to filter get_task_tree, but those parameters might not be supported by the MCP tool.
**Why it happens:** The research cannot verify MCP tool signatures without running the server.
**How to avoid:** The plan must include a validation step — check `packages/server/src/tools/` to verify the actual get_task_tree parameter schema before writing the status.md instruction. If depth filtering is not available, a different approach is needed (fetch full tree, then slice in the agent's head).
**Warning signs:** status.md instructs a parameter that get_task_tree doesn't accept, causing silent no-op or error.

### Pitfall 5: Executor Commit Step Breaks Existing Worktree Logic
**What goes wrong:** Adding `git add -A && git commit` to executor.md without considering that the executor may already be in a git worktree with an active branch; committing in the wrong context pollutes main.
**Why it happens:** The Phase 24 run showed no branches were created (#15); so adding a commit step without a branch creation step in the orchestrator first creates commits on main.
**How to avoid:** Group A plan must enforce ordering: orchestrator creates feature branch FIRST (ABH-03 orchestrator side), THEN executor commits to it. Executor commit step is only safe after the branch workflow is established.
**Warning signs:** Commit verification finds commits but they're on main instead of the feature branch.

### Pitfall 6: Session Summary Redundant Hook
**What goes wrong:** Creating a new session summary hook when `synapse-audit.js` already exists alongside `audit-log.js` (failure log #38 notes this redundancy).
**Why it happens:** Not noticing the existing duplicate; adding a third hook to the mix.
**How to avoid:** The plan should first remove or deprecate `synapse-audit.js` (it's less capable than `audit-log.js`), then add the session summary as a script, not a third hook.
**Warning signs:** Three audit-related hooks in the hooks directory.

---

## Code Examples

### audit-log.js Current Attribution Logic
```javascript
// Source: .claude/hooks/audit-log.js lines 26-34
const logEntry = {
  ts: new Date().toISOString(),
  tool: toolName,
  agent: toolInput.actor || toolInput.assigned_agent || "unknown",
  project_id: toolInput.project_id || null,
  input_tokens: tokenEstimate(inputStr),
  output_tokens: tokenEstimate(outputStr),
  input_keys: Object.keys(toolInput),
};
```
The logic is correct — `actor` is the right field. Attribution fails when agents don't pass `actor`. Fix is in prompts, not in this hook.

### Executor Self-Update (existing, working pattern)
```javascript
// Source: packages/framework/agents/executor.md lines 82-86
// Store Implementation Summary (after implementation, before marking done):
1. store_document(doc_id: "executor-summary-{task_id}", ...)
2. link_documents(from_id: "executor-summary-{task_id}", to_id: "{task_id}", ...)
3. update_task(task_id: "{task_id}", status: "done", actor: "executor")
// ADD after step 5 (implementation) and before step 1:
// 0.5. git add + git commit with task_id in message
// ADD after step 3:
// 4. REPORT completion to orchestrator with commit SHA
```

### Stage Document Write/Read (existing pattern)
```javascript
// Source: packages/framework/agents/synapse-orchestrator.md lines 393-415
mcp__synapse__store_document({
  project_id: "[project_id]",
  doc_id: "rpev-stage-01HXYZ123ABC",
  title: "RPEV Stage: JWT Token Refresh (Feature)",
  category: "plan",
  status: "active",
  tags: "|rpev-stage|feature|planning|",
  content: JSON.stringify({
    stage: "PLANNING",
    level: "feature",
    task_id: "01HXYZ123ABC",
    involvement: "autopilot",
    pending_approval: false,
    ...
  }),
  actor: "synapse-orchestrator"
})
```

### Session Summary Script (new — to implement)
```javascript
// Proposed: packages/framework/scripts/session-summary.js
// Called by orchestrator via Bash at RPEV cycle completion
// Input: path to .synapse-audit.log
// Output: stdout JSON summary (orchestrator then calls store_document)

import fs from "node:fs";
const logPath = process.argv[2] || ".synapse-audit.log";
const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
const entries = lines.map(l => JSON.parse(l)).filter(e => e.tool?.startsWith("mcp__synapse__"));

const byAgent = {};
for (const e of entries) {
  const agent = e.agent || "unknown";
  if (!byAgent[agent]) byAgent[agent] = { calls: 0, input_tokens: 0, output_tokens: 0 };
  byAgent[agent].calls++;
  byAgent[agent].input_tokens += e.input_tokens || 0;
  byAgent[agent].output_tokens += e.output_tokens || 0;
}

const totalTokens = Object.values(byAgent).reduce((s, a) => s + a.input_tokens + a.output_tokens, 0);
// Cost estimate: $3/1M input + $15/1M output (Claude Sonnet approximate)
const costEstimate = Object.values(byAgent).reduce((s, a) =>
  s + (a.input_tokens * 3 / 1_000_000) + (a.output_tokens * 15 / 1_000_000), 0
);

process.stdout.write(JSON.stringify({
  by_agent: byAgent,
  total_tool_calls: entries.length,
  total_tokens: totalTokens,
  cost_estimate_usd: costEstimate.toFixed(4)
}));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Free-form orchestrator output | Templated progress blocks | Phase 25 (this phase) | Context saved, output scannable |
| Orchestrator updates all task statuses | Agents self-update their own tasks | Phase 25 (this phase) | Orchestrator context reduced by ~30% per cycle |
| Unfiltered get_task_tree in /status | Filtered queries with parent_id/depth | Phase 25 (this phase) | Scales to 100+ task trees |
| Attribution via actor field in tool_input (91% missing) | All agent prompts mandate actor on every call | Phase 25 (this phase) | Attribution rises from 9% to target ≥80% |
| No git workflow in RPEV | Branch-per-feature + commit-per-task + orchestrator verification | Phase 25 (this phase) | Work is version-controlled, reviewable, revertable |
| No plan document stored | Decomposer stores plan rationale as category:"plan" document | Phase 25 (this phase) | Plan rationale persists and is queryable |
| No researcher before decomposer | Plan stage spawns researcher first | Phase 25 (this phase) | Decomposition informed by domain research |

**Redundancy to remove:**
- `synapse-audit.js` hook: less capable than `audit-log.js` (no token counting, hardcoded path). Remove from both `.claude/hooks/` and `packages/framework/hooks/`.

---

## Open Questions

1. **Does get_task_tree support depth or task_id filtering?**
   - What we know: status.md currently calls `get_task_tree` without filters; failure #33 notes it returns 235+ lines
   - What's unclear: Whether the MCP tool accepts `depth` or `task_id` parameters for subtree queries
   - Recommendation: Plan Wave 0 must include checking `packages/server/src/tools/` for the get_task_tree tool schema before writing status.md instructions. If depth filtering exists, use it. If not, status.md should instruct the agent to fetch only with `task_id` of each epic (epic-level subtrees separately).

2. **What Claude Code PostToolUse hook input fields are available for attribution?**
   - What we know: `gsd-statusline.js` shows `session_id` is available. `gsd-context-monitor.js` shows `session_id` and `cwd` are available. audit-log.js already uses `tool_input.actor`.
   - What's unclear: Whether there is a `subagent_id`, `parent_session_id`, or similar field that could distinguish subagent calls from main-session calls
   - Recommendation: The plan should accept that attribution comes from agent prompt compliance (actor field) not from hook introspection. The hook fix is simply to log `input_keys` for debugging unknown entries and make the attribution failure more visible.

3. **Session summary — hook or orchestrator step?**
   - What we know: CONTEXT.md leaves this as Claude's Discretion
   - Recommendation: Implement as orchestrator step. The orchestrator spawns a Bash call to a script that reads and aggregates the audit log, then calls `store_document` with the result. This is simpler, more testable, and avoids adding a third audit hook.

4. **synapse-audit.js removal — safe?**
   - What we know: `synapse-audit.js` exists in both `.claude/hooks/` and `packages/framework/hooks/`. It is a simpler, less capable version of audit-log.js. settings.json registers both hooks.
   - What's unclear: Whether any external integration depends on `synapse-audit.js` specifically
   - Recommendation: Check `packages/framework/config/settings.json` and `.claude/settings.json` before removing. If it's just registered as a PostToolUse hook alongside audit-log.js, safe to remove (duplicate logging). Flag for plan task.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `/home/kanter/code/synapse/.claude/hooks/audit-log.js` — attribution logic
- Direct code inspection of `/home/kanter/code/synapse/packages/framework/agents/synapse-orchestrator.md` — current orchestrator state
- Direct code inspection of `/home/kanter/code/synapse/packages/framework/agents/executor.md` — executor self-update pattern
- Direct code inspection of `/home/kanter/code/synapse/.claude/commands/synapse/status.md` — current status output logic
- Direct code inspection of `/home/kanter/code/synapse/.claude/commands/synapse/refine.md` — current refine flow
- Direct code inspection of `/home/kanter/code/synapse/.claude/commands/synapse/init.md` — current init flow
- Direct code inspection of `/home/kanter/code/synapse/.planning/phases/24-e2e-validation/24-FAILURE-LOG.md` — 40 issues with root causes
- Direct code inspection of `/home/kanter/code/synapse/.planning/phases/25-agent-behavior-hardening/25-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- Phase decisions in `.planning/STATE.md` — key patterns established in phases 18-23 confirmed by code inspection
- `.claude/hooks/gsd-statusline.js` and `gsd-context-monitor.js` — confirmed available PostToolUse hook input fields (`session_id`, `cwd`)

---

## Metadata

**Confidence breakdown:**
- Standard stack (files to modify): HIGH — all files directly inspected
- Architecture patterns (gate check, terse output, attribution): HIGH — derived from failure root causes + existing patterns in codebase
- Pitfalls: HIGH — derived from failure log root causes and code inspection
- Open question (get_task_tree filtering): LOW — cannot confirm without running the MCP server

**Research date:** 2026-03-07
**Valid until:** 2026-04-06 (stable domain; prompt files don't have external versioning dependencies)
