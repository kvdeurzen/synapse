# Project Research Summary

**Project:** Synapse v3.0 Working Prototype
**Domain:** Claude Code native framework — MCP server integration, agent orchestration, install tooling, E2E workflow wiring
**Researched:** 2026-03-03
**Confidence:** HIGH

## Executive Summary

Synapse v3.0 is a "last mile" milestone: the data layer (LanceDB, 24 MCP tools) and agentic coordination framework (10 agents, 6 hooks, 7 skills, PEV workflow) are fully built. What v3.0 must deliver is the wiring layer that makes all of it usable — a one-command install script, three missing slash commands (`/synapse:init`, `/synapse:map`, `/synapse:plan`), project_id injection via SessionStart hook, dynamic skill selection from project config, concrete MCP usage instructions in every agent prompt, and a full end-to-end PEV workflow validation run. The recommended architecture is copy-based: an install script copies framework files into the user's `.claude/` directory, a new `.synapse/config/project.toml` file becomes the single source of truth for project identity and active skills, and the `synapse-startup.js` SessionStart hook reads that file and injects project context into every session.

The critical technical insight from research is that several failure modes are already known and documented — they are not hypothetical. Hook path resolution breaks when Claude Code is not launched from the repo root (two open GitHub issues confirm this; the fix is using `$CLAUDE_PROJECT_DIR` in all hook command strings). Custom subagents in `.claude/agents/*.md` may not inherit MCP tools without explicit `mcpServers:` frontmatter (GitHub issues #5465 and #13605). And no agent prompt currently tells agents where `project_id` comes from, making every MCP tool call likely to fail until that injection is wired. These three issues must be resolved before any meaningful E2E testing can occur.

The recommended build order is dependency-driven: project_id injection first (unlocks all MCP tool calls), then user-facing commands (init, map, plan), then install script packaging, then agent prompt improvements (MCP usage instructions, "MCP First" principle, subagent handoff protocol), then E2E validation. Dynamic skill injection and progress visibility (statusline hook) are P2 — important but not blocking the core PEV cycle. The "looks done but isn't" checklist from PITFALLS.md is the acceptance gate: hooks must actually fire (audit log written), subagent MCP calls must succeed, and at least one full PEV loop must complete on a real task.

---

## Key Findings

### Recommended Stack

No new packages are needed for v3.0. The existing stack — Bun, LanceDB, `@modelcontextprotocol/sdk`, `smol-toml 1.6.0`, `zod`, `bun:test` — handles all new requirements. The install script should be plain bash (runs before Bun is confirmed present on the user's machine). Hook scripts must remain CommonJS `.js` files invoked with `node`, because `node` is universally available while `bun` in PATH is user-specific and environment-dependent. The MCP server is registered in `.mcp.json` at the project root (not embedded in `settings.json`) per current Claude Code conventions.

**Core technologies:**
- `.mcp.json` (project root): MCP server config — correct Claude Code convention for project-scoped, version-controlled MCP registration; separate from `settings.json`
- `.claude/settings.json`: Hook wiring + permissions — generated from `settings.template.json` by install script, with `$CLAUDE_PROJECT_DIR`-prefixed hook command paths
- `.synapse/config/project.toml` (NEW): Single source of truth for `project_id`, project name, and active skills; read by startup hook at every session; written by `/synapse:init`
- `bun:test`: E2E scenario tests — no new test framework; add fixture-based tests under `packages/framework/test/e2e/`
- Plain bash `install.sh`: Install script — must run before Bun is confirmed present; uses `curl` for Ollama health check

**What NOT to use:**
- Relative paths in hook command strings — use `$CLAUDE_PROJECT_DIR`-prefixed paths; relative paths break when Claude Code is not launched from the repo root
- `smol-toml` stringify for config file generation — use string templates to preserve comments and formatting
- Global `~/.claude/settings.json` for Synapse hooks — project-scoped `.claude/settings.json` only; global installation creates invisible cross-project dependencies
- Playwright/vitest for E2E — agent-level scenario fixture tests with `bun:test` are the correct tool; UI automation is irrelevant for agent behavior validation

### Expected Features

The feature dependency graph has a clear critical path: install script gates everything; project_id injection unlocks agent MCP tool calls; agent prompt improvements gate meaningful E2E validation. Building in any other order produces false confidence.

**Must have (table stakes — v3.0):**
- Install script: prerequisite check + `.mcp.json` + `.claude/agents/` + `.claude/hooks/` + `settings.json`; Ollama smoke test before declaring success
- `/synapse:init` command: project setup (project.toml, init_project, opt-in CLAUDE.md amendment, auto-detect skills)
- `/synapse:map` command: `index_codebase` wrapper with Ollama health check and progress feedback
- `/synapse:plan` command: PEV workflow entry point via orchestrator agent
- `project_id` seamless injection: `project.toml` source of truth, startup hook injection, agents never ask user
- Agent MCP usage instructions: concrete tool call sequences, parameter shapes, valid enum values, "MCP First" principle, error handling protocol
- Domain mode injection: startup hook reads `trust.toml`, injects active modes; agents reference from context
- Context reference delivery: decomposer populates `context_refs` on leaf tasks; executors fetch them at start
- Findings persistence: Validator, Executor, Integration Checker, Plan Reviewer store outputs as queryable documents
- E2E PEV workflow validation: manual run on real project; document failures; patch top-3 issues found

**Should have (differentiators — v3.0):**
- Dynamic skill injection: `project.toml` skills field drives agent context; removes hardcoded TypeScript/Bun from `agents.toml`
- MCP as single source of truth: named principle in every agent prompt; agents query Synapse before filesystem
- Fail-closed error handling: explicit halt-and-report protocol when MCP tool returns `success: false`

**Defer (v3.x after E2E validation):**
- Progress statusline hook: requires confirmed working task tree first; building it for an unreliable data source wastes effort
- Stub skill content completion (tailwind, python, sql SKILL.md files are stubs): defer until first non-TypeScript project attempted
- Additional generic skills (brainstorming, testing-strategy, architecture-design)
- Tech debt resolution (escapeSQL dedup, created_at fix, lint warnings): can be addressed in parallel, not blocking

**Defer (v4+):**
- GSD/BMad project import
- MCP resources and prompt templates as slash commands
- Real-time collaboration / multi-user orchestration

### Architecture Approach

The v3.0 architecture is a copy-based wiring layer on top of the existing Claude Code native framework. An install script copies framework files (agents, hooks, commands) into the user's `.claude/` directory; Claude Code discovers them by directory convention. A new `.synapse/config/project.toml` file (created by `/synapse:init`) is the project identity anchor. The `synapse-startup.js` SessionStart hook reads it at every session start and injects `project_id`, active skills, and domain modes into `additionalContext`. Hooks run as CommonJS `.js` files invoked with `node`, with config paths resolved by searching a prioritized list of locations (`.synapse/config/` first, then `packages/framework/config/` for monorepo dev fallback) rather than using hardcoded `process.cwd()` assumptions.

**Major components:**
1. `install.sh` — copies framework files into `.claude/`, generates `settings.json` with `$CLAUDE_PROJECT_DIR` paths, creates `.synapse/config/` skeleton, validates prerequisites, runs smoke test
2. `project.toml` (NEW) — holds `project_id`, `name`, `skills`, `created_at`; read by startup hook; written by `/synapse:init`
3. `synapse-startup.js` (MODIFIED) — reads `project.toml`, injects project_id + skill names + domain modes; degrades gracefully if project.toml missing (prompts user to run `/synapse:init`)
4. `/synapse:init`, `/synapse:map`, `/synapse:plan` commands (NEW) — markdown instruction files in `.claude/commands/synapse/`; cover the complete user journey
5. Hook path resolution update (3 hooks MODIFIED) — `tier-gate.js`, `tool-allowlist.js`, `precedent-gate.js` updated to search `.synapse/config/` first
6. Agent prompt improvements (all 10 agents MODIFIED) — add `mcpServers: ["synapse"]` frontmatter, "MCP First" principle, concrete tool call sequences, subagent handoff protocol, error handling guidance
7. E2E validation run — serial PEV loop on real task; failure log drives post-validation patches

### Critical Pitfalls

1. **Hook path resolution uses relative paths — silently fails outside repo root** — hooks do not fire when Claude Code is launched from a subdirectory. Claude Code resolves relative hook command paths from its launch directory, not the settings file location. Fix: use `$CLAUDE_PROJECT_DIR` prefix in all hook command strings. Detect failure by checking whether `.synapse-audit.log` is written after tool calls.

2. **Subagents in `.claude/agents/` do not inherit MCP tools without explicit frontmatter** — GitHub issues #5465 and #13605 document that custom subagents may not receive MCP tools via implicit inheritance. Fix: add `mcpServers: ["synapse"]` to every agent `.md` frontmatter. Verify before any E2E testing by asking an executor subagent to call `get_task_tree` directly.

3. **project_id not available to agents — every MCP tool call fails** — every Synapse MCP tool requires `project_id` (regex-validated); no agent prompt specifies where it comes from. Without startup hook injection, agents produce Zod validation errors or ask the user. Fix: `project.toml` + startup hook injection must be the first deliverable before any agent work is validated.

4. **Agents bypass MCP and fall back to filesystem** — without concrete tool call examples (parameter values, response shapes, valid enum values), agents default to `Read`/`Grep`/`Glob`. The entire semantic search value is bypassed. Fix: every agent prompt needs a "Key Tool Sequences" section with literal examples showing parameter values and expected response structure.

5. **Validator overwrites task descriptions — original spec lost** — `update_task` does full field replacement; Validator calling it with findings destroys the original spec. Future agents cannot verify implementation against requirements. Fix: add explicit rule to Validator prompt to prepend findings rather than replace; store findings as a `store_document` call linked to the task.

6. **Ollama unavailable at install time — first real operation fails** — install script has no step to verify Ollama is running and `nomic-embed-text` is pulled. Users see "setup complete" then hit embedding errors immediately. Fix: install script must call `curl http://localhost:11434/api/tags`, check for `nomic-embed-text` model, and run a smoke test (`init_project` → `store_document` → `semantic_search`) before declaring success.

---

## Implications for Roadmap

Based on research, the dependency graph is tight and unambiguous. The suggested phase structure below matches the build order identified in ARCHITECTURE.md.

### Phase 1: Foundation — project_id Wiring and Hook Path Fixes

**Rationale:** Three of the top six pitfalls (hook path resolution, project_id injection, hook config path resolution) are silent showstoppers: they fail without obvious error messages and make every subsequent verification step meaningless. They must be resolved first. This is pure modification of existing files — no new commands, no install script.

**Delivers:** Working hook execution from any directory; project_id available in session context for all agents; hook config file resolution is location-independent.

**Addresses:** Pitfalls 1, 3, 5 (path resolution, project_id, config paths); defines `project.toml` format that all later phases depend on.

**Specific work:**
- Define `project.toml` schema (`[project] id`, `name`, `skills`, `created_at`)
- Modify `synapse-startup.js` to read `project.toml` and inject project_id + skills + domain modes
- Update `settings.template.json` hook command strings to use `$CLAUDE_PROJECT_DIR`
- Update `tier-gate.js`, `tool-allowlist.js`, `precedent-gate.js` to search `.synapse/config/` first

**Research flag:** Standard patterns — official Claude Code docs fully cover `$CLAUDE_PROJECT_DIR` and hook path resolution. Skip research-phase.

---

### Phase 2: User Journey Commands

**Rationale:** Once project_id injection works, the three missing slash commands can be built and tested directly within the Synapse repo (no clean install needed). These are the user-facing entry points — without them there is no documented path into Synapse for a new user. They depend on Phase 1 (need `project.toml` to write to) but not on the install script.

**Delivers:** Complete user journey: `/synapse:init` creates project identity → `/synapse:map` indexes codebase → `/synapse:plan` triggers PEV workflow.

**Addresses:** All "table stakes" features for user-facing commands; Pitfall 7 (Ollama check required in init and map, not just install script).

**Specific work:**
- `/synapse:init` command: ask project name, call `init_project`, auto-detect skills from project files, write `project.toml`, offer opt-in CLAUDE.md amendment
- `/synapse:map` command: read project_id from `project.toml`, verify Ollama health, call `index_codebase`, report results
- `/synapse:plan` command: read project_id, spawn `synapse-orchestrator` agent with user's goal

**Research flag:** Standard Claude Code command patterns — official docs verified, no additional research needed. Skip research-phase.

---

### Phase 3: Install Script

**Rationale:** The install script has no dependency on the content of the command files (Phase 2) — they can be developed in parallel. The install script gates the "first-time user on a clean machine" path, which E2E validation must simulate. It must be complete before Phase 5.

**Delivers:** Single `install.sh` command that wires Synapse into any project; prerequisite checks with actionable error messages; Ollama smoke test before declaring success; `.synapse/config/` skeleton created.

**Addresses:** "One-command install" table stakes; Pitfall 7 (Ollama validation); correct `$CLAUDE_PROJECT_DIR` paths from initial generation (not a post-install fix).

**Specific work:**
- Plain bash `install.sh` in `packages/framework/`
- Prerequisite checks: Bun version, Ollama running, nomic-embed-text model present
- Copy agents, hooks, commands to `.claude/`; generate `settings.json` with `$CLAUDE_PROJECT_DIR` paths
- Create `.synapse/config/` skeleton with `synapse.toml` placeholder
- Run smoke test: `init_project` → `store_document` → `semantic_search` → cleanup
- Print actionable next steps on success

**Research flag:** Standard install script patterns — no additional research needed. Skip research-phase.

---

### Phase 4: Agent Prompt Improvements

**Rationale:** Pitfall 4 (agents bypass MCP) and Pitfall 2 (subagent MCP access) must be resolved before E2E validation can produce meaningful results. Without concrete tool call examples, the E2E test will "pass" via filesystem fallback while testing nothing that matters. This phase updates all 10 agent `.md` files.

**Delivers:** Agents reliably use Synapse MCP tools; subagent handoff protocol ensures executors receive project_id, task_id, and doc_ids; Validator no longer overwrites task descriptions; "MCP First" principle enforced across all agents.

**Addresses:** Differentiator features — MCP as single source of truth; context reference delivery (decomposer populates context_refs); findings persistence; domain mode injection. Pitfalls 2, 4, 5 (subagent MCP, filesystem fallback, Validator overwrite).

**Specific work:**
- Add `mcpServers: ["synapse"]` to all 10 agent `.md` frontmatter files
- Add "Synapse MCP as Single Source of Truth" section to every agent prompt
- Add "Key Tool Sequences" section with literal parameter values to each agent prompt
- Add subagent handoff protocol to orchestrator (what to include in every Task call)
- Add Validator rule: prepend findings, never replace description; store findings as document
- Update decomposer to populate `context_refs` (doc_ids, decision_ids) on leaf tasks
- Update executor and validator to fetch `context_refs` at start of each task

**Research flag:** Moderate complexity — each agent requires careful review and iteration. No external research needed. If initial E2E run shows agents still bypassing MCP despite updated prompts, consider a targeted research pass on LLM instruction following for custom tool usage.

---

### Phase 5: E2E PEV Workflow Validation

**Rationale:** All prior phases are prerequisites. This phase exists because unknown failure modes in wave execution are expected — the PEV loop has never run end-to-end. Run serial first (single executor at a time) to isolate orchestration bugs from parallelism bugs.

**Delivers:** One complete PEV cycle (decompose → plan review → execute → validate → integration check) on a real task; documented failure log; top-3 bugs patched; `/synapse:status` output verified against task tree state.

**Addresses:** "E2E PEV workflow validation" P1 requirement; Pitfall 10 (unknown wave execution failures).

**Specific work:**
- Choose a small, real task for the first run (e.g., fix escapeSQL duplication tech debt)
- Ensure clean git working tree before test (git worktree creation fails on dirty trees)
- Run with `max_parallel_executors: 1` first; increase to 3 only after serial mode confirmed correct
- Monitor wave checkpoint blocks emitted by orchestrator; use as structured failure log
- Verify audit log written after each tool call (confirms hooks are firing)
- Patch top-3 failures; document remainder as v3.x backlog
- Verify `/synapse:status` matches task tree state at completion

**Research flag:** This phase is inherently discovery-driven — failure modes define what additional work is needed. No pre-execution research needed. Post-execution patches may require targeted research on specific failure categories.

---

### Phase 6: Dynamic Skill Injection (P2)

**Rationale:** Deferred until after E2E validation confirms the core PEV cycle works. Skill injection requires coordinated changes across `project.toml` (Phase 1 delivered the schema), startup hook logic (Phase 1 injected skill names), and agent prompts (Phase 4 updated prompts). The final piece — injecting actual SKILL.md content into `additionalContext` rather than just skill names — completes the system.

**Delivers:** Projects declare their stack once in `project.toml`; startup hook injects matching SKILL.md content; agents no longer hardcode TypeScript/Bun skills in `agents.toml`; framework is language-agnostic.

**Addresses:** Pitfall 8 (skill injection not wired atomically); removes the TypeScript/Bun hardcoding that breaks non-TypeScript projects.

**Specific work:**
- Update `synapse-startup.js` to read SKILL.md file content (not just names) and inject into `additionalContext`
- Remove hardcoded `skills = ["typescript", "bun"]` from `agents.toml` per-agent entries
- Verify: change `project.toml` skills to `["python"]`; confirm next session context includes Python skill content

**Research flag:** Standard patterns — no external research needed. Skip research-phase.

---

### Phase Ordering Rationale

- Phase 1 before everything: three critical pitfalls are silent showstoppers with no obvious error signals; no other phase verification is meaningful until they are fixed.
- Phase 2 before install script: commands can be developed and tested directly within the Synapse repo without a clean install; faster iteration.
- Phase 3 in parallel with Phase 2: install script has no dependency on command file content; the two can proceed simultaneously.
- Phase 4 before E2E: testing with agents that bypass MCP produces false positives; prompt quality gates must be in place before the validation run.
- Phase 5 last among P1 work: it is an integration test of everything preceding it; running it earlier produces failures that are better solved by completing the preceding phases.
- Phase 6 after Phase 5: additive feature; its absence does not prevent the PEV cycle from completing; its presence makes the framework language-agnostic.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (agent prompts):** If updated prompts still produce agents that bypass MCP in the E2E run, a targeted research pass on LLM instruction following for custom tools may be needed. Run one agent through the updated prompt before updating all 10.
- **Phase 5 (E2E validation):** Unknown failure modes by definition. Treat the first validation run as structured research: document every failure, categorize by root cause (hook, agent prompt, MCP tool, git/worktree), prioritize patches by frequency.

Phases with standard patterns (skip research-phase):
- **Phase 1 (hook wiring):** Official Claude Code docs fully cover `$CLAUDE_PROJECT_DIR`, hook path resolution, and SessionStart injection. Patterns are specific and verified.
- **Phase 2 (slash commands):** Claude Code command documentation is complete; follows the same pattern as existing `/synapse:new-goal` and `/synapse:status`.
- **Phase 3 (install script):** Plain bash install scripts are a solved problem. Ollama health check endpoint verified.
- **Phase 6 (skill injection):** Architecture is clear; the file I/O pattern is straightforward.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new packages needed; all choices verified against official Claude Code docs, npm, and Ollama issue tracker. `$CLAUDE_PROJECT_DIR` usage and `.mcp.json` conventions confirmed from official sources. `smol-toml 1.6.0` already installed. |
| Features | HIGH | Feature list derived from authoritative gap analysis (`PROTO_GAP_ANALYSIS.md`) and official Claude Code documentation. Comparative ecosystem research (GSD, GitHub MCP) is MEDIUM but not load-bearing for any decision. |
| Architecture | HIGH | Based on direct inspection of the existing codebase plus official sub-agents, skills, and hooks docs. Copy-based wiring is the confirmed production approach for Claude Code frameworks. `.synapse/` vs `.claude/` separation is intentional and correct. |
| Pitfalls | HIGH | Critical pitfalls 1 and 2 (hook paths, subagent MCP) are backed by specific open GitHub issues on the official tracker. Pitfall 3 (project_id) and Pitfall 9 (Validator overwrite) confirmed by direct codebase inspection. Pitfall 7 (Ollama) confirmed by running the install flow mentally against the existing code. |

**Overall confidence:** HIGH

### Gaps to Address

- **Ollama health check endpoint:** The `/api/tags` endpoint for Ollama health verification is confirmed via community issue tracker (not official API docs). If this endpoint changes, the install script health check breaks silently. Mitigation: also use `ollama list | grep nomic-embed-text` as a fallback check during implementation.

- **Statusline hook format:** The `statusLine.command` field in `settings.json` is described from GSD pattern observation (MEDIUM confidence), not directly from Claude Code official docs. Verify the exact key name before implementing the statusline hook (Phase 6 / P2). Does not block any P1 phase.

- **Subagent Task tool prompt length limits:** A recent GitHub issue (#14496, MEDIUM confidence) suggests large Task prompts may hit length limits in some Claude Code versions. The subagent handoff protocol (Phase 4) should be tested with realistic prompt sizes. Mitigation if limits are hit: store context in MCP and pass only IDs in the Task prompt.

- **agents.toml vs frontmatter precedence:** It is not fully confirmed whether Claude Code agent frontmatter `tools` lists override or merge with `agents.toml` per-agent tool allowlists when both are present. Safe approach: make frontmatter the authoritative source in Phase 4 and deprecate the `agents.toml` tools lists over time. Verify behavior during Phase 4 implementation.

---

## Sources

### Primary (HIGH confidence)
- Claude Code Hooks Reference (official docs): hook event names, `$CLAUDE_PROJECT_DIR`, matcher syntax, stdin/stdout JSON formats, exit codes
- Claude Code Sub-Agents Reference (official docs): agent frontmatter fields, `mcpServers:` declaration, `skills:` injection mechanism, two-level hierarchy
- Claude Code Skills Reference (official docs): SKILL.md frontmatter, dynamic injection, commands/ vs skills/ directory structure
- Claude Code Settings Reference (official docs): `.mcp.json` vs `settings.json` separation, scope hierarchy, `statusLine` field
- Claude Code Issue Tracker (#3583, #10367): hook path resolution bugs confirmed
- Claude Code Issue Tracker (#5465, #13605): subagent MCP tool inheritance bugs confirmed
- `PROTO_GAP_ANALYSIS.md` (first-party): authoritative v3.0 gap list
- `milestone 3 - notes and questions.md` (first-party): open questions and missing work items
- Direct codebase inspection: `packages/framework/hooks/*.js`, `packages/framework/agents/*.md`, `packages/framework/config/*.toml`, `packages/framework/settings.template.json`, `packages/framework/workflows/pev-workflow.md`
- smol-toml npm registry: version 1.6.0, TOML 1.1.0 spec support confirmed

### Secondary (MEDIUM confidence)
- GSD framework GitHub: command patterns, install experience, statusline hook pattern reference
- GitHub MCP server install guide: one-command install pattern reference
- Ollama issue tracker (#1378): `/api/tags` health check endpoint behavior
- Claude Code community (humanlayer.dev blog): CLAUDE.md as onboarding manual pattern
- Practitioner articles (builder.io, pubnub, upsun): AI agent orchestration failure patterns, git worktree usage for parallel agents
- Claude Code Issue Tracker (#14496): Task tool prompt length limits (recent, unresolved)

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
