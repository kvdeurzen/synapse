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
| 3 | Init | MCP tools not available after install — agent fell back to calling server via bun | MCP servers load at session start; running /synapse:init in the same session as install.sh means the synapse MCP server isn't registered yet. Cascades into map failure (agent can't call index_codebase without MCP context) | BLOCKER | OPEN |
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

## Verification Results

*Filled in during Plan 24-02 after patches applied.*

| Success Criterion | Result | Evidence |
|-------------------|--------|----------|
| SC1: Full RPEV cycle completes on rpi-camera-py | PENDING | — |
| SC2: .synapse-audit.log contains required tool entries | PENDING | — |
| SC3: Failure log documents issues with root causes | PENDING | — |
| SC4: /synapse:status matches get_task_tree state | PENDING | — |
