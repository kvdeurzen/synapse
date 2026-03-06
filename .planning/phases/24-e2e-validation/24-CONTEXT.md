# Phase 24: E2E Validation - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Run the complete RPEV cycle on a real external project to validate the system works end-to-end. Install Synapse fresh, run Refine→Plan→Execute→Validate with default involvement config, verify hooks fire, document failures, patch blockers, and confirm /synapse:status accuracy. This phase does NOT add new features — it validates what's been built.

</domain>

<decisions>
## Implementation Decisions

### Test Task Selection
- Use **rpi-camera-py** (located at `../rpi-camera-py`) as the external demo project — a real, small codebase needing refactoring and feature work
- **Full install flow**: run `install.sh` + `/synapse:init` on rpi-camera-py before starting the RPEV cycle. This exercises the install script (Phase 22) as part of E2E
- **Let the RPEV cycle decide** what to work on — start with open-ended Refine on the whole project. System identifies refactoring and feature opportunities
- **Alpha release required first**: commit all untracked framework files, tag `v3.0.0-alpha.1`, push to GitHub, create release with tarball — install.sh needs a real download URL
- Update `install.sh` download URL to point at the **real GitHub repo**
- Alpha release creation is a **pre-step in Plan 24-01** (not a separate prerequisite)

### Involvement Config
- Use **default involvement matrix** — project=drives/co-pilot, epic=co-pilot/reviews, feature/wp=autopilot
- **Active participation** in Refine — engage with questions, make decisions, shape the epic/feature structure. Tests the full co-pilot experience
- **No domain overrides** for this run — keep it simple
- **Default 3 pool slots** — tests real pool manager behavior including parallelism and finish-first policy
- **No explicit cost cap** — scope naturally bounded through active participation in Refine
- **SC1 reinterpretation**: "without manual intervention" means the RPEV machinery handles all stage transitions. User participates where the involvement matrix says to (drives/co-pilot/reviews). No manual tool calls, no debugging workarounds needed

### Fix Scope and Patching Strategy
- **Surgical patches only** — fix the immediate issue with minimal changes. Deeper architectural problems documented as known limitations and deferred
- **Log failures as they happen** — document each failure when it occurs during the E2E run (root cause, workaround if any, severity). Preserves context while fresh
- **Failure log location**: `.planning/phases/24-e2e-validation/24-FAILURE-LOG.md` — markdown file alongside phase plans
- **Patch all blockers, document non-blockers** — fix anything that blocks the RPEV cycle from completing, even if more than 3. Only leave cosmetic/non-blocking issues for future work
- **Abbreviated re-run after patches** — re-run the RPEV cycle (or a subset of it) on rpi-camera-py to confirm patches work. Not a full re-run, just verify the fixed paths
- **Tag v3.0.0-alpha.2** after patches for the re-run — install.sh on rpi-camera-py gets the fixed code

### Verification Method
- **SC1 (RPEV cycle completes)**: Pass = ALL planned tasks complete through full RPEV. Every task created during Refine must reach DONE
- **SC2 (hooks verified)**: Parse `.synapse-audit.log` after the run — verify entries for key tool calls (init_project, store_document, create_task, update_task, get_task_tree, etc.) with timestamps within the run window
- **SC3 (failure log)**: Captured in `24-FAILURE-LOG.md` with root causes and patches applied
- **SC4 (status matches)**: Manual comparison with checklist — run /synapse:status and get_task_tree side by side, walk through: epic names match, completion %s match, stage badges match, blocked items match
- **Verification results section** in `24-FAILURE-LOG.md` with pass/fail for each SC. Single document for all E2E findings

### Claude's Discretion
- How to structure the alpha release process (GitHub CLI commands, release notes)
- Exact checklist items for SC4 manual comparison
- How to handle the abbreviated re-run scope (which paths to re-test)
- Whether to fix stale test_project/trust.toml as part of patching or leave it
- Audit log parsing approach (manual scan vs simple grep script)

</decisions>

<specifics>
## Specific Ideas

- The rpi-camera-py project is real and actively needed — this isn't a throwaway test. The refactoring work done by the RPEV cycle has genuine value
- Full install flow tests the entire user journey: install.sh → /synapse:init → /synapse:map → /synapse:refine → system takes over
- Active Refine participation means the user can steer toward a realistic scope — not too big (burn budget), not too small (miss testing paths)
- Logging failures as they happen preserves the "what did we see and when" narrative that's valuable for future operators
- The alpha.1 → patches → alpha.2 → re-run sequence mimics a real release cycle

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `install.sh` (packages/server/install.sh): Install script with local dev detection — needs real GitHub URL added
- `synapse-orchestrator.md`: 475-line agent prompt driving RPEV with pool manager, stage documents, handoff blocks
- `pev-workflow.md`: 316-line workflow spec with involvement matrix, JIT decomposition, failure escalation
- `audit-log.js`: Comprehensive hook logging all tool calls with token estimates to `.synapse-audit.log`
- `synapse-startup.js`: 354-line hook injecting project context, RPEV matrix, pool config, domain modes, skill manifest
- All 5 slash commands (`init`, `map`, `refine`, `status`, `focus`) fully implemented

### Established Patterns
- RPEV stage tracked via `store_document` with `doc_id: rpev-stage-[task_id]`
- Pool state tracked via `store_document` with `doc_id: pool-state-[project_id]`
- Subagents spawned via Task tool with SYNAPSE HANDOFF block (6 required fields)
- Executor subagents use `isolation: "worktree"` for git isolation
- Hook paths use `$CLAUDE_PROJECT_DIR` prefix

### Integration Points
- install.sh download URL needs updating to real GitHub repo
- All untracked files (.claude/agents, hooks, commands, skills, .mcp.json) must be committed before release
- rpi-camera-py is in parent directory (`../rpi-camera-py`) — external to Synapse repo

### Known Issues from Scout
- `test_project/trust.toml` has stale `[pev]` schema — missing involvement matrix
- `init.md` step 6 documents stale trust.toml schema vs actual `[rpev.involvement]`
- No existing E2E test — this phase creates the first one
- Behavioral fixtures referenced in scorecard TOML do not exist yet

</code_context>

<deferred>
## Deferred Ideas

- **Automated E2E test suite** — out of scope per REQUIREMENTS.md (PEV involves subagent spawning that cannot be meaningfully mocked; manual validation)
- **Scorecard runner for behavioral fixtures** — the TOML scorecard format exists but no evaluation code. Could be a v3.1 item
- **Domain override testing** — deferred, can test in a follow-up run
- **Full autopilot E2E run** — interesting to test the fully autonomous path but not in scope for this validation

</deferred>

---

*Phase: 24-e2e-validation*
*Context gathered: 2026-03-06*
