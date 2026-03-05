---
phase: 19-agent-prompts-level-awareness
plan: 01
subsystem: agents
tags: [mcp, agents, framework, prompts, level-awareness]

# Dependency graph
requires:
  - phase: 18-rpev-orchestration
    provides: store_document/link_documents permissions added to specialist agents in Phase 18-03
provides:
  - mcpServers frontmatter on all 11 agent files enabling subagent MCP tool access
  - Shared "Synapse MCP as Single Source of Truth" section with per-agent tool tables
  - Error handling protocol (HALT on write failures, warn on read failures) in all agents
  - Level-aware behavior sections calibrating context fetching and decision scope by hierarchy level
affects: [all phases that spawn subagents, 20-skills, 21-agent-pool, 24-e2e-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mcpServers frontmatter pattern for subagent MCP tool access"
    - "Query-first principle: Synapse before filesystem for project context"
    - "Two-tier error handling: HALT on write failures, warn+continue on read failures"
    - "Level-aware context budgets: epic=8000+ tokens, feature=6000, component=4000, task=2000-4000"

key-files:
  created: []
  modified:
    - packages/framework/agents/synapse-orchestrator.md
    - packages/framework/agents/decomposer.md
    - packages/framework/agents/architect.md
    - packages/framework/agents/product-strategist.md
    - packages/framework/agents/plan-reviewer.md
    - packages/framework/agents/executor.md
    - packages/framework/agents/validator.md
    - packages/framework/agents/integration-checker.md
    - packages/framework/agents/debugger.md
    - packages/framework/agents/researcher.md
    - packages/framework/agents/codebase-analyst.md

key-decisions:
  - "mcpServers: [\"synapse\"] added to all 11 agent files to prevent silent MCP tool loss in subagents (GitHub issues #5465, #13605)"
  - "Tool table includes only tools in agent's frontmatter -- no speculative tools; write tools marked with (W) suffix"
  - "6 decision-maker agents (orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker) get full 4-level section"
  - "5 executor-tier agents (executor, validator, debugger, researcher, codebase-analyst) get short 2-tier section"
  - "synapse-orchestrator Core Responsibilities moved after Level-Aware Behavior to follow prescribed section ordering"

patterns-established:
  - "Section ordering: Frontmatter -> Opening paragraph -> Attribution -> MCP header -> Level section -> Core sections"
  - "Error handling: WRITE failure = HALT, READ failure = warn+continue, connection error = HALT with specific message"
  - "Level context calibration: hierarchy_level from handoff block drives token budgets and decision scope"

requirements-completed: [AGENT-01, AGENT-03, AGENT-08]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 19 Plan 01: Agent Prompts + Level Awareness Summary

**mcpServers frontmatter, shared Synapse MCP header with per-agent tool tables, HALT/warn error protocol, and level-aware context budgets added to all 11 framework agent files**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T19:19:37Z
- **Completed:** 2026-03-05T19:23:59Z
- **Tasks:** 1
- **Files modified:** 11

## Accomplishments
- Added `mcpServers: ["synapse"]` to YAML frontmatter in all 11 agent files -- fixes silent MCP tool loss on subagent spawn (GitHub #5465, #13605)
- Inserted shared "Synapse MCP as Single Source of Truth" section with per-agent tool reference tables (only tools in each agent's frontmatter, write tools marked with (W)) and error handling protocol
- Added full 4-level Level-Aware Behavior section to 6 decision-maker agents: synapse-orchestrator, decomposer, architect, product-strategist, plan-reviewer, integration-checker
- Added short 2-tier Level Context section to 5 executor-tier agents: executor, validator, debugger, researcher, codebase-analyst
- Reordered synapse-orchestrator sections to follow the prescribed ordering (Attribution -> MCP header -> Level section -> Core Responsibilities)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mcpServers frontmatter, MCP header, and level sections to all 11 agents** - `6ca578c` (feat)

**Plan metadata:** (created after this summary)

## Files Created/Modified
- `packages/framework/agents/synapse-orchestrator.md` - mcpServers, MCP header, 4-level section, section reorder
- `packages/framework/agents/decomposer.md` - mcpServers, MCP header, 4-level section
- `packages/framework/agents/architect.md` - mcpServers, MCP header, 4-level section
- `packages/framework/agents/product-strategist.md` - mcpServers, MCP header, 4-level section
- `packages/framework/agents/plan-reviewer.md` - mcpServers, MCP header, 4-level section
- `packages/framework/agents/integration-checker.md` - mcpServers, MCP header, 4-level section (with feature/epic-only note)
- `packages/framework/agents/executor.md` - mcpServers, MCP header, 2-tier section (with leaf task note)
- `packages/framework/agents/validator.md` - mcpServers, MCP header, 2-tier section (with RPEV stage doc note)
- `packages/framework/agents/debugger.md` - mcpServers, MCP header, 2-tier section (with single-file vs cross-task note)
- `packages/framework/agents/researcher.md` - mcpServers, MCP header, 2-tier section
- `packages/framework/agents/codebase-analyst.md` - mcpServers, MCP header, 2-tier section

## Decisions Made
- Used `mcpServers: ["synapse"]` (not `mcpServers: [synapse]`) to match Claude Code's YAML parsing expectations for string arrays
- Tool tables list only tools present in each agent's `tools:` frontmatter -- no speculative or aspirational tools
- Write tools marked with `(W)` suffix in the "Tool" column for clarity on error handling classification
- `integration-checker` receives full 4-level section despite being sonnet-tier because it operates at feature and epic boundaries (not just task level)

## Deviations from Plan

None -- plan executed exactly as written, plus one structural improvement:

The synapse-orchestrator originally had `## Core Responsibilities` before `## Attribution` (unusual structure). The plan's prescribed section ordering required Attribution -> MCP header -> Level section -> Core sections. The Core Responsibilities section was moved to after Level-Aware Behavior to comply with the plan spec. This is consistent with all other agents.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 11 agent files now have mcpServers frontmatter -- subagent MCP tool access is no longer dependent on inheritance
- Error handling protocol is consistent across all agents -- write failures halt, read failures warn
- Level-aware context budgets are defined -- agents calibrate token usage by hierarchy level
- Ready for Phase 19-02 (if it exists) or the next phase in the milestone

---
*Phase: 19-agent-prompts-level-awareness*
*Completed: 2026-03-05*
