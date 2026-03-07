---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Working Prototype
status: in_progress
stopped_at: "Completed 25-06-PLAN.md (PR workflow for orchestrator)"
last_updated: "2026-03-07T08:20:00Z"
last_activity: 2026-03-07 — Phase 25 plan 06 complete. PR workflow added to orchestrator replacing direct merge with gh pr create, involvement-mode merge gate, and explicit git revert rollback commands.
progress:
  total_phases: 11
  completed_phases: 10
  total_plans: 28
  completed_plans: 26
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.
**Current focus:** Phase 25 — Agent Behavior Hardening (executing, 5/6 plans complete)
**Previous milestones:** v1.0 Data Layer (shipped 2026-03-01), v2.0 Agentic Framework (shipped 2026-03-02)

## Current Position

Phase: 25 of 25 (Agent Behavior Hardening) — executing
Plan: 6 of 6 in current phase (25-01, 25-02, 25-03, 25-05, 25-06 complete; 25-04 pending E2E re-validation)
Status: Wave 1 complete (01, 02, 03, 05, 06 done). Wave 2: 04 (E2E re-validation) is the remaining plan.
Last activity: 2026-03-07 — Plan 25-06 complete: PR workflow added to orchestrator (gh pr create, merge gate, explicit git revert rollback)

Progress: [██████████] 100%

## Performance Metrics

**v1.0:** 9 phases, 24 plans, 495 tests, 3 days
**v2.0:** 6 phases, 19 plans, 708 tests (cumulative), 4 days
**v3.0:** 10 phases planned, ~21 plans estimated

**By Phase (v3.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 15-foundation P02 | 2 | 2 tasks | 4 files |
| Phase 16-user-journey-commands P01 | 2 | 2 tasks | 2 files |
| Phase 16-user-journey-commands P03 | 2 | 2 tasks | 2 files |
| Phase 16 P02 | 2 | 3 tasks | 3 files |
| Phase 17-tech-debt P01 | 5 | 2 tasks | 7 files |
| Phase 17-tech-debt P02 | 5min | 2 tasks | 64 files |
| Phase 18-rpev-orchestration P02 | 4min | 2 tasks | 2 files |
| Phase 18-rpev-orchestration P03 | 3min | 2 tasks | 4 files |
| Phase 19-agent-prompts P01 | 4min | 1 task | 11 files |
| Phase 19 P02 | 4min | 2 tasks | 12 files |
| Phase 19-agent-prompts P03 | 2 | 2 tasks | 4 files |
| Phase 20-skills-completion P01 | 15min | 2 tasks | 11 files |
| Phase 20-skills-completion P02 | 16min | 2 tasks | 23 files |
| Phase 20-skills-completion P03 | 2min | 1 tasks | 1 files |
| Phase 21-agent-pool P01 | 4min | 3 tasks | 6 files |
| Phase 21-agent-pool P02 | 2min | 2 tasks | 2 files |
| Phase 22-install-script P02 | 3min | 1 tasks | 1 files |
| Phase 22-install-script P01 | 3min | 2 tasks | 2 files |
| Phase 23-visibility-notifications P01 | 2min | 2 tasks | 2 files |
| Phase 23-visibility-notifications P02 | 6min | 2 tasks | 3 files |
| Phase 24-e2e-validation P01 | 3min | 1 task (of 2) | 67 files |
| Phase 25-agent-behavior-hardening P01 | 5min | 2 tasks | 3 files |
| Phase 25-agent-behavior-hardening P02 | 3min | 2 tasks | 6 files |
| Phase 25-agent-behavior-hardening P03 | 5min | 2 tasks | 14 files |
| Phase 25-agent-behavior-hardening P05 | 3min | 2 tasks | 4 files |
| Phase 25-agent-behavior-hardening P06 | 4min | 1 task | 1 file |

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key decisions affecting v3.0:
- Copy-based install script (not symlinks) — user's `.claude/` is the live copy; install.sh generates it
- `$CLAUDE_PROJECT_DIR`-prefixed hook paths — required to fix silent hook failures outside repo root
- `.synapse/config/project.toml` as single source of truth — startup hook reads it; agents never ask user for project_id
- Phase 17 (Tech Debt) and Phase 20 (Skills) can proceed in parallel with phases 18-19 — both depend only on Phase 15
- Project context block prepended before baseInstructions in additionalContext — project_id is first thing agents see
- Hard fail on missing project.toml uses process.exit(0) — never block session with non-zero exit; error surfaces via additionalContext
- Skills validation is warn-only — misconfigured skills never block session start
- resolveConfig() is canonical pattern for all .synapse/config/ lookups — replaces ad-hoc possibleRoots loops
- [Phase 15-02]: Explicit null guard for resolveConfig() return ensures fail-closed with clear message vs ENOENT in tier-gate and tool-allowlist
- [Phase 15-02]: audit-log.js fallback to CLAUDE_PROJECT_DIR||cwd when project.toml missing — best-effort log path during pre-init sessions
- [Phase 15-02]: precedent-gate.js left unmodified — reads no config files, advisory-only hook
- [Phase 16-01]: init.md anti-patterns section explicitly states no Ollama during init — map.md is the only command requiring Ollama
- [Phase 16-01]: RPEV trust.toml [rpev] section seeds proactive_notifications=false as Phase 23 placeholder; explicit_gate_levels=[project,epic] by default
- [Phase 16-user-journey-commands]: Agent-based focus (/synapse:focus agent C) explicitly deferred to Agent Pool phase (Phase 21)
- [Phase 16-user-journey-commands]: focus.md allowed-tools list is broad: gateway command enables full interaction (refine/create/decide) after navigation
- [Phase 16]: /synapse:new-goal deleted — clean break, replaced entirely by /synapse:refine
- [Phase 16]: DECIDED/OPEN/EMERGING are the canonical decision states for refinement sessions
- [Phase 16]: At Project and Epic level, user must explicitly signal readiness — no auto-transition to Plan
- [Phase 16]: Refinement state persisted via store_document with doc_id reuse on resume (versioning not duplication)
- [Phase 17-tech-debt]: File path as doc_id for code files in documents table — direct lookup compat with relationships, no ULID mapping needed (Phase 17-01)
- [Phase 17-tech-debt]: code_chunks.doc_id stays as file path — consistent with documents.doc_id=filePath; ULID migration deferred (Phase 17-01)
- [Phase 17-tech-debt]: Explicit null guard over optional chaining for map mutations — if (!entry) throw makes invariant visible; optional chaining silently no-ops .push()/.add()
- [Phase 17-tech-debt]: Type assertion (value as string) over non-null assertion (value!) in test post-expect assertions — satisfies Biome noNonNullAssertion without semantic change
- [Phase 18-01]: Flat underscore-separated keys (project_refine) in [rpev.involvement] — dotted keys create nested sub-tables in smol-toml, causing parse errors
- [Phase 18-01]: rpevContext condition uses trustToml.rpev (not trustToml && agentsToml) — RPEV matrix only requires trust.toml; graceful degradation even when agents.toml absent
- [Phase 18-01]: TOML sub-table ordering: [rpev.involvement] and [rpev.domain_overrides] declared before [rpev] scalar keys per TOML spec requirement
- [Phase 18-02]: Stage document schema: fixed doc_id rpev-stage-[task_id] enables store_document upsert versioning (not duplicate creation); pending_approval flag is /synapse:status query key
- [Phase 18-02]: Involvement mode strictness: drives(5)>co-pilot(4)>reviews(3)>monitors(2)>autopilot(1) — domain overrides always take strictest; prevents silent override failures
- [Phase 18-02]: Subagent handoff always includes project_id + rpev_stage_doc_id — subagents do NOT inherit session context, must receive explicit handoff
- [Phase 18-03]: Two-tier approval UX in /synapse:focus: summary-first (Tier 1) for quick triage, discuss-deeper (Tier 2) for conversational review — mirrors how users evaluate plans
- [Phase 18-03]: Stage document is more authoritative than task tree status for RPEV stage display in /synapse:status — avoids stale status mismatch
- [Phase 18-03]: store_document and link_documents granted to 4 specialist agents (plan-reviewer, integration-checker, executor, validator) as Phase 19 AGENT-05/06/07 prep — permissions expanded now, behaviors added in Phase 19
- [Phase 19-01]: mcpServers: ["synapse"] added to all 11 agent frontmatter — prevents silent MCP tool loss in subagents (GitHub #5465, #13605)
- [Phase 19-01]: Two-tier error handling in all agents: WRITE failure = HALT + report, READ failure = warn + continue; connection error on first call = HALT
- [Phase 19-01]: Level-aware context budgets: epic=8000+, feature=6000, component=4000, task=2000-4000 tokens; 6 decision-maker agents get 4-level section, 5 executor-tier agents get 2-tier section
- [Phase 19]: store_document before update_task: validator/integration-checker/plan-reviewer store findings as linked documents with doc_id={agent}-findings-{task_id}, then update_task status only -- findings remain queryable, task descriptions stay clean
- [Phase 19]: Domain autonomy modes injected from trust.toml [domains] section into session additionalContext via synapse-startup.js -- agents can differentiate co-pilot/autopilot/advisory behavior per domain
- [Phase 19]: {agent}-{type}-{task_id} naming convention for all agent-stored documents -- enables predictable doc_id lookup and deduplication via store_document upsert
- [Phase 19-03]: SYNAPSE HANDOFF block replaces free-form Synapse Context block -- 6 required fields ensure no ID is forgotten in subagent handoffs
- [Phase 19-03]: CONTEXT_REFS block is a text convention embedded in task descriptions by decomposer -- NOT a DB column; orchestrator parses it when building SYNAPSE HANDOFF blocks
- [Phase 19-03]: Task Start Protocol is mandatory pre-work sequence in executor and validator -- parses SYNAPSE HANDOFF block and fetches context before any implementation or validation work
- [Phase 20-skills-completion]: Project skills listed before role skills in manifest (project.toml order first, then alphabetical) — matches user mental model of stack first, roles second
- [Phase 20-skills-completion]: role_skills replaces skills in agents.toml entirely — skills field removed from all agents; AgentsConfigSchema updated to include role_skills field with default []
- [Phase 20-skills-completion]: {test_command} placeholder pattern in agent prompts — validator and integration-checker reference testing skill for test runner command, not hardcoded bun test
- [Phase 20-skills-completion]: SKILL.md 5-section format established at 60-100 lines: Conventions, Quality Criteria, Vocabulary, Anti-patterns, Commands — all skills conform
- [Phase 20-skills-completion]: trustToml and agentsToml hoisted to outer scope in synapse-startup.js — follows established tierContext/rpevContext/domainContext pattern, eliminates ReferenceError in skillContext block so role_skills manifest is correctly injected into additionalContext
- [Phase 21-agent-pool]: max_pool_slots replaces max_parallel_executors as canonical pool capacity config key -- covers all agent types sharing the pool
- [Phase 21-agent-pool]: Pool state document doc_id: pool-state-[project_id] -- fixed pattern enables store_document upsert versioning; finish-first policy: validator for completed task gets next slot before new execution dispatch
- [Phase 21-agent-pool]: Agent-based detection checked first in focus.md -- /^agent\s+[A-Z]$/i precedes name-based check since 'agent A' is valid name-based input
- [Phase 21-agent-pool]: Cancel action in /synapse:focus updates pool-state document directly and calls update_task -- slot cleared immediately, pool dispatch tick fills it on next cycle
- [Phase 22-install-script]: bun -e inline script for JSON merge — avoids jq/sed/python dependencies; Bun already required
- [Phase 22-install-script]: Local dev mode: detect packages/server/src/index.ts to skip tarball download when running from repo
- [Phase 22-install-script]: Hook dedup by command filename signature not full object equality — robust to whitespace changes between versions
- [Phase 23-visibility-notifications]: State file approach (.synapse/state/statusline.json) for statusline data — synchronous readFileSync on <1KB file is effectively instantaneous; no async complexity needed
- [Phase 23-visibility-notifications]: proactive_notifications=true uses ANSI blink (\x1b[5;31m), false uses dim (\x1b[2m) — visual-only, no terminal bell
- [Phase 23-visibility-notifications]: projectRoot derived from path.dirname(path.dirname(projectTomlPath)) — goes up from .synapse/config/ to project root
- [Phase 23-02]: project_overview composes getTaskTree per epic internally — callers no longer need separate get_task_tree calls for epic-level rollup stats
- [Phase 23-02]: needs_attention always initialized when task_progress exists (even if both arrays empty) — callers can safely access without null check
- [Phase 23-02]: rpev_stage_counts only added to epic entry when at least one child task has a stage doc — avoids empty zero-filled objects
- [Phase 24-01]: init.md updated to full 16-entry [rpev.involvement] matrix (drives/co-pilot/reviews/monitors/autopilot x 4 levels) — replaces stale 4-key [rpev] section. Both tracked and untracked copies updated
- [Phase 24-01]: v3.0.0-alpha.1 GitHub prerelease created with 67 committed framework files — tarball includes packages/framework/ (agents, hooks, commands, skills) + packages/server/install.sh
- [Phase 25-02]: status.md uses per-epic get_task_tree(root_task_id, max_depth: 2) instead of single unfiltered tree — O(epics) small calls vs O(1) huge call; rollup stats on nodes already contain completion data
- [Phase 25-02]: semantic_search removed from status.md allowed-tools — redundant with query_documents for rpev-stage tags
- [Phase 25-02]: Code Index Trust Rule in refine.md: get_smart_context code summaries are SUFFICIENT context; do NOT spawn Explore agent when index has data (saves ~58k tokens)
- [Phase 25-02]: Persist-before-transition in refine.md: store_document called before readiness summary, not after user responds — prevents state loss on session end
- [Phase 25-02]: init.md commit step is non-fatal — warns user on git failure but does not block initialization
- [Phase 25-01]: Stage gate failures are NON-RECOVERABLE — orchestrator halts and reports, no retry or workaround on gate mismatch
- [Phase 25-01]: Orchestrator NEVER calls update_task on leaf tasks — executors and validators own their own task status updates (delegation rule)
- [Phase 25-01]: Pool-state document writes changed from "should" to "MUST" with explicit 4-trigger list (assign, clear, recovery, cancel)
- [Phase 25-01]: Executor frontmatter tools include store_document and link_documents — were already used in Key Tool Sequences but missing from frontmatter (Rule 2 auto-fix)
- [Phase 25-03]: Per-tool actor listing pattern in Attribution sections — every MCP tool listed with explicit actor parameter example, replacing generic "include actor" instruction
- [Phase 25-03]: Task tool heuristic in audit-log.js — Task tool calls attributed to synapse-orchestrator since only orchestrator spawns Task
- [Phase 25-03]: has_actor boolean field added to audit log entries — true = explicit actor, false = heuristic/unknown; enables attribution gap visibility
- [Phase 25-05]: Confidence tiers (HIGH/MEDIUM/LOW) tag every research finding by source reliability — Context7/official docs = HIGH, cross-referenced WebSearch = MEDIUM, single web source = LOW
- [Phase 25-05]: Research failure is non-blocking — orchestrator proceeds without researcher doc_id if researcher subagent fails; logged as warning, pipeline continues
- [Phase 25-05]: Context7 and WebSearch/WebFetch tools don't use actor param — only Synapse MCP tools require actor attribution
- [Phase 25-05]: Task tool added to architect and decomposer frontmatter — required for spawning researcher subagents before non-trivial decisions/decompositions
- [Phase 25-06]: PR workflow replaces direct merge to main — feature completion creates gh pr create with structured template linking RPEV stage doc, task commits, and decision references
- [Phase 25-06]: Merge gate is involvement-mode dependent — autopilot/monitors auto-merge (gh pr merge --merge --delete-branch); co-pilot/reviews/drives set pending_approval=true and await user action
- [Phase 25-06]: Rollback uses git revert not git reset — explicit revert commands for task rollback, feature rollback (pre-merge), and post-merge rollback; NEVER force-push to main

### Roadmap Evolution

- Phase 25 inserted after Phase 24: Agent Behavior Hardening — fix 27 DEGRADED issues from E2E run to make RPEV cycle usable before declaring v3.0 complete (INSERTED 2026-03-07)

### Blockers/Concerns

- Hook path resolution silently fails outside repo root (confirmed by two GitHub issues) — Phase 15 fixes this first
- ~~Subagents may not inherit MCP tools without `mcpServers:` frontmatter (GitHub issues #5465, #13605)~~ — RESOLVED: Phase 19-01 added mcpServers to all 11 agents
- E2E validation (Phase 24) will surface unknown failure modes; Phase 24 plan 24-02 is dedicated to patching top-3

### Pending Todos

None.

## Session Continuity

Last session: 2026-03-07T08:20:00Z
Stopped at: Completed 25-06-PLAN.md (PR workflow for orchestrator)
Resume file: .planning/phases/25-agent-behavior-hardening/25-06-SUMMARY.md
