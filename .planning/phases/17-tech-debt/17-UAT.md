---
status: complete
phase: 17-tech-debt
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md]
started: 2026-03-05T15:10:00Z
updated: 2026-03-05T15:12:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Shared escapeSQL — no local definitions remain
expected: Run `grep -rn "function escapeSQL" packages/server/src/` — only one hit in `db/sql-helpers.ts`. Both init-project.ts and index-codebase.ts import `escapeSQL` from `../db/sql-helpers.js`.
result: pass

### 2. created_at preserved on re-init
expected: Run `bun test --cwd packages/server --grep "created_at"` — tests pass showing that re-running init_project on an existing project preserves the original created_at while updating updated_at.
result: pass

### 3. AST import edges resolvable by get_related_documents
expected: Run `bun test --cwd packages/server --grep "DEBT-03"` — 3 tests pass confirming that after indexing a codebase, get_related_documents returns results for code file documents connected via ast_import relationships.
result: pass

### 4. Lint clean — zero findings across both packages
expected: Run `bun run lint` — exits with code 0, zero errors and zero warnings across both server and framework packages.
result: pass

### 5. Autonomy mode ordering is canonical
expected: Check `packages/framework/agents/synapse-orchestrator.md` — autonomy modes listed in canonical order: none (autopilot) first, then strategic (co-pilot), then always (advisory).
result: pass

### 6. All server tests pass with no regressions
expected: Run `bun test --cwd packages/server` — all 624+ tests pass, 0 failures. No regressions from escapeSQL extraction, created_at fixes, document entry additions, or lint auto-fixes.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
