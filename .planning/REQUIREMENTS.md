# Requirements: Synapse

**Defined:** 2026-03-03
**Core Value:** Agents get the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work to context-window-sized executable units.

## v3.0 Requirements

Requirements for Working Prototype milestone. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: project.toml schema defined with project_id, name, skills, and created_at fields
- [x] **FOUND-02**: synapse-startup.js reads project.toml and injects project_id into session context
- [x] **FOUND-03**: All hook command paths use `$CLAUDE_PROJECT_DIR` prefix instead of relative paths
- [x] **FOUND-04**: tier-gate.js, tool-allowlist.js, and precedent-gate.js resolve config from `.synapse/config/` first with monorepo fallback

### Commands

- [x] **CMD-01**: `/synapse:init` command creates project.toml, calls init_project, offers opt-in CLAUDE.md amendment
- [x] **CMD-02**: `/synapse:map` command wraps index_codebase with Ollama health check and progress feedback
- [x] **CMD-03**: `/synapse:refine` command enables brainstorming with DECIDED/OPEN/EMERGING tracking and cross-session persistence
- [x] **CMD-04**: User journey from install to ongoing use is documented as a step-by-step flow

### RPEV Orchestration

- [x] **RPEV-01**: Refine completion auto-queues Plan stage by creating RPEV stage document with stage=PLANNING
- [x] **RPEV-02**: trust.toml `[rpev.involvement]` matrix controls user involvement per hierarchy level and RPEV stage (16 entries)
- [x] **RPEV-03**: synapse-orchestrator.md implements full RPEV flow: Refine->Plan->Execute->Validate with involvement matrix enforcement
- [x] **RPEV-04**: Decision state from Refine (stored via store_decision) persists and feeds into Plan stage via get_smart_context
- [x] **RPEV-05**: RPEV stage documents (doc_id: rpev-stage-[task_id]) track state per item with stage, involvement, pending_approval fields
- [x] **RPEV-06**: `/synapse:status` queries stage documents and shows pending approval items in "Needs Your Input" section
- [x] **RPEV-07**: `/synapse:focus` implements two-tier approval UX (summary + approve/reject/discuss deeper)
- [x] **RPEV-08**: Failed items with exhausted retries appear as flagged in `/synapse:status` with diagnostic info

### Agent Prompts

- [x] **AGENT-01**: Every agent prompt has "MCP as Single Source of Truth" section with query-first principle
- [x] **AGENT-02**: Every agent prompt has concrete tool call sequences with parameter values and response shapes
- [x] **AGENT-03**: Every agent `.md` file has `mcpServers: ["synapse"]` in frontmatter
- [x] **AGENT-04**: Orchestrator agent has subagent handoff protocol (project_id, task_id, doc_ids in every Task call)
- [x] **AGENT-05**: Validator never overwrites task description; stores findings as linked document
- [x] **AGENT-06**: Integration Checker and Plan Reviewer persist findings via store_document + link_documents
- [x] **AGENT-07**: Executor stores implementation summaries as documents
- [x] **AGENT-08**: Every agent prompt has MCP error handling protocol (halt on `success: false`, report to orchestrator)
- [x] **AGENT-09**: Domain mode (co-pilot/autopilot/advisory) injected by startup hook and referenced by all agents
- [x] **AGENT-10**: Decomposer populates context_refs (document_ids, decision_ids) on leaf tasks
- [x] **AGENT-11**: Executor and Validator fetch context_refs at start of each task

### Agent Pool

- [x] **POOL-01**: Pool config in `trust.toml` defines max concurrent agent slots (`max_pool_slots`) — the system respects the configured limit
- [x] **POOL-02**: Unblocked work items are auto-assigned to available agent slots by priority (finish-first, epic priority, wave order, cross-epic fill) — no manual agent dispatch required
- [x] **POOL-03**: `/synapse:focus agent C` shows what agent C is working on and allows interaction (detail view + cancel with requeue/skip)
- [x] **POOL-04**: `/synapse:status` displays agent pool activity (active agents, current tasks, idle slots, queue count) and token usage aggregates on epic/feature lines

### Install

- [ ] **INST-01**: install.sh checks prerequisites (Bun, Ollama running, nomic-embed-text model)
- [ ] **INST-02**: install.sh copies agents, hooks, commands to `.claude/` and generates settings.json and .mcp.json
- [ ] **INST-03**: install.sh runs smoke test (init_project → store_document → semantic_search) before declaring success
- [x] **INST-04**: Usage manual documents the complete user journey, commands reference, and configuration

### Skills

- [x] **SKILL-01**: synapse.toml `skills` field drives dynamic skill injection via startup hook
- [x] **SKILL-02**: Hardcoded TypeScript/Bun skills removed from agents.toml per-agent entries
- [x] **SKILL-03**: Agent prompts are language-agnostic (no hardcoded `.ts` examples or `bun test` references)
- [x] **SKILL-04**: Thin skills (tailwind, python, sql) fleshed out from community standards
- [x] **SKILL-05**: New generic skills added: brainstorming, testing-strategy, architecture-design

### Tech Debt

- [x] **DEBT-01**: Shared escapeSQL helper extracted (currently duplicated in init-project.ts and index-codebase.ts)
- [x] **DEBT-02**: project_meta.created_at preserved on re-init (no longer overwritten)
- [x] **DEBT-03**: INT-02 resolved — AST import edges use ULIDs compatible with get_related_documents
- [x] **DEBT-04**: Linting warnings fixed
- [x] **DEBT-05**: Autonomy mode ordering consistent across all config and agent files

### E2E Validation

- [ ] **E2E-01**: Full RPEV cycle runs on a real task (refine → plan → execute → validate)
- [ ] **E2E-02**: Hooks verified firing via audit log presence after tool calls
- [ ] **E2E-03**: Failure log documented with root causes and patches for top-3 issues
- [ ] **E2E-04**: `/synapse:status` output matches task tree state at completion

### Visibility

- [ ] **VIS-01**: Progress statusline hook shows active epic, wave count, and task completion in Claude Code
- [ ] **VIS-02**: project_overview enhanced to show task tree progress alongside document stats

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Import & Migration

- **IMPORT-01**: GSD/BMad project import tools
- **IMPORT-02**: MCP resources and prompt templates as slash commands

### Language Support

- **LANG-01**: Additional code languages beyond TypeScript, Python, Rust

### Advanced Features

- **ADV-01**: Automated preference learning from past decisions
- **ADV-02**: Real-time collaboration (multiple users)
- **ADV-03**: Web UI or dashboard for workflow progress
- **ADV-04**: Cloud deployment / hosted service

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Silent CLAUDE.md modification | Modifying user files without consent destroys trust; must be opt-in |
| Global `.claude/` installation by default | Project-scope keeps config explicit and version-controllable |
| Automatic system dependency installation (Ollama, Bun) | Installing system-level tools without consent is bad practice; check and instruct instead |
| Agent self-selection of project_id | Inconsistency risk; single source of truth in project.toml is safer |
| Automated E2E test suite for full PEV | PEV involves subagent spawning that cannot be meaningfully mocked; manual validation |
| Runtime skill discovery by agents | Deterministic injection from config is more auditable and reproducible |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 15 | Complete |
| FOUND-02 | Phase 15 | Complete |
| FOUND-03 | Phase 15 | Complete |
| FOUND-04 | Phase 15 | Complete |
| CMD-01 | Phase 16 | Complete |
| CMD-02 | Phase 16 | Complete |
| CMD-03 | Phase 16 | Complete |
| CMD-04 | Phase 16 | Complete |
| DEBT-01 | Phase 17 | Complete |
| DEBT-02 | Phase 17 | Complete |
| DEBT-03 | Phase 17 | Complete |
| DEBT-04 | Phase 17 | Complete |
| DEBT-05 | Phase 17 | Complete |
| RPEV-01 | Phase 18 | Complete |
| RPEV-02 | Phase 18 | Complete |
| RPEV-03 | Phase 18 | Complete |
| RPEV-04 | Phase 18 | Complete |
| RPEV-05 | Phase 18 | Complete |
| RPEV-06 | Phase 18 | Complete |
| RPEV-07 | Phase 18 | Complete |
| RPEV-08 | Phase 18 | Complete |
| AGENT-01 | Phase 19-01 | Complete |
| AGENT-02 | Phase 19 | Complete |
| AGENT-03 | Phase 19-01 | Complete |
| AGENT-04 | Phase 19 | Complete |
| AGENT-05 | Phase 19 | Complete |
| AGENT-06 | Phase 19 | Complete |
| AGENT-07 | Phase 19 | Complete |
| AGENT-08 | Phase 19-01 | Complete |
| AGENT-09 | Phase 19 | Complete |
| AGENT-10 | Phase 19 | Complete |
| AGENT-11 | Phase 19 | Complete |
| SKILL-01 | Phase 20 | Complete |
| SKILL-02 | Phase 20 | Complete |
| SKILL-03 | Phase 20 | Complete |
| SKILL-04 | Phase 20 | Complete |
| SKILL-05 | Phase 20 | Complete |
| POOL-01 | Phase 21-01 | Complete |
| POOL-02 | Phase 21-01 | Complete |
| POOL-03 | Phase 21-02 | Complete |
| POOL-04 | Phase 21-02 | Complete |
| INST-01 | Phase 22 | Pending |
| INST-02 | Phase 22 | Pending |
| INST-03 | Phase 22 | Pending |
| INST-04 | Phase 22 | Complete |
| VIS-01 | Phase 23 | Pending |
| VIS-02 | Phase 23 | Pending |
| E2E-01 | Phase 24 | Pending |
| E2E-02 | Phase 24 | Pending |
| E2E-03 | Phase 24 | Pending |
| E2E-04 | Phase 24 | Pending |

**Coverage:**
- v3.0 requirements: 51 total (39 original + 8 RPEV + 4 Agent Pool)
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-06 after Phase 21 planning (POOL requirements added)*
