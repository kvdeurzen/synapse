# Phase 9: Tech Debt Documentation Cleanup - Research

**Researched:** 2026-03-01
**Domain:** Documentation accuracy — planning files, REQUIREMENTS.md, tool descriptions
**Confidence:** HIGH

## Summary

Phase 9 is a pure documentation cleanup phase with no code changes. All four success criteria are mechanical text edits to planning files and one source file. The audit in `.planning/v1-MILESTONE-AUDIT.md` provides exact evidence for every change needed: the specific fields missing, the exact counts that are wrong, and the exact wording that is stale.

The work divides into two categories: (1) planning document edits — updating REQUIREMENTS.md and adding `requirements-completed` frontmatter to `03-01-SUMMARY.md`, and (2) a single source file edit — correcting the `delete_project` tool description string in `src/tools/delete-project.ts`. No test changes are needed because these are documentation-only changes with no behavioral impact.

The phase will be verifiable by reading the changed files and confirming each success criterion is true. There is no test infrastructure to run (nyquist_validation is not enabled in the project config). There are no library dependencies, no build steps, and no risk of regressions.

**Primary recommendation:** Implement all four changes in a single plan (09-01-PLAN.md) as four sequential tasks, one per success criterion. Each task is a targeted file edit with a clear before/after.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| Documentation accuracy | Fix 4 specific stale/incorrect documentation items identified by v1 audit | Each item is fully specified in the audit with exact evidence — see detailed findings below |
</phase_requirements>

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Text editor (Edit tool) | N/A | Targeted string replacement in files | Only tool needed — no libraries, no build |

### Supporting

None. This is a text-only documentation change.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual targeted edits | Scripted sed replacements | Manual edits are more readable and verifiable for small changes |

**Installation:** None required.

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All changes are to existing files.

### Pattern 1: Targeted String Replacement

**What:** Each change is a surgical replacement of one specific string/block in an existing file. Nothing is added or removed beyond the specific stale content.

**When to use:** Always — avoid reformatting surrounding content to minimize diff noise and review burden.

### Anti-Patterns to Avoid

- **Reformatting neighboring content:** Fix only what is stale. Do not reformat, reorder, or clean up surrounding lines.
- **Changing requirement checkbox state:** These are documentation accuracy fixes, not requirement status changes. Do NOT add/remove `[x]` checkboxes.
- **Touching ROADMAP.md:** ROADMAP.md uses plain prose and success criteria descriptions that reference the same stale wording — but ROADMAP.md is a phase plan artifact, not a requirements source of truth. The success criteria say to fix REQUIREMENTS.md, not ROADMAP.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying fixes | Custom verification script | Read the changed files directly | There are only 4 changes; visual inspection is sufficient |

## Common Pitfalls

### Pitfall 1: Changing Checkbox State in REQUIREMENTS.md

**What goes wrong:** The edit accidentally adds or removes `[x]` checkboxes while updating DOC-01 or FOUND-04 descriptions.

**Why it happens:** The description text is on the same line as the checkbox, so replacements that touch the full line can inadvertently change the checkbox state.

**How to avoid:** Replace only the description text after the requirement ID, leaving `- [x] **REQ-ID**:` prefix intact.

**Warning signs:** If the old_string for the Edit tool includes `- [x]`, double-check that new_string preserves the `[x]`.

### Pitfall 2: Wrong Table Count for delete_project

**What goes wrong:** The description says "5 tables" but TABLE_NAMES in `src/db/schema.ts` has 6 entries: `documents`, `doc_chunks`, `code_chunks`, `relationships`, `project_meta`, `activity_log`.

**Why it happens:** The `doc_chunks` table was added (as a separate table from `documents`) but the tool description was never updated. The original schema only expected 5 tables.

**How to avoid:** Count the TABLE_NAMES array in `src/db/schema.ts` (verified: 6 entries). The description should say "6 tables" and list all 6.

**Warning signs:** TABLE_NAMES = `["documents", "doc_chunks", "code_chunks", "relationships", "project_meta", "activity_log"]` — that is 6, not 5.

### Pitfall 3: EMBED-01/EMBED-02/EMBED-06 Already Present

**What goes wrong:** Assuming `requirements-completed` frontmatter already exists in `03-01-SUMMARY.md` and inserting a duplicate section.

**Why it happens:** The audit is clear that the field is missing entirely — but a planner or executor might recheck and find it was already added by a prior fix.

**How to avoid:** Read `03-01-SUMMARY.md` first. If `requirements-completed:` already exists, skip that task. If absent, add it.

**Warning signs:** Current file (verified 2026-03-01) has NO `requirements-completed:` field in frontmatter.

### Pitfall 4: DOC-01 Category Count vs List

**What goes wrong:** Updating the count in DOC-01 description without verifying the actual count in `src/tools/doc-constants.ts`.

**Why it happens:** The audit says "12, not 17" but a planner should confirm by counting `VALID_CATEGORIES` in `doc-constants.ts`.

**How to avoid:** Count `VALID_CATEGORIES` directly. Verified: the array has exactly 12 entries: `architecture_decision`, `design_pattern`, `glossary`, `code_pattern`, `dependency`, `plan`, `task_spec`, `requirement`, `technical_context`, `change_record`, `research`, `learning`.

### Pitfall 5: FOUND-04 Wording — Which Document Name

**What goes wrong:** The FOUND-04 description in REQUIREMENTS.md says "coding guidelines" but the locked decision was "Implementation Patterns" (documented in `04-CONTEXT.md`).

**Why it happens:** FOUND-04 was written before the Phase 4 CONTEXT.md discussion that replaced "Coding guidelines" with "Implementation Patterns."

**How to avoid:** The fix is to update the REQUIREMENTS.md FOUND-04 description to say "implementation patterns" (matching the `04-CONTEXT.md` locked decision). The init_project code was already implemented correctly with the right document — this is purely a description accuracy fix.

## Code Examples

### Change 1: Add requirements-completed to 03-01-SUMMARY.md

Current frontmatter (verified) ends with:
```yaml
---
phase: 03-embedding-service
plan: "01"
subsystem: embedding-service
tags: [embedding, ollama, lru-cache, retry, tdd, error-handling]
dependency_graph:
  ...
tech_stack:
  ...
key_files:
  ...
decisions:
  ...
metrics:
  duration: "4 min"
  completed_date: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---
```

After fix — add `requirements-completed:` block before the closing `---`:
```yaml
requirements-completed:
  - EMBED-01
  - EMBED-02
  - EMBED-06
```

Evidence: EMBED-01, EMBED-02, EMBED-06 are all verified as SATISFIED in `03-VERIFICATION.md` and attributed to Plan 03-01 in the Requirements Coverage table. EMBED-03, EMBED-04, EMBED-05 belong to Plan 03-02 and should NOT be in 03-01-SUMMARY.md.

### Change 2: Fix DOC-01 description in REQUIREMENTS.md

Current (line 31):
```markdown
- [x] **DOC-01**: User can store a document with title, content, category (17 types), and optional metadata via store_document
```

After fix:
```markdown
- [x] **DOC-01**: User can store a document with title, content, category (12 types), and optional metadata via store_document
```

Evidence: `src/tools/doc-constants.ts` `VALID_CATEGORIES` array has exactly 12 entries. The original 17-category count was from an earlier design iteration before the Phase 4 CONTEXT.md discussion reduced it to 12.

### Change 3: Fix FOUND-04 description in REQUIREMENTS.md

Current (line 15):
```markdown
- [x] **FOUND-04**: init_project seeds starter documents (project charter, ADR log template, coding guidelines, glossary)
```

After fix:
```markdown
- [x] **FOUND-04**: init_project seeds starter documents (project charter, ADR log template, implementation patterns, glossary)
```

Evidence: `04-CONTEXT.md` locked decision: "Coding guidelines replaced with Implementation Patterns — captures reusable technical decisions, not coding style rules." STATE.md decision log also confirms: "REQUIREMENTS.md/ROADMAP.md FOUND-04 says 'coding guidelines' but Implementation Patterns was the locked decision."

### Change 4: Fix delete_project tool description in src/tools/delete-project.ts

Current (lines 62-65):
```typescript
description:
  "Delete all data for a project across all tables. " +
  "Removes rows matching the given project_id from all 5 tables " +
  "(documents, code_chunks, relationships, project_meta, activity_log).",
```

After fix:
```typescript
description:
  "Delete all data for a project across all tables. " +
  "Removes rows matching the given project_id from all 6 tables " +
  "(documents, doc_chunks, code_chunks, relationships, project_meta, activity_log).",
```

Evidence: `src/db/schema.ts` `TABLE_NAMES` has 6 entries. The `doc_chunks` table holds embedded document chunk vectors and was added during Phase 4 but was omitted from the original tool description.

## State of the Art

This phase is a documentation cleanup with no technology dependencies. No library API research needed.

| Old State | Corrected State | Source of Truth |
|-----------|-----------------|-----------------|
| 03-01-SUMMARY.md has no `requirements-completed` field | Adds `EMBED-01`, `EMBED-02`, `EMBED-06` | 03-VERIFICATION.md requirements coverage table |
| DOC-01 says "17 types" | DOC-01 says "12 types" | `src/tools/doc-constants.ts` VALID_CATEGORIES (12 entries) |
| FOUND-04 says "coding guidelines" | FOUND-04 says "implementation patterns" | 04-CONTEXT.md locked decision |
| delete_project description says "5 tables" | Says "6 tables" with doc_chunks listed | `src/db/schema.ts` TABLE_NAMES (6 entries) |

## Open Questions

None. All four changes are fully specified by the audit and verifiable against source files. No ambiguity remains.

## Validation Architecture

`workflow.nyquist_validation` is not present in `.planning/config.json` — the config only has `mode`, `depth`, `parallelization`, `commit_docs`, `model_profile`, and `workflow` with sub-keys `research`, `plan_check`, `verifier`. No `nyquist_validation` key exists. Skipping validation architecture section.

## Sources

### Primary (HIGH confidence)

- `.planning/v1-MILESTONE-AUDIT.md` — v1 audit report with tech_debt items, exact evidence per item, verified 2026-03-01
- `src/db/schema.ts` TABLE_NAMES — confirmed 6 entries; `doc_chunks` is entry index 1
- `src/tools/doc-constants.ts` VALID_CATEGORIES — confirmed 12 entries
- `.planning/phases/03-embedding-service/03-01-SUMMARY.md` — confirmed no `requirements-completed` field in frontmatter
- `.planning/phases/03-embedding-service/03-VERIFICATION.md` — confirms EMBED-01, EMBED-02, EMBED-06 all satisfied by Plan 03-01
- `.planning/phases/04-document-management/04-CONTEXT.md` — locked decision: "Implementation Patterns" replaced "Coding guidelines"
- `src/tools/delete-project.ts` — current tool description says "5 tables" and omits doc_chunks
- `.planning/REQUIREMENTS.md` — DOC-01 line 31 currently says "17 types"; FOUND-04 line 15 says "coding guidelines"
- `.planning/config.json` — nyquist_validation not present; test validation architecture section skipped

### Secondary (MEDIUM confidence)

None needed — all changes verified from primary sources.

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Exact changes needed: HIGH — verified by reading all source files directly
- Scope completeness: HIGH — 4 success criteria map to exactly 4 file edits; nothing else claimed by this phase
- Risk of regression: HIGH confidence there is none — documentation-only; no code behavior changes

**Research date:** 2026-03-01
**Valid until:** Indefinite (documentation state does not change without explicit edits)
