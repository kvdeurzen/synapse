---
phase: 19-agent-prompts-level-awareness
verified: 2026-03-05T19:46:54Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 19: Agent Prompts + Level Awareness — Verification Report

**Phase Goal:** Agent prompts fully aware of Synapse MCP tools + level-appropriate behavior
**Verified:** 2026-03-05T19:46:54Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every agent .md file has `mcpServers: ["synapse"]` in YAML frontmatter | VERIFIED | `grep -l "mcpServers" packages/framework/agents/*.md` returns all 11 files |
| 2 | Every agent .md file has a "Synapse MCP as Single Source of Truth" section with query-first principles | VERIFIED | `grep -l "Single Source of Truth"` returns all 11 files |
| 3 | Every agent .md file has an error handling protocol with two-tier HALT/warn behavior | VERIFIED | `grep -l "HALT"` returns all 11 files |
| 4 | 6 decision-maker agents have a full 4-level Level-Aware Behavior section | VERIFIED | orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker all have `## Level-Aware Behavior` with full epic/feature/component/task table |
| 5 | 5 executor-tier agents have a short 2-tier Level Context section | VERIFIED | executor, validator, debugger, researcher, codebase-analyst all have `## Level Context` with task/feature tiers |
| 6 | All 11 agents have expanded Key Tool Sequences with literal parameter values | VERIFIED | `grep -c "project_id.*task_id"` returns 10+ matches in executor.md, 14+ in validator.md; all agents have concrete doc_id naming patterns |
| 7 | Domain mode is injected into session context by synapse-startup.js | VERIFIED | `trustToml.domains` read at line 230; `domainContext` built at line 247; pushed to `contextParts` at line 270 |
| 8 | Decision-maker agents reference Domain Autonomy Modes in their prompts | VERIFIED | `grep -l "Domain Autonomy Modes"` returns 6 files: orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker |
| 9 | Orchestrator uses structured `--- SYNAPSE HANDOFF ---` block with all 6 fields | VERIFIED | 7 occurrences in synapse-orchestrator.md; block defines project_id, task_id, hierarchy_level, rpev_stage_doc_id, doc_ids, decision_ids; 3 inline references updated (epic decomp, feature decomp, wave execution) |
| 10 | Validator never writes findings into task description — uses store_document + link_documents + update_task(status only) | VERIFIED | 6 occurrences of `validator-findings-{task_id}` doc pattern; no `VALIDATION FINDING` text in update_task context; `store_document` and `link_documents` in frontmatter tools |
| 11 | Decomposer embeds CONTEXT_REFS block and executor/validator parse SYNAPSE HANDOFF at task start | VERIFIED | decomposer has Step 5 "Attach Context Refs to Leaf Tasks" at line 104 with CONTEXT_REFS block format; executor and validator each have `## Task Start Protocol` with 5-step SYNAPSE HANDOFF parsing |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/framework/agents/synapse-orchestrator.md` | mcpServers frontmatter, shared MCP header, 4-level section, structured SYNAPSE HANDOFF block | VERIFIED | mcpServers at line 7; MCP section at line 20; Level-Aware Behavior at line 50; Subagent Handoff Protocol at line 313 with SYNAPSE HANDOFF block |
| `packages/framework/agents/executor.md` | mcpServers frontmatter, MCP header, 2-tier level section, Task Start Protocol, executor-summary document pattern | VERIFIED | All present; store_document with executor-summary-{task_id} at lines 85-86, 113-114; Task Start Protocol at line 53 |
| `packages/framework/agents/validator.md` | mcpServers frontmatter, MCP header, 2-tier level section, Task Start Protocol, validator-findings document pattern, store_document + link_documents in tools | VERIFIED | All present; validator-findings at 6 locations; store_document and link_documents in frontmatter tools at line 4 |
| `packages/framework/agents/decomposer.md` | mcpServers, MCP header, 4-level section, Step 5 CONTEXT_REFS, literal Key Tool Sequences | VERIFIED | CONTEXT_REFS at 4 locations; Step 5 "Attach Context Refs" at line 104; Step 6 "Approval Mode" renumbered |
| `packages/framework/agents/integration-checker.md` | mcpServers, MCP header, 4-level section, store_document + link_documents in tools and sequences | VERIFIED | Tools frontmatter includes mcp__synapse__store_document and mcp__synapse__link_documents; 4 store_document + 3 link_documents occurrences |
| `packages/framework/agents/plan-reviewer.md` | mcpServers, MCP header, 4-level section, store_document + link_documents in tools and sequences | VERIFIED | Tools frontmatter includes mcp__synapse__store_document and mcp__synapse__link_documents; 6 store_document + 4 link_documents occurrences |
| `packages/framework/hooks/synapse-startup.js` | Domain mode injection reading trustToml.domains, building domainContext, pushing to contextParts | VERIFIED | domainContext declared at line 123; trustToml.domains check at line 230; contextParts.push(domainContext) at line 270; 4 total domainContext references |
| `packages/framework/agents/architect.md` | mcpServers, MCP header, 4-level Level-Aware Behavior, literal Key Tool Sequences with domain mode reference | VERIFIED | mcpServers at line 8; Level-Aware Behavior at line 48 with full 4-row table; Domain Autonomy Modes reference present |
| `packages/framework/agents/debugger.md` | mcpServers, MCP header, 2-tier Level Context with single-file vs cross-task note | VERIFIED | Level Context at line 42; task/feature tiers present; note "At task level, examine single-file code bugs. At feature level, examine cross-task interactions" |
| `packages/framework/agents/researcher.md` | mcpServers, MCP header, 2-tier Level Context, literal Key Tool Sequences | VERIFIED | All present |
| `packages/framework/agents/codebase-analyst.md` | mcpServers, MCP header, 2-tier Level Context, literal Key Tool Sequences | VERIFIED | All present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `synapse-orchestrator.md` | subagent executor/validator | `SYNAPSE HANDOFF` block in every Task tool call | VERIFIED | 7 occurrences of "SYNAPSE HANDOFF" in orchestrator.md; block format defined with all 6 fields; block appears at top of Task prompts |
| `decomposer.md` | `synapse-orchestrator.md` | `CONTEXT_REFS` block in task descriptions parsed by orchestrator | VERIFIED | `CONTEXT_REFS` at 4 locations in decomposer; orchestrator Step 2 instructs "Parse the ---CONTEXT_REFS--- block from the task description" |
| `executor.md` | Synapse MCP `store_document` | `executor-summary-{task_id}` document before `update_task` | VERIFIED | store_document call at lines 85, 113; link_documents at lines 86, 114; Constraints state "Store an implementation summary via store_document before marking task done" |
| `validator.md` | Synapse MCP `store_document` | `validator-findings-{task_id}` document, never in task description | VERIFIED | store_document at 6 locations; no VALIDATION FINDING in update_task context; Task Validation Protocol Step 3 uses store_document pattern |
| `synapse-startup.js` | `trust.toml` `[domains]` section | `trustToml.domains` read | VERIFIED | `if (trustToml && trustToml.domains)` at line 230; domains iterated and injected as Domain Autonomy Modes section |
| All 11 agent .md files | Domain Autonomy Modes injected context | agent prompt reference | VERIFIED | All 11 files have "Single Source of Truth" section; 6 decision-maker files explicitly reference "Domain Autonomy Modes" |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AGENT-01 | 19-01 | Every agent prompt has "MCP as Single Source of Truth" section with query-first principle | SATISFIED | All 11 agent files have `## Synapse MCP as Single Source of Truth` section |
| AGENT-02 | 19-02 | Every agent prompt has concrete tool call sequences with parameter values | SATISFIED | All 11 agents have expanded Key Tool Sequences with literal `project_id`, `task_id`, `doc_id` values |
| AGENT-03 | 19-01 | Every agent `.md` file has `mcpServers: ["synapse"]` in frontmatter | SATISFIED | All 11 files have `mcpServers: ["synapse"]` as last line before closing `---` |
| AGENT-04 | 19-03 | Orchestrator has subagent handoff protocol (project_id, task_id, doc_ids in every Task call) | SATISFIED | Structured `--- SYNAPSE HANDOFF ---` block with 6 fields defined at Subagent Handoff Protocol; 3 inline references updated |
| AGENT-05 | 19-03 | Validator never overwrites task description; stores findings as linked document | SATISFIED | `validator-findings-{task_id}` pattern at 6 locations; no VALIDATION FINDING in update_task; store_document + link_documents in frontmatter tools |
| AGENT-06 | 19-03 | Integration Checker and Plan Reviewer persist findings via store_document + link_documents | SATISFIED | Both have store_document and link_documents in frontmatter tools and expanded Key Tool Sequences with literal doc_id patterns |
| AGENT-07 | 19-03 | Executor stores implementation summaries as documents | SATISFIED | `executor-summary-{task_id}` pattern with store_document + link_documents at 4 locations; Constraints explicitly state the requirement |
| AGENT-08 | 19-01 | Every agent prompt has MCP error handling protocol (halt on `success: false`, report to orchestrator) | SATISFIED | All 11 files have "WRITE failure... HALT. Report tool name + error message to orchestrator" and "READ failure... Note in a Warnings section. Continue." |
| AGENT-09 | 19-02 | Domain mode (co-pilot/autopilot/advisory) injected by startup hook and referenced by all agents | SATISFIED | synapse-startup.js reads trustToml.domains and injects; all 6 decision-maker agents reference Domain Autonomy Modes |
| AGENT-10 | 19-03 | Decomposer populates context_refs (document_ids, decision_ids) on leaf tasks | SATISFIED | Decomposer Step 5 "Attach Context Refs to Leaf Tasks" at line 104 with CONTEXT_REFS block format, rules, and examples |
| AGENT-11 | 19-03 | Executor and Validator fetch context_refs at start of each task | SATISFIED | Both executor and validator have `## Task Start Protocol` section with mandatory SYNAPSE HANDOFF parsing and context_refs fetch sequence |

**No orphaned requirements.** All 11 AGENT requirement IDs from REQUIREMENTS.md are accounted for across the three plans.

---

### Section Ordering Verification

Section ordering was verified against the prescribed pattern (Frontmatter → Opening paragraph → Attribution → MCP header → Level section → Core sections) for three representative files:

| File | Attribution | MCP Header | Level Section | Core Section | Ordering |
|------|------------|------------|---------------|--------------|----------|
| `synapse-orchestrator.md` | line 12 | line 20 | line 50 | line 66 (Core Responsibilities) | Correct |
| `executor.md` | line 13 | line 17 | line 43 | line 66 (Core Behaviors) | Correct |
| `validator.md` | line 13 | line 17 | line 42 | line 65 (Core Behaviors) | Correct |

---

### Anti-Patterns Found

No blockers or warnings found.

- No TODO/FIXME/PLACEHOLDER comments in agent files or synapse-startup.js
- No stub or empty implementations
- Old "VALIDATION FINDING" pattern in update_task description fully removed from validator.md
- No speculative tool references in tool tables (all tools are present in agent frontmatter tools lists)

---

### Human Verification Required

None. All requirements in this phase are structural/textual (prompt content in .md files and startup hook logic). All checks are verifiable programmatically.

---

## Summary

Phase 19 fully achieves its goal: **agent prompts are aware of Synapse MCP tools and exhibit level-appropriate behavior**.

All three plans executed as designed:

- **Plan 01:** mcpServers frontmatter, Synapse MCP Single Source of Truth sections, HALT/warn error protocols, and level-aware behavior sections added to all 11 agents. The 6 decision-maker agents received the full 4-level table; the 5 executor-tier agents received the 2-tier section.

- **Plan 02:** Expanded Key Tool Sequences with literal parameter values across all 11 agents. Domain autonomy mode injection added to synapse-startup.js reading `trust.toml [domains]`. The `{agent}-{type}-{task_id}` document naming convention is consistent across all agents. store_document and link_documents added to integration-checker and plan-reviewer frontmatter tools.

- **Plan 03:** Structured `--- SYNAPSE HANDOFF ---` block (6 fields) replaced free-form context passing in orchestrator. Decomposer Step 5 embeds CONTEXT_REFS in leaf task descriptions. Executor and validator received `## Task Start Protocol` sections for mandatory SYNAPSE HANDOFF parsing. Validator frontmatter tools updated with store_document and link_documents. Old VALIDATION FINDING anti-pattern fully removed.

The context propagation chain is complete: decomposer embeds CONTEXT_REFS in task descriptions → orchestrator parses and builds SYNAPSE HANDOFF → executor/validator parse HANDOFF and fetch context from Synapse MCP.

---

_Verified: 2026-03-05T19:46:54Z_
_Verifier: Claude (gsd-verifier)_
