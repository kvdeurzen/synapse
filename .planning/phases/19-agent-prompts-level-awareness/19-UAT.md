---
status: complete
phase: 19-agent-prompts-level-awareness
source: [19-01-SUMMARY.md, 19-02-SUMMARY.md, 19-03-SUMMARY.md]
started: 2026-03-05T20:15:00Z
updated: 2026-03-05T20:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. mcpServers Frontmatter on All Agents
expected: All 11 agent files in packages/framework/agents/ have `mcpServers: ["synapse"]` in YAML frontmatter.
result: pass

### 2. Per-Agent MCP Tool Reference Tables
expected: Each agent has a "Synapse MCP as Single Source of Truth" section containing a tool table listing only that agent's own tools. Write tools marked with (W).
result: pass

### 3. Error Handling Protocol
expected: All agents have the error handling protocol: WRITE failure = HALT, READ failure = warn+continue, connection error = HALT.
result: pass

### 4. Level-Aware Behavior — Decision-Makers
expected: 6 decision-maker agents have full 4-level "Level-Aware Behavior" table (epic, feature, component, task).
result: pass

### 5. Level-Aware Behavior — Executor-Tier
expected: 5 executor-tier agents have short 2-tier "Level Context" section.
result: pass

### 6. Concrete Tool Sequences with Literal Parameters
expected: All 11 agents have "Key Tool Sequences" with literal parameter values. Orchestrator uses inline RPEV sequences instead (equivalent).
result: pass

### 7. Domain Mode Injection in synapse-startup.js
expected: synapse-startup.js reads trust.toml [domains] and injects "Domain Autonomy Modes" into additionalContext.
result: pass

### 8. Structured SYNAPSE HANDOFF Block in Orchestrator
expected: synapse-orchestrator.md uses structured `--- SYNAPSE HANDOFF ---` block with 6 required fields.
result: pass

### 9. Decomposer Context Refs Embedding
expected: decomposer.md has Step 5: Attach Context Refs to Leaf Tasks. Former Step 5 (Approval Mode) is now Step 6.
result: pass

### 10. Task Start Protocol in Executor and Validator
expected: Both executor.md and validator.md have "Task Start Protocol" with mandatory context fetch and "Do NOT skip steps" language.
result: pass

### 11. Validator Findings-as-Document Pattern
expected: validator.md Constraints says "Can store validation findings via store_document + link_documents". Frontmatter tools include store_document and link_documents.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
