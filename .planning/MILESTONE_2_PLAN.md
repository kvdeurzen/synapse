# Milestone 2: Agentic Framework — Gap Analysis & Phase Plan

## Context

**What exists (Milestone 1 — complete):** Synapse is a database-backed MCP server with 18 tools, 6 LanceDB tables, 488 tests. It handles document storage, code indexing, search (semantic/fulltext/hybrid), and smart context assembly. All 7 phases complete.

**What's next:** An agentic framework that *wraps* Synapse. A separate orchestrator process built on the Claude Agent SDK that coordinates AI agents through Synapse's MCP tools — with decision tracking, task decomposition, and tiered authority.

**Why:** The original goal for Synapse was to support bigger projects through an agentic framework. The database layer (Milestone 1) is the foundation; now we build the coordination layer.

## Discrepancies Between Other Agent's Outline & Existing Work

| Other Agent Proposed | Reality / Resolution |
|---|---|
| PostgreSQL-style schema (ENUM, JSONB, BOOLEAN) | Stays LanceDB + Apache Arrow. New tables follow existing patterns (Utf8 for enums, pipe-separated tags, JSON strings) |
| `Project_Knowledge_Graph` table | Becomes `tasks` table in LanceDB with recursive parent_id hierarchy |
| `Decision_Ledger` table | Becomes `decisions` table in LanceDB with vector field for semantic precedent search |
| `User_Authority_Matrix` table | **Not a table.** Trust/oversight is orchestrator config, not persisted state. Simpler and avoids premature complexity |
| No mention of embeddings/search | Decisions and tasks get vector fields — semantic search on rationale and task descriptions using existing Ollama infrastructure |
| No mention of MCP protocol | Orchestrator connects to Synapse as MCP client via Claude Agent SDK's `mcpServers` config |
| "Nexus" naming | Stays "Synapse" |
| Custom agent runtime | Uses Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — provides query(), subagents, hooks, session management |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Orchestrator (separate process)                │
│  Claude Agent SDK: query(), subagents, hooks    │
│                                                 │
│  ┌───────────┐ ┌──────────┐ ┌───────────┐      │
│  │  Planner  │ │ Executor │ │ Validator │      │
│  │  (opus)   │ │ (sonnet) │ │ (sonnet)  │      │
│  └─────┬─────┘ └────┬─────┘ └─────┬─────┘      │
│        └─────────────┼─────────────┘            │
│                      │ MCP tool calls           │
└──────────────────────┼──────────────────────────┘
                       │ stdio (subprocess)
┌──────────────────────┼──────────────────────────┐
│  Synapse MCP Server  │                          │
│  18 existing + 6 new tools                      │
│  LanceDB: 6 existing + 2 new tables             │
└─────────────────────────────────────────────────┘
```

## Phases (continuing from Milestone 1's Phase 7)

### Phase 8: Decision Tracking ("Case Law")
**Goal:** Agents can store, query, and check precedent for decisions — backed by a new LanceDB `decisions` table with semantic search on rationale.

**Deliverables:**
- `decisions` LanceDB table (12 fields: decision_id, project_id, tier 0-3, subject, choice, rationale, is_precedent, status, source_task_id, tags, created_at, vector)
- Arrow schema + Zod row schema in `src/db/schema.ts`
- 3 new MCP tools:
  - `store_decision` — embed rationale, insert, log activity
  - `query_decisions` — filter by tier/status/subject/precedent
  - `check_precedent` — vector search against active precedents, returns has_precedent + matching decisions
- `init_project` updated to create decisions table + BTree/FTS indexes

**Key files:** `src/db/schema.ts`, `src/tools/store-decision.ts`, `src/tools/query-decisions.ts`, `src/tools/check-precedent.ts`, `src/tools/init-project.ts`, `src/server.ts`

**Depends on:** Phase 7 (complete)

**Schema detail — `decisions` table:**

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `decision_id` | Utf8 | false | ULID primary key |
| `project_id` | Utf8 | false | Multi-project scoping |
| `tier` | Int32 | false | 0=Product Strategy, 1=Architecture, 2=Functional, 3=Execution |
| `subject` | Utf8 | false | What is being decided (e.g. "Primary Frontend Framework") |
| `choice` | Utf8 | false | The decision made (e.g. "Next.js") |
| `rationale` | Utf8 | false | The "why" — full reasoning text |
| `is_precedent` | Utf8 | false | "true"/"false" string (LanceDB has no bool; matches existing Utf8 enum pattern) |
| `status` | Utf8 | false | "active", "superseded", "revoked" |
| `source_task_id` | Utf8 | true | Links to task where decision was made (populated in Phase 9+) |
| `tags` | Utf8 | false | Pipe-separated tags for filtering |
| `created_at` | Utf8 | false | ISO 8601 timestamp |
| `vector` | FixedSizeList(768) | false | Embedding of `subject + ": " + rationale` for semantic precedent search |

---

### Phase 9: Task Hierarchy ("Recursive Funnel")
**Goal:** Recursive task decomposition (Epic->Feature->Component->Task) with status tracking and dependencies.

**Deliverables:**
- `tasks` LanceDB table (16 fields: task_id, project_id, parent_id, depth, title, description, status, task_type, depends_on, assigned_agent, decision_ids, tags, priority, created_at, updated_at, vector)
- Arrow schema + Zod row schema in `src/db/schema.ts`
- 3 new MCP tools:
  - `create_task` — validate parent/depth consistency, embed, insert
  - `update_task` — validate status transitions, update fields
  - `get_task_tree` — JS-side tree assembly (same pattern as get_related_documents), rollup stats
- `init_project` updated for tasks table

**Key files:** `src/db/schema.ts`, `src/tools/create-task.ts`, `src/tools/update-task.ts`, `src/tools/get-task-tree.ts`, `src/tools/init-project.ts`, `src/server.ts`

**Depends on:** Phase 8

**Schema detail — `tasks` table:**

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `task_id` | Utf8 | false | ULID primary key |
| `project_id` | Utf8 | false | Multi-project scoping |
| `parent_id` | Utf8 | true | Self-reference for hierarchy (null = root/Epic) |
| `depth` | Int32 | false | 0=Epic, 1=Feature, 2=Component, 3=Task |
| `title` | Utf8 | false | Human-readable task title |
| `description` | Utf8 | false | Full task description/spec |
| `status` | Utf8 | false | "draft", "validated", "in_progress", "completed", "blocked" |
| `task_type` | Utf8 | false | "epic", "feature", "component", "task" |
| `depends_on` | Utf8 | false | JSON array of task_ids this task depends on |
| `assigned_agent` | Utf8 | true | Which agent role is working on this |
| `decision_ids` | Utf8 | false | JSON array of decision_ids that govern this task |
| `tags` | Utf8 | false | Pipe-separated tags |
| `priority` | Int32 | true | 1-5 priority |
| `created_at` | Utf8 | false | ISO 8601 |
| `updated_at` | Utf8 | false | ISO 8601 |
| `vector` | FixedSizeList(768) | false | Embedding of `title + ": " + description` |

---

### Phase 10: Orchestrator Foundation
**Goal:** A separate TypeScript process that spawns Synapse as an MCP subprocess via the Claude Agent SDK, can run basic queries through Claude.

**Deliverables:**
- New `orchestrator/` directory (same monorepo, separate package.json)
- `orchestrator/src/synapse-connection.ts` — builds mcpServers config for SDK
- `orchestrator/src/orchestrator.ts` — core class with `run(prompt)` method calling SDK's `query()`
- `orchestrator/src/config.ts` — Zod-validated config (synapse path, project_id, model, API key)
- `orchestrator/src/index.ts` — entry point
- Dep: `@anthropic-ai/claude-agent-sdk`

**Key design:** No transport change needed. SDK spawns Synapse as stdio subprocess (same as Claude Code does). Each orchestrator instance gets its own Synapse process.

**Depends on:** Phase 9

---

### Phase 11: Agent Specialization & Decision Tiers
**Goal:** Specialized subagents (planner/executor/validator) with distinct prompts, tool restrictions, and model choices. Decision tier enforcement.

**Deliverables:**
- `orchestrator/src/agents/` — agent definitions:
  - **Planner** (opus): read + create_task + store_decision (tiers 1-3) + check_precedent + get_task_tree
  - **Executor** (sonnet): read + store_document + update_task + store_decision (tier 3 only)
  - **Validator** (sonnet): read + update_task + query_decisions + check_precedent
- `orchestrator/src/prompts/` — system prompt templates with precedent-check instructions
- `orchestrator/src/decision-tiers.ts` — authority matrix:
  - Planner: tiers [1, 2, 3]
  - Executor: tiers [3]
  - Validator: tiers [2, 3]
  - **Tier 0 (Product Strategy): always requires user approval — no agent can decide autonomously**
- Orchestrator `run()` gains `mode` param: "plan", "execute", "validate", "auto"

**Depends on:** Phase 10

---

### Phase 12: Quality Gates & Integration
**Goal:** Hook-based enforcement, full plan-execute-validate workflow, end-to-end testing.

**Deliverables:**
- `orchestrator/src/hooks/`:
  - `tier-enforcement.ts` — PreToolUse hook blocks store_decision if agent lacks tier authority
  - `precedent-gate.ts` — PreToolUse hook injects "check precedent first" context
  - `tool-audit.ts` — PostToolUse hook logs all tool calls for traceability
  - `user-approval.ts` — PreToolUse hook returns "ask" for tier 0 decisions
- `orchestrator/src/workflows/plan-execute-validate.ts` — full PEV loop:
  1. Planner decomposes user request into task tree + decisions
  2. User checkpoint for tier 0/1 decisions
  3. Executor works leaf tasks
  4. Validator checks consistency with decisions
  5. Report results
- End-to-end integration tests with realistic scenarios

**Depends on:** Phase 11

## Phase Dependency Graph

```
Phase 8 (Decisions) → Phase 9 (Tasks) → Phase 10 (Orchestrator) → Phase 11 (Agents) → Phase 12 (Integration)
```

Each phase is independently testable:
- After Phase 8: Synapse can store/query decisions (useful even without orchestrator)
- After Phase 9: Synapse can manage task hierarchies (useful even without orchestrator)
- After Phase 10: Orchestrator can talk to Synapse through Claude
- After Phase 11: Specialized agents with different capabilities
- After Phase 12: Full agentic workflow with enforcement and validation

## Boundary: Synapse vs Orchestrator

| Synapse (data layer) | Orchestrator (control layer) |
|---|---|
| Stores decisions, tasks, documents, code | Knows about agent roles, tiers, workflows |
| Knows nothing about agents or authority | Uses Synapse tools as persistence via MCP |
| `store_decision` doesn't enforce tiers | Tier enforcement is an orchestrator hook |
| `create_task` doesn't know about workflows | Workflow sequencing is orchestrator logic |

## Verification (after all phases)

1. **Synapse tools:** `bun test` passes with 6 new tools (24 total), 2 new tables (8 total)
2. **Orchestrator basic:** `bun run orchestrator/src/index.ts --project test "List all available tools"` returns 24 tools
3. **Decision flow:** Store a decision → check_precedent finds it → agent respects tier enforcement
4. **Task flow:** Create epic → decompose to tasks → assign → complete → tree shows progress
5. **Full PEV:** User prompt → planner creates task tree + decisions → executor works leaf tasks → validator approves

## GSD Next Steps

Before executing, use GSD to:
1. Complete Milestone 1 via `/gsd:complete-milestone` (archive phases 1-7)
2. Start Milestone 2 via `/gsd:new-milestone` with the agentic framework scope
3. Plan and execute phases 8-12 sequentially
