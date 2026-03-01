# Phase 12: Framework Bootstrap - Research

**Researched:** 2026-03-01
**Domain:** Claude Code framework (agents, skills, hooks, commands, workflows) + TOML config + bun test harness
**Confidence:** HIGH

## Summary

Phase 12 establishes the `synapse-framework` repo — the Claude Code-native orchestrator that all subsequent phases (13, 14) will build on. The architecture is identical to how GSD works: markdown files in `.claude/` subdirectories that Claude Code loads natively, with JavaScript hooks for enforcement, and TOML config for runtime wiring. This is well-understood territory because the reference implementation (GSD, located at `.claude/get-shit-done/` and `.claude/`) is present on this machine and has been running in production throughout the v1.0 build.

The central technical risks are small and well-bounded: (1) the SessionStart hook `additionalContext` output format is confirmed working via multiple live plugin examples, (2) TOML config validation with `smol-toml` + Zod is already established in `synapse-server/src/config.ts`, and (3) the three-layer bun test harness pattern (unit with mocked fetch, integration with temp LanceDB, behavioral with JSON fixture replay) is proven by the 495-test suite in synapse-server.

The only genuinely new territory is the behavioral test layer with auto-recording. No VCR/fixture-recording library exists in the current bun ecosystem — the pattern must be hand-built using `fs.existsSync` + `fs.readFileSync/writeFileSync` around Claude Code API calls. This is a small, focused module (~50 lines) that the planner should treat as a standalone deliverable.

**Primary recommendation:** Model synapse-framework directly after the GSD repo structure. Implement the three test layers in Wave 0, ship the SessionStart startup hook in Wave 1, and validate everything with `bun test` before moving to Phase 13.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Build on Claude Code framework (like GSD), NOT standalone Agent SDK process
- Agents, skills, hooks, and workflows are files Claude Code loads natively
- Uses Claude Code subscription instead of per-token Anthropic API billing
- Future decouple to Agent SDK is possible — orchestration logic is portable

**Repository Structure:**
- Three separate repos: `synapse-server` (this repo), `synapse-framework` (new), `synapse-example` (new)
- Distribution model: CLI scaffolding (npx synapse-init) — user owns files after scaffolding (shadcn-ui model). Phase 12 establishes repo structure only; distribution CLI is future.
- Framework repo mirrors `.claude/` target layout — what you see in the repo is what lands in the project

**Framework Directory Structure:**
- Six directories: `agents/`, `skills/`, `hooks/`, `workflows/`, `commands/`, `config/`

**Session Model:**
- Hybrid: persistent project context (Synapse MCP data layer) + goal-scoped work streams
- Work stream = one user goal with its own task tree rooted at an epic
- Multiple parallel work streams supported
- Initiation: natural language goal OR `/synapse:new-goal` command
- Progressive decomposition: Epic → Features → Components/Tasks
- Configurable tiered approval: `always`, `strategic`, `none`
- Full attribution: every decision and task records which agent role performed it
- Full rollback: tasks can be reopened + git revert

**Startup Behavior:**
- Auto-detect open work on session startup
- Call `get_task_tree` on active epic(s) + `get_smart_context` in overview mode
- Present project status: current epic, features with state, recent activity

**Configuration:**
- TOML format (`smol-toml` already a Synapse dependency)
- `config/synapse.toml` — Synapse server connection (db path, Ollama URL), with Claude Code settings.json as fallback
- `config/secrets.toml` — API keys (gitignored), validated on startup
- `config/trust.toml` — Trust matrix with per-domain autonomy and approval tiers
- `config/agents.toml` — Agent registry, model assignments

**Test Harness:**
- Three layers: Unit (hooks/config, mocked), Integration (real Synapse + temp LanceDB), Behavioral (JSON fixture replay)
- Test runner: `bun test`
- JSON fixtures committed to git, auto-record on first run
- Prompt scorecards in `test/scorecards/*.scorecard.toml`

### Claude's Discretion

- Exact startup auto-detect UX (how status is formatted/presented)
- Fixture file naming conventions and directory structure
- TOML schema details for each config file
- Hook implementation details (JS structure, error handling)
- Prompt scorecard criteria format and scoring algorithm

### Deferred Ideas (OUT OF SCOPE)

- `npx synapse-init` CLI distribution tool
- Agent SDK decouple option
- Prompt scorecard dashboard
- Shared fixture bucket (S3) — rejected in favor of git-committed fixtures
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORCH-01 | Framework repo has agents/, skills/, hooks/, workflows/, commands/, config/ directories mirroring .claude/ target layout | Claude Code agent/hook/command file formats fully documented in research. GSD is the reference implementation on this machine. |
| ORCH-02 | Synapse MCP server connection configured in config/synapse.toml with Claude Code settings.json as fallback | `mcpServers` format confirmed via Context7. `smol-toml` v1.6.0 `parse` API confirmed. Config precedence pattern exists in synapse-server/src/config.ts. |
| ORCH-03 | Session startup auto-detects open work streams via Synapse get_task_tree and get_smart_context | SessionStart hook with `additionalContext` output confirmed via live plugin examples. Hook runs on every Claude Code session start. |
| ORCH-04 | Work stream lifecycle: create new (natural language or /synapse:new-goal), resume existing, multiple parallel streams supported | Slash command format confirmed (YAML frontmatter + markdown body). Parallel streams = multiple epic task trees in Synapse. |
| ORCH-05 | TOML config files validated on startup — missing or malformed config produces clear error | Zod + smol-toml pattern proven in synapse-server/src/config.ts. Same pattern applies in synapse-framework. |
| ORCH-06 | Three-layer test harness: unit (hooks/config), integration (Synapse MCP with temp LanceDB), behavioral (auto-recorded JSON fixtures committed to git) | Unit + integration patterns established in synapse-server's 495-test suite. Behavioral fixture recording is new but ~50 lines. |
| ORCH-07 | Full attribution — agent identity passed on all Synapse tool calls (decisions, tasks, activity log) | `activity_log.actor` field already exists. Attribution is a convention (pass agent name in calls) enforced by prompt, not schema change. |
| ORCH-08 | Prompt scorecards in test/scorecards/ define expected agent behaviors and score recorded outputs for regression testing | TOML is the right format. Scorecard is a new pattern — format is Claude's discretion, implementation is straightforward. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun | 1.3.9 (installed) | Runtime + test runner | Already used by synapse-server; `bun test` is the test command |
| smol-toml | 1.6.0 (installed) | TOML parsing and serialization | Already in synapse-server's dependencies; `parse` + `stringify` exports confirmed |
| zod | ^4.0.0 (installed) | Schema validation for TOML config | Already used throughout synapse-server for all tool input validation |
| node:fs | built-in | Fixture file read/write for behavioral tests | Standard; no extra dependency needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @biomejs/biome | latest (installed) | Linting and formatting for JS hooks | Hooks are JS files — same linter as synapse-server |
| node:child_process / Bun.spawn | built-in | Integration test: spawn Synapse server as subprocess | Same pattern as smoke.test.ts for full MCP round-trip tests |
| ulidx | ^2.4.1 (installed) | Generate ULIDs for fixture IDs in tests | Already in synapse-server; use for test isolation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| git-committed JSON fixtures | S3/external fixture store | Git is simpler, reproducible, no infra; rejected by user in CONTEXT.md |
| Hand-rolled fixture recorder | nock, msw, or polly.js | Those are Node/browser HTTP mocking; don't intercept Claude Code MCP calls; not applicable |
| TOML for scorecards | YAML or JSON | TOML is consistent with all config files; human-readable with comments |

**Installation:**
```bash
# synapse-framework is a new repo — bootstrap:
mkdir synapse-framework && cd synapse-framework
bun init -y
# smol-toml and zod already available in synapse-server;
# add to synapse-framework's package.json:
bun add smol-toml zod
bun add -d @biomejs/biome bun-types typescript
```

## Architecture Patterns

### Recommended Project Structure

```
synapse-framework/           # New repo, mirrors what lands in user's .claude/
├── agents/                  # Agent markdown files (system prompts)
│   └── synapse-orchestrator.md
├── skills/                  # Domain knowledge injected at spawn time
│   └── synapse-workflow.md
├── hooks/                   # Enforcement and logging (JS files)
│   ├── synapse-startup.js   # SessionStart: calls Synapse, outputs project status
│   └── synapse-audit.js     # PostToolUse: logs all tool calls to file
├── workflows/               # Multi-step orchestration (markdown)
│   └── pev-loop.md
├── commands/                # Slash commands (markdown with frontmatter)
│   └── synapse/
│       ├── new-goal.md
│       └── status.md
├── config/                  # TOML config files
│   ├── synapse.toml         # MCP server connection (db path, Ollama URL)
│   ├── trust.toml           # Trust matrix (per-domain autonomy levels)
│   ├── agents.toml          # Agent registry, model assignments
│   └── secrets.toml         # API keys (gitignored)
├── test/
│   ├── unit/               # Layer 1: mocked, no API
│   │   ├── config.test.ts  # TOML parsing and validation
│   │   └── hooks.test.ts   # Hook JS logic with mocked inputs
│   ├── integration/        # Layer 2: real Synapse + temp LanceDB, no API
│   │   └── startup.test.ts # get_task_tree + get_smart_context round-trip
│   ├── behavioral/         # Layer 3: auto-recorded JSON fixtures
│   │   ├── fixtures/       # Committed JSON response recordings
│   │   └── scorecard.test.ts
│   └── scorecards/         # Prompt quality scorecards
│       └── orchestrator.scorecard.toml
├── settings.json            # Claude Code settings.json template for projects
├── package.json
├── tsconfig.json
└── biome.json
```

### Pattern 1: Claude Code Agent File Format

**What:** Markdown file with YAML frontmatter that Claude Code loads as a subagent definition. The markdown body IS the system prompt.

**When to use:** Every specialized role in synapse-framework (orchestrator, researcher, executor, etc.) gets one file.

**Example:**
```markdown
---
name: synapse-orchestrator
description: Orchestrates Synapse work streams — creates epics, decomposes goals, routes to specialist agents. Use when user provides a new goal or requests status.
tools: Read, Write, Bash, Glob, Grep, Task, mcp__synapse__*
model: opus
color: purple
---

You are the Synapse Orchestrator. Your role is to translate user goals into structured work streams...

## Attribution
Always pass your agent identity on every Synapse tool call:
- store_decision: include `agent_role: "orchestrator"` in metadata
- create_task: include `assigned_agent: "synapse-orchestrator"` in the task

## Session Startup
On every session start, call:
1. `get_task_tree` for each active epic to get structural status
2. `get_smart_context` in overview mode for recent decisions and context
Present project status before asking what the user wants to do.
```

**Source:** Context7 `/anthropics/claude-code` — Agent File Structure documentation. Confirmed by GSD's `.claude/agents/` directory (live reference on this machine at `/home/kanter/code/project_mcp/.claude/agents/`).

### Pattern 2: SessionStart Hook with additionalContext

**What:** JavaScript hook that runs once per Claude Code session start. Outputs JSON to stdout with `additionalContext` to inject text into the agent's context before the first user message.

**When to use:** Startup auto-detection of open work streams (ORCH-03).

**Example:**
```javascript
// hooks/synapse-startup.js
#!/usr/bin/env node
// SessionStart hook — detect open work streams and inject project status

const { execSync } = require('node:child_process');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    // Call Synapse MCP to get active epics (via bun run src/index.ts or npx)
    // NOTE: SessionStart hooks run before agent context is loaded, so MCP tools
    // are NOT available via the hook mechanism. Instead, call Synapse directly
    // via CLI subprocess, or inject instructions for the agent to call on startup.
    //
    // RECOMMENDED APPROACH: Inject a startup instruction instead of calling Synapse.
    // The agent reads the instruction and calls get_task_tree itself.
    const additionalContext = [
      '## Synapse Session Start',
      'Before responding to the user, check for open work streams:',
      '1. Call get_task_tree for any active epics (depth=0, status="in_progress")',
      '2. Call get_smart_context in overview mode for recent decisions',
      '3. Present project status: active epic, feature progress, recent activity',
      '4. Ask the user what they want to work on, or offer to resume the active stream.',
    ].join('\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch {
    // Silent fail — never block session start
    process.exit(0);
  }
});
```

**Critical finding:** SessionStart hooks run BEFORE the MCP server is available to the agent. The hook itself cannot call Synapse MCP tools. The correct pattern is to inject instructions via `additionalContext` so the agent calls those tools in its first turn.

**Source:** Live plugin examples at `/home/kanter/.claude/plugins/marketplaces/claude-plugins-official/plugins/learning-output-style/hooks-handlers/session-start.sh` — confirmed `hookSpecificOutput.hookEventName + additionalContext` format. PostToolUse pattern confirmed in GSD's `gsd-context-monitor.js` at `/home/kanter/code/project_mcp/.claude/hooks/gsd-context-monitor.js`.

### Pattern 3: PreToolUse Hook for Attribution Enforcement

**What:** JavaScript hook that intercepts Synapse MCP tool calls and checks that the caller has provided agent identity. Returns `additionalContext` to remind, or blocks and asks for correction.

**When to use:** ORCH-07 — ensure agent identity is on all Synapse tool calls.

**Example:**
```javascript
// hooks/synapse-audit.js (PostToolUse pattern — logs, doesn't block)
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};

    // Only audit Synapse MCP tools
    if (!toolName.startsWith('mcp__synapse__')) {
      process.exit(0);
    }

    // Log to file with timestamp, agent, tool, result summary
    const logEntry = JSON.stringify({
      ts: new Date().toISOString(),
      tool: toolName,
      agent: toolInput.actor || 'unknown',
      input_keys: Object.keys(toolInput),
    });
    require('node:fs').appendFileSync('.synapse-audit.log', logEntry + '\n');
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
```

**Source:** GSD's context-monitor hook pattern (local reference). Exit code semantics: 0 = allow, 2 = block (PreToolUse only). PostToolUse hooks cannot block.

### Pattern 4: Claude Code settings.json mcpServers Format

**What:** JSON file at `.claude/settings.json` in the project root configures MCP servers for the project. This is how Synapse becomes available to Claude Code agents.

**Example:**
```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/synapse-server/src/index.ts", "--db", "/path/to/synapse.db"],
      "env": {
        "OLLAMA_URL": "http://localhost:11434",
        "EMBED_MODEL": "nomic-embed-text"
      }
    }
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/synapse-startup.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__synapse__.*",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/synapse-audit.js" }
        ]
      }
    ]
  }
}
```

**Critical finding:** The `config/synapse.toml` stores db path and Ollama URL; the startup config validation reads `synapse.toml` and generates/validates the `settings.json` mcpServers entry. The user-facing config is TOML; the Claude Code wiring is settings.json. These are two different things and need to be clearly separated in the plan.

**Source:** Context7 `/anthropics/claude-code` — MCP Tool Configuration in JSON. Live reference: project's `.claude/settings.json` shows the `hooks` section format.

### Pattern 5: TOML Config with Zod Validation

**What:** Replicate the synapse-server `loadConfig()` pattern for the framework config layer. Parse TOML with `smol-toml`, validate with Zod, fail-fast with clear errors.

**Example (from synapse-server/src/config.ts — already proven):**
```typescript
import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';

const SynapseConfigSchema = z.object({
  db: z.string().min(1, 'db path required'),
  ollama_url: z.string().url().default('http://localhost:11434'),
  embed_model: z.string().default('nomic-embed-text'),
});

export function loadSynapseConfig(configPath = 'config/synapse.toml') {
  let raw: unknown;
  try {
    raw = parseToml(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    const isNotFound = err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (isNotFound) {
      console.error(`[synapse] config/synapse.toml not found. Run 'synapse init' to create it.`);
    } else {
      console.error(`[synapse] Malformed config/synapse.toml: ${(err as Error).message}`);
    }
    process.exit(1);
  }
  const result = SynapseConfigSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map(i => `  - ${i.message}`).join('\n');
    console.error(`[synapse] Configuration error(s):\n${errors}`);
    process.exit(1);
  }
  return result.data;
}
```

**Source:** `/home/kanter/code/project_mcp/src/config.ts` — direct source file read. smol-toml v1.6.0 `parse` + `stringify` exports confirmed via `bun -e` test.

### Pattern 6: Three-Layer Test Harness

**What:** Proven bun test patterns from synapse-server, extended with a behavioral fixture layer.

**Layer 1 — Unit (hooks/config, mocked, no API):**
```typescript
// test/unit/config.test.ts
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('synapse config', () => {
  test('missing synapse.toml exits with error', () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'synapse-config-test-'));
    const result = spawnSync('bun', ['run', 'src/config.ts'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('synapse.toml not found');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('malformed TOML exits with parse error', () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'synapse-config-test-'));
    writeFileSync(path.join(tmpDir, 'config', 'synapse.toml'), 'db = [not valid toml');
    const result = spawnSync('bun', ['run', 'src/config.ts'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Malformed config');
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

**Layer 2 — Integration (real Synapse + temp LanceDB, no API):**
```typescript
// test/integration/startup.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Uses Bun.spawn to run synapse-server and call get_task_tree via MCP JSON-RPC
// Pattern identical to synapse-server/test/smoke.test.ts
```

**Layer 3 — Behavioral (fixture recording, no API after first run):**
```typescript
// test/behavioral/fixture-loader.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

export async function withFixture<T>(
  fixtureName: string,
  liveCall: () => Promise<T>,
): Promise<T> {
  const fixturePath = join(FIXTURES_DIR, `${fixtureName}.json`);
  if (existsSync(fixturePath)) {
    // Replay mode — no API call
    return JSON.parse(readFileSync(fixturePath, 'utf-8')) as T;
  }
  // Record mode — call live API, save response
  const result = await liveCall();
  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(fixturePath, JSON.stringify(result, null, 2));
  return result;
}
```

**Source:** Layers 1+2 adapted from synapse-server test suite patterns (local files). Layer 3 is a new pattern — design is based on standard VCR/cassette concepts, implemented with built-in `node:fs` only (no external library needed).

### Pattern 7: Slash Command Format

**What:** Markdown file with YAML frontmatter for user-facing `/synapse:*` commands.

**Example:**
```markdown
---
name: synapse:new-goal
description: Create a new work stream with a structured goal, producing an epic in the Synapse task tree
allowed-tools:
  - Read
  - Bash
  - mcp__synapse__create_task
  - mcp__synapse__store_decision
  - mcp__synapse__get_smart_context
---

## Objective

Create a new work stream goal and root epic in Synapse.

## Process

1. Ask the user to describe their goal in natural language
2. Call `get_smart_context` to check for related existing decisions or prior work
3. Create a root epic via `create_task` (depth=0) with the user's goal as title
4. Confirm the work stream is created and offer to begin decomposition
```

**Source:** GSD command format confirmed from `.claude/commands/gsd/` directory (local reference). `allowed-tools` field confirmed from Context7 frontmatter documentation.

### Anti-Patterns to Avoid

- **Calling Synapse MCP tools directly from hooks:** Hooks run in a subprocess; MCP servers are not available via tool calls inside hooks. Inject instructions via `additionalContext` instead.
- **Using require() in TypeScript bun test files:** Use ESM imports. Bun test files use `.ts` extension with `import`.
- **Putting settings.json in the framework git repo as a template:** settings.json contains absolute paths (db path). Ship a `settings.template.json` or a setup command that generates it.
- **Storing secrets.toml in the framework repo:** `config/secrets.toml` must be in `.gitignore` from day one.
- **Skipping try/catch in hooks:** Every hook callback MUST have a top-level try/catch that exits 0 on any error. A crashing hook blocks the agent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parsing | Custom TOML parser | `smol-toml` v1.6.0 | Already a dependency; battle-tested; handles spec edge cases |
| Config validation | Manual type checks | Zod + `safeParse` | Collect ALL errors at once, clear messages; established pattern in this codebase |
| Test runner | Custom test harness | `bun test` | Built-in, fast, established in synapse-server |
| JSON fixture format | Custom binary format | Plain JSON via `node:fs` | Human-readable, diffable, no extra library |
| Hook execution framework | Custom hook runner | Claude Code's built-in hook system | Already proven via GSD |

**Key insight:** Everything needed is already present in the codebase or the GSD reference. The only genuinely new code is the 50-line fixture recorder and the TOML config schemas for trust.toml, agents.toml, and secrets.toml.

## Common Pitfalls

### Pitfall 1: SessionStart Hook Cannot Call MCP Tools

**What goes wrong:** Developer writes a SessionStart hook that tries to call Synapse MCP tools (e.g., `get_task_tree`) inside the hook script itself, expecting them to work like they do in the agent context.

**Why it happens:** MCP tools are available to the Claude Code agent via the tool use protocol, not to hook subprocesses. Hook scripts are plain shell processes that run before the agent starts.

**How to avoid:** Use `additionalContext` to inject startup instructions. The agent then calls the MCP tools itself in its first turn. This is the pattern used by GSD's `gsd-statusline.js` (writes to a temp file) and by the `learning-output-style` plugin's session-start hook (injects plain text instructions).

**Warning signs:** Hook script tries to import `@modelcontextprotocol/sdk` or call `mcp__synapse__*` functions.

### Pitfall 2: settings.json Absolute Path Problem

**What goes wrong:** The `mcpServers` entry in settings.json requires absolute paths to the synapse-server executable and db file. Committing these paths breaks the repo for other users.

**Why it happens:** Claude Code settings.json is project-local but contains machine-specific paths.

**How to avoid:** Ship `settings.template.json` in the repo. Add a setup command (`/synapse:setup` or a bun script) that reads `config/synapse.toml`, resolves paths, and writes the actual `settings.json`. Keep `settings.json` in `.gitignore` (or generate it, don't commit it).

**Warning signs:** Other contributors report Synapse not connecting because paths point to the original developer's machine.

### Pitfall 3: Hook Crashes Block Agent

**What goes wrong:** A hook exits with a non-zero exit code due to an unhandled error. PreToolUse hooks that exit with code 2 block the tool call. Even exit code 1 shows an error. Any unhandled exception causes unexpected behavior.

**Why it happens:** Missing try/catch around async operations, JSON parse errors on unexpected input, or filesystem errors.

**How to avoid:** Every hook MUST have a top-level try/catch that `process.exit(0)` on any error. Pattern from GSD's `gsd-context-monitor.js`:
```javascript
} catch (e) {
  // Silent fail -- never block tool execution
  process.exit(0);
}
```

**Warning signs:** Agent reports "hook failed" or tool calls get blocked unexpectedly.

### Pitfall 4: LanceDB Snapshot Connections in Tests

**What goes wrong:** Integration tests write to a LanceDB table via one connection, then try to read from it using the same open connection handle, getting stale data.

**Why it happens:** LanceDB table handles in the JavaScript SDK are snapshot-based. A connection opened before a write does not see the write.

**How to avoid:** Always open a fresh LanceDB connection after writes in tests. This is a documented decision from Phase 11: "LanceDB table handles are snapshot-based: always open fresh connections after writes from different connections."

**Warning signs:** Tests that write then read get empty results or old data.

### Pitfall 5: secrets.toml Not Gitignored Before First Commit

**What goes wrong:** Developer adds secrets.toml to the framework repo with real API keys, commits it, pushes.

**Why it happens:** Gitignore not set up before creating the file.

**How to avoid:** First commit of synapse-framework MUST include `.gitignore` with `config/secrets.toml` and `settings.json`. Create the gitignore in Wave 0 before creating any config files.

**Warning signs:** `git status` shows `config/secrets.toml` as tracked.

### Pitfall 6: Behavioral Fixture Drift

**What goes wrong:** Synapse MCP tool responses change (new fields, schema changes) but fixtures are never updated. Tests pass but test the old behavior.

**Why it happens:** Fixture recording only happens on first run; subsequent runs always replay.

**How to avoid:** Add a `--update-fixtures` flag or a separate `bun run test:record` script that deletes fixtures and re-records. Document the update procedure in the repo README. Include fixture update in the definition of "schema change" tasks.

**Warning signs:** Fixtures are many months old while the Synapse API has changed.

## Code Examples

Verified patterns from local sources and Context7:

### TOML Config Schema (config/synapse.toml)

```toml
# Synapse MCP server connection configuration
# Generated by: synapse setup
# Do not commit settings.json — it contains machine-specific paths.

[server]
db = "/home/user/.synapse/project.db"
ollama_url = "http://localhost:11434"
embed_model = "nomic-embed-text"

[connection]
transport = "stdio"
command = "bun"
args = ["run", "/path/to/synapse-server/src/index.ts"]
```

### TOML Config Schema (config/trust.toml)

```toml
# Trust matrix — per-domain autonomy levels
# Values: "autopilot" | "co-pilot" | "advisory"

[domains]
architecture   = "co-pilot"   # agent proposes, user approves
dependencies   = "co-pilot"
implementation = "autopilot"  # agent decides
testing        = "autopilot"
documentation  = "autopilot"
product_strategy = "advisory" # agent suggests, user decides

[approval]
decomposition = "strategic"   # "always" | "strategic" | "none"
# strategic = approve epics, orchestrator handles features→tasks
```

### Fixture Recorder (test/behavioral/fixture-loader.ts)

```typescript
// Source: custom pattern — no VCR library for bun MCP tests
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

/**
 * Load from fixture if it exists; call live API and record if not.
 * Committed fixtures → deterministic replay. Delete fixture to re-record.
 */
export async function withFixture<T>(
  name: string,
  liveCall: () => Promise<T>,
): Promise<T> {
  const p = join(FIXTURES_DIR, `${name}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) as T;
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const result = await liveCall();
  writeFileSync(p, JSON.stringify(result, null, 2) + '\n');
  return result;
}
```

### Prompt Scorecard Format (test/scorecards/orchestrator.scorecard.toml)

```toml
# Orchestrator prompt scorecard
# Each criterion has a weight and expected behavior description.
# Scores are evaluated by reading the recorded fixture and checking criteria.

[meta]
agent = "synapse-orchestrator"
version = "1.0"
fixture = "behavioral/fixtures/orchestrator-startup-01.json"

[[criteria]]
id = "startup-calls-task-tree"
description = "Agent calls get_task_tree on session start before responding"
weight = 1.0
# Evaluated by: checking fixture for tool_use with name "mcp__synapse__get_task_tree"

[[criteria]]
id = "attribution-present"
description = "All Synapse tool calls include actor/agent_role in input"
weight = 1.0
# Evaluated by: checking all mcp__synapse__* tool_use blocks for actor field

[[criteria]]
id = "status-presented"
description = "Agent presents epic title, feature count, and recent activity before asking"
weight = 0.8
# Evaluated by: checking text_response for epic/feature summary structure
```

### bun test command

```bash
# Run all tests (from synapse-framework root)
bun test

# Run specific layer
bun test test/unit/
bun test test/integration/
bun test test/behavioral/

# Re-record behavioral fixtures (delete and re-run)
rm -rf test/behavioral/fixtures/ && bun test test/behavioral/
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Standalone Agent SDK process | Claude Code framework (files in .claude/) | 2026-03-01 (Phase 12 pivot) | Eliminates process management, auth, billing complexity; uses CC subscription |
| YAML config | TOML config | Phase 12 decision | smol-toml already a dependency; TOML has comments, is more readable than JSON |
| Global settings.json | Per-project settings.json + TOML | Phase 12 design | Per-project allows different db paths and configs per project |

**Note:** The Agent SDK pivot is complete — synapse-framework is NOT a standalone process. It is a collection of files that Claude Code loads. This is the current approach.

## Open Questions

1. **How does the startup hook know which project's Synapse to call?**
   - What we know: The `additionalContext` approach injects instructions; the agent calls Synapse MCP tools using its existing MCP config.
   - What's unclear: If a user has multiple projects with Synapse, the hook needs to be project-aware. The hook runs in the project's `.claude/` context.
   - Recommendation: The MCP server is configured per-project in settings.json. The hook injected context just says "call get_task_tree" — the agent uses whatever Synapse MCP server is configured for this project. No project discrimination needed in the hook.

2. **Do behavioral tests require a running Synapse server, or just fixture replay?**
   - What we know: After first recording, fixtures are replayed with no API. First recording requires a real Synapse + Claude API call.
   - What's unclear: CI environment — can it record fixtures on first run without Claude API access?
   - Recommendation: Commit pre-recorded fixtures to git. CI always runs in replay mode. Developer records fixtures locally by deleting them. Flag this in the plan as a deliberate design choice.

3. **Should config/synapse.toml be a per-project file or a framework file?**
   - What we know: Each project using synapse-framework will have different db paths and Ollama URLs.
   - What's unclear: Whether to ship a template in the framework repo or generate it on `synapse setup`.
   - Recommendation: Ship `config/synapse.toml.template` in the framework repo. The setup command copies it to `config/synapse.toml` (gitignored). This matches the pattern used by the synapse-server's `--db` flag.

## Sources

### Primary (HIGH confidence)

- `/home/kanter/code/project_mcp/.claude/agents/` — live GSD agent file format reference (read directly)
- `/home/kanter/code/project_mcp/.claude/hooks/gsd-context-monitor.js` — PostToolUse hook with `hookSpecificOutput.additionalContext` format (read directly)
- `/home/kanter/.claude/plugins/marketplaces/claude-plugins-official/plugins/learning-output-style/hooks-handlers/session-start.sh` — SessionStart hook with `additionalContext` format (read directly)
- `/home/kanter/code/project_mcp/src/config.ts` — TOML parsing + Zod validation pattern (read directly)
- `/home/kanter/code/project_mcp/test/tools/create-task.test.ts` — integration test with temp LanceDB + mocked fetch (read directly)
- Context7 `/anthropics/claude-code` — Agent definition format, hook formats, mcpServers config, allowed-tools frontmatter (HIGH reputation, 780 snippets)
- Context7 `/affaan-m/everything-claude-code` — Hook JS implementation pattern, event types (HIGH reputation)

### Secondary (MEDIUM confidence)

- smol-toml v1.6.0 — `parse` and `stringify` exports verified via `bun -e` test against installed package
- bun 1.3.9 — confirmed installed, `bun test` is the test runner

### Tertiary (LOW confidence)

- Behavioral fixture recording pattern — standard VCR/cassette concept; no bun-specific library found; hand-rolled pattern is necessary and sufficient

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already installed and in use
- Architecture: HIGH — GSD is the reference implementation on this machine, confirmed working
- Hook format: HIGH — verified from live plugin examples in local filesystem
- Pitfalls: HIGH — Phase 11 decisions and GSD production experience
- Behavioral fixtures: MEDIUM — pattern is clear but no existing bun VCR library to point to

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Claude Code stable; bun stable; TOML/Zod stable)
