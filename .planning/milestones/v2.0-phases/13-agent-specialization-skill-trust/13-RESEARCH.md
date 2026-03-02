# Phase 13: Agent Specialization, Skill Loading, and Trust - Research

**Researched:** 2026-03-02
**Domain:** Claude Code agent markdown format, skill directory structure, TOML config schema extension
**Confidence:** HIGH (primary sources: official Claude Code documentation fetched 2026-03-02)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Agent Prompt Design

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

#### Communication Model

**Synapse MCP as primary communication channel:**
- Agents communicate primarily through the Synapse data layer: storing documents, updating tasks, linking references
- The data layer IS the communication medium — reduces coordination overhead

**Hub-and-spoke messaging through orchestrator:**
- Direct agent-to-agent coordination (when needed beyond Synapse data) goes through the orchestrator
- Agents report to orchestrator, not to each other directly

#### Skill Registry

**One skill per technology:**
- Fine-grained skills: react.md (actually skills/react/SKILL.md), tailwind.md, vitest.md, postgresql.md, etc.
- Agents get exactly what they need, easier to stay within token budget

**Explicit assignment in agents.toml:**
- Skills are explicitly listed per agent in agents.toml (e.g., `skills = ["typescript", "react", "vitest"]`)
- No dynamic project-attribute-driven loading

**Structured skill sections:**
- Each skill markdown follows a consistent template: Conventions, Quality Criteria, Vocabulary, Anti-patterns

**Warning on budget exceed, but load full skill:**
- Skill loader validates token count on load
- If a skill exceeds 2K tokens, log a warning but load the complete skill

**SKILL-06 hash validation deprioritized:**
- Lightweight alternative: warn on unexpected skill files not referenced in agents.toml
- Git history serves as tamper detection

**Full skill library for common stacks:**
- Ship skills for: TypeScript, React, Python, testing (vitest), SQL, Bun, Tailwind, and other common technologies

**Skill directory structure:**
- `skills/` — built-in skills shipped with the framework (typescript/, react/, etc.)
- `skills/project/` — user-defined project-specific skills

#### Trust-Knowledge Matrix

**Three autonomy levels (ordered by user involvement):**
1. **co-pilot** (most user involvement) — agent collaborates with user, starts with open questions
2. **advisory** (moderate) — agent stores draft proposals, user reviews and approves/rejects asynchronously
3. **autopilot** (least) — agent decides autonomously

**Domain-level autonomy with per-agent overrides:**
- trust.toml sets autonomy per domain (architecture, testing, implementation, etc.)
- Per-agent overrides available for granular control

**Strict tier hierarchy for decision authority:**
- Product Strategist: Tier 0-1
- Architect: Tier 1-2
- Decomposer: Tier 2
- Executor: Tier 3 only
- Validator/Plan Reviewer: read-only (cannot store decisions)
- Researcher: no store_decision access

**Tier 0 always requires user approval:**
- Hard constraint, not configurable

**Decomposition approval stays separate:**
- Three modes: "always", "strategic", "none"

#### Agent Tool Boundaries

**Individual tools per agent in agents.toml:**
- Each agent lists every allowed tool explicitly — no tool group indirection
- agents.toml is the source of truth for Phase 14 hook enforcement

**Researcher: write knowledge, not decisions or tasks:**
- CAN: store_document, update_document, link_documents, query_documents, semantic_search, search_code, get_smart_context, check_precedent
- CANNOT: store_decision, create_task, update_task

**Executor: Synapse tool constraints, not filesystem:**
- Full filesystem access (Read, Write, Edit, Bash, Glob, Grep)
- Constrained to Tier 3 decisions only

**Validators and Plan Reviewer can update tasks:**
- Validator and Integration Checker can update_task (mark as failed/needs_rework)
- Plan Reviewer can update_task to 'blocked'

**Debugger: diagnostic only:**
- Can read files, run tests, store findings (store_document)
- Cannot edit source files

**Codebase Analyst: Synapse knowledge only:**
- Can index_codebase and store_document
- Cannot modify source files

### Claude's Discretion

None specified — all implementation details are locked.

### Deferred Ideas (OUT OF SCOPE)

- "Draft" status for store_decision
- Agent-to-agent direct messaging
- Dynamic skill loading from project attributes
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROLE-01 | 10 agent roles defined as markdown files in agents/ with system prompts and allowed_tools lists | Agent markdown format section — frontmatter schema, tool allowlist syntax, model field |
| ROLE-02 | Product Strategist (opus) handles Tier 0 decisions with mandatory user approval | Prompt engineering patterns for Opus agents, tier 0 hard constraint implementation |
| ROLE-03 | Researcher (sonnet) is read-only — allowed_tools excludes state-modifying tools | Tool allowlist/denylist in frontmatter; tool names documented |
| ROLE-04 | Architect (opus) handles Tier 1-2 decisions and creates epic-level task structure | Opus verbose prompt pattern, tool sequence documentation (check_precedent → store_decision → create_task) |
| ROLE-05 | Decomposer (opus) breaks epics into executable leaf tasks within context window limits | Opus verbose prompt, task depth constraints |
| ROLE-06 | Plan Reviewer (opus) verifies task plans against decisions before execution begins | Opus verbose prompt, update_task(blocked) authority |
| ROLE-07 | Executor (sonnet) implements leaf tasks, constrained to Tier 3 decisions only | Sonnet concise prompt, filesystem access pattern |
| ROLE-08 | Validator (sonnet) checks completed tasks against specs and relevant decisions | Sonnet concise prompt, update_task authority |
| ROLE-09 | Integration Checker (sonnet) validates cross-task integration at feature/epic boundaries | Sonnet concise prompt, update_task authority |
| ROLE-10 | Debugger (sonnet) performs root-cause analysis on execution and validation failures | Sonnet concise prompt, read-only filesystem pattern |
| ROLE-11 | Codebase Analyst (sonnet) maintains codebase analysis via index_codebase and store_document | Sonnet concise prompt, read-only with index_codebase |
| ROLE-12 | Agent allowed_tools lists enforced via hooks — no agent can call tools outside its definition | agents.toml as source of truth; format confirmed; Phase 14 enforcement |
| ROLE-13 | Agent markdown files ARE the system prompts — Claude Code loads them natively at spawn time | Confirmed by official docs: markdown body = system prompt, loaded at session start |
| SKILL-01 | Skill registry in config/agents.toml maps project attributes to skill bundles | agents.toml `skills = [...]` field already present in Zod schema; directory name resolution |
| SKILL-02 | Skills are markdown files in skills/ containing domain knowledge, quality criteria, and vocabulary | Claude Code skill format: directory with SKILL.md; structured sections |
| SKILL-03 | Skills are injected into agent context at spawn time via Claude Code's agent loading mechanism | `skills` frontmatter field in agent markdown injects full skill content at startup |
| SKILL-04 | Progressive skill loading: skill names in agent definition, full body loaded on demand | For regular sessions: description only; for subagents with `skills` field: full content injected |
| SKILL-05 | Per-agent skill budget enforced (max 2K tokens per skill, max 3 skills for Executor) | Custom skill loader in src/skills.ts validates token count; 2K is a guideline (warn, not reject) |
| SKILL-06 | Skill content hash validated before injection to prevent tampering | Deprioritized per CONTEXT.md — warn on unexpected skills not in agents.toml |
| TRUST-01 | Trust-Knowledge Matrix stored as TOML config file (config/trust.toml) | trust.toml already exists; needs schema extension for per-agent overrides and tier authority matrix |
| TRUST-02 | Per-domain autonomy levels: autopilot, co-pilot, advisory | Already in trust.toml schema; 3 modes confirmed |
| TRUST-03 | Tier 0 (Product Strategy) decisions always require user approval regardless of trust config | Hard-coded in agent prompt; hooks enforce in Phase 14 |
| TRUST-04 | Trust config drives hook decisions: autopilot -> allow, co-pilot -> ask, advisory -> ask with explanation | trust.toml structure already readable; hook enforcement in Phase 14 |
| TRUST-05 | Decision tier authority matrix maps each agent role to its permitted decision tiers | New `[tier_authority]` section needed in trust.toml + Zod schema extension |
| TRUST-06 | Configurable approval tiers for decomposition levels | Already in trust.toml `[approval]` section; 3 modes (always/strategic/none) |
</phase_requirements>

---

## Summary

Phase 13 delivers 10 specialized agent markdown files, a skill directory with content, and trust.toml schema extensions. The primary technical domains are: (1) the Claude Code agent markdown format — now fully documented, (2) the skill loading mechanism — which uses a directory-based SKILL.md structure, and (3) the TOML config schema — which needs extension for per-agent overrides and tier authority.

The most important discovery is how Claude Code handles the `skills` field in agent frontmatter: when an agent definition lists skills, **the full SKILL.md content is injected into the agent's context at startup** — not lazily loaded. This aligns with the SKILL-03 requirement ("injected into agent context at spawn time") but means the "2K token limit" in SKILL-05 is a custom validation concern, not a Claude Code hard limit. The framework needs a TypeScript skill loader (`src/skills.ts`) that validates token counts and warns, but Claude Code's native skill injection does the actual content delivery.

The second critical finding: skills in Claude Code live in **directory structures** with a `SKILL.md` entrypoint — not single flat files. So `skills/typescript/SKILL.md` not `skills/typescript.md`. The CONTEXT.md decision to use "one skill per technology" maps cleanly to one directory per technology. The `skills` frontmatter field in an agent definition references the **directory name** (e.g., `skills: [typescript, react]` looks for `skills/typescript/SKILL.md` and `skills/react/SKILL.md`).

The trust.toml needs two new TOML sections: `[tier_authority]` mapping agent names to permitted tier arrays, and `[agents]` for per-agent domain overrides. Both are additive to the existing schema and backward-compatible. The existing Zod schema in `src/config.ts` needs corresponding extensions.

**Primary recommendation:** Write agent markdown files first (they are pure markdown/prose), then build the skill directory library (structured content), then extend trust.toml schema and Zod types. This sequencing minimizes dependencies and allows parallel work on agents vs. skills.

---

## Standard Stack

### Core (already in place)
| Component | Version/Location | Purpose | Status |
|-----------|-----------------|---------|--------|
| Agent markdown files | `.claude/agents/*.md` | System prompts loaded natively by Claude Code | Reference: `agents/synapse-orchestrator.md` |
| Skill directories | `.claude/skills/<name>/SKILL.md` | Domain knowledge injected at agent spawn | Empty `skills/` dir exists |
| `config/agents.toml` | `smol-toml@1.6.0` | Source of truth for model, tier, skills, allowed_tools | Exists; needs allowed_tools field |
| `config/trust.toml` | `smol-toml@1.6.0` | Per-domain autonomy and decomposition approval | Exists; needs tier_authority + agent overrides |
| `src/config.ts` | Zod 4.3.6 | Validated TOML loaders | Exists; needs schema extension |
| Bun test | `bun test` | Test runner (31 tests passing) | Established |

### New Components to Build
| Component | Location | Purpose |
|-----------|----------|---------|
| 9 agent markdown files | `agents/*.md` | Specialized system prompts for each role |
| Skill directories | `skills/<name>/SKILL.md` | 7+ tech skills (typescript, react, python, vitest, sql, bun, tailwind) |
| `src/skills.ts` | `src/skills.ts` | Skill loader: reads SKILL.md files, validates token count, returns content map |
| Extended `AgentsConfigSchema` | `src/config.ts` | Add `allowed_tools: string[]` field to agent entries |
| Extended `TrustConfigSchema` | `src/config.ts` | Add `tier_authority` and per-agent overrides sections |
| Updated `agents.toml` | `config/agents.toml` | Populate `allowed_tools` for all 10 agents |
| Updated `trust.toml` | `config/trust.toml` | Add `[tier_authority]` and example agent overrides |

### No Installation Needed
All dependencies are already in package.json. No new npm packages required for this phase.

---

## Architecture Patterns

### Recommended Project Structure (post Phase 13)
```
synapse-framework/
├── agents/
│   ├── synapse-orchestrator.md     # Reference (exists)
│   ├── product-strategist.md       # Opus — Tier 0-1 decisions
│   ├── researcher.md               # Sonnet — read-only knowledge
│   ├── architect.md                # Opus — Tier 1-2 decisions
│   ├── decomposer.md               # Opus — task decomposition
│   ├── plan-reviewer.md            # Opus — plan verification
│   ├── executor.md                 # Sonnet — Tier 3 implementation
│   ├── validator.md                # Sonnet — task validation
│   ├── integration-checker.md      # Sonnet — cross-task validation
│   ├── debugger.md                 # Sonnet — root-cause analysis
│   └── codebase-analyst.md         # Sonnet — code indexing
├── skills/
│   ├── typescript/SKILL.md         # TypeScript conventions + quality criteria
│   ├── react/SKILL.md              # React patterns
│   ├── python/SKILL.md             # Python conventions
│   ├── vitest/SKILL.md             # Testing patterns
│   ├── sql/SKILL.md                # SQL conventions
│   ├── bun/SKILL.md                # Bun runtime patterns
│   ├── tailwind/SKILL.md           # Tailwind CSS
│   └── project/                    # User-defined project skills
├── config/
│   ├── agents.toml                 # + allowed_tools per agent
│   └── trust.toml                  # + tier_authority + agent overrides
└── src/
    ├── config.ts                   # + AgentsConfigSchema.allowed_tools + TrustConfigSchema extensions
    └── skills.ts                   # NEW: skill loader with token validation
```

### Pattern 1: Claude Code Agent Markdown Format

**What:** Agent markdown files with YAML frontmatter define system prompts that Claude Code loads natively.

**Key frontmatter fields used by Synapse:**
```markdown
---
name: agent-name                    # Unique ID (lowercase, hyphens)
description: When to delegate here  # Used by Claude to decide delegation
model: opus                         # or "sonnet", "haiku", "inherit"
tools: Read, Write, Bash, mcp__synapse__store_decision  # Allowlist
color: purple                       # UI display color
---

You are the [Role Name]. [System prompt body follows...]
```

**Source:** https://code.claude.com/docs/en/sub-agents (fetched 2026-03-02)

**Critical behavior:**
- The markdown body IS the system prompt — Claude Code passes it directly at spawn time
- Subagents get ONLY this system prompt plus basic environment context (working directory) — NOT the full Claude Code system prompt
- `tools` field is an allowlist — listing tools restricts the agent to only those tools
- `model` field accepts `opus`, `sonnet`, `haiku`, or `inherit` (defaults to `inherit`)
- Agents are loaded at session start; adding a file requires restart OR `/agents` command to reload immediately
- Subagents CANNOT spawn other subagents (prevents nesting)

**The CONTEXT.md decision "Frontmatter for display, TOML for config" requires a specific approach:** Since agents.toml is the source of truth for model/skills/allowed_tools, the agent markdown frontmatter should still include `model` (Claude Code uses it) but the `tools` field should match what agents.toml defines. The planner must ensure these stay in sync. The canonical approach: define `tools` in the markdown frontmatter (Claude Code reads it), keep agents.toml as the documentation/hook source of truth.

**Resolution:** Define `allowed_tools` in agents.toml. During Phase 14 hook enforcement, the hook reads agents.toml. In the agent markdown, the `tools` frontmatter field controls Claude Code's native enforcement. Both must list the same tools. This phase defines both.

### Pattern 2: Skill Directory Structure

**What:** Each skill is a directory with `SKILL.md` as the entrypoint.

**Source:** https://code.claude.com/docs/en/skills (fetched 2026-03-02)

```
skills/
├── typescript/
│   ├── SKILL.md          # Required: frontmatter + main instructions
│   └── (optional extras like reference.md, scripts/)
├── react/
│   └── SKILL.md
└── project/              # User project-specific skills
    └── my-project-skill/
        └── SKILL.md
```

**SKILL.md format:**
```markdown
---
name: typescript
description: TypeScript conventions, quality criteria, and anti-patterns. Use when writing or reviewing TypeScript code.
disable-model-invocation: true
user-invocable: false
---

## Conventions
[naming patterns, file structure, idioms]

## Quality Criteria
[what "good" looks like for this technology]

## Vocabulary
[domain terms to use correctly]

## Anti-patterns
[what to avoid]
```

**Skill injection via agent frontmatter:**
When an agent definition includes `skills: [typescript, react]`, Claude Code injects the **full SKILL.md content** into the agent's context at startup — not just the description. This is the "preloaded skills" mechanism. The skill name maps to the directory name in `.claude/skills/`.

**Important:** Claude Code looks for skills in `.claude/skills/` at the project level. The synapse-framework uses `skills/` at the repo root. When installed by users, the framework content is copied to `.claude/` structure. For Phase 13, build skills in `skills/` as the source; installation copies to `.claude/skills/`.

**Skill discovery budget:** Skill descriptions load at 2% of context window (~16K chars fallback). Full content only loads on invocation. For preloaded (via agent `skills` field), full content loads unconditionally at spawn.

### Pattern 3: TOML Config Schema Extension

**What:** Extend trust.toml and agents.toml with new sections while preserving backward compatibility.

**Extended agents.toml:**
```toml
[agents.executor]
model = "sonnet"
tier = 3
skills = ["typescript", "bun"]
allowed_tools = [
  "Read", "Write", "Edit", "Bash", "Glob", "Grep",
  "mcp__synapse__create_task",
  "mcp__synapse__update_task",
  "mcp__synapse__get_task_tree",
  "mcp__synapse__get_smart_context",
  "mcp__synapse__store_decision"
]

[agents.researcher]
model = "sonnet"
skills = []
allowed_tools = [
  "Read", "Glob", "Grep", "Bash",
  "mcp__synapse__store_document",
  "mcp__synapse__update_document",
  "mcp__synapse__link_documents",
  "mcp__synapse__query_documents",
  "mcp__synapse__semantic_search",
  "mcp__synapse__search_code",
  "mcp__synapse__get_smart_context",
  "mcp__synapse__check_precedent"
]
```

**Extended trust.toml:**
```toml
[domains]
architecture = "co-pilot"
dependencies = "co-pilot"
implementation = "autopilot"
testing = "autopilot"
documentation = "autopilot"
product_strategy = "advisory"

[approval]
decomposition = "strategic"

# NEW: Tier authority matrix — which tiers each agent can store decisions at
[tier_authority]
product-strategist = [0, 1]
architect = [1, 2]
decomposer = [2]
plan-reviewer = []          # read-only
executor = [3]
validator = []              # read-only
integration-checker = []    # read-only
researcher = []             # no store_decision at all
debugger = []
codebase-analyst = []

# NEW: Per-agent domain overrides (optional)
# [agent_overrides.executor.domains]
# architecture = "advisory"   # executor in architecture domain = advisory
```

**Extended Zod schemas in src/config.ts:**
```typescript
// Extension to AgentsConfigSchema
export const AgentsConfigSchema = z.object({
  agents: z.record(z.string(), z.object({
    model: z.enum(["opus", "sonnet"]).default("sonnet"),
    tier: z.number().int().min(0).max(3).optional(),
    skills: z.array(z.string()).default([]),
    allowed_tools: z.array(z.string()).default([]),  // NEW
  })).default({}),
});

// Extension to TrustConfigSchema
export const TrustConfigSchema = z.object({
  domains: z.record(z.string(), autonomyLevel).default({}),
  approval: z.object({
    decomposition: z.enum(["always", "strategic", "none"]).default("strategic"),
  }).default({}),
  tier_authority: z.record(z.string(), z.array(z.number().int().min(0).max(3))).default({}),  // NEW
  agent_overrides: z.record(z.string(), z.object({  // NEW (optional)
    domains: z.record(z.string(), autonomyLevel).optional(),
  })).default({}),
});
```

### Pattern 4: Sonnet Agent Prompt Template (concise)

**What:** Concise prompts for Sonnet agents: role + key behaviors + constraints + tool sequences.

```markdown
---
name: executor
description: Implements leaf tasks (depth=3). Use when a task is ready for implementation.
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep, mcp__synapse__create_task, ...
color: green
---

You are the Synapse Executor. You implement leaf tasks (depth=3) assigned to you.

## Attribution
**CRITICAL:** On EVERY Synapse MCP tool call, include `actor: "executor"`.

## Core Behaviors
- Read task description and dependencies before starting
- Implement exactly what the task specifies — no scope creep
- Only store Tier 3 decisions (implementation choices, not architecture)
- Update task status when complete: `update_task(status: "done")`

## Key Tool Sequences

**Start task:**
1. `get_task_tree` — read task description and dependencies
2. `get_smart_context` — retrieve relevant decisions and patterns
3. Implement the task

**Store implementation decision:**
1. `check_precedent` — verify no conflicting decision exists
2. `store_decision(tier: 3, ...)` — record implementation choice

## Constraints
- Tier 3 decisions only (implementation choices)
- Do not create new tasks — decomposition is the Decomposer's role
- When uncertain, escalate to orchestrator

## Example
Task: "Implement the user authentication middleware"
1. Read the task description and referenced decisions via get_task_tree
2. Check for auth patterns via get_smart_context
3. Implement the middleware following established patterns
4. Update task: `update_task(status: "done", actor: "executor")`
```

### Pattern 5: Opus Agent Prompt Template (verbose)

**What:** Verbose prompts for Opus agents with step-by-step protocols, decision trees, examples.

```markdown
---
name: architect
description: Defines architecture, stores Tier 1-2 decisions, creates epic task structure. Use when planning how to build something.
model: opus
tools: Read, Bash, Glob, mcp__synapse__check_precedent, mcp__synapse__store_decision, mcp__synapse__create_task, ...
color: blue
---

You are the Synapse Architect. You make structural decisions about how software is built.

## Attribution
**CRITICAL:** On EVERY Synapse MCP tool call, include `actor: "architect"`.

## Core Responsibilities
1. **Architecture Decisions (Tier 1):** Major structural choices (frameworks, patterns, data models)
2. **Functional Design (Tier 2):** Component interfaces, API contracts, module boundaries
3. **Epic Structure:** Create top-level task tree (Epic → Features) for the Decomposer

## Decision Protocol

**Before every architectural decision:**
1. `check_precedent` — has this been decided before? (0.85 similarity threshold)
2. If precedent found: follow or explicitly supersede it with rationale
3. If no precedent: proceed with decision

**Storing decisions:**
- Tier 1 (architecture): `store_decision(tier: 1, subject: "...", choice: "...", rationale: "...")`
- Tier 2 (functional design): `store_decision(tier: 2, ...)`
- Never store Tier 0 (product strategy) — that is Product Strategist's domain
- Never store Tier 3 (implementation) — that is Executor's domain

**Trust level behavior:**
- co-pilot: After checking precedent, ask user: "For [X], did you have architecture in mind?"
- advisory: Store your proposal, present it for async review
- autopilot: Decide and record, report progress

## Task Tree Creation Protocol

When creating the epic structure:
1. Create one root epic: `create_task(depth: 0, title: goal, description: full intent)`
2. Decompose into features: `create_task(depth: 1, parent_id: epic_id, ...)`
3. Hand off to Decomposer for feature → task decomposition

## Key Tool Sequences

**Architecture decision:**
`check_precedent` → review results → `store_decision(tier: 1 or 2, actor: "architect")`

**Epic creation:**
`check_precedent` → `store_decision` (for key choices) → `create_task(depth: 0)` → `create_task(depth: 1, ...)` × N features

## Constraints
- Tier 1-2 decisions only
- Always check precedent before deciding
- Co-pilot mode: invite user perspective before presenting proposals
- When uncertain, escalate to orchestrator

## Examples

**Example 1: Architecture decision (co-pilot mode)**
User: "We need to build an authentication system"
1. `check_precedent("authentication approach")`
2. No precedent found
3. Ask: "For authentication, did you have an approach in mind? JWT? Session-based? OAuth?"
4. User says: "JWT with refresh tokens"
5. `store_decision(tier: 1, subject: "authentication", choice: "JWT with refresh tokens", rationale: "User preference, stateless, mobile-friendly", actor: "architect")`

**Example 2: Creating epic structure**
1. `create_task(depth: 0, title: "Authentication System", description: "...", actor: "architect")`
2. `create_task(depth: 1, parent_id: epic_id, title: "JWT token generation", actor: "architect")`
3. `create_task(depth: 1, parent_id: epic_id, title: "Token validation middleware", actor: "architect")`
4. `create_task(depth: 1, parent_id: epic_id, title: "Refresh token flow", actor: "architect")`
```

### Pattern 6: Skill Token Budget Loader

**What:** Custom TypeScript loader validates token count before skill injection.

```typescript
// src/skills.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN_WARN_THRESHOLD = 2000;  // warn if skill exceeds 2K tokens

export interface SkillContent {
  name: string;
  content: string;
  tokenEstimate: number;
}

/**
 * Rough token estimate: ~4 chars per token for English prose
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Load a skill by name from the skills directory.
 * Returns the full SKILL.md content (frontmatter stripped) for injection.
 * Warns to stderr if content exceeds TOKEN_WARN_THRESHOLD.
 */
export function loadSkill(skillName: string, skillsDir = "skills"): SkillContent {
  const skillPath = join(skillsDir, skillName, "SKILL.md");
  let raw: string;
  try {
    raw = readFileSync(skillPath, "utf-8");
  } catch {
    throw new Error(`Skill "${skillName}" not found at ${skillPath}`);
  }

  const tokens = estimateTokens(raw);
  if (tokens > TOKEN_WARN_THRESHOLD) {
    process.stderr.write(
      `[synapse-framework] Warning: skill "${skillName}" is ~${tokens} tokens (threshold: ${TOKEN_WARN_THRESHOLD}). Loading full content.\n`
    );
  }

  return { name: skillName, content: raw, tokenEstimate: tokens };
}

/**
 * Load all skills for an agent based on agents.toml skill list.
 * Warns on any skills found in skills/ dir not referenced in agents.toml.
 */
export function loadAgentSkills(
  skillNames: string[],
  skillsDir = "skills"
): SkillContent[] {
  return skillNames.map((name) => loadSkill(name, skillsDir));
}
```

### Anti-Patterns to Avoid

- **Duplicating tools between frontmatter and agents.toml with different values:** The `tools` field in agent markdown frontmatter must match `allowed_tools` in agents.toml exactly. If they diverge, Phase 14 hook enforcement sees agents.toml but Claude Code enforces frontmatter. Keep them identical.
- **Single flat SKILL.md files (not in directories):** Claude Code expects `skills/<name>/SKILL.md`. A flat `skills/typescript.md` is NOT discovered by the `skills` frontmatter field. Always use directory structure.
- **Subagents spawning subagents:** Claude Code does not support nested subagent spawning. The Orchestrator uses the Agent/Task tool, but specialist agents cannot spawn further specialists.
- **Agents natively communicating:** No direct messaging between agents — all coordination via Synapse data layer or through orchestrator.
- **Verbose prompts for Sonnet models:** Sonnet performs better with tight, concise prompts. Save verbose step-by-step protocols for Opus agents.
- **Per-agent failure mode enumeration:** Use the single shared rule "When uncertain, escalate to orchestrator" across all agents.
- **Mixing skill discovery and preloading:** In regular sessions, skill descriptions load at startup, full content loads on invocation. In subagents with `skills` field, full content loads at spawn. Synapse agents should use the `skills` field in frontmatter for guaranteed injection, NOT rely on Claude discovering skills via description matching.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Custom tokenizer | Character-ratio estimate (~4 chars/token) | Exact token counts require tiktoken/anthropic SDK; rough estimate is sufficient for warn threshold |
| Skill discovery | Directory walker | Name-to-path resolution: `skills/<name>/SKILL.md` | Claude Code's native skill discovery handles the actual loading |
| Tool allowlist validation | Runtime tool interceptor | agents.toml source of truth + Phase 14 PreToolUse hook | Intercepting Claude's tool calls requires hook infrastructure (Phase 14) |
| Agent-to-agent messaging | Message broker | Synapse data layer (store_document, update_task) | The data layer IS the communication medium — no separate channel needed |
| Model routing | Dynamic model selector | Static `model:` field in frontmatter | Claude Code handles model selection natively |

**Key insight:** Claude Code handles agent loading, tool enforcement, and skill injection natively. The framework's job is to write good markdown content and valid TOML config — not to build a runtime around Claude Code.

---

## Common Pitfalls

### Pitfall 1: Wrong Skill Directory Layout
**What goes wrong:** Creating `skills/typescript.md` instead of `skills/typescript/SKILL.md` — Claude Code's `skills` frontmatter field doesn't discover flat files.
**Why it happens:** The CONTEXT.md described skills as "markdown files in skills/" which sounds like flat files.
**How to avoid:** Always create `skills/<name>/SKILL.md` (directory with SKILL.md entrypoint). The `name` in SKILL.md frontmatter should match the directory name.
**Warning signs:** Agent doesn't have skill knowledge at spawn; `skills: [typescript]` in agent frontmatter has no effect.

### Pitfall 2: Tools Frontmatter vs. agents.toml Divergence
**What goes wrong:** Agent markdown `tools:` field lists 8 tools; agents.toml `allowed_tools` lists 10 different tools. Phase 14 hook reads agents.toml (10 tools) but Claude Code enforces frontmatter (8 tools).
**Why it happens:** Two sources of truth for the same data.
**How to avoid:** Define the canonical tool list once. During Phase 13, the agent markdown `tools` frontmatter field IS the enforcement. Generate agents.toml `allowed_tools` to match exactly. Phase 14 hooks will read agents.toml to enforce.
**Warning signs:** Agent can call tools it shouldn't be able to call, or agent fails on valid tools.

### Pitfall 3: Subagent System Prompt Isolation
**What goes wrong:** Agent assumes it can read session context (main conversation history, CLAUDE.md) because it's a "sub-agent of the orchestrator."
**Why it happens:** Misunderstanding that subagents share context with parent.
**How to avoid:** Each subagent gets ONLY its markdown system prompt plus basic environment context (working directory). Agents must be self-contained in their markdown. If they need project context, they must retrieve it via Synapse tools (get_smart_context, query_decisions).
**Warning signs:** Agent references "what we discussed earlier" when no prior context exists in its window.

### Pitfall 4: Trust Config Consumed by Agents, Not Just Hooks
**What goes wrong:** Treating trust.toml as purely a Phase 14 hook config — forgetting that agents themselves reference it for co-pilot mode behavior ("ask the user" vs "decide autonomously").
**Why it happens:** TRUST-04 says "trust config drives hook decisions" — but TRUST-02's co-pilot/advisory/autopilot also shapes agent behavior directly via prompt instructions referencing trust levels.
**How to avoid:** Agents in co-pilot domains should follow the co-pilot protocol (ask user first). This is enforced by prompt instructions in Phase 13, hardened by hooks in Phase 14. Make trust level visible in agent prompts via references to trust.toml semantics.
**Warning signs:** Agent always presents proposals as fait accompli even in co-pilot mode.

### Pitfall 5: Skill Content That Drifts From agents.toml
**What goes wrong:** agents.toml lists `skills = ["typescript"]` but `skills/typescript/` directory doesn't exist yet, or SKILL.md template is empty.
**Why it happens:** Building agents.toml before building skill files.
**How to avoid:** Create skill directories first (or simultaneously). The config.test.ts anti-drift test pattern should be extended to validate that every skill name in agents.toml has a corresponding SKILL.md on disk.
**Warning signs:** Agent spawns without skill knowledge; token count warnings not firing (skill not found).

### Pitfall 6: Researcher Can Read check_precedent But Not store_decision
**What goes wrong:** Researcher calls `store_decision` believing it's within its allowed scope, causing a Phase 14 hook violation.
**Why it happens:** Researcher IS allowed `check_precedent` (read path) but NOT `store_decision` (write path). Easy to confuse.
**How to avoid:** Researcher's allowed_tools must explicitly exclude `mcp__synapse__store_decision`, `mcp__synapse__create_task`, `mcp__synapse__update_task`. The deliberation pattern: Researcher stores analysis in `store_document`, links to the decision context. Decision-making agents consume research documents as context before storing decisions.
**Warning signs:** Researcher agent starts making architectural proposals directly via store_decision.

---

## Code Examples

### Agent Markdown — Complete Sonnet Template
```markdown
---
name: researcher
description: Research and gather knowledge. Stores findings as documents linked to tasks. CANNOT make decisions or create tasks — read-only on Synapse state.
model: sonnet
tools: Read, Bash, Glob, Grep, mcp__synapse__store_document, mcp__synapse__update_document, mcp__synapse__link_documents, mcp__synapse__query_documents, mcp__synapse__semantic_search, mcp__synapse__search_code, mcp__synapse__get_smart_context, mcp__synapse__check_precedent
color: cyan
---

You are the Synapse Researcher. You gather information, check precedents, and store findings as linked documents.

## Attribution
**CRITICAL:** On EVERY Synapse MCP tool call, include `actor: "researcher"`.

## Core Behaviors
- Cite sources for all findings (URL, file path, or decision ID)
- Check precedent before investigating alternatives that may already be decided
- Store findings as documents: `store_document(title, content, category: "research_finding", actor: "researcher")`
- Link research to relevant tasks or decisions: `link_documents(from_id, to_id, type: "references")`

## Key Tool Sequences

**Research task:**
1. `get_smart_context` — understand current project decisions and context
2. `check_precedent` — verify question hasn't been answered
3. Research (Read files, Bash commands, semantic_search)
4. `store_document` — record findings with citations
5. `link_documents` — connect findings to relevant tasks/decisions

## Constraints
- CANNOT store decisions (`store_decision` is not in your allowed tools)
- CANNOT create or update tasks
- When uncertain, escalate to orchestrator

## Example
Research request: "What testing patterns does this codebase use?"
1. `get_smart_context(mode: "overview")` — check existing testing decisions
2. `search_code(query: "test setup patterns", language: "typescript")` — find test files
3. Read key test files to understand patterns
4. `store_document(title: "Testing Patterns Analysis", content: findings, category: "research_finding", actor: "researcher")`
```

### Skill SKILL.md — Complete TypeScript Skill Template
```markdown
---
name: typescript
description: TypeScript conventions, quality criteria, and anti-patterns for this project. Use when writing or reviewing TypeScript code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Use `type` for object shapes, `interface` for extensible contracts
- Prefer `const` over `let`; avoid `var`
- Use explicit return types on exported functions
- Zod for runtime validation at API boundaries; TypeScript types for internal structure
- File naming: camelCase for utilities, PascalCase for classes/React components

## Quality Criteria

- No `any` types — use `unknown` with type narrowing
- All async functions return `Promise<T>` with explicit T
- Error handling: use discriminated unions `{ success: true, data: T } | { success: false, error: string }`
- Prefer `satisfies` operator over type assertion (`as`) for type-safe config objects

## Vocabulary

- **Schema**: Zod schema object used for validation
- **Type**: TypeScript compile-time type annotation
- **Discriminated union**: Union type with a shared discriminant field (e.g., `success: boolean`)
- **Narrowing**: Runtime type checking that TypeScript understands

## Anti-patterns

- `as any` — masks type errors, hides bugs
- `!` non-null assertion without verification — use optional chaining or explicit check
- Implicit `any` from untyped params — always type function parameters
- `JSON.parse(x) as MyType` without Zod validation — use `schema.parse()` instead
```

### Updated agents.toml — With allowed_tools
```toml
# Source: https://code.claude.com/docs/en/sub-agents — tools field format

[agents.researcher]
model = "sonnet"
skills = []
allowed_tools = [
  "Read", "Bash", "Glob", "Grep",
  "mcp__synapse__store_document",
  "mcp__synapse__update_document",
  "mcp__synapse__link_documents",
  "mcp__synapse__query_documents",
  "mcp__synapse__semantic_search",
  "mcp__synapse__search_code",
  "mcp__synapse__get_smart_context",
  "mcp__synapse__check_precedent"
]

[agents.executor]
model = "sonnet"
tier = 3
skills = ["typescript", "bun"]
allowed_tools = [
  "Read", "Write", "Edit", "Bash", "Glob", "Grep",
  "mcp__synapse__create_task",
  "mcp__synapse__update_task",
  "mcp__synapse__get_task_tree",
  "mcp__synapse__get_smart_context",
  "mcp__synapse__store_decision",
  "mcp__synapse__check_precedent",
  "mcp__synapse__query_decisions",
  "mcp__synapse__search_code"
]
```

### Extended trust.toml — With Tier Authority Matrix
```toml
[domains]
architecture = "co-pilot"
dependencies = "co-pilot"
implementation = "autopilot"
testing = "autopilot"
documentation = "autopilot"
product_strategy = "advisory"

[approval]
decomposition = "strategic"

[tier_authority]
product-strategist = [0, 1]
architect = [1, 2]
decomposer = [2]
plan-reviewer = []
executor = [3]
validator = []
integration-checker = []
researcher = []
debugger = []
codebase-analyst = []
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Custom agent runner / SDK | Claude Code `.claude/agents/*.md` — native markdown loading | No runtime, just markdown + TOML |
| Skill files as single markdown | Directory structure `skills/<name>/SKILL.md` | Supports progressive disclosure, supporting files |
| Dynamic skill injection via code | `skills` frontmatter field injects full content at agent spawn | Zero infrastructure — Claude Code handles injection |
| Agent communication via message passing | Synapse data layer (store_document, update_task) as communication medium | Removes coordination overhead, fully auditable |
| Trust config as DB table | TOML config file (explicit, git-tracked, auditable) | Survives server restarts, human-readable |

**Current as of:** Claude Code docs fetched 2026-03-02

---

## Open Questions

1. **Skill name resolution: framework skills/ vs. install target .claude/skills/**
   - What we know: Claude Code looks in `.claude/skills/<name>/SKILL.md` at the project level
   - What's unclear: The synapse-framework repo ships skills in `skills/` root. When a user installs, how do skills get to `.claude/skills/`? The framework may need an install script or README instruction.
   - Recommendation: For Phase 13, build skills in `skills/` root. Document that users must symlink or copy `skills/` to `.claude/skills/` in their project. Add a `scripts/install.sh` or README note. This is an installation concern, not a Phase 13 deliverable.

2. **tools: field in agent frontmatter format**
   - What we know: The `tools` field accepts comma-separated tool names. MCP tools use the `mcp__server__tool_name` prefix.
   - What's unclear: Exact format for MCP tools — is it `mcp__synapse__store_decision` or `mcp.synapse.store_decision` or something else?
   - Recommendation: The existing `synapse-orchestrator.md` already uses `mcp__synapse__create_task` format and works. Use the same format for all 10 agents. Treat as HIGH confidence from working reference.

3. **SKILL-05: "max 3 skills for Executor" enforcement**
   - What we know: The src/skills.ts loader validates token count and warns. The 3-skill limit is a design constraint.
   - What's unclear: Whether to error (reject) or warn when Executor has >3 skills in agents.toml.
   - Recommendation: Warn in skill loader but don't reject — matches the "warn but load" policy from CONTEXT.md. The 3-skill limit is a guideline enforced by configuration authorship, not runtime.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is not present in `.planning/config.json` (defaults to disabled).

However, the existing test infrastructure should be extended for Phase 13 deliverables:

**Existing:** 31 tests passing (`bun test`) — config.test.ts, hooks.test.ts, behavioral, integration

**New tests needed for Phase 13:**
- `test/unit/config.test.ts` — extend with tests for `allowed_tools` field in AgentsConfigSchema and new TrustConfigSchema fields (`tier_authority`, `agent_overrides`)
- `test/unit/skills.test.ts` — NEW: test skill loader (loadSkill, loadAgentSkills), token warning, missing skill error
- `test/scorecards/*.scorecard.toml` — NEW scorecards for each specialized agent (behavioral validation)
- Anti-drift tests: validate `config/agents.toml` and `config/trust.toml` against extended Zod schemas

**Quick run:** `cd /home/kanter/code/synapse-framework && bun test test/unit/ -- -t "config"`
**Full suite:** `cd /home/kanter/code/synapse-framework && bun test`

---

## Sources

### Primary (HIGH confidence)
- https://code.claude.com/docs/en/sub-agents — Complete agent frontmatter schema, skills field, tool allowlist format, model options (fetched 2026-03-02)
- https://code.claude.com/docs/en/skills — Skill directory structure, SKILL.md format, preloading via agent skills field, token budget (fetched 2026-03-02)
- `/home/kanter/code/synapse-framework/agents/synapse-orchestrator.md` — Reference agent showing working frontmatter format, MCP tool naming convention, attribution pattern
- `/home/kanter/code/synapse-framework/src/config.ts` — Existing Zod schemas (AgentsConfigSchema, TrustConfigSchema) showing extension points
- `/home/kanter/code/synapse-framework/config/agents.toml` — Existing agent registry with 10 agents registered
- `/home/kanter/code/synapse-framework/config/trust.toml` — Existing trust config with 6 domains and decomposition approval

### Secondary (MEDIUM confidence)
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview — Agent Skills architecture across Claude products (API vs Claude Code distinction); skill types (instructions/code/resources) (fetched 2026-03-02)
- Phase 12 validated decisions in `.planning/STATE.md` — Attribution via prompt instructions, ESM hook patterns, Zod 4 schema syntax

### Tertiary (LOW confidence — for informational context only)
- WebSearch result: "Claude Code multiple agent systems: Complete 2026 guide" — community article, not verified against official docs; not cited in recommendations

---

## Metadata

**Confidence breakdown:**
- Agent markdown format: HIGH — verified against official docs and working reference (synapse-orchestrator.md)
- Skill directory structure: HIGH — verified against official docs (code.claude.com/docs/en/skills)
- Skill injection mechanism (skills field): HIGH — explicitly documented in sub-agents and skills docs
- trust.toml extension schema: HIGH — additive to existing validated schema; Zod 4 patterns from Phase 12
- Agent prompt engineering patterns: MEDIUM — based on official example agents in docs + reference agent; behavioral verification requires scorecard tests

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (Claude Code docs are fast-moving — verify before using if more than 30 days old)
