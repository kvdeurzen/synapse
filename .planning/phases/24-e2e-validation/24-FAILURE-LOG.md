# Phase 24: E2E Failure Log

**Run date:** 2026-03-06
**Target project:** /home/kanter/code/rpi-camera-py
**Release:** v3.0.0-alpha.1 (initial run) → v3.0.0-alpha.2 (post-patch run)

## Pre-Run Issues Fixed

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| init.md trust.toml schema: [rpev] with simplified keys instead of [rpev.involvement] with 16-entry matrix | MEDIUM | Updated init.md step 5 and step 6 to write full [rpev.involvement] matrix with 16 entries (4 levels x 4 stages), plus [rpev.domain_overrides] and [rpev] scalar keys matching packages/framework/config/trust.toml |

## Failure Log

*Issues documented as encountered during E2E run.*

| # | When | Issue | Root Cause | Severity | Status |
|---|------|-------|------------|----------|--------|
| 1 | Install | install.sh fails with 404 on tarball download | `/releases/latest` API returns empty for prerelease-only repos; fallback hardcoded to non-existent `v3.0` tag | BLOCKER | PATCHED |
| 2 | Install | tree-sitter native build fails during `bun install` | Node.js 24 headers require C++20 but tree-sitter binding.gyp defaults to C++17; `CXXFLAGS` not set | BLOCKER | PATCHED |
| 3 | Init | MCP tools not available after install — agent fell back to calling server via bun | MCP servers load at session start; running /synapse:init in the same session as install.sh means the synapse MCP server isn't registered yet. Cascades into map failure (agent can't call index_codebase without MCP context) | BLOCKER | PATCHED |
| 4 | Status | tool-allowlist hook denies all MCP calls from user's main session as "(unknown)" | Hook expects `actor` field in tool_input but main session never sets it; fail-closed treats missing actor as unauthorized | BLOCKER | PATCHED |
| 5 | Status | /synapse:status layout is inconsistent between runs | status.md gives the agent too much formatting discretion; output structure varies depending on data found and LLM interpretation | DEGRADED | OPEN |
| 6 | Refine | Agent queries get_smart_context (code overview, 32 items) then immediately spawns Explore agent to read all files anyway (28 tool uses, 58k tokens) | refine.md doesn't instruct agent to trust code index results as sufficient; agent defaults to filesystem exploration even when Synapse already returned code summaries | DEGRADED | OPEN |
| 7 | Refine | store_decision denied for synapse-orchestrator — both tool-allowlist and tier-gate block it | synapse-orchestrator missing from agents.toml (tool-allowlist) and trust.toml [tier_authority] (tier-gate); slash commands pass actor="synapse-orchestrator" but it was never registered | BLOCKER | PATCHED |
| 8 | Plan/Decompose | Initial message said "decompose epic into tasks" suggesting feature layer skipped — actually created 2 features with work packages underneath | Misleading orchestrator log message; hierarchy was correctly built (Epic → Feature → WP). Message said "tasks" but meant "work items" | COSMETIC | OPEN |
| 9 | Execute | /synapse:status unavailable during execution — orchestrator holds the session | Orchestrator runs in the main session; slash commands can't be invoked while an agent turn is active. No side-channel for status queries | DEGRADED | OPEN |
| 10 | Execute | Orchestrator context fills up, no strategic context clearing | Orchestrator doesn't /clear between major transitions (refine→plan→execute); verbose output compounds the problem. Long RPEV runs exhaust context window | DEGRADED | OPEN |
| 11 | Execute | Orchestrator output is excessively verbose, wasting context tokens | Agent prompts don't enforce concise output; orchestrator narrates every step in detail instead of using terse progress updates | DEGRADED | OPEN |
| 12 | Execute | Orchestrator calls update_task itself after executor agent completes, instead of executor updating its own task status | Executor agents should mark their own tasks done; orchestrator doing it duplicates work and wastes orchestrator context on bookkeeping that subagents should handle | DEGRADED | OPEN |
| 13 | Status | Agent Pool section says "not yet active" while Current Activity shows an agent running | Pool state document (pool-state-[project_id]) never written by orchestrator; status.md falls back to "not active" message. Orchestrator dispatches agents but doesn't maintain pool state doc | DEGRADED | OPEN |
| 14 | Execute | All MCP tool call parameters and JSON responses displayed to user — noisy and irrelevant | Claude Code shows full tool input/output by default; no way to suppress from agent prompts. This is a Claude Code UX limitation, not a Synapse bug | COSMETIC | OPEN |
| 15 | Execute | No feature branch created for epic/feature work — all changes on main | Orchestrator doesn't create branches before dispatching executors; executor agents don't use `isolation: "worktree"` as designed in Phase 21 | DEGRADED | OPEN |
| 16 | Execute | No executor task has committed its code changes — work sits uncommitted in working directory | Executor agent prompt doesn't enforce atomic commits per task; orchestrator doesn't verify commits after task completion | DEGRADED | OPEN |
| 17 | Init | Synapse scaffolding (.synapse/config/, .claude/ files) not committed after /synapse:init | init.md doesn't include a commit step; generated files are left untracked. Should commit them so they're version-controlled and visible in git history | DEGRADED | OPEN |
| 18 | Execute | Refactoring result left too much logic in server file — expected thin layer with pipelines extracted deeper | Decomposer/planner created work packages that were too coarse; "extract module" tasks didn't specify the target architecture deeply enough (thin server = routing only, all logic in domain modules) | DEGRADED | OPEN |
| 19 | Execute | Researcher agent never spawned during RPEV cycle | Orchestrator's Plan stage doesn't spawn researcher before decomposer/executor; goes straight from Refine decisions to task decomposition without domain research. Research step missing from RPEV Plan stage implementation | DEGRADED | OPEN |
| 20 | Refine | Duplicate `semantic_search("refinement state")` — /status and /refine run identical query back-to-back | Each slash command queries for state from scratch; no mechanism for one skill to pass results to the next in the same session. Wasted Ollama embedding round-trip | COSMETIC | OPEN |
| 21 | Execute | Epic + both Features marked `in_progress` simultaneously before any work package starts | Orchestrator fires 3 `update_task` calls on parent-level tasks that serve no functional purpose; features/epics should derive status from children, not be manually set ahead of actual work | DEGRADED | OPEN |
| 22 | Plan | Orchestrator re-reads source files that Explore agent already read during Refine | Each RPEV stage treats itself as starting from scratch; orchestrator doesn't reuse Refine-phase context. Same files read 3x: index, Explore agent, orchestrator | COSMETIC | OPEN |
| 23 | Execute | Orchestrator narrates full remaining pipeline after every single task completion (16+ times, ~1600 wasted tokens) | Orchestrator prompt doesn't cap output length per dispatch cycle or provide a terse progress template; re-explains dependency graph after every step | DEGRADED | OPEN |
| 24 | Plan | Orchestrator polls backgrounded decomposer agent twice, gets empty results before completion event | Orchestrator doesn't know to wait for the completion callback; tries active polling which the platform doesn't support well for backgrounded agents | COSMETIC | OPEN |
| 25 | Refine | `query_documents(tags: "rpev-stage")` call after empty `semantic_search` is redundant | refine.md instructs multiple state-check strategies but doesn't short-circuit when the first check conclusively shows nothing exists | COSMETIC | OPEN |
| 26 | Refine→Plan | Refinement document stored after user approves planning, not at refinement completion boundary | refine.md doesn't include a "persist refinement summary" step at phase end; if user had said "wait" instead of "yes", refinement output would never be persisted | DEGRADED | OPEN |
| 27 | Refine | Three parallel `store_decision` calls fail in cascade ("Sibling tool call errored"); architect re-formulates all three from scratch | Claude Code parallel calls are all-or-nothing on failure; orchestrator doesn't immediately escalate after first denial, and passes summary to architect instead of exact payloads (double formulation work) | DEGRADED | OPEN |
| 28 | Validate | Validation work-package tasks (F1-INT, F2-INT) never explicitly marked `done` — orphan tasks in tree | Orchestrator skips from "validators completed" to marking features done, without ensuring individual validation tasks are resolved first | DEGRADED | OPEN |
| 29 | Validate | Epic marked `done` without `get_task_tree` verification that all children are actually done | Orchestrator assumes completion from agent events rather than verifying task tree state; no tree-integrity check in Validate stage | DEGRADED | OPEN |
| 30 | Validate | No `index_codebase` re-run after execution — Synapse code index is completely stale post-refactoring | Neither executor prompts nor orchestrator include a re-indexing step; RPEV cycle assumes index is maintained but no stage is responsible for updating it | DEGRADED | OPEN |
| 31 | All | No explicit RPEV stage boundary markers or gate checks between Refine→Plan→Execute→Validate | Stages blend together without gates, boundary persists, or verification checks; makes RPEV non-auditable and non-repeatable | DEGRADED | OPEN |
| 32 | Plan | Plan decomposition never stored as a Synapse document — exists only as ephemeral terminal output | Decomposer creates task tree but the plan rationale (effort estimates, dependency reasoning, execution order) is never persisted as a `plan` category document | DEGRADED | OPEN |
| 33 | Status | `/synapse:status` fetches unfiltered `get_task_tree` (235+ lines JSON) instead of using filters | status.md doesn't instruct agent to use filtered queries or progressive disclosure; fetches entire tree unconditionally. Will not scale to larger projects | DEGRADED | OPEN |
| 34 | Plan | Orchestrator presents decomposer output without verifying against stored decisions; no plan_reviewer spawned | Plan stage has no "verify decomposition against decisions" step; plan_reviewer agent type exists but is never used | DEGRADED | OPEN |
| 35 | Execute | Orchestrator resolves dependencies in its own context instead of updating `is_blocked` in Synapse task system | Orchestrator decides which tasks are unblocked from its own tracking; never calls `update_task(is_blocked: false)`. Task tree shows stale blocked counts divergent from actual execution state | DEGRADED | OPEN |
| 36 | Refine→Execute | Hardware testing implementation never surfaced as a usability/DX decision — only technical choice (SSH vs deploy) was captured | Refine asked "SSH or deploy to Pi?" (Tier 1 architectural) but never explored the developer experience: how to configure Pi address, what happens when Pi is unreachable, test output format, ease of running `pytest -m hardware` for the first time. Executor implemented DX-affecting details (paramiko fixtures, config structure) without user input. Decisions with both technical and UX facets should surface the UX dimension separately | DEGRADED | OPEN |
| 37 | All | Audit log agent attribution broken — 91% of entries (430/471) logged as "unknown" | audit-log.js extracts agent from `actor` or `assigned_agent` in tool_input, but the main session and most subagent calls don't populate these fields. Cannot answer "how many tokens did the decomposer use?" from audit data. Makes per-agent cost analysis impossible | DEGRADED | OPEN |
| 38 | Validate | No session summary or cost report generated after RPEV cycle completes | Audit log contains raw per-call data (471 entries, ~628k tokens) but no automated aggregation. No end-of-session summary file, no $/token cost estimate, no per-agent breakdown. User must parse JSON manually to understand resource consumption. Also: redundant `synapse-audit.js` hook exists alongside the more capable `audit-log.js` | DEGRADED | OPEN |
| 39 | Install | tree-sitter native module builds with Bun but fails at Bun runtime — MCP server won't start | install.sh generates .mcp.json with `"command": "bun"` but tree-sitter's native bindings are incompatible with Bun's runtime. Server must run under Node.js via `npx tsx`. Hooks (pure JS, no tree-sitter) are fine with bun | BLOCKER | PATCHED |
| 40 | Init | /synapse:init parallelizes Write(trust.toml) with init_project — Write fails because .synapse/config/ not yet created, cascades as "Sibling tool call errored" | init.md steps 3→6→7 are a dependency chain (mkdir → write files → register DB) but LLM parallelizes them. No sequencing instructions in prompt. Init recovers on retry but wastes a turn | DEGRADED | PATCHED |

## Failure Summary

**Total: 40 issues** (5 BLOCKER, 28 DEGRADED, 7 COSMETIC)
- BLOCKER: 5 (all PATCHED)
- DEGRADED: 28 (27 OPEN, 1 PATCHED -- #40)
- COSMETIC: 7 (all OPEN)

**Top themes:**
1. **No RPEV stage discipline** -- stages blend without gates, boundary persists, or verification (#26, #31, #32, #34)
2. **Orchestrator as bottleneck** -- does too much bookkeeping instead of delegating (#12, #21, #23, #28, #29, #35)
3. **Stale Synapse state** -- task tree blocked counts and code index diverge from reality (#30, #35)
4. **Redundant queries** -- skills/phases don't share context, each starts from scratch (#6, #20, #22, #25)
5. **No git discipline** -- no branches, no commits, no scaffolding versioning (#15, #16, #17)

## Patches Applied

### Patch 1: install.sh prerelease resolution (BLOCKER #1)
- **File:** packages/server/install.sh
- **Change:** Added fallback to `/releases?per_page=1` API when `/releases/latest` returns nothing (prerelease-only repos have no "latest" stable release)
- **Verified by:** Successful install from alpha.1 tarball
- **Commit:** 79125f7 (applied during 24-01)

### Patch 2: tree-sitter C++20 build flag (BLOCKER #2)
- **File:** packages/server/install.sh
- **Change:** Added `CXXFLAGS="-std=c++20"` to `bun install` in Section 6; Node.js 24 headers require C++20 but tree-sitter binding.gyp defaults to C++17
- **Verified by:** Successful `bun install` during re-install
- **Commit:** 6838706 (applied during 24-01)

### Patch 3: MCP session restart instruction (BLOCKER #3)
- **File:** packages/server/install.sh
- **Change:** Added prominent restart warning to Section 11 success output. MCP servers load at session start; running /synapse:init in the same session as install.sh means the synapse server is not registered. Install output now explicitly instructs user to exit and reopen Claude Code before running /synapse:init.
- **Verified by:** Visual inspection of install.sh output text
- **Commit:** (this commit)

### Patch 4: tool-allowlist main session pass-through (BLOCKER #4)
- **File:** .claude/hooks/tool-allowlist.js
- **Change:** Allow empty/missing `actor` field to pass through instead of fail-closed denial; main session calls do not set actor field
- **Verified by:** /synapse:status no longer denied after patch
- **Commit:** 4f67b63 (applied during 24-01)

### Patch 5: MCP server command bun→npx tsx (BLOCKER #39)
- **File:** packages/server/install.sh
- **Change:** Changed .mcp.json generation from `"command": "bun", "args": ["run", ...]` to `"command": "npx", "args": ["tsx", ...]`. tree-sitter native module builds under Bun but fails at Bun runtime; Node.js/tsx works. Added Node.js + npx prerequisite checks. Added Ollama systemd troubleshooting note to install output.
- **Verified by:** rpi-camera-py re-run confirmed npx tsx starts the MCP server successfully
- **Commit:** (this commit)

### Patch 6: synapse-orchestrator registration (BLOCKER #7)
- **File:** packages/framework/config/agents.toml, .synapse/config/agents.toml, packages/framework/config/trust.toml
- **Change:** Added synapse-orchestrator to agents.toml (tool allowlist) and trust.toml [tier_authority] (tier gate); slash commands pass actor="synapse-orchestrator" which was never registered
- **Verified by:** store_decision no longer denied for orchestrator
- **Commit:** 79c4426 (applied during 24-01)

## Known Limitations (Non-Blocking)

| # | Issue | Severity | Decision |
|---|-------|----------|----------|
| 5 | /synapse:status layout inconsistent | DEGRADED | Deferred -- requires structured output template, not just prompt changes |
| 6 | Refine agent explores files despite code index | DEGRADED | Deferred -- needs trust-code-index instruction in refine.md |
| 8 | Misleading "decompose into tasks" log message | COSMETIC | Deferred -- cosmetic wording fix |
| 9 | /synapse:status unavailable during orchestrator turn | DEGRADED | Deferred -- architectural; needs side-channel or background query |
| 10 | No context clearing between RPEV stages | DEGRADED | Deferred -- needs /clear integration in orchestrator |
| 11 | Orchestrator output excessively verbose | DEGRADED | Deferred -- needs output budget in orchestrator prompt |
| 12 | Orchestrator updates tasks instead of executor | DEGRADED | Deferred -- executor prompt needs self-update instruction |
| 13 | Agent Pool shows "not active" despite agents running | DEGRADED | Deferred -- orchestrator needs pool-state document writes |
| 14 | Full MCP JSON displayed to user | COSMETIC | Deferred -- Claude Code UX limitation |
| 15 | No feature branches for epic work | DEGRADED | Deferred -- needs worktree/branch integration |
| 16 | No atomic commits per task | DEGRADED | Deferred -- executor prompt needs commit instruction |
| 17 | Synapse scaffolding not committed after init | DEGRADED | Deferred -- init.md needs commit step |
| 18 | Refactoring too coarse-grained | DEGRADED | Deferred -- decomposer needs architectural depth |
| 19 | Researcher agent never spawned | DEGRADED | Deferred -- RPEV Plan stage missing research step |
| 20 | Duplicate semantic_search calls | COSMETIC | Deferred -- skills need result-passing mechanism |
| 21 | Parent tasks marked in_progress prematurely | DEGRADED | Deferred -- orchestrator should derive parent status |
| 22 | Orchestrator re-reads files from Refine | COSMETIC | Deferred -- stages need context handoff |
| 23 | Orchestrator narrates full pipeline repeatedly | DEGRADED | Deferred -- needs terse progress template |
| 24 | Orchestrator polls backgrounded agent | COSMETIC | Deferred -- needs completion callback pattern |
| 25 | Redundant query_documents after empty semantic_search | COSMETIC | Deferred -- needs short-circuit logic |
| 26 | Refinement doc stored late | DEGRADED | Deferred -- needs persist step at phase boundary |
| 27 | Parallel store_decision cascade failure | DEGRADED | Deferred -- needs sequential fallback or retry |
| 28 | Validation tasks not marked done | DEGRADED | Deferred -- orchestrator needs task-completion sweep |
| 29 | Epic marked done without tree verification | DEGRADED | Deferred -- needs tree-integrity check |
| 30 | No index_codebase re-run after execution | DEGRADED | Deferred -- needs re-index step in Validate stage |
| 31 | No RPEV stage boundary markers | DEGRADED | Deferred -- needs gate-check architecture |
| 32 | Plan decomposition not stored as document | DEGRADED | Deferred -- decomposer needs store_document step |
| 33 | /synapse:status fetches unfiltered task tree | DEGRADED | Deferred -- needs filtered queries |
| 34 | No plan_reviewer spawned during Plan stage | DEGRADED | Deferred -- Plan stage needs verification step |
| 35 | Orchestrator resolves deps instead of task system | DEGRADED | Deferred -- needs is_blocked update integration |
| 36 | Hardware testing UX not surfaced as decision | DEGRADED | Deferred -- refinement needs UX dimension capture |
| 37 | Audit log 91% "unknown" attribution | DEGRADED | Deferred -- needs actor field propagation |
| 38 | No session summary or cost report | DEGRADED | Deferred -- needs end-of-session aggregation |
| 39 | tree-sitter incompatible with Bun runtime | BLOCKER | PATCHED -- MCP server uses npx tsx, hooks stay bun |

## Verification Results

*Filled in during Plan 24-02 after patches applied.*

| Success Criterion | Result | Evidence |
|-------------------|--------|----------|
| SC1: Full RPEV cycle completes on rpi-camera-py | PENDING | — |
| SC2: .synapse-audit.log contains required tool entries | PENDING | — |
| SC3: Failure log documents issues with root causes | PENDING | — |
| SC4: /synapse:status matches get_task_tree state | PENDING | — |
