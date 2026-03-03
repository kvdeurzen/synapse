# Feature Research — v3.0 Working Prototype

**Domain:** Developer tool onboarding, MCP server integration, AI agent framework usability, end-to-end workflow wiring
**Researched:** 2026-03-03
**Confidence:** HIGH (Claude Code official docs verified for integration patterns; MEDIUM for comparative developer tool UX patterns; HIGH for Claude Code skills/subagent frontmatter)

> **Scope note:** This file covers NEW features for v3.0 only. v1.0 (data layer) and v2.0 (agentic coordination framework) are fully built. v3.0 is the "working prototype" milestone: wiring all existing pieces into a usable end-to-end product — from install to agent-driven workflow execution.

> **What already exists (do not re-build):**
> - 24 MCP tools across documents, code, tasks, decisions, project management
> - 10 specialized agent `.md` files in `packages/framework/agents/`
> - 7 skills directories in `packages/framework/skills/`
> - 6 hook scripts in `packages/framework/hooks/`
> - `packages/framework/workflows/pev-workflow.md` — full PEV spec
> - `packages/framework/config/synapse.toml` and `agents.toml`
> - `packages/framework/settings.template.json` — MCP + hooks config template
> - 2 existing commands: `/synapse:new-goal` and `/synapse:status`

---

## Domain Overview: What End-to-End Usability Means for This Category

Synapse has two distinct user groups to onboard: (1) developers setting up Synapse for the first time, and (2) Claude Code agents that run during sessions. Both need their own "onboarding":

- **Human onboarding:** Install prerequisites, configure project, understand the user journey (install → init → map → goal → plan → execute → validate)
- **Agent onboarding:** Agents must know HOW to use Synapse MCP tools — which tools to call, in what order, with what parameters, and how to treat MCP as the single source of truth

The gap analysis (`PROTO_GAP_ANALYSIS.md`) is authoritative on what's missing. This research maps those gaps to feature categories, complexity, and patterns from the broader ecosystem.

**Key insight from ecosystem research:** The single biggest differentiator in developer tool UX is **time-to-first-value**. GSD achieves first value via `npx get-shit-done-cc@latest` + `/gsd:new-project`. Claude Code itself achieves first value via `claude mcp add`. Synapse needs a comparable path: prerequisite check → one install command → first working session.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any serious developer tool / Claude Code framework must have. Missing these makes the product feel unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-command install | Every mature CLI tool (GSD, GitHub MCP, Playwright MCP) installs via one command; multi-step manual setup is a friction wall | MEDIUM | Install script that configures `.claude/`, copies/links agent files, writes `.mcp.json`, checks prerequisites (Bun, Ollama, nomic-embed-text) |
| Prerequisite check with clear error messages | Users running `node`, missing Ollama, or using wrong Bun version need actionable errors, not cryptic failures | LOW | Script that checks `bun --version`, `ollama list`, presence of `nomic-embed-text`; fails with specific fix instructions |
| First-run setup command | `/synapse:init` pattern is expected for any project initialization tool; GSD has `/gsd:new-project`, Claude Code has `/init` | MEDIUM | Guides user through project_id setup, skill selection, synapse.toml creation, initial `init_project` call |
| Codebase indexing command | Any AI coding tool that promises code awareness must expose a command to trigger indexing; users expect `/synapse:map` or equivalent | LOW | Thin wrapper over existing `index_codebase` MCP tool with progress feedback |
| Goal-to-workflow entry point | Users need a clear "how do I start a task?" path; `/synapse:plan` or equivalent entry point is the answer | MEDIUM | Connects user goal to PEV workflow; builds on existing `/synapse:new-goal` |
| Project status visibility | Users expect to see current state without asking; `/synapse:status` already exists and is table stakes — it must be complete and reliable | LOW | Already built; needs verification that all fields display correctly |
| MCP server wired into Claude Code | The MCP server must auto-start when Claude Code opens; nothing in the framework works until this is true | MEDIUM | `.mcp.json` at project root (project-scope) OR amend user's `.claude.json` (user-scope) during install; per official Claude Code MCP docs |
| Hooks wired into Claude Code | Quality gates are useless if hooks never fire; hooks must appear in `settings.json` with correct matchers | LOW | `settings.json` already has the template (`settings.template.json`); install script must copy this to the right location |
| Agents wired as Claude Code subagents | Framework agents are just `.md` files until they live in `.claude/agents/`; Claude Code will not use them otherwise | LOW | Copy or symlink from `packages/framework/agents/*.md` to `.claude/agents/` during install; validate frontmatter compliance |
| CLAUDE.md project awareness | Synapse-specific instructions must be in `CLAUDE.md` so every session starts Synapse-aware; the orchestrator and workflow references must be resolvable | MEDIUM | On `/synapse:init`, offer to append Synapse context to project CLAUDE.md (opt-in, never silent); tells Claude Code about the orchestrator, workflow document, and MCP conventions |
| Usage documentation | Every mature tool has a "how to use" guide separate from "what it is"; README covers the latter but not the former | MEDIUM | Install manual covering: user journey, commands reference, agent roster, trust.toml autonomy configuration, skills configuration |
| Project ID seamless injection | Every MCP tool requires `project_id` but no agent currently knows where it comes from; this must be transparent | MEDIUM | Store project_id in `synapse.toml`; startup hook reads it and injects it into session context; agents reference it from context rather than asking user |

### Differentiators (Competitive Advantage)

Features that set Synapse apart in the Claude Code framework ecosystem. These are where the product competes.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| MCP as single source of truth principle | Agents are explicitly trained to use Synapse MCP as their primary knowledge source BEFORE filesystem exploration. No other Claude Code framework enforces this discipline | MEDIUM | Each agent prompt gets a "MCP First" section with the principle + tool call order: query Synapse → filesystem if not found → store result back to Synapse. Prevents agents from re-discovering what's already stored |
| Dynamic skill injection via synapse.toml | Project declares its stack (`skills = ["typescript", "bun", "vitest"]`) once; startup hook auto-injects the matching skills into every session. No manual per-agent skill assignment | MEDIUM | `synapse.toml` gets a `[project] skills = [...]` field; `synapse-startup.js` reads it and injects skill content into `additionalContext`; removes hardcoded TypeScript skills from `agents.toml` |
| Context reference delivery (decomposer to executor) | Decomposer attaches `decision_ids` and `document_ids` to each leaf task it creates. Executors receive targeted references, not "search and hope." This is core Synapse value: strategic context delivery | HIGH | Add `context_refs` field to task creation; decomposer must populate it; executor and validator prompts must start with fetching those references via `query_decisions(ids=[...])` and `get_smart_context(document_ids=[...])` |
| Agent findings persisted as queryable documents | Integration Checker, Plan Reviewer, Validator, and Executor all store their outputs as `store_document` calls with `link_documents`. Future agents can query these findings without re-running the agent | MEDIUM | Expand allowed_tools for Integration Checker and Plan Reviewer to include `store_document` + `link_documents`; add explicit persistence steps to each agent's workflow section |
| Domain mode (co-pilot/autopilot/advisory) delivered at runtime | trust.toml defines per-domain autonomy but currently no mechanism delivers the active mode to agents. Synapse will be the first Claude Code framework to inject domain mode per-session | MEDIUM | Startup hook reads `trust.toml` domains section; injects the active mode for each domain into additionalContext; agents reference their mode from context rather than hardcoding behavior |
| Wave execution progress in Claude Code statusline | Task tree progress (Wave N of M, X/Y tasks done) visible in the Claude Code status line, not buried in conversation. Comparable to GSD's statusline hook | HIGH | Requires querying `get_task_tree` for active epic; emit wave/task counts; hook into Claude Code statusline via `statusLine.command` in settings.json |
| Fail-closed error handling with explicit guidance | When a Synapse tool call fails (Ollama down, DB error), agents have explicit protocol: stop, report error, do not proceed silently. Not found in comparable frameworks | LOW | Add "MCP Error Handling" section to every agent prompt: if any `mcp__synapse__*` call returns `success: false`, halt current workflow step, report tool name + error to orchestrator, await instruction |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create maintenance, complexity, or safety problems for this milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Silent CLAUDE.md amendment | "Just add Synapse instructions automatically during install" | Modifying a user's project files without consent destroys trust; CLAUDE.md might have conflicting instructions; discovery is impossible when things break silently | Opt-in append: `/synapse:init` proposes the exact text to add and asks for approval; user sees what will be added before it happens |
| Global `.claude/` installation (default) | "Install once, use everywhere" | Project-scope keeps config explicit and version-controllable; global install creates invisible dependencies that break when users switch projects; project teams can't share global config | Default to project-scope (`/.claude/` and `/.mcp.json`); offer global option explicitly with warning |
| Automatic dependency installation (Ollama, bun) | "The install script should set up everything" | Installing system-level tools (Ollama, Bun) without explicit user consent is a bad practice; different users have different package managers; version conflicts are hard to debug | Prerequisites check with clear installation instructions per platform; script tells users exactly what to install and how, then validates |
| Agent self-selection of project_id | "Let each agent figure out the project_id from context" | Inconsistency risk: different agents in the same session might resolve to different projects; fragile when multiple projects are indexed | Single source of truth: project_id in `synapse.toml`, injected by startup hook, referenced from session context by all agents |
| E2E test suite for the entire PEV workflow | "Add automated tests for the full workflow" | The PEV workflow involves Claude Code spawning subagents, which cannot be meaningfully automated in unit tests; attempts create brittle mocks that test nothing real | Manual E2E validation on a real project (gap analysis item #6); document what was validated and what broke; automated testing of individual hooks and tool integrations only |
| Runtime skill discovery (agents pick their own skills) | "Let agents choose which skills apply" | Dynamic skill selection is Claude Code's approach for personal skills; Synapse needs deterministic, auditable skill injection for reproducibility | Project-declared skills in `synapse.toml`; startup hook reads and injects; no agent-side discovery |
| Web dashboard for workflow progress | "I want a live view of what agents are doing" | Explicitly out of scope per PROJECT.md; adds a second product surface; requires a running web server | Claude Code statusline hook for task/wave progress; `/synapse:status` command for detailed view; activity log queryable via MCP tools |

---

## Feature Dependencies

```
[Install Script]
    └──creates──> [.mcp.json at project root]
    └──creates──> [.claude/agents/ from packages/framework/agents/]
    └──creates──> [.claude/hooks/ from packages/framework/hooks/]
    └──creates──> [.claude/settings.json from settings.template.json]
    └──creates──> [synapse.toml with project_id + skills]
    └──checks──> [Prerequisites: Bun, Ollama, nomic-embed-text]

[/synapse:init command]
    └──requires──> [Install Script] (framework wired before init runs)
    └──calls──> [init_project MCP tool]
    └──proposes──> [CLAUDE.md amendment] (opt-in)
    └──configures──> [synapse.toml skills field]

[/synapse:map command]
    └──requires──> [MCP server wired] (.mcp.json present and working)
    └──calls──> [index_codebase MCP tool]
    └──requires──> [Ollama running] (embedding requires it)

[/synapse:plan command]
    └──requires──> [/synapse:init] (project must be initialized)
    └──requires──> [/synapse:map] (code context helps decomposition)
    └──triggers──> [PEV workflow via synapse-orchestrator agent]
    └──requires──> [Agents wired into .claude/agents/]

[Dynamic Skill Injection]
    └──requires──> [synapse.toml with skills field]
    └──requires──> [synapse-startup.js updated] (reads toml, injects skills)
    └──enhances──> [All 10 agent prompts] (agents no longer need hardcoded skills)

[project_id Injection]
    └──requires──> [synapse.toml with project_id field]
    └──requires──> [synapse-startup.js updated] (injects project_id into context)
    └──required by──> [Every MCP tool call by any agent]

[Agent MCP Usage Instructions]
    └──requires──> [Agent prompts updated] (add "MCP First" principle)
    └──enhances──> [E2E PEV Workflow Validation]
    └──requires──> [tool knowledge documented] (parameter shapes, accepted values)

[Context Reference Delivery]
    └──requires──> [Decomposer prompt updated] (must populate context_refs)
    └──requires──> [Executor/Validator prompts updated] (must fetch refs at start)
    └──requires──> [MCP task schema extended] (context_refs field on tasks)

[Domain Mode Injection]
    └──requires──> [synapse-startup.js updated] (reads trust.toml domains)
    └──requires──> [All agent prompts updated] (reference injected mode)
    └──requires──> [trust.toml domain modes defined]

[Progress Visibility / Statusline]
    └──requires──> [settings.json statusLine config]
    └──requires──> [statusline hook script]
    └──requires──> [Active epic in task tree] (something to display)

[E2E PEV Workflow Validation]
    └──requires──> [All of the above] (install, init, map, plan, agents wired)
    └──requires──> [Agents have MCP usage instructions]
    └──requires──> [project_id injected seamlessly]
    └──produces──> [Documented validation results + gap list]
```

### Dependency Notes

- **Install script is the critical path gating.** Nothing works until the MCP server, hooks, and agents are wired into Claude Code. All command and agent features depend on this foundation. It must be the first thing built.
- **project_id injection unlocks agent usability.** Currently every agent would need to ask the user for `project_id` since no prompt mentions where it comes from. This must be solved before any E2E validation can succeed.
- **Dynamic skill injection is a prerequisite for language-agnostic agents.** Currently 7 of 11 agents have TypeScript hardcoded in `agents.toml`. This must be removed before the framework is usable on Python or Rust projects.
- **CLAUDE.md amendment is opt-in but high leverage.** Without it, users get a generic Claude Code session. With it, the orchestrator agent is visible and the PEV workflow is referenced. The amendment proposal is part of `/synapse:init`, not a standalone feature.
- **Context reference delivery is Synapse's core differentiator.** The whole premise of the platform is "agents get the right context." If the decomposer doesn't attach document/decision references to tasks, executors are reduced to `get_smart_context` and hoping. This is high priority despite high complexity.

---

## MVP Definition

### Launch With (v3.0)

Minimum viable working prototype — what's needed to run PEV end-to-end on a real project.

- [ ] **Install script** — prerequisite check + `.mcp.json` + `.claude/agents/` + `.claude/hooks/` + `settings.json`; single command to wire everything
- [ ] **`/synapse:init` command** — project setup: `synapse.toml` creation, `init_project` call, opt-in CLAUDE.md amendment, initial skill selection
- [ ] **`/synapse:map` command** — `index_codebase` wrapper with progress feedback and Ollama status check
- [ ] **`/synapse:plan` command** — connects user goal to PEV workflow via orchestrator agent
- [ ] **project_id injection** — `synapse.toml` stores it, startup hook reads and injects it; agents reference from context
- [ ] **Dynamic skill injection** — `synapse.toml` `skills` field, startup hook injects matched skills; remove hardcoded TypeScript from `agents.toml`
- [ ] **Agent MCP usage instructions** — each agent gets: tool call examples, parameter shapes, tool constraints, content structure templates, "MCP First" principle, error handling guidance
- [ ] **Domain mode injection** — startup hook reads trust.toml, injects active domain modes; all agent prompts updated to reference their mode
- [ ] **Context reference delivery** — decomposer populates `context_refs` on leaf tasks; executor/validator prompts start with fetching those refs
- [ ] **Findings persistence** — Integration Checker, Plan Reviewer, Validator, Executor all store their outputs as queryable documents
- [ ] **E2E PEV workflow validation** — manual run on a real project; document what breaks; patch the top-3 issues found

### Add After Validation (v3.x)

Features to add once the first real E2E cycle has run and been validated.

- [ ] **Progress statusline hook** — task tree progress in Claude Code statusline; trigger: E2E validation confirms task tree updates correctly
- [ ] **Flesh out thin skills** — tailwind, python, sql SKILL.md files are stubs; source from community standards (Airbnb style guide, official docs); trigger: first non-TypeScript project attempted
- [ ] **Additional generic skills** — brainstorming, testing strategy, architecture design; trigger: user feedback identifying gaps
- [ ] **Tech debt resolution** — escapeSQL dedup, created_at fix, INT-02 AST edges, lint warnings; trigger: before public release
- [ ] **Autonomy mode ordering consistency** — Co-Pilot/Advisor/Autopilot order standardized across all config and agent files; trigger: documentation pass

### Future Consideration (v4+)

Features to defer until v3.0 is validated in production use.

- [ ] **GSD / BMad project import** — import existing project structures; requires format parsing; defer until users request migration
- [ ] **MCP resources and prompt templates** — Claude Code supports MCP `prompts` as slash commands; useful but not blocking v3.0
- [ ] **Additional code languages (beyond TS/Python/Rust)** — AST parsing expansion; defer per PROJECT.md constraints
- [ ] **Automated preference learning** — explicit config is more predictable; ML preference learning deferred per PROJECT.md decision
- [ ] **Real-time collaboration** — single-user orchestrator; multi-user is a separate product surface

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Install script (MCP + hooks + agents wired) | HIGH | MEDIUM | P1 |
| `/synapse:init` command | HIGH | MEDIUM | P1 |
| `/synapse:map` command | MEDIUM | LOW | P1 |
| `/synapse:plan` command | HIGH | MEDIUM | P1 |
| project_id seamless injection | HIGH | LOW | P1 |
| Dynamic skill injection via synapse.toml | HIGH | MEDIUM | P1 |
| Agent MCP usage instructions ("MCP First") | HIGH | MEDIUM | P1 |
| Domain mode injection into agents | HIGH | LOW | P1 |
| MCP error handling guidance in agent prompts | HIGH | LOW | P1 |
| Context reference delivery (decomposer → executor) | HIGH | HIGH | P1 |
| CLAUDE.md amendment (opt-in, in `/synapse:init`) | HIGH | LOW | P1 |
| Findings persistence (agents store outputs as docs) | MEDIUM | MEDIUM | P1 |
| E2E PEV workflow validation (manual, real project) | HIGH | MEDIUM | P1 |
| Usage manual / documentation | HIGH | MEDIUM | P1 |
| Progress statusline hook | MEDIUM | HIGH | P2 |
| Skill content completion (stub skills fleshed out) | MEDIUM | MEDIUM | P2 |
| Additional generic skills | LOW | MEDIUM | P2 |
| Tech debt resolution | MEDIUM | LOW | P2 |
| Autonomy mode ordering consistency | LOW | LOW | P2 |

**Priority key:**
- P1: Must have for v3.0 working prototype
- P2: Should have once core is working
- P3: Nice to have, future consideration

---

## Domain-Specific Analysis

### 1. Install and Setup Experience

**Ecosystem patterns (MEDIUM confidence, WebSearch verified):**

The strongest pattern in Claude Code tool distribution is the `npx` one-command installer. GSD uses `npx get-shit-done-cc@latest`; GitHub MCP uses `claude mcp add --transport http github https://api.githubcopilot.com/mcp/`. The key UX requirement: the user should be in a working state within 5 minutes of encountering the tool.

For Synapse specifically, the install script must:
1. Check prerequisites (Bun ≥ 1.0, Ollama running, `nomic-embed-text` model available)
2. Create project-scoped `.mcp.json` pointing to the Synapse server
3. Create `.claude/agents/` with the 10 agent files
4. Create `.claude/hooks/` with the 5 hook scripts (excluding `audit-log.js` which is PostToolUse — verify all still relevant)
5. Write `settings.json` from `settings.template.json` with correct paths
6. Create `synapse.toml` skeleton for user to fill in

**Why project-scope over user-scope (HIGH confidence — official Claude Code docs):**
Claude Code's `.mcp.json` at the project root is the recommended approach for team tools. It is checked into version control, making Synapse setup reproducible for any team member. User-scope (`~/.claude.json`) is appropriate for personal tools used across all projects — Synapse is project-specific by design (different DB per project).

**First-run experience pattern (MEDIUM confidence):**
The best developer tools distinguish "install" from "initialize." Install = system-level wiring (happens once). Initialize = project-level setup (happens per project). Synapse should follow this pattern: install script does system wiring, `/synapse:init` does project initialization.

### 2. Claude Code Integration

**What needs to be in `.mcp.json` (HIGH confidence — official Claude Code docs):**

```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "${SYNAPSE_PACKAGE_PATH}/src/index.ts", "--db", "${SYNAPSE_DB_PATH}"],
      "env": {
        "OLLAMA_URL": "${OLLAMA_URL:-http://localhost:11434}",
        "EMBED_MODEL": "nomic-embed-text"
      }
    }
  }
}
```

Claude Code supports `${VAR}` and `${VAR:-default}` environment variable expansion in `.mcp.json`. The install script should write this with actual paths substituted, not environment variable placeholders (paths are machine-specific).

**What needs to be in `settings.json` (HIGH confidence — verified from existing `settings.template.json`):**
The template already has the correct hook configuration. The install script must ensure:
- Hooks reference correct paths (relative to project root or absolute)
- SessionStart hook fires `synapse-startup.js`
- PreToolUse hooks cover `mcp__synapse__store_decision` (tier-gate + precedent-gate) and `mcp__synapse__.*` (tool-allowlist)
- PostToolUse hook fires `audit-log.js`

**CLAUDE.md amendment pattern (MEDIUM confidence — community practice):**
The recommended pattern (from multiple Claude Code community sources) is to treat project `CLAUDE.md` as "AI onboarding + operating manual." The Synapse amendment should add:
- Availability of the `synapse-orchestrator` agent and when to use it
- Reference to `@packages/framework/workflows/pev-workflow.md`
- The "MCP First" principle for Synapse tools
- How to find `project_id` (from session context, injected by startup hook)

The amendment must be opt-in and show the user exact proposed text before writing.

### 3. User-Facing Commands

**Gap in existing commands:**

Existing: `/synapse:new-goal` (creates epic), `/synapse:status` (shows work streams)
Missing: `/synapse:init` (project setup), `/synapse:map` (codebase indexing), `/synapse:plan` (trigger PEV)

**Command design pattern (HIGH confidence — Claude Code official docs):**
Claude Code commands are markdown files in `.claude/commands/<namespace>/<name>.md` with YAML frontmatter (`name`, `description`, `allowed-tools`). Commands use `$ARGUMENTS` for passed arguments. Arguments are appended automatically if not in the content.

The three missing commands are distinct in intent:
- `/synapse:init` — setup/configuration workflow; user-invocable only; runs once per project
- `/synapse:map` — explicit action with side effects; user-invocable only; can be re-run
- `/synapse:plan` — triggers PEV workflow; user-invocable; primary ongoing use command

All three should have `disable-model-invocation: true` in Claude Code skills format (or equivalent) to prevent automatic invocation. They are explicit user-triggered actions.

### 4. Agent MCP Usage Instructions

**What agents currently lack (HIGH confidence — gap analysis):**

Every agent prompt is missing:
1. Concrete tool call examples (what parameters, in what order)
2. Tool knowledge depth (accepted values for `category`, `status`, `depth` fields)
3. Response shape documentation (what does `check_precedent` return? how to interpret it?)
4. "MCP First" principle — explicit rule to query Synapse before filesystem exploration
5. Error handling protocol — what to do when a Synapse tool call fails
6. Task update rules — what fields can be overwritten vs appended; `description` should never be overwritten by validator

**Single source of truth principle (novel to Synapse):**
No comparable open-source Claude Code framework enforces "query your knowledge base before reading files." This is a deliberate design choice for Synapse: agents must internalize that:
1. Synapse MCP is the primary means of tracking project progress
2. All agents rely on it to investigate previous work
3. Results MUST be persisted in the DB after agent work
4. DB references (document_ids, decision_ids, task_ids) should be passed to follow-up agents for targeted retrieval

This principle should appear as a named section ("## Synapse MCP as Single Source of Truth") in every agent prompt.

**Mode-aware behavior (HIGH confidence from gap analysis, novel implementation):**
The current `product-strategist.md` and `architect.md` describe co-pilot/autopilot/advisor behavior inline. But no startup hook delivers the active mode to agents. The fix is:
1. Startup hook reads `[domains]` section from `trust.toml`
2. Injects the active mode for each domain as named context: "Domain mode for ui: co-pilot"
3. Agent prompts reference "your configured domain mode" rather than embedding mode-specific logic in the prompt

### 5. Skill System Completion

**Dynamic injection architecture (HIGH confidence — Claude Code subagents docs):**

Official Claude Code documentation confirms: subagent `skills` field injects full skill content at startup. The correct Synapse approach:
1. `synapse.toml` declares project stack: `[project] skills = ["typescript", "bun", "vitest"]`
2. Startup hook maps declared skills to SKILL.md files in `packages/framework/skills/`
3. Startup hook reads the matching SKILL.md files and injects their content into `additionalContext`
4. `agents.toml` per-agent skill overrides remain for exceptional cases

This removes hardcoded `skills = ["typescript", "bun"]` from individual agent configs, making the framework language-agnostic.

**Thin skills that must be fleshed out:**
- `tailwind/SKILL.md` — stub; needs Tailwind v4 conventions, component patterns, utility first principles
- `python/SKILL.md` — stub; needs Python 3.12+ conventions, type annotation patterns, pytest patterns
- `sql/SKILL.md` — stub; needs SQL query patterns, index-aware query design, LanceDB-specific SQL dialect

Source from established community standards (official framework docs, community style guides) rather than writing conventions from scratch.

**Missing generic skills to add:**
- `brainstorming` — ideation protocols, how to generate and evaluate options systematically
- `testing-strategy` — testing pyramid, coverage criteria, test naming conventions (language-agnostic)
- `architecture-design` — component boundary principles, separation of concerns, ADR format

### 6. E2E Workflow Validation

**What must be true before validation is attempted:**
- MCP server starts and responds to all 24 tool calls
- At least one agent can be spawned via Claude Code's Task tool
- Startup hook injects project_id into session context
- At least one skill is loaded and visible to the agent

**Validation sequence (derived from gap analysis + PEV workflow):**
1. Run `/synapse:init` on a test project; verify DB initializes, project_id stored
2. Run `/synapse:map`; verify code chunks appear in LanceDB
3. Run `/synapse:plan "add a TypeScript utility function"`; verify epic created
4. Observe decomposer spawn (via Claude Code Task tool); verify feature/task tree created
5. Observe executor spawn; verify task marked in_progress, then done
6. Observe validator spawn; verify validation finding stored
7. Check `/synapse:status` output matches task tree state

**What is likely to break (from gap analysis + architecture knowledge):**
- Hooks firing before MCP server is ready (race condition in startup hook)
- project_id not available when first tool call fires (timing)
- Decomposer creating tasks without context_refs (needs prompt update first)
- Validator overwriting task description (needs prompt rules first)
- Ollama timing out on first large indexing run (error handling)

### 7. Progress Visibility

**Ecosystem patterns (MEDIUM confidence):**
GSD implements a statusline hook that shows current phase and token usage. Claude Code's `settings.json` supports a `statusLine.command` that runs a script and outputs a status string. This is the correct implementation surface for Synapse task/wave progress.

**What to display:**
- Active epic title (truncated to ~30 chars)
- Current wave: `Wave N/M`
- Task completion: `X/Y tasks`
- Blocked indicator if any tasks are blocked

**Why this is P2, not P1:**
The statusline requires a working task tree with live updates. It is only useful after E2E validation confirms the task tree is being updated correctly. Building it before that creates a display for an unreliable data source.

---

## Competitor / Comparable Feature Analysis

| Feature | GSD Framework | Claude Code built-in | Synapse v3.0 Plan |
|---------|---------------|----------------------|-------------------|
| Install experience | `npx get-shit-done-cc@latest`, interactive prompt | `claude mcp add ...` CLI | Bun install script; equivalent one-command setup |
| Project initialization | `/gsd:new-project` guided flow | `/init` (writes CLAUDE.md) | `/synapse:init`: synapse.toml + init_project + CLAUDE.md amendment |
| Codebase mapping | `/gsd:map-codebase` | N/A (no built-in code indexing) | `/synapse:map`: triggers index_codebase with progress feedback |
| Goal/task entry | `/gsd:new-project` / `/gsd:execute-phase` | Native conversation | `/synapse:plan`: PEV workflow trigger |
| Status visibility | `/gsd:progress` + statusline hook | Subagent transcript files | `/synapse:status` (exists) + statusline hook (P2) |
| Agent specialization | 6 specialized research agents | Built-in Explore/Plan/general-purpose | 10 specialized agents with tool allowlists + skill injection |
| Knowledge persistence | Planning files in `.planning/` | CLAUDE.md memory | Synapse MCP DB (semantic search, 24 tools) |
| Workflow enforcement | Phase-gated execution | None (user-driven) | Hooks: tier enforcement, precedent checking, audit trail |
| Skill system | Prompt files in `.claude/` | Skills via `.claude/skills/` | Synapse skills: project-declared in synapse.toml, auto-injected |

**Key differentiation from GSD:** GSD stores project knowledge in markdown files that Claude reads. Synapse stores everything in a vector-searchable DB that agents query semantically. This enables cross-session recall and strategic context delivery — GSD files grow unbounded and become context-window burdens; Synapse chunks and retrieves precisely what's needed.

---

## Sources

- Claude Code MCP documentation (official, HIGH confidence): https://code.claude.com/docs/en/mcp — MCP installation scopes, `.mcp.json` format, env var expansion
- Claude Code skills documentation (official, HIGH confidence): https://code.claude.com/docs/en/skills — SKILL.md format, frontmatter fields, dynamic injection, subagent preloading
- Claude Code subagents documentation (official, HIGH confidence): https://code.claude.com/docs/en/sub-agents — `skills` field for subagent preloading, frontmatter reference, scope hierarchy
- GSD framework GitHub (MEDIUM confidence, community source): https://github.com/gsd-build/get-shit-done — command patterns, install experience, statusline hook
- GitHub MCP server install guide (MEDIUM confidence): https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md — one-command install pattern
- PROTO_GAP_ANALYSIS.md (HIGH confidence, primary source): project-specific gap analysis defining v3.0 scope
- `packages/framework/settings.template.json` (HIGH confidence, first-party): existing hook configuration template
- Claude Code community UX patterns: https://www.humanlayer.dev/blog/writing-a-good-claude-md — CLAUDE.md as onboarding manual pattern

---

*Feature research for: Synapse v3.0 Working Prototype*
*Researched: 2026-03-03*
