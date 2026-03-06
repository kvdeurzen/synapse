---
status: complete
phase: 22-install-script
source: 22-01-SUMMARY.md, 22-02-SUMMARY.md
started: 2026-03-06T12:00:00Z
updated: 2026-03-06T12:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Install script help output
expected: Running `bash install.sh --help` prints usage info showing all supported flags: --quiet, --smoke-test, --local, --global, --version, --help.
result: pass

### 2. Fresh install creates all directories
expected: Running `bash install.sh` in a new empty directory creates: .claude/agents/, .claude/hooks/ (+ lib/), .claude/commands/synapse/, .claude/skills/, .claude/server/src/index.ts, .synapse/config/ (.toml files), .claude/settings.json, and .mcp.json.
result: pass

### 3. Hook paths use correct prefix
expected: Generated .claude/settings.json has all hook commands using `bun $CLAUDE_PROJECT_DIR/.claude/hooks/` prefix — never `node`, never relative paths.
result: pass

### 4. MCP server entry is correct
expected: Generated .mcp.json contains a "synapse" entry under mcpServers with command "bun", args including "run" and ".claude/server/src/index.ts", and env with OLLAMA_URL and EMBED_MODEL.
result: pass

### 5. Re-install prompts before overwriting
expected: Running `bash install.sh` a second time in the same directory detects .synapse/ exists and prompts "Update to latest?" before proceeding.
result: pass

### 6. Settings merge preserves user hooks
expected: If .claude/settings.json already has custom (non-Synapse) hooks, re-running install.sh preserves those custom hooks while updating Synapse hooks without duplicating them.
result: pass

### 7. Smoke test MCP pipeline (requires Ollama)
expected: Running `bun run scripts/smoke-test.mjs --server-path .claude/server/src/index.ts` with Ollama running shows: MCP handshake OK, init_project OK, store_document OK, semantic_search OK, and exits 0.
result: issue
reported: "smoke test failed initially: used invalid category 'note' (not in Zod enum) and accessed results at wrong nesting level (data.results not results). Fixed both bugs, smoke test now passes."
severity: major

### 8. Documentation covers all required sections
expected: docs/user-journey.md contains sections for: Installation (with flags and modes), Configuration Reference (project.toml, trust.toml, agents.toml, synapse.toml), Command Reference (all 5 commands with examples), Agent Pool, and Troubleshooting (6 common issues).
result: pass

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Running bun run scripts/smoke-test.mjs shows all checks passed and exits 0"
  status: resolved
  reason: "Smoke test used invalid category 'note' (not in VALID_CATEGORIES enum) and accessed search results at wrong nesting (searchResult.results instead of searchResult.data.results). Both fixed in scripts/smoke-test.mjs."
  severity: major
  test: 7
  root_cause: "Plan specified category 'note' but server only accepts: architecture_decision, design_pattern, glossary, code_pattern, dependency, plan, task_spec, requirement, technical_context, change_record, research, learning. Additionally, smoke test assumed flat response shape but server wraps in { success, data: { results } }."
  artifacts:
    - path: "scripts/smoke-test.mjs"
      issue: "Invalid category and wrong response nesting"
  missing: []
  debug_session: ""
