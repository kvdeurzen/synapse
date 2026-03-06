# Phase 24: E2E Validation - Research

**Researched:** 2026-03-06
**Domain:** End-to-end workflow validation, GitHub release engineering, audit log verification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test Task Selection**
- Use **rpi-camera-py** (located at `../rpi-camera-py` — actual path: `/home/kanter/code/rpi-camera-py`) as the external demo project — a real, small codebase needing refactoring and feature work
- **Full install flow**: run `install.sh` + `/synapse:init` on rpi-camera-py before starting the RPEV cycle. This exercises the install script (Phase 22) as part of E2E
- **Let the RPEV cycle decide** what to work on — start with open-ended Refine on the whole project. System identifies refactoring and feature opportunities
- **Alpha release required first**: commit all untracked framework files, tag `v3.0.0-alpha.1`, push to GitHub, create release with tarball — install.sh needs a real download URL
- Update `install.sh` download URL to point at the **real GitHub repo** (`kvdeurzen/synapse`)
- Alpha release creation is a **pre-step in Plan 24-01** (not a separate prerequisite)

**Involvement Config**
- Use **default involvement matrix** — project=drives/co-pilot, epic=co-pilot/reviews, feature/wp=autopilot
- **Active participation** in Refine — engage with questions, make decisions, shape the epic/feature structure. Tests the full co-pilot experience
- **No domain overrides** for this run — keep it simple
- **Default 3 pool slots** — tests real pool manager behavior including parallelism and finish-first policy
- **No explicit cost cap** — scope naturally bounded through active participation in Refine
- **SC1 reinterpretation**: "without manual intervention" means the RPEV machinery handles all stage transitions. User participates where the involvement matrix says to (drives/co-pilot/reviews). No manual tool calls, no debugging workarounds needed

**Fix Scope and Patching Strategy**
- **Surgical patches only** — fix the immediate issue with minimal changes. Deeper architectural problems documented as known limitations and deferred
- **Log failures as they happen** — document each failure when it occurs during the E2E run (root cause, workaround if any, severity). Preserves context while fresh
- **Failure log location**: `.planning/phases/24-e2e-validation/24-FAILURE-LOG.md` — markdown file alongside phase plans
- **Patch all blockers, document non-blockers** — fix anything that blocks the RPEV cycle from completing, even if more than 3. Only leave cosmetic/non-blocking issues for future work
- **Abbreviated re-run after patches** — re-run the RPEV cycle (or a subset of it) on rpi-camera-py to confirm patches work. Not a full re-run, just verify the fixed paths
- **Tag v3.0.0-alpha.2** after patches for the re-run — install.sh on rpi-camera-py gets the fixed code

**Verification Method**
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

### Deferred Ideas (OUT OF SCOPE)
- **Automated E2E test suite** — out of scope per REQUIREMENTS.md (PEV involves subagent spawning that cannot be meaningfully mocked; manual validation)
- **Scorecard runner for behavioral fixtures** — the TOML scorecard format exists but no evaluation code. Could be a v3.1 item
- **Domain override testing** — deferred, can test in a follow-up run
- **Full autopilot E2E run** — interesting to test the fully autonomous path but not in scope for this validation

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| E2E-01 | Full RPEV cycle runs on a real task (refine → plan → execute → validate) | Alpha release flow + full install + RPEV orchestrator docs establish the sequence; rpi-camera-py is a confirmed live Python project at `/home/kanter/code/rpi-camera-py` with 727 lines of real code |
| E2E-02 | Hooks verified firing via audit log presence after tool calls | audit-log.js is PostToolUse, appends JSON to `.synapse-audit.log`; research identifies key tool calls to look for and grep pattern to verify |
| E2E-03 | Failure log documented with root causes and patches for top-3 issues | `24-FAILURE-LOG.md` pattern established; failure modes pre-identified from code inspection so logging structure is ready before run starts |
| E2E-04 | `/synapse:status` output matches task tree state at completion | status.md uses stage documents as authoritative source; SC4 manual comparison checklist defined |

</phase_requirements>

## Summary

Phase 24 is a pure validation phase — no new features are built, only the existing system is exercised end-to-end. It has three distinct sub-problems: (1) release engineering to create a real GitHub release so install.sh can download it, (2) running the full RPEV cycle on a real external project, and (3) documenting failures and verifying success criteria.

The technical work in Plan 24-01 is almost entirely pre-flight: committing 25+ untracked files from `.claude/agents/`, `.claude/hooks/`, `.claude/commands/`, `.claude/skills/`, `.mcp.json`, and `packages/server/install.sh`, then creating the `v3.0.0-alpha.1` GitHub release. Only after that can install.sh download from a real URL. The RPEV run itself is interactive — the plan must guide the user through the sequence but cannot fully automate it since "drives" and "co-pilot" involvement modes require real user participation.

Plan 24-02 is the patch-and-verify cycle: apply surgical fixes to any blockers found during the initial run, tag `v3.0.0-alpha.2`, run an abbreviated re-run to confirm fixes, and verify all four success criteria. The failure log (`24-FAILURE-LOG.md`) is maintained throughout — documenting issues as they surface keeps context fresh and produces the SC3 artifact.

**Primary recommendation:** Structure two plans: 24-01 covers alpha release + RPEV run; 24-02 covers patch cycle + success criteria verification. Both plans are sequential with clear handoff points.

## Standard Stack

### Core Tools in Play

| Tool | Purpose | Where Used |
|------|---------|------------|
| `gh` (GitHub CLI) | Create release, upload tarball | Plan 24-01, alpha release step |
| `git tag` | Tag v3.0.0-alpha.1 / v3.0.0-alpha.2 | Plan 24-01 and 24-02 |
| `bun install.sh` | Install Synapse into rpi-camera-py | Plan 24-01 |
| `/synapse:init` | Initialize rpi-camera-py as Synapse project | Plan 24-01 |
| `/synapse:map` | Index rpi-camera-py codebase | Plan 24-01 |
| `/synapse:refine` | Start RPEV cycle via Refine stage | Plan 24-01 |
| `/synapse:status` | SC4 verification | Plan 24-02 |
| `grep` / `jq` / `bun` script | Audit log parsing for SC2 | Plan 24-02 |

### Alpha Release: GitHub CLI Commands

Creating a GitHub release from the command line (confidence: HIGH — standard gh workflow):

```bash
# Stage and commit all untracked framework files
git add .claude/agents/ .claude/commands/ .claude/hooks/ .claude/skills/ .mcp.json
git add packages/server/install.sh
git commit -m "chore: commit framework files for v3.0.0-alpha.1 release"

# Tag and push
git tag v3.0.0-alpha.1
git push origin main
git push origin v3.0.0-alpha.1

# Create GitHub release (GitHub auto-creates source tarball from tag)
gh release create v3.0.0-alpha.1 \
  --title "Synapse v3.0.0-alpha.1" \
  --notes "Alpha release for E2E validation. Full RPEV workflow with pool manager, skills, and install script." \
  --prerelease
```

After the release is created, the tarball URL is automatically available as:
`https://github.com/kvdeurzen/synapse/archive/refs/tags/v3.0.0-alpha.1.tar.gz`

The install.sh already uses this URL pattern — it fetches `https://api.github.com/repos/kvdeurzen/synapse/releases/latest` to get the tag, then constructs the tarball URL. No hardcoded URL change needed; install.sh dynamically resolves it.

### Audit Log Parsing

The audit log at `.synapse-audit.log` in rpi-camera-py contains newline-delimited JSON (one object per line). Each entry has: `ts`, `tool`, `agent`, `project_id`, `input_tokens`, `output_tokens`, `input_keys`.

```bash
# Count entries by tool name (bun one-liner)
bun -e "
  const lines = require('fs').readFileSync('.synapse-audit.log','utf8').trim().split('\n');
  const counts = {};
  lines.forEach(l => { const e = JSON.parse(l); counts[e.tool] = (counts[e.tool]||0)+1; });
  console.log(JSON.stringify(counts, null, 2));
"

# Quick grep for specific tool
grep '"tool":"mcp__synapse__create_task"' .synapse-audit.log | wc -l

# Show all unique tools used
grep -o '"tool":"[^"]*"' .synapse-audit.log | sort -u
```

Key Synapse MCP tools that MUST appear in the log for SC2 to pass:
- `mcp__synapse__init_project` — from /synapse:init
- `mcp__synapse__store_document` — stage documents, refinement state
- `mcp__synapse__create_task` — task creation during Refine/Plan
- `mcp__synapse__update_task` — status updates during Execute/Validate
- `mcp__synapse__get_task_tree` — orchestrator reads task tree
- `mcp__synapse__get_smart_context` — context fetching by agents

## Architecture Patterns

### Phase Structure

```
Phase 24 (2 plans)
├── 24-01: Alpha Release + RPEV Run          # Pre-flight + E2E execution
│   ├── Task: Commit untracked files
│   ├── Task: Tag + create GitHub release
│   ├── Task: Install Synapse on rpi-camera-py
│   └── Task: Run RPEV cycle (interactive — user-driven Refine)
└── 24-02: Patch + Verify                   # Post-run fixes + verification
    ├── Task: Apply patches to blockers
    ├── Task: Tag v3.0.0-alpha.2 + re-install
    ├── Task: Abbreviated re-run verification
    └── Task: SC1-SC4 verification checklist
```

### E2E Run Sequence

The exact sequence the user must follow to exercise the full RPEV cycle:

```
1. cd /home/kanter/code/rpi-camera-py
2. curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/v3.0.0-alpha.1/packages/server/install.sh | bash
   # OR: bash /home/kanter/code/synapse/packages/server/install.sh (local dev mode)
3. Open Claude Code in /home/kanter/code/rpi-camera-py
4. /synapse:init  (confirm project_id, accept defaults, walk RPEV matrix)
5. /synapse:map   (index codebase — requires Ollama running)
6. /synapse:refine  (drives mode at project level — user steers scope)
7. After Refine completes: orchestrator auto-triggers Plan (co-pilot/reviews at epic)
8. After Plan: orchestrator dispatches Execute (autopilot at feature/wp)
9. Validate runs via pool (autopilot)
10. /synapse:status to verify SC4
```

**Local dev mode shortcut**: install.sh detects `packages/server/src/index.ts` in the current directory and skips GitHub download. Since rpi-camera-py is adjacent to the synapse repo, running install.sh from a copy in rpi-camera-py itself will NOT trigger dev mode. Must use the URL or copy the install.sh to rpi-camera-py.

### SC4 Comparison Checklist

Manual comparison between `/synapse:status` output and direct `get_task_tree` data:

| Check | Pass Condition |
|-------|---------------|
| Epic names | Status dashboard epic titles match get_task_tree depth=0 task titles |
| Completion percentages | Status shows X% — manually count done/total tasks in tree, confirm match |
| RPEV stage badges | Status [EXECUTING]/[DONE]/etc. match stage documents (query_documents category=plan, tags=rpev-stage) |
| Blocked items | Status "Needs Your Input" section lists same pending_approval=true items as stage docs |
| Task counts | Feature task counts in status (N/M done) match get_task_tree child counts |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub release creation | Shell scripting with curl to GitHub API | `gh release create` | Built-in auth, handles tarball attachment, prerelease flags |
| Tarball download URL | Hardcoded URL in install.sh | Dynamic fetch via GitHub API (already in install.sh) | install.sh already fetches latest tag from `releases/latest` endpoint |
| Audit log parsing | Custom parser | Simple grep + bun one-liner | Log is newline-delimited JSON, not complex; bun already required |
| Version tracking | Separate file | Git tags | git tag is the source of truth for install.sh version resolution |

## Common Pitfalls

### Pitfall 1: install.sh Local Dev Mode Bypass

**What goes wrong:** Running `bash install.sh` from within the synapse repo itself (or a copy that still has `packages/server/src/index.ts`) triggers local dev mode and skips the tarball download entirely. The E2E is supposed to exercise the download path.

**Why it happens:** install.sh Section 5 checks for `$TARGET_DIR/packages/server/src/index.ts`. If the install.sh is copied to rpi-camera-py alongside a `packages/` directory structure, dev mode fires.

**How to avoid:** Run install.sh from rpi-camera-py using the GitHub URL: `curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/v3.0.0-alpha.1/packages/server/install.sh | bash`. This sets TARGET_DIR to rpi-camera-py's path (no packages/ directory there).

**Warning signs:** install.sh prints "Running from Synapse repo — using local files (development mode)"

### Pitfall 2: Ollama Not Running Before /synapse:map

**What goes wrong:** `/synapse:map` calls `index_codebase` which requires Ollama + nomic-embed-text. If Ollama is not running, the semantic search index is empty. The RPEV cycle can still proceed but get_smart_context returns empty results — agents work from blank context.

**Why it happens:** Ollama must be started manually; install.sh warns but does not start it.

**How to avoid:** Before running /synapse:map, verify `curl -sf http://localhost:11434/api/tags` returns successfully. Run `ollama serve` if needed.

**Warning signs:** install.sh "smoke test failed" warning, or get_smart_context returning no results during RPEV run.

### Pitfall 3: project_id Mismatch Between Sessions

**What goes wrong:** If /synapse:init is run twice (or rpi-camera-py already has a .synapse directory from a previous test), the project_id may differ from what the orchestrator expects. MCP queries return wrong results.

**Why it happens:** The already-installed detection in install.sh (Section 3c) prompts for update; if user says no, old config persists. Re-running /synapse:init preserves project_id but warns.

**How to avoid:** Before starting the E2E run, verify `.synapse/config/project.toml` is clean or absent. If it exists, confirm project_id is `rpi-camera`.

**Warning signs:** MCP calls returning empty results even though data exists.

### Pitfall 4: Stale Pool State from Previous Sessions

**What goes wrong:** If a previous session left pool-state document with non-null slots, the orchestrator's session startup recovery may incorrectly re-queue tasks from an earlier aborted run.

**Why it happens:** The Pool Manager Protocol's "Session Start Recovery" reads `pool-state-[project_id]` and re-queues in-progress tasks. If rpi-camera-py was previously initialized, stale state exists.

**How to avoid:** If restarting after a failed run, check pool-state document via `query_documents(category: "plan", tags: "|pool-state|")` and clear it before continuing.

**Warning signs:** Orchestrator emitting "Found N abandoned in-flight tasks from previous session" at session start.

### Pitfall 5: trust.toml Missing [rpev] Section After Init

**What goes wrong:** `/synapse:init` creates trust.toml but the init.md step 6 documents a stale `[pev]` schema (known issue from CONTEXT.md). If the written trust.toml uses old schema, synapse-startup.js cannot inject the RPEV matrix.

**Why it happens:** The known issue: `test_project/trust.toml` has stale `[pev]` schema; `init.md` step 6 shows stale schema. The template at `packages/framework/config/trust.toml` is correct (`[rpev.involvement]`), but init.md may write a different format.

**How to avoid:** After /synapse:init completes, read `.synapse/config/trust.toml` and verify it has `[rpev.involvement]` section (not `[pev]`). If wrong, manually patch to match `packages/framework/config/trust.toml` format.

**Warning signs:** synapse-startup.js injects no RPEV matrix section in additionalContext; agents don't see involvement matrix.

### Pitfall 6: Untracked Files Not Included in Release Tarball

**What goes wrong:** The GitHub release tarball is built from the git tree, not the working directory. Any files not committed before tagging will be absent from the tarball.

**Why it happens:** 25+ files in `.claude/` and `packages/server/install.sh` are currently untracked (confirmed by git status). The tarball will be missing these if they're not committed first.

**How to avoid:** `git status --short` before tagging to confirm no untracked framework files remain. The commit must include all of: `.claude/agents/` (11 files), `.claude/commands/synapse/` (5 files), `.claude/hooks/` (all .js + lib/), `.claude/skills/` (all directories), `.mcp.json`, `packages/server/install.sh`.

**Warning signs:** install.sh copies 0 agents or 0 hooks after tarball extraction.

### Pitfall 7: GitHub Tarball Extraction Directory Name

**What goes wrong:** install.sh expects the GitHub tarball to extract to `synapse-3.0.0-alpha.1/` (strips leading `v`). If the tag is `v3.0.0-alpha.1`, GitHub extracts to `synapse-3.0.0-alpha.1/`. The install.sh handles this with `EXTRACTED_TAG="${VERSION#v}"`.

**Why it happens:** GitHub strips the `v` prefix when naming the extracted directory.

**How to avoid:** No change needed — install.sh already handles this case. But verify by checking `EXTRACTED_DIR` computation in install.sh Section 5 against actual GitHub extraction behavior.

**Warning signs:** install.sh prints "Could not find extracted tarball directory" error.

## Code Examples

### Creating the Alpha Release

```bash
# From /home/kanter/code/synapse

# 1. Stage all untracked framework files
git add .claude/agents/architect.md .claude/agents/codebase-analyst.md \
  .claude/agents/debugger.md .claude/agents/decomposer.md \
  .claude/agents/executor.md .claude/agents/integration-checker.md \
  .claude/agents/plan-reviewer.md .claude/agents/product-strategist.md \
  .claude/agents/researcher.md .claude/agents/synapse-orchestrator.md \
  .claude/agents/validator.md
git add .claude/commands/synapse/
git add .claude/hooks/audit-log.js .claude/hooks/precedent-gate.js \
  .claude/hooks/synapse-audit.js .claude/hooks/synapse-startup.js \
  .claude/hooks/synapse-statusline.js .claude/hooks/tier-gate.js \
  .claude/hooks/tool-allowlist.js .claude/hooks/lib/
git add .claude/skills/
git add .mcp.json
git add packages/server/install.sh

# 2. Commit
git commit -m "chore: add framework files for v3.0.0-alpha.1 release"

# 3. Tag
git tag v3.0.0-alpha.1
git push origin main
git push origin v3.0.0-alpha.1

# 4. Create GitHub release (prerelease flag)
gh release create v3.0.0-alpha.1 \
  --title "Synapse v3.0.0-alpha.1 — Working Prototype" \
  --notes "$(cat <<'EOF'
First alpha release of the v3.0 Working Prototype milestone.

Includes:
- Complete RPEV orchestration (Refine → Plan → Execute → Validate)
- Agent pool manager with parallel execution
- Synapse install script
- Skills framework (18 skill directories)
- All 5 slash commands (init, map, refine, status, focus)
- Visibility: statusline hook + project_overview dashboard

Install: curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/v3.0.0-alpha.1/packages/server/install.sh | bash
EOF
)" \
  --prerelease
```

### Installing on rpi-camera-py

```bash
# From /home/kanter/code/rpi-camera-py
curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/v3.0.0-alpha.1/packages/server/install.sh | bash

# Verify installation succeeded
ls .claude/agents/  # should show 11 .md files
ls .claude/hooks/   # should show 7+ .js files
cat .mcp.json       # should have synapse server config
```

### Verifying Audit Log After Run (SC2)

```bash
# Run from /home/kanter/code/rpi-camera-py after E2E

# Check total entries
wc -l .synapse-audit.log

# Show all unique tools logged
grep -o '"tool":"[^"]*"' .synapse-audit.log | sort | uniq -c | sort -rn

# Verify specific required tools appear
for tool in init_project store_document create_task update_task get_task_tree get_smart_context; do
  count=$(grep -c "\"tool\":\"mcp__synapse__${tool}\"" .synapse-audit.log 2>/dev/null || echo 0)
  echo "${tool}: ${count} calls"
done
```

### SC4 Manual Comparison Workflow

```
1. Run /synapse:status  →  record: epic names, stage badges, % complete, pending items
2. Run get_task_tree (via MCP inspector or ask orchestrator)  →  record same fields
3. For each epic in status output:
   - Epic title matches task tree title? [Y/N]
   - Completion % = (done_tasks / total_tasks) * 100 from tree? [Y/N]
   - Stage badge matches stage document content.stage? [Y/N]
4. Check "Needs Your Input" section:
   - Each listed item has pending_approval=true in its stage document? [Y/N]
5. Record PASS/FAIL for SC4 in 24-FAILURE-LOG.md
```

## State of the Art

| Aspect | Current State | Notes |
|--------|--------------|-------|
| GitHub release format | Source tarball via `gh release create` | No build artifacts needed; source is the distribution |
| install.sh URL | Dynamically resolved via `releases/latest` API | No hardcoded URL change needed after release exists |
| Audit log format | Newline-delimited JSON in `.synapse-audit.log` | PostToolUse hook, catches all tool calls including non-Synapse |
| RPEV stage authority | Stage documents are authoritative over task tree status | status.md explicitly uses stage doc `stage` field over task status |
| rpi-camera-py location | `/home/kanter/code/rpi-camera-py` (adjacent to synapse repo, NOT at `../rpi-camera-py`) | Python project: 4 source files, 727 total lines |

**Important discovery:** The CONTEXT.md says rpi-camera-py is at `../rpi-camera-py` relative to synapse repo. The actual path is `/home/kanter/code/rpi-camera-py` — i.e., it is a sibling directory at `/home/kanter/code/`. The `../` relative path from `/home/kanter/code/synapse/` correctly resolves to `/home/kanter/code/rpi-camera-py`. Confirmed: project exists and has real Python source.

**rpi-camera-py characteristics:**
- Python 3.11+, managed with uv (uv.lock present)
- 4 source files in `src/rpi_camera/`: camera_server.py (398 lines), camera_capturer.py (193 lines), heat_controller.py (109 lines), throttled_logger.py (27 lines)
- Runs as a Docker container on Raspberry Pi
- Good candidate for refactoring (error handling, config management) and feature work (API improvements, test coverage)

## Known Pre-Run Issues

These issues are identified before the E2E run starts. They are likely failure candidates:

### Issue 1: init.md Documents Stale trust.toml Schema (MEDIUM severity)
- **Description:** init.md step 6 shows `[pev]` section instead of `[rpev.involvement]`. If the command follows the literal documentation rather than the template file, trust.toml will be written incorrectly.
- **Expected behavior:** init.md should match `packages/framework/config/trust.toml` which has the correct `[rpev.involvement]` schema.
- **Pre-patch opportunity:** Fix init.md step 6 before the E2E run, or catch during run and patch then.

### Issue 2: .claude/hooks/ Not Committed to Repo (HIGH severity)
- **Description:** All hooks, commands, agents, skills, and `.mcp.json` are untracked. If not committed before tagging, the GitHub tarball will be missing these files entirely.
- **Impact:** install.sh would succeed (it can copy 0 files without error) but Synapse would be non-functional.
- **Must fix:** Commit all untracked framework files before creating alpha tag.

### Issue 3: test_project/trust.toml Has Stale Schema (LOW severity)
- **Description:** test_project/ has a stale trust.toml. Not blocking since the E2E uses rpi-camera-py, not test_project/.
- **Decision:** Leave for now per CONTEXT.md — document as known limitation.

### Issue 4: Smoke Test Run Context (LOW severity)
- **Description:** install.sh invokes `scripts/smoke-test.mjs` using `$TARGET_DIR/scripts/smoke-test.mjs`. When run on rpi-camera-py, this path would be `rpi-camera-py/scripts/smoke-test.mjs` which does not exist.
- **Impact:** Smoke test will be skipped (it checks `[ -f "$SMOKE_SCRIPT_PATH" ]` before running). Not a blocker but SC2 won't get smoke test entries in the audit log.
- **Expected:** install.sh logs "scripts/smoke-test.mjs not found — skipping smoke test."

## Open Questions

1. **Does `gh release create` auto-generate the source tarball from the tag?**
   - What we know: GitHub creates source tarballs for all tags at `archive/refs/tags/TAG.tar.gz`. `gh release create` does NOT need to explicitly attach a tarball — GitHub does it automatically.
   - What's unclear: Whether the tarball is available immediately after `gh release create` or takes a moment.
   - Recommendation: Add a brief wait or retry after release creation before testing the download URL. In practice, GitHub tarballs are available within seconds.
   - Confidence: HIGH (standard GitHub behavior)

2. **Will rpi-camera-py's Python codebase work with the Synapse skills framework?**
   - What we know: Skills are injected from project.toml `skills` field; python skill exists at `.claude/skills/python/`. Executor agents use `{test_command}` placeholder from testing skill.
   - What's unclear: Whether rpi-camera-py has test infrastructure (no `tests/` directory visible from ls output).
   - Recommendation: During /synapse:init, select the `python` skill. If no tests exist, executor agents will skip test steps or create basic tests as part of task execution.
   - Confidence: MEDIUM

3. **Abbreviated re-run scope for alpha.2 verification**
   - What we know: After patches, we need to confirm the fixed paths work. Full re-run would be expensive.
   - Recommendation: Re-run install.sh on a clean rpi-camera-py (remove .synapse/ and .claude/ directories first), then run /synapse:init + /synapse:status. Verify tool calls appear in fresh .synapse-audit.log. This exercises install + init + startup hooks without re-running the full RPEV cycle.
   - Confidence: HIGH (targeted enough to verify patches without full repeat)

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/home/kanter/code/synapse/packages/server/install.sh` — verified tarball download logic, dev mode detection, smoke test invocation
- Direct code inspection: `/home/kanter/code/synapse/.claude/hooks/audit-log.js` — verified PostToolUse, newline-delimited JSON, `.synapse-audit.log` path
- Direct code inspection: `/home/kanter/code/synapse/.claude/agents/synapse-orchestrator.md` — verified RPEV flow, pool manager protocol, stage document management
- Direct code inspection: `/home/kanter/code/synapse/.claude/commands/synapse/status.md` — verified stage document authority over task tree status
- Direct code inspection: `/home/kanter/code/synapse/.claude/commands/synapse/init.md` — verified init flow and trust.toml writing
- Direct code inspection: `/home/kanter/code/synapse/.claude/commands/synapse/refine.md` — verified Refine → PLANNING stage document creation
- Direct code inspection: `/home/kanter/code/synapse/packages/framework/config/trust.toml` — verified correct `[rpev.involvement]` schema
- Filesystem inspection: `git status --short` confirmed 25+ untracked files including all framework assets
- Filesystem inspection: `git remote -v` confirmed `git@github.com:kvdeurzen/synapse.git`
- Filesystem inspection: `gh auth status` confirmed GitHub CLI logged in as `kvdeurzen`
- Filesystem inspection: `gh release list` confirmed no existing releases (only v1.0, v2.0 git tags exist)
- Filesystem inspection: `/home/kanter/code/rpi-camera-py/` confirmed project exists with 4 Python source files

### Secondary (MEDIUM confidence)
- GitHub documentation pattern: source tarballs at `archive/refs/tags/TAG.tar.gz` are auto-generated on tag creation (well-established GitHub behavior)
- `gh release create` CLI behavior: creates release from tag, does not need explicit tarball attachment for source distribution

## Metadata

**Confidence breakdown:**
- Alpha release process: HIGH — install.sh code read directly, gh CLI verified, git remote confirmed
- RPEV run sequence: HIGH — all 5 commands and orchestrator agent code read directly
- Audit log verification: HIGH — audit-log.js read directly, format confirmed
- Pitfalls: HIGH — most derived from direct code inspection, not speculation
- rpi-camera-py characteristics: HIGH — filesystem confirmed, pyproject.toml read

**Research date:** 2026-03-06
**Valid until:** 2026-03-13 (stable codebase — 7 days)
