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

- [x] **INST-01**: install.sh checks prerequisites (Bun, Ollama running, nomic-embed-text model)
- [x] **INST-02**: install.sh copies agents, hooks, commands to `.claude/` and generates settings.json and .mcp.json
- [x] **INST-03**: install.sh runs smoke test (init_project → store_document → semantic_search) before declaring success
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

- [x] **E2E-01**: Full RPEV cycle runs on a real task (refine → plan → execute → validate)
- [x] **E2E-02**: Hooks verified firing via audit log presence after tool calls
- [x] **E2E-03**: Failure log documented with root causes and patches for top-3 issues
- [x] **E2E-04**: `/synapse:status` output matches task tree state at completion (PARTIAL — core data accurate, presentation gaps documented)

### Visibility

- [x] **VIS-01**: Progress statusline hook shows active epic, wave count, and task completion in Claude Code
- [x] **VIS-02**: project_overview enhanced to show task tree progress alongside document stats

### Agent Behavior Hardening

- [x] **ABH-01**: RPEV stages have explicit boundaries — stage documents persisted at each transition, gate checks verify prerequisites before proceeding
- [x] **ABH-02**: Orchestrator delegates bookkeeping to subagents — executors mark their own tasks done, validators update their own findings, orchestrator context stays lean
- [x] **ABH-03**: Executors create atomic commits per task and orchestrator verifies commits exist before marking tasks done
- [x] **ABH-04**: /synapse:status output is consistent across runs and uses filtered queries that scale to 100+ task trees
- [x] **ABH-05**: Audit log entries have correct agent attribution (not "unknown") for at least 80% of calls
- [ ] **ABH-06**: A second E2E run on rpi-camera-py shows measurably fewer issues than the first run (target: 0 BLOCKER, <10 DEGRADED)
- [ ] **ABH-07**: Researcher uses WebSearch/WebFetch/Context7 for external research with confidence tiers; Architect and Decomposer spawn researchers before decisions/decomposition; orchestrator chains researcher doc_ids to downstream agents
- [x] **ABH-08**: Feature completion creates PRs via `gh pr create` with RPEV context; merge gate respects involvement mode; rollback protocol has explicit git commands

### TDD Pipeline

- [x] **TDD-01**: test-designer.md agent exists as standalone Opus agent with Convention Discovery, Test Design Protocol, RED verification, and @requirement tracing
- [x] **TDD-02**: Task-auditor triangulates planner requirements + task-designer spec + test-designer tests; runs tests independently; routes rejections to appropriate owner
- [x] **TDD-03**: Executor MUST NOT modify/delete test-designer tests; reports structured status (DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT); performs self-review before handoff
- [x] **TDD-04**: Validator runs TDD Verification Protocol (immutability check, run tests, spec compliance, executor status review)
- [x] **TDD-05**: Planner frames test expectations as test-designer input with @requirement tracing
- [x] **TDD-06**: Orchestrator dispatches test-designer after task-designer and before task-auditor; handles TDD escalation routing (BLOCKED/DONE_WITH_CONCERNS/NEEDS_CONTEXT)
- [x] **TDD-07**: agents.toml registers test-designer; trust.toml has test-designer tier authority; shared protocol has test-contract as provides vocabulary slug

### Behavioral Enforcement (Best Practices)

- [ ] **BEH-01**: Every agent (all 16 files) has an inline Anti-Rationalization table with at least 3 externally-sourced entries specific to its critical constraints
- [ ] **BEH-02**: Skill pressure testing protocol document exists with RED-GREEN-REFACTOR methodology and 2-3 worked example scenarios
- [x] **BEH-03**: output-contracts.toml config is single source of truth for agent output contracts; output-contract-gate.js PostToolUse hook enforces contracts fail-closed
- [ ] **BEH-04**: code-quality-reviewer.md agent exists (Sonnet model) for craftsmanship + security + performance review after validator passes; registered in agents.toml and trust.toml
- [ ] **BEH-05**: Orchestrator mandates fresh agent per task, includes inline task spec in handoffs, dispatches code-quality-reviewer after validator PASS
- [ ] **BEH-06**: Validator forms independent verdict (run tests, read code, assess) BEFORE reading executor's implementation summary
- [ ] **BEH-07**: All doer agents report DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED; all reviewer agents report APPROVED/REJECTED/NEEDS_REVISION
- [ ] **BEH-08**: _synapse-protocol.md contains anti-sycophancy review-reception protocol (verify, evaluate, respond) and quality-review as 13th provides slug
- [ ] **BEH-09**: Brainstorming SKILL.md rewritten to 7-step sequential checklist with hard gate (no implementation before design approval) and one-question-at-a-time enforcement
- [ ] **BEH-10**: All 18 existing skill SKILL.md files have anti-rationalization sections with externally-sourced entries
- [ ] **BEH-11**: trust.toml has max_revision_retries = 2 for NEEDS_REVISION cycle limits; Provides vocabulary expanded to 13 slugs

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
| INST-01 | Phase 22 | Complete |
| INST-02 | Phase 22 | Complete |
| INST-03 | Phase 22 | Complete |
| INST-04 | Phase 22 | Complete |
| VIS-01 | Phase 23-01 | Complete |
| VIS-02 | Phase 23-02 | Complete |
| E2E-01 | Phase 24 | Complete |
| E2E-02 | Phase 24 | Complete |
| E2E-03 | Phase 24 | Complete |
| E2E-04 | Phase 24 | Complete (PARTIAL — core data accurate, presentation gaps in Phase 25 scope) |
| ABH-01 | Phase 25-01 | Complete |
| ABH-02 | Phase 25-01 | Complete |
| ABH-03 | Phase 25-01 | Complete |
| ABH-04 | Phase 25-02 | Complete |
| ABH-05 | Phase 25-03 | Complete |
| ABH-06 | Phase 25-04 | Planned |
| ABH-07 | Phase 25-05 | Complete |
| ABH-08 | Phase 25-06 | Complete |
| TDD-01 | Phase 26.3 | Complete |
| TDD-02 | Phase 26.3 | Complete |
| TDD-03 | Phase 26.3 | Complete |
| TDD-04 | Phase 26.3 | Complete |
| TDD-05 | Phase 26.3 | Complete |
| TDD-06 | Phase 26.3 | Complete |
| TDD-07 | Phase 26.3 | Complete |
| BEH-01 | Phase 26.4 | Planned |
| BEH-02 | Phase 26.4 | Planned |
| BEH-03 | Phase 26.4 | Planned |
| BEH-04 | Phase 26.4 | Planned |
| BEH-05 | Phase 26.4 | Planned |
| BEH-06 | Phase 26.4 | Planned |
| BEH-07 | Phase 26.4 | Planned |
| BEH-08 | Phase 26.4 | Planned |
| BEH-09 | Phase 26.4 | Planned |
| BEH-10 | Phase 26.4 | Planned |
| BEH-11 | Phase 26.4 | Planned |

**Coverage:**
- v3.0 requirements: 77 total (39 original + 8 RPEV + 4 Agent Pool + 8 Agent Behavior Hardening + 7 TDD Pipeline + 11 Behavioral Enforcement)
- Mapped to phases: 77
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-12 after Phase 26.4 planning (Behavioral Enforcement requirements added)*
