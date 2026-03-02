---
status: complete
phase: 14-quality-gates-and-pev-workflow
source: 14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md, 14-04-SUMMARY.md
started: 2026-03-02T21:00:00Z
updated: 2026-03-02T21:02:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Framework test suite passes
expected: Running `bun run test:framework` passes all tests (96+ tests, 0 failures).
result: pass

### 2. tier-gate hook denies unauthorized tier access
expected: Running tier-gate.js with an actor whose tier is not authorized for the tool outputs a deny JSON response and exits 0.
result: pass

### 3. tier-gate hook prompts ask for Tier 0
expected: Running tier-gate.js with a Tier 0 actor always outputs an ask JSON response, regardless of trust.toml config.
result: pass

### 4. tool-allowlist hook denies disallowed Synapse tools
expected: Running tool-allowlist.js with an agent using a Synapse MCP tool not in its allowed_tools list outputs deny JSON. Non-Synapse tools pass silently.
result: pass

### 5. precedent-gate hook injects advisory before store_decision
expected: Running precedent-gate.js before a store_decision call outputs an ask JSON with a check_precedent reminder message. Fails open on error (no deny).
result: pass

### 6. audit-log hook logs all tool calls with token estimates
expected: Running audit-log.js PostToolUse outputs a log line for ANY tool call (not just Synapse MCP) including input_tokens and output_tokens fields estimated as Math.ceil(chars/4).
result: pass

### 7. synapse-startup hook injects tier authority
expected: Running synapse-startup.js outputs a session start block that includes an "Agent Tier Authority" section listing each agent's tier constraints and permitted Synapse tools from trust.toml + agents.toml.
result: pass

### 8. trust.toml has [pev] section with valid defaults
expected: trust.toml contains a [pev] section with approval_threshold="epic", max_parallel_executors=3, max_retries_task=3, max_retries_feature=2, max_retries_epic=1.
result: pass

### 9. pev-workflow.md covers full PEV lifecycle
expected: packages/framework/workflows/pev-workflow.md exists and covers all 5 PEV phases: Goal Intake, Progressive Decomposition, Wave Execution, Failure Escalation, Epic Completion.
result: pass

### 10. Orchestrator agent has PEV workflow sections
expected: synapse-orchestrator.md contains PEV-specific sections: PEV Workflow, Progressive Decomposition Protocol, Wave Execution Protocol, Failure Escalation Protocol, Rollback Protocol, and Checkpoint Format.
result: pass

### 11. Decomposer agent creates mandatory validation tasks
expected: decomposer.md contains a "Mandatory Validation Tasks" section describing per-leaf unit test expectations, per-feature integration tasks, and per-epic integration tasks. Also contains Decomposer<->Plan Reviewer Loop section.
result: pass

### 12. Validator agent has task validation protocol
expected: validator.md contains a "Task Validation Protocol" section with step-by-step validation (load spec, verify files/exports/tests/regressions), verdict protocol, and failure report quality guidelines.
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
