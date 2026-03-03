# Roadmap: Synapse

## Milestones

- ✅ **v1.0 Data Layer** - Phases 1-9 (shipped 2026-03-01)
- ✅ **v2.0 Agentic Framework** - Phases 10-14 (shipped 2026-03-02)
- 🚧 **v3.0 Working Prototype** - Phases 15-22 (in progress)

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

### 🚧 v3.0 Working Prototype (In Progress)

**Milestone Goal:** Wire up all existing pieces into a usable end-to-end product — from install to agent-driven PEV workflow execution on a real project.

- [x] **Phase 15: Foundation** - project.toml schema, project_id injection via startup hook, hook path fixes, config resolution (completed 2026-03-03)
- [ ] **Phase 16: User Journey Commands** - /synapse:init, /synapse:map, /synapse:plan slash commands and user journey documentation
- [ ] **Phase 17: Install Script** - one-command install.sh with prerequisite checks, file wiring, and Ollama smoke test
- [ ] **Phase 18: Agent Prompt Improvements** - MCP-first principle, tool sequences, frontmatter, handoff protocol, findings persistence, error handling, domain mode, context refs
- [ ] **Phase 19: Skills Completion** - dynamic skill injection from project.toml, language-agnostic agents, fleshed-out skills, new generic skills
- [ ] **Phase 20: Tech Debt** - escapeSQL dedup, created_at fix, INT-02 ULID edges, lint warnings, config ordering
- [ ] **Phase 21: E2E Validation** - full PEV cycle on a real task, hook verification, failure log, status verification
- [ ] **Phase 22: Visibility** - progress statusline hook, project_overview task tree integration

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
- [ ] 15-01: Create resolveConfig() utility, update synapse-startup.js to read project.toml and inject project_id + skills (FOUND-01, FOUND-02)
- [ ] 15-02: Update gate hooks to use resolveConfig(), register Synapse hooks in settings.json with $CLAUDE_PROJECT_DIR (FOUND-03, FOUND-04)

### Phase 16: User Journey Commands
**Goal**: A new user has a clear, documented path from zero to running their first PEV workflow — three slash commands cover every step
**Depends on**: Phase 15
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04
**Success Criteria** (what must be TRUE):
  1. Running `/synapse:init` creates `project.toml`, calls `init_project`, and offers an opt-in CLAUDE.md amendment — the project is registered without manual MCP calls
  2. Running `/synapse:map` verifies Ollama is running, indexes the codebase, and reports progress — the user sees confirmation before and after, not a silent wait
  3. Running `/synapse:plan` with a goal spawns the orchestrator agent with that goal and project context already wired — the user does not need to pass project_id manually
  4. A written user journey document exists describing the complete flow from install to ongoing use as step-by-step instructions
**Plans**: TBD

Plans:
- [ ] 16-01: /synapse:init command — project.toml creation, init_project call, CLAUDE.md opt-in, skill auto-detection
- [ ] 16-02: /synapse:map and /synapse:plan commands, user journey documentation (CMD-04)

### Phase 17: Install Script
**Goal**: A new user can wire Synapse into any project with a single command and receive actionable feedback at every step
**Depends on**: Phase 15 (needs $CLAUDE_PROJECT_DIR paths from the start; can be developed in parallel with Phase 16)
**Requirements**: INST-01, INST-02, INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. Running `bash install.sh` on a clean machine checks for Bun version, Ollama running, and nomic-embed-text model — missing prerequisites produce an actionable error message, not a cryptic failure
  2. After `install.sh` completes, `.claude/agents/`, `.claude/hooks/`, `.claude/commands/synapse/`, `.mcp.json`, and `.claude/settings.json` all exist with correct content and `$CLAUDE_PROJECT_DIR`-prefixed hook paths
  3. `install.sh` runs a smoke test (`init_project` → `store_document` → `semantic_search`) before printing success — the user only sees "Done" if Synapse is actually operational
  4. A usage manual exists documenting the complete user journey, all commands, and configuration options
**Plans**: TBD

Plans:
- [ ] 17-01: install.sh — prerequisite checks, file copy, settings.json generation, .synapse/config/ skeleton
- [ ] 17-02: Ollama smoke test integration and usage manual (INST-04)

### Phase 18: Agent Prompt Improvements
**Goal**: All 10 agents reliably use Synapse MCP tools as their primary information source, pass context correctly in subagent handoffs, and store their findings as queryable documents
**Depends on**: Phase 15 (project_id must be available before agent prompts can reference it)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-07, AGENT-08, AGENT-09, AGENT-10, AGENT-11
**Success Criteria** (what must be TRUE):
  1. Every agent `.md` file has `mcpServers: ["synapse"]` in its frontmatter — Claude Code grants Synapse tool access to all subagents without manual wiring
  2. Every agent prompt has a "Synapse MCP as Single Source of Truth" section and a "Key Tool Sequences" section with literal parameter values — agents query Synapse before reading the filesystem
  3. The orchestrator's Task calls include `project_id`, `task_id`, and relevant `doc_ids` in the prompt — subagents have the context they need without asking
  4. The Validator never calls `update_task` with its findings as the description — it stores findings via `store_document` and links them to the task, preserving the original spec
  5. When a Synapse MCP tool returns `success: false`, every agent prompt specifies the agent must halt and report to the orchestrator rather than continuing
**Plans**: TBD

Plans:
- [ ] 18-01: Add mcpServers frontmatter (AGENT-03) and "MCP as Single Source of Truth" + error handling sections to all 10 agents (AGENT-01, AGENT-08)
- [ ] 18-02: Add concrete tool call sequences to all 10 agents (AGENT-02) and domain mode injection section (AGENT-09)
- [ ] 18-03: Orchestrator subagent handoff protocol (AGENT-04), Validator findings-as-document rule (AGENT-05), Integration Checker and Plan Reviewer persistence (AGENT-06), Executor implementation summaries (AGENT-07), Decomposer context_refs population (AGENT-10), Executor/Validator context_refs fetch (AGENT-11)

### Phase 19: Skills Completion
**Goal**: Projects declare their stack once in project.toml and agents automatically receive the right skill content — the framework works for any language stack, not just TypeScript/Bun
**Depends on**: Phase 15 (project.toml skills field is the input to dynamic injection)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05
**Success Criteria** (what must be TRUE):
  1. Changing `skills` in `project.toml` to `["python"]` and restarting the session injects Python skill content into agent context — no `agents.toml` edit required
  2. The per-agent hardcoded `skills = ["typescript", "bun"]` entries are removed from `agents.toml` — skill assignment is entirely driven by `project.toml`
  3. Agent prompts contain no hardcoded `.ts` file extensions or `bun test` references — examples use language-neutral placeholders
  4. The tailwind, python, and sql SKILL.md files contain actionable content drawn from community standards — not placeholder stubs
**Plans**: TBD

Plans:
- [ ] 19-01: Update synapse-startup.js to inject SKILL.md file content (not just names) and remove hardcoded skills from agents.toml (SKILL-01, SKILL-02)
- [ ] 19-02: Make agent prompts language-agnostic (SKILL-03), flesh out thin skills (SKILL-04), and add new generic skills (SKILL-05)

### Phase 20: Tech Debt
**Goal**: The codebase has no known correctness bugs, no duplicated utility code, and no lint warnings — the foundation is clean before E2E validation amplifies any hidden issues
**Depends on**: Phase 15 (can be done any time after Foundation; grouping before E2E means E2E runs on clean code)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05
**Success Criteria** (what must be TRUE):
  1. A single `escapeSQL` helper exists in one shared location — `init-project.ts` and `index-codebase.ts` both import it rather than defining their own copy
  2. Re-running `init_project` on an existing project does not overwrite `project_meta.created_at` — the original creation timestamp is preserved
  3. AST import edges created by `index_codebase` use ULIDs that `get_related_documents` can resolve — relationship graph traversal returns results for code relationships
  4. `bun run lint` (or equivalent) exits with zero warnings on both packages
  5. Autonomy mode ordering (`autopilot` → `co-pilot` → `advisory`) is consistent across all config files and agent prompts that reference it
**Plans**: TBD

Plans:
- [ ] 20-01: Extract shared escapeSQL helper (DEBT-01), fix project_meta.created_at preservation (DEBT-02), resolve INT-02 ULID edges (DEBT-03)
- [ ] 20-02: Fix lint warnings across both packages (DEBT-04) and normalize autonomy mode ordering (DEBT-05)

### Phase 21: E2E Validation
**Goal**: The complete PEV workflow runs on a real task, hooks are verified to fire, the top failure modes are documented and patched, and the task tree status is accurately reflected in `/synapse:status`
**Depends on**: Phase 18 (agent prompts must be complete before E2E can produce meaningful results), Phase 20 (clean code before running the integration test)
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04
**Success Criteria** (what must be TRUE):
  1. A full decompose → plan review → execute → validate cycle completes on a real task without manual intervention beyond starting the workflow
  2. `.synapse-audit.log` contains entries for every Synapse MCP tool call made during the E2E run — confirming hooks are firing and not silently failing
  3. A failure log document exists listing at least the top-3 failure modes encountered, their root causes, and the patches applied — future operators know what to expect
  4. At the end of the E2E run, `/synapse:status` output matches the actual task tree state returned by `get_task_tree` — no stale or incorrect status display
**Plans**: TBD

Plans:
- [ ] 21-01: Run serial PEV cycle on a real task, verify hook audit log, document failures (E2E-01, E2E-02, E2E-03)
- [ ] 21-02: Patch top-3 E2E failures and verify /synapse:status matches task tree state (E2E-04)

### Phase 22: Visibility
**Goal**: Users can see the active epic, wave progress, and task completion ratio in Claude Code without switching to a separate terminal command
**Depends on**: Phase 21 (statusline hook should display data from a verified working task tree)
**Requirements**: VIS-01, VIS-02
**Success Criteria** (what must be TRUE):
  1. While a PEV workflow is running, the Claude Code status line shows the active epic name, current wave number, and task completion ratio (e.g., "Phase: Add auth | Wave 2/4 | Tasks: 3/8")
  2. Calling `project_overview` returns a section showing task tree progress (total tasks, completed, blocked, in-progress) alongside the existing document statistics
**Plans**: TBD

Plans:
- [ ] 22-01: Implement statusline hook (VIS-01) and enhance project_overview with task tree progress (VIS-02)

## Progress

**Execution Order:**
Phases execute in numeric order: 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22
Note: Phase 16 and Phase 17 can proceed in parallel (no dependency between them).

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
| 15. Foundation | 2/2 | Complete   | 2026-03-03 | - |
| 16. User Journey Commands | v3.0 | 0/2 | Not started | - |
| 17. Install Script | v3.0 | 0/2 | Not started | - |
| 18. Agent Prompt Improvements | v3.0 | 0/3 | Not started | - |
| 19. Skills Completion | v3.0 | 0/2 | Not started | - |
| 20. Tech Debt | v3.0 | 0/2 | Not started | - |
| 21. E2E Validation | v3.0 | 0/2 | Not started | - |
| 22. Visibility | v3.0 | 0/1 | Not started | - |
