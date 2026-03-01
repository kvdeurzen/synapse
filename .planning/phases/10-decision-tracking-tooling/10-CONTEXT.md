# Phase 10: Decision Tracking Tooling - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `decisions` LanceDB table and three MCP tools (`store_decision`, `query_decisions`, `check_precedent`) to the Synapse server. Decisions store architectural choices with tier-based categorization, semantic rationale embeddings, and precedent matching. This phase builds the data layer only — authority enforcement and trust-based access control are Phase 13/14 concerns.

</domain>

<decisions>
## Implementation Decisions

### Decision Data Model
- Two separate text fields: `context` (problem statement, constraints, alternatives considered) and `rationale` (justification for the chosen option)
- Alternatives tracked as structured text within the `context` field — no separate field needed
- `actor` field directly on the decision row for who created it (in addition to activity_log)
- `phase` nullable column for phase association — consistent with documents table pattern
- `decision_type` as an enum field (architectural, module, pattern, convention, tooling) — enables DEC-04's pre-filtering in check_precedent
- `superseded_by` nullable field pointing to the replacement decision_id
- Use the existing relationships table for linking decisions to documents/code (via `link_documents` pattern) — no direct `related_doc_ids` field

### store_decision Return Value
- Returns `{ decision_id, tier, tier_name, status, created_at, has_precedent }` — includes a quick precedent flag so agents know immediately if a similar decision exists

### Tier System
- Tier 0: Product Strategy (High impact — the "What/Why") — User Mandatory
- Tier 1: Architecture (High impact — Structure/Logic) — Strategic Approval
- Tier 2: Functional/Design (Medium impact — UX/Patterns) — Veto Power
- Tier 3: Execution (Low impact — Boilerplate/Syntax) — Autopilot (Logged)
- Store as Int32 (0-3) validated by Zod plus a `tier_name` enum string for readability
- Locked to exactly 0-3 — adding new tiers requires deliberate schema migration
- No tier-based enforcement in Phase 10 — authority checks are Phase 13 (Trust Matrix) and Phase 14 (Quality Gates)

### Precedent Matching (check_precedent)
- Accepts a full proposed decision as input: `{ subject, rationale, decision_type, tier }` — not just a query string
- Pre-filters by `decision_type` (from DEC-04), not by tier hierarchy
- Fixed similarity threshold at 0.85 — not configurable per query
- Returns top 5 matching decisions ranked by similarity
- Excludes superseded/revoked decisions by default; optional `include_inactive: true` flag to show them with status label
- No contradiction detection in Phase 10 — that's a Phase 14 Quality Gates concern

### Decision Lifecycle
- States: `active` → `superseded` → `revoked` (from DEC-05 requirements, not vision doc's enforced/deprecated/suggestion)
- Supersession is explicit: pass `supersedes: decision_id` param on store_decision to mark the old decision as superseded and set its `superseded_by` field
- Revocation is permanent — no reactivation; create a new decision instead
- Any status transition allowed (active→superseded, active→revoked, superseded→revoked) — Phase 14 hooks can add stricter rules later

### Claude's Discretion
- Embedding strategy for check_precedent: whether to embed rationale only or subject+rationale combined
- Exact Arrow schema field ordering and index configuration
- Activity log action names for decision mutations
- Error message wording and validation order

</decisions>

<specifics>
## Specific Ideas

- Tier definitions come from the project vision document (`.planning/brainstorm output/project_vision.md`) — the "Case Law" of Development concept
- check_precedent supports a "check before storing" workflow: agent calls check_precedent with proposed decision, reviews matches, then calls store_decision if no conflict
- The has_precedent boolean in store_decision's return gives agents an immediate signal without requiring a separate check_precedent call

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `registerXTool` pattern (`src/tools/*.ts`): All 18 existing tools follow the same registration pattern — new tools slot in identically
- Arrow schema definitions (`src/db/schema.ts`): TABLE_SCHEMAS registry and TABLE_NAMES const array — add `decisions` table here
- Zod row schemas (`src/db/schema.ts`): Validation schemas co-located with Arrow schemas — add DecisionRowSchema here
- `src/services/embedder.ts`: Existing embedding service for 768-dim vectors via Ollama — reuse for rationale embedding
- `src/tools/init-project.ts`: Creates all tables on init — extend to create decisions table
- Activity log pattern: All mutation tools log to activity_log — follow same pattern for decision mutations
- `src/query/hybrid-search.ts`: RRF hybrid search — could be reused for query_decisions if hybrid mode needed
- `src/utils/uuid.ts`: UUID generation for decision_id

### Established Patterns
- Tool registration: `registerXTool(server, config)` function exported from each tool file, imported and called in `server.ts`
- Schema definition: Arrow Schema + Zod schema + TABLE_NAMES/TABLE_SCHEMAS registry in `src/db/schema.ts`
- Table initialization: `src/db/connection.ts` creates tables from schemas on init
- Embedding on write: store_document embeds chunks via embedding service — same pattern for decision rationale
- Fail-fast on write when Ollama unavailable — read operations continue without embeddings

### Integration Points
- `src/server.ts`: Add `registerStoreDecisionTool`, `registerQueryDecisionsTool`, `registerCheckPrecedentTool` imports and registration calls
- `src/db/schema.ts`: Add DECISIONS_SCHEMA, DecisionRowSchema, extend TABLE_NAMES and TABLE_SCHEMAS
- `src/db/connection.ts`: Extend table creation to include decisions table with BTree + FTS indexes
- `src/tools/init-project.ts`: Add decisions table creation alongside existing 6 tables
- `src/types/`: Add decision types (DecisionRow, tier enum, decision_type enum, status enum)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-decision-tracking-tooling*
*Context gathered: 2026-03-01*
