## Synapse MCP Protocol

### Attribution

**CRITICAL:** Every MCP call you make MUST include the `actor` parameter set to your agent name (declared in the MCP Usage section above). This is not optional. Calls without actor are logged as "unknown" and break audit attribution.

### Principles

Synapse stores project decisions and context. Query it first to avoid wasting tokens re-discovering what's already known.

- Fetch context from Synapse (get_smart_context, query_decisions, get_task_tree) before reading filesystem for project context
- Read and write source code via filesystem tools (Read, Write, Edit, Bash, Glob, Grep)
- Use search_code or get_smart_context when file locations are unknown; go straight to filesystem when paths are specified in the task spec or handoff
- Write findings and summaries back to Synapse at end of task -- builds the audit trail

### Error Handling

- WRITE failure (store_document, update_task, create_task, store_decision returns success: false): HALT. Report tool name + error message to orchestrator. Do not continue.
- READ failure (get_smart_context, query_decisions, search_code returns empty or errors): Note in a "Warnings" section of your output document. Continue with available information.
- Connection error on first MCP call: HALT with message "Synapse MCP server unreachable -- cannot proceed without data access."

### Level-Aware Behavior

Your behavior adjusts based on `hierarchy_level` from the handoff block:

| Level | Scope | Context to Fetch | Decision Tier |
|-------|-------|-----------------|---------------|
| epic | Full capability delivery | Broad: project decisions, all features (max_tokens 8000+) | Tier 0-1 |
| feature | Cohesive set of tasks | Feature decisions, related features (max_tokens 6000) | Tier 1-2 |
| component | Implementation grouping | Component decisions, sibling components (max_tokens 4000) | Tier 2 |
| task | Single implementation unit | Targeted: task spec + direct decisions (max_tokens 2000-4000) | Tier 3 |

At higher levels: fetch broader context, surface cross-cutting concerns, make wider-reaching decisions.
At lower levels: use targeted context, focus on spec-following, avoid scope creep.

### Decision Draft Convention

Decisions follow a draft->review->activate flow. See `@packages/framework/workflows/decision-draft-flow.md` for the full protocol.

- **Doer agents** (architect, planner, task-designer): Store decision proposals as documents (`category: "decision_draft"`), NEVER call `store_decision` directly (except Tier 3 executors).
- **Reviewer agents** (architecture-auditor, plan-auditor, task-auditor): Verify draft quality and call `store_decision` to activate approved proposals.
- **Tier 3 exception:** Executors store Tier 3 decisions directly as active. Validators check post-hoc.

### Mandatory Context Loading Sequence

Every agent MUST complete these 5 steps before beginning agent-specific work:

| Step | Action | Tool Call |
|------|--------|-----------|
| 1 | Parse SYNAPSE HANDOFF block | Extract: project_id, task_id, hierarchy_level, rpev_stage_doc_id, doc_ids, decision_ids |
| 2 | Load task | `get_task_tree(project_id, root_task_id: task_id, max_depth: 0)` -- read `spec`, `context_doc_ids`, `context_decision_ids` |
| 3 | Load documents | If task has `context_doc_ids`: parse JSON array, call `get_smart_context(mode: "detailed", doc_ids: [...])`. Else if handoff has doc_ids: use those. Else: `get_smart_context(mode: "overview", max_tokens: {level-appropriate})` |
| 4 | Load decisions | If task has `context_decision_ids`: parse JSON array, call `query_decisions` for those IDs |
| 5 | Begin work | Only now begin agent-specific work |

Do NOT skip steps 1-4. Do NOT begin implementation/analysis before context is loaded.

### Standard Tag Vocabulary

Every `store_document` call MUST include the full tag set:

| Tag Type | Format | Example |
|----------|--------|---------|
| Agent | `\|{actor-name}\|` | `\|architect\|` |
| Type | `\|{document-type}\|` | `\|architecture\|` |
| Provides | `\|provides:{capability}\|` | `\|provides:architecture\|` |
| Task | `\|{task_id}\|` | `\|task-01J5K...\|` |
| Stage | `\|stage:{RPEV-stage}\|` | `\|stage:PLANNING\|` |

Example: `tags: "|architect|architecture|provides:architecture|task-01J5K...|stage:PLANNING|"`

### Provides Vocabulary

Fixed capability slugs for `provides:` tags and output contracts:

| Slug | Producer | Description |
|------|----------|-------------|
| architecture | architect | Architecture document |
| decision-draft | architect, planner, task-designer | Decision proposals |
| plan | planner | Task tree decomposition |
| task-spec | task-designer | Structured task specification |
| implementation | executor | Code changes + commit |
| validation-findings | validator | Pass/fail + findings |
| debug-diagnosis | debugger | Root cause + fix |
| research-findings | researcher, product-researcher | Research output |
| audit-findings | architecture-auditor, plan-auditor, task-auditor | Review scores |
| integration-report | integration-checker | Cross-component check |
| code-analysis | codebase-analyst | Index update + findings |

Use ONLY these slugs in `provides:` tags. Do not invent new ones.
