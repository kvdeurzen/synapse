# Phase 19: Agent Prompts + Level-Awareness - Research

**Researched:** 2026-03-05
**Domain:** Agent prompt engineering, Claude Code subagent frontmatter, MCP-first prompt patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**MCP-First Principle**
- One-liner motivation: "Synapse stores project decisions and context. Query it first to avoid wasting tokens re-discovering what's already known."
- Context from Synapse, code from filesystem: agents query Synapse for decisions, task specs, documents, and context (get_smart_context, query_decisions, get_task_tree). They read/write actual source code via filesystem tools (Read, Write, Edit, Grep).
- Code discovery via MCP when location unknown, direct filesystem when location provided.
- Bidirectional — read context AND write results. Agents read from Synapse at start and write findings/summaries back at end.
- Trust the index: agents use search_code without checking staleness.
- Pre-fetch varies by agent tier: Opus agents get broad context; Sonnet agents get targeted context.

**Prompt Section Structure**
- Shared template + agent-specific sequences: every agent gets the same "Synapse MCP as Single Source of Truth" header section. Then each gets its own "Key Tool Sequences" section.
- Tool reference table per agent: 3-column table (Tool | Purpose | When to use) at the top of the MCP section, listing only the tools this agent has access to.
- Standard document naming: `{agent}-{task_id}` pattern for all agent output documents (e.g., `executor-summary-task_abc123`, `validator-findings-task_abc123`).

**Error Handling Protocol**
- Two tiers:
  - Hard halt: write operations (store_document, update_task, create_task, store_decision) — if these fail, data is lost. Agent stops and reports tool name + error message to orchestrator.
  - Soft warning: read operations (check_precedent, query_decisions, search_code, get_smart_context) — empty results or timeouts noted in output document's "Warnings" section but agent continues.
- Minimal halt report: tool name and error message only.
- MCP unreachable (connection error on first call) = immediate halt with "Synapse MCP server unreachable" message.

**Level-Aware Behavior**
- All agents that handle multiple hierarchy levels get a level-behavior section.
- Full 4-level mapping (epic/feature/component/task) for: orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker.
- Shorter 2-tier section for: executor, validator, debugger, researcher, codebase-analyst.
- Level injected in handoff prompt via `hierarchy_level` field; agent prompt maps each level to behavioral adjustments.
- Executor stays leaf-only (always depth=3).
- Debugger operates at any level.
- Integration-checker at feature/epic level only.
- Validator uses stage document as validation source at higher levels.
- Domain mode injected by startup hook (synapse-startup.js reads trust.toml).

**Handoff Protocol**
- IDs only — agent fetches its own context via get_smart_context / get_task_tree.
- Structured handoff block format:
  ```
  --- SYNAPSE HANDOFF ---
  project_id: xyz
  task_id: abc
  hierarchy_level: task
  rpev_stage_doc_id: rpev-stage-abc
  --- END HANDOFF ---
  ```
- Decomposer curates context_refs on leaf tasks.
- Mandatory ref fetch by executor/validator at task start.

### Claude's Discretion
- Exact wording of the "MCP as Single Source of Truth" motivation sentence
- Tool reference table formatting and column widths
- Level-behavior mapping details for each specific agent
- How to integrate new sections with existing agent prompt content without disrupting current structure
- Exact structured handoff block delimiter style

### Deferred Ideas (OUT OF SCOPE)
- Auto-reindex process (separate background process) — next milestone
- Skill content injection (SKILL.md content injected into agent prompts) — Phase 20 scope
- Agent pool dispatch — Phase 21 scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGENT-01 | Every agent prompt has "MCP as Single Source of Truth" section with query-first principle | Shared template design + tool reference tables documented below |
| AGENT-02 | Every agent prompt has concrete tool call sequences with parameter values and response shapes | Per-agent tool inventory + sequence patterns documented below |
| AGENT-03 | Every agent `.md` file has `mcpServers: ["synapse"]` in frontmatter | Frontmatter field confirmed valid; all 11 agent files catalogued |
| AGENT-04 | Orchestrator agent has subagent handoff protocol (project_id, task_id, doc_ids in every Task call) | Structured handoff block format defined; existing "Synapse Context" template found in orchestrator.md |
| AGENT-05 | Validator never overwrites task description; stores findings as linked document | update_task schema confirmed — description field overwrites; store_document + link_documents are the correct pattern; validator already has these tools in agents.toml |
| AGENT-06 | Integration Checker and Plan Reviewer persist findings via store_document + link_documents | Both agents have store_document + link_documents in agents.toml (added Phase 18); need prompt sections |
| AGENT-07 | Executor stores implementation summaries as documents | Executor has store_document + link_documents in agents.toml (Phase 18); needs prompt section + naming convention |
| AGENT-08 | Every agent prompt has MCP error handling protocol (halt on success: false, report to orchestrator) | Two-tier halt/warn pattern defined; all tool return shapes confirmed |
| AGENT-09 | Domain mode (co-pilot/autopilot/advisory) injected by startup hook and referenced by all agents | synapse-startup.js reviewed; domain mode NOT yet injected — needs addition; trust.toml has [domains] section |
| AGENT-10 | Decomposer populates context_refs (document_ids, decision_ids) on leaf tasks | context_refs is a convention, not a DB column — stored in task description or as a linked document; full analysis below |
| AGENT-11 | Executor and Validator fetch context_refs at start of each task | Fetch pattern: get_smart_context with doc_ids from handoff block; must handle empty refs gracefully |
</phase_requirements>

---

## Summary

Phase 19 is a pure prompt-engineering phase. It modifies 11 agent markdown files in `packages/framework/agents/` and the `synapse-startup.js` hook. No database schema changes, no new MCP tools, no TypeScript source changes. The goal is to make every agent reliably use Synapse as context backbone: read from it at start, write findings back at end, handle errors without silently losing data.

The research reveals three implementation-critical findings: (1) `context_refs` is a convention pattern, not a DB field — the decomposer must embed these IDs in the task description or store them as a linked document because `create_task` has no dedicated `context_refs` column; (2) the validator currently overwrites the task spec via `update_task(description: ...)` which destroys the original spec — the fix is `store_document` + `link_documents` for findings, with `update_task(status: "failed")` only for the status flag; (3) domain mode is NOT yet injected by `synapse-startup.js` — the hook reads `trust.toml` domains but does not emit them into `additionalContext`.

**Primary recommendation:** Modify each agent file with a surgical two-section addition (shared MCP header + agent-specific tool sequences), update the orchestrator's handoff block format, and add domain mode injection to synapse-startup.js. All changes are pure text edits to markdown and one JS file.

---

## Standard Stack

### Core Files Modified

| File | Agent | Tier | Model | Store/Write Tools |
|------|-------|------|-------|------------------|
| `packages/framework/agents/synapse-orchestrator.md` | Orchestrator | — | opus | store_document, link_documents |
| `packages/framework/agents/decomposer.md` | Decomposer | 2 | opus | create_task, update_task, store_decision |
| `packages/framework/agents/architect.md` | Architect | 1–2 | opus | store_document, link_documents, store_decision |
| `packages/framework/agents/product-strategist.md` | Product Strategist | 0–1 | opus | store_decision, create_task |
| `packages/framework/agents/plan-reviewer.md` | Plan Reviewer | — | opus | store_document, link_documents, update_task |
| `packages/framework/agents/executor.md` | Executor | 3 | sonnet | store_document, link_documents, update_task |
| `packages/framework/agents/validator.md` | Validator | — | sonnet | store_document, link_documents, update_task |
| `packages/framework/agents/integration-checker.md` | Integration Checker | — | sonnet | store_document, link_documents, update_task |
| `packages/framework/agents/debugger.md` | Debugger | — | sonnet | store_document, link_documents |
| `packages/framework/agents/researcher.md` | Researcher | — | sonnet | store_document, link_documents |
| `packages/framework/agents/codebase-analyst.md` | Codebase Analyst | — | sonnet | store_document, link_documents |
| `packages/framework/hooks/synapse-startup.js` | Hook | — | — | domain mode injection |

### Agent Frontmatter — Current vs Target

All 11 agents currently have YAML frontmatter with: `name`, `description`, `tools`, `skills` (some), `model`, `color`. None have `mcpServers`. The target adds one line:

```yaml
mcpServers: ["synapse"]
```

**Confirmed:** The Claude Code subagent frontmatter `mcpServers` field is the mechanism for granting MCP server access to spawned subagents. Without it, subagents start fresh and do NOT inherit the parent session's MCP connections. This was explicitly noted in STATE.md (GitHub issues #5465, #13605).

### Permitted Tools Per Agent (from agents.toml)

The executor received `store_document` and `link_documents` in Phase 18. Validator received the same. Plan-reviewer and integration-checker received them too. The following agents already have `store_document` + `link_documents`:

- executor (Phase 18 addition)
- validator (Phase 18 addition)
- plan-reviewer (Phase 18 addition)
- integration-checker (Phase 18 addition)
- debugger (already had them)
- researcher (already had them)
- architect (already had them)
- codebase-analyst (already had them)

The following agents do NOT have `store_document`:

- decomposer — stores decisions via `store_decision`, creates tasks via `create_task`. No `store_document`. Context_refs must be embedded in task descriptions or stored as `tags` + description JSON.
- product-strategist — no `store_document`. Context at this tier is strategic decisions, not documents.
- synapse-orchestrator — has `store_document`, `link_documents`, `query_documents`.

---

## Architecture Patterns

### Pattern 1: Shared MCP Header Section

Every agent gets this section inserted after `## Attribution` and before `## Core Behaviors` (or the first substantive section):

```markdown
## Synapse MCP as Single Source of Truth

Synapse stores project decisions and context. Query it first to avoid wasting tokens re-discovering what's already known.

**Principles:**
- Query Synapse for decisions, task specs, documents, and context before reading the filesystem for context
- Read/write source code via filesystem tools (Read, Write, Edit, Grep)
- Use search_code or get_smart_context to find code when location is unknown; go directly to filesystem when the handoff specifies file paths
- Write results back to Synapse at end of task — creates a complete audit trail

**Your Synapse tools:**
| Tool | Purpose | When to use |
|------|---------|-------------|
| {tool} | {purpose} | {when} |

**Error handling:**
- If a WRITE operation (store_document, update_task, create_task, store_decision) returns `success: false` or throws: HALT immediately. Report tool name and error message to orchestrator. Do not continue.
- If a READ operation (get_smart_context, query_decisions, search_code, check_precedent) returns empty or fails: add a "Warnings" section to your output document noting the failure. Continue with available information.
- If the very first MCP call fails with a connection error: HALT with "Synapse MCP server unreachable" message.
```

### Pattern 2: Agent-Specific Key Tool Sequences

Each agent gets its own "Key Tool Sequences" section with role-specific workflows. Executor and validator already have this section — it needs to be expanded with the new behaviors (context_refs fetch, document storage). Agents that currently lack the section (architect, product-strategist, plan-reviewer, integration-checker, decomposer, researcher, debugger, codebase-analyst) need it added.

### Pattern 3: Structured Handoff Block

The orchestrator's Task calls to subagents use this block format in the prompt:

```
--- SYNAPSE HANDOFF ---
project_id: {project_id}
task_id: {task_id}
hierarchy_level: {epic|feature|component|task}
rpev_stage_doc_id: rpev-stage-{task_id}
doc_ids: {comma-separated list or "none"}
decision_ids: {comma-separated list or "none"}
--- END HANDOFF ---
```

The orchestrator already has a partial version of this (the "Standard handoff template" section in orchestrator.md uses `## Synapse Context` header). Phase 19 replaces that with the structured block using `--- SYNAPSE HANDOFF ---` delimiters, and adds `hierarchy_level`, `doc_ids`, and `decision_ids` fields.

Subagent prompt instructions: "Parse the `--- SYNAPSE HANDOFF ---` block first. Use its values as inputs to your first MCP calls."

### Pattern 4: Context Refs Convention

**Critical finding:** `context_refs` is NOT a database column in the tasks table. The `create_task` schema has: `project_id`, `title`, `description`, `depth`, `parent_id`, `dependencies`, `priority`, `assigned_agent`, `estimated_effort`, `tags`, `phase`. There is no `context_refs` field.

**Implementation approach:** The decomposer embeds context refs in the task `description` field in a structured suffix block:

```
[task description and acceptance criteria]

---CONTEXT_REFS---
document_ids: [doc_abc123, doc_def456]
decision_ids: [dec_xyz789]
```

The orchestrator parses this block when building the handoff. Executor/validator receive `doc_ids` and `decision_ids` in the handoff block and call `get_smart_context(mode: "detailed", doc_ids: [...])` to fetch them.

This is a prompt convention — not a DB schema change. No server-side work needed.

### Pattern 5: Validator Findings-as-Document

**Current broken pattern (to be removed from validator.md):**
```
update_task(task_id, status: "failed", description: "VALIDATION FINDING: {full explanation}", actor: "validator")
```
This overwrites the task spec. The task description is the executor's input — overwriting it destroys the original spec.

**Correct pattern:**
```
# Step 1: Store findings as document
store_document(
  project_id: "{project_id}",
  doc_id: "validator-findings-{task_id}",
  title: "Validation Findings: {task_title}",
  category: "validation_report",
  status: "active",
  tags: "|validator|findings|{task_id}|",
  content: "## Findings\n{detailed findings}\n\n## Expected\n{spec requirement}\n\n## Found\n{actual}\n\n## Location\n{file:line}\n\n## Test Output\n{test output}",
  actor: "validator"
)

# Step 2: Link to task
link_documents(
  project_id: "{project_id}",
  from_id: "validator-findings-{task_id}",
  to_id: "{task_id}",
  relationship_type: "validates",
  actor: "validator"
)

# Step 3: Update status ONLY — no description change
update_task(
  project_id: "{project_id}",
  task_id: "{task_id}",
  status: "failed",
  actor: "validator"
)
```

### Pattern 6: Domain Mode Injection (AGENT-09)

`synapse-startup.js` already reads `trust.toml` and injects the RPEV involvement matrix. It does NOT currently inject the per-domain autonomy modes from `[domains]`. The fix adds a new section to `additionalContext`:

```javascript
// After rpevContext, add domainContext:
const domainContext = buildDomainModeContext(trustToml);
```

The hook reads `trustToml.domains` (which has: `architecture`, `dependencies`, `implementation`, `testing`, `documentation`, `product_strategy`) and formats it as:

```
## Domain Autonomy Modes (from trust.toml)

Your behavior adapts per domain:
  architecture: co-pilot
  dependencies: co-pilot
  implementation: autopilot
  testing: autopilot
  documentation: autopilot
  product_strategy: advisory

In co-pilot mode: propose first, wait for user approval before proceeding.
In autopilot mode: proceed without user involvement, report results.
In advisory mode: analyze and store proposal, flag for user review.
```

Agent prompts reference this injected context with: "Check the domain mode for this task's domain from your injected context. Adjust behavior per the Domain Autonomy Modes section."

### Pattern 7: Level-Aware Behavior Sections

**Full 4-level section** (for orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker):

```markdown
## Level-Aware Behavior

Your behavior adjusts based on `hierarchy_level` from the handoff block:

| Level | Scope | Context to Fetch | Decision Tier |
|-------|-------|-----------------|---------------|
| epic | Full capability delivery | Broad overview: project decisions, all features | Tier 0-1 |
| feature | Cohesive set of tasks | Feature-level decisions, related features | Tier 1-2 |
| component | Implementation grouping | Component decisions, sibling components | Tier 2 |
| task | Single implementation unit | Targeted: task spec + directly relevant decisions | Tier 3 |

At higher levels: fetch broader context (increase max_tokens to 8000+), surface cross-cutting concerns, make wider decisions.
At lower levels: use targeted context (max_tokens 2000-4000), focus on spec-following, avoid scope creep.
```

**Short 2-tier section** (for executor, validator, debugger, researcher, codebase-analyst):

```markdown
## Level Context

You operate at:
- **task level** (depth=3): single implementation unit — use targeted context (max_tokens 2000-4000)
- **feature level** (depth=1/2): cross-task analysis — use broader context (max_tokens 6000+), examine integration seams

The `hierarchy_level` field in the handoff block tells you which applies.
```

### Pattern 8: Executor and Validator Context Refs Fetch

The opening sequence for executor and validator becomes:

```markdown
## Task Start Protocol

1. Parse the `--- SYNAPSE HANDOFF ---` block to extract: project_id, task_id, hierarchy_level, rpev_stage_doc_id, doc_ids, decision_ids
2. `get_task_tree(project_id, task_id)` — load full task spec, acceptance criteria, and CONTEXT_REFS block from description
3. `get_smart_context(project_id, mode: "detailed", doc_ids: [doc_ids from handoff + doc_ids from CONTEXT_REFS])` — fetch curated context (no-op if refs are empty)
4. If doc_ids is empty: `get_smart_context(project_id, mode: "overview", max_tokens: 3000)` — fallback to overview
5. Proceed with implementation / validation using loaded context
```

### Recommended File Structure for Each Agent

Each modified agent file should have sections in this order:

1. Frontmatter (with `mcpServers: ["synapse"]` added)
2. `## Attribution` (existing)
3. `## Synapse MCP as Single Source of Truth` (NEW — shared template)
4. `## Level-Aware Behavior` or `## Level Context` (NEW)
5. `## Core Behaviors` / `## Core Responsibilities` (existing)
6. `## Key Tool Sequences` (existing or new — expanded/added)
7. Agent-specific sections (existing)
8. `## Constraints` (existing)
9. `## Example` / `## Examples` (existing)

### Anti-Patterns to Avoid

- **Validator writing findings into task description:** This overwrites the original spec, which the debugger needs for root-cause analysis. Always `store_document` for findings, `update_task` for status only.
- **Orchestrator passing full context in handoff:** Keep the handoff block small (IDs only). The subagent fetches its own context. Large handoffs bloat prompts and miss dynamic context.
- **Agents calling search_code to find files when paths are already known:** If the handoff or task spec says "modify `src/auth/jwt.ts`", go directly to filesystem. MCP search is for discovery, not navigation.
- **Using `update_task(description: ...)` to record findings:** This triggers semantic re-embedding and overwrites spec. Findings belong in documents.
- **Ignoring `success: false` on write operations:** Silent data loss. The agent must halt on write failures — continuing means producing output that was never persisted.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Storing agent output | Custom file-based logging | store_document + link_documents | Already in agents.toml; creates queryable audit trail |
| Context discovery | File tree walks in every agent | get_smart_context(mode: "overview") | Handles relevance ranking, token budgeting, 1-hop graph expansion |
| Document naming | Ad-hoc naming per agent | `{agent}-{type}-{task_id}` convention | Makes findings queryable by both agent and task |
| Error reporting | Custom error formats | Two-tier halt/warn protocol | Consistent behavior across 11 agents |
| Handoff format | Natural language context dumps | Structured SYNAPSE HANDOFF block | Parseable, auditable, compact |

---

## Common Pitfalls

### Pitfall 1: Validator Spec Destruction
**What goes wrong:** Validator calls `update_task(description: "VALIDATION FINDING: ...")` — overwrites the task spec with failure notes. When the debugger is spawned and tries to read the spec, it gets the validator's notes instead.
**Why it happens:** The current validator.md example shows `update_task` with description as the failure reporting mechanism.
**How to avoid:** Phase 19-03 must explicitly replace the existing validator example with the store_document pattern. The old example at line 34 and the "Fail Task" section must be replaced entirely.
**Warning signs:** Task description starts with "VALIDATION FINDING:" — this is the broken pattern.

### Pitfall 2: Missing mcpServers = Silently No MCP
**What goes wrong:** Subagent spawned via Task tool cannot call any `mcp__synapse__*` tools. No error is thrown — the tools simply aren't available. Agent tries to call `get_smart_context`, gets "tool not found" or similar, may silently skip MCP calls.
**Why it happens:** Claude Code requires `mcpServers: ["synapse"]` in agent frontmatter for MCP tool inheritance by subagents.
**How to avoid:** Plan 19-01 adds `mcpServers: ["synapse"]` to all 11 agents as its first action.
**Warning signs:** Subagent produces output without any MCP tool calls visible in logs.

### Pitfall 3: context_refs Convention vs DB Column Confusion
**What goes wrong:** Planner assumes `context_refs` is a DB field and tries to call `create_task(context_refs: [...])`. The schema does not have this field — the call will succeed but silently ignore the unknown parameter (Zod `.passthrough()` or similar) or fail with parse error.
**Why it happens:** The orchestrator.md and pev-workflow.md reference `context_refs` as if it's a first-class task property, but the `create_task` and `update_task` schemas have no such column.
**How to avoid:** Context_refs is embedded as a structured suffix block in the task description. The CONTEXT_REFS section (between `---CONTEXT_REFS---` delimiters) is a convention that the orchestrator parses when building handoffs.
**Warning signs:** Task descriptions missing the CONTEXT_REFS block, or executor/validator receiving empty doc_ids when they should have curated context.

### Pitfall 4: Section Ordering Disrupts Existing Prompt Flow
**What goes wrong:** Inserting new sections in the wrong position breaks the agent's behavioral contract. E.g., inserting MCP section after "## Example" means the agent may not see it until after it's already taken action.
**Why it happens:** Agent prompts are processed top-to-bottom; early sections set behavioral context.
**How to avoid:** Follow the recommended section order: Attribution → Synapse MCP header → Level Context → Core Behaviors → Tool Sequences → Constraints → Examples.

### Pitfall 5: Domain Mode Not Referenced in Agent Prompts
**What goes wrong:** synapse-startup.js injects domain modes into additionalContext, but agents don't know to look for it. The injection is wasted.
**Why it happens:** Hook injection without corresponding agent-side instructions.
**How to avoid:** Every agent that makes discretionary decisions (architect, product-strategist, orchestrator, decomposer) must have an explicit sentence: "Check your injected context for Domain Autonomy Modes and adjust your interaction style per the current domain."

---

## Code Examples

### mcpServers Frontmatter Addition (all 11 agents)

```yaml
---
name: executor
description: Implements leaf tasks (depth=3). ...
tools: Read, Write, Edit, Bash, Glob, Grep, mcp__synapse__get_task_tree, ...
skills: [typescript, bun]
model: sonnet
color: green
mcpServers: ["synapse"]
---
```

### Shared MCP Header Section (verbatim template)

```markdown
## Synapse MCP as Single Source of Truth

Synapse stores project decisions and context. Query it first to avoid wasting tokens re-discovering what's already known.

**Principles:**
- Fetch context from Synapse (get_smart_context, query_decisions, get_task_tree) before reading filesystem for project context
- Read and write source code via filesystem tools (Read, Write, Edit, Bash, Glob, Grep)
- Use search_code or get_smart_context when file locations are unknown; go straight to filesystem when paths are specified in the task spec or handoff
- Write findings and summaries back to Synapse at end of task — builds the audit trail

**Your Synapse tools:**
| Tool | Purpose | When to use |
|------|---------|-------------|
| get_smart_context | Fetch decisions, docs, and code context | Start of every task; use mode="detailed" with doc_ids for curated context |
| get_task_tree | Load task spec and subtasks | Start of every task to read the spec |
| ... | ... | ... |

**Error handling:**
- WRITE failure (store_document, update_task, create_task, store_decision returns success: false): HALT. Report tool name + error message to orchestrator. Do not continue.
- READ failure (get_smart_context, query_decisions, search_code returns empty or errors): Note in a "Warnings" section of your output document. Continue with available information.
- Connection error on first MCP call: HALT with message "Synapse MCP server unreachable — cannot proceed without data access."
```

### Domain Mode Injection — synapse-startup.js Addition

```javascript
// Add after rpevContext is built, before contextParts assembly:
let domainContext = "";
if (trustToml && trustToml.domains) {
  const domains = trustToml.domains;
  const domainLines = [
    "",
    "## Domain Autonomy Modes (from trust.toml)",
    "",
    "Your behavior adapts per domain. Current configuration:",
  ];
  for (const [domain, mode] of Object.entries(domains)) {
    domainLines.push(`  ${domain}: ${mode}`);
  }
  domainLines.push(
    "",
    "In co-pilot mode: propose first, wait for user approval.",
    "In autopilot mode: proceed without user involvement, report results.",
    "In advisory mode: store analysis as proposal, flag for user review.",
  );
  domainContext = domainLines.join("\n");
}

// Then add to contextParts:
if (domainContext) {
  contextParts.push(domainContext);
}
```

### Decomposer: Embedding Context Refs in Task Description

```markdown
## Decomposition Protocol (updated)

### Step 5: Attach Context Refs to Leaf Tasks

After calling get_smart_context and query_decisions during decomposition, attach the relevant IDs to each leaf task's description:

```
create_task({
  project_id: "{project_id}",
  title: "Implement JWT signing utility",
  depth: 3,
  parent_id: "{feature_id}",
  description: "Create signToken(payload) function using jose library, RS256, 15-min TTL.\n\nAcceptance criteria:\n- signToken() exported from src/auth/jwt.ts\n- RS256 algorithm per decision D-47\n- 15-minute TTL\n- Tests in test/auth/jwt.test.ts\n\n---CONTEXT_REFS---\ndocument_ids: [rpev-stage-{feature_id}]\ndecision_ids: [D-47]\n---END_CONTEXT_REFS---",
  actor: "decomposer"
})
```

The orchestrator parses `---CONTEXT_REFS---` blocks when building executor handoffs.
```

### Executor Summary Document Pattern

```markdown
After implementation, store a summary before marking the task done:

```
store_document({
  project_id: "{project_id}",
  doc_id: "executor-summary-{task_id}",
  title: "Implementation Summary: {task_title}",
  category: "implementation_note",
  status: "active",
  tags: "|executor|summary|{task_id}|",
  content: "## What was implemented\n{summary}\n\n## Files changed\n- {file}: {what changed}\n\n## Decisions made\n- {any Tier 3 decisions stored}\n\n## Warnings\n{any MCP read failures noted here}",
  actor: "executor"
})

link_documents({
  project_id: "{project_id}",
  from_id: "executor-summary-{task_id}",
  to_id: "{task_id}",
  relationship_type: "implements",
  actor: "executor"
})
```

Then: update_task(status: "done", actor: "executor") — status only, no description change.
```

### Orchestrator: Updated Subagent Handoff Block

Replace the existing `## Synapse Context` template in orchestrator.md with:

```markdown
## Subagent Handoff Protocol

Every Task tool call MUST include the SYNAPSE HANDOFF block in the prompt:

```
--- SYNAPSE HANDOFF ---
project_id: {project_id from session context}
task_id: {task.id}
hierarchy_level: {epic|feature|component|task}
rpev_stage_doc_id: rpev-stage-{task_id}
doc_ids: {comma-separated from task.description CONTEXT_REFS block, or "none"}
decision_ids: {comma-separated from task.description CONTEXT_REFS block, or "none"}
--- END SYNAPSE HANDOFF ---
```

Parse the CONTEXT_REFS block from the task description before building this handoff. Example:

```javascript
// Extract context_refs from task description
const ctxMatch = task.description.match(/---CONTEXT_REFS---([\s\S]*?)---END_CONTEXT_REFS---/);
const docIds = ctxMatch ? ctxMatch[1].match(/document_ids:\s*\[([^\]]*)\]/)?.[1] ?? "none" : "none";
const decIds = ctxMatch ? ctxMatch[1].match(/decision_ids:\s*\[([^\]]*)\]/)?.[1] ?? "none" : "none";
```
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| update_task(description: "VALIDATION FINDING:...") | store_document + link + update_task(status: "failed") | Phase 19 | Preserves task spec for debugger; finding is queryable by doc_id |
| Hardcoded "## Synapse Context" handoff template | --- SYNAPSE HANDOFF --- structured block | Phase 19 | Consistently parseable by agent prompt; auditable delimiter |
| Agents that silently have no MCP access | mcpServers: ["synapse"] in frontmatter | Phase 19 | Subagents reliably receive MCP tool access |
| context_refs passed verbally in handoff | Structured CONTEXT_REFS block in task description | Phase 19 | Decomposer sets once; executor/validator read from task; no drift |

**Deprecated/outdated patterns:**
- "Fail Task" in validator.md (current): uses `update_task` with description as failure report — REPLACE entirely
- "Standard handoff template" in orchestrator.md (current): uses `## Synapse Context` header — REPLACE with structured block
- validator.md Step 3 verdict section: currently writes to task description on fail — REWRITE to store_document pattern

---

## Open Questions

1. **Does `link_documents` accept task IDs as `to_id`?**
   - What we know: `link_documents` accepts `from_id` and `to_id` as document IDs. The documents table and tasks table are separate.
   - What's unclear: Can a document be linked to a task_id, or must the link target be a doc_id? The schema uses ULIDs for tasks and custom doc_ids for documents.
   - Recommendation: Check `link-documents.ts` to confirm cross-table linking. If tasks can't be direct link targets, use a tag convention (`|task-{task_id}|`) as the lookup mechanism instead. LOW risk — debugger.md already shows `link_documents` used to "connect to the failing task", suggesting it works.

2. **get_smart_context mode: "detailed" with doc_ids — does it accept task_ids?**
   - What we know: `get_smart_context` takes `doc_ids: string[]`. The schema shows it queries the documents table.
   - What's unclear: If a context_refs block has a task_id (not a doc_id), will `get_smart_context(mode: "detailed", doc_ids: [task_id])` work or silently return empty?
   - Recommendation: Context refs should only contain doc_ids and decision_ids, not task_ids. The `get_task_tree` call handles task context separately.

---

## Validation Architecture

> workflow.nyquist_validation is not set in .planning/config.json — skipping this section.

---

## Sources

### Primary (HIGH confidence)

- Direct file reads: all 11 agent .md files in `packages/framework/agents/` — current structure, section placement, tool lists
- `packages/framework/config/agents.toml` — confirmed tool permissions per agent (especially Phase 18 additions)
- `packages/framework/hooks/synapse-startup.js` — confirmed domain mode NOT yet injected; project_id injection pattern understood
- `packages/server/src/tools/create-task.ts` — confirmed `context_refs` is NOT a DB column; task schema fully reviewed
- `packages/server/src/tools/update-task.ts` — confirmed `description` field overwrites; no findings-safe field exists
- `packages/server/src/tools/store-document.ts` — confirmed `doc_id` reuse pattern for versioning
- `packages/server/src/tools/get-smart-context.ts` — confirmed `doc_ids` parameter accepts string arrays
- `.planning/phases/19-agent-prompts-level-awareness/19-CONTEXT.md` — all locked decisions read verbatim
- `.planning/STATE.md` — mcpServers frontmatter importance confirmed (GitHub issues #5465, #13605)
- `packages/framework/config/trust.toml` — confirmed `[domains]` section structure for domain mode injection

### Secondary (MEDIUM confidence)

- `packages/framework/workflows/pev-workflow.md` — context_refs usage pattern (description-embedded convention)
- Claude Code documentation pattern: mcpServers frontmatter field is the established mechanism for subagent MCP inheritance

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all agent files directly inspected; tool permissions verified in agents.toml
- Architecture patterns: HIGH — based on direct code inspection; no speculation
- Pitfalls: HIGH — Pitfall 1 (validator spec destruction) found in actual current code; Pitfall 2 confirmed in STATE.md

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain — agent markdown files change infrequently)
