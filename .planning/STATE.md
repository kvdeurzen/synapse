---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Working Prototype
status: Not started
stopped_at: Completed 18-01-PLAN.md (RPEV Involvement Matrix)
last_updated: "2026-03-05T15:53:14Z"
last_activity: 2026-03-05 — Completed Phase 18-01 (RPEV Involvement Matrix)
progress:
  total_phases: 10
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.
**Current focus:** Phase 17 — Tech Debt (clean code before RPEV rework)
**Previous milestones:** v1.0 Data Layer (shipped 2026-03-01), v2.0 Agentic Framework (shipped 2026-03-02)

## Current Position

Phase: 18 of 24 (RPEV Orchestration) — in progress
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-03-05 — Completed Phase 18-01 (RPEV Involvement Matrix)

Progress: [██░░░░░░░░] 20%

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

### Blockers/Concerns

- Hook path resolution silently fails outside repo root (confirmed by two GitHub issues) — Phase 15 fixes this first
- Subagents may not inherit MCP tools without `mcpServers:` frontmatter (GitHub issues #5465, #13605) — Phase 19 adds this to all agents
- E2E validation (Phase 24) will surface unknown failure modes; Phase 24 plan 24-02 is dedicated to patching top-3

### Pending Todos

None.

## Session Continuity

Last session: 2026-03-05T15:53:14Z
Stopped at: Completed 18-01-PLAN.md (RPEV Involvement Matrix)
Resume file: .planning/phases/18-rpev-orchestration/18-01-SUMMARY.md
