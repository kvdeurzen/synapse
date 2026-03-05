---
status: complete
phase: 16-user-journey-commands
source: 16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md
started: 2026-03-05T10:00:00Z
updated: 2026-03-05T10:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. /synapse:init command exists with proper structure
expected: File `packages/framework/commands/synapse/init.md` exists with frontmatter (name, description, allowed-tools), a 10-step process covering: project name detection, project.toml, RPEV walkthrough, trust.toml, init_project MCP call, CLAUDE.md opt-in, skill detection. Anti-patterns section states "Do NOT check for Ollama during init".
result: pass

### 2. /synapse:map command with Ollama gate
expected: File `packages/framework/commands/synapse/map.md` exists. It checks Ollama server health AND nomic-embed-text model availability before calling index_codebase. Stops immediately if either check fails — no partial indexing. Includes progress feedback and error recovery instructions.
result: pass

### 3. /synapse:refine brainstorm command
expected: File `packages/framework/commands/synapse/refine.md` exists with a multi-step brainstorm flow: scope detection, hierarchy level detection, state loading via store_document with doc_id reuse, context/precedent loading (check_precedent before store_decision), Socratic questioning, DECIDED/OPEN/EMERGING decision tracking, level-aware readiness gating (explicit user signal at Project/Epic level), and state persistence.
result: pass

### 4. /synapse:status RPEV dashboard
expected: File `packages/framework/commands/synapse/status.md` exists as a full RPEV dashboard showing: epics by priority with RPEV stage indicators, "Needs Your Input" blocked-items section, active refinement session surfacing, agent pool stub (Phase 21), recent decisions, and suggested actions. Includes semantic_search in allowed-tools.
result: pass

### 5. /synapse:new-goal deprecated and deleted
expected: File `packages/framework/commands/synapse/new-goal.md` no longer exists. It was replaced by /synapse:refine.
result: pass

### 6. /synapse:focus navigation command
expected: File `packages/framework/commands/synapse/focus.md` exists. Supports fuzzy name search via semantic_search and structural path shorthand (e.g., 2.3.1 = Epic 2, Feature 3, WP 1). Shows item context with RPEV status, decisions, related documents, open questions. Contextual actions adapt to item state. Agent-based focus deferred to Phase 21 with user-facing message.
result: pass

### 7. User journey documentation
expected: File `docs/user-journey.md` exists covering: prerequisites (Bun, Ollama, Claude Code), step-by-step flow (install → init → map → refine → status → focus), RPEV rhythm explanation, key concepts, command reference table, and two starting paths (new project and existing project).
result: pass

### 8. All commands have Attribution section
expected: All five command files (init, map, refine, status, focus) include an Attribution section requiring `actor: synapse-orchestrator` on all MCP tool calls.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
