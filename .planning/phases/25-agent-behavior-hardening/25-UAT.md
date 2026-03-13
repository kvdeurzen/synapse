---
status: complete
phase: 25-agent-behavior-hardening
source: 25-01-SUMMARY.md, 25-02-SUMMARY.md, 25-03-SUMMARY.md, 25-05-SUMMARY.md, 25-06-SUMMARY.md
started: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Stage Gate Check Protocol added to orchestrator
expected: synapse-orchestrator.md contains "Stage Gate Check Protocol" section with halt-on-failure semantics
result: pass
verification: [auto] grep found "## Stage Gate Check Protocol" at line 341 in packages/framework/agents/synapse-orchestrator.md, plus "NON-RECOVERABLE" gate failure rule at line 353

### 2. Output Budget section added to orchestrator
expected: synapse-orchestrator.md contains "Output Budget" section constraining output to fixed templates
result: pass
verification: [auto] grep found "## Output Budget" at line 39 in packages/framework/agents/synapse-orchestrator.md

### 3. Tree-Integrity Check added to orchestrator
expected: synapse-orchestrator.md contains tree-integrity check requiring children_all_done before parent marked done
result: pass
verification: [auto] grep found "## Tree-Integrity Check (before marking ANY parent done)" at line 229 in packages/framework/agents/synapse-orchestrator.md

### 4. Feature branch creation workflow in orchestrator
expected: synapse-orchestrator.md contains git checkout -b feat/ branch creation before executor dispatch
result: pass
verification: [auto] grep found "git checkout -b feat/{epic_slug}/{feature_slug}" at line 134 in packages/framework/agents/synapse-orchestrator.md

### 5. Commit verification in orchestrator
expected: orchestrator verifies executor commits via git log --grep after task completion
result: pass
verification: [auto] grep found "git log --oneline --grep='task:{task_id}'" at line 312 in packages/framework/agents/synapse-orchestrator.md

### 6. Pool-state document writes are MUST (not SHOULD)
expected: pool-state write triggers use MUST language with explicit trigger list
result: pass
verification: [auto] grep found "When to write (MUST)" at line 263 with 4 triggers (assign, clear, recovery, cancel) in packages/framework/agents/synapse-orchestrator.md; 11 total references to pool-state in the file

### 7. Orchestrator delegation rule -- NEVER update_task on leaf tasks
expected: explicit rule that orchestrator never calls update_task on leaf tasks (executors/validators own leaf status)
result: issue
verification: [auto] searched for "NEVER calls update_task on leaf" and "delegation" -- neither pattern found. The orchestrator does reference "Executor -- Implements leaf tasks" but lacks an explicit prohibition against updating leaf task status directly
reported: "The explicit delegation rule 'Orchestrator NEVER calls update_task on leaf tasks' from 25-01-SUMMARY.md is not present as a verbatim rule in the current orchestrator prompt. The orchestrator does call update_task for status changes (re-queue, parent done, rollback), but there is no explicit constraint preventing it from updating leaf tasks."
severity: low

### 8. Git Commit Protocol added to executor
expected: executor.md contains "Git Commit Protocol (MANDATORY)" section with conventional commit format and [task:{task_id}] traceability
result: pass
verification: [auto] grep found "## Git Commit Protocol (MANDATORY)" at line 152, conventional commit format at line 158, and [task:{task_id}] at line 159 in packages/framework/agents/executor.md

### 9. store_document and link_documents in executor frontmatter
expected: executor.md frontmatter tools line includes mcp__synapse__store_document and mcp__synapse__link_documents
result: pass
verification: [auto] confirmed both tools present in line 4 of packages/framework/agents/executor.md frontmatter

### 10. Plan Document Storage in planner (formerly decomposer)
expected: planner.md contains plan document storage step using store_document with category plan
result: pass
verification: [auto] grep found store_document with category plan at line 133 and Step 5b-equivalent plan storage flow in packages/framework/agents/planner.md. Note: decomposer.md was renamed to planner.md in a later phase; the deliverable is present under the new name.

### 11. store_document and link_documents in planner frontmatter
expected: planner.md frontmatter includes store_document and link_documents tools
result: pass
verification: [auto] confirmed mcp__synapse__store_document and mcp__synapse__link_documents in line 4 of packages/framework/agents/planner.md frontmatter

### 12. Per-epic shallow tree queries in status.md
expected: status.md uses get_task_tree with root_task_id and max_depth: 2 per epic instead of single unfiltered call
result: pass
verification: [auto] grep found "get_task_tree(project_id: \"{project_id}\", root_task_id: \"{epic_task_id}\", max_depth: 2)" at line 26 in .claude/commands/synapse/status.md

### 13. semantic_search removed from status.md allowed-tools
expected: status.md allowed-tools section does NOT include semantic_search
result: pass
verification: [auto] grep for "semantic_search" in .claude/commands/synapse/status.md returned no matches; allowed-tools list contains only Read, get_task_tree, get_smart_context, project_overview, query_documents

### 14. Fixed output template in status.md
expected: status.md contains a fixed markdown template agents must follow exactly
result: pass
verification: [auto] confirmed fixed template block at line 51 with "agent MUST follow this template exactly -- no reformatting" instruction at line 47 in .claude/commands/synapse/status.md

### 15. Code Index Trust Rule in refine.md
expected: refine.md contains "Code Index Trust Rule" preventing wasteful Explore agent spawns
result: pass
verification: [auto] grep found "Code Index Trust Rule" at line 62 in .claude/commands/synapse/refine.md with explicit rule block

### 16. Persist-before-transition in refine.md
expected: refine.md saves refinement state via store_document BEFORE presenting readiness summary
result: pass
verification: [auto] grep found "Persist before transition" at line 111 in .claude/commands/synapse/refine.md with "Before presenting the readiness summary" instruction

### 17. UX/DX dimension surfacing in refine.md
expected: refine.md includes UX/DX or developer experience consideration in brainstorming
result: pass
verification: [auto] grep found UX/DX dimension reference in .claude/commands/synapse/refine.md

### 18. Auto-commit scaffolding in init.md
expected: init.md includes a step to git add and commit .synapse/ and .claude/ after initialization
result: pass
verification: [auto] grep found commit scaffolding step at line 144-152 in .claude/commands/synapse/init.md with git add .synapse/ .claude/ and non-fatal failure handling

### 19. status.md mirror in sync
expected: .claude/commands/synapse/status.md matches packages/framework/commands/synapse/status.md
result: pass
verification: [auto] diff returned no output (files identical)

### 20. refine.md mirror in sync
expected: .claude/commands/synapse/refine.md matches packages/framework/commands/synapse/refine.md
result: pass
verification: [auto] diff returned no output (files identical)

### 21. init.md mirrors diverged (later phases)
expected: .claude/commands/synapse/init.md matches packages/framework/commands/synapse/init.md
result: issue
verification: [auto] diff shows .claude/ copy has additional gateway_mode config, gateway-protocol.md copy step, and --dangerously-skip-permissions alias that framework/ copy lacks
reported: "init.md mirrors have diverged. The .claude/ copy has additions from later phases (gateway_mode, gateway-protocol.md step 6b, --dangerously-skip-permissions alias) that were not mirrored to packages/framework/commands/synapse/init.md. This is a post-Phase-25 drift issue, not a Phase 25 defect."
severity: low

### 22. audit-log.js mirrors diverged
expected: .claude/hooks/audit-log.js matches packages/framework/hooks/audit-log.js
result: issue
verification: [auto] diff shows packages/framework/ copy has the safer .synapse path check (checking basename === ".synapse") while .claude/ copy uses the original 3-level dirname. This is a post-Phase-25 improvement that was applied to framework/ but not back-ported to .claude/.
reported: "audit-log.js mirrors have diverged. The packages/framework/ copy has an improved projectRoot derivation (checking path.basename for '.synapse' before using dirname math), while .claude/ copy uses the original simpler logic. Both copies have the Phase 25 deliverables (has_actor, heuristic fallback)."
severity: low

### 23. session-summary.js mirrors in sync
expected: .claude/scripts/session-summary.js matches packages/framework/scripts/session-summary.js
result: pass
verification: [auto] diff returned no output (files identical)

### 24. has_actor boolean field in audit-log.js
expected: audit-log.js includes has_actor field for attribution gap visibility
result: pass
verification: [auto] grep found "has_actor: !!(toolInput.actor || toolInput.assigned_agent)" at line 38 in both .claude/hooks/audit-log.js and packages/framework/hooks/audit-log.js

### 25. Heuristic fallback attribution in audit-log.js
expected: audit-log.js includes Task tool -> synapse-orchestrator heuristic fallback
result: pass
verification: [auto] grep found "Fallback 2: heuristic from tool name patterns" and 'toolName === "Task" ? "synapse-orchestrator"' at lines 28-31 in .claude/hooks/audit-log.js

### 26. synapse-audit.js removed
expected: synapse-audit.js no longer exists in .claude/hooks/ or packages/framework/hooks/
result: pass
verification: [auto] glob for .claude/hooks/synapse-audit.js and packages/framework/hooks/synapse-audit.js both returned "No files found"

### 27. session-summary.js created with per-agent cost aggregation
expected: session-summary.js exists in both packages/framework/scripts/ and .claude/scripts/ with per-agent token/cost aggregation
result: pass
verification: [auto] both files exist; grep confirmed per-agent token counts (byAgent), cost estimates ($3/1M input + $15/1M output), and attribution quality percentage

### 28. Actor attribution in architect.md (per-tool listing)
expected: architect.md includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 26 occurrences of 'actor.*"architect"' in packages/framework/agents/architect.md including per-tool listings at lines 17-23

### 29. Actor attribution in validator.md (per-tool listing)
expected: validator.md includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 29 occurrences of 'actor.*"validator"' in packages/framework/agents/validator.md including per-tool listings at lines 17-24

### 30. Actor attribution in researcher.md (per-tool listing)
expected: researcher.md includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 18 occurrences of 'actor.*"researcher"' in packages/framework/agents/researcher.md including per-tool listings at lines 17-24

### 31. Actor attribution in codebase-analyst.md (per-tool listing)
expected: codebase-analyst.md includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 21 occurrences of 'actor.*"codebase-analyst"' in packages/framework/agents/codebase-analyst.md including per-tool listings at lines 17-23

### 32. Actor attribution in debugger.md (per-tool listing)
expected: debugger.md includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 15 occurrences of 'actor.*"debugger"' in packages/framework/agents/debugger.md including per-tool listings at lines 17-22

### 33. Actor attribution in integration-checker.md (per-tool listing)
expected: integration-checker.md includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 18 occurrences of 'actor.*"integration-checker"' in packages/framework/agents/integration-checker.md including per-tool listings at lines 17-25

### 34. Actor attribution in plan-auditor.md (successor to plan-reviewer.md)
expected: plan-auditor.md (renamed from plan-reviewer.md) includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 20 occurrences of 'actor.*"plan-auditor"' in packages/framework/agents/plan-auditor.md including per-tool listings at lines 17-25. Note: agent was renamed from plan-reviewer to plan-auditor in a later phase.

### 35. Actor attribution in product-researcher.md (successor to product-strategist.md)
expected: product-researcher.md (renamed from product-strategist.md) includes actor name and per-tool actor parameter examples
result: pass
verification: [auto] grep found 24 occurrences of 'actor.*"product-researcher"' in packages/framework/agents/product-researcher.md including per-tool listings at lines 17-25. Note: agent was renamed from product-strategist to product-researcher in a later phase.

### 36. WebSearch tool added to researcher.md
expected: researcher.md frontmatter includes WebSearch tool
result: pass
verification: [auto] confirmed WebSearch in line 4 of packages/framework/agents/researcher.md frontmatter tools list

### 37. WebFetch tool added to researcher.md
expected: researcher.md frontmatter includes WebFetch tool
result: pass
verification: [auto] confirmed WebFetch in line 4 of packages/framework/agents/researcher.md frontmatter tools list

### 38. Context7 MCP tools added to researcher.md
expected: researcher.md frontmatter includes mcp__context7__resolve-library-id and mcp__context7__query-docs, and mcpServers includes context7
result: pass
verification: [auto] confirmed both Context7 tools in line 4 and mcpServers: ["synapse", "context7"] in line 7 of packages/framework/agents/researcher.md

### 39. External Research Protocol in researcher.md
expected: researcher.md contains External Research Protocol section with priority order and confidence tiers
result: pass
verification: [auto] grep found "## External Research Protocol" at line 92 and "### Confidence Tiers" at line 103 with HIGH/MEDIUM/LOW tier definitions at lines 109-111 in packages/framework/agents/researcher.md

### 40. Confidence tier tagging in researcher.md
expected: researcher.md defines HIGH (Context7/official docs), MEDIUM (cross-referenced web), LOW (single source) confidence tiers
result: pass
verification: [auto] grep confirmed all three tiers defined at lines 109-111 in packages/framework/agents/researcher.md with correct source categories

### 41. Task tool added to architect.md frontmatter
expected: architect.md frontmatter includes Task tool for spawning researcher subagents
result: pass
verification: [auto] confirmed Task in line 4 of packages/framework/agents/architect.md frontmatter

### 42. Research spawning protocol in architect.md
expected: architect.md includes researcher spawning instructions (via Task tool) before non-trivial decisions
result: pass
verification: [auto] grep found "Spawn Researchers via Task tool" at line 127 with example prompts at lines 128-129 in packages/framework/agents/architect.md

### 43. Task tool added to planner.md frontmatter
expected: planner.md (formerly decomposer.md) frontmatter includes Task tool
result: pass
verification: [auto] confirmed Task in line 4 of packages/framework/agents/planner.md frontmatter

### 44. Implementation Research step (Step 1b) in planner.md
expected: planner.md includes Step 1b Implementation Research section for spawning researcher before decomposition
result: pass
verification: [auto] grep found "### Step 1b: Implementation Research" at line 92 in packages/framework/agents/planner.md with skip criteria and when-to-spawn guidance

### 45. Research Document Discovery in orchestrator.md
expected: orchestrator.md includes section for discovering researcher findings and threading them into downstream handoffs
result: pass
verification: [auto] grep found "## Research Document Discovery" at line 113 with plan document reading, research_doc_ids extraction, and Plan Auditor handoff chaining at lines 115-121 in packages/framework/agents/synapse-orchestrator.md

### 46. Non-blocking research failure handling
expected: orchestrator continues pipeline if researcher fails (research is informational, not gating)
result: pass
verification: [auto] grep confirmed "If the plan document has no '## Research References' section: proceed normally" at line 121 in packages/framework/agents/synapse-orchestrator.md

### 47. PR Workflow section in orchestrator.md
expected: orchestrator.md contains "PR Workflow" section with gh pr create command
result: pass
verification: [auto] grep found "## PR Workflow" at line 203 and "gh pr create" at line 208 in packages/framework/agents/synapse-orchestrator.md

### 48. Structured PR template with RPEV stage doc
expected: PR body includes epic title, RPEV stage doc ID, task commits, decision references, validation checklist
result: pass
verification: [auto] grep confirmed PR body template includes "epic title, RPEV stage doc ID, involvement mode, 1-3 sentence summary, task commits list, referenced decisions, validation checklist" at line 208 in packages/framework/agents/synapse-orchestrator.md

### 49. Involvement-mode-aware merge gate
expected: orchestrator.md has merge gate table with autopilot/monitors auto-merge and co-pilot/reviews/drives user approval
result: pass
verification: [auto] grep found "### Merge Gate (Involvement-Mode Dependent)" at line 211 with autopilot/monitors auto-merge (gh pr merge --merge --delete-branch) at lines 215-216 and co-pilot pending_approval at line 218 in packages/framework/agents/synapse-orchestrator.md

### 50. Explicit git revert rollback commands
expected: orchestrator.md has git revert commands for task, feature (pre-merge), and feature (post-merge) rollback scenarios
result: pass
verification: [auto] grep found "git revert {commit_sha} --no-edit" (task rollback) at line 444, "git revert -m 1 {merge_commit_sha} --no-edit" (post-merge rollback) at line 465 in packages/framework/agents/synapse-orchestrator.md

### 51. Safety rules preventing force-push and reset --hard
expected: orchestrator.md explicitly prohibits force-push to main and git reset --hard on shared branches
result: pass
verification: [auto] grep found "NEVER force-push to main" at line 471 and "NEVER use `git reset --hard` on shared branches" at line 472 in packages/framework/agents/synapse-orchestrator.md

### 52. Orchestrator line count within budget
expected: synapse-orchestrator.md stays under 800 lines (25-01-SUMMARY claimed 579 lines under 800 limit)
result: pass
verification: [auto] wc -l reports 500 lines for packages/framework/agents/synapse-orchestrator.md (well under 800 limit)

### 53. Framework tests pass
expected: all framework tests pass with no regressions from Phase 25 changes
result: pass
verification: [auto] bun run test:framework: 127 tests pass, 0 fail across 10 files

### 54. Agents integration anti-drift tests pass
expected: agents-integration.test.ts passes, confirming agent frontmatter consistency with agents.toml
result: pass
verification: [auto] bun test agents-integration.test.ts: 10 tests pass, 0 fail, 119 expect() calls

### 55. RPEV stage gate enforcement in live agent execution
expected: when a stage gate check fails, the orchestrator halts and reports to gateway (does not retry)
result: skipped
verification: [manual] needs human testing -- requires live multi-agent pipeline execution to observe gate failure behavior

### 56. Output budget compliance in live orchestrator output
expected: orchestrator output in live execution matches the fixed templates (dispatch cycle, stage transition, wave checkpoint)
result: skipped
verification: [manual] needs human testing -- requires live orchestrator execution to observe output formatting

### 57. Actor attribution rate improvement in live execution
expected: attribution rate improves from ~9% to >=80% in live pipeline execution
result: skipped
verification: [manual] needs human testing -- requires live pipeline run and session-summary.js analysis of audit log

### 58. Research spawning in live architect/planner execution
expected: architect and planner spawn researcher subagents when encountering unfamiliar territory
result: skipped
verification: [manual] needs human testing -- requires live agent execution with research-triggering context

### 59. PR creation in live feature completion
expected: orchestrator creates PR via gh pr create with structured template after feature integration passes
result: skipped
verification: [manual] needs human testing -- requires live feature completion in a repo with GitHub remote

## Summary

total: 59
passed: 51
issues: 3
pending: 0
skipped: 5

## Gaps

- id: GAP-1
  test: 7
  severity: low
  description: |
    The explicit delegation rule "Orchestrator NEVER calls update_task on leaf tasks" from 25-01-SUMMARY
    is not present as a verbatim constraint in the current orchestrator prompt. The orchestrator does
    reference that executors implement leaf tasks, but lacks an explicit prohibition. This may have been
    intentionally subsumed by later phase restructuring (Phase 26.x) which reorganized the orchestrator,
    or it may have been lost during refactoring.

- id: GAP-2
  test: 21
  severity: low
  description: |
    init.md mirrors have diverged. The .claude/ copy has additions from later phases (gateway_mode config,
    gateway-protocol.md copy step, --dangerously-skip-permissions alias) not present in
    packages/framework/commands/synapse/init.md. This is a post-Phase-25 drift issue, not a Phase 25 defect.

- id: GAP-3
  test: 22
  severity: low
  description: |
    audit-log.js mirrors have diverged. The packages/framework/ copy has an improved projectRoot derivation
    (checking path.basename for ".synapse" safety) while .claude/ copy uses the original simpler 3-level
    dirname logic. Both copies have the Phase 25 deliverables (has_actor, heuristic fallback). The framework
    copy is more robust; the .claude/ copy should be updated to match.
