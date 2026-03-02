# Agent Roster — Synapse Agentic Framework

**Status:** Approved direction (pending GSD phase planning)
**Date:** 2026-03-01
**Context:** Phase 11 of MILESTONE_2_PLAN.md proposed 3 agents (Planner/Executor/Validator). After analyzing GSD's 11-agent architecture and the original project vision, we expanded to 10 specialized agents with a skill-loading system.

---

## Design Principles

### 1. Narrow Focus Per Agent
GSD's effectiveness comes from giving each agent a single, well-defined responsibility. A "Planner" that also researches, also architects, and also decomposes is doing four jobs poorly instead of one job well. Each agent gets a focused system prompt, restricted tool access, and a clear "done" condition.

### 2. Generic Roles + Project-Specific Skills
Agent roles are **generic templates**. A Researcher is always a Researcher, but what it knows and how it operates is shaped by **loaded skills**. Skills are project-relevant capabilities injected at runtime:

- A Researcher on a React project loads skills for component patterns, state management approaches, and npm ecosystem navigation
- An Executor on a Rust project loads skills for borrow checker patterns, cargo conventions, and unsafe code guidelines
- A Validator on a security-critical project loads skills for OWASP checks, CVE scanning, and penetration testing patterns

This means the 10 agent definitions are reusable across any project. **Skills are the customization layer**, not agent definitions.

### 3. Decision Tier Enforcement
Agents are constrained by which decision tiers they can make autonomously. Higher-tier decisions (product strategy, architecture) require higher-authority agents or user approval. This maps directly to the vision's Trust-Knowledge Matrix.

---

## The 10 Agents

### 1. Product Strategist
| Property | Value |
|----------|-------|
| **Model** | opus |
| **Decision Tiers** | 0 (always with user approval) |
| **Core Responsibility** | Goal clarification, brainstorming, Tier 0 (Product Strategy) decisions |
| **Key Tools** | store_decision, query_decisions, check_precedent, query_documents |
| **Invoked When** | New project, new epic, user wants to change direction |
| **Done When** | Tier 0 decisions are stored and user-approved |

The only agent that handles "what should we build and why." Always user-facing — never runs autonomously. Produces Decision Objects that all downstream agents must respect.

### 2. Researcher
| Property | Value |
|----------|-------|
| **Model** | sonnet |
| **Decision Tiers** | none (read-only) |
| **Core Responsibility** | Explore domain, existing code, technologies, and constraints before planning |
| **Key Tools** | semantic_search, search_code, get_smart_context, query_documents, query_decisions |
| **Invoked When** | Before Architect or Decomposer starts work on a new feature/epic |
| **Done When** | Research artifact produced with findings, options, and trade-offs |

Pure investigation. Cannot make decisions or modify state. Multiple Researchers can run in parallel on different aspects of the same problem (like GSD's parallel project-researchers). Produces structured research artifacts consumed by Architect and Decomposer.

### 3. Architect
| Property | Value |
|----------|-------|
| **Model** | opus |
| **Decision Tiers** | 1, 2 |
| **Core Responsibility** | High-level structural design, "Digital Twin" knowledge graph, Tier 1 (Architecture) decisions |
| **Key Tools** | store_decision, check_precedent, store_document, link_documents, create_task (epics/features only) |
| **Invoked When** | After research, before decomposition. When structural decisions are needed. |
| **Done When** | Architecture decisions stored, high-level component map documented, epic-level tasks created |

Owns the system's structural integrity. Consumes Researcher output and produces the architectural skeleton that the Decomposer will fill in. Maintains the "Digital Twin" — the knowledge graph representation of the project.

### 4. Decomposer
| Property | Value |
|----------|-------|
| **Model** | opus |
| **Decision Tiers** | 1, 2 |
| **Core Responsibility** | Recursive Funnel — break epics into features, features into components, components into executable tasks |
| **Key Tools** | create_task, get_task_tree, check_precedent, query_decisions, store_decision (tier 2) |
| **Invoked When** | After Architect establishes structure |
| **Done When** | All leaf tasks are "executable" (completable within a context window with testable deliverables) |

The vision's "Scoping Agent." Its core skill is knowing when a task is small enough to execute vs. when it needs further breakdown. Enforces the rule: a task is executable when it can be completed within ~200k tokens with testable deliverables.

### 5. Plan Reviewer
| Property | Value |
|----------|-------|
| **Model** | opus |
| **Decision Tiers** | 1, 2, 3 (read/verify only — does not create decisions) |
| **Core Responsibility** | Verify task plans against precedent decisions, check completeness, goal-backward analysis |
| **Key Tools** | get_task_tree, query_decisions, check_precedent, semantic_search, get_smart_context |
| **Invoked When** | After Decomposer finishes a task tree, before Executors begin |
| **Done When** | Plan approved or rejection reasons documented with specific remediation |

The quality gate before execution starts. Asks: "Will completing these tasks actually achieve the stated goal?" and "Do these tasks contradict any established decisions?" Catches bad plans before they waste execution resources.

### 6. Executor
| Property | Value |
|----------|-------|
| **Model** | sonnet |
| **Decision Tiers** | 3 (Execution-level only) |
| **Core Responsibility** | Implement leaf tasks — write code, store documents, update task status |
| **Key Tools** | store_document, update_task, store_decision (tier 3), check_precedent, get_smart_context, search_code |
| **Invoked When** | Plan Reviewer approved, leaf tasks are assigned |
| **Done When** | Task deliverables produced, task status updated to completed |

High-throughput implementation agent. Multiple Executors can run in parallel on independent leaf tasks. Constrained to Tier 3 decisions only — if it encounters something that needs an architectural decision, it blocks and escalates.

### 7. Validator
| Property | Value |
|----------|-------|
| **Model** | sonnet |
| **Decision Tiers** | 2, 3 |
| **Core Responsibility** | Post-execution verification — tests pass, output matches task spec, decisions are respected |
| **Key Tools** | update_task, query_decisions, check_precedent, get_smart_context, search_code |
| **Invoked When** | After Executor completes a task or batch of tasks |
| **Done When** | Task accepted (status → validated) or rejected with specific failures |

The vision's "Gatekeeper Agent." Checks each completed task against its spec and the relevant Decision Objects. Does not check cross-task integration (that's the Integration Checker's job).

### 8. Integration Checker
| Property | Value |
|----------|-------|
| **Model** | sonnet |
| **Decision Tiers** | 2 |
| **Core Responsibility** | Cross-component and cross-task validation — do the pieces work together? |
| **Key Tools** | get_task_tree, query_decisions, search_code, get_smart_context, semantic_search |
| **Invoked When** | After a group of related tasks are validated, or at milestone boundaries |
| **Done When** | Integration report produced — pass/fail with specific issues |

Validator checks individual tasks; Integration Checker checks the seams between them. Runs E2E flows, verifies that component A's output is compatible with component B's input, and catches integration regressions.

### 9. Debugger
| Property | Value |
|----------|-------|
| **Model** | sonnet |
| **Decision Tiers** | 3 |
| **Core Responsibility** | Systematic root-cause analysis when execution or validation fails |
| **Key Tools** | search_code, get_smart_context, semantic_search, update_task, store_decision (tier 3) |
| **Invoked When** | Executor fails, Validator rejects, Integration Checker finds issues |
| **Done When** | Root cause identified, fix applied or escalated with diagnosis |

A reactive agent — only activated on failure. Uses a scientific method approach: hypothesize, test, narrow down. Can store Tier 3 decisions about bug fixes and workarounds.

### 10. Codebase Analyst
| Property | Value |
|----------|-------|
| **Model** | sonnet |
| **Decision Tiers** | none (read-only) |
| **Core Responsibility** | Maintain the Digital Twin — map codebase structure, track architectural drift |
| **Key Tools** | index_codebase, get_index_status, search_code, get_smart_context, store_document |
| **Invoked When** | Periodically, after major changes, before Researcher starts exploration |
| **Done When** | Codebase analysis documents updated in Synapse |

Keeps the knowledge graph accurate. After Executors make changes, the Codebase Analyst re-indexes and updates the project's structural understanding. The Researcher relies on this agent's output for accurate codebase exploration.

---

## Skill Loading System

### Concept

Agent roles are **generic**. Skills are **project-specific optimizations** loaded at runtime. This is the key customization mechanism — not building custom agents per project, but loading the right skills onto generic agents.

### What a Skill Provides

| Component | Purpose |
|-----------|---------|
| **Domain Knowledge** | Patterns, conventions, and best practices for the project's tech stack |
| **Tool Guidance** | How to use Synapse tools effectively for this domain (e.g., what to embed, how to structure tasks) |
| **Quality Criteria** | Domain-specific validation rules (e.g., accessibility checks for frontend, SQL injection checks for backend) |
| **Vocabulary** | Project-specific terminology that improves semantic search and decision matching |

### Skill Assignment Flow

```
Project Config → Skill Registry → Agent Spawn
     │                │                │
     │  "This is a    │  Match skills  │  Inject skill
     │   React +      │  to agent      │  prompts into
     │   Node.js      │  roles         │  system prompt
     │   project"     │                │  + tool config
```

1. **Project config** declares the tech stack, domain, and constraints
2. **Skill registry** maps project attributes to available skills
3. **Orchestrator** loads relevant skills when spawning each agent
4. Skills are injected as additional system prompt content and tool configuration

### Examples

| Project Context | Agent | Loaded Skills |
|-----------------|-------|---------------|
| React + TypeScript frontend | Executor | React component patterns, TypeScript strict mode, CSS-in-JS conventions |
| Python ML pipeline | Researcher | ML framework comparison, dataset evaluation, benchmark methodology |
| Security-critical API | Validator | OWASP Top 10 checks, auth flow validation, input sanitization verification |
| Rust systems programming | Debugger | Borrow checker error patterns, unsafe code analysis, memory leak detection |

### Skill vs Agent

| Aspect | Agent | Skill |
|--------|-------|-------|
| **Scope** | Generic role (Executor, Researcher...) | Domain-specific capability |
| **Lifetime** | Exists for the framework | Loaded per project/task |
| **Reusability** | Across all projects | Within matching project types |
| **Definition** | System prompt + tool restrictions + tier authority | Supplemental prompt content + quality criteria |

---

## Workflow Mapping

How the 10 agents map to the vision's Integrated Workflow:

| Vision Step | Agent(s) | Decision Tier |
|-------------|----------|---------------|
| 1. Brainstorming | Product Strategist | Tier 0 (user mandatory) |
| 2. Mapping (Graph View) | Researcher → Architect | Tier 1 (strategic approval) |
| 3. Decomposition | Decomposer, Plan Reviewer | Tier 1-2 |
| 4. Execution | Executor (parallel) | Tier 3 (autopilot) |
| 5. Validation | Validator → Integration Checker | Tier 2-3 |
| 6. Acceptance | Validator (final) + user checkpoint | Tier 0-1 decisions reviewed |

**Failure path:** Executor fails → Debugger → fix → Validator re-checks
**Drift detection:** Codebase Analyst runs periodically to keep Digital Twin accurate

---

## Comparison: Phase 11 Original vs This Roster

| Original (3 agents) | This Roster (10 agents) | Why the split matters |
|---------------------|------------------------|----------------------|
| Planner | Product Strategist + Researcher + Architect + Decomposer + Plan Reviewer | Research, architecture, decomposition, and verification are distinct cognitive tasks |
| Executor | Executor | Unchanged — already well-scoped |
| Validator | Validator + Integration Checker | Per-task validation vs cross-task integration are different skills |
| (missing) | Debugger | Reactive failure handling needs its own methodology |
| (missing) | Codebase Analyst | Keeping the Digital Twin alive requires continuous maintenance |

---

## Deep Comparison: GSD Workflow Agents vs Synapse Roster

### GSD's 11 Agents and Their Workflow Roles

GSD's agents are defined in `.claude/agents/gsd-*.md` and orchestrated by workflow files in `.claude/get-shit-done/workflows/`. The complete roster:

| # | GSD Agent | Spawned By | Role | Parallelism |
|---|-----------|------------|------|-------------|
| 1 | **gsd-project-researcher** | `new-project.md` | Domain research before roadmap (4 dimensions: Stack, Features, Architecture, Pitfalls) | 4 instances in parallel |
| 2 | **gsd-research-synthesizer** | `new-project.md` | Combines 4 parallel research outputs into SUMMARY.md | Single, after researchers |
| 3 | **gsd-roadmapper** | `new-project.md` | Creates phased roadmap from research + requirements | Single |
| 4 | **gsd-phase-researcher** | `plan-phase.md` | Researches implementation approach for a specific phase | Single per phase |
| 5 | **gsd-planner** | `plan-phase.md`, `verify-work.md` | Creates executable PLAN.md files with task breakdown | Single, then iterates |
| 6 | **gsd-plan-checker** | `plan-phase.md`, `verify-work.md` | Verifies plans achieve phase goal (planner↔checker loop, max 3 iterations) | Single |
| 7 | **gsd-executor** | `execute-phase.md` | Implements plans: writes code, commits atomically, creates SUMMARY.md | Multiple per wave (parallel) |
| 8 | **gsd-verifier** | `execute-phase.md`, `verify-phase.md` | Goal-backward verification: truths → artifacts → wiring → anti-patterns | Single per phase |
| 9 | **gsd-integration-checker** | `audit-milestone.md` | Cross-phase integration and E2E flow validation at milestone boundaries | Single |
| 10 | **gsd-debugger** | `diagnose-issues.md` | Scientific method root-cause analysis when UAT finds issues | Multiple in parallel (1 per gap) |
| 11 | **gsd-codebase-mapper** | `map-codebase.md` | Structured codebase analysis (4 focus areas: Tech, Architecture, Quality, Concerns) | 4 instances in parallel |

Plus **orchestrator-direct workflows** (no dedicated agent — the orchestrator handles these itself):
- `discuss-phase.md` — User-facing context gathering (gray areas, implementation decisions)
- `transition.md` — Phase completion, PROJECT.md evolution, state advancement
- `verify-work.md` — UAT testing orchestration (spawns debugger + planner + plan-checker)
- `new-project.md` — Deep questioning, requirements gathering (spawns researchers + roadmapper)

### GSD's Full Lifecycle

```
new-project:     Question → Research (4x parallel) → Synthesize → Requirements → Roadmap
                       ↓
discuss-phase:   Identify gray areas → User discussion → CONTEXT.md
                       ↓
plan-phase:      Research (phase) → Plan → Verify Plan → [Revision Loop max 3x]
                       ↓
execute-phase:   Discover plans → Group waves → Execute (parallel executors) → Verify (verifier)
                       ↓
transition:      Verify completion → Update state → Evolve PROJECT.md → Next phase
                       ↓
verify-work:     UAT testing → Diagnose issues (parallel debuggers) → Plan fixes → Verify fixes
                       ↓
audit-milestone: Aggregate verifications → Integration check → Requirements coverage → Report
```

### Agent-to-Agent Mapping

| GSD Agent | Synapse Agent | Mapping Quality | Notes |
|-----------|---------------|-----------------|-------|
| gsd-project-researcher (x4) | **Researcher** (x4) | Direct | GSD runs 4 dimension-specific instances in parallel. Synapse Researcher does the same — parallel instances with different focus prompts |
| gsd-research-synthesizer | **Architect** (absorbs) | Combined | GSD has a dedicated synthesizer; in Synapse, the Architect consumes parallel research and synthesizes into architectural decisions |
| gsd-roadmapper | **Decomposer** (absorbs) | Combined | GSD's roadmapper creates phase structure; Synapse's Decomposer creates the task tree. Both are "break big things into smaller things" |
| gsd-phase-researcher | **Researcher** | Direct | Same agent, different invocation context (domain research vs implementation research) |
| gsd-planner | **Decomposer** | Direct | GSD creates PLAN.md files; Synapse creates task tree in LanceDB. Both produce executable work units |
| gsd-plan-checker | **Plan Reviewer** | Direct | Identical purpose: verify plans achieve goals before execution |
| gsd-executor | **Executor** | Direct | Identical purpose: implement work units with atomic commits |
| gsd-verifier | **Validator** | Direct | Both do goal-backward verification of outcomes |
| gsd-integration-checker | **Integration Checker** | Direct | Both check cross-component/cross-phase wiring |
| gsd-debugger | **Debugger** | Direct | Both use scientific method for root-cause analysis |
| gsd-codebase-mapper (x4) | **Codebase Analyst** | Direct | Both produce structured analysis documents from codebase exploration |
| (orchestrator-direct) | **Product Strategist** | New role | GSD handles user-facing interaction in the orchestrator itself; Synapse elevates this to a dedicated agent for Tier 0 decisions |
| — | **Architect** | No GSD equivalent | GSD embeds architecture in the research→plan pipeline; Synapse makes it explicit with a dedicated agent that maintains the Digital Twin |

### Key Patterns to Adopt from GSD

**1. Research-Before-Action**
GSD never plans without researching first. The `plan-phase` workflow always offers research before planning (configurable via `workflow.research` in config). Synapse should make this a core workflow pattern: Researcher always runs before Decomposer.

**2. Plan-Then-Verify-Plan Loop**
GSD's planner↔plan-checker iteration (max 3 rounds) is a key quality mechanism. The plan-checker catches gaps before any code is written. Synapse should implement this as a Decomposer↔Plan Reviewer loop with the same iteration limit.

**3. Wave-Based Parallel Execution**
GSD groups plans into dependency waves and executes each wave in parallel. Independent tasks within a wave get separate Executor instances with fresh context windows (~200k each). Synapse should organize leaf tasks into dependency waves for parallel Executor spawning.

**4. Progressive Verification**
GSD verifies at 4 levels:
- **Per-task**: Executor self-checks (done criteria, tests pass)
- **Per-plan**: SUMMARY.md self-check (files exist, commits present)
- **Per-phase**: gsd-verifier (goal-backward: truths → artifacts → wiring)
- **Per-milestone**: gsd-integration-checker (cross-phase E2E)

Synapse should mirror this with:
- **Per-task**: Executor self-checks
- **Per-feature**: Validator checks individual task outputs
- **Per-epic**: Integration Checker checks feature interactions
- **Per-project**: Integration Checker at milestone boundaries

**5. Parallel Research Dimensions**
GSD spawns 4 researchers simultaneously on different dimensions (Stack, Features, Architecture, Pitfalls). Each gets fresh context. Synapse should support spawning multiple Researchers in parallel with different focus areas, then having the Architect synthesize their outputs.

**6. Orchestrator Stays Lean**
GSD's orchestrator uses ~10-15% context, delegating heavy work to fresh-context subagents. Subagents read their own files rather than receiving content through the orchestrator. This prevents context contamination and keeps the orchestrator responsive. Synapse's orchestrator should follow this pattern.

**7. Failure Recovery Cycle**
GSD's failure path: Executor fails → Debugger diagnoses (parallel, 1 per issue) → Planner creates targeted fixes → Plan-checker verifies → Executor implements fixes. This is a closed loop. Synapse should implement: Executor fails → Debugger diagnoses → Decomposer plans fix tasks → Plan Reviewer approves → Executor implements.

**8. User Interaction Points**
GSD identifies specific moments for user involvement:
- **discuss-phase**: Before planning (gray areas, design decisions)
- **checkpoint:human-verify**: During execution (verify outputs)
- **checkpoint:decision**: During execution (architectural choices)
- **checkpoint:human-action**: During execution (manual steps like auth)
- **verify-work UAT**: After execution (acceptance testing)

These map to Synapse's Decision Tier system:
- discuss-phase → Product Strategist (Tier 0)
- checkpoint:decision → Executor escalates to Architect (Tier 1-2)
- checkpoint:human-action → Orchestrator pauses for user
- verify-work → Validator + user checkpoint

### What GSD Does That Synapse Doesn't Need

| GSD Pattern | Why Synapse Handles It Differently |
|---|---|
| File-based state (STATE.md, ROADMAP.md, SUMMARY.md) | Synapse stores state in LanceDB tables (tasks, decisions). No file-based tracking needed. |
| Research Synthesizer as separate agent | Architect absorbs synthesis role — it naturally combines research into structural decisions |
| Roadmapper as separate agent | Decomposer handles the full recursive funnel from epic to leaf task |
| Discuss-phase as orchestrator-direct | Product Strategist agent handles user-facing context gathering via Tier 0 decisions |
| Commit protocol per task | Synapse tracks task state in LanceDB; the Executor's code commits are separate from task status updates |

### What Synapse Adds That GSD Doesn't Have

| Synapse Addition | Why It's Needed |
|---|---|
| **Product Strategist** agent | GSD relies on the user to drive product decisions; Synapse's Tier 0 system needs a dedicated agent to facilitate brainstorming and strategic choices |
| **Architect** agent | GSD embeds architecture decisions implicitly in research/planning; Synapse makes architectural decisions explicit, stored as Decision Objects, maintaining the Digital Twin |
| **Skill Loading** system | GSD's agents are hardcoded for software development; Synapse's generic agents + skills make the framework domain-agnostic |
| **Decision Precedent** system | GSD tracks decisions in STATE.md as free text; Synapse stores decisions as searchable vector-embedded objects that agents query before acting |
| **Trust-Knowledge Matrix** | GSD has a simple yolo/interactive toggle; Synapse's per-domain trust scores allow graduated autonomy |

---

## Implementation Notes for GSD Planning

- Phase 11 in MILESTONE_2_PLAN.md should be updated to reflect this 10-agent roster
- The skill loading system may warrant its own phase (or be part of the orchestrator foundation in Phase 10)
- Agent definitions are `orchestrator/src/agents/{role}.ts` files with system prompt, tool allowlist, tier authority, and skill slots
- Consider: Phase 10 (Orchestrator Foundation) should include the skill registry infrastructure
- Each agent definition should be testable in isolation (give it a prompt, verify it only uses allowed tools and tiers)
- The planner↔plan-reviewer iteration loop (max 3 rounds, inspired by GSD) should be part of Phase 12 (Quality Gates)
- Wave-based parallel execution (inspired by GSD's execute-phase) should be part of the orchestrator's task scheduling logic in Phase 12
- Progressive verification (per-task, per-feature, per-epic, per-project) should be the Validator and Integration Checker's default operating mode

---

*Derived from: project_vision.md (Synapse-Nexus architecture), MILESTONE_2_PLAN.md (Phase 11 original), GSD workflow definitions (.claude/get-shit-done/workflows/), and GSD agent definitions (.claude/agents/gsd-*.md). Approved as direction 2026-03-01.*
