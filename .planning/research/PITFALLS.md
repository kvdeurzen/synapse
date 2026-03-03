# Pitfalls Research

**Domain:** Wiring an existing Claude Code framework (agents, hooks, skills, MCP server, PEV workflow) into a working end-to-end product — install through E2E orchestration
**Researched:** 2026-03-03
**Confidence:** HIGH for Claude Code hooks and subagent mechanics (verified against official Claude Code docs and GitHub issues); MEDIUM for install script patterns (community sources, cross-verified with Ollama/Bun docs); HIGH for project-specific gaps (direct codebase inspection)

---

## Critical Pitfalls

### Pitfall 1: Hook Path Resolution Breaks When cwd Is Not the Repo Root

**What goes wrong:**
The `settings.template.json` uses relative paths like `node packages/framework/hooks/synapse-startup.js`. When Claude Code is launched from a directory other than the monorepo root (e.g., from inside `packages/server/`, or from a symlinked path), `process.cwd()` resolves to a different directory and the hook scripts are not found. Claude Code fails to fire hooks silently in some versions and throws `ENOENT` in others. The hooks simply don't run, and there is no obvious error — sessions start normally but tier enforcement, allowlist checks, and the audit log are all inactive.

**Why it happens:**
Relative paths in hook `command` fields are resolved from the working directory where Claude Code was launched, not from the settings file location. This is a known bug with multiple open issues (GitHub #3583, #10367). The `$CLAUDE_PROJECT_DIR` environment variable was added to address this but requires explicit use in path strings.

**How to avoid:**
- Use `$CLAUDE_PROJECT_DIR` as the prefix for all hook command paths in `.claude/settings.json`:
  ```json
  "command": "node $CLAUDE_PROJECT_DIR/packages/framework/hooks/synapse-startup.js"
  ```
- The install script must write the final `.claude/settings.json` with `$CLAUDE_PROJECT_DIR`-prefixed paths, not relative paths copied verbatim from `settings.template.json`.
- The hooks inside the scripts themselves also use `process.cwd()` to resolve config files (e.g., `tier-gate.js` reads `packages/framework/config/trust.toml` via `path.join(process.cwd(), ...)`). These must be changed to use `process.env.CLAUDE_PROJECT_DIR` or `path.dirname(new URL(import.meta.url).pathname)` to derive the project root from the hook's own location.
- Add an explicit test: run `claude` from a subdirectory and verify hooks fire by checking `.synapse-audit.log` is written.

**Warning signs:**
- `.synapse-audit.log` is not created after tool calls.
- Agents can call tools outside their `allowed_tools` list (tool-allowlist hook not running).
- Tier 0 decisions are stored without user approval (tier-gate hook not running).

**Phase to address:** Claude Code integration phase. Hook path resolution must be verified before any other hook behavior is tested.

---

### Pitfall 2: Subagents Don't Inherit MCP Servers Automatically — Each Agent Needs Explicit MCP Config

**What goes wrong:**
When the orchestrator spawns a subagent via the Task tool, the subagent starts with a fresh context. By default, subagents inherit the parent conversation's tools including MCP tools. However, this inheritance only works if the MCP server is registered in the project or user-level `settings.json`. If the Synapse MCP server is configured only in `settings.local.json` (gitignored) or in a file that doesn't reach the subagent context, the subagent gets `Tool not found: mcp__synapse__*` errors. Additionally, documented bugs (GitHub #5465, #13605) show that custom subagents defined as plugin agents or `.claude/agents/*.md` files may not receive MCP tools at all in certain versions.

**Why it happens:**
Claude Code agents load their MCP context from settings files. Subagents defined in `.claude/agents/*.md` can explicitly list `mcpServers` in their frontmatter — referencing a server name is enough if the server is already configured in `settings.json`. If the server is absent from the settings file the subagent loads, the tool namespace `mcp__synapse__*` does not exist in that agent's context.

**How to avoid:**
- Register the Synapse MCP server in `.claude/settings.json` (the project-level settings file checked into git), not `settings.local.json`. This ensures all agents in the project see it.
- Each agent's `.md` frontmatter should include `mcpServers: ["synapse"]` to explicitly declare MCP dependency. This resolves the known custom-agent MCP inheritance bug.
- After deploying the wired `.claude/agents/*.md` files, verify E2E with a simple smoke test: ask the orchestrator to call `mcp__synapse__project_overview` and confirm it succeeds.
- The install script must validate MCP server connectivity before telling the user setup is complete (`curl http://localhost:11434/api/tags` for Ollama, then a synthetic `init_project` call for Synapse).

**Warning signs:**
- Subagent output includes "Tool not found: mcp__synapse__..." errors.
- Orchestrator calls Synapse tools successfully but spawned Executor agents cannot.
- Hook fires for orchestrator MCP calls but not for subagent MCP calls.

**Phase to address:** Claude Code integration phase, specifically the agent file wiring step.

---

### Pitfall 3: Agents Don't Know project_id — Every MCP Tool Call Fails With Validation Error

**What goes wrong:**
Every Synapse MCP tool requires `project_id` as a mandatory parameter (regex-validated: `^[a-z0-9][a-z0-9_-]*$`). No agent prompt currently specifies where `project_id` comes from. In practice, agents will either omit it (Zod validation error: `project_id is required`), ask the user for it (terrible UX, defeats the purpose), or invent a random string (creates orphaned data under wrong project). This is a showstopper for every MCP tool call in every agent.

**Why it happens:**
The gap was identified in the gap analysis but no mechanism has been wired up. The startup hook injects tier/tool instructions but not `project_id`. The orchestrator's system prompt does not specify how to discover `project_id`. Agents don't read `synapse.toml` to extract it.

**How to avoid:**
- Store `project_id` in `packages/framework/config/synapse.toml` under `[server]` (it already has `db` and `ollama_url` — add `project_id = "my-project"`).
- The `synapse-startup.js` SessionStart hook reads `synapse.toml` (it already tries to read config files) and injects `project_id` into the `additionalContext` it emits. Example injection:
  ```
  **Project ID:** my-project
  On ALL Synapse MCP tool calls, use project_id: "my-project"
  ```
- All agent prompts must include a standing instruction: "The project_id for all Synapse MCP calls is available in your session context via the startup hook. Never ask the user for it. Never omit it."
- The orchestrator must pass `project_id` explicitly when spawning subagents via Task tool, as subagents start fresh and may not have the startup hook's context.

**Warning signs:**
- Any agent produces a Zod validation error mentioning `project_id`.
- Agent output includes the phrase "what is the project ID?" or similar.
- Multiple project rows appearing in the database with different IDs for the same project.

**Phase to address:** Agent prompt improvements phase AND install script phase (both must set project_id before anything else runs).

---

### Pitfall 4: Agent Prompts Describe Tool Usage Abstractly — Agents Fall Back to Filesystem Search

**What goes wrong:**
Agent prompts currently describe what each agent does at a high level but do not specify concrete MCP tool call sequences with actual parameter values. Without this, agents default to what they know from training: `Read`, `Grep`, `Glob` on the filesystem. They never call `mcp__synapse__get_smart_context` or `mcp__synapse__search_code` — even though those tools would provide better targeted context. The semantic search value is entirely bypassed. Agents re-read files that are already indexed, wasting context window.

**Why it happens:**
LLMs follow the path of least resistance in their training distribution. Reading files is deeply familiar; calling a custom MCP tool with specific parameters (valid categories, mode choices, response shape expectations) requires explicit instruction. Without concrete examples showing parameter values and expected response structure, agents won't use the tools reliably.

**How to avoid:**
- Every agent prompt must include a "Key Tool Sequences" section with literal parameter values. Example (from the Executor agent, which already has this — but most don't):
  ```
  1. get_smart_context(project_id: "...", mode: "overview") — see what exists
  2. get_smart_context(project_id: "...", mode: "detailed", doc_ids: [...]) — load specifics
  3. search_code(project_id: "...", query: "...", language: "typescript") — find related code
  ```
- Add response shape documentation: agents need to know `mode: "overview"` returns summaries with `doc_id` fields, and `mode: "detailed"` accepts those `doc_id` values. Without this, agents can't chain calls.
- Add valid enum values to tool documentation in agent prompts: `category` values (`decision`, `architecture`, `requirements`, `debug_report`...), `status` values, `tier` values.
- Add the "MCP as single source of truth" instruction to every agent: "Before reading files with `Read` or `Grep`, check Synapse MCP first. Synapse has indexed this project."

**Warning signs:**
- Agents make zero `mcp__synapse__*` calls in a session.
- Agent output includes extensive file listing (`Glob`/`Grep` calls) before any MCP call.
- Executor creates new decisions without checking precedent first.

**Phase to address:** Agent prompt improvements phase. This must be addressed before E2E validation, or the E2E test will pass trivially (using filesystem fallback) while the core value prop is untested.

---

### Pitfall 5: Hook Tool Allowlist Uses Static Config Path — Fails When Deployed Outside Synapse Repo

**What goes wrong:**
`tool-allowlist.js` and `tier-gate.js` read config files using `path.join(process.cwd(), 'packages/framework/config/agents.toml')`. This hardcodes an assumption that the hooks run from the Synapse repository root. When Synapse is installed as a tool for another project (i.e., a user installs Synapse and uses it to manage their own project), hooks run from the user's project root — which is not the Synapse repo root, and `packages/framework/config/agents.toml` does not exist there.

**Why it happens:**
The hooks were written during development where the Synapse repo is the working directory. But in production, users install Synapse once and use it across multiple projects. The Synapse framework files live in the Synapse repo or a global install location; user projects are separate.

**How to avoid:**
- Config file paths in hooks must use `path.dirname(new URL(import.meta.url).pathname)` to resolve relative to the hook script's own location (ES module `__dirname` equivalent), not `process.cwd()`. This makes hooks location-independent.
- Current `synapse-startup.js` already attempts multiple path roots (`cwd`, `cwd/packages/framework`, `dirname(__file__)`) — the other hooks need the same treatment.
- The install script should write the absolute path to the framework config directory into the user's `synapse.toml` so hooks can read a single env variable to find their config.
- Add a hook self-test: at startup, verify each hook can find its config file and output a `[synapse-startup] config found at: ...` message to stderr. Fail loudly, not silently.

**Warning signs:**
- Hooks fire but immediately deny all operations (fail-closed on missing config).
- `[synapse-startup] Warning: Could not load tier config` in Claude Code startup output.
- All `store_decision` calls are denied immediately for all agents.

**Phase to address:** Claude Code integration phase (hook wiring) AND install script phase (must configure the framework base path).

---

### Pitfall 6: Task Tool Spawning Passes No Context — Subagents Start Blind

**What goes wrong:**
When the orchestrator spawns a subagent via the Task tool (e.g., `Task("executor", "Implement task abc-123")`), the subagent starts with only its system prompt and the task description string. It has no access to the parent orchestrator's conversation history, no knowledge of the current epic, no project_id, no relevant task context, and no document references. The Executor must spend its entire first turn re-discovering context that the orchestrator already loaded. This wastes tokens, adds latency, and frequently fails because the Executor calls `get_task_tree` without knowing which epic to look at.

**Why it happens:**
The Task tool provides `isolation` — subagents get a fresh context by design. The orchestrator must explicitly pass all required context in the task prompt. Orchestrators that forget to include task_id, project_id, relevant document IDs, and acceptance criteria make their subagents go on a scavenger hunt.

**How to avoid:**
- The orchestrator's system prompt must include a "Subagent Handoff Protocol" section that specifies exactly what to include in every Task call:
  - `project_id` (always)
  - `task_id` of the specific task to execute
  - The task title and description verbatim
  - `doc_ids` of the most relevant Synapse documents (pre-fetched via `get_smart_context`)
  - Acceptance criteria
  - Dependency status ("task X is complete and produced Y")
- The orchestrator should call `get_task_tree` and `get_smart_context` before spawning, and include the results as structured context in the Task prompt.
- Subagents must have a documented "do not start work without these" requirement list in their system prompt. If any required field is missing, they should fail fast and report it rather than guessing.

**Warning signs:**
- Executor calls `get_task_tree` without a `filter_status` — it's looking for work instead of executing a specific task.
- Subagent asks the user clarifying questions that the orchestrator should have provided.
- Multiple consecutive `get_smart_context` overview calls from a single subagent (re-orienting instead of executing).

**Phase to address:** E2E workflow validation phase. The handoff protocol is a correctness concern that only manifests at full PEV workflow scope.

---

### Pitfall 7: Install Script Assumes Ollama Is Running — Silent Embedding Failures Lock Up the Server

**What goes wrong:**
The Synapse server is configured with `fail-fast on Ollama unavailability` — if `nomic-embed-text` is not accessible, any `store_document` or `store_decision` call fails with an embedding error. The install script has no step to verify Ollama is running and the model is pulled before declaring setup complete. Users who complete "install" and immediately try `init_project` get a cryptic embedding failure and assume Synapse is broken.

**Why it happens:**
The install flow and the Ollama dependency are not connected. A user can complete the Bun install, copy config files, and get a success message — then hit the Ollama wall on the very first real operation. Ollama also requires a separate model pull (`ollama pull nomic-embed-text`) that takes 274MB of download on first run.

**How to avoid:**
- The install script must verify Ollama before completing:
  ```bash
  curl -s http://localhost:11434/api/tags | grep -q "nomic-embed-text" || {
    echo "Pulling nomic-embed-text model (274MB)..."
    ollama pull nomic-embed-text
  }
  ```
- Add a `synapse doctor` command (or `bun run setup --check`) that verifies all prerequisites: Bun version, Ollama running, model available, DB path writable, config files present.
- The first-run experience should run a smoke test: `init_project` with a test project ID, verify it succeeds, delete the test data. This validates the full stack (Ollama → embeddings → LanceDB → MCP) before the user's real data touches it.
- Include clear error messages in the Synapse server when Ollama is down: `"Embedding service unavailable. Start Ollama and ensure nomic-embed-text is pulled: ollama pull nomic-embed-text"`.

**Warning signs:**
- Synapse server starts but all write tool calls return embedding errors.
- `ollama list` shows no models despite Ollama being installed.
- Error message in tool response is raw internal error text instead of a user-facing message.

**Phase to address:** Installation and setup phase.

---

### Pitfall 8: Dynamic Skill Injection Has No Runtime Mechanism — Skills Remain Static

**What goes wrong:**
The current design hardcodes skills per agent in `agents.toml`. The goal for v3.0 is dynamic skill injection: read project stack from `synapse.toml`, inject relevant skills at session start. But there is no mechanism to do this today. The startup hook (`synapse-startup.js`) already reads config and injects context — but it doesn't load skill content. If the dynamic injection is deferred or partially implemented, agents run in v2.0 static mode with hardcoded TypeScript/Bun skills even for Python or React projects.

**Why it happens:**
Dynamic skill injection requires: (1) a field in `synapse.toml` for project skills, (2) the startup hook reading that field, (3) the startup hook reading and injecting SKILL.md content into `additionalContext`, (4) agent prompts that reference "your loaded skills" rather than naming specific skills. These four steps span install script, config format, hook logic, and agent prompts. Any partial implementation produces inconsistent behavior.

**How to avoid:**
- Define the complete contract in one phase: `synapse.toml` gets `[project] skills = ["typescript", "bun"]`, the startup hook reads it and injects skill content, agent prompts reference injected skills generically.
- Implement the feature atomically — do not ship the config field without the hook reading it, or the hook without agent prompts referencing it.
- The install script's `/synapse:init` command must ask the user which skills to enable and write them to `synapse.toml`. This is the only time skills are configured; subsequent sessions read from config automatically.
- Test: add `skills = ["python"]` to `synapse.toml`, start a new session, verify Python skill content appears in the startup context and Executor references Python patterns in its work.

**Warning signs:**
- Executor uses `bun test` in a Python project (hardcoded skill active, dynamic injection not working).
- Startup hook output doesn't include any skill content.
- `synapse.toml` has a `skills` field that is never read by any code.

**Phase to address:** Skill system phase, specifically the dynamic injection sub-task.

---

### Pitfall 9: Validator Overwrites Task Descriptions — Original Spec Lost

**What goes wrong:**
The MCP tool `update_task` does full field replacement. When the Validator agent calls `update_task(task_id, description: "VALIDATION FINDING: passed/failed with details")`, it overwrites the original task spec that the Executor used to do the work. Future agents looking at that task (e.g., the Integration Checker, or the Debugger on retry) see only the validation result, not the original requirements. They cannot verify whether the implementation matches the spec because the spec is gone.

**Why it happens:**
The Validator's system prompt instructs it to update the task with validation findings but does not specify that the original description must be preserved. Full-replacement semantics in `update_task` make this a data loss risk for any agent that writes to `description`.

**How to avoid:**
- Add a `notes` or `validation_result` append-only field to the task schema in LanceDB. Validators write to `notes`, not `description`.
- If schema change is deferred: add an explicit rule to the Validator prompt — "When calling `update_task`, prepend your findings to the existing description, never replace it: `description: "[VALIDATION FINDING: ...]\n\nOriginal spec: {existing_description}"`".
- Add a "write your findings as a document" instruction to Validator: call `store_document(category: "validation_report")` + `link_documents(task_id, report_id)`. This is queryable by future agents.
- Integration Checker and Plan Reviewer have the same problem — all agents that call `update_task` must be audited.

**Warning signs:**
- Task descriptions in the database only contain validation text, not original specs.
- Debugger cannot determine what was supposed to be built when investigating a failure.
- Integration Checker produces reports that don't reference the original acceptance criteria.

**Phase to address:** Agent prompt improvements phase (immediate rule addition) AND tech debt resolution phase (schema change for append-only validation field).

---

### Pitfall 10: E2E PEV Loop Has Never Run — Unknown Failure Modes in Wave Execution

**What goes wrong:**
The PEV workflow is fully specified and the agent prompts are written, but the full loop (decompose → plan review → wave execution → validation → integration check → merge) has never been executed end-to-end. Unknown failure modes include: the orchestrator losing track of wave state when a subagent returns an unexpectedly long result, git worktree creation failing when the repo has uncommitted changes, branch merge order being wrong (task branches merged in wrong order create rebase conflicts), and the context window filling before the orchestrator finishes a full feature execution.

**Why it happens:**
Spec-driven development produces coherent documents that may have gaps only visible under real execution conditions. The complexity of PEV — spawning 3-5 parallel executors, awaiting all results, branching sequencing — means paper correctness does not guarantee runtime correctness.

**How to avoid:**
- Run the E2E PEV validation phase on the Synapse project itself (dogfooding). Choose a small, well-defined feature (e.g., "fix the escapeSQL duplication tech debt") as the first PEV run.
- Run with `max_parallel_executors: 1` first (serial execution) to isolate orchestration bugs from parallelism bugs. Increase to 3 only after serial mode is confirmed correct.
- Pre-create a clean git branch state before the E2E test. PEV assumes a clean working tree for worktree creation; uncommitted changes cause `git worktree add` to fail.
- Add explicit logging to the orchestrator: after each wave, emit the checkpoint format defined in pev-workflow.md. The presence or absence of these checkpoints during the E2E test shows exactly where the workflow stalled.
- Monitor context window usage. The orchestrator managing 5 parallel executors accumulates results from all of them. If each returns 8K tokens of results, one wave consumes 40K tokens of context.

**Warning signs:**
- Orchestrator stops emitting checkpoints mid-workflow.
- Git worktree errors (`fatal: ...is not a working tree`) from any executor subagent.
- Wave N+1 starts before all validations from Wave N have been confirmed (sync discipline broken).

**Phase to address:** E2E workflow validation phase. This phase exists precisely because this pitfall is expected.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Relative hook paths in settings.json | Works in dev (always run from repo root) | Hooks silently fail when Claude Code launched from any subdirectory | Never — use $CLAUDE_PROJECT_DIR from day one |
| Omitting project_id from startup hook context | Simpler hook code | Every agent must discover or ask for project_id, breaking UX | Never — inject project_id at session start |
| Full field replacement in update_task for validation results | Simpler API design | Validator overwrites original task spec; history lost | Never — design append semantics before first production run |
| Hardcoding TypeScript skill in agent prompts | Works for this project | Skill injection is language-specific; breaks for Python/React users | Never — skill content must be dynamically injected |
| No MCP connectivity check in install script | Simpler installer | Users hit embedding errors on first real operation | Never — validate the full stack during setup |
| Static config paths in hook scripts (process.cwd()) | Easier development | Hooks fail when installed outside Synapse repo root | Never for distributed tool — always use __dirname-relative paths |
| Skipping E2E validation until "later" | Ships faster | Spec bugs in PEV workflow only discoverable at runtime | Never — first real run is the validation phase |
| Subagent Task calls with minimal prompt context | Less orchestrator complexity | Subagents can't execute without context; wasted turns re-orienting | Never — define the handoff protocol before first orchestrator test |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `.claude/settings.json` MCP server config | Specifying `bun run packages/server/src/index.ts` without `--db` arg — config not connected to db path | Pass db path via `--db $SYNAPSE_DB_PATH` arg or `SYNAPSE_DB` env var; the server reads `--db` via argv |
| Claude Code hooks | Returning `permissionDecision` without the matching `hookEventName` field in `hookSpecificOutput` | Both fields are required; missing `hookEventName` causes silent hook failure per official docs |
| Claude Code hook commands | Using relative paths like `node packages/framework/hooks/...` in hook command strings | Use `node $CLAUDE_PROJECT_DIR/packages/framework/hooks/...`; relative paths fail when cwd differs from repo root (documented bug) |
| Subagent MCP access | Relying on implicit MCP inheritance in custom `.claude/agents/*.md` agents | Add `mcpServers: ["synapse"]` to each agent's frontmatter to explicitly declare MCP dependency; documented custom-agent MCP inheritance bug (#13605) |
| Startup hook `additionalContext` | Generating > 2000 tokens of context from TOML config dump | Keep injected context under 500 tokens; inject only facts agents need (project_id, tier summary, active skills) |
| `tool-allowlist.js` actor matching | Agents calling tools with no `actor` field or wrong actor name | Agent prompts must specify exact actor name matching agents.toml key; unknown actors are fail-closed denied |
| Task Tool prompt | Passing task description only, omitting project_id and doc_ids | Subagents start fresh; pass `project_id`, `task_id`, acceptance criteria, and relevant `doc_ids` explicitly in every Task call |
| Git worktree creation | Running PEV with uncommitted changes in working tree | Always commit or stash changes before PEV execution; `git worktree add` fails on dirty trees |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Startup hook injects full skill bodies for all agents | Session start takes > 30 seconds; first context window already > 50% used | Inject skill name + 1-line summary only; agent requests full body via tool call or explicit prompt | > 3 skills x > 1000 tokens each |
| Orchestrator awaits all wave executors before reading results | Context window fills with accumulated executor results | Read each executor result as it arrives; summarize before appending to conversation | > 3 parallel executors x > 8K tokens each |
| `get_task_tree` called without `filter_status` at session start | Returns all tasks ever created; orchestrator spends 10K tokens reading completed work | Always filter: `status: "in_progress"` or `status: "pending"` at session start | Projects with > 50 total historical tasks |
| Audit log hook runs synchronously on every tool call | Hook overhead adds 200ms latency to every single tool call | Audit hook already exits fast via `appendFileSync`; ensure it stays sync-but-fast | > 100 tool calls per session |
| Each agent agent re-calls `get_smart_context` overview from scratch | N agents x M overview calls = M redundant DB scans | Orchestrator fetches overview once and passes relevant doc_ids in each Task prompt | > 5 parallel agents in same feature wave |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No CLAUDE.md amendment during init | Users don't know Synapse is available; can't invoke orchestrator | `/synapse:init` must offer to append Synapse-specific instructions to CLAUDE.md (opt-in, never silent) |
| Asking user for project_id on every session | Users interrupted from flow; defeats automation promise | project_id injected by startup hook from synapse.toml; user never types it |
| Progress is invisible until E2E completes | Long PEV runs feel like they've frozen | Orchestrator emits wave checkpoint blocks after each wave; use Claude Code status line to show active epic/feature |
| Install script fails silently | User has no working system but no error message | Every install step echoes status; any failure prints exact fix command |
| No `/synapse:init` command | New users have no entry point; must read docs to discover how to start | `/synapse:init` is the single documented entry point; it walks the user through each setup step |
| Commands `/synapse:map` and `/synapse:plan` missing | Users can't invoke core workflows without reading agent internals | These commands must exist and be documented before any user tries Synapse on their own project |

---

## "Looks Done But Isn't" Checklist

- [ ] **Hook files are wired:** `.claude/settings.json` references all 5 hook scripts via `$CLAUDE_PROJECT_DIR` paths, not relative paths. Verify by grepping the installed `settings.json` for `$CLAUDE_PROJECT_DIR`.
- [ ] **Hooks actually fire:** After a Claude Code session with a Synapse MCP tool call, `.synapse-audit.log` exists and has an entry. This is the simplest E2E hook verification.
- [ ] **project_id flows to all agents:** Ask the orchestrator to call `mcp__synapse__project_overview`. It should succeed without asking for project_id. Then spawn an executor subagent and verify it also calls Synapse tools with the correct project_id.
- [ ] **Subagent MCP access confirmed:** A custom `.claude/agents/executor.md` agent must be able to call `mcp__synapse__get_task_tree`. Test this directly before running any PEV workflow.
- [ ] **Validator writes to notes, not description:** Create a task, have an agent call `update_task` with new description content, verify original description is preserved (either in notes field or prefixed in description).
- [ ] **Skill injection is dynamic:** Add `skills = ["python"]` to `synapse.toml`. Start a new Claude Code session. Verify the startup hook's `additionalContext` includes Python skill content. Change back to `["typescript"]`. Verify TypeScript content on next session.
- [ ] **Install script passes full-stack smoke test:** Run the install script on a clean machine (or clean Docker container). Verify the smoke test (init_project → store_document → semantic_search) completes without errors.
- [ ] **Ollama validation in setup:** The install script or `/synapse:init` command verifies Ollama is running and `nomic-embed-text` is pulled before exiting. It does not exit with success if Ollama is unavailable.
- [ ] **PEV E2E runs to completion:** At least one full PEV cycle (decompose → plan review → execute → validate → integration check) runs on a real task and completes successfully. Document what broke and what was fixed.
- [ ] **Config paths in hooks are location-independent:** Copy the hook scripts to a directory outside the Synapse repo. Run them standalone with mock input. They must either find their config or fail with a clear `[synapse] Config not found at: ...` message, not an unhandled exception.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Hooks not firing (path resolution) | LOW | Find `.claude/settings.json`; replace relative paths with `$CLAUDE_PROJECT_DIR/...`; restart Claude Code |
| Subagent MCP tool access denied | LOW | Add `mcpServers: ["synapse"]` to each agent `.md` frontmatter; verify Synapse is in project-level `settings.json` |
| project_id not available to agents | LOW | Add `project_id` to `synapse.toml`; update startup hook to inject it into `additionalContext` |
| Task description overwritten by validator | MEDIUM | Restore from git history if available; redesign update_task call in validator prompt to prepend instead of replace |
| Skill injection not working dynamically | LOW | Verify `synapse.toml` has `[project] skills = [...]`; trace startup hook execution; ensure hook reads the correct config file |
| PEV workflow stalls mid-execution | MEDIUM | Check orchestrator checkpoint output to find last completed wave; resume manually by invoking orchestrator with specific task_id; clear stalled tasks with `update_task(status: "pending")` |
| Ollama unavailable after install | LOW | Run `ollama serve`; run `ollama pull nomic-embed-text`; re-run Synapse smoke test |
| Git worktree creation fails in PEV | LOW | Commit or stash uncommitted changes; delete stale worktrees (`git worktree list`; `git worktree remove`); re-run PEV |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hook path resolution breaks outside repo root | Claude Code integration phase | `.synapse-audit.log` written after tool call when launched from subdirectory |
| Subagents don't inherit MCP servers | Claude Code integration phase | Executor subagent calls `get_task_tree` without error |
| Agents don't know project_id | Agent prompt improvements + install script | Orchestrator calls `project_overview` without asking user; startup hook context includes project_id |
| Agents ignore MCP, use filesystem instead | Agent prompt improvements phase | Zero-MCP-call sessions should not occur; first tool call in any session must be a Synapse MCP call |
| Hook config paths break outside Synapse repo | Claude Code integration phase + install script | Hooks self-test at startup; config-not-found produces human-readable error |
| No context passed to subagents via Task tool | E2E workflow validation phase | Executor subagents do not call `get_task_tree` without task_id context in prompt |
| Ollama unavailable locks up server | Installation and setup phase | Install script smoke test passes before user sees "setup complete" |
| Dynamic skill injection not wired | Skill system phase | Changing `synapse.toml` skills changes what agents see next session |
| Validator overwrites task descriptions | Agent prompt improvements phase | Task description unchanged after validator runs; findings in notes/document |
| PEV loop unknown failures | E2E workflow validation phase (this is the point of the phase) | Serial PEV run on real task completes without manual intervention |

---

## Sources

- [Claude Code Hooks Reference — Official Docs](https://code.claude.com/docs/en/hooks) — HIGH confidence (official documentation)
- [Claude Code Sub-Agents Reference — Official Docs](https://code.claude.com/docs/en/sub-agents) — HIGH confidence (official documentation)
- [Claude Code Issue #3583 — Relative hook paths fail when cwd changes](https://github.com/anthropics/claude-code/issues/3583) — HIGH confidence (official issue tracker)
- [Claude Code Issue #10367 — Hooks non-functional in subdirectories](https://github.com/anthropics/claude-code/issues/10367) — HIGH confidence (official issue tracker)
- [Claude Code Issue #5465 — Task subagents fail to inherit permissions in MCP server mode](https://github.com/anthropics/claude-code/issues/5465) — HIGH confidence (official issue tracker)
- [Claude Code Issue #13605 — Custom plugin subagents cannot access MCP tools](https://github.com/anthropics/claude-code/issues/13605) — HIGH confidence (official issue tracker)
- [Claude Code Issue #14496 — Task tool subagents fail to access MCP tools with complex prompts](https://github.com/anthropics/claude-code/issues/14496) — MEDIUM confidence (recent report, not yet resolved)
- [Synapse PROTO_GAP_ANALYSIS.md](../../PROTO_GAP_ANALYSIS.md) — HIGH confidence (direct project analysis, first-party)
- [Synapse `milestone 3 - notes and questions.md`](../../milestone%203%20-%20notes%20and%20questions.md) — HIGH confidence (direct project author notes)
- [Synapse packages/framework/hooks/*.js — codebase inspection](../../packages/framework/hooks/) — HIGH confidence (direct code review)
- [Synapse packages/framework/config/agents.toml](../../packages/framework/config/agents.toml) — HIGH confidence (direct code review)
- [Git worktrees for parallel AI agents — Upsun Developer Center](https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/) — MEDIUM confidence (practitioner article, patterns verified against official git docs)
- [AI Agent Orchestration common failures — builder.io](https://www.builder.io/blog/ai-agent-orchestration) — MEDIUM confidence (practitioner article, patterns observed in comparable systems)
- [Best practices for Claude Code subagents — PubNub](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) — MEDIUM confidence (practitioner article, consistent with official docs)

---
*Pitfalls research for: Wiring Claude Code framework + MCP server into a working end-to-end prototype (v3.0 milestone)*
*Researched: 2026-03-03*
