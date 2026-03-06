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

## Verification Results

*Filled in during Plan 24-02 after patches applied.*

| Success Criterion | Result | Evidence |
|-------------------|--------|----------|
| SC1: Full RPEV cycle completes on rpi-camera-py | PENDING | — |
| SC2: .synapse-audit.log contains required tool entries | PENDING | — |
| SC3: Failure log documents issues with root causes | PENDING | — |
| SC4: /synapse:status matches get_task_tree state | PENDING | — |
