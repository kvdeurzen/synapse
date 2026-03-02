---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Agentic Framework
status: in_progress
last_updated: "2026-03-02T18:00:00Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.
**Current focus:** v2.0 Agentic Framework — Phase 13 (Agent Specialization, Skill Loading, and Trust)
**Previous milestone:** v1.0 Data Layer — shipped 2026-03-01 (50/50 requirements, 9 phases, 24 plans)

## Current Position

Phase: 12 of 14 (Orchestrator Bootstrap) — COMPLETE (all 3 plans done)
Phase: 13 of 14 (Agent Specialization) — COMPLETE (all 5 plans done)
Status: Phase 13 complete — 10 agent markdown files, skill loader, trust matrix, anti-drift tests
Last activity: 2026-03-02 — Phase 13 all 5 plans executed (10 agents, 7 skills, anti-drift tests, 65 tests pass)

Progress: [████████░░] 85% (v2.0 milestone — Phase 13 complete, 13/13 plans done, Phase 14 remaining)

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**v2.0 decisions (pending validation):**
- Claude Agent SDK over custom runtime (battle-tested, Anthropic-maintained)
- 10 specialized agents with narrow cognitive focus (GSD pattern)
- Skills as prompt injection, not code plugins (simpler, no runtime code loading)
- Trust matrix as YAML config file, not DB table (explicit, auditable)
- Clean Synapse/Orchestrator process boundary: data layer vs control layer

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

### Pending Todos

None.

### Blockers/Concerns

- (Phase 13) Agent prompt engineering is iterative — research-phase required before building all 10 agent definitions (Phase 12 test harness complete)
- (Phase 14) Wave controller and Claude Code Task tool parallel execution patterns have limited public examples — research-phase required

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed Phase 13 — all 5 plans (config schemas, skill loader, 4 Opus agents, 6 Sonnet agents, skill wiring + anti-drift tests). 65 tests passing.
Resume file: None
