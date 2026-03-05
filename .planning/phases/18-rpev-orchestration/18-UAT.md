---
status: complete
phase: 18-rpev-orchestration
source: 18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md
started: 2026-03-05T16:10:00Z
updated: 2026-03-05T16:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. RPEV Involvement Matrix in trust.toml
expected: trust.toml contains [rpev.involvement] with 16 entries covering all 4 levels (project, epic, feature, work_package) x 4 stages (refine, plan, execute, validate). Gradient: project=drives/co-pilot/monitors/monitors, epic=co-pilot/reviews/autopilot/monitors, feature=reviews/autopilot/autopilot/autopilot, work_package=all autopilot. Also has [rpev.domain_overrides] and [rpev] scalar keys.
result: pass

### 2. RPEV Context Injection in synapse-startup.js
expected: synapse-startup.js reads trust.toml RPEV data and builds an RPEV context section injected into session additionalContext. Should group involvement entries by level and display as level: stage=mode pairs. Only displays when trustToml.rpev exists.
result: pass

### 3. RPEV Workflow Spec in pev-workflow.md
expected: pev-workflow.md contains Stage Document Schema (rpev-stage-[task_id] doc_id pattern with store_document example), Involvement Resolution algorithm (5-mode strictness ordering: drives > co-pilot > reviews > monitors > autopilot with domain override support), and Phase 0 (Refine) bridging refine completion to plan stage.
result: pass

### 4. Orchestrator RPEV Sections
expected: synapse-orchestrator.md has: Involvement Matrix section (replacing Approval Tiers), Stage Document Management section, Subagent Handoff Protocol (every Task call includes project_id, task_id, rpev_stage_doc_id), new MCP tools (store_document, link_documents, query_documents) in frontmatter, and RPEV-aware session startup.
result: pass

### 5. /synapse:refine Stage Document Bridge
expected: refine.md creates rpev-stage-[task_id] documents via store_document when readiness is confirmed. Has query_documents in allowed-tools. Checks for existing stage docs at start. Includes involvement matrix note in the flow.
result: pass

### 6. /synapse:status Stage Document Queries
expected: status.md queries stage documents for pending approvals and failures. "Needs Your Input" section shows pending_approval items with involvement mode and stage doc notes. Epic stage badges use stage document data (more authoritative than task tree). Has query_documents in allowed-tools.
result: pass

### 7. /synapse:focus Two-Tier Approval UX
expected: focus.md implements Tier 1 (summary + Approve/Reject/Discuss options for quick triage) and Tier 2 (full conversational review after loading proposal). Has structured failure options for exhausted-retry items. Has query_documents and update_task in allowed-tools.
result: pass

### 8. Specialist Agent Permissions in agents.toml
expected: agents.toml grants store_document and link_documents to plan-reviewer, integration-checker, executor, and validator agents.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
