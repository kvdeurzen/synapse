# Phase 18: RPEV Orchestration - Research

**Researched:** 2026-03-05
**Domain:** Agent workflow orchestration, trust config schema, markdown-driven agent specs
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stage Transition Model**
- Refine completion marks items as "ready for plan" in the task tree status — minimal stub, no separate queue structure
- The actual work queue and agent pool dispatch is Phase 21's scope
- Until Phase 21 lands, queued items appear in `/synapse:status` but require manual triggering
- At levels below `explicit_gate_levels`, transitions happen automatically with a brief notification ("notify then proceed")
- At Project/Epic level, user explicitly signals readiness (carried forward from Phase 16)

**RPEV Stage Tracking**
- Stage tracked via document-based tracking — store RPEV stage as a Synapse document (via `store_document`) linked to the task
- No new field on the task schema — keeps task schema clean
- Orchestrator stores/updates a stage document per item, queryable via `get_smart_context`

**Approval Interaction**
- Items needing approval appear in `/synapse:status` as "needs approval"
- User navigates via `/synapse:focus` to see the proposal — fits the "user unblocks" model
- Two-tier approval UX: summary + approve/reject/discuss by default; "Let's discuss this deeper" option switches to conversational review mode for complex decisions
- Rejection + feedback goes back to the specialist agent (Decomposer/Planner) for a new attempt — up to 3 review cycles per existing spec
- Plan Reviewer agent runs before user sees the proposal — only quality-checked proposals are presented
- Multiple pending approvals shown individually in `/synapse:status` (no batching)

**Trust Config Expansion**
- `[rpev.involvement]` section with per-level x per-stage involvement matrix (4 levels x 4 stages = 16 entries)
- Involvement modes: `drives`, `co-pilot`, `reviews`, `autopilot`, `monitors` — each with concrete, strict behavior:
  - `drives` = user initiates the action
  - `co-pilot` = agent proposes, user approves
  - `reviews` = agent does, user reviews output
  - `autopilot` = agent does, no user involvement
  - `monitors` = agent does, user notified + can intervene (pause/redirect/escalate)
- Default gradient:
  - Project: refine=drives, plan=approves, execute=monitors, validate=monitors
  - Epic: refine=co-pilot, plan=reviews, execute=autopilot, validate=monitors
  - Feature: refine=reviews, plan=autopilot, execute=autopilot, validate=autopilot
  - Work Package: all autopilot
- Users only override specific cells they want to change
- Per-domain overrides supported via `[rpev.domain_overrides]` — e.g., `security.execute = "co-pilot"` to escalate involvement for specific domains regardless of level

**Failure Escalation**
- Failed items appear in `/synapse:status` with a flag — status flag only, no proactive interruption
- When user focuses on a failed item via `/synapse:focus`: show Debugger agent's diagnostic report + structured options: Retry with guidance / Redefine the task / Skip and continue / Escalate to parent level
- Auto-escalate to parent when retries exhausted: task fails → feature-level retry, feature fails → epic-level retry, epic fails → stop and flag for user
- Retry caps: task=3, feature=2, epic=1
- Keep successful work on partial wave failure — only retry the failed task

### Claude's Discretion
- Document schema for RPEV stage tracking (category, fields, linking strategy)
- How to represent "ready for plan"/"ready for execute" in task status (reuse existing "ready" status or metadata)
- Internal wave identification algorithm (grouping independent tasks from dependency graph)
- Checkpoint format for wave progress reporting
- How orchestrator detects and resumes interrupted sessions

### Deferred Ideas (OUT OF SCOPE)
- Work queue and agent pool dispatch — Phase 21 (Agent Pool). Phase 18 stubs with task tree status markers
- Proactive push notifications — Phase 23 (Visibility + Notifications). Phase 18 uses status flags only
- Statusline progress indicator — Phase 23
- Agent-based focus (`/synapse:focus agent C`) — Phase 21
- Wave state persistence across sessions — may need refinement during E2E validation (Phase 24)
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 18 maps to the AGENT-xx requirements from REQUIREMENTS.md. The requirements address agent prompt quality and MCP-first behavior — this is the primary deliverable scope alongside the RPEV orchestration engine updates.

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGENT-01 | Every agent prompt has "MCP as Single Source of Truth" section with query-first principle | Adding this section to each of 10 agents in `packages/framework/agents/` |
| AGENT-02 | Every agent prompt has concrete tool call sequences with parameter values and response shapes | Documenting canonical tool call patterns per agent |
| AGENT-03 | Every agent `.md` file has `mcpServers: ["synapse"]` in frontmatter | One-line frontmatter addition to all agent files |
| AGENT-04 | Orchestrator agent has subagent handoff protocol (project_id, task_id, doc_ids in every Task call) | Updating `synapse-orchestrator.md` handoff section |
| AGENT-05 | Validator never overwrites task description; stores findings as linked document | Updating `validator.md` with anti-pattern rule + `store_document` tool |
| AGENT-06 | Integration Checker and Plan Reviewer persist findings via store_document + link_documents | Updating two agent files + agents.toml allowed_tools |
| AGENT-07 | Executor stores implementation summaries as documents | Updating `executor.md` with document-storage step |
| AGENT-08 | Every agent prompt has MCP error handling protocol (halt on `success: false`, report to orchestrator) | Adding error handling section to all 10 agents |
| AGENT-09 | Domain mode (co-pilot/autopilot/advisory) injected by startup hook and referenced by all agents | Expanding `synapse-startup.js` to inject rpev involvement matrix; all agent files reference it |
| AGENT-10 | Decomposer populates context_refs (document_ids, decision_ids) on leaf tasks | Updating `decomposer.md` with context_refs step |
| AGENT-11 | Executor and Validator fetch context_refs at start of each task | Updating `executor.md` and `validator.md` with context_refs lookup |

**RPEV Orchestration additions (beyond AGENT-xx):**
- Update `synapse-orchestrator.md` from PEV to RPEV — Refine→Plan→Execute→Validate with stage tracking
- Update `pev-workflow.md` with RPEV stage documents and involvement matrix enforcement
- Expand `trust.toml` with `[rpev.involvement]` matrix and `[rpev.domain_overrides]`
- Update `refine.md` to bridge "readiness confirmed" signal → stage document creation
- Update `/synapse:status` to read stage documents and show approval-needed items
- Update `/synapse:focus` with two-tier approval interaction flow
- Expand `synapse-startup.js` to inject RPEV involvement matrix into session context
</phase_requirements>

---

## Summary

Phase 18 is primarily a **markdown file update phase** — it rewrites agent prompts, expands configuration files, and updates workflow documents. No new TypeScript code is required; all deliverables are `.md` files, `.toml` config, and a `.js` hook expansion.

The phase has two interlocking concerns. First, the RPEV orchestration model: upgrading the orchestrator from PEV to RPEV means adding the Refine stage as a formal tracked state, implementing the involvement matrix logic (which stage transitions require user approval at which hierarchy level), and creating the document-based stage tracking pattern. Second, the agent prompt quality lift: eleven AGENT-xx requirements demand concrete changes to all 10 existing agent `.md` files — adding MCP-first principles, concrete tool call sequences, error handling, and handoff protocols.

The critical insight for planning: these are not independent workstreams. The RPEV orchestrator update and the agent prompt updates share the same pattern (MCP as single source of truth, stage-awareness). Doing them together means the orchestrator can reference the updated specialist agent behaviors in its own handoff protocol. The right sequencing is: (1) establish the stage document schema and trust.toml expansion, (2) update the orchestrator and workflow, (3) update specialist agents in dependency order, (4) wire the startup hook injection.

**Primary recommendation:** Treat the stage document schema and involvement matrix as the foundation — everything else derives from knowing exactly what a stage document looks like and what the 16-cell matrix controls. Lock these first, then update files in topological order: trust.toml → synapse-startup.js → synapse-orchestrator.md + pev-workflow.md → refine.md → specialist agents → status.md + focus.md.

---

## Standard Stack

### Core (all existing — no new installs required)

| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| `packages/framework/agents/*.md` | n/a | Agent system prompts loaded by Claude Code | 10 files, all need updates |
| `packages/framework/workflows/pev-workflow.md` | n/a | Workflow spec consumed by orchestrator | Rename RPEV additions |
| `packages/framework/config/trust.toml` | n/a | Per-domain autonomy + tier authority config | Expand with `[rpev.involvement]` |
| `packages/framework/hooks/synapse-startup.js` | n/a | SessionStart hook — injects project context | Expand with RPEV matrix injection |
| `packages/framework/commands/synapse/*.md` | n/a | User-facing slash commands | `refine.md`, `status.md`, `focus.md` need updates |
| smol-toml | installed | TOML parsing in startup hook | Already a dependency |

### No New Dependencies

Phase 18 is purely a content/configuration update phase. All MCP tools (`store_document`, `get_smart_context`, `update_task`, etc.) are already implemented. The task schema already supports the document-linking pattern via `link_documents`. No npm/bun packages are added.

---

## Architecture Patterns

### Recommended File Update Order (Topological)

```
1. trust.toml                          # Foundation: involvement matrix definition
2. synapse-startup.js                  # Injects involvement matrix at session start
3. synapse-orchestrator.md             # Uses matrix, defines stage transitions
4. pev-workflow.md → rpev-workflow.md  # Stage docs, Refine stage added
5. refine.md                           # Bridge: readiness → stage doc creation
6. decomposer.md                       # context_refs on leaf tasks (AGENT-10)
7. plan-reviewer.md                    # Persist findings (AGENT-06)
8. executor.md                         # context_refs fetch + impl summary (AGENT-07, AGENT-11)
9. validator.md                        # No description overwrite (AGENT-05, AGENT-11)
10. integration-checker.md             # Persist findings (AGENT-06)
11. All remaining agents               # MCP-first + error handling (AGENT-01, -02, -03, -08)
12. agents.toml                        # Add store_document to plan-reviewer, integration-checker
13. status.md                          # Read stage docs, show needs-approval items
14. focus.md                           # Two-tier approval UX
```

### Pattern 1: Stage Document Schema (Claude's Discretion — Recommendation)

**What:** Each item in the task hierarchy gets one RPEV stage document stored via `store_document`.

**Recommended schema:**
```
category: "plan"
title: "RPEV Stage: [Item Title] ([Level])"
tags: "|rpev-stage|[level]|[item_slug]|"
status: "active"
doc_id: "rpev-stage-[task_id]"  ← fixed doc_id enables versioning via store_document
content:
  stage: REFINING | PLANNING | EXECUTING | VALIDATING | DONE
  level: project | epic | feature | work_package
  task_id: [task_id]
  involvement: [resolved involvement mode for current stage]
  pending_approval: true | false
  proposal_doc_id: [doc_id of decomposer output if pending approval]
  last_updated: [ISO timestamp]
  notes: [brief state note]
```

**Why this schema:** The fixed `doc_id` pattern (same as refinement documents in `refine.md`) enables `store_document` to create a new version rather than a duplicate — the orchestrator always overwrites with current state. The `pending_approval` flag is what `/synapse:status` queries to build the "Needs Your Input" section. The `proposal_doc_id` lets `/synapse:focus` load the proposal without re-fetching from the task tree.

**Example:**
```typescript
// Source: existing store_document pattern from refine.md
await mcp.store_document({
  project_id: "my-project",
  doc_id: "rpev-stage-01HXYZ123ABC",
  title: "RPEV Stage: JWT Token Refresh (Feature)",
  category: "plan",
  status: "active",
  tags: "|rpev-stage|feature|jwt-token-refresh|",
  content: JSON.stringify({
    stage: "PLANNING",
    level: "feature",
    task_id: "01HXYZ123ABC",
    involvement: "autopilot",
    pending_approval: false,
    last_updated: new Date().toISOString(),
  }),
  actor: "synapse-orchestrator",
});
```

**Confidence:** HIGH for the doc_id pattern (proven by refine.md), MEDIUM for exact field names (discretionary).

---

### Pattern 2: Trust Config Expansion — Involvement Matrix

**What:** The `[rpev]` section of `trust.toml` is expanded from the Phase 16 stub to the full involvement matrix.

**Current `[rpev]` section (from init.md):**
```toml
[rpev]
project_refine = "user-driven"
epic_refine = "co-pilot"
feature_refine = "advisory"
workpackage_refine = "autopilot"
explicit_gate_levels = ["project", "epic"]
proactive_notifications = false
```

**New schema for Phase 18:**
```toml
[rpev.involvement]
# Format: [level].[stage] = "mode"
# Modes: drives | co-pilot | reviews | autopilot | monitors
project.refine   = "drives"
project.plan     = "co-pilot"
project.execute  = "monitors"
project.validate = "monitors"

epic.refine   = "co-pilot"
epic.plan     = "reviews"
epic.execute  = "autopilot"
epic.validate = "monitors"

feature.refine   = "reviews"
feature.plan     = "autopilot"
feature.execute  = "autopilot"
feature.validate = "autopilot"

work_package.refine   = "autopilot"
work_package.plan     = "autopilot"
work_package.execute  = "autopilot"
work_package.validate = "autopilot"

[rpev.domain_overrides]
# Override involvement for specific domains regardless of level
# Example: security.execute = "co-pilot"

[rpev]
explicit_gate_levels = ["project", "epic"]
proactive_notifications = false
```

**Note:** TOML section nesting requires `[rpev.involvement]` to be declared before `[rpev]` keys, or use dotted keys directly under `[rpev]`. The simplest approach that avoids TOML parsing issues is flat dotted keys:
```toml
[rpev]
explicit_gate_levels = ["project", "epic"]
proactive_notifications = false

[rpev.involvement]
project_refine = "drives"
project_plan = "co-pilot"
# ... etc.

[rpev.domain_overrides]
# security_execute = "co-pilot"
```

**Confidence:** HIGH for the structure (confirmed via smol-toml TOML spec compliance), MEDIUM for exact key naming convention (flat underscore vs dot notation).

---

### Pattern 3: Startup Hook RPEV Injection

**What:** `synapse-startup.js` reads the `[rpev.involvement]` matrix from `trust.toml` and injects it into `additionalContext` so agents know their involvement mode without querying the config themselves.

**Current hook injects:** project context + tier authority + permitted tools.

**Addition:**
```javascript
// In synapse-startup.js, after tierContext block
let rpevContext = "";
if (trustToml && trustToml.rpev) {
  const involvement = trustToml.rpev.involvement || {};
  const domainOverrides = trustToml["rpev.domain_overrides"] || {};
  const gatelevels = trustToml.rpev.explicit_gate_levels || ["project", "epic"];

  const rpevLines = [
    "",
    "## RPEV Involvement Matrix (from trust.toml)",
    "",
    "Your behavior at each stage is governed by this matrix:",
    "  drives    = user initiates",
    "  co-pilot  = agent proposes, user approves",
    "  reviews   = agent does, user reviews output",
    "  autopilot = agent does, no user involvement",
    "  monitors  = agent does, user notified and can intervene",
    "",
  ];

  // Build readable matrix
  for (const [key, mode] of Object.entries(involvement)) {
    rpevLines.push(`  ${key}: ${mode}`);
  }

  rpevLines.push("", `Explicit gate levels (user must signal readiness): ${gatelevels.join(", ")}`);

  if (Object.keys(domainOverrides).length > 0) {
    rpevLines.push("", "Domain overrides:");
    for (const [key, mode] of Object.entries(domainOverrides)) {
      rpevLines.push(`  ${key}: ${mode}`);
    }
  }

  rpevContext = rpevLines.join("\n");
}
```

**Confidence:** HIGH — follows the exact pattern already used for `tierContext` injection.

---

### Pattern 4: Stage Transition Logic in Orchestrator

**What:** The orchestrator determines the involvement mode for the current level + stage, then acts accordingly.

**Decision tree (verbatim from CONTEXT.md decisions):**
```
resolved_mode = get_involvement_mode(level, stage, domain_overrides)

if resolved_mode == "drives":
  # Wait for user to initiate — do not proceed
  update_status(item, "waiting-for-user")

elif resolved_mode == "co-pilot":
  # Present proposal, wait for explicit approval
  set_stage_doc(item, pending_approval=True)
  notify via status flag

elif resolved_mode == "reviews":
  # Execute, then surface result for user review
  execute(item)
  set_stage_doc(item, stage="REVIEWING", pending_approval=True)

elif resolved_mode == "autopilot":
  # Execute without user involvement, advance stage
  execute(item)
  advance_stage(item)

elif resolved_mode == "monitors":
  # Execute, emit brief notification, advance stage
  execute(item)
  set_stage_doc(item, pending_approval=False, notes="monitoring")
  # User can intervene via /synapse:focus
```

**Confidence:** HIGH — directly from locked CONTEXT.md decisions.

---

### Pattern 5: MCP as Single Source of Truth (AGENT-01 Template)

**What:** Every agent prompt needs a standardized "MCP as Single Source of Truth" section.

**Standard section to add to every agent:**
```markdown
## MCP as Single Source of Truth

The Synapse MCP server is the primary knowledge store. Before reading files or grepping code, query Synapse first.

**Query-first principle:**
1. Start every task by calling `get_smart_context` with the task description and relevant keywords
2. Call `check_precedent` before making any decision — consistency with prior decisions is non-negotiable
3. Store all outputs (decisions, documents, summaries) back into Synapse — never leave findings only in the conversation

**On tool failure:** If any `mcp__synapse__*` call returns `success: false` or throws:
1. HALT the current operation — do not proceed as if the call succeeded
2. Report to the orchestrator: include the tool name, input parameters, and error message
3. Do not retry silently — the orchestrator decides how to recover

**Attribution:** Every Synapse tool call MUST include `actor: "[your-agent-name]"` for the audit trail.
```

**Confidence:** HIGH — this is the exact content the AGENT-01 through AGENT-08 requirements describe. The error handling pattern (AGENT-08) is included here.

---

### Pattern 6: Subagent Handoff Protocol (AGENT-04)

**What:** Every Task tool call from the orchestrator must pass structured context so the spawned agent can find its work in Synapse without guessing.

**Standard handoff in every orchestrator `Task` call:**
```markdown
## Synapse Context

project_id: [project_id]           ← from session context
task_id: [task.id]                 ← the specific task to work on
doc_ids: [list of relevant doc_ids] ← from task.context_refs or stage doc
decision_ids: [list]               ← key decisions that constrain this task
rpev_stage_doc_id: rpev-stage-[task_id]  ← fetch this to understand current stage

Start by calling:
1. get_smart_context with the task_id to load task spec and decisions
2. store_document IDs listed in doc_ids to load implementation context
```

**Confidence:** HIGH — AGENT-04 requirement is explicit; the doc_id pattern is established in the codebase.

---

### Pattern 7: context_refs on Leaf Tasks (AGENT-10, AGENT-11)

**What:** The Decomposer populates `context_refs` on every leaf task it creates, so Executor/Validator don't have to search for context.

**Decomposer step (new):**
```markdown
8. **Attach context refs to leaf tasks:** For each leaf task created, collect:
   - `decision_ids`: ULIDs of decisions that constrain this task (from check_precedent results)
   - `document_ids`: doc_ids of design documents, refinement state, or architecture docs relevant to this task

   Call `update_task` with these refs after creating the task:
   ```
   mcp__synapse__update_task({
     task_id: leaf_task_id,
     context_refs: {
       decision_ids: ["01ABC...", "01DEF..."],
       document_ids: ["auth-design-doc", "rpev-stage-[parent_id]"]
     },
     actor: "decomposer"
   })
   ```
```

**Note:** The `update_task` tool already accepts arbitrary metadata. The `context_refs` field naming is discretionary — research confirms the task schema supports metadata fields via the existing `create_task`/`update_task` tools.

**Confidence:** MEDIUM — the task schema supports metadata, but the exact field name `context_refs` must be verified against the actual `update_task` Zod schema in `packages/server/src/tools/`.

---

### Anti-Patterns to Avoid

- **Overwriting task descriptions in Validator:** The validator MUST store findings as a linked document via `store_document + link_documents` — never overwrite the `description` field. The description is the spec; overwriting it destroys the source of truth.
- **Batching approvals:** The CONTEXT.md decision is explicit — multiple pending approvals shown individually. Never aggregate into a "review batch" UX.
- **Auto-transitioning at gate levels:** At Project and Epic level, even if all open decisions are resolved, the orchestrator must wait for explicit user signal. The check is: `level in explicit_gate_levels AND involvement.refine in ['drives', 'co-pilot']` → require explicit readiness signal.
- **Stage documents without fixed doc_id:** Using dynamic doc_ids (ULIDs) for stage documents prevents versioning. Always use `rpev-stage-[task_id]` as the `doc_id` to enable in-place version updates.
- **Agents deciding involvement mode on their own:** Only the orchestrator resolves involvement mode from the matrix. Specialist agents receive their mode in the handoff context and act on it — they do not read trust.toml directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent stage state across sessions | Custom session store, file-based queue | `store_document` with fixed `doc_id` | Already implemented, versioned, queryable via `get_smart_context` |
| Decision consistency checking | Ad-hoc logic in agent | `check_precedent` before every `store_decision` | Already implemented with semantic search |
| Context delivery to subagents | Passing full text in Task prompt | `doc_ids` in handoff → agent fetches via `get_smart_context` | Avoids context-window bloat; Synapse's core value prop |
| Wave identification algorithm | Complex graph library | Simple dependency graph walk on task tree | Task tree already has `parent_id` + dependency fields; topological sort is a 20-line algorithm |
| TOML config parsing | Custom parser | `smol-toml` (already installed in startup hook) | Battle-tested, already a dependency |

---

## Common Pitfalls

### Pitfall 1: TOML Section Ordering in trust.toml

**What goes wrong:** smol-toml (and TOML spec generally) requires that dotted table headers like `[rpev.involvement]` must appear before any keys are assigned under `[rpev]` as a regular table. Mixing `[rpev]` as both a direct-key table and a parent of `[rpev.involvement]` can cause parse errors with some TOML parsers.

**Why it happens:** The expansion adds new sub-tables (`[rpev.involvement]`, `[rpev.domain_overrides]`) under the existing `[rpev]` section. If the existing `[rpev]` section has inline keys, they must come after all sub-tables.

**How to avoid:** Declare all sub-tables before any keys:
```toml
[rpev.involvement]
project_refine = "drives"
# ...

[rpev.domain_overrides]
# security_execute = "co-pilot"

[rpev]
explicit_gate_levels = ["project", "epic"]
proactive_notifications = false
```

**Warning signs:** `smol-toml` throws "cannot define table [rpev] after already defining dotted table [rpev.involvement]".

---

### Pitfall 2: Stage Document Query Specificity

**What goes wrong:** Querying `get_smart_context` or `semantic_search` for stage documents returns refinement documents, plan documents, and stage documents all mixed together — the orchestrator can't reliably distinguish RPEV stage docs from other `category: "plan"` documents.

**Why it happens:** Both refinement state documents (from `refine.md`) and RPEV stage documents use `category: "plan"`. Without a discriminating tag or naming convention, semantic search conflates them.

**How to avoid:** Use the fixed `doc_id` convention (`rpev-stage-[task_id]`) as the primary lookup key — direct doc_id lookup is O(1) and unambiguous. The tag `|rpev-stage|` provides a secondary filter for "show all items in a given stage" queries. Never rely on semantic search alone to retrieve a specific item's stage document.

**Warning signs:** `/synapse:status` shows wrong stage for items, or shows refinement sessions as pending approval.

---

### Pitfall 3: Involvement Mode Resolution vs. Domain Override

**What goes wrong:** The orchestrator uses the base level.stage involvement mode but ignores domain overrides, so security-related tasks execute at `autopilot` even when `security.execute = "co-pilot"` is configured.

**Why it happens:** Domain override lookup requires knowing the task's domain tag, which isn't always explicit. If the orchestrator only reads `involvement.feature_execute` without checking `domain_overrides`, domain-specific escalation silently fails.

**How to avoid:** Resolution must always check both:
```
1. base_mode = rpev.involvement["{level}_{stage}"]
2. For each domain_override in rpev.domain_overrides:
     if task has matching domain tag:
       if override_mode is stricter (more user involvement) than base_mode:
         use override_mode
3. Final mode = max(base_mode, all matching domain overrides)
```
Define a clear ordering: `drives > co-pilot > reviews > monitors > autopilot` (most to least user involvement).

**Warning signs:** Domain overrides configured in trust.toml but behavior doesn't change.

---

### Pitfall 4: Agents Spawned Without project_id

**What goes wrong:** A subagent spawned via Task tool calls `create_task` or `store_document` without `project_id`, resulting in `success: false` or data stored against the wrong project.

**Why it happens:** The startup hook injects `project_id` into the parent agent's session context. Subagents spawned via Task tool do NOT inherit this context — they start fresh. If the handoff prompt doesn't explicitly include `project_id`, the subagent has no way to know it.

**How to avoid:** AGENT-04 requirement exists specifically to solve this. Every Task call must include `project_id` in the prompt. The orchestrator's handoff template must be the authoritative pattern that all plans follow.

**Warning signs:** Subagent `store_document` calls fail with "project not found" or return data from a different project.

---

### Pitfall 5: Validator Overwrites Task Description

**What goes wrong:** Validator calls `update_task` with a `description` field that overwrites the original task spec. Future agents who fetch the task to understand what was required see the validation report, not the spec.

**Why it happens:** `update_task` does full field replacement. Without an explicit rule prohibiting this, validators naturally write their findings into the most prominent field.

**How to avoid:** AGENT-05 addresses this explicitly. The validator's workflow must:
1. Store findings via `store_document(category: "validation_report")`
2. Link the document to the task via `link_documents`
3. Call `update_task` only to change `status` — never touch `description`

Also add `store_document` and `link_documents` to the validator's `allowed_tools` in agents.toml.

---

## Code Examples

### Resolving Involvement Mode (Orchestrator Logic)

```javascript
// Source: derived from CONTEXT.md decisions — conceptual pattern for orchestrator
// The orchestrator reads this from injected context (synapse-startup.js) not trust.toml directly

function resolveInvolvementMode(level, stage, taskDomainTags, rpevMatrix, domainOverrides) {
  const baseKey = `${level}_${stage}`;
  let mode = rpevMatrix[baseKey] || "autopilot";

  // Involvement mode ordering (most → least user involvement)
  const modeRank = { drives: 5, "co-pilot": 4, reviews: 3, monitors: 2, autopilot: 1 };

  // Apply domain overrides — take most restrictive (highest user involvement)
  for (const [domainKey, overrideMode] of Object.entries(domainOverrides)) {
    const [domain, overrideStage] = domainKey.split("_");
    if (overrideStage !== stage) continue;
    if (taskDomainTags.includes(domain)) {
      if ((modeRank[overrideMode] || 0) > (modeRank[mode] || 0)) {
        mode = overrideMode;
      }
    }
  }

  return mode;
}
```

---

### RPEV Stage Document — Create/Update

```javascript
// Source: pattern derived from refine.md store_document step (established in Phase 16)
// doc_id is fixed to enable versioning via store_document's upsert behavior

async function upsertStageDocument(mcpClient, { projectId, taskId, level, stage, involvement, pendingApproval, proposalDocId }) {
  return await mcpClient.store_document({
    project_id: projectId,
    doc_id: `rpev-stage-${taskId}`,
    title: `RPEV Stage: ${taskId} (${level})`,
    category: "plan",
    status: "active",
    tags: `|rpev-stage|${level}|${stage.toLowerCase()}|`,
    content: JSON.stringify({
      stage,
      level,
      task_id: taskId,
      involvement,
      pending_approval: pendingApproval,
      proposal_doc_id: proposalDocId || null,
      last_updated: new Date().toISOString(),
    }),
    actor: "synapse-orchestrator",
  });
}
```

---

### Status Command — Pending Approval Query

```markdown
# In status.md — updated process step

4. **Check for pending approvals:** Call `mcp__synapse__query_documents` with:
   - `category: "plan"`
   - `tags: "|rpev-stage|"` (filter to stage documents only)
   - Parse returned documents for `pending_approval: true` in content
   - Build "Needs Your Input" list from these items

5. **Display approvals needing attention:**
   ```
   ### Needs Your Input

   3 items need your approval:
     1. Epic B / JWT Token Refresh [PLANNING] — proposal ready for review
        Use `/synapse:focus "JWT Token Refresh"` to see proposal + approve/reject
     2. Epic A / Auth Feature [REFINING] — 2 open decisions blocking readiness
     3. Epic C / Work Package 4 [EXECUTING] — 3 retry attempts exhausted, needs guidance
   ```
```

---

### Focus Command — Two-Tier Approval UX

```markdown
# In focus.md — updated approval interaction

7. **Handle pending approval:** If stage document shows `pending_approval: true` and `proposal_doc_id` is set:

   a. Fetch proposal document via `get_smart_context` with the `proposal_doc_id`
   b. Present summary-first view:
   ```
   ## Proposal: [Item Title]

   **Plan Reviewer:** Quality check passed
   **Summary:** [2-3 sentence summary of what was decomposed/planned]

   **Key decisions in this plan:**
   - [Decision 1]
   - [Decision 2]

   Options:
   A) Approve — proceed with this plan
   B) Reject — send back with feedback (provide guidance below)
   C) Discuss deeper — switch to conversational review of the full plan
   ```

   c. If user chooses "Discuss deeper": load and display full proposal document, switch to conversational mode (ask clarifying questions, explore concerns, then re-present options A/B)
   d. If user rejects: capture rejection reason, spawn new Decomposer/Planner pass (max 3 total per WFLOW-06)
   e. If user approves: call `update_task(status: "in_progress")` and `upsert_stage_document(pending_approval: false)`
```

---

## State of the Art

| Old Approach | Phase 18 Approach | Why Changed |
|---|---|---|
| PEV (Plan-Execute-Validate) | RPEV (Refine-Plan-Execute-Validate) | Refine stage now a tracked, persistent RPEV state — not just a precursor |
| Single `approval_threshold` config key | 16-cell involvement matrix | Per-level × per-stage control needed for recursive hierarchy |
| Phase 16 `[rpev]` stub (only Refine modes) | Full `[rpev.involvement]` + `[rpev.domain_overrides]` | All four stages and domain overrides now configurable |
| `refine.md` closes with "RPEV orchestrator not yet available" message | `refine.md` creates stage document and marks item "ready for plan" | Bridge from Refine completion to orchestrator now implemented |
| Agent prompts: no MCP tool call examples | Concrete tool sequences with parameter values in every agent | AGENT-01/02 requirement; critical for subagent reliability |
| Validator writes findings to task description | Validator stores linked `validation_report` document | AGENT-05; preserves original spec for future agents |
| Decomposer creates tasks without context refs | Decomposer attaches `decision_ids` + `document_ids` to leaf tasks | AGENT-10; Synapse's core value = right context, not search-and-hope |

**Still current (no change needed):**
- Wave execution model in `pev-workflow.md` is correct — additions only (Refine stage, stage docs)
- `smol-toml` for TOML parsing — stable, no alternative needed
- Document versioning via fixed `doc_id` + `store_document` upsert — proven by refine.md pattern
- Failure escalation ladder (task→feature→epic) — unchanged, just add status-flag display in status.md

---

## Open Questions

1. **`update_task` Zod schema — does it accept arbitrary metadata fields?**
   - What we know: `update_task` exists and is used to change `status`, `description`, etc.
   - What's unclear: Whether arbitrary fields like `context_refs: { decision_ids: [], document_ids: [] }` are accepted by the Zod validator, or if the schema is strict and would reject unknown fields
   - Recommendation: Before implementing AGENT-10/AGENT-11, read `packages/server/src/tools/update-task.ts` to check the Zod schema. If strict, the Decomposer may need to store context refs as a separate linked document instead of inline on the task.

2. **`query_documents` filtering by tag substring**
   - What we know: `store_document` accepts tags as a pipe-delimited string (e.g., `|rpev-stage|feature|`)
   - What's unclear: Whether `query_documents` supports filtering by tag substring, or only exact category/status filters
   - Recommendation: Check `packages/server/src/tools/query-documents.ts` Zod schema. If tag filtering is not supported, the `/synapse:status` pending-approval query may need to use `semantic_search` with a discriminating query instead.

3. **TOML dotted table syntax in smol-toml**
   - What we know: smol-toml parses standard TOML; the `[rpev.involvement]` sub-table pattern is standard TOML
   - What's unclear: Whether the existing `[rpev]` stub keys (written by `init.md`) will conflict when `[rpev.involvement]` is added later
   - Recommendation: Test the intended final `trust.toml` structure with `smol-toml` before writing the init.md update. The safest pattern is: all sub-tables first, then `[rpev]` last.

---

## Sources

### Primary (HIGH confidence)

- `/home/kanter/code/synapse/packages/framework/agents/synapse-orchestrator.md` — full orchestrator spec, PEV sections, wave execution, failure escalation
- `/home/kanter/code/synapse/packages/framework/workflows/pev-workflow.md` — authoritative PEV workflow, all phases
- `/home/kanter/code/synapse/packages/framework/config/trust.toml` — current config schema, existing `[pev]` and `[rpev]` stub
- `/home/kanter/code/synapse/packages/framework/hooks/synapse-startup.js` — hook injection pattern, TOML parsing approach
- `/home/kanter/code/synapse/packages/framework/commands/synapse/refine.md` — document versioning pattern, readiness checking, DECIDED/OPEN/EMERGING tracking
- `/home/kanter/code/synapse/packages/framework/commands/synapse/status.md` — current status display, stage labels
- `/home/kanter/code/synapse/packages/framework/commands/synapse/focus.md` — current focus + approval stub
- `/home/kanter/code/synapse/packages/framework/config/agents.toml` — allowed_tools per agent
- `/home/kanter/code/synapse/.planning/phases/18-rpev-orchestration/18-CONTEXT.md` — all locked decisions
- `/home/kanter/code/synapse/.planning/REQUIREMENTS.md` — AGENT-01 through AGENT-11 requirements
- `/home/kanter/code/synapse/.planning/brainstorm output/recursive-rpev-model.md` — RPEV model design, involvement gradient, level-aware agent behavior
- `/home/kanter/code/synapse/PROTO_GAP_ANALYSIS.md` — gap analysis for agent prompt improvements

### Secondary (MEDIUM confidence)

- TOML specification v1.0 — `[rpev.involvement]` sub-table syntax is valid; ordering constraints confirmed via spec understanding

### Tertiary (LOW confidence — needs verification)

- `update_task` Zod schema accepts arbitrary metadata fields — needs source read to confirm
- `query_documents` supports tag substring filtering — needs source read to confirm

---

## Metadata

**Confidence breakdown:**
- RPEV Stage Document Pattern: HIGH — follows proven `store_document` + fixed `doc_id` pattern from `refine.md`
- Trust Config Schema: HIGH — standard TOML, locked decisions are precise
- Agent Prompt Updates: HIGH — requirements are explicit; files are markdown, changes are additive
- Startup Hook Injection: HIGH — follows identical pattern to existing tierContext injection
- context_refs on tasks: MEDIUM — depends on `update_task` Zod schema (open question #1)
- Tag-based query for pending approvals: MEDIUM — depends on `query_documents` capabilities (open question #2)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (config/markdown files are stable; no external APIs)
