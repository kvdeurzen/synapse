---
status: complete
phase: 15-foundation
source: 15-01-SUMMARY.md, 15-02-SUMMARY.md
started: 2026-03-03T16:00:00Z
updated: 2026-03-03T16:30:00Z
---

## Current Test
<!-- All tests complete -->

number: done

## Tests

### 1. resolveConfig Unit Tests Pass
expected: Run `bun test packages/framework/hooks/lib/resolve-config.test.js` — all 7 tests pass covering walk-up resolution, monorepo fallback, null return, and CLAUDE_PROJECT_DIR override.
result: pass

### 2. Startup Hook Injects Project Context
expected: Running synapse-startup.js with a valid project.toml outputs a SYNAPSE PROJECT CONTEXT block in additionalContext containing project_id, name, and skills list.
result: pass
note: Verified via test_project with valid project.toml — AI correctly reported project_id "test-project" from session context.

### 3. Missing project.toml Shows Init Guidance
expected: Running synapse-startup.js without project.toml produces an error in additionalContext directing user to run `/synapse:init`, and exits 0 (does not block session).
result: pass (fixed)
fix: |
  - Non-Synapse projects (no .synapse/ dir): hook now exits silently instead of injecting error
  - Local install with missing project.toml: error injected into additionalContext as before
  - Invalid project_id: validation error now surfaced via additionalContext instead of failing silently
  Files changed: packages/framework/hooks/synapse-startup.js

### 4. Hook Portability — tier-gate Finds Config from Subdirectory
expected: tier-gate.js resolves trust.toml via resolveConfig() walk-up — no longer uses hardcoded process.cwd() path. Inspect the file to confirm resolveConfig import and null guard before readFileSync.
result: pass

### 5. Hook Portability — tool-allowlist Finds Config from Subdirectory
expected: tool-allowlist.js resolves agents.toml via resolveConfig() walk-up — no longer uses hardcoded process.cwd() path. Inspect the file to confirm resolveConfig import and null guard before readFileSync.
result: pass

### 6. Audit Log Derives Project Root from Config Path
expected: audit-log.js uses resolveConfig('project.toml') and derives project root via path.dirname x3. Falls back to CLAUDE_PROJECT_DIR || cwd when project.toml is absent. Inspect to confirm.
result: pass

### 7. Settings.json Registers All 5 Synapse Hooks
expected: .claude/settings.json contains hook entries for all 5 Synapse hooks (synapse-startup, tier-gate, tool-allowlist, precedent-gate, audit-log) using `bun $CLAUDE_PROJECT_DIR/...` format alongside existing GSD hooks.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Fixes Applied During UAT

1. **Silent exit for non-Synapse projects** — synapse-startup.js checks for `.synapse/` directory; exits silently if absent (no error for non-Synapse projects)
2. **Validation errors surfaced to AI** — malformed project_id now produces additionalContext error instead of failing silently in outer catch
3. **Synapse statusline** — new synapse-statusline.js shows "Synapse: {Project Name}" in cyan at bottom of terminal from session start

## Gaps

[none — all resolved]
