---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Agentic Framework
status: unknown
last_updated: "2026-03-02T20:09:35Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 15
  completed_plans: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.
**Current focus:** v2.0 Agentic Framework — Phase 13 (Agent Specialization, Skill Loading, and Trust)
**Previous milestone:** v1.0 Data Layer — shipped 2026-03-01 (50/50 requirements, 9 phases, 24 plans)

## Current Position

Phase: 14 of 14 (Quality Gates and PEV Workflow) — IN PROGRESS (3 of 4 plans done)
Status: Phase 14 plan 03 complete — PEV config schema ([pev] in TrustConfigSchema + trust.toml), pev-workflow.md created (166 lines), 26 config tests passing
Last activity: 2026-03-02 — Phase 14 plan 03 executed (TrustConfigSchema pev extension, trust.toml [pev] section, pev-workflow.md, 5 new config tests)

Progress: [██████████] 100% (v2.0 milestone — Phase 14 in progress 1/4)

## Performance Metrics

**Velocity (v1.0 reference):**
- Total plans completed: 24
- Total phases completed: 9
- 495 tests passing at v1.0 close

**v2.0 metrics:**
| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 10 | 01 | 8min | 2 | 11 |
| 10 | 02 | 7min | 2 | 7 |
| 11 | 01 | 9min | 2 | 9 |
| 11 | 02 | 13min | 2 | 7 |
| 11 | 03 | 3min | 1 | 1 |
| 12 | 01 | 3min | 2 | 15 |
| 12 | 02 | 3min | 2 | 6 |
| 12 | 03 | 3min | 2 | 6 |
| 13 | 01 | 9min | 1 | 4 |
| 13 | 02 | 3min | 2 | 10 |
| 13 | 03 | 5min | 2 | 4 |
| 13 | 04 | 5min | 2 | 6 |
| 13 | 05 | 5min | 2 | 2 |
| 13.1 | 01 | 15min | 2 | 12 |
| 13.1 | 02 | 24min | 1 | 7 |
| 14 | 01 | 3min | 2 | 5 |
| 14 | 02 | 3min | 2 | 3 |
| 14 | 03 | 4min | 2 | 4 |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**v2.0 decisions (pending validation):**
- Claude Agent SDK over custom runtime (battle-tested, Anthropic-maintained)
- 10 specialized agents with narrow cognitive focus (GSD pattern)
- Skills as prompt injection, not code plugins (simpler, no runtime code loading)
- Trust matrix as YAML config file, not DB table (explicit, auditable)
- Clean Synapse/Orchestrator process boundary: data layer vs control layer

**Phase 14 decisions (validated):**
- precedent-gate fails open on error (advisory hook) — exit 0 silently vs deny used by enforcement hooks
- tier-gate checks tier === 0 before loading trust.toml — Tier 0 always requires "ask" regardless of actor identity
- PostToolUse updated to audit-log.js with no matcher, consolidated from Plan 14-02 to avoid parallel write conflict
- audit-log.js is a NEW file alongside synapse-audit.js — backward compatibility preserved
- Zod nested defaults: explicit .default({...}) required on pev field — Zod 4 does not apply nested field defaults when parent key is absent and uses .default({})
- pev.approval_threshold (epic/feature/task/none) replaces approval.decomposition (always/strategic/none) with more granular control; both coexist for backward compat
- pev-workflow.md as agent-consumed markdown document — orchestrator reads and follows it via reasoning; Plan 04 wires the agent to reference it
- Multi-root config path resolution in startup hook: tries cwd, cwd/packages/framework, import.meta.url relative
- startup hook uses inner try/catch for config reads — graceful degradation isolated from base instructions

**Phase 13.1 decisions (validated):**
- git subtree add without --squash — preserves all 16 framework commits as accessible merge history
- framework peerDependencies does NOT include @synapse/server — MCP protocol boundary intentional
- noUncheckedIndexedAccess and exactOptionalPropertyTypes in base tsconfig (both packages pass at these settings)
- framework tsconfig keeps allowImportingTsExtensions: true and noEmit: true as package-specific overrides
- Bun workspace monorepo layout: packages/server/ and packages/framework/ under packages/*
- bun install --ignore-scripts required: tree-sitter@0.25.x binding.gyp uses C++17 but Node.js 24 headers require C++20; setup-tree-sitter.js handles rebuild with CXXFLAGS=-std=c++20
- apache-arrow@18.1.0 is an explicit server dependency (not auto-installed as lancedb peerDep by Bun workspaces)
- Root CLAUDE.md is the single project instructions file with Bun conventions and monorepo-relative paths

**Phase 13 decisions (in progress):**
- tier_authority uses z.record(z.string(), z.array(z.number().int().min(0).max(3))) — validates tier values 0-3 at schema level
- agent_overrides uses nested object {domains: record} — per-agent domain autonomy overrides with optional domains key
- allowed_tools defaults to [] — backward-compatible with existing agents.toml entries that omit the field
- Researcher has no store_decision, create_task, update_task — deliberation via documents pattern
- Debugger and Codebase Analyst have no Write/Edit — diagnostic/analysis only, Executor applies fixes
- Validators and Plan Reviewer have update_task — direct authority to gate execution without orchestrator routing
- 2K token warning is non-blocking: loadSkill warns to stderr but always returns full content
- warnUnreferencedSkills ignores 'project' directory — reserved for user-defined skills, intentionally unchecked
- estimateTokens uses Math.ceil(chars / 4) — simple proxy matching CONTEXT.md locked decision
- Skill SKILL.md files target 400-600 tokens each (1600-2400 chars) — well under 2K warning threshold

**Phase 10 decisions (validated):**
- Vector field is nullable in DECISIONS_SCHEMA for defensive schema design; fail-fast enforcement is at store_decision level
- Cosine distance threshold of 0.15 for has_precedent flag (approximately similarity >= 0.85)
- Precedent check failure is non-fatal — has_precedent=false if vector search errors
- query_decisions uses SQL WHERE for indexed fields + JS post-filter for subject/tags (LanceDB LIKE limitations)
- check_precedent gracefully degrades on Ollama unreachable (read operation, unlike store_decision which fails fast)

**Phase 12 decisions (validated):**
- ConfigError throws (not process.exit) in config loaders — CLI entry points convert to exit(1) for testability
- Zod 4 z.string({ error: '...' }) syntax for custom missing-field messages (not z.string().min() which only fires on empty string)
- loadSecretsConfig is optional — returns {} on missing file, not an error
- Anti-drift test validates actual config/ files against Zod schemas in CI
- Hooks use ESM imports (not CJS require()) — package.json type:module means .js files are ESM; require() fails in ESM context
- Attribution enforced by prompt instructions in agent definition — Phase 14 GATE hooks enforce; Phase 12 establishes the convention
- Startup hook injects instructions via additionalContext — cannot call Synapse MCP tools at SessionStart (MCP not yet available)
- Audit hook appends to .synapse-audit.log in process.cwd() — gitignored, one JSON entry per line
- MCP integration client uses background stdout reader + pending Map to avoid deadlock on sequential read/write
- Behavioral fixtures committed to git for deterministic replay — delete to re-record on next run
- Scorecard evaluation engine deferred to Phase 13 — Phase 12 establishes TOML format only

**Phase 11 decisions (validated):**
- Bool type used for is_blocked/is_cancelled in TASKS_SCHEMA (LanceDB supports Bool natively; not Int32)
- detectCycles exported from create-task.ts for unit testing without integration setup overhead
- root_id = task_id for epics (depth=0), inherited from parent.root_id for all others — enables O(1) subtree queries
- Dependency edge: from_id = dependent task (blocked), to_id = dependency task (blocker)
- New tasks always start with status "pending" — no status field accepted at creation time
- Ollama embedding is fail-fast at create_task level (write operation, unlike check_precedent reads)
- LanceDB table handles are snapshot-based: always open fresh connections after writes from different connections
- get_task_tree fetches entire epic subtree (via root_id) then prunes to requested subtree in JS — root_id denormalization works at epic level only
- children_all_done = false for leaf nodes (vacuously false); true only when ALL direct children have status done
- Dependency replacement uses what-if graph: project edges MINUS current task edges PLUS proposed edges, then detectCycles

### Roadmap Evolution

- Phase 13.1 inserted after Phase 13: Move separate modules into a single repo (URGENT)

### Pending Todos

None.

### Blockers/Concerns

- (Phase 13) Agent prompt engineering is iterative — research-phase required before building all 10 agent definitions (Phase 12 test harness complete)
- (Phase 14) Wave controller and Claude Code Task tool parallel execution patterns have limited public examples — research-phase required

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed Phase 14 plan 03 — PEV config schema (TrustConfigSchema pev field with 5 settings), trust.toml [pev] section with defaults, pev-workflow.md (166 lines covering full lifecycle), 26 config tests passing. Awaiting plan 04 execution.
Resume file: None
