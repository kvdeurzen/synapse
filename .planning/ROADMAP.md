# Roadmap: Synapse

## Milestones

- ✅ **v1.0 Data Layer** - Phases 1-9 (shipped 2026-03-01)
- ✅ **v2.0 Agentic Framework** - Phases 10-14 (shipped 2026-03-02)
- 🚧 **v3.0 Working Prototype** - Phases 15-25 (in progress)

## Phases

<details>
<summary>✅ v1.0 Data Layer (Phases 1-9) - SHIPPED 2026-03-01</summary>

- [x] Phase 1: MCP Foundation (2/2 plans)
- [x] Phase 2: Database Schema (3/3 plans)
- [x] Phase 3: Embedding Service (2/2 plans)
- [x] Phase 4: Document Management (4/4 plans)
- [x] Phase 5: Document Search (4/4 plans)
- [x] Phase 6: Code Indexing (5/5 plans)
- [x] Phase 7: Code Search and Integration Validation (2/2 plans)
- [x] Phase 8: Fix project_meta Integration Wiring (1/1 plan)
- [x] Phase 9: Tech Debt Documentation Cleanup (1/1 plan)

See [v1.0 Archive](milestones/v1.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v2.0 Agentic Framework (Phases 10-14) - SHIPPED 2026-03-02</summary>

- [x] Phase 10: Decision Tracking Tooling (2/2 plans)
- [x] Phase 11: Task Hierarchy Tooling (3/3 plans)
- [x] Phase 12: Framework Bootstrap (3/3 plans)
- [x] Phase 13: Agent Specialization, Skill Loading, and Trust (5/5 plans)
- [x] Phase 13.1: Move Separate Modules into a Single Repo (2/2 plans)
- [x] Phase 14: Quality Gates and PEV Workflow (4/4 plans)

See [v2.0 Archive](milestones/v2.0-ROADMAP.md) for full details.

</details>

### v3.0 Working Prototype (In Progress)

**Milestone Goal:** Wire up all existing pieces into a usable end-to-end product — from install to agent-driven RPEV workflow execution on a real project.

- [x] **Phase 15: Foundation** - project.toml schema, project_id injection via startup hook, hook path fixes, config resolution (completed 2026-03-03)
- [x] **Phase 16: User Journey Commands** - /synapse:init, /synapse:map, /synapse:refine, /synapse:status, /synapse:focus slash commands and user journey documentation (completed 2026-03-05)
- [x] **Phase 17: Tech Debt** - escapeSQL dedup, created_at fix, INT-02 ULID edges, lint warnings, config ordering (completed 2026-03-05)
- [x] **Phase 18: RPEV Orchestration** - readiness gating, auto-queue Refine→Plan→Execute, trust config expansion, decision persistence (completed 2026-03-05)
- [x] **Phase 19: Agent Prompts + Level-Awareness** - MCP-first principle, tool sequences, frontmatter, handoff protocol, level-aware behavior (plan 1/3 complete)
- [x] **Phase 20: Skills Completion** - dynamic skill injection from project.toml, language-agnostic agents, fleshed-out skills, new generic skills (completed 2026-03-05)
- [x] **Phase 21: Agent Pool** - configurable slots, auto-assignment, work queue, agent-based focus (completed 2026-03-06)
- [x] **Phase 22: Install Script** - one-command install.sh with prerequisite checks, file wiring, and Ollama smoke test (completed 2026-03-06)
- [x] **Phase 23: Visibility + Notifications** - statusline hook, blocked counter, project_overview progress, configurable notifications (completed 2026-03-06)
- [x] **Phase 24: E2E Validation** - full RPEV cycle on a real task, hook verification, failure log, status verification (completed 2026-03-07)
- [~] **Phase 25: Agent Behavior Hardening** - fix DEGRADED issues from E2E run: orchestrator prompt discipline, RPEV stage gates, git workflow, token efficiency, audit attribution (INSERTED) — 5/6 plans complete, E2E re-validation (25-04) deferred to usage
- [ ] **Phase 26: Usage Findings** - address issues discovered during real usage on rpi-camera-py before declaring v3.0 release
- [x] **Phase 26.1: Further Improvements Agentic Framework** - gateway architecture, doer+reviewer pipeline, orchestrator scope reduction, decision draft flow (INSERTED) (completed 2026-03-10)
- [x] **Phase 26.2: Agent Handoff Tightening** - structured task fields, unified context loading, per-agent contracts, gateway protocol template (INSERTED) (completed 2026-03-10)

## Phase Details

### Phase 15: Foundation
**Goal**: project_id is seamlessly available in every agent session and hooks execute correctly regardless of where Claude Code is launched from
**Depends on**: Phase 14 (v2.0 complete)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. A `.synapse/config/project.toml` file with `project_id`, `name`, `skills`, and `created_at` fields is the recognized schema — the startup hook reads it without error
  2. After session start, agents receive `project_id` in their context without being asked to look it up or enter it manually
  3. Hooks fire correctly when Claude Code is launched from a subdirectory — `.synapse-audit.log` is written after any tool call regardless of launch directory
  4. `tier-gate.js`, `tool-allowlist.js`, and `precedent-gate.js` resolve their config from `.synapse/config/` when present, falling back to `packages/framework/config/` for monorepo dev
**Plans**: 2 plans

Plans:
- [x] 15-01: Create resolveConfig() utility, update synapse-startup.js to read project.toml and inject project_id + skills (FOUND-01, FOUND-02)
- [x] 15-02: Update gate hooks to use resolveConfig(), register Synapse hooks in settings.json with $CLAUDE_PROJECT_DIR (FOUND-03, FOUND-04)

### Phase 16: User Journey Commands
**Goal**: A new user has a clear, documented path from zero to running their first RPEV workflow — five slash commands cover every step of the user journey, designed for the recursive RPEV model
**Depends on**: Phase 15
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04
**Success Criteria** (what must be TRUE):
  1. Running `/synapse:init` creates `project.toml`, calls `init_project`, seeds trust.toml RPEV section, and offers an opt-in CLAUDE.md amendment — the project is registered without manual MCP calls
  2. Running `/synapse:map` verifies Ollama is running, indexes the codebase, and reports progress — the user sees confirmation before and after, not a silent wait
  3. Running `/synapse:refine` starts a brainstorming session that tracks decisions (DECIDED/OPEN/EMERGING), persists state via store_document, and checks level-aware readiness criteria — the user shapes work at any hierarchy level
  4. A written user journey document exists describing the complete flow from install to ongoing use as step-by-step instructions
**Plans**: 3 plans

Plans:
- [x] 16-01-PLAN.md — /synapse:init + /synapse:map commands (CMD-01, CMD-02)
- [x] 16-02-PLAN.md — /synapse:refine + /synapse:status evolution + delete new-goal.md (CMD-03)
- [x] 16-03-PLAN.md — /synapse:focus + user journey documentation (CMD-04)

### Phase 17: Tech Debt
**Goal**: The codebase has no known correctness bugs, no duplicated utility code, and no lint warnings — the foundation is clean before RPEV rework
**Depends on**: Phase 15
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05
**Success Criteria** (what must be TRUE):
  1. A single `escapeSQL` helper exists in one shared location — `init-project.ts` and `index-codebase.ts` both import it rather than defining their own copy
  2. Re-running `init_project` on an existing project does not overwrite `project_meta.created_at` — the original creation timestamp is preserved
  3. AST import edges created by `index_codebase` use ULIDs that `get_related_documents` can resolve — relationship graph traversal returns results for code relationships
  4. `bun run lint` (or equivalent) exits with zero warnings on both packages
  5. Autonomy mode ordering (`autopilot` → `co-pilot` → `advisory`) is consistent across all config files and agent prompts that reference it
**Plans**: 2 plans

Plans:
- [x] 17-01: Extract shared escapeSQL helper (DEBT-01), fix project_meta.created_at preservation (DEBT-02), resolve INT-02 ULID edges (DEBT-03)
- [x] 17-02: Fix lint warnings across both packages (DEBT-04) and normalize autonomy mode ordering (DEBT-05)

### Phase 18: RPEV Orchestration
**Goal**: The recursive RPEV engine drives work forward — Refine completion triggers Plan, Plan triggers Execute via work queue, Validate reports results. Trust config controls user involvement at each level.
**Depends on**: Phase 16
**Requirements**: RPEV-01, RPEV-02, RPEV-03, RPEV-04, RPEV-05, RPEV-06, RPEV-07, RPEV-08
**Success Criteria** (what must be TRUE):
  1. When a Refine session confirms readiness, the system auto-queues a Plan stage for that item — no manual `/synapse:plan` command required
  2. Trust config (`trust.toml` `[rpev.involvement]` section) controls which hierarchy levels require explicit user approval before stage transitions
  3. The synapse-orchestrator agent implements the RPEV flow: Refine->Plan->Execute->Validate with recursive descent at each hierarchy level
  4. Decision state from Refine (DECIDED/OPEN/EMERGING) persists across sessions and feeds into the Plan stage
  5. RPEV stage documents (stored via store_document with fixed doc_id pattern) track state per item
  6. `/synapse:status` queries stage documents and shows items needing approval in "Needs Your Input" section
  7. `/synapse:focus` implements two-tier approval UX (summary + approve/reject/discuss)
  8. Failed items with exhausted retries appear as flagged in `/synapse:status` with diagnostic info
**Plans**: 3 plans

Plans:
- [x] 18-01-PLAN.md — Expand trust.toml with involvement matrix, update synapse-startup.js to inject it (RPEV-02)
- [x] 18-02-PLAN.md — Update synapse-orchestrator.md and pev-workflow.md for RPEV model (RPEV-01, RPEV-03, RPEV-04, RPEV-05, RPEV-08)
- [x] 18-03-PLAN.md — Bridge refine.md to stage documents, update status.md/focus.md for approvals, update agents.toml (RPEV-01, RPEV-06, RPEV-07)

### Phase 19: Agent Prompts + Level-Awareness
**Goal**: All agents reliably use Synapse MCP tools, pass context in handoffs, store findings, and adjust behavior based on hierarchy level
**Depends on**: Phase 18
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-07, AGENT-08, AGENT-09, AGENT-10, AGENT-11
**Success Criteria** (what must be TRUE):
  1. Every agent `.md` file has `mcpServers: ["synapse"]` in its frontmatter — Claude Code grants Synapse tool access to all subagents without manual wiring
  2. Every agent prompt has a "Synapse MCP as Single Source of Truth" section and a "Key Tool Sequences" section with literal parameter values — agents query Synapse before reading the filesystem
  3. The orchestrator's Task calls include `project_id`, `task_id`, and relevant `doc_ids` in the prompt — subagents have the context they need without asking
  4. The Validator never calls `update_task` with its findings as the description — it stores findings via `store_document` and links them to the task, preserving the original spec
  5. When a Synapse MCP tool returns `success: false`, every agent prompt specifies the agent must halt and report to the orchestrator rather than continuing
**Plans**: 3 plans

Plans:
- [x] 19-01-PLAN.md — Add mcpServers frontmatter + shared MCP header + error handling to all 11 agents (AGENT-01, AGENT-03, AGENT-08)
- [ ] 19-02-PLAN.md — Expand Key Tool Sequences with literal parameters + domain mode injection (AGENT-02, AGENT-09)
- [ ] 19-03-PLAN.md — Orchestrator handoff protocol, validator findings-as-document, persistence patterns, context_refs flow (AGENT-04, AGENT-05, AGENT-06, AGENT-07, AGENT-10, AGENT-11)

### Phase 20: Skills Completion
**Goal**: Projects declare their stack once in project.toml and agents automatically receive the right skill content — the framework works for any language stack, not just TypeScript/Bun
**Depends on**: Phase 15 (can parallel with 18-19)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05
**Success Criteria** (what must be TRUE):
  1. Changing `skills` in `project.toml` to `["python"]` and restarting the session injects Python skill content into agent context — no `agents.toml` edit required
  2. The per-agent hardcoded `skills = ["typescript", "bun"]` entries are removed from `agents.toml` — skill assignment is entirely driven by `project.toml`
  3. Agent prompts contain no hardcoded `.ts` file extensions or `bun test` references — examples use language-neutral placeholders
  4. The tailwind, python, and sql SKILL.md files contain actionable content drawn from community standards — not placeholder stubs
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — Dynamic skill manifest injection + agents.toml role_skills (SKILL-01, SKILL-02)
- [ ] 20-02-PLAN.md — Language-agnostic agent prompts + skill content (SKILL-03, SKILL-04, SKILL-05)

### Phase 21: Agent Pool
**Goal**: Configurable pool of agent slots that auto-assigns to highest-priority unblocked work, enabling the "system drives, user unblocks" model
**Depends on**: Phase 18, Phase 19
**Requirements**: POOL-01, POOL-02, POOL-03, POOL-04
**Success Criteria** (what must be TRUE):
  1. Pool config in `trust.toml` defines max concurrent agent slots — the system respects the configured limit
  2. Unblocked work items are auto-assigned to available agent slots by priority — no manual agent dispatch required
  3. `/synapse:focus agent C` shows what agent C is working on and allows interaction
  4. `/synapse:status` displays agent pool activity (active agents, their current tasks, idle slots)
**Plans**: 2 plans

Plans:
- [ ] 21-01-PLAN.md — Config + pool manager core: trust.toml max_pool_slots, startup injection, orchestrator Pool Manager Protocol, pev-workflow pool dispatch (POOL-01, POOL-02)
- [ ] 21-02-PLAN.md — Visibility + agent interaction: status.md live pool section + token aggregates, focus.md agent detail view + cancel action (POOL-03, POOL-04)

### Phase 22: Install Script
**Goal**: A new user can wire Synapse into any project with a single command and receive actionable feedback at every step
**Depends on**: Phase 19, Phase 20 (after files stabilize)
**Requirements**: INST-01, INST-02, INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. Running `bash install.sh` on a clean machine checks for Bun version, Ollama running, and nomic-embed-text model — missing prerequisites produce an actionable error message, not a cryptic failure
  2. After `install.sh` completes, `.claude/agents/`, `.claude/hooks/`, `.claude/commands/synapse/`, `.mcp.json`, and `.claude/settings.json` all exist with correct content and `$CLAUDE_PROJECT_DIR`-prefixed hook paths
  3. `install.sh` runs a smoke test (`init_project` → `store_document` → `semantic_search`) before printing success — the user only sees "Done" if Synapse is actually operational
  4. A usage manual exists documenting the complete user journey, commands reference, and configuration
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — install.sh + smoke-test.mjs: prerequisite checks, file copy, settings.json/mcp.json generation and merge, smoke test (INST-01, INST-02, INST-03)
- [ ] 22-02-PLAN.md — Usage manual: expand docs/user-journey.md with install, commands, config, troubleshooting (INST-04)

### Phase 23: Visibility + Notifications
**Goal**: Users see progress in Claude Code and get notified about blocked items per their trust config
**Depends on**: Phase 21
**Requirements**: VIS-01, VIS-02
**Success Criteria** (what must be TRUE):
  1. While an RPEV workflow is running, the Claude Code status line shows the active item, current stage, and task completion ratio
  2. Calling `project_overview` returns a section showing task tree progress (total tasks, completed, blocked, in-progress) alongside the existing document statistics
  3. Blocked items trigger notifications per trust config — pull (shown in /synapse:status) by default, push (proactive) when enabled
**Plans**: 2 plans

Plans:
- [x] 23-01-PLAN.md — Statusline hook RPEV progress + orchestrator state file write protocol (VIS-01)
- [x] 23-02-PLAN.md — Enhanced project_overview with task_progress/pool_status/needs_attention + /synapse:status update (VIS-02)

### Phase 24: E2E Validation
**Goal**: The complete **RPEV** cycle runs on a real task — from Refine through Plan, Execute, and Validate — with hooks verified, failure modes documented, and status accurately reflected
**Depends on**: Phase 21, Phase 22, Phase 23
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04 (updated to reference RPEV)
**Success Criteria** (what must be TRUE):
  1. A full Refine → Plan → Execute → Validate cycle completes on a real task without manual intervention beyond starting the workflow
  2. `.synapse-audit.log` contains entries for every Synapse MCP tool call made during the E2E run — confirming hooks are firing and not silently failing
  3. A failure log document exists listing at least the top-3 failure modes encountered, their root causes, and the patches applied — future operators know what to expect
  4. At the end of the E2E run, `/synapse:status` output matches the actual task tree state returned by `get_task_tree` — no stale or incorrect status display
**Plans**: 2 plans

Plans:
- [ ] 24-01-PLAN.md — Alpha release (commit framework files, tag v3.0.0-alpha.1, gh release) + pre-run fix (init.md trust schema) + install on rpi-camera-py + run RPEV cycle (E2E-01, E2E-02, E2E-03)
- [ ] 24-02-PLAN.md — Patch BLOCKER failures + tag v3.0.0-alpha.2 + abbreviated re-run verification + SC1-SC4 checklist (E2E-03, E2E-04)

### Phase 25: Agent Behavior Hardening
**Goal**: The RPEV orchestrator and agent prompts produce a usable, efficient workflow — with explicit stage gates, terse output, self-managing subagents, git discipline, and accurate observability
**Depends on**: Phase 24 (failure log as input)
**Requirements**: ABH-01, ABH-02, ABH-03, ABH-04, ABH-05, ABH-06
**Success Criteria** (what must be TRUE):
  1. RPEV stages have explicit boundaries — stage documents are persisted at each transition, gate checks verify prerequisites before proceeding
  2. The orchestrator delegates bookkeeping to subagents — executors mark their own tasks done, validators update their own findings, orchestrator context stays lean
  3. Executors create atomic commits per task and the orchestrator verifies commits exist before marking tasks done
  4. /synapse:status output is consistent across runs and uses filtered queries that scale to 100+ task trees
  5. Audit log entries have correct agent attribution (not "unknown") for at least 80% of calls
  6. A second E2E run on rpi-camera-py shows measurably fewer issues than the first run (target: 0 BLOCKER, <10 DEGRADED)
**Plans**: 4 plans

Plans:
- [x] 25-01-PLAN.md — Orchestrator + executor + decomposer prompt hardening: stage gates, delegation, git workflow, terse output, research/reviewer steps (ABH-01, ABH-02, ABH-03)
- [x] 25-02-PLAN.md — Slash command prompt fixes: status.md filtered queries + template, refine.md code index trust + persist + UX, init.md commit step (ABH-04)
- [x] 25-03-PLAN.md — Hook/infrastructure: audit-log.js attribution, synapse-audit.js removal, session-summary.js, 8 agent attribution strengthening (ABH-05)
- [ ] 25-04-PLAN.md — E2E re-validation on rpi-camera-py: abbreviated run verifying all hardening changes (ABH-06)
- [x] 25-05-PLAN.md — Research-driven decisions: researcher.md with external research capabilities, precedent-checking, structured findings (ABH-07)
- [x] 25-06-PLAN.md — PR workflow: gh pr create after integration, structured template, involvement-mode merge gate, explicit git revert rollback (ABH-08)

**Scope** (from 24-FAILURE-LOG.md DEGRADED issues):

Group A — Orchestrator prompt hardening (#10, #11, #12, #13, #15, #16, #19, #21, #23, #28, #29, #30, #31, #32, #34, #35):
- RPEV stage boundary discipline (gate checks, stage documents, /clear between stages)
- Terse output budget (progress template, no pipeline narration)
- Delegate bookkeeping to subagents (executor self-update, validator findings-as-document)
- Git workflow (feature branches, atomic commits per task)
- Task tree integrity (verify children before marking parent done, update is_blocked)
- Re-index after execution, store plan document, spawn researcher + plan_reviewer

Group B — Slash command prompt fixes (#5, #6, #17, #26, #33, #36):
- status.md structured output template + filtered queries
- refine.md trust code index, persist at boundary, surface UX decisions
- init.md commit scaffolding step

Group C — Hook/infrastructure fixes (#37, #38):
- audit-log.js agent attribution fix
- Session summary generation (end-of-cycle aggregation)

Deferred to v3.1 (#9, #18, #27):
- /synapse:status during execution (architectural — needs side-channel)
- Decomposer task granularity (needs deeper decomposer rework)
- Parallel store_decision cascade (Claude Code platform limitation)

### Phase 26: Usage Findings
**Goal**: Address issues discovered during real usage of Synapse on rpi-camera-py — the final polish pass before declaring v3.0 release-ready
**Depends on**: Phase 25, real usage session(s)
**Requirements**: TBD (populated as findings accumulate)
**Success Criteria** (what must be TRUE):
  1. All BLOCKER-severity findings from usage are resolved
  2. Install script reliably deploys the latest framework to a clean project
  3. The RPEV cycle can run end-to-end without manual workarounds
**Plans**: TBD (created as findings are collected)

Plans:
- *(plans will be added as usage findings are reported)*

### Phase 26.5: Document Controller + Version Management (INSERTED)
**Goal**: Add a Document Controller agent as the final quality gate in the RPEV pipeline before PR creation — ensuring documentation freshness, requirement traceability, and changelog generation. Plus conventional commit validation hook, output-contract-gate activation, git-cliff config template, and documentation SKILL.md rewrite.
**Depends on**: Phase 26.4
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, ARCH-07
**Success Criteria** (what must be TRUE):
  1. Document Controller agent exists with Sonnet model, read-only reviewer role, registered in agents.toml/trust.toml/output-contracts.toml
  2. Conventional commit hook validates `type(scope): description` format on all git commits, fail-open on errors
  3. Both conventional-commit.js and output-contract-gate.js are registered in install.sh and .claude/settings.json with correct matchers
  4. Orchestrator pipeline dispatches DC after Integration Checker, routes NEEDS_REVISION to doc-fix tasks, extracts changelog for PR body
  5. Documentation SKILL.md rewritten with 5 quality criteria, AI-specific anti-patterns, and changelog format conventions
  6. Executor commit format updated to conventional commits with no [task:id] suffix
  7. git-cliff config template exists and is distributed by install.sh
**Plans**: 4 plans

Plans:
- [ ] 26.5-01-PLAN.md — Conventional commit hook (TDD): tests + implementation for PostToolUse validation (ARCH-02)
- [ ] 26.5-02-PLAN.md — Config registrations + executor commit format update + documentation SKILL.md rewrite (ARCH-01, ARCH-05, ARCH-06)
- [ ] 26.5-03-PLAN.md — Document Controller agent + orchestrator pipeline wiring (ARCH-01, ARCH-04)
- [ ] 26.5-04-PLAN.md — Hook registration in install.sh/settings.json + cliff.toml + extended tests (ARCH-03, ARCH-07)

### Phase 26.4: Best Lessons from Superpowers (INSERTED)
**Goal**: Close the gap between Synapse's structural pipeline design and runtime agent behavior — anti-rationalization tables for all agents and skills, output contract enforcement via hooks, two-stage review pipeline with code-quality-reviewer, structured escalation statuses, validator independence, controller-curated context, fresh-agent mandate, and brainstorming skill rewrite
**Depends on**: Phase 26.3
**Requirements**: BEH-01, BEH-02, BEH-03, BEH-04, BEH-05, BEH-06, BEH-07, BEH-08, BEH-09, BEH-10, BEH-11
**Success Criteria** (what must be TRUE):
  1. Every agent (16 files) has an inline Anti-Rationalization table with at least 3 externally-sourced entries
  2. output-contracts.toml exists as single source of truth; output-contract-gate.js hook enforces contracts fail-closed
  3. code-quality-reviewer.md agent runs after validator PASS for craftsmanship + security + performance review
  4. Validator forms independent verdict before reading executor's implementation summary
  5. Orchestrator mandates fresh agent per task and includes inline task spec in handoffs
  6. All doer agents report DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED; all reviewers report APPROVED/REJECTED/NEEDS_REVISION
  7. Brainstorming SKILL.md has 7-step sequential checklist with hard gate; all 18 skills have anti-rationalization tables
  8. _synapse-protocol.md has anti-sycophancy review-reception protocol and quality-review as 13th provides slug
**Plans**: 5 plans

Plans:
- [ ] 26.4-01-PLAN.md — output-contracts.toml config + output-contract-gate.js PostToolUse hook + unit tests (BEH-03)
- [ ] 26.4-02-PLAN.md — Brainstorming SKILL.md rewrite + all skill anti-rationalization tables + pressure testing protocol (BEH-09, BEH-10, BEH-02)
- [ ] 26.4-03-PLAN.md — code-quality-reviewer agent + config registration + anti-sycophancy protocol + provides slug (BEH-04, BEH-08, BEH-11)
- [ ] 26.4-04-PLAN.md — Orchestrator fresh-agent/inline-spec/code-quality-reviewer dispatch + validator independence + executor verification gate (BEH-01, BEH-05, BEH-06)
- [ ] 26.4-05-PLAN.md — Anti-rationalization tables + structured escalation statuses for all 16 agents (BEH-01, BEH-07)

### Phase 26.3: TDD (INSERTED)
**Goal**: Add TDD as a core methodology to the RPEV pipeline — a new test-designer agent writes executable failing tests from specs, task-auditor triangulates spec+tests+requirements, executor is constrained to make tests pass without modifying them, and the orchestrator dispatches the test-designer in the per-task pipeline
**Depends on**: Phase 26.2
**Requirements**: TDD-01, TDD-02, TDD-03, TDD-04, TDD-05, TDD-06, TDD-07
**Success Criteria** (what must be TRUE):
  1. test-designer.md exists as a standalone Opus agent with Read, Write, Edit, Glob, Grep, Bash, search_code tools — writes executable failing tests, verifies RED, stores test-contract summary
  2. Task-auditor triangulates planner requirements + task-designer spec + test-designer tests; runs tests independently; routes rejections to the appropriate owner
  3. Executor MUST NOT modify/delete test-designer tests; reports structured status (DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT); performs self-review before handoff
  4. Validator simplified to confirm immutable tests pass and spec compliance check
  5. Planner frames test expectations as test-designer input (not validator guidance)
  6. Orchestrator dispatches test-designer after task-designer, before task-auditor; handles BLOCKED escalation routing
  7. agents.toml registers test-designer; trust.toml has test-designer tier_authority=[]; provides vocabulary has test-contract as 12th slug
**Plans**: 3 plans

Plans:
- [ ] 26.3-01-PLAN.md — Create test-designer.md agent + update _synapse-protocol.md provides vocab + register in agents.toml/trust.toml (TDD-01, TDD-07)
- [ ] 26.3-02-PLAN.md — Expand task-auditor (triangulation), constrain executor (TDD rules), simplify validator, update planner (TDD-02, TDD-03, TDD-04, TDD-05)
- [ ] 26.3-03-PLAN.md — Update orchestrator with test-designer dispatch step and BLOCKED escalation routing (TDD-06)

### Phase 26.2: Agent Handoff Tightening (INSERTED)
**Goal**: Promote agent handoff data to first-class structured task fields, unify context loading in the shared protocol, add input/output contracts to every agent, and install gateway protocol as a configurable per-project template
**Depends on**: Phase 26.1
**Requirements**: HANDOFF-01, HANDOFF-02, HANDOFF-03, HANDOFF-04, HANDOFF-05, HANDOFF-06
**Success Criteria** (what must be TRUE):
  1. Tasks table has 23 fields (4 new: context_doc_ids, context_decision_ids, spec, output_doc_ids) and VALID_AGENT_ROLES has 14 entries
  2. _synapse-protocol.md contains a unified 5-step context loading sequence, standard tag vocabulary, and 11-slug provides vocabulary
  3. Orchestrator has a fixed routing table for upstream doc_id injection per agent dispatch
  4. All 13 non-orchestrator agents have Input Contract and Output Contract sections
  5. Gateway protocol template is installed by /synapse:init and injected by synapse-startup.js based on gateway_mode config
**Plans**: 4 plans

Plans:
- [ ] 26.2-01-PLAN.md — Server schema + tools + tests: 4 new task fields, 14-role enum, CRUD tool updates (HANDOFF-01, HANDOFF-02)
- [ ] 26.2-02-PLAN.md — Shared protocol + orchestrator wiring: 5-step context loading, tag/provides vocab, routing table (HANDOFF-03, HANDOFF-04)
- [ ] 26.2-03-PLAN.md — Per-agent input/output contracts for all 13 non-orchestrator agents (HANDOFF-05)
- [ ] 26.2-04-PLAN.md — Gateway protocol template + init.md + startup hook integration (HANDOFF-06)

### Phase 26.1: Further Improvements Agentic Framework
**Goal**: Establish clear role separation with a gateway-led user interaction model, doer+reviewer pairs at every pipeline stage, and a draft->review->activate decision flow — making the RPEV pipeline more structured and the orchestrator stateless/restartable
**Depends on**: Phase 25
**Requirements**: FI-01, FI-02, FI-03, FI-04, FI-05, FI-06
**Success Criteria** (what must be TRUE):
  1. CLAUDE.md contains a Synapse Gateway Protocol section that establishes the main session as the sole user interaction point
  2. The orchestrator is a pure dispatcher (~300 lines, down from ~700) — no decision-making, no user interaction, no failure handling
  3. Every pipeline stage has a doer+reviewer pair: Product Researcher (gateway), Architect+Architecture Auditor, Planner+Plan Auditor, Task Designer+Task Auditor, Executor+Validator
  4. Decisions follow draft->review->activate flow using document-based drafts (store_decision only supports active/superseded/revoked)
  5. agents.toml registers all 14 agents with correct tool allowlists; trust.toml tier_authority reflects new authority model
  6. Old agent files deleted (product-strategist, decomposer, plan-reviewer) and all references updated
**Plans**: 5 plans

Plans:
- [ ] 26.1-01-PLAN.md — CLAUDE.md gateway protocol + decision draft workflow + _synapse-protocol.md update (FI-01, FI-04)
- [ ] 26.1-02-PLAN.md — Orchestrator scope reduction to pure dispatcher (FI-02)
- [ ] 26.1-03-PLAN.md — Stage 1-2 agents: product-researcher, architect narrowing, architecture-auditor (FI-03, FI-04)
- [ ] 26.1-04-PLAN.md — Stage 3-4 agents: planner, plan-auditor, task-designer, task-auditor (FI-03, FI-04)
- [ ] 26.1-05-PLAN.md — Config updates (agents.toml, trust.toml) + old file deletion + reference updates (FI-05, FI-06)

## Progress

**Execution Order:**
15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 26.1 → 26.2 → 26.3 → 26.4 → 26.5
Parallelizable: Phase 17 (Tech Debt) and Phase 20 (Skills) can proceed in parallel with 18-19. Phase 20 depends only on Phase 15.
Phase 25 depends on Phase 24 (failure log drives scope).
Phase 26 depends on Phase 25 + real usage findings (plans created as issues arise).
Phase 26.1 depends on Phase 25 (restructures agent prompts and pipeline).
Phase 26.2 depends on Phase 26.1 (tightens handoff contracts on the new agent roster).
Phase 26.3 depends on Phase 26.2 (adds TDD to the pipeline with the new agent roster).
Phase 26.4 depends on Phase 26.3 (adds behavioral enforcement on top of TDD pipeline).
Phase 26.5 depends on Phase 26.4 (adds Document Controller + version management to pipeline).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Foundation | v1.0 | 2/2 | Complete | 2026-02-27 |
| 2. Database Schema | v1.0 | 3/3 | Complete | 2026-02-27 |
| 3. Embedding Service | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. Document Management | v1.0 | 4/4 | Complete | 2026-02-28 |
| 5. Document Search | v1.0 | 4/4 | Complete | 2026-02-28 |
| 6. Code Indexing | v1.0 | 5/5 | Complete | 2026-02-28 |
| 7. Code Search and Integration Validation | v1.0 | 2/2 | Complete | 2026-03-01 |
| 8. Fix project_meta Integration Wiring | v1.0 | 1/1 | Complete | 2026-03-01 |
| 9. Tech Debt Documentation Cleanup | v1.0 | 1/1 | Complete | 2026-03-01 |
| 10. Decision Tracking Tooling | v2.0 | 2/2 | Complete | 2026-03-01 |
| 11. Task Hierarchy Tooling | v2.0 | 3/3 | Complete | 2026-03-01 |
| 12. Framework Bootstrap | v2.0 | 3/3 | Complete | 2026-03-01 |
| 13. Agent Specialization, Skill Loading, and Trust | v2.0 | 5/5 | Complete | 2026-03-02 |
| 13.1 Move Separate Modules into a Single Repo | v2.0 | 2/2 | Complete | 2026-03-02 |
| 14. Quality Gates and PEV Workflow | v2.0 | 4/4 | Complete | 2026-03-02 |
| 15. Foundation | v3.0 | 2/2 | Complete | 2026-03-03 |
| 16. User Journey Commands | v3.0 | 3/3 | Complete | 2026-03-05 |
| 17. Tech Debt | v3.0 | 2/2 | Complete | 2026-03-05 |
| 18. RPEV Orchestration | 3/3 | Complete    | 2026-03-05 | - |
| 19. Agent Prompts + Level-Awareness | 3/3 | Complete    | 2026-03-05 | - |
| 20. Skills Completion | 3/3 | Complete    | 2026-03-06 | - |
| 21. Agent Pool | 2/2 | Complete    | 2026-03-06 | - |
| 22. Install Script | 2/2 | Complete    | 2026-03-06 | - |
| 23. Visibility + Notifications | v3.0 | 2/2 | Complete | 2026-03-06 |
| 24. E2E Validation | v3.0 | 2/2 | Complete | 2026-03-07 |
| 25. Agent Behavior Hardening | v3.0 | 5/6 | Complete (25-04 deferred) | 2026-03-09 |
| 26. Usage Findings | v3.0 | 0/0 | Pending | - |
| 26.1. Further Improvements | 5/5 | Complete    | 2026-03-10 | - |
| 26.2. Agent Handoff Tightening | 4/4 | Complete    | 2026-03-10 | - |
| 26.3. TDD | 3/3 | Complete    | 2026-03-12 | - |
| 26.4. Best Lessons from Superpowers | 5/5 | Complete    | 2026-03-12 | - |
| 26.5. Document Controller + Version Mgmt | 0/4 | Planning    | - | - |
