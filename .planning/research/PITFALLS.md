# Pitfalls Research

**Domain:** Adding an agentic coordination layer (Claude Agent SDK, multi-agent orchestration, decision tracking, task hierarchy) to an existing MCP server (Synapse v1.0)
**Researched:** 2026-03-01
**Confidence:** HIGH for Agent SDK patterns (verified against official docs); MEDIUM for LanceDB tree-hierarchy limits (DataFusion lineage confirmed, CTE specifics via GitHub issue); HIGH for integration pitfalls (verified via GitHub issues and official troubleshooting docs)

---

## Critical Pitfalls

### Pitfall 1: MCP Subprocess Shows "failed" Status Silently — Orchestrator Proceeds Anyway

**What goes wrong:**
The Claude Agent SDK's `query()` call spawns Synapse as a stdio subprocess via `mcpServers` config. If the subprocess fails to start (wrong command, missing env vars, Bun not in PATH, wrong working directory), the Agent SDK emits a `system/init` message with the Synapse server's status set to `"failed"`. Critically, the SDK does **not** abort — the agent continues executing and simply has no MCP tools available. The orchestrator may hallucinate tool calls, produce nonsensical output, or silently do nothing, with no exception thrown.

**Why it happens:**
The SDK's MCP connection error handling is designed to be non-fatal. It reports failures in the init message and continues, on the assumption the agent may have other tools. This is correct design for general use but wrong for Synapse's two-process architecture where the orchestrator is entirely dependent on Synapse tools. Developers assume a failed subprocess = exception; it doesn't.

**How to avoid:**
- Always check the `system/init` message at the start of every `query()` call. Parse `message.mcp_servers` and abort if any server has `status !== "connected"`:
  ```typescript
  for await (const message of query({ prompt, options })) {
    if (message.type === "system" && message.subtype === "init") {
      const failed = message.mcp_servers.filter(s => s.status !== "connected");
      if (failed.length > 0) throw new Error(`MCP server failed: ${JSON.stringify(failed)}`);
    }
    // ... rest of message handling
  }
  ```
- Validate the Synapse startup command (`bun run src/index.ts`) resolves correctly from the orchestrator's cwd before passing it to `mcpServers`.
- In tests, assert that the init message shows `"connected"` status before asserting agent behavior.

**Warning signs:**
- Orchestrator produces output without making any `mcp__synapse__*` tool calls.
- Agent SDK does not throw — output looks plausible but Synapse data is not queried.
- MCP server list in `system/init` shows `status: "failed"` or `status: "timeout"`.

**Phase to address:** Orchestrator bootstrap phase. The init-check guard must be the very first piece of orchestrator infrastructure built.

---

### Pitfall 2: stdio Buffer Deadlock — Orchestrator Hangs After Long MCP Tool Responses

**What goes wrong:**
When Synapse returns a large MCP tool response (e.g., `get_smart_context` with 50 chunks, `search_code` returning many results), the JSON-RPC response payload can exceed the OS stdio pipe buffer (~64KB on Linux). If the orchestrator's Agent SDK does not drain the pipe fast enough, the subprocess's write blocks, the orchestrator's read also blocks waiting for the subprocess to send `EOF`, and both sides deadlock. The SDK hangs indefinitely with no timeout.

**Why it happens:**
This is a classic subprocess communication deadlock. The Agent SDK spawns Synapse via `anyio.open_process()` (Python) or Node.js `child_process.spawn()`. Stdio pipes have finite OS buffers. When the MCP response is large and the consumer is slow, the producer blocks. This has been confirmed in `claude-agent-sdk-python` issue #145 as a real hang scenario for long-running tool responses.

**How to avoid:**
- Keep Synapse MCP tool responses under 32KB where possible. For `get_smart_context`, enforce `max_tokens` limits on the returned bundle; for `query_decisions`, paginate rather than returning all records.
- Add a per-tool `limit` parameter to all Synapse tools that return variable-length result sets. Default limits: `query_decisions` max 20, `get_task_tree` max depth 4.
- The orchestrator should set a `max_turns` limit and a wall-clock timeout per `query()` call to prevent indefinite hangs.
- For the SDK: use the TypeScript SDK's async generator pattern — iterate the generator as soon as messages arrive rather than buffering all messages before processing.

**Warning signs:**
- `query()` hangs indefinitely after a large MCP result.
- No new messages arrive from the generator for > 30 seconds with no error.
- The Synapse process shows high CPU (blocked write syscall) in `ps` output while the orchestrator shows low CPU (blocked read).

**Phase to address:** Orchestrator bootstrap + MCP tool design phase. Set response size limits on all Synapse tools before integration testing.

---

### Pitfall 3: LanceDB Has No Recursive CTE — Task Tree Traversal Requires Application-Level Recursion

**What goes wrong:**
The task hierarchy (Epic → Feature → Component → Task) requires querying all descendants of a given parent, which is naturally expressed as a recursive CTE (`WITH RECURSIVE`). LanceDB uses Apache DataFusion as its SQL engine. DataFusion added experimental recursive CTE support (enabled via `execution.enable_recursive_ctes`), but LanceDB's Node.js client does not expose the `execution` config option, and recursive CTEs are not enabled in LanceDB's default configuration. Attempting `WITH RECURSIVE` in a LanceDB filter will fail with a parse error.

**Why it happens:**
LanceDB's SQL filtering is a subset of DataFusion SQL. DataFusion's recursive CTEs are opt-in and considered experimental (they can buffer unbounded data). LanceDB does not expose the config toggle. This means tree traversal must be done in application code via iterative queries.

**How to avoid:**
- Implement `getTaskTree(rootId, maxDepth)` as an iterative BFS in TypeScript: query `parent_id = rootId` at depth 1, collect task IDs, query `parent_id IN (...)` for depth 2, etc. Limit to `maxDepth` (default: 5) to prevent runaway iteration.
- Store a `depth` field (already planned in schema foundations) to enable depth-scoped queries without recursion: `WHERE depth <= :maxDepth AND root_id = :epicId`.
- Store a `root_id` field on every task (denormalized reference to the Epic ancestor). This enables a single flat query for all descendants: `WHERE root_id = :epicId`. Update `root_id` whenever a task is reparented.
- The `get_task_tree` MCP tool should cap at 200 tasks returned and warn if truncated. Log if BFS reaches `maxDepth` without exhausting the tree.

**Warning signs:**
- `WITH RECURSIVE` SQL error in LanceDB filter expressions.
- `get_task_tree` stalls on deep task hierarchies (unbounded BFS).
- Task trees with depth > 5 cause N+1 query patterns (one DB round-trip per level).

**Phase to address:** Task hierarchy schema phase. The `root_id` denormalized field and `depth` field must be in the schema from day one, before any task data is written.

---

### Pitfall 4: Subagents Cannot Spawn Subagents — 10-Agent Design Must Be Flat

**What goes wrong:**
The Claude Agent SDK explicitly prohibits subagents from spawning their own subagents. The `Task` tool must not be included in a subagent's `tools` array. If included (or inherited via omitting the `tools` field), the SDK silently ignores subagent-spawning attempts or throws. This means the orchestrator's architecture must be a single-level star: Orchestrator (main agent) → 10 leaf agents. Any design requiring Agent A to spawn Agent B fails.

**Why it happens:**
The SDK enforces a two-level hierarchy by design. The SDK docs state: "Subagents cannot spawn their own subagents. Don't include `Task` in a subagent's `tools` array."

**How to avoid:**
- All 10 agents are invoked directly from the Orchestrator (main agent). No agent-to-agent invocation.
- The Orchestrator is the sole task router. It decides which agent handles what and sequences calls.
- Wave-based parallelism is implemented by the Orchestrator spawning multiple agents for the same turn (the SDK supports concurrent subagent execution within a single orchestrator turn).
- Subagent `tools` fields must be explicitly set. Never omit them — the default inherits all tools including `Task`.

**Warning signs:**
- A subagent's prompt mentions delegating to another agent.
- A subagent's `tools` array is omitted (will inherit `Task` if parent has it, causing undefined behavior).
- Architecture diagram shows agent chains deeper than Orchestrator → Agent.

**Phase to address:** Agent architecture phase. The flat hierarchy constraint must be documented and enforced in agent definitions from the first agent built.

---

### Pitfall 5: Hook Errors Terminate the Agent — Unhandled Exceptions in Hooks Are Fatal

**What goes wrong:**
Any unhandled exception thrown inside a hook callback causes the agent's `query()` generator to throw. This is unlike MCP tool failures (which the agent can recover from). A bug in a tier-enforcement hook (e.g., a null pointer when accessing `tool_input.decision_tier`) crashes the entire orchestrator run. All work done in that turn is lost with no graceful degradation.

**Why it happens:**
SDK hooks run synchronously in the agent loop. Unlike async tool execution (which has error isolation), hook exceptions propagate directly. The SDK documentation shows that hooks returning `{}` are safe, but does not warn that thrown exceptions are fatal.

**How to avoid:**
- Wrap every hook callback body in a top-level `try/catch`. In the catch block, log the error to stderr and return `{}` (allow the operation) or `{ hookSpecificOutput: { permissionDecision: "deny" } }` (deny defensively).
- Add a hook test harness that calls each hook with malformed/null inputs and asserts it never throws.
- For tier-enforcement hooks: fail **open** (allow) on hook errors during development; fail **closed** (deny with reason) in production where security matters more than availability.
- Use `async: true` with `asyncTimeout` for side-effect-only hooks (logging, telemetry) so a slow logging call doesn't block the agent.

**Warning signs:**
- Orchestrator `query()` throws unexpectedly mid-run.
- Stack trace points to hook callback code, not Synapse tool code.
- An exception in a hook callback causes the entire task to be aborted rather than just that tool call.

**Phase to address:** Hook implementation phase. The try/catch wrapper pattern must be established before any hooks are written.

---

### Pitfall 6: Semantic Drift in Precedent Matching — check_precedent Returns False Positives

**What goes wrong:**
The `check_precedent` tool searches for decisions semantically similar to a proposed action. If the similarity threshold is too low, it returns decisions that are superficially related but not actually applicable (e.g., a decision about "database schema versioning" matching a query about "agent tool versioning"). Agents may incorrectly treat these as binding constraints, refusing to take actions that are actually permitted — or worse, claiming precedent support for something that is not actually covered.

**Why it happens:**
Short rationale text (50-200 tokens) produces low-quality embeddings with nomic-embed-text. Vector similarity in this dimension range is noisy — 0.75 cosine similarity between two 768-dim vectors for short text may not mean what it means for document-length text. The boundary between "same domain" and "semantically related" is ambiguous in embedding space.

**How to avoid:**
- Use a higher similarity threshold for precedent queries: 0.85+ minimum, not the 0.70 default used for document search.
- Store decision `decision_type` (architectural, security, process, etc.) as a structured field and always pre-filter by type before vector search. Semantic search within a type-scoped result set is far more precise.
- Require `check_precedent` to return a structured result with: `matches`, `confidence`, and `requires_review_if_above` threshold. Agents must never treat LOW confidence matches as binding.
- Include a mandatory `scope` field in decisions (e.g., `scope: "embedding-pipeline"`) and require exact scope match before applying precedent.
- Add integration tests: store 5 decisions with distinct domains, query with a string from a different domain, assert zero matches above 0.85 threshold.

**Warning signs:**
- `check_precedent` returns matches for clearly unrelated queries.
- Agents reject actions citing decisions from a different subsystem.
- High false-positive rate in integration tests of precedent matching with cross-domain queries.

**Phase to address:** Decision tracking phase. Threshold calibration and `decision_type` pre-filtering must be designed before the first decision is stored.

---

### Pitfall 7: Skill Injection Inflates Every Prompt — Context Budget Exhausted Before Work Begins

**What goes wrong:**
The skill loading system injects project-specific prompt content into agent system prompts at runtime. If 10 agents each load 5 skills averaging 2,000 tokens each, that's 100,000 tokens of system prompt overhead before any task context or user prompt. With a 200K context window, this leaves ~100K tokens for actual work — adequate for some tasks but catastrophic for agents that need to load detailed Synapse search results. In practice: Executor agent + 5 skills + task context + Synapse results = context window exhausted mid-task.

**Why it happens:**
Developers add skills incrementally without tracking cumulative token cost. Each skill seems reasonable in isolation. The 2025 research on skill injection confirms that "10 skills at 2,000 tokens each = 20,000 tokens per request" and this "reduces the effective context window available for actual reasoning." The problem multiplies across 10 agents running in parallel.

**How to avoid:**
- Implement a three-stage progressive loading pattern (matching official Agent SDK skills design):
  1. Stage 1: Inject only skill names and 1-line descriptions (~50 tokens per skill) into all agent system prompts.
  2. Stage 2: Inject full skill body only when the agent explicitly requests it via a `load_skill(name)` tool call.
  3. Stage 3: Supplementary files only on demand.
- Hard cap: each skill body must be under 2,000 tokens. Skills exceeding this are split or summarized.
- The skill registry tool must track token usage per skill load and warn when cumulative prompt length exceeds 30% of the model's context window.
- Per-agent skill budget: each agent has a maximum skill load (e.g., Executor: 3 skills max, Architect: 5 skills max).

**Warning signs:**
- Agent errors mentioning context window exceeded appear before the agent has done substantial work.
- Skill loading causes `query()` token usage to exceed 100K tokens on the first turn.
- An agent pauses to request compaction immediately after receiving its system prompt.

**Phase to address:** Skill loading phase. Token budgeting must be built into the skill registry before the first skill is loaded into production agents.

---

### Pitfall 8: Skill Files Are a Prompt Injection Attack Surface

**What goes wrong:**
Skills loaded from the file system or a registry into agent system prompts are a known injection vector. Research (arXiv 2510.26328, 2601.17548) confirms that malicious content in skill markdown files can steer agents away from their stated intent, bypass guardrails ("the 'Don't ask again' approval can carry over to related harmful actions"), and exfiltrate data from files the agent has read. In Synapse's context, a poisoned skill could instruct the Executor agent to write malicious code or escalate its tier authority.

**Why it happens:**
Skills are markdown files trusted implicitly because they live on the file system. But skill files can be modified by any process with write access to the skills directory. The LLM cannot distinguish skill content from adversarial instructions embedded in that content — it is all system prompt.

**How to avoid:**
- Skill files must be version-controlled and their content hash stored in the skill registry alongside the skill. Before loading, verify content hash matches the registered hash.
- The skill registry should be read-only after initialization. Skills cannot be added or modified at runtime without an explicit admin operation.
- Add a skill content policy: skills may not contain instructions to modify tier authority, bypass quality gates, or access files outside the project scope. Validate this via a simple linter that scans for banned phrases.
- Orchestrator hooks (`PreToolUse`) must enforce tier authority regardless of what skills say. Skill content cannot override hook-level constraints.

**Warning signs:**
- A skill file references external URLs or instructs agents to fetch content from the web.
- Skill content includes phrases like "ignore previous instructions" or escalates authority.
- An agent calls tools outside its defined authority after loading a new skill.

**Phase to address:** Skill loading + hook implementation phases. Content validation must precede first skill load in the orchestrator.

---

## Moderate Pitfalls

### Pitfall 9: Orphaned Tasks After Partial Failure — Status Never Propagates Up

**What goes wrong:**
In the Epic → Feature → Component → Task hierarchy, if a task fails and the orchestrator crashes (or the agent's turn exceeds `max_turns`), the task remains in `"in_progress"` status permanently. Its parent Feature does not know it failed. On the next orchestrator run, the Feature's status remains `"in_progress"` even though it cannot complete, because one child task is stuck. Cascading stale status percolates all the way to the Epic, making the entire hierarchy unreliable.

**Why it happens:**
Hierarchical status propagation requires parent tasks to poll or subscribe to child status changes. LanceDB has no triggers or reactive queries. The orchestrator must proactively walk the tree after any task status change and propagate. If the orchestrator crashes mid-propagation, the tree is left inconsistent.

**How to avoid:**
- `update_task` must accept a `cascade_to_parent` option (default true) that walks up the hierarchy and recalculates parent status based on all children: if any child is `"failed"`, parent becomes `"blocked"`; if all children are `"done"`, parent becomes `"done"`.
- Implement a `reconcile_task_tree(epic_id)` tool that does a full tree-walk and repairs inconsistent statuses. Run it at orchestrator startup as a health check.
- Store `last_updated_at` on every task. A task in `"in_progress"` for > 2 hours without update is treated as `"stalled"` by the reconciler.
- Task status changes must be atomic with their log entries: write to `activity_log` and update the task row in the same logical operation. If either fails, the orchestrator retries the update before continuing.

**Warning signs:**
- Task statuses diverge from actual work completed after an orchestrator restart.
- Parent task shows `"in_progress"` when all children show `"done"` or `"failed"`.
- Orchestrator repeatedly picks up the same task because it cannot determine if it is truly complete.

**Phase to address:** Task hierarchy phase. The cascade propagation logic must be built into `update_task` from the start, not retrofitted.

---

### Pitfall 10: Context Window Accumulation in Long Orchestrator Sessions — Automatic Compaction Loses Decision History

**What goes wrong:**
The Claude Agent SDK includes automatic context compaction: when the context window approaches its limit, the SDK summarizes older messages. For the orchestrator, this means the full history of MCP tool calls (which decisions were checked, which tasks were created, what code was analyzed) gets summarized into a compressed narrative. The summary is lossy — specific task IDs, decision IDs, and Synapse query results are not preserved verbatim. After compaction, the orchestrator may re-check the same decisions, re-create already-existing tasks, or lose track of where in the PEV workflow it was.

**Why it happens:**
The orchestrator's context grows because each MCP tool call adds both the tool input and the full tool response to the conversation. A `get_smart_context` response can be 10K+ tokens. 20 tool calls = 200K+ tokens. Compaction is automatic and lossy.

**How to avoid:**
- Use the `PreCompact` hook to archive the full transcript before compaction: write the transcript to a Synapse document (`store_document` with category `"orchestration_log"`). After compaction, the orchestrator can reference this log via `query_documents`.
- Register a `PreCompact` hook that explicitly extracts: active task IDs, decisions applied in this session, current workflow stage (Plan/Execute/Validate). Store these as structured state in `project_meta` before compaction occurs.
- The orchestrator's system prompt must include: "At the start of each turn, check `project_meta` for the current session state before taking any action."
- Use subagents for bounded subtasks: a subagent's context is isolated and compacted independently from the orchestrator's context. Use them for token-intensive research tasks.

**Warning signs:**
- Orchestrator creates duplicate tasks after a long session.
- Orchestrator re-queries decisions already applied earlier in the same session.
- `query()` usage shows sudden token count reset (compaction occurred) followed by repetitive behavior.

**Phase to address:** Orchestrator architecture phase. Session state persistence via `project_meta` and the `PreCompact` hook must be wired before multi-turn orchestration is tested.

---

### Pitfall 11: LanceDB Concurrent Write Corruption From Parallel Agents

**What goes wrong:**
Multiple subagents run in parallel in wave-based execution. If two agents call Synapse tools that write to the same LanceDB table simultaneously (e.g., two Executor agents writing `activity_log` entries, or Decomposer and Executor both writing `tasks`), LanceDB's embedded embedded mode has limited concurrent write isolation. On the local filesystem (non-S3), LanceDB uses file-level locking, but concurrent `add()` operations can leave the table in a partially written state if the process is killed mid-write, and the Node.js side does not expose retry logic.

**Why it happens:**
LanceDB's Lance format is append-optimized but not MVCC-safe for concurrent writes from multiple OS processes. Synapse is a single process — but if the orchestrator spawns Synapse once and multiple agents call it rapidly in parallel (all channeled through the single stdio MCP connection), write ordering is serialized through the MCP layer. The actual risk is the orchestrator having multiple `query()` calls open simultaneously that each talk to the same Synapse subprocess — which is not supported; one subprocess cannot handle two simultaneous MCP connections.

**How to avoid:**
- Enforce a single Synapse MCP connection for the orchestrator. Do not spawn multiple Synapse processes. All agent tool calls route through the single `mcpServers` connection, which MCP serializes at the stdio level.
- Write operations in Synapse tools must be wrapped in a write queue (in-process mutex in Synapse's server.ts) to serialize concurrent writes even if multiple MCP requests arrive quickly.
- `activity_log` writes are the highest-frequency write; use batched inserts: collect multiple log entries and flush every 500ms rather than inserting one row per event.
- Never call `query()` concurrently on the same orchestrator session for different agents. Use one `query()` call with subagents defined in `agents` — the SDK handles parallelism internally and routes through the same connection.

**Warning signs:**
- LanceDB table corruption errors (`cannot open file for writing`) on high-frequency write workloads.
- Multiple orchestrator processes launched accidentally, each trying to write to the same `.synapse/` directory.
- Activity log has missing entries after a parallel wave execution.

**Phase to address:** Orchestrator architecture + task execution phase. Single-connection enforcement must be an architectural invariant, not a runtime assumption.

---

### Pitfall 12: Stale Decision Cache — Agent Uses Outdated Precedent After Schema or Policy Change

**What goes wrong:**
The decision tracking system embeds decision rationale for semantic search. If the project schema changes significantly (new tables, new tool names, new tier definitions), existing decisions may still be returned by `check_precedent` as applicable even though they reference an obsolete context. An agent following a stale decision may make incorrect architectural choices or reject valid actions based on superseded policy.

**Why it happens:**
Decisions are stored as append-only rows with no invalidation mechanism. Unlike document versioning (which supports `status: "superseded"`), decisions don't automatically expire. A decision written in Phase 1 ("always embed before inserting") remains fully valid to the precedent search in Phase 10 even if the rule has been modified.

**How to avoid:**
- Apply the same versioning model to decisions as to documents: decisions support `status` field with values `"active"`, `"superseded"`, `"archived"`. All `check_precedent` queries must filter `status = "active"`.
- When a decision is updated, the old decision row gets `status = "superseded"` and a new row is inserted — preserving history but removing the old decision from precedent search.
- Store `applies_to_phase` or `scope` on decisions. Precedent queries can optionally scope by phase.
- Implement a `supersede_decision(old_id, new_rationale)` tool that atomically marks old as superseded and creates the replacement.

**Warning signs:**
- `check_precedent` returns decisions that reference tools or schema that no longer exist.
- Agents cite superseded policies as justification for blocking valid actions.
- The decision table has no `superseded` status rows after multiple milestone iterations.

**Phase to address:** Decision tracking phase. Status field and supersede operation must be designed alongside `store_decision`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No init-message MCP status check | Faster orchestrator startup code | Orchestrator silently does nothing when Synapse fails to start | Never — always check init message |
| Omitting `tools` field on subagents | Fewer lines of code | Subagents inherit `Task` tool, enabling accidental recursive spawning | Never — always specify tools explicitly |
| No `root_id` denormalized field on tasks | Simpler schema | Every tree query requires N BFS iterations; no single-query ancestry lookup | Acceptable only if max hierarchy depth is 2 |
| Skill injection without token budget | Simpler skill loader | Context exhaustion mid-task; expensive compaction on every agent turn | Never — track tokens per skill from day one |
| No `PreCompact` hook for session state | Fewer hooks to implement | Orchestrator loses task/decision context after compaction | Never for production sessions |
| Single hardcoded precedent threshold (0.75) | Simple implementation | False positives in cross-domain precedent matching | Never — parameterize per decision_type |
| Hook without try/catch | Faster prototyping | A null pointer in hook code crashes the entire orchestrator run | Never in production code path |
| Large get_smart_context response with no token cap | More information per call | stdio buffer deadlock risk; context window consumed in one tool call | Never — always cap at 8K tokens per response |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Agent SDK `mcpServers` | Passing `command: "bun"` without validating Bun is in PATH | Verify Bun is accessible from orchestrator's process environment; use absolute path if needed |
| Agent SDK `allowedTools` | Omitting `mcp__synapse__*` wildcard | Every Synapse tool must be explicitly whitelisted or use wildcard; SDK blocks tool calls by default |
| Agent SDK `agents` field | Including `Task` in a subagent's `tools` | Subagents cannot spawn subagents; `Task` must be absent from all 10 agent tool lists |
| Hook `hookSpecificOutput` | Returning `permissionDecision: "allow"` without `hookEventName` | `hookEventName` is required in `hookSpecificOutput` for `PreToolUse` hooks; omitting it is silently ignored |
| Hook input modification | Mutating `tool_input` in place | Always return a new object in `updatedInput`; also requires `permissionDecision: "allow"` to take effect |
| LanceDB task queries | Using `WITH RECURSIVE` SQL | Use application-level BFS with `parent_id IN (...)` queries; DataFusion recursive CTEs not enabled in LanceDB |
| Skill loading | Loading full skill body for all agents at startup | Use progressive disclosure: names only at init, full body only when agent requests it via `load_skill` tool |
| Decision embedding | Using the same similarity threshold as document search (0.70) | Decisions need 0.85+ threshold; short rationale text produces noisier embeddings than full documents |
| MCP `mcp__synapse__*` tool naming | Hard-coding tool names without the `mcp__<server-name>__` prefix | Tool names in hooks and `allowedTools` must match `mcp__synapse__store_decision`, not `store_decision` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| BFS task tree traversal without depth limit | `get_task_tree` hangs on malformed hierarchy with cycles | Always cap BFS at `maxDepth=5` and check for visited IDs | Trees with depth > 5 or cycles |
| Embedding short decision rationale (< 20 tokens) | `check_precedent` returns high-similarity matches for unrelated queries | Enforce minimum rationale length of 50 tokens; block store_decision with shorter rationale | From the first decision stored |
| Parallel subagents all calling `store_document` or `create_task` | LanceDB fragment accumulation from N rapid sequential inserts | Synapse write queue: batch rapid writes; the MCP stdio layer serializes calls but batching reduces fragment count | > 5 parallel agents writing simultaneously |
| Skill loading full skill bodies at agent init | 20K+ tokens consumed before first task | Progressive loading; skill bodies only loaded on demand | > 3 skills with > 2K token bodies each |
| No response size cap on MCP tool results | stdio pipe buffer fills; orchestrator hangs | Enforce per-tool token limits on all Synapse tool responses | Response bodies > 64KB |
| Re-checking `check_precedent` on every tool call | Redundant semantic searches; 10x embedding cost | Cache precedent results within a single agent turn; only re-check when decision domain changes | Agents with > 20 tool calls per turn |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Skill files without content hash validation | Poisoned skills redirect agents, bypass guardrails, or exfiltrate data | Store content hash in skill registry; verify hash before loading skill into prompt |
| `permissionMode: "bypassPermissions"` in production | Bypasses all safety prompts including for destructive operations; propagates to subagents | Use `"acceptEdits"` for production; `"bypassPermissions"` only in sandboxed test environments |
| Tier authority enforcement only in agent prompts | A skilled LLM can be persuaded to exceed its tier by adversarial task content | Enforce tier authority in `PreToolUse` hooks, not just system prompts; hooks cannot be overridden by prompt content |
| Storing full decision rationale with project-confidential information | Decision rationale is stored as searchable text; `query_decisions` with no auth | Synapse is local-only; document that decisions are not encrypted; do not store passwords or secrets in rationale |
| Agent SDK `systemMessage` in hook output visible to model | Hook-injected context can be observed by malicious skill content and used to craft better injection | Avoid injecting sensitive operational data (API keys, internal file paths) via `systemMessage`; log to stderr instead |

---

## Testing Pitfalls — Orchestrator-Specific

### Pitfall T1: No Mocking Strategy = Every Test Burns API Tokens

**What goes wrong:**
Developers write integration tests that call `query()` directly. Each test turn costs real API tokens. Running the full orchestrator test suite (10 agents × multiple turns × multiple test cases) becomes prohibitively expensive and slow. Tests become brittle because they depend on LLM non-determinism.

**How to avoid:**
- **Layer 1 — Pure unit tests (no API cost):** Test hook callback functions, skill loading logic, task tree BFS, status propagation, and precedent threshold logic independently. These are pure TypeScript functions that don't need the SDK.
- **Layer 2 — MCP tool tests (no orchestrator cost):** Use the existing Synapse test harness to test `store_decision`, `create_task`, `check_precedent` etc. These already exist and run without API calls.
- **Layer 3 — Mock orchestrator (minimal API cost):** For orchestrator integration tests, mock the `query()` function to return pre-recorded message sequences. Record a golden test session once, then replay it. This is standard practice for agentic system testing.
- **Layer 4 — Live smoke tests (real API cost):** Run against real API only in CI on merge to main. One smoke test per milestone phase, not per test case.
- Use a `.env.test` flag to switch between mock and live orchestrator. Default to mock.

**Warning signs:**
- Orchestrator test suite costs > $5 per run.
- Tests pass non-deterministically (sometimes pass, sometimes fail based on LLM output).
- Developers avoid running tests because they're too expensive.

**Phase to address:** Orchestrator architecture phase. The mock/record/replay harness must be built before the first orchestrator integration test is written.

---

### Pitfall T2: Testing Hooks in Isolation Misses Ordering Bugs

**What goes wrong:**
Hook unit tests call individual hook callbacks with hand-crafted inputs and assert the return value. This misses bugs caused by hook ordering: multiple `PreToolUse` hooks chained together, where Hook A's `systemMessage` output interacts unexpectedly with Hook B's `permissionDecision`. The first hook to return `deny` wins (SDK precedence rule), so a hook ordering bug can silently allow operations that should be denied (wrong hook runs first) or deny ones that should be allowed (a broad hook catches a specific case before a narrow hook can allow it).

**How to avoid:**
- Write hook chain integration tests that simulate the full hook execution sequence using the SDK's actual hook runner. The Agent SDK processes hooks in the order they appear in the array — test with at least three hooks chained.
- The tier enforcement hook must always be the **first** hook in `PreToolUse` (fastest deny path). Quality gate hooks run after. Logging hooks run last.
- Test hook ordering explicitly: register a deny hook for `mcp__synapse__store_decision`, then an allow hook — verify deny wins. Register the same in reverse — verify allow wins (because no deny is present in this ordering).

**Warning signs:**
- A Tier 0 agent successfully calls a Tier 3 tool that should be blocked.
- Audit log hook fires for denied operations (should not log what wasn't executed).
- Hook ordering is implicit (array position) but not documented or tested.

**Phase to address:** Hook implementation phase. Ordering tests must exist alongside each hook.

---

## "Looks Done But Isn't" Checklist

- [ ] **MCP init status checked:** The first message from `query()` is parsed for server connection status. If Synapse shows `status !== "connected"`, the orchestrator throws before attempting any agent work.
- [ ] **Subagent `tools` arrays are explicit:** Every agent definition has an explicit `tools` array. None rely on inheritance. `Task` is absent from all 10 subagent definitions.
- [ ] **Hook callbacks never throw:** Each hook has a top-level try/catch. Call each hook with `null` and `undefined` inputs; assert it returns `{}` not an exception.
- [ ] **`root_id` field populates on task creation:** Create a 3-level task hierarchy (Epic → Feature → Task). Verify all three rows have the same `root_id` equal to the Epic's task_id.
- [ ] **`get_task_tree` depth is capped:** Create a 10-level chain of tasks. Call `get_task_tree`; verify it returns no more than 5 levels and includes a `truncated: true` indicator.
- [ ] **Precedent threshold calibrated:** Store 5 decisions across 5 distinct domains. Query each domain with a string from a different domain. Verify zero results with similarity > 0.85.
- [ ] **`PreCompact` hook archives session state:** Run an orchestrator session to 80% of context limit. Verify `project_meta` contains current task IDs and workflow stage before compaction fires.
- [ ] **Skill token budget enforced:** Load 10 skills simultaneously for one agent. Verify combined system prompt token count remains under 30% of context window. Verify stage-2 bodies load only on demand.
- [ ] **Skill content hash validated:** Modify a skill file after the registry is initialized. Verify `load_skill` rejects the modified file with a hash mismatch error.
- [ ] **Stale status reconciler runs at startup:** Kill the orchestrator mid-execution (leaving tasks in `"in_progress"`). Restart. Verify `reconcile_task_tree` runs automatically and marks stalled tasks appropriately.
- [ ] **Decision `status = "active"` filter enforced:** Supersede a decision. Call `check_precedent` with a query that matches it. Verify zero results (superseded decision not returned).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Synapse MCP subprocess fails to connect | LOW | Check Bun PATH, verify stdio transport config, check `.mcp.json` server name matches `allowedTools` prefix |
| stdio deadlock — orchestrator hung | LOW | Kill orchestrator; reduce response size limits on offending Synapse tool; restart |
| Task tree inconsistent after orchestrator crash | LOW | Run `reconcile_task_tree(epic_id)`; script marks stalled tasks; orchestrator picks up from last known good state |
| Skill causes unexpected agent behavior | MEDIUM | Remove/quarantine skill file; verify skill content hash in registry; re-run with skills disabled to confirm normal behavior |
| Precedent false positives blocking valid actions | MEDIUM | Raise similarity threshold; add `decision_type` filter; manually supersede incorrectly matched decisions |
| Context compaction loses task state | MEDIUM | Retrieve archived session log from Synapse documents; resume from `project_meta` session state snapshot |
| Hook exception crashes orchestrator | LOW | Identify offending hook from stack trace; add try/catch; re-run — the hook now returns `{}` on error |
| LanceDB `tasks` or `decisions` table has orphaned records | MEDIUM | Run reconciler; manually update status via a one-off Synapse tool call; no table rebuild needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Synapse MCP silent failure | Orchestrator bootstrap | Init message parsed; status check throws if not `"connected"` |
| stdio buffer deadlock | MCP tool design + orchestrator bootstrap | Load test with `get_smart_context` returning max token response; no hang |
| No recursive CTE for task hierarchy | Task hierarchy schema | `get_task_tree` returns correct tree via BFS; `WITH RECURSIVE` never used in Synapse code |
| Subagents spawning subagents | Agent architecture | All 10 agent definitions have explicit `tools` arrays; `Task` absent from all |
| Hook exception terminates orchestrator | Hook implementation | Each hook called with null inputs; assert no throw |
| Semantic drift in precedent matching | Decision tracking | Cross-domain query returns 0 matches at 0.85 threshold |
| Skill token budget exhaustion | Skill loading | 10 skills loaded; combined system prompt < 30% of context window |
| Skill injection attack surface | Skill loading | Tampered skill rejected by hash check |
| Orphaned tasks after crash | Task hierarchy | Kill orchestrator mid-run; reconciler repairs tree on restart |
| Context compaction loses session state | Orchestrator architecture | `PreCompact` hook verified; session state in `project_meta` after compaction |
| Parallel agent write conflicts | Orchestrator architecture | No second Synapse process spawned; in-process write queue serializes rapid writes |
| Stale decisions | Decision tracking | `status = "active"` filter on all precedent queries; `supersede_decision` tested |
| No mock strategy for agent tests | Orchestrator architecture | Test suite runs offline (mock mode); zero API tokens consumed in unit tests |
| Hook ordering bugs | Hook implementation | Ordering integration tests exist; deny-before-allow chain verified |

---

## Sources

- [Claude Agent SDK — Official Overview](https://platform.claude.com/docs/en/agent-sdk/overview) — HIGH confidence (official docs)
- [Claude Agent SDK — Hooks Reference](https://platform.claude.com/docs/en/agent-sdk/hooks) — HIGH confidence (official docs)
- [Claude Agent SDK — MCP Integration](https://platform.claude.com/docs/en/agent-sdk/mcp) — HIGH confidence (official docs)
- [Claude Agent SDK — Subagents Guide](https://platform.claude.com/docs/en/agent-sdk/subagents) — HIGH confidence (official docs)
- [claude-agent-sdk-python Issue #145 — SDK hangs after MCP tool execution](https://github.com/anthropics/claude-agent-sdk-python/issues/145) — HIGH confidence (official issue tracker)
- [claude-agent-sdk-python Issue #207 — MCP servers show "failed" status](https://github.com/anthropics/claude-agent-sdk-python/issues/207) — HIGH confidence (official issue tracker)
- [claude-agent-sdk-python Issue #208 — SDK hangs on Windows during init](https://github.com/anthropics/claude-agent-sdk-python/issues/208) — HIGH confidence (official issue tracker)
- [Claude Code Issue #7718 — SIGABRT during shutdown due to MCP server termination failure](https://github.com/anthropics/claude-code/issues/7718) — MEDIUM confidence (product issue, patterns applicable to SDK)
- [DataFusion Issue #9554 — Enable recursive CTE by default](https://github.com/apache/datafusion/issues/9554) — HIGH confidence (official upstream issue; LanceDB uses DataFusion)
- [Agent Skills Prompt Injection — arXiv 2510.26328](https://arxiv.org/abs/2510.26328) — HIGH confidence (peer-reviewed, October 2025)
- [Prompt Injection Attacks on Agentic Coding Assistants — arXiv 2601.17548](https://arxiv.org/html/2601.17548v1) — HIGH confidence (peer-reviewed, 2026)
- [SkillJect: Stealthy Skill-Based Prompt Injection — arXiv 2602.14211](https://arxiv.org/html/2602.14211) — MEDIUM confidence (peer-reviewed, 2026; adversarial context)
- [Stop Stuffing Your System Prompt — Medium 2026](https://pessini.medium.com/stop-stuffing-your-system-prompt-build-scalable-agent-skills-in-langgraph-a9856378e8f6) — MEDIUM confidence (practitioner blog, aligns with official SDK design)
- [LanceDB Agent SDK Subagent — "agents cannot spawn subagents"](https://platform.claude.com/docs/en/agent-sdk/subagents) — HIGH confidence (official docs; explicitly stated)
- [Agentic orchestration state synchronization pitfalls — N-ix observability guide](https://www.n-ix.com/ai-agent-observability/) — MEDIUM confidence (practitioner analysis)
- [How We Are Testing Our Agents in Dev — Towards Data Science](https://towardsdatascience.com/how-we-are-testing-our-agents-in-dev/) — MEDIUM confidence (practitioner article, patterns align with official guidance)
- [LanceDB v1.0 PITFALLS.md (Synapse project)](../.planning/research/PITFALLS.md) — HIGH confidence (project-specific, already validated in v1.0 build)

---
*Pitfalls research for: Adding agentic coordination layer (Claude Agent SDK, decision tracking, task hierarchy, skill loading) to existing Synapse MCP server — v2.0 milestone*
*Researched: 2026-03-01*
