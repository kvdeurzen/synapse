---
phase: 19-agent-prompts-level-awareness
plan: "02"
subsystem: agents
tags: [agent-prompts, domain-autonomy, tool-sequences, store_document, synapse-startup]

# Dependency graph
requires:
  - phase: 19-01
    provides: mcpServers frontmatter + level-aware context sections for all 11 agents
provides:
  - Literal parameter examples in Key Tool Sequences for all 11 agents
  - Domain autonomy mode injection into session context via synapse-startup.js
  - store_document/link_documents patterns for executor, validator, integration-checker, plan-reviewer
  - CONTEXT_REFS embedding in decomposer task descriptions
affects: [Phase 20, Phase 21, Phase 22, Phase 23, Phase 24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "{agent}-{type}-{task_id} doc_id naming convention for all agent-stored documents"
    - "store_document before update_task: findings stored as linked documents, never in task description"
    - "Domain Autonomy Modes injected from trust.toml [domains] section into session additionalContext"

key-files:
  created: []
  modified:
    - packages/framework/hooks/synapse-startup.js
    - packages/framework/agents/executor.md
    - packages/framework/agents/validator.md
    - packages/framework/agents/integration-checker.md
    - packages/framework/agents/plan-reviewer.md
    - packages/framework/agents/decomposer.md
    - packages/framework/agents/architect.md
    - packages/framework/agents/product-strategist.md
    - packages/framework/agents/debugger.md
    - packages/framework/agents/researcher.md
    - packages/framework/agents/codebase-analyst.md

key-decisions:
  - "store_document before update_task pattern: validator/integration-checker/plan-reviewer store findings as linked documents with doc_id={agent}-findings-{task_id}, then update_task status only"
  - "domainContext declared at same scope as tierContext/rpevContext in synapse-startup.js outer try block -- not inner try -- to make it accessible for contextParts assembly"
  - "store_document/link_documents added to integration-checker and plan-reviewer tools frontmatter -- consistent with Phase 18-03 decision granting these tools to 4 specialist agents"
  - "synapse-orchestrator.md left unchanged -- existing inline RPEV sequences are comprehensive; will be updated in Plan 03 for handoff protocol"

patterns-established:
  - "Agent document pattern: store_document with doc_id={agent}-{type}-{task_id} for all agent-stored output (findings, summaries, diagnoses, analysis)"
  - "Domain mode reference: decision-maker agents (decomposer, architect, product-strategist) include explicit Domain Autonomy Modes sentence in Key Tool Sequences"
  - "Literal parameter values: all Key Tool Sequences use project_id/task_id/doc_id placeholders, not bare tool names"

requirements-completed: [AGENT-02, AGENT-09]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 19 Plan 02: Agent Prompts + Level Awareness Summary

**Domain autonomy mode injection via synapse-startup.js + literal store_document sequences with {agent}-{type}-{task_id} naming across all 11 agents**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T19:27:19Z
- **Completed:** 2026-03-05T19:32:07Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- synapse-startup.js reads trust.toml [domains] and injects Domain Autonomy Modes section into session additionalContext
- All 11 agents have expanded Key Tool Sequences with literal project_id, task_id, doc_id parameter values
- Validator, integration-checker, plan-reviewer now use store_document for findings (not update_task with description)
- Decomposer embeds CONTEXT_REFS block in task descriptions for executor context fetching
- Four decision-maker agents reference Domain Autonomy Modes in their Key Tool Sequences

## Task Commits

Each task was committed atomically:

1. **Task 1: Domain mode injection to synapse-startup.js** - `7ca9a9f` (feat)
2. **Task 2: Expand Key Tool Sequences in all 11 agents** - `a34f52c` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified

- `packages/framework/hooks/synapse-startup.js` - Added domainContext variable + domain autonomy mode injection from trust.toml [domains]
- `packages/framework/agents/executor.md` - Expanded Key Tool Sequences with store_document summary + link_documents + status-only update_task
- `packages/framework/agents/validator.md` - Expanded sequences with store_document findings pattern; updated Task Validation Protocol Step 3
- `packages/framework/agents/integration-checker.md` - Added store_document/link_documents to tools frontmatter + expanded sequences
- `packages/framework/agents/plan-reviewer.md` - Added store_document/link_documents to tools frontmatter + expanded sequences
- `packages/framework/agents/decomposer.md` - Literal params + CONTEXT_REFS embedding + domain mode reference
- `packages/framework/agents/architect.md` - Literal params + domain mode reference
- `packages/framework/agents/product-strategist.md` - Literal params + domain mode reference
- `packages/framework/agents/debugger.md` - Literal params with doc_id/tags pattern
- `packages/framework/agents/researcher.md` - Literal params with doc_id/tags pattern
- `packages/framework/agents/codebase-analyst.md` - Literal params with doc_id/tags pattern

## Decisions Made

- **store_document before update_task:** Validator, integration-checker, and plan-reviewer store findings as linked documents using doc_id={agent}-findings-{task_id}, then call update_task with status only. This keeps task descriptions clean and findings queryable. Aligns with Phase 18-03 decision.
- **domainContext scope:** Declared at outer try block scope alongside tierContext/rpevContext so it's accessible to contextParts assembly outside the try block.
- **Tools frontmatter updated:** Added store_document and link_documents to integration-checker and plan-reviewer tools lists. These permissions were already decided in Phase 18-03 but hadn't been added to the .md frontmatter.
- **Orchestrator unchanged:** synapse-orchestrator.md already has comprehensive inline RPEV sequences and domain mode reference. No changes needed for this plan; handoff protocol updates deferred to Plan 03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added store_document/link_documents to integration-checker and plan-reviewer frontmatter tools**
- **Found during:** Task 2 (expanding Key Tool Sequences)
- **Issue:** New Key Tool Sequences reference store_document and link_documents, but these were not in the tools frontmatter for integration-checker and plan-reviewer. Without them in tools, the agents cannot call these tools.
- **Fix:** Added mcp__synapse__store_document and mcp__synapse__link_documents to the tools frontmatter in both files. Also added rows to the tools table. This aligns with Phase 18-03 decision that explicitly granted these tools to 4 specialist agents.
- **Files modified:** packages/framework/agents/integration-checker.md, packages/framework/agents/plan-reviewer.md
- **Verification:** Tools appear in frontmatter and tool table
- **Committed in:** a34f52c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix necessary for correctness -- agent frontmatter tools list must match the tool calls in Key Tool Sequences.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 11 agents have literal parameter examples -- agents can now generate correct tool calls without improvising parameters
- Domain autonomy modes are injected into session context -- agents can differentiate behavior between co-pilot/autopilot/advisory domains
- store_document pattern is consistent across all agents using the {agent}-{type}-{task_id} naming convention
- Ready for Phase 20 (Skills) or Plan 19-03 (orchestrator handoff protocol update)

---
*Phase: 19-agent-prompts-level-awareness*
*Completed: 2026-03-05*
