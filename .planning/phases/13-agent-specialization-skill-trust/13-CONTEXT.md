# Phase 13: Agent Specialization, Skill Loading, and Trust - Context

**Gathered:** 2026-03-02
**Status:** Ready for research

<domain>
## Phase Boundary

Define all 10 specialized agent markdown files with system prompts and tool allowlists, build the skill registry that injects domain knowledge at spawn time, and configure the Trust-Knowledge Matrix that controls per-domain autonomy levels. This phase produces agent definitions, skills, and trust configuration — no hook enforcement (Phase 14).

**What this phase delivers:**
- 10 agent markdown files in agents/ (Product Strategist, Researcher, Architect, Decomposer, Plan Reviewer, Executor, Validator, Integration Checker, Debugger, Codebase Analyst)
- Skill loader that reads markdown skills from skills/ and injects into agent context
- Full skill library for common tech stacks (TypeScript, React, Python, testing, SQL, etc.)
- Trust-Knowledge Matrix TOML config with per-domain autonomy and per-agent tier authority
- Example agents.toml files for different project stacks

**What this phase does NOT deliver:**
- Hook-based enforcement of tool allowlists (Phase 14: GATE-01, GATE-02)
- PEV workflow execution (Phase 14: WFLOW-*)
- PreToolUse/PostToolUse enforcement hooks (Phase 14)

</domain>

<decisions>
## Implementation Decisions

### Agent Prompt Design

**Tiered prompt depth by model complexity:**
- Opus agents (Product Strategist, Architect, Decomposer, Plan Reviewer) get verbose prompts with explicit step-by-step protocols, decision trees, and detailed behavioral guidance
- Sonnet agents (Researcher, Executor, Validator, Integration Checker, Debugger, Codebase Analyst) get concise prompts: role definition, key behaviors, constraints, allowed tools

**Light behavioral cues:**
- Each agent gets a few lines of behavioral guidance that shape output quality (e.g., Reviewer: "challenge assumptions", Researcher: "cite sources", Architect: "check precedent before deciding")
- Not personality — functional behavioral nudges

**1-2 key examples per agent:**
- Each agent includes 1-2 critical interaction examples demonstrating its most important behaviors
- Worth the token cost for behavioral consistency across sessions

**Per-agent attribution in prompts:**
- Each agent's markdown includes: "EVERY Synapse MCP tool call must include `actor: "{agent-name}"`"
- Simple, explicit, no extra infrastructure — same pattern as synapse-orchestrator.md

**Frontmatter for display, TOML for config:**
- Agent markdown frontmatter has: name, description, model hint (for display/documentation)
- agents.toml is the source of truth for: model, tier, skills, allowed_tools
- No duplication of machine-readable config in markdown

**Explicit tool usage patterns for critical flows:**
- Document the 2-3 most important tool sequences per agent (e.g., Architect: check_precedent → store_decision → create_task)
- Non-critical tool usage left to agent judgment

**General escalation rule:**
- One shared rule across all agents: "When uncertain, escalate to orchestrator"
- No per-agent failure mode enumeration

### Communication Model

**Synapse MCP as primary communication channel:**
- Agents communicate primarily through the Synapse data layer: storing documents, updating tasks, linking references
- Example: Researcher expands a task's scoping document and creates references to relevant docs. Executor reads that as context.
- The data layer IS the communication medium — reduces coordination overhead

**Hub-and-spoke messaging through orchestrator:**
- Direct agent-to-agent coordination (when needed beyond Synapse data) goes through the orchestrator
- Agents report to orchestrator, not to each other directly
- Simple, auditable, prevents agent-to-agent confusion

### Skill Registry

**One skill per technology:**
- Fine-grained skills: react.md, tailwind.md, vitest.md, postgresql.md, etc.
- Agents get exactly what they need, easier to stay within token budget
- More files but more reusable across different agent configurations

**Explicit assignment in agents.toml:**
- Skills are explicitly listed per agent in agents.toml (e.g., `skills = ["typescript", "react", "vitest"]`)
- No dynamic project-attribute-driven loading — keep it simple and predictable
- Ship example agents.toml files for different stacks (React/Bun, Python/FastAPI, etc.)

**Structured skill sections:**
- Each skill markdown follows a consistent template:
  - **Conventions** — naming patterns, file structure, idioms
  - **Quality Criteria** — what "good" looks like for this technology
  - **Vocabulary** — domain terms the agent should use correctly
  - **Anti-patterns** — what to avoid

**Warning on budget exceed, but load full skill:**
- Skill loader validates token count on load
- If a skill exceeds 2K tokens, log a warning but load the complete skill
- The 2K limit is a guideline, not a hard cutoff

**SKILL-06 hash validation deprioritized:**
- Tamper detection via content hashing is low-priority given the framework is user-controlled and git-tracked
- Lightweight alternative: warn on unexpected skill files not referenced in agents.toml
- Git history serves as tamper detection for controlled environments

**Full skill library for common stacks:**
- Ship skills for: TypeScript, React, Python, testing (vitest), SQL, Bun, Tailwind, and other common technologies
- Built-in skills live in skills/ root directory
- Project-specific skills in skills/project/ subdirectory

**Skill directory structure:**
- `skills/` — built-in skills shipped with the framework (typescript.md, react.md, etc.)
- `skills/project/` — user-defined project-specific skills

### Trust-Knowledge Matrix

**Three autonomy levels (ordered by user involvement):**
1. **co-pilot** (most user involvement) — agent collaborates with user, starts with open questions ("For the backend architecture, did you have any plans in mind?"), works toward shared decisions together. Focus on gathering user insights, not presenting proposals.
2. **advisory** (moderate) — agent stores draft proposals, user reviews and approves/rejects asynchronously. Acts as a guardrail against project derailment.
3. **autopilot** (least) — agent decides autonomously, user is out of the loop.

**Trust progression:** New projects start co-pilot for critical domains. As confidence builds, users shift domains to advisory or autopilot.

**Domain-level autonomy with per-agent overrides:**
- trust.toml sets autonomy per domain (architecture, testing, implementation, etc.)
- Per-agent overrides available for granular control (e.g., "Executor in architecture domain = advisory even though architecture defaults to co-pilot")

**Strict tier hierarchy for decision authority:**
- Product Strategist: Tier 0-1 (product strategy + architecture)
- Architect: Tier 1-2 (architecture + functional design)
- Decomposer: Tier 2 (functional design)
- Executor: Tier 3 only (execution decisions)
- Validator/Plan Reviewer: read-only (cannot store decisions)
- Researcher: no store_decision access (contributes deliberation via documents)

**Tier 0 always requires user approval:**
- Regardless of trust config, Tier 0 (Product Strategy) decisions always surface to user
- This is a hard constraint, not configurable

**Decomposition approval stays separate:**
- Decomposition approval is its own setting in trust.toml (not folded into domain autonomy)
- Three modes: "always" (approve every level), "strategic" (approve epics, auto-decompose below), "none" (fully autonomous)

### Agent Tool Boundaries

**Individual tools per agent in agents.toml:**
- Each agent lists every allowed tool explicitly — no tool group indirection
- Verbose but unambiguous — you see exactly what each agent can do
- agents.toml is the source of truth for hook enforcement in Phase 14

**Researcher: write knowledge, not decisions or tasks:**
- CAN: store_document, update_document, link_documents, query_documents, semantic_search, search_code, get_smart_context, check_precedent
- CANNOT: store_decision, create_task, update_task
- Deliberation pattern: Researcher stores analysis documents and links them to tasks/decisions. Decision-making agents consume research as input.

**Executor: Synapse tool constraints, not filesystem:**
- Executor is constrained to Tier 3 decisions and specific Synapse tools
- Full filesystem access within the project (Read, Write, Edit, Bash, Glob, Grep)
- Restricting filesystem paths is too rigid for real coding work

**Validators and Plan Reviewer can update tasks:**
- Validator and Integration Checker can update_task (mark as failed/needs_rework)
- Plan Reviewer can update_task to 'blocked' with reason — direct authority to gate execution
- Faster feedback loop than routing everything through orchestrator

**Debugger: diagnostic only:**
- Can read files, run tests, search code, store findings (store_document)
- Cannot edit source files — reports root cause and suggested fix
- Separation of diagnosis from repair (Executor applies fixes)

**Codebase Analyst: Synapse knowledge only:**
- Can index_codebase and store_document (analysis findings)
- Cannot modify source files
- Its job is to analyze and document, not change code

</decisions>

<specifics>
## Specific Ideas

- "The data layer IS the communication medium" — agents share knowledge through Synapse documents and task updates, not through direct messaging. Messages are for coordination only.
- Co-pilot mode should feel collaborative, not transactional. Agent asks "what did you have in mind?" before proposing. Anti-pattern: agent presents a fully-formed proposal and asks for approval.
- Example agents.toml files for different stacks serve as documentation-by-example. Users copy the closest match and customize.
- Agent markdown files ARE the system prompts — Claude Code reads them natively at spawn time. No template rendering or variable substitution needed.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 12)
- `synapse-framework/agents/synapse-orchestrator.md` — Reference agent definition with frontmatter, system prompt, tool patterns, attribution requirement
- `synapse-framework/config/agents.toml` — Already registers all 10 agents with model assignments and empty `skills = []`
- `synapse-framework/config/trust.toml` — Has domain autonomy levels and decomposition approval; needs per-agent override support and tier authority matrix
- `synapse-framework/config/synapse.toml` — MCP server connection config (complete)
- `synapse-framework/src/config.ts` — Zod-validated TOML loaders for all config files; needs extension for new schema fields
- `synapse-framework/hooks/synapse-startup.js` — SessionStart hook (complete)
- `synapse-framework/hooks/synapse-audit.js` — PostToolUse audit hook (complete)
- `synapse-framework/skills/` — Empty directory, ready for skill files
- `synapse-framework/test/` — 4-tier test harness (unit, integration, behavioral, scorecards)

### Synapse MCP Tools (from project_mcp)
- `store_decision` — Has `status` field (active/superseded/revoked), `actor` field, `tier` field (0-3). No "draft" status — advisory mode uses this with active status, orchestrator gates approval.
- `check_precedent` — Semantic similarity search on decisions (0.85 threshold)
- `create_task` / `update_task` / `get_task_tree` — Task hierarchy with cascade status propagation
- `store_document` / `query_documents` / `link_documents` — Knowledge storage and linking
- `semantic_search` / `search_code` / `get_smart_context` — Search and context assembly
- `index_codebase` / `get_index_status` — Code indexing and status

### Integration Points
- Claude Code `.claude/agents/` — where agent markdown files are loaded from
- Claude Code settings.json — MCP server connection, hook definitions
- agents.toml `allowed_tools` — source of truth for Phase 14 hook enforcement
- trust.toml — consumed by hooks (Phase 14) and by agents (Phase 13) for self-governance

</code_context>

<deferred>
## Deferred Ideas

- "Draft" status for store_decision — would allow Researcher to propose decisions as drafts. Current pattern (deliberation via documents) works without schema changes. Revisit if the workflow feels heavy.
- Agent-to-agent direct messaging — currently hub-and-spoke through orchestrator. May enable selective peer DMs in a future phase if orchestrator becomes a bottleneck.
- Dynamic skill loading from project attributes — skills are statically assigned in agents.toml. Could add project-attribute-driven auto-assignment later.

</deferred>

---

*Phase: 13-agent-specialization-skill-trust*
*Context gathered: 2026-03-02*
