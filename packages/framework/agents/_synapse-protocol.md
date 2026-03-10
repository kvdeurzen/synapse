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
