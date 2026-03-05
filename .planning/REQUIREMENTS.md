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
- [ ] **CMD-03**: `/synapse:plan` command connects user goal to PEV workflow via orchestrator agent
- [x] **CMD-04**: User journey from install to ongoing use is documented as a step-by-step flow

### Install

- [ ] **INST-01**: install.sh checks prerequisites (Bun, Ollama running, nomic-embed-text model)
- [ ] **INST-02**: install.sh copies agents, hooks, commands to `.claude/` and generates settings.json and .mcp.json
- [ ] **INST-03**: install.sh runs smoke test (init_project → store_document → semantic_search) before declaring success
- [ ] **INST-04**: Usage manual documents the complete user journey, commands reference, and configuration

### Agent Prompts

- [ ] **AGENT-01**: Every agent prompt has "MCP as Single Source of Truth" section with query-first principle
- [ ] **AGENT-02**: Every agent prompt has concrete tool call sequences with parameter values and response shapes
- [ ] **AGENT-03**: Every agent `.md` file has `mcpServers: ["synapse"]` in frontmatter
- [ ] **AGENT-04**: Orchestrator agent has subagent handoff protocol (project_id, task_id, doc_ids in every Task call)
- [ ] **AGENT-05**: Validator never overwrites task description; stores findings as linked document
- [ ] **AGENT-06**: Integration Checker and Plan Reviewer persist findings via store_document + link_documents
- [ ] **AGENT-07**: Executor stores implementation summaries as documents
- [ ] **AGENT-08**: Every agent prompt has MCP error handling protocol (halt on `success: false`, report to orchestrator)
- [ ] **AGENT-09**: Domain mode (co-pilot/autopilot/advisory) injected by startup hook and referenced by all agents
- [ ] **AGENT-10**: Decomposer populates context_refs (document_ids, decision_ids) on leaf tasks
- [ ] **AGENT-11**: Executor and Validator fetch context_refs at start of each task

### Skills

- [ ] **SKILL-01**: synapse.toml `skills` field drives dynamic skill injection via startup hook
- [ ] **SKILL-02**: Hardcoded TypeScript/Bun skills removed from agents.toml per-agent entries
- [ ] **SKILL-03**: Agent prompts are language-agnostic (no hardcoded `.ts` examples or `bun test` references)
- [ ] **SKILL-04**: Thin skills (tailwind, python, sql) fleshed out from community standards
- [ ] **SKILL-05**: New generic skills added: brainstorming, testing-strategy, architecture-design

### E2E Validation

- [ ] **E2E-01**: Full PEV cycle runs on a real task (decompose → plan review → execute → validate)
- [ ] **E2E-02**: Hooks verified firing via audit log presence after tool calls
- [ ] **E2E-03**: Failure log documented with root causes and patches for top-3 issues
- [ ] **E2E-04**: `/synapse:status` output matches task tree state at completion

### Tech Debt

- [ ] **DEBT-01**: Shared escapeSQL helper extracted (currently duplicated in init-project.ts and index-codebase.ts)
- [ ] **DEBT-02**: project_meta.created_at preserved on re-init (no longer overwritten)
- [ ] **DEBT-03**: INT-02 resolved — AST import edges use ULIDs compatible with get_related_documents
- [ ] **DEBT-04**: Linting warnings fixed
- [ ] **DEBT-05**: Autonomy mode ordering consistent across all config and agent files

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
| CMD-03 | Phase 16 | Pending |
| CMD-04 | Phase 16 | Complete |
| INST-01 | Phase 17 | Pending |
| INST-02 | Phase 17 | Pending |
| INST-03 | Phase 17 | Pending |
| INST-04 | Phase 17 | Pending |
| AGENT-01 | Phase 18 | Pending |
| AGENT-02 | Phase 18 | Pending |
| AGENT-03 | Phase 18 | Pending |
| AGENT-04 | Phase 18 | Pending |
| AGENT-05 | Phase 18 | Pending |
| AGENT-06 | Phase 18 | Pending |
| AGENT-07 | Phase 18 | Pending |
| AGENT-08 | Phase 18 | Pending |
| AGENT-09 | Phase 18 | Pending |
| AGENT-10 | Phase 18 | Pending |
| AGENT-11 | Phase 18 | Pending |
| SKILL-01 | Phase 19 | Pending |
| SKILL-02 | Phase 19 | Pending |
| SKILL-03 | Phase 19 | Pending |
| SKILL-04 | Phase 19 | Pending |
| SKILL-05 | Phase 19 | Pending |
| DEBT-01 | Phase 20 | Pending |
| DEBT-02 | Phase 20 | Pending |
| DEBT-03 | Phase 20 | Pending |
| DEBT-04 | Phase 20 | Pending |
| DEBT-05 | Phase 20 | Pending |
| E2E-01 | Phase 21 | Pending |
| E2E-02 | Phase 21 | Pending |
| E2E-03 | Phase 21 | Pending |
| E2E-04 | Phase 21 | Pending |
| VIS-01 | Phase 22 | Pending |
| VIS-02 | Phase 22 | Pending |

**Coverage:**
- v3.0 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation (traceability complete)*
