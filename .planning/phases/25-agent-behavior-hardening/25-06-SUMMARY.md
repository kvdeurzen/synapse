---
phase: 25-agent-behavior-hardening
plan: 06
subsystem: agents
tags: [git, gh-cli, pull-request, rollback, rpev, orchestrator, code-review]

# Dependency graph
requires:
  - phase: 25-agent-behavior-hardening
    provides: feature branches, sequential merge pattern, executor commit protocol
provides:
  - PR-based merge workflow replacing direct merge to main
  - Structured PR template with RPEV stage doc, task commits, and decision links
  - Involvement-mode-aware merge gate (auto vs. user approval)
  - Explicit git revert commands for task/feature/post-merge rollback scenarios
  - Safety rules preventing force-push and reset --hard
affects: [25-agent-behavior-hardening, executor, integration-checker, synapse-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PR as RPEV documentation: PR body links stage doc, task commits, decisions"
    - "Involvement-mode merge gate: autopilot/monitors auto-merge, others await user"
    - "git revert over git reset: creates audit trail, preserves history"

key-files:
  created: []
  modified:
    - packages/framework/agents/synapse-orchestrator.md

key-decisions:
  - "PR workflow replaces direct merge to main — feature completion creates gh pr create with structured template linking RPEV stage doc, task commits, and decision references"
  - "Merge gate is involvement-mode dependent: autopilot/monitors auto-merge immediately (gh pr merge --merge --delete-branch); co-pilot/reviews/drives set pending_approval=true and await user action"
  - "Rollback uses git revert not git reset — explicit revert commands for task rollback, feature rollback (PR not yet merged), and post-merge rollback; NEVER force-push to main"
  - "Feature branch cleanup happens after successful merge via git branch -d (local cleanup)"

patterns-established:
  - "PR body template: always includes epic, RPEV stage doc ID, task commits, decision refs, validation checklist"
  - "Store PR URL in stage document notes for traceability"
  - "Run tree-integrity check before marking feature task done, even after merge"

requirements-completed: [ABH-08]

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 25 Plan 06: PR Workflow Summary

**PR-based merge gate added to orchestrator: gh pr create with structured RPEV template, involvement-mode-aware auto/manual merge, and explicit git revert rollback commands for all failure scenarios**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T08:15:39Z
- **Completed:** 2026-03-07T08:19:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Added "PR Workflow" section to synapse-orchestrator.md replacing direct merge with `gh pr create` flow
- Defined structured PR template with epic title, RPEV stage doc ID, per-task commit list, decision references, and validation checklist
- Added involvement-mode merge gate table: autopilot/monitors auto-merge, reviews/co-pilot/drives await user approval
- Replaced vague rollback protocol with explicit git commands for three scenarios: task rollback (git revert commit), feature rollback pre-merge (gh pr close + branch delete), feature rollback post-merge (git revert -m 1 merge commit)
- Added safety rules section: NEVER force-push to main, NEVER git reset --hard on shared branches, prefer git revert

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace direct merge with PR workflow and add explicit rollback commands** - `c79e2f9` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

- `/home/kanter/code/synapse/packages/framework/agents/synapse-orchestrator.md` - Added PR Workflow section, updated Wave Execution step 7, replaced Rollback Protocol with explicit git commands, updated Merge strategy subsection

## Decisions Made

- PR workflow replaces direct merge to main — feature completion creates `gh pr create` with structured template linking RPEV stage doc, task commits, and decision references. Rationale: PRs provide code review, traceability, and serve as natural RPEV documentation anchors.
- Merge gate is involvement-mode dependent: autopilot/monitors auto-merge immediately (`gh pr merge --merge --delete-branch`); co-pilot/reviews/drives set `pending_approval=true` and await user action. Rationale: mirrors existing involvement matrix semantics already established in Phase 18.
- Rollback uses `git revert` not `git reset` — explicit revert commands for task rollback, feature rollback (PR not yet merged), and post-merge rollback; NEVER force-push to main. Rationale: revert creates an audit trail; reset rewrites history and is unsafe on shared branches.
- Feature branch cleanup via `git branch -d` (local) happens after merge; remote branch deleted by `--delete-branch` flag in gh pr merge. Rationale: clean worktree after PR lands.

## Deviations from Plan

None - plan executed exactly as written. All four modification points applied precisely as specified in the plan action.

## Issues Encountered

None. The orchestrator file had clear section boundaries matching the plan's line references. All grep verification checks passed (gh pr create: 2, gh pr merge: 3, git revert: 4, Merge Gate: present, --delete-branch: 2).

## User Setup Required

None - no external service configuration required. Changes are to agent prompt text only.

## Next Phase Readiness

- Plan 25-06 complete. Phase 25 now has all 6 plans complete (01, 02, 03, 05, 06 done; 04 is E2E re-validation waiting on wave completion).
- Orchestrator now has a complete PR-based merge workflow. Feature branches are created, integration-checked, and surfaced as PRs with full RPEV context. Merge gate respects the involvement matrix. Rollback has explicit git commands.
- Phase 24 plan 04 (E2E re-validation) is the remaining work to verify the hardened orchestrator works end-to-end.

## Self-Check: PASSED

- synapse-orchestrator.md: FOUND at packages/framework/agents/synapse-orchestrator.md
- 25-06-SUMMARY.md: FOUND at .planning/phases/25-agent-behavior-hardening/25-06-SUMMARY.md
- Task 1 commit c79e2f9: FOUND in git log
- Final metadata commit 6d7383d: FOUND in git log

---
*Phase: 25-agent-behavior-hardening*
*Completed: 2026-03-07*
