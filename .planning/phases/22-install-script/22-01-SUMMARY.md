---
phase: 22-install-script
plan: 01
subsystem: infra
tags: [bash, bun, mcp, json-rpc, install-script, smoke-test]

# Dependency graph
requires:
  - phase: 20-skills-completion
    provides: skill directories and framework files to copy
  - phase: 21-agent-pool
    provides: finalized agent markdown files
  - phase: 15-foundation
    provides: hook architecture with CLAUDE_PROJECT_DIR prefix
provides:
  - install.sh — one-command installer that checks prereqs, copies files, merges settings, runs smoke test
  - scripts/smoke-test.mjs — standalone MCP JSON-RPC smoke test for end-to-end validation
affects: [22-install-script, e2e-validation, user-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bash installer with isatty-aware colored output and --quiet CI flag"
    - "bun -e inline script for JSON merge (no jq/sed dependency)"
    - "Local dev mode detection via packages/server/src/index.ts existence check"
    - "Dedup-safe settings.json merge: filter by command signature, then append"
    - "Bun.spawn + newline-delimited JSON-RPC over stdio for MCP smoke testing"

key-files:
  created:
    - install.sh
    - scripts/smoke-test.mjs
  modified: []

key-decisions:
  - "bun -e inline script for JSON merge — avoids jq/sed/python external dependencies; Bun is already required"
  - "Local dev mode: detect packages/server/src/index.ts to skip download when running from repo — enables self-testing"
  - "Hook dedup by command signature (filename match) not full object equality — simpler and immune to whitespace/order variations"
  - "Soft warn for Ollama missing; hard fail only for Bun — smoke test skipped gracefully when Ollama not running"
  - "cp -n (no-clobber) for .synapse/config/ templates on re-install — preserves user TOML customizations"
  - "smoke-test.mjs uses parseArgs from node:util — works in Bun, no extra dependencies"

patterns-established:
  - "Install script sections clearly delineated with comments for maintainability"
  - "TARGET_DIR captured at script start before any cd — protects curl | bash CWD safety"
  - "All hook command paths use bun $CLAUDE_PROJECT_DIR/.claude/hooks/ prefix per Phase 15 decision"

requirements-completed: [INST-01, INST-02, INST-03]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 22 Plan 01: Install Script Summary

**Bash install.sh (629 lines) + Bun smoke-test.mjs (382 lines) — one-command installer with prereq checks, file copy, bun -e JSON merge for settings/mcp configs, and MCP JSON-RPC smoke test pipeline**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-06T11:07:17Z
- **Completed:** 2026-03-06T11:10:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created install.sh (629 lines) with 12 sections: color/logging setup, argument parsing, already-installed detection, prereq checks (Bun hard fail / Ollama soft warn), GitHub tarball download with local dev mode, file copy (agents/hooks/commands/skills/server), settings.json merge, .mcp.json merge, .gitignore update, smoke test invocation, success summary, and cleanup trap
- Created scripts/smoke-test.mjs (382 lines) implementing the full MCP JSON-RPC handshake over stdio, then three sequential tool calls (init_project, store_document, semantic_search) with success:true validation and non-empty results check
- settings.json merge uses signature-based dedup: removes existing Synapse hooks by filename pattern then appends fresh entries — prevents duplicates on re-run
- Local dev mode: detects `packages/server/src/index.ts` to skip tarball download when running from the repo itself, enabling development and self-testing without a published release

## Task Commits

Each task was committed atomically:

1. **Task 1: Create install.sh** - `7e10ff1` (feat)
2. **Task 2: Create scripts/smoke-test.mjs** - `91b6df3` (feat)

## Files Created/Modified

- `install.sh` — Main installer: prereq checks, file copy, JSON config merge, smoke test orchestration
- `scripts/smoke-test.mjs` — Standalone MCP smoke test: Bun.spawn + JSON-RPC + init_project/store_document/semantic_search

## Decisions Made

- Used `bun -e` inline script for JSON merge instead of jq/sed/python — Bun is already a hard requirement, and inline scripts handle nested object merging correctly with no extra dependencies
- Local dev mode detected by presence of `packages/server/src/index.ts` — allows install.sh to be tested from the repo without a tagged release
- Hook dedup by command filename signature (e.g. `synapse-startup.js`) rather than full object equality — more robust to whitespace changes between versions
- `cp -n` (no-clobber) for .synapse/config/ templates — preserves user TOML edits on re-install while overwriting framework files

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- install.sh and scripts/smoke-test.mjs are complete and ready for Phase 22 plan 02 (usage manual / README)
- The smoke test requires Ollama running with nomic-embed-text to pass; the installer gracefully skips it with instructions when Ollama is not running
- Re-install behavior (dedup merge) and .synapse/config/ preservation verified by code inspection

---
*Phase: 22-install-script*
*Completed: 2026-03-06*

## Self-Check: PASSED

- install.sh — FOUND
- scripts/smoke-test.mjs — FOUND
- 22-01-SUMMARY.md — FOUND
- Commit 7e10ff1 (Task 1) — FOUND
- Commit 91b6df3 (Task 2) — FOUND
