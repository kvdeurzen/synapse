# Decision Draft Flow

Referenced by: doer agents (architect, planner, task-designer), reviewer agents (architecture-auditor, plan-auditor, task-auditor)

## Principle

No decision becomes active without passing through a reviewer. Doer agents propose decisions as draft documents. Reviewer agents verify quality, then store the real decision via store_decision (which defaults to active status).

## Why Document-Based Drafts

The store_decision MCP tool only supports ["active", "superseded", "revoked"] statuses. There is no "draft" status. Therefore:
- Doers store decision proposals as documents (not decisions)
- Reviewers promote approved proposals to real decisions via store_decision

## Doer Protocol (proposing a decision)

1. Check precedent: `check_precedent(description: "{topic}")` -- verify no conflicting active decision exists
2. Store as draft document:
   ```
   store_document(
     doc_id: "decision-draft-{slug}",
     category: "decision_draft",
     title: "DRAFT: {decision title}",
     content: JSON with: { tier, subject, choice, context, rationale, proposed_by, decision_type, tags },
     actor: "{doer-agent-slug}"
   )
   ```
3. Report draft to orchestrator/gateway: "Stored decision draft: decision-draft-{slug}. Needs reviewer activation."
4. NEVER call store_decision directly. All decisions go through the reviewer gate.

Exception: Tier 3 (execution) decisions during implementation -- executors can store Tier 3 decisions directly as active (reviewer validates post-hoc). This is unchanged from the existing pattern.

## Reviewer Protocol (activating a decision)

1. Read the draft document: `query_documents(category: "decision_draft")`
2. Verify:
   - Rationale quality: clear alternatives considered, trade-offs documented
   - Precedent conflicts: `check_precedent` against the draft's subject
   - Tier correctness: draft tier matches the agent's authority
   - Scope: decision addresses the right level of concern
3. If APPROVED:
   - Call `store_decision(...)` with all fields from the draft document, adding `actor: "{reviewer-slug}"`
   - Delete or mark the draft document as consumed: `store_document(doc_id: "decision-draft-{slug}", status: "archived", ...)`
   - Report: "Decision activated: {title}"
4. If REJECTED:
   - Store rejection document: `store_document(doc_id: "rejection-decision-draft-{slug}", category: "decision_draft", content: "Rejection reason...")`
   - Report: "Decision draft rejected: {reason}"

## Tier-Based Routing

| Decision Tier | Proposed By | Reviewed By | User Approval |
|---------------|-------------|-------------|---------------|
| 0 (product) | Gateway captures from user | N/A -- user IS the decision-maker | Always |
| 1 (architecture) | Architect | Architecture Auditor | Per involvement mode (Tier 0-1) |
| 2 (functional) | Planner or Task Designer | Plan Auditor or Task Auditor | Per involvement mode |
| 3 (execution) | Executor (direct active) | Validator (post-hoc) | Never |

## Anti-Patterns

- Calling store_decision(status: "draft") -- this status does not exist; the tool defaults to "active"
- Doer calling store_decision directly (except Tier 3 executors)
- Reviewer creating new decisions instead of activating drafts
- Skipping check_precedent before proposing
