# Phase 14: Quality Gates and PEV Workflow - Research

**Researched:** 2026-03-02
**Domain:** Claude Code hooks enforcement, multi-agent orchestration, PEV workflow, git worktree isolation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hook Denial Behavior**
- Actionable error messages on denial — tell the agent what to do next (e.g., "DENIED: executor cannot store Tier 1 decisions. Escalate to architect.")
- Agents learn their tier authority via SessionStart hook injection — hook reads trust.toml + agents.toml and injects structured context ("You are executor. Your tier authority: [3]. Tier 0-1 decisions require user collaboration.")
- Tier 0 decisions: the agent proactively collaborates with the user to refine the decision BEFORE storage. The hook is a safety net, not the primary mechanism.
- Most restrictive hook wins when multiple hooks fire (deny > ask > allow)
- Individual hook files per concern: tier-gate.js, tool-allowlist.js, precedent-gate.js, audit-log.js — matches existing pattern (synapse-audit.js, synapse-startup.js)
- Fail-closed on hook errors — if a hook crashes or gets bad input, deny the tool call. Errors are logged.
- Tool-allowlist hook (GATE-02) enforces Synapse MCP tools only — Claude Code built-in tools (Read, Write, etc.) are not gated
- Precedent gate: inject existing precedent context before decision storage. Mechanism (block vs inject) at Claude's discretion — the value is surfacing the information, not the gate mechanism.

**Audit and Observability**
- Audit hook expanded to log ALL tool calls (not just Synapse MCP tools) with timestamp, agent identity, tool name, and result summary
- Token cost estimation per tool call — use input/output character count to estimate tokens, reuse existing token-estimator pattern from Synapse server (Math.ceil(chars / 4))

**PEV Trigger and User Experience**
- Both natural language and structured command trigger supported — orchestrator normalizes both
- Milestone checkpoint visibility — structured status blocks at wave boundaries
- Layered approval model with single threshold: `epic`, `feature`, `task`, `none`
  - Current trust.toml `decomposition = "strategic"` maps to the `epic` threshold
- Every approval point is conversational — options: approve, provide feedback/refine, or discuss further
- Optional goal → multiple epics decomposition; single-epic goals still work
- PEV state persisted for session resume — task tree tracks wave progress; resume is user-triggered

**Progressive Decomposition**
- On-demand (JIT) decomposition: Epic→Features validated upfront, Features→Tasks decomposed only when a feature starts
- Decomposer ↔ Plan Reviewer verification loop uses the existing plan-reviewer agent (separate agent, not self-review)

**Validation Strategy**
- Mandatory validation tasks in decomposition: unit test expectations per task, integration test per feature, epic integration task per epic
- Task-level: validator agent checks individual task output against spec
- Feature-level: integration-checker agent verifies contracts between tasks within a feature
- Epic-level: integration-checker validates cross-feature integration
- Validation triggers per task completion, but wave halts on any failure

**Execution Isolation**
- Executors run in isolated git worktrees (Claude Code Task tool `isolation: "worktree"`)
- Merge strategy: per feature — all tasks within a feature complete + integration check passes → merge feature branch to main
- Sequential merge of task branches into feature branch (one at a time, resolve conflicts if needed)

**Failure Escalation and Rollback**
- Cascading failure escalation through the layer hierarchy
- Retry caps: 3 retries at task level, 2 at feature level, 1 at epic level
- Debugger agent gets full context handoff on executor failure
- Auto-revert failed tasks (git), keep passing tasks within the feature
- Escalation UX: present findings + propose revised plan

### Claude's Discretion
- Retry agent selection (fresh executor vs. resume original) — determine based on Task tool capabilities
- Precedent gate mechanism (inject vs. block-until-acknowledged)
- Exact structured status format for wave checkpoints
- Default parallel executor cap value (suggested 3-4, configurable)
- How to extend trust.toml/synapse.toml with PEV process control settings

### Deferred Ideas (OUT OF SCOPE)
- Epic-level validation agent (beyond integration-checker) — future phase
- Cost tracking dashboard / aggregation beyond per-call logging — future phase
- Per-domain hook configuration (different strictness for different domains) — future refinement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GATE-01 | PreToolUse hook enforces tier authority — agents cannot store decisions above their permitted tier | Hook denial pattern via `permissionDecision: "deny"` + hookSpecificOutput; trust.toml tier_authority is the source of truth |
| GATE-02 | PreToolUse hook enforces tool allowlists — agents can only call Synapse MCP tools in their agent definition's allowed_tools | Hook matcher `mcp__synapse__.*`; agents.toml `allowed_tools` is source of truth; built-in tools (Read, Write) not gated per decision |
| GATE-03 | PreToolUse precedent-gate injects "check precedent first" context before decision storage | `additionalContext` field in PreToolUse hookSpecificOutput with `permissionDecision: "allow"` allows the call while injecting guidance |
| GATE-04 | PreToolUse user-approval hook returns "ask" for Tier 0 decisions | `permissionDecision: "ask"` in hookSpecificOutput triggers user confirmation dialog |
| GATE-05 | PostToolUse audit hook logs all tool calls to file with timestamp, agent, tool, and result summary | Extend existing synapse-audit.js; remove mcp__synapse__ filter; add token estimation using `Math.ceil(chars/4)` pattern from skills.ts |
| GATE-06 | Every hook callback wrapped in top-level try/catch — hooks degrade gracefully under any input | Change silent-fail pattern (`catch { process.exit(0) }`) to fail-closed for PreToolUse enforcement hooks; keep silent-fail for PostToolUse/SessionStart |
| GATE-07 | Hook ordering tested: deny takes priority over ask over allow | Verified by official docs: "most restrictive hook wins" is enforced by Claude Code itself when multiple hooks fire on same event; test by sending conflicting decisions from multiple hooks for same tool call |
| WFLOW-01 | PEV workflow in workflows/ orchestrates Decomposer → Executor → Validator sequence | Implemented as an orchestrator agent command or workflow document; Synapse task tree tracks wave state; no separate runtime process needed |
| WFLOW-02 | PEV loop capped at 3 iterations; iteration 3 failure escalates to user | Implemented in orchestrator prompt logic; retry counts tracked in task metadata or description fields |
| WFLOW-03 | Wave-based parallel execution: independent leaf tasks in same wave execute concurrently via Claude Code Task tool | Task tool (formerly "Task") spawns subagents with `isolation: "worktree"`; multiple calls in parallel within one orchestrator turn |
| WFLOW-04 | Wave N+1 starts only after all tasks in wave N are validated complete | Orchestrator awaits all Task tool results before proceeding; validation check on task status in Synapse task tree |
| WFLOW-05 | Executor failures trigger Debugger agent for root-cause analysis before retry | Orchestrator spawns Debugger subagent after executor failure; debugger produces document; executor retried with that document in context |
| WFLOW-06 | Decomposer ↔ Plan Reviewer verification loop (max 3 iterations) gates execution start | Orchestrator runs Decomposer as subagent, then Plan Reviewer as subagent; loops until plan passes or max iterations hit |
| WFLOW-07 | Progressive decomposition: Epic→Features validated upfront, Features→Tasks decomposed JIT when feature starts | Orchestrator decomposes one level at a time; executes next feature only after current feature completes and integrates |
| WFLOW-08 | Full rollback support: tasks can be reopened and associated code changes reverted via git | git worktree auto-cleanup on no-change; manual revert via `git revert` or `git reset` on feature branch before merge |
</phase_requirements>

## Summary

Phase 14 has two independent subsystems that must be built: (1) the hook enforcement layer (GATE-01 through GATE-07) and (2) the PEV orchestration workflow (WFLOW-01 through WFLOW-08). Both are well-supported by Claude Code's documented APIs and the existing codebase. The research flag about "limited public implementation examples" for the wave controller was accurate as of late 2025 but the official documentation now covers parallel subagent execution with worktree isolation thoroughly.

The hook subsystem is the lower-risk deliverable. The PreToolUse hook JSON protocol is well-documented and the existing synapse-audit.js and synapse-startup.js provide proven patterns to extend from. Four new hook files (tier-gate.js, tool-allowlist.js, precedent-gate.js, audit-log.js) need to be created, all following the same stdin/stdout/ESM structure already established. The critical behavior change from the existing pattern is **fail-closed**: PreToolUse enforcement hooks must deny on error, not silently pass.

The PEV workflow subsystem is higher complexity but not technically unknown. The orchestrator agent already has the Task tool (recently renamed from Task to Agent in v2.1.63, but aliases still work) and can spawn executor subagents with `isolation: "worktree"`. The key implementation insight is that the PEV workflow lives entirely within the orchestrator agent's prompt instructions plus a workflow configuration document — no separate runtime process is needed. Wave state is tracked in the Synapse task tree via existing MCP tools.

**Primary recommendation:** Build GATE subsystem first (lower risk, concrete API surface, enables safe testing of hooks before PEV); then WFLOW subsystem. Plan them as two separate plans.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (ESM) | Built-in | Hook script runtime | Already used by synapse-audit.js and synapse-startup.js; Claude Code hooks run via `node` |
| Bun | Workspace | Test runner | Project standard (CLAUDE.md); `bun test` runs hook unit tests |
| smol-toml | Latest | TOML parsing in hooks | Already peer dep in @synapse/framework; config.ts uses it |
| Zod | 4.x | Config validation | Already in framework; loadTrustConfig/loadAgentsConfig already validate the config hook will read |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs | Built-in | Audit log appending | Used by existing synapse-audit.js |
| node:path | Built-in | Path resolution | Used by existing synapse-audit.js |
| node:child_process (spawnSync) | Built-in | Hook testing | Already used in hooks.test.ts for subprocess testing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ESM .js hook scripts | TypeScript compiled | TypeScript adds compile step; hooks run via `node`, not `bun run`; existing hooks are plain .js ESM — maintain consistency |
| Inline config parsing | Reuse loadTrustConfig from config.ts | config.ts is a TypeScript module; hooks are plain JS; hooks must re-implement TOML parsing using dynamic import or duplicate the logic |
| Process.exit(2) for denial | JSON hookSpecificOutput deny | Both work; JSON `permissionDecision: "deny"` is the modern documented approach and provides structured reason to Claude; exit(2) sends stderr to Claude as raw text — use JSON output |

**Installation:** No new packages needed. All required capabilities exist in the current workspace.

## Architecture Patterns

### Recommended Project Structure
```
packages/framework/
├── hooks/
│   ├── synapse-startup.js      # EXISTS — extend SessionStart to inject tier identity
│   ├── synapse-audit.js        # EXISTS — extend to log all tools + token estimates
│   ├── tier-gate.js            # NEW — PreToolUse: enforce tier authority
│   ├── tool-allowlist.js       # NEW — PreToolUse: enforce Synapse MCP tool allowlist
│   ├── precedent-gate.js       # NEW — PreToolUse: inject precedent context before store_decision
│   └── audit-log.js            # NEW — PostToolUse: expanded audit (replaces synapse-audit.js or coexists)
├── workflows/
│   └── pev-workflow.md         # NEW — PEV workflow instructions for orchestrator agent
└── config/
    └── trust.toml              # EXISTS — add pev section for approval threshold and parallel cap
```

### Pattern 1: PreToolUse Denial Hook (Fail-Closed)

**What:** Hook reads JSON from stdin, checks a condition, emits deny decision via stdout JSON, or passes via exit(0). All errors default to deny.

**When to use:** GATE-01 (tier-gate), GATE-02 (tool-allowlist), GATE-04 (user-approval)

**Example — tier-gate.js:**
```javascript
// Source: official Claude Code hooks reference (code.claude.com/docs/en/hooks)
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};

    // Only enforce on store_decision
    if (toolName !== 'mcp__synapse__store_decision') {
      process.exit(0);
    }

    const actor = toolInput.actor || '';
    const requestedTier = toolInput.tier ?? 3;

    // Read trust.toml to get tier authority for this agent
    const trustRaw = readFileSync('packages/framework/config/trust.toml', 'utf8');
    const trust = parseToml(trustRaw);
    const allowedTiers = trust.tier_authority?.[actor] ?? [];

    if (!allowedTiers.includes(requestedTier)) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `DENIED: ${actor} cannot store Tier ${requestedTier} decisions. ` +
            `Allowed tiers: [${allowedTiers.join(', ')}]. Escalate to the appropriate agent.`,
        },
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(0);  // exit(0) + JSON is the correct pattern; not exit(2)
    }

    process.exit(0); // allow
  } catch (e) {
    // Fail-closed: on any error, deny
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Hook error (tier-gate): ${e?.message || 'unknown'}. Denying as fail-safe.`,
      },
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  }
});
```

### Pattern 2: PreToolUse Context Injection (Precedent Gate)

**What:** Hook allows the call but injects additional context into Claude's conversation before the tool executes.

**When to use:** GATE-03 (precedent-gate)

**Example — precedent-gate.js:**
```javascript
// Source: official Claude Code hooks reference — additionalContext field
// Only fires on store_decision; injects "check precedent first" guidance
const output = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    additionalContext: 'REMINDER: Before storing this decision, verify you have called ' +
      'mcp__synapse__check_precedent. If a similar decision already exists, reference it ' +
      'rather than creating a duplicate.',
  },
};
process.stdout.write(JSON.stringify(output));
process.exit(0);
```

### Pattern 3: PreToolUse User-Approval (Ask)

**What:** Hook escalates decision to the user via an interactive dialog.

**When to use:** GATE-04 (Tier 0 decisions require user approval)

```javascript
// Source: official Claude Code hooks reference — permissionDecision: "ask"
const output = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'This is a Tier 0 (Product Strategy) decision. ' +
      'User approval required per trust.toml configuration.',
  },
};
process.stdout.write(JSON.stringify(output));
process.exit(0);
```

### Pattern 4: PostToolUse Audit with Token Estimation

**What:** Hook runs after tool call (cannot block), logs structured JSON to .synapse-audit.log.

**When to use:** GATE-05 (expanded audit hook)

```javascript
// Source: existing synapse-audit.js + skills.ts estimateTokens pattern
// Token estimation: Math.ceil(chars / 4) — matches locked decision from STATE.md
const tokenEstimate = (str) => Math.ceil((str || '').length / 4);

const logEntry = {
  ts: new Date().toISOString(),
  tool: toolName,
  agent: toolInput.actor || toolInput.assigned_agent || 'unknown',
  project_id: toolInput.project_id || null,
  input_tokens: tokenEstimate(JSON.stringify(toolInput)),
  output_tokens: tokenEstimate(JSON.stringify(data.tool_response || '')),
};
```

### Pattern 5: PEV Workflow as Orchestrator Instructions

**What:** The PEV workflow is not a separate runtime process. It lives as a markdown document in `workflows/` that the orchestrator agent reads and executes via its own reasoning.

**When to use:** WFLOW-01 through WFLOW-08

**Workflow document structure (pev-workflow.md):**
```markdown
# Plan-Execute-Validate Workflow

## Trigger
Natural language ("implement the auth feature") or structured command (/synapse:pev).

## Phase 1: Goal Intake and Epic Creation
1. Normalize trigger into a goal statement
2. check_precedent for related existing work
3. Create root epic via create_task (depth=0)
4. Determine approval threshold from trust.toml pev.approval_threshold
   - "epic": present feature list for user approval; autonomy below
   - "feature": present task list per feature for approval
   - "task": present each task plan for approval
   - "none": fully autonomous

## Phase 2: Progressive Decomposition
1. Spawn Decomposer subagent: decompose epic → features (depth=1)
2. If threshold requires approval, present feature list to user
3. For each feature (JIT):
   a. When feature is next to execute: spawn Decomposer subagent → tasks (depth=2,3)
   b. Spawn Plan Reviewer subagent to verify task plan (max 3 review cycles)
   c. If plan rejected: loop back to Decomposer with reviewer feedback

## Phase 3: Wave Execution
For each feature:
  1. Identify wave (independent tasks at same depth)
  2. Spawn executor subagents in parallel (Task tool, isolation: "worktree")
     - Cap: pev.max_parallel_executors (default: 3)
  3. Await all results (sequential collection)
  4. For each completed task: spawn Validator subagent
  5. If any validation fails: halt wave, trigger FAILURE ESCALATION
  6. Spawn Integration Checker after all feature tasks pass
  7. If integration passes: merge feature branch to main
  8. Emit wave checkpoint status block

## Phase 4: Failure Escalation
On executor failure:
  1. Spawn Debugger subagent with full context (task spec, error, files)
  2. Retry executor with debugger report (attempt count tracked in task metadata)
  3. Retry caps: 3 task, 2 feature, 1 epic
  4. If cap exceeded: escalate to user with findings + revised plan options
  5. Auto-revert task git changes on failure (git revert or worktree discard)
```

### Pattern 6: Parallel Executor Spawning (Task Tool)

**What:** The orchestrator agent spawns multiple executor subagents in parallel by issuing multiple Task tool calls in a single turn. Results arrive when all complete.

**When to use:** WFLOW-03 (wave-based parallel execution)

```javascript
// Source: official Claude Code sub-agents docs (code.claude.com/docs/en/sub-agents)
// The "Task" tool was renamed to "Agent" in v2.1.63; both aliases work
// In orchestrator agent frontmatter:
// tools: ..., Task, SendMessage, ...
//
// In orchestrator turn: issue all Task calls for wave tasks simultaneously:
// Task({ subagent_type: "executor", isolation: "worktree",
//        description: "Implement JWT signing utility",
//        prompt: "Task spec: ... Context: ..." })
// Task({ subagent_type: "executor", isolation: "worktree",
//        description: "Create token payload schema",
//        prompt: "Task spec: ... Context: ..." })
// Both run concurrently; orchestrator collects both results before wave N+1
```

**Important constraint:** Subagents spawned via Task tool **cannot spawn other subagents**. The orchestrator must manage all agent spawning. Nesting is not supported.

### Anti-Patterns to Avoid

- **Exit code 2 for PreToolUse denial:** Use JSON hookSpecificOutput with `permissionDecision: "deny"` instead. Exit code 2 sends stderr to Claude as raw unstructured text; JSON gives Claude the structured reason.
- **Silent-fail in enforcement hooks:** The current `catch { process.exit(0) }` pattern must be changed to deny in PreToolUse enforcement hooks. Only PostToolUse/SessionStart retain silent-fail.
- **Parsing trust.toml inside hook without error handling:** File may not exist in all working directories. Wrap filesystem reads in try/catch that fails closed.
- **Hardcoding config path:** Hooks run from process.cwd() which is the project root. Use relative paths or resolve from `$CLAUDE_PROJECT_DIR` if needed. Test this carefully.
- **Building a PEV runtime process:** The workflow lives in the orchestrator agent's instructions. No separate process, no separate binary. The orchestrator already has all the tools it needs.
- **Merging all feature branches at once:** The decision is per-feature merge: complete feature → integration check → merge to main → next feature. Not batch-merge at epic end.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hook JSON parsing | Custom parser | `JSON.parse(input)` with full try/catch | Standard; hooks already do this |
| TOML config reading | Custom TOML parser | `smol-toml` (already in project) | Already used in synapse-startup.js via dynamic import pattern |
| Token estimation | Implement tiktoken in hook | `Math.ceil(chars / 4)` inline | Matches locked decision; tiktoken is a heavy native dependency not suitable for a hook script |
| Parallel execution runtime | Custom worker pool | Claude Code Task tool with `isolation: "worktree"` | Already solves git isolation, context isolation, and parallel scheduling |
| Hook priority resolution | Custom deny > ask > allow logic | Claude Code handles this natively | When multiple PreToolUse hooks fire for the same tool, Claude Code applies the most restrictive decision automatically |
| Git worktree management | Custom git worktree lifecycle | Claude Code manages worktrees via `isolation: "worktree"` | Automatically cleaned up if no changes; handles branch creation |

**Key insight:** Claude Code's hook system is more capable than the existing codebase uses. The precedent-gate injection pattern (GATE-03) using `additionalContext` is cleaner than requiring a separate "check precedent" step — the hook runs automatically before every store_decision call.

## Common Pitfalls

### Pitfall 1: Hook Working Directory
**What goes wrong:** Hooks run from `process.cwd()` which is the project root when Claude Code is run from the project. But the working directory when a hook runs can vary based on how Claude Code is invoked.
**Why it happens:** Claude Code docs note hooks run with Claude Code's environment variables but the cwd is the project root (confirmed: `cwd` is a field in hook input JSON).
**How to avoid:** Use the `cwd` field from hook input JSON rather than assuming `process.cwd()` matches. Or use `$CLAUDE_PROJECT_DIR` env var which is available to hook commands. Read config files relative to this.
**Warning signs:** "File not found" errors in hook logs when trust.toml or agents.toml can't be opened.

### Pitfall 2: Config Caching vs. Live Reads
**What goes wrong:** Hooks read trust.toml and agents.toml on every invocation. If these are large or frequently changing, there is per-call overhead. More importantly: hooks run as separate processes — they cannot share an in-memory cache.
**Why it happens:** Each hook invocation is a fresh `node` process.
**How to avoid:** Keep config files small (they already are: trust.toml is ~35 lines). Accept the per-call file read overhead — it's trivial for local files. Do NOT attempt a shared memory cache.
**Warning signs:** Hook timeout on slow filesystems (unlikely but possible in CI).

### Pitfall 3: ESM Import in Hook Scripts
**What goes wrong:** `import { parse } from 'smol-toml'` fails in hooks because `node_modules` may not be in the hook's module resolution path.
**Why it happens:** Claude Code hooks run via `node` from the project directory. The `smol-toml` package is in `packages/framework/node_modules` not the root. Node.js will look in root `node_modules` first.
**How to avoid:** Either (a) add smol-toml to root dependencies, (b) use dynamic `import('smol-toml')` with a resolved path, or (c) inline a minimal TOML parser for the specific keys needed (tier_authority and allowed_tools are simple arrays). Research which package.json owns smol-toml in the monorepo and confirm accessibility.
**Warning signs:** `ERR_MODULE_NOT_FOUND` when testing hook with `node hook.js`.

### Pitfall 4: Agent Identity in Hook Context
**What goes wrong:** The hook reads `tool_input.actor` to identify the agent, but the orchestrator may not always include `actor` in every tool call.
**Why it happens:** Attribution is enforced by prompt instruction (per STATE.md: "Attribution enforced by prompt instructions in agent definition — Phase 14 GATE hooks enforce; Phase 12 establishes the convention"). Agents that omit `actor` will appear as 'unknown'.
**How to avoid:** For tier-gate and tool-allowlist hooks: if actor is 'unknown', default to the most restrictive tier/toolset (deny unknown agents tier 1+ decisions). Document this behavior in the hook.
**Warning signs:** Legitimate agents being denied because they forgot to include `actor`.

### Pitfall 5: Worktree Isolation and Tool-Allowlist Hook
**What goes wrong:** Executor subagents running in worktrees may trigger the tool-allowlist hook. The hook reads agents.toml to check allowed_tools, but the worktree's working directory may differ from the main repo.
**Why it happens:** `isolation: "worktree"` creates a separate working directory. Config file paths must be correct relative to that directory or use absolute paths.
**How to avoid:** Read config files using the `cwd` from hook input (which is always the hook's invocation directory, the project root) — not from inside the worktree.

### Pitfall 6: PEV State Tracking in Task Metadata
**What goes wrong:** Retry counts and wave progress tracked in task description fields get overwritten by executor updates.
**Why it happens:** `update_task` can overwrite any field including description; if validator and orchestrator both update the same task, one clobbers the other.
**How to avoid:** Use a dedicated metadata pattern: store retry counts as a prefix in the description ("RETRIES:2 | Original task: ...") and parse carefully. Alternatively, use the task status lifecycle (pending → in_progress → done/failed) as the state machine and store retry count in a separate parent task.

### Pitfall 7: "Task" vs. "Agent" Tool Name
**What goes wrong:** The Task tool was renamed to Agent in Claude Code v2.1.63. The orchestrator agent's `tools` frontmatter field may need updating.
**Why it happens:** API rename mid-development.
**How to avoid:** Use `Task` in agent frontmatter (still works as alias per official docs). Verify synapse-orchestrator.md already lists `Task` and it continues to function. Update to `Agent` only if Claude Code version requires it.
**Warning signs:** "Tool not found: Task" error when orchestrator tries to spawn subagents.

## Code Examples

### Hook Configuration (settings.template.json extension)
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "node packages/framework/hooks/synapse-startup.js" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "mcp__synapse__store_decision",
        "hooks": [
          { "type": "command", "command": "node packages/framework/hooks/tier-gate.js" },
          { "type": "command", "command": "node packages/framework/hooks/precedent-gate.js" }
        ]
      },
      {
        "matcher": "mcp__synapse__.*",
        "hooks": [
          { "type": "command", "command": "node packages/framework/hooks/tool-allowlist.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          { "type": "command", "command": "node packages/framework/hooks/audit-log.js" }
        ]
      }
    ]
  }
}
```

**Note:** Multiple hooks under the same matcher run in parallel. Claude Code applies most-restrictive decision. When tier-gate denies and precedent-gate allows, the final result is deny (GATE-07 verified behavior).

### Tier-Gate Fail-Closed Pattern
```javascript
// Source: official hooks reference — exit(0) + JSON for structured decisions
// hooks must use exit(0) + JSON, not exit(2), for PreToolUse decisions
// Exit(2) sends stderr raw text to Claude without structured reason

process.stdin.on('end', () => {
  try {
    // ... validation logic ...
    if (denied) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'DENIED: ...',
        },
      }));
      process.exit(0); // NOT exit(2) — JSON output only processed on exit(0)
    }
    process.exit(0); // allow
  } catch (e) {
    // Fail-closed
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Hook error: ${e?.message}. Denying as fail-safe.`,
      },
    }));
    process.exit(0);
  }
});
```

### Testing Hook with spawnSync (established pattern from hooks.test.ts)
```typescript
// Source: packages/framework/test/unit/hooks.test.ts — existing test pattern
import { spawnSync } from 'node:child_process';

const TIER_GATE = join(import.meta.dir, '../../hooks/tier-gate.js');

test('denies executor storing tier 1 decision', () => {
  const input = JSON.stringify({
    tool_name: 'mcp__synapse__store_decision',
    tool_input: { actor: 'executor', tier: 1, subject: 'Architecture choice' },
  });

  const result = spawnSync('node', [TIER_GATE], { input, encoding: 'utf8' });
  expect(result.status).toBe(0);

  const parsed = JSON.parse(result.stdout);
  expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('DENIED');
});

test('fails closed on malformed input', () => {
  const result = spawnSync('node', [TIER_GATE], {
    input: 'not json', encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
});
```

### PEV Trust Config Extension
```toml
# packages/framework/config/trust.toml additions
[pev]
# Maps to approval threshold: "epic" | "feature" | "task" | "none"
# "epic" = current "strategic" — approve feature list before execution
approval_threshold = "epic"
# Maximum parallel executor subagents per wave
max_parallel_executors = 3
# Maximum PEV retries per layer
max_retries_task = 3
max_retries_feature = 2
max_retries_epic = 1
```

### Wave Checkpoint Status Format (Claude's Discretion)
```
## Wave 2 Complete — Feature: JWT Token Generation (3/3 tasks)

| Task | Status | Agent | Notes |
|------|--------|-------|-------|
| Implement JWT signing utility | done | executor | signToken() with RS256, 15-min TTL |
| Create token payload schema | done | executor | TokenPayload interface + Zod schema |
| Implement refresh token generation | done | executor | Rotation pattern per D-47 |

Integration check: PASSED
Feature branch merged to main.
Next: Token Validation Middleware (Wave 3, 2 tasks ready)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `decision: "approve"/"block"` in PreToolUse | `hookSpecificOutput.permissionDecision: "allow"/"deny"/"ask"` | Claude Code ≥ 2.x | Old values still work as aliases but new format is documented standard |
| Task tool name | Agent tool name | v2.1.63 | `Task` still works as alias; existing synapse-orchestrator.md uses `Task` and is unaffected |
| Silent-fail (`catch { exit(0) }`) in all hooks | Fail-closed for enforcement hooks | Phase 14 design | Breaking change from existing pattern — must be explicit |
| PostToolUse only for Synapse MCP tools | PostToolUse for all tools | Phase 14 (GATE-05) | Expanded scope; remove mcp__synapse__ filter from audit hook |

**Deprecated/outdated:**
- `decision: "approve"` in PreToolUse: replaced by `permissionDecision: "allow"`. Old value maps to new per docs.
- `decision: "block"` in PreToolUse: replaced by `permissionDecision: "deny"`. Old value maps to new per docs.
- Silent-fail in enforcement hooks: intentional design change for Phase 14.

## Open Questions

1. **smol-toml availability in hook scripts**
   - What we know: smol-toml is a peerDep of @synapse/framework. In a Bun workspace monorepo, packages are in `packages/framework/node_modules` but Bun may hoist them to root.
   - What's unclear: Whether `node packages/framework/hooks/tier-gate.js` can `import 'smol-toml'` from the project root without explicit module resolution path.
   - Recommendation: The planner should include a Wave 0 task to test TOML import from a hook script. If it fails, inline a minimal parser for the specific config keys (tier_authority is `{ agentName: number[] }` — trivial to parse with a line-by-line regex fallback).

2. **Hook priority when multiple PreToolUse hooks fire**
   - What we know: Official docs state "All matching hooks run in parallel" and "identical handlers are deduplicated automatically." The most restrictive decision wins (deny > ask > allow).
   - What's unclear: The exact mechanism — does Claude Code pick the most restrictive *hookSpecificOutput* across all hook outputs? Or does it use the first deny it sees?
   - Recommendation: GATE-07 test must empirically verify this by running two hooks — one returning deny, one returning allow — for the same tool call and confirming deny wins.

3. **Retry agent selection: fresh executor vs. resume original**
   - What we know: Task tool creates a new subagent per invocation. There is a resume mechanism documented in the sub-agents page. Original agent can be resumed by passing agent ID.
   - What's unclear: Whether the orchestrator can reliably access the previous executor's agent ID after failure to resume it (vs. spawning fresh).
   - Recommendation: Use fresh executor by default (simpler, avoids stale context). Pass the debugger's document URL via the task description so the fresh executor has full failure context. Resume is an optimization for future phases.

4. **PEV workflow trigger: how the orchestrator receives both NL and structured commands**
   - What we know: The orchestrator agent already handles natural language goal intake and the /synapse:new-goal command.
   - What's unclear: Whether a separate /synapse:pev command is needed, or whether the orchestrator's existing session startup + goal intake flow already covers it.
   - Recommendation: The orchestrator agent prompt already describes the full PEV flow. The pev-workflow.md document in workflows/ formalizes the protocol. No new slash command needed — extend /synapse:new-goal or handle entirely in orchestrator agent instructions.

## Sources

### Primary (HIGH confidence)
- `/anthropics/claude-code` (Context7) — PreToolUse hook JSON format, hookSpecificOutput fields, permissionDecision values, exit code semantics, PostToolUse schema
- https://code.claude.com/docs/en/hooks — complete hook reference with all events, input schemas, decision control options, exit code table per event
- https://code.claude.com/docs/en/sub-agents — Task tool (Agent tool) parameters, isolation: "worktree" behavior, parallel subagent spawning, background execution
- https://code.claude.com/docs/en/agent-teams — subagents vs agent teams comparison, parallel execution patterns, worktree isolation for executors
- `/home/kanter/code/synapse/packages/framework/hooks/synapse-audit.js` — existing PostToolUse hook pattern (stdin/stdout/ESM/exit(0))
- `/home/kanter/code/synapse/packages/framework/hooks/synapse-startup.js` — existing SessionStart hook pattern (additionalContext injection)
- `/home/kanter/code/synapse/packages/framework/test/unit/hooks.test.ts` — established hook testing pattern (spawnSync with JSON input)
- `/home/kanter/code/synapse/packages/framework/config/trust.toml` — tier_authority source of truth
- `/home/kanter/code/synapse/packages/framework/config/agents.toml` — allowed_tools source of truth
- `/home/kanter/code/synapse/packages/framework/src/skills.ts` — estimateTokens(Math.ceil(chars/4)) pattern

### Secondary (MEDIUM confidence)
- https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2 — Task tool orchestration patterns (verified against official docs)
- https://claudefa.st/blog/guide/agents/sub-agent-best-practices — parallel subagent patterns (aligns with official docs)

### Tertiary (LOW confidence)
- https://github.com/nwiizo/ccswarm — multi-agent worktree orchestration example (community implementation; useful for wave pattern inspiration but not authoritative)

## Metadata

**Confidence breakdown:**
- Hook API (PreToolUse/PostToolUse format, exit codes, hookSpecificOutput): HIGH — verified against official Claude Code docs at code.claude.com/docs/en/hooks (fetched 2026-03-02)
- Parallel subagent execution via Task tool with worktree isolation: HIGH — verified against official Claude Code docs at code.claude.com/docs/en/sub-agents
- PEV workflow as orchestrator instructions (not a separate runtime): HIGH — confirmed by existing agent architecture and Task tool capabilities
- smol-toml availability in hook scripts: MEDIUM — the module is a peerDep but import resolution from a plain `node` subprocess in a Bun monorepo requires verification
- Hook priority resolution (deny > ask > allow across multiple hooks): MEDIUM — documented in general terms; exact mechanism needs empirical test (GATE-07)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (Claude Code API is stable; hook format unlikely to change within 30 days)
