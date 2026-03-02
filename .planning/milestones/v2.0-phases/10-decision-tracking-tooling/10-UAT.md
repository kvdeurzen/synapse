---
status: complete
phase: 10-decision-tracking-tooling
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md
started: 2026-03-01T19:00:00Z
updated: 2026-03-01T19:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Store a Decision
expected: Call store_decision with valid subject, rationale, tier (0-3), and decision_type. Tool returns success with decision_id, timestamps, has_precedent field, and stored decision data.
result: pass
verified_by: test/tools/store-decision.test.ts — "stores a new decision and returns expected result shape" asserts decision_id (ULID 26-char), tier, tier_name, status, created_at, has_precedent

### 2. Store Decision Input Validation
expected: Call store_decision with an invalid tier (e.g., 5) or missing required field. Tool returns a clear validation error describing what's wrong.
result: pass
verified_by: test/tools/store-decision.test.ts — 5 validation tests (invalid tier 5, negative tier, invalid decision_type, empty subject, empty rationale) all throw via Zod schema

### 3. Supersede an Existing Decision
expected: Store a new decision with the `supersedes` parameter set to the first decision's ID. Tool returns success. Querying the original decision afterwards shows its status changed to "superseded" and superseded_by is set.
result: pass
verified_by: test/tools/store-decision.test.ts — "supersedes existing decision correctly" asserts old row status=superseded, superseded_by=new ID

### 4. Query Decisions with Filters
expected: Call query_decisions with a tier or status filter. Only decisions matching the filter are returned. Each result includes id, subject, tier, decision_type, status, rationale, tags, phase — but no vector field.
result: pass
verified_by: test/tools/query-decisions.test.ts — "filters by tier", "filters by status", "filters by decision_type", "returns correct result shape" (asserts vector not in result)

### 5. Query Decisions Subject Search
expected: Call query_decisions with a subject substring. Only decisions whose subject contains that substring are returned.
result: pass
verified_by: test/tools/query-decisions.test.ts — "filters by subject substring (case-insensitive)" — JS post-filter with toLowerCase().includes()

### 6. Check Precedent
expected: Call check_precedent with a rationale similar to an existing stored decision and the same decision_type. Returns has_precedent=true with a matches array containing similar decisions ranked by similarity score.
result: pass
verified_by: test/tools/check-precedent.test.ts — "returns has_precedent true with matching decisions above 0.85 threshold" + full result shape assertions (similarity_score, decision_id, subject, choice, etc.)

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
