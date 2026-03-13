---
status: complete
phase: 24-e2e-validation
source: 24-01-SUMMARY.md
started: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. init.md contains full 16-entry [rpev.involvement] matrix (packages/framework/)
expected: packages/framework/commands/synapse/init.md step 5 shows 4x4 involvement table and step 6 writes [rpev.involvement] with 16 entries
result: pass
verification: [auto] Grep found `[rpev.involvement]` section at line 77; counted 16 involvement key entries (project_refine through work_package_validate); step 5 table shows 5 involvement modes and 4 levels x 4 stages

### 2. init.md contains full 16-entry [rpev.involvement] matrix (.claude/ copy)
expected: .claude/commands/synapse/init.md matches tracked copy with identical RPEV schema
result: issue
verification: [auto] Grep found `[rpev.involvement]` at line 74 with 16 entries, but diff shows the .claude/ copy is BEHIND the packages/framework/ copy. Missing: gateway_mode field in project.toml template, step 6b (gateway-protocol.md copy), summary mentioning gateway-protocol.md, dangerously-skip-permissions hint in step 11
reported: ".claude/commands/synapse/init.md has diverged from packages/framework/commands/synapse/init.md -- the .claude copy is missing gateway_mode, step 6b (gateway-protocol.md), and dangerously-skip-permissions guidance added post-24-01"
severity: DEGRADED

### 3. 24-FAILURE-LOG.md exists with structured failure entries
expected: failure log file exists at .planning/phases/24-e2e-validation/24-FAILURE-LOG.md with issues, root causes, severities, and statuses
result: pass
verification: [auto] File exists at /home/kanter/code/synapse/.planning/phases/24-e2e-validation/24-FAILURE-LOG.md; contains 40 numbered issues in main table (5 BLOCKER, 28 DEGRADED, 7 COSMETIC); 6 documented patches; known limitations table; verification results for SC1-SC4

### 4. All blocker patches applied and documented
expected: 5 BLOCKER issues all marked PATCHED with corresponding patch sections documenting file, change, and commit
result: pass
verification: [auto] Grep found 5 BLOCKER entries in main failure table all marked PATCHED; 6 patch sections (Patch 1 through 6) documented with file paths, change descriptions, and commit hashes (79125f7, 6838706, 4f67b63, 79c4426, plus 2 inline)

### 5. Agent files committed (claimed 11 in .claude/agents/)
expected: 11 agent .md files in .claude/agents/
result: pass
verification: [auto] Glob found 23 agent .md files in .claude/agents/ (exceeds the original 11 -- additional gsd-* agents added in later phases). The original 11 RPEV agents are present: architect, codebase-analyst, debugger, decomposer, executor, integration-checker, plan-reviewer, product-strategist, researcher, synapse-orchestrator, validator

### 6. Agent files in packages/framework/agents/ (tarball source)
expected: agent .md files exist in packages/framework/agents/ as the tarball source
result: pass
verification: [auto] Glob found 17 agent .md files in packages/framework/agents/ including _synapse-protocol.md shared protocol file and all core agent types (architect, executor, validator, researcher, etc.)

### 7. Hook files committed (.claude/hooks/)
expected: 7+ .js hook files plus lib/ directory in .claude/hooks/
result: pass
verification: [auto] Glob found 9 .js hook files in .claude/hooks/ (original 6 + 3 gsd-* hooks added later): precedent-gate.js, synapse-startup.js, synapse-statusline.js, tool-allowlist.js, tier-gate.js, audit-log.js, gsd-context-monitor.js, gsd-check-update.js, gsd-statusline.js. lib/ directory contains resolve-config.js and resolve-config.test.js

### 8. Hook files in packages/framework/hooks/ (tarball source)
expected: hook .js files exist in packages/framework/hooks/ as the tarball source
result: pass
verification: [auto] Glob found 7 .js files: precedent-gate.js, synapse-statusline.js, tool-allowlist.js, tier-gate.js, audit-log.js, synapse-startup.js, output-contract-gate.js. Plus lib/ with resolve-config.js and resolve-config.test.js

### 9. Command files committed (.claude/commands/synapse/)
expected: 5 .md command files in .claude/commands/synapse/
result: pass
verification: [auto] Glob found exactly 5 .md files: focus.md, map.md, status.md, refine.md, init.md

### 10. Command files in packages/framework/ (tarball source)
expected: 5 .md command files in packages/framework/commands/synapse/
result: pass
verification: [auto] Glob found exactly 5 .md files: map.md, status.md, refine.md, focus.md, init.md

### 11. Skill directories committed (.claude/skills/)
expected: 18+ skill directories with SKILL.md files in .claude/skills/
result: pass
verification: [auto] Glob found 19 SKILL.md files in .claude/skills/*/SKILL.md (exceeds 18 -- includes brainstorm as an additional directory). All expected skills present: architecture-design, brainstorming, bun, cargo-test, defining-requirements, documentation, go, go-test, pytest, python, react, rust, security, sql, tailwind, testing-strategy, typescript, vitest

### 12. Skill directories in packages/framework/ (tarball source)
expected: 18 skill directories in packages/framework/skills/
result: pass
verification: [auto] Glob found 18 SKILL.md files in packages/framework/skills/*/SKILL.md matching expected count

### 13. .mcp.json exists with synapse server config
expected: .mcp.json file exists with mcpServers.synapse configuration
result: pass
verification: [auto] Read confirmed .mcp.json at project root with mcpServers.synapse entry containing command, args, and env (OLLAMA_URL, EMBED_MODEL). Note: local dev .mcp.json uses "command": "bun" (appropriate for dev mode where tree-sitter is pre-built); install.sh correctly generates "command": "npx" for fresh installs

### 14. install.sh exists with expected structure
expected: packages/server/install.sh exists with argument parsing, prerequisite checks, download/extract, file copy, settings/mcp generation, gitignore update, smoke test
result: pass
verification: [auto] Read confirmed install.sh at /home/kanter/code/synapse/packages/server/install.sh with all 11 sections: color/logging, argument parsing, target directory, smoke-test mode, already-installed detection, prerequisites, download/extract, file copy, settings.json generation, .mcp.json generation, gitignore update, smoke test, success summary

### 15. install.sh Patch 1 -- prerelease fallback (BLOCKER #1)
expected: install.sh falls back to /releases?per_page=1 API when /releases/latest returns nothing
result: pass
verification: [auto] Grep found `releases?per_page=1` at line 276 of install.sh; fallback logic correctly tries /releases/latest first, then falls back to first release including prereleases

### 16. install.sh Patch 2 -- CXXFLAGS C++20 (BLOCKER #2)
expected: install.sh sets CXXFLAGS="-std=c++20" during bun install for tree-sitter
result: pass
verification: [auto] Grep found `CXXFLAGS="-std=c++20"` at line 409 of install.sh in the bun install command, plus remediation hint at line 412

### 17. install.sh Patch 3 -- MCP session restart warning (BLOCKER #3)
expected: install.sh output warns user to restart Claude Code before running /synapse:init
result: pass
verification: [auto] Grep found 3 matching lines in install.sh Section 11: "Restart Claude Code before running /synapse:init" (line 668), "will not be available until you start a new session" (line 670), "Exit Claude Code (Ctrl+C or /exit), then reopen it" (line 671)

### 18. install.sh Patch 5 -- .mcp.json uses npx tsx (BLOCKER #39)
expected: install.sh generates .mcp.json with "command": "npx" and "args": ["tsx", ...] instead of "bun"
result: pass
verification: [auto] Grep found `"command": "npx"` at line 560 of install.sh in the SYNAPSE_MCP_JSON definition; confirmed it uses "tsx" in args

### 19. tool-allowlist.js Patch 4 -- empty actor pass-through (BLOCKER #4)
expected: tool-allowlist.js allows empty/missing actor field to pass through (main session calls)
result: pass
verification: [auto] Grep confirmed tool-allowlist.js has explicit pass-through at line 52: `if (!actor) {` with comment "No actor = user's main session or slash command -- always allow"

### 20. synapse-orchestrator registered in agents.toml (BLOCKER #7)
expected: synapse-orchestrator exists as an entry in packages/framework/config/agents.toml
result: pass
verification: [auto] Grep found `[agents.synapse-orchestrator]` at line 3 of agents.toml

### 21. synapse-orchestrator registered in trust.toml tier_authority
expected: synapse-orchestrator has entry in trust.toml [tier_authority] section
result: pass
verification: [auto] Grep found `synapse-orchestrator = []` at line 22 of trust.toml

### 22. v3.0.0-alpha.1 GitHub prerelease tag exists
expected: git tag v3.0.0-alpha.1 exists and points to a valid commit
result: pass
verification: [auto] git tag --list confirmed v3.0.0-alpha.1 exists (plus alpha.2 through alpha.8). Tag resolves to commit 6838706 (fix(install): set CXXFLAGS=-std=c++20 for tree-sitter build)

### 23. v3.0.0-alpha.1 GitHub release is marked as prerelease
expected: GitHub release for v3.0.0-alpha.1 exists with isPrerelease=true
result: pass
verification: [auto] `gh release view` confirmed: tagName=v3.0.0-alpha.1, isPrerelease=true, createdAt=2026-03-06T15:49:55Z

### 24. Server test suite passes
expected: all server tests pass (originally 638, now may have grown)
result: pass
verification: [auto] `bun run test:server` completed: 652 pass, 0 fail, 1726 expect() calls across 38 files in 54.19s

### 25. Framework test suite passes
expected: all framework tests pass (originally 103, now may have grown)
result: pass
verification: [auto] `bun run test:framework` completed: 127 pass, 0 fail, 421 expect() calls across 10 files in 6.61s

### 26. install.sh copies framework files to .claude/ directory structure
expected: install.sh Section 6 copies agents, hooks, commands, skills, server, and config to correct .claude/ paths
result: pass
verification: [auto] Read confirmed install.sh Section 6 copies: agents/*.md to .claude/agents/, hooks/*.js to .claude/hooks/, hooks/lib/ to .claude/hooks/lib/, commands/synapse/*.md to .claude/commands/synapse/, skills/*/ to .claude/skills/, server/ to .claude/server/, config templates to .synapse/config/ (preserving existing)

### 27. install.sh generates settings.json with Synapse hooks
expected: install.sh Section 7 creates or merges .claude/settings.json with SessionStart, PreToolUse, PostToolUse hooks and statusLine
result: pass
verification: [auto] Read confirmed install.sh Section 7 defines SYNAPSE_HOOKS_JSON with SessionStart (synapse-startup.js), PreToolUse (tier-gate.js, precedent-gate.js for store_decision; tool-allowlist.js for mcp__synapse__.*), PostToolUse (audit-log.js), and statusLine (synapse-statusline.js). Fresh and merge paths both present

### 28. init.md commit scaffolding step addresses failure #17
expected: init.md includes a step to commit .synapse/ and .claude/ after initialization
result: pass
verification: [auto] Both init.md copies include step 10 "Commit scaffolding" with `git add .synapse/ .claude/` and `git commit -m "chore: initialize Synapse project configuration"` with graceful error handling for non-git repos

### 29. Full RPEV cycle completion on rpi-camera-py
expected: complete Refine-Plan-Execute-Validate cycle ran with 15/15 tasks done
result: skipped
verification: [manual] needs human testing -- this was a live E2E run on the rpi-camera-py project (external repo). The FAILURE-LOG.md and SUMMARY document SC1 as PASS with 15/15 tasks marked done, but actual rpi-camera-py state cannot be verified from this repo

### 30. Audit log contains required tool entries (SC2)
expected: .synapse-audit.log on rpi-camera-py contains init_project, store_document, create_task, update_task, get_task_tree, get_smart_context entries
result: skipped
verification: [manual] needs human testing -- audit log lives on the target project (rpi-camera-py), not in the synapse repo. FAILURE-LOG.md documents SC2 as PASS with 471 entries and ~628k tokens

### 31. /synapse:status matches task tree state (SC4)
expected: status command output reflects actual task tree state
result: skipped
verification: [manual] needs human testing -- requires live Synapse session with active project. FAILURE-LOG.md documents SC4 as PARTIAL (core data accurate, presentation gaps with pool status and layout consistency)

## Summary

total: 31
passed: 27
issues: 1
pending: 0
skipped: 3

## Gaps

- id: init-md-divergence
  severity: DEGRADED
  description: >
    .claude/commands/synapse/init.md has fallen behind packages/framework/commands/synapse/init.md.
    The .claude copy is missing: gateway_mode field in project.toml template, step 6b
    (gateway-protocol.md copy to .synapse/config/), gateway-protocol.md in the summary
    output, and the dangerously-skip-permissions guidance in step 11. These were likely
    added in later phases but only applied to the packages/framework/ tracked copy.
    Running install.sh would overwrite the .claude/ copy from packages/framework/ (correct
    behavior for fresh installs), but local dev mode uses the .claude/ copy directly.
  files:
    - /home/kanter/code/synapse/.claude/commands/synapse/init.md
    - /home/kanter/code/synapse/packages/framework/commands/synapse/init.md
  recommendation: "Sync .claude/commands/synapse/init.md to match packages/framework/commands/synapse/init.md"
