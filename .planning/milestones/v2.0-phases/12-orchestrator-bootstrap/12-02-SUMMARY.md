---
phase: 12-orchestrator-bootstrap
plan: "02"
subsystem: infra
tags: [hooks, claude-code, agents, slash-commands, audit-log, session-lifecycle, attribution]

# Dependency graph
requires:
  - phase: 12-01
    provides: "synapse-framework repo structure with hooks/, agents/, commands/ directories"
provides:
  - "synapse-startup.js: SessionStart hook that injects get_task_tree/get_smart_context instructions via additionalContext"
  - "synapse-audit.js: PostToolUse hook that logs all mcp__synapse__* calls to .synapse-audit.log"
  - "synapse-orchestrator agent definition with startup protocol, work stream management, and attribution instructions"
  - "/synapse:new-goal slash command for creating epic work streams via create_task (depth=0)"
  - "/synapse:status slash command for retrieving work stream status via get_task_tree"
  - "10 unit tests (all passing) proving hook behavior with subprocess-based mocked I/O"
affects:
  - "12-03 (session lifecycle builds on startup hook)"
  - "13 (agent definitions build on orchestrator pattern)"
  - "14 (GATE hooks enforce attribution established here)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SessionStart hook: read stdin -> try/catch -> write JSON with hookSpecificOutput.additionalContext -> exit 0"
    - "PostToolUse audit hook: filter by tool_name prefix -> append JSON to .synapse-audit.log -> exit 0"
    - "Attribution by prompt instruction: agent definitions enforce actor field on every Synapse tool call"
    - "Subprocess-based hook tests: spawnSync with isolated tmpDirs to avoid cross-test pollution"
    - "ESM hooks: package.json type:module requires ESM imports (not require()) in .js hook files"

key-files:
  created:
    - "../synapse-framework/hooks/synapse-startup.js -- SessionStart hook injecting Synapse startup instructions"
    - "../synapse-framework/hooks/synapse-audit.js -- PostToolUse audit hook logging mcp__synapse__* calls"
    - "../synapse-framework/agents/synapse-orchestrator.md -- Orchestrator agent with startup protocol and attribution"
    - "../synapse-framework/commands/synapse/new-goal.md -- /synapse:new-goal slash command"
    - "../synapse-framework/commands/synapse/status.md -- /synapse:status slash command"
    - "../synapse-framework/test/unit/hooks.test.ts -- 10 unit tests for both hooks"
  modified: []

key-decisions:
  - "Hooks use ESM imports (not CJS require()) because package.json has type:module -- .js files are treated as ESM"
  - "Attribution enforced by prompt instructions in agent definition (not hook enforcement) -- Phase 14 GATE hooks handle enforcement"
  - "Startup hook injects instructions via additionalContext -- cannot call Synapse MCP tools directly (MCP not available at SessionStart)"
  - "Audit hook appends to .synapse-audit.log in process.cwd() -- gitignored, one JSON entry per line"

patterns-established:
  - "Hook resilience: every hook has top-level try/catch that exits 0 on any error"
  - "Attribution convention: actor field on all Synapse tool calls, captured by audit hook"
  - "Subprocess test pattern: spawnSync with cwd=tmpDir for filesystem isolation per test"

requirements-completed:
  - ORCH-03
  - ORCH-04
  - ORCH-07

# Metrics
duration: 3min
completed: "2026-03-01"
---

# Phase 12 Plan 02: Orchestrator Bootstrap Summary

**SessionStart hook injects get_task_tree/get_smart_context startup instructions, PostToolUse audit hook logs all mcp__synapse__* calls, orchestrator agent definition with attribution enforcement, and /synapse:new-goal + /synapse:status slash commands -- 10 unit tests pass**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T21:18:16Z
- **Completed:** 2026-03-01T21:21:16Z
- **Tasks:** 2 (Task 1: hooks + tests; Task 2: agent + commands)
- **Files modified:** 6 created

## Accomplishments
- SessionStart hook (synapse-startup.js) outputs valid JSON with hookSpecificOutput.additionalContext containing startup instructions for the agent to execute on session start
- PostToolUse audit hook (synapse-audit.js) logs all mcp__synapse__* calls to .synapse-audit.log with timestamp, tool name, agent identity (actor/assigned_agent), project_id, and input_keys
- synapse-orchestrator agent definition with full system prompt: startup protocol, work stream creation, approval tiers, parallel streams, and critical attribution instructions
- /synapse:new-goal command with precedent checking and epic creation via create_task (depth=0)
- /synapse:status command with get_task_tree, project_overview, and get_smart_context integration
- 10 unit tests: 4 for startup hook (valid JSON, attribution, malformed input, empty input), 6 for audit hook (log creation, non-Synapse filtering, malformed input, actor field, assigned_agent field, unknown fallback)

## Task Commits

Each task was committed atomically:

1. **Task 1: SessionStart hook, PostToolUse audit hook, and unit tests** - `0593e8a` (feat)
2. **Task 2: Orchestrator agent definition and slash commands** - `dc95f37` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `synapse-framework/hooks/synapse-startup.js` -- SessionStart hook: reads stdin, outputs JSON with additionalContext containing Synapse startup instructions, exits 0 on error
- `synapse-framework/hooks/synapse-audit.js` -- PostToolUse audit hook: filters mcp__synapse__* calls, appends JSON log entry to .synapse-audit.log, exits 0 on error
- `synapse-framework/agents/synapse-orchestrator.md` -- Orchestrator agent definition with startup protocol, goal intake, work stream management, approval tiers, parallel streams, attribution enforcement
- `synapse-framework/commands/synapse/new-goal.md` -- /synapse:new-goal slash command: precedent check -> context check -> create_task (depth=0) -> confirm
- `synapse-framework/commands/synapse/status.md` -- /synapse:status slash command: project_overview -> get_task_tree -> get_smart_context -> status report
- `synapse-framework/test/unit/hooks.test.ts` -- 10 unit tests using spawnSync subprocess pattern with isolated tmp directories

## Decisions Made

- **ESM hooks not CJS:** package.json has `"type": "module"` so all .js files are treated as ESM by Node.js. Changed `require()` to `import` statements. Claude Code runs hooks as Node subprocesses so this works correctly.
- **Attribution by prompt instruction only:** Phase 12 establishes the attribution convention (actor field in all Synapse tool calls) via agent prompt instructions. Phase 14 will enforce it via GATE hooks that can block tool calls. This phased approach avoids over-engineering Phase 12.
- **Startup hook cannot call MCP tools:** At SessionStart time, MCP servers are not yet available to the agent. The hook injects additionalContext instructions that the agent executes in its first turn instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CJS require() in synapse-audit.js (ESM module boundary)**
- **Found during:** Task 1 (audit hook creation and testing)
- **Issue:** Plan specified `const fs = require('node:fs')` but project has `"type": "module"` in package.json — Node.js rejects require() in ESM context with "require is not defined in ES module scope"
- **Fix:** Changed to `import fs from 'node:fs'` and `import path from 'node:path'` (ESM syntax)
- **Files modified:** `synapse-framework/hooks/synapse-audit.js`
- **Verification:** All 6 audit hook tests pass; hook exits 0 on all inputs
- **Committed in:** 0593e8a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - CJS/ESM module boundary bug)
**Impact on plan:** Minor — ESM import syntax is functionally identical. No scope creep. Hook behavior identical to specification.

## Issues Encountered
- None beyond the ESM/CJS deviation documented above.

## User Setup Required
None — hooks, agent definition, and slash commands are static files requiring no external service configuration.

## Next Phase Readiness
- SessionStart and PostToolUse hooks are ready to be copied to .claude/hooks/ in any project
- Orchestrator agent definition is ready to be installed as a Claude Code sub-agent
- Slash commands are ready for .claude/commands/synapse/ installation
- Test infrastructure for hooks established (subprocess pattern) for Phase 13 agent testing
- Attribution convention established: all Synapse tool calls must include actor field

---
*Phase: 12-orchestrator-bootstrap*
*Completed: 2026-03-01*

## Self-Check: PASSED

Files verified:
- FOUND: synapse-framework/hooks/synapse-startup.js
- FOUND: synapse-framework/hooks/synapse-audit.js
- FOUND: synapse-framework/agents/synapse-orchestrator.md
- FOUND: synapse-framework/commands/synapse/new-goal.md
- FOUND: synapse-framework/commands/synapse/status.md
- FOUND: synapse-framework/test/unit/hooks.test.ts
- FOUND: .planning/phases/12-orchestrator-bootstrap/12-02-SUMMARY.md

Commits verified:
- FOUND: 0593e8a (Task 1: hooks and unit tests)
- FOUND: dc95f37 (Task 2: agent definition and slash commands)
