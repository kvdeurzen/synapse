---
phase: 25-agent-behavior-hardening
plan: 05
subsystem: agents
tags: [researcher, architect, decomposer, orchestrator, websearch, context7, external-research]

# Dependency graph
requires:
  - phase: 25-agent-behavior-hardening
    provides: Plans 01-03 hardened agent behavior, attribution, and audit trail
provides:
  - External research capabilities (WebSearch, WebFetch, Context7) for researcher agent
  - Research-driven decision protocol for architect (spawn researcher before deciding)
  - Implementation research step for decomposer (Step 1b before decomposing)
  - Researcher document discovery pattern for orchestrator (handoff chaining)
affects: [researcher, architect, decomposer, synapse-orchestrator, rpev-workflow]

# Tech tracking
tech-stack:
  added: [Context7 MCP (mcp__context7__resolve-library-id, mcp__context7__query-docs), WebSearch built-in, WebFetch built-in]
  patterns:
    - Confidence tiers for research findings (HIGH/MEDIUM/LOW) — tagging sources by reliability
    - Research-before-decision flow — architect spawns researcher before non-trivial Tier 1-2 decisions
    - researcher-findings-{task_id} doc_id naming convention — enables predictable discovery by orchestrator
    - Non-blocking research failure — pipeline continues without research doc if researcher fails

key-files:
  created: []
  modified:
    - packages/framework/agents/researcher.md
    - packages/framework/agents/architect.md
    - packages/framework/agents/decomposer.md
    - packages/framework/agents/synapse-orchestrator.md

key-decisions:
  - "Confidence tiers (HIGH/MEDIUM/LOW) tag every research finding by source reliability — Context7/official docs = HIGH, cross-referenced WebSearch = MEDIUM, single web source = LOW"
  - "Research failure is non-blocking — orchestrator proceeds without researcher doc_id if researcher subagent fails, logged as warning"
  - "Context7 and WebSearch/WebFetch tools don't use actor param — only Synapse MCP tools require actor attribution"
  - "Task tool added to architect and decomposer frontmatter — required to spawn researcher subagents"

patterns-established:
  - "Research-before-decision: architect checks precedent first, spawns researcher if no match, makes decision after findings"
  - "Researcher doc discovery: query_documents(category: research, tags: |{task_id}|) to find researcher-findings-{task_id}"
  - "Downstream handoff chaining: orchestrator includes researcher doc_ids in decomposer/architect/plan-reviewer SYNAPSE HANDOFF blocks"

requirements-completed: [ABH-07]

# Metrics
duration: 3min
completed: 2026-03-07
---

# Phase 25 Plan 05: Research-Driven Decisions Summary

**External research capabilities (WebSearch, WebFetch, Context7 with confidence tiers) added to researcher; architect and decomposer can now spawn researchers before deciding and decomposing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T08:15:40Z
- **Completed:** 2026-03-07T08:18:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Researcher agent gains WebSearch, WebFetch, and Context7 tools with a full External Research Protocol including priority order and confidence tiers (HIGH/MEDIUM/LOW)
- Architect gains Task tool and Research-Driven Decision Protocol — spawns researcher before non-trivial Tier 1-2 decisions
- Decomposer gains Task tool and Step 1b Implementation Research — spawns researcher before decomposing unfamiliar features
- Orchestrator gains documented Researcher Document Discovery section — verify→extract doc_id→pass to downstream handoffs, with non-blocking failure handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Add external research capabilities to researcher.md** - `7d65c6b` (feat)
2. **Task 2: Add research spawning to architect.md, decomposer.md, and researcher discovery to orchestrator.md** - `0492d8a` (feat)

## Files Created/Modified
- `packages/framework/agents/researcher.md` — Added WebSearch, WebFetch, Context7 to frontmatter tools and mcpServers; External Research Protocol section with priority order, confidence tiers, output format, and anti-patterns; external research tools table; web research steps 2b-2e in Key Tool Sequences; updated Example to show full auth research flow
- `packages/framework/agents/architect.md` — Added Task tool to frontmatter; Research-Driven Decision Protocol section with when-to-spawn rules and research→decision flow; Example 3 showing caching decision driven by research; Attribution note on Task tool not using actor
- `packages/framework/agents/decomposer.md` — Added Task tool to frontmatter; Step 1b Implementation Research (Optional) section with full Task tool prompt template and when-to-skip guidance
- `packages/framework/agents/synapse-orchestrator.md` — Added Researcher Document Discovery section with discovery pattern, handoff chain example, and non-blocking failure handling

## Decisions Made
- Confidence tiers (HIGH/MEDIUM/LOW) tag every finding by source reliability: Context7/official docs = HIGH, cross-referenced WebSearch = MEDIUM, single web source = LOW
- Research failure is non-blocking — pipeline continues without researcher doc_id, logged as warning; research is informational, not gating
- Context7 and WebSearch/WebFetch tools don't use actor param — only Synapse MCP tools require actor attribution (documented in Attribution section)
- Task tool added to architect and decomposer frontmatter — this was missing and required for subagent spawning capability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Context7 MCP server must be configured by user separately if not already set up (standard Context7 setup, not Synapse-specific).

## Next Phase Readiness

- Plan 25-05 complete — researcher, architect, decomposer, and orchestrator all updated
- Plan 25-06 (PR workflow) is the final remaining plan in Phase 25 Wave 1
- Plan 25-04 (E2E re-validation) can proceed once all Wave 1 plans are complete

## Self-Check: PASSED

- FOUND: packages/framework/agents/researcher.md
- FOUND: packages/framework/agents/architect.md
- FOUND: packages/framework/agents/decomposer.md
- FOUND: packages/framework/agents/synapse-orchestrator.md
- FOUND: .planning/phases/25-agent-behavior-hardening/25-05-SUMMARY.md
- FOUND: commit 7d65c6b (Task 1: researcher.md external research)
- FOUND: commit 0492d8a (Task 2: architect, decomposer, orchestrator)

---
*Phase: 25-agent-behavior-hardening*
*Completed: 2026-03-07*
