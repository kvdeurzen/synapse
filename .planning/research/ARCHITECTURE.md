# Architecture Research

**Domain:** Claude Code native framework integration — wiring existing Synapse components into an end-to-end usable product (v3.0 Working Prototype)
**Researched:** 2026-03-03
**Confidence:** HIGH for Claude Code integration mechanics (verified against existing .claude/ directory in this repo, settings.template.json, and agent frontmatter conventions); MEDIUM for install script patterns (derived from existing structure and Claude Code conventions); HIGH for dynamic skill injection (extends existing skills.ts infrastructure)

---

## Context: What v2.0 Built vs What v3.0 Wires Together

The v2.0 architecture research (earlier in this file) described an Agent SDK orchestrator pattern (`orchestrator/` package with TypeScript classes wrapping `query()`). What was **actually built** for v2.0 is different — and simpler:

**Actual v2.0 architecture (Claude Code native):**
- `packages/framework/agents/` — 11 markdown files with YAML frontmatter (`name`, `description`, `tools`, `skills`, `model`, `color`)
- `packages/framework/hooks/` — 6 JavaScript scripts invoked via `node hooks/X.js` from Claude Code's `settings.json` hooks config
- `packages/framework/config/` — 3 TOML files (synapse.toml, trust.toml, agents.toml) + secrets template
- `packages/framework/skills/` — 7 skill directories, each with a `SKILL.md` file
- `packages/framework/workflows/pev-workflow.md` — the PEV workflow document read by the orchestrator agent
- `packages/framework/settings.template.json` — a Claude Code `settings.json` template defining MCP server + hooks

**What v3.0 must add** is the wiring layer: the install script that copies framework files into a user's `.claude/` directory, the user-facing slash commands, project_id injection, dynamic skill selection, and end-to-end E2E validation.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  User's Project Repository                                           │
│                                                                      │
│  .claude/                   (wired by install script)               │
│  ├── settings.json          ← MCP server config + hook registrations│
│  ├── agents/                ← copies of framework agent .md files   │
│  │   ├── synapse-orchestrator.md                                     │
│  │   ├── executor.md                                                 │
│  │   └── ... (10 agents)                                             │
│  ├── commands/synapse/      ← user-facing slash commands             │
│  │   ├── init.md            ← /synapse:init                          │
│  │   ├── map.md             ← /synapse:map                           │
│  │   └── plan.md            ← /synapse:plan                          │
│  └── hooks/                 ← copies of framework hook .js files    │
│      ├── synapse-startup.js                                          │
│      ├── tier-gate.js                                                │
│      ├── tool-allowlist.js                                           │
│      ├── precedent-gate.js                                           │
│      ├── audit-log.js                                                │
│      └── synapse-audit.js                                            │
│                                                                      │
│  .synapse/                  (created by /synapse:init)              │
│  ├── config/                ← user-specific config (git-ignored)     │
│  │   ├── synapse.toml       ← db path, ollama url (filled in)        │
│  │   ├── trust.toml         ← autonomy levels (copied from defaults) │
│  │   ├── agents.toml        ← agent config (populated dynamically)   │
│  │   └── project.toml       ← NEW: project_id + active skills        │
│  └── skills/                ← project-specific skill overrides       │
│      └── project/SKILL.md   ← optional project-specific skill        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                        MCP stdio subprocess
                                   │
┌─────────────────────────────────▼───────────────────────────────────┐
│  Synapse MCP Server (packages/server/)                               │
│  Launched via: bun run packages/server/src/index.ts --db <path>      │
│                                                                      │
│  21 tools (18 existing + store_decision + query_decisions +          │
│             check_precedent + create_task + update_task +            │
│             get_task_tree)                                           │
│                                                                      │
│  All tools accept project_id (injected by startup hook)             │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌─────────────────────────────────▼───────────────────────────────────┐
│  LanceDB (embedded)                                                  │
│  Path: configured in synapse.toml or SYNAPSE_DB_PATH env var        │
│  6 tables: documents, doc_chunks, code_chunks, relationships,        │
│            project_meta, activity_log, + decisions, + tasks          │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Install script (`packages/framework/install.sh` or `install.ts`) | Copies framework files into user's `.claude/`, generates settings.json, creates `.synapse/config/` skeleton | User's filesystem; reads framework files; writes to `.claude/` and `.synapse/` |
| `/synapse:init` command | First-run setup: gather db path, run init_project, index codebase, prompt for project name | MCP tools: `init_project`, `index_codebase`; writes `.synapse/config/project.toml` |
| `/synapse:map` command | Index/re-index the codebase | MCP tool: `index_codebase`, `get_index_status` |
| `/synapse:plan` command | Trigger PEV workflow for a goal | Delegates to `synapse-orchestrator` agent |
| `synapse-startup.js` hook | SessionStart: inject project_id context + status overview | Reads `.synapse/config/project.toml`; injects via `additionalContext` |
| `tool-allowlist.js` hook | PreToolUse: gate Synapse MCP tools to per-agent allowlists | Reads `agents.toml`; denies on violation |
| `tier-gate.js` hook | PreToolUse: enforce tier authority on `store_decision` | Reads `trust.toml`; denies unauthorized tiers |
| `precedent-gate.js` hook | PreToolUse: inject precedent check reminder before `store_decision` | Advisory only; injects `additionalContext` |
| `audit-log.js` hook | PostToolUse: log all tool calls | Writes to stderr or audit file |
| Agent `.md` files | System prompts for specialized agents; read by Claude Code at spawn | Injected by Claude Code when agent is invoked |
| `skills.ts` (framework src) | Load SKILL.md files; estimate tokens; warn on unreferenced skills | Called programmatically or read directly by agents |
| `project.toml` | NEW: canonical project_id + skill assignments for active project | Read by `synapse-startup.js` for session injection |

---

## Recommended Project Structure

### Framework Package (packages/framework/) — Existing + New

```
packages/framework/
├── agents/
│   ├── synapse-orchestrator.md      # existing — wired into .claude/agents/
│   ├── executor.md                   # existing
│   ├── decomposer.md                 # existing
│   ├── validator.md                  # existing
│   └── ... (8 more agent .md files)  # existing
│
├── commands/                         # NEW DIRECTORY
│   └── synapse/
│       ├── init.md                   # NEW: /synapse:init command
│       ├── map.md                    # NEW: /synapse:map command
│       └── plan.md                   # NEW: /synapse:plan command
│
├── hooks/
│   ├── synapse-startup.js            # MODIFY: add project_id injection
│   ├── tier-gate.js                  # existing
│   ├── tool-allowlist.js             # existing
│   ├── precedent-gate.js             # existing
│   ├── audit-log.js                  # existing
│   └── synapse-audit.js              # existing
│
├── config/
│   ├── agents.toml                   # MODIFY: add dynamic skills support
│   ├── synapse.toml                  # existing
│   ├── trust.toml                    # existing
│   └── secrets.toml.template         # existing
│
├── skills/
│   ├── typescript/SKILL.md           # existing
│   ├── react/SKILL.md                # existing (stub — flesh out)
│   ├── python/SKILL.md               # existing (stub — flesh out)
│   ├── vitest/SKILL.md               # existing (stub — flesh out)
│   ├── sql/SKILL.md                  # existing (stub — flesh out)
│   ├── bun/SKILL.md                  # existing (stub — flesh out)
│   ├── tailwind/SKILL.md             # existing (stub — flesh out)
│   └── project/
│       └── SKILL.md                  # NEW: template for project-specific skills
│
├── workflows/
│   └── pev-workflow.md               # existing
│
├── settings.template.json            # MODIFY: update paths for installed layout
│
├── src/
│   ├── config.ts                     # existing — TOML loaders
│   └── skills.ts                     # existing — skill file loader
│
├── install.sh                        # NEW: install script (or install.ts)
└── package.json                      # existing
```

### User Project After Install

```
<user-project>/
├── .claude/
│   ├── settings.json                 # Generated by install script
│   ├── agents/
│   │   └── <all 11 agent .md files>  # Copied by install script
│   ├── commands/
│   │   └── synapse/
│   │       ├── init.md               # Copied by install script
│   │       ├── map.md                # Copied by install script
│   │       └── plan.md               # Copied by install script
│   └── hooks/
│       └── <all 6 hook .js files>    # Copied by install script
│
└── .synapse/
    ├── config/
    │   ├── synapse.toml              # Generated by install; filled by /synapse:init
    │   ├── trust.toml                # Copied default; user-editable
    │   ├── agents.toml               # Generated; updated by /synapse:init
    │   └── project.toml              # NEW: created by /synapse:init
    └── skills/
        └── project/SKILL.md          # Optional; user-created
```

### Structure Rationale

- **`.claude/` contains copies, not symlinks:** Claude Code reads `.claude/` from the project directory. Symlinks would break when the framework is installed as a package dependency. Copies are reliable; re-run install to update.
- **`.synapse/` is separate from `.claude/`:** `.claude/` is Claude Code plumbing (controlled by the framework). `.synapse/` is Synapse-specific config and data (controlled by the user). The separation is intentional: users edit `.synapse/config/trust.toml` to adjust autonomy; they don't touch `.claude/`.
- **`commands/synapse/` as a subdirectory:** Claude Code slash commands are loaded from `.claude/commands/`. The `synapse/` subdirectory creates the `/synapse:` namespace, preventing collisions with other slash commands (GSD, custom user commands).
- **`project.toml` as the project_id source of truth:** Rather than requiring users to pass `project_id` on every tool call, a single config file captures it. The `synapse-startup.js` hook reads it and injects it into every session via `additionalContext`. Agents learn the project_id at session start and include it on all MCP calls.
- **Hooks as copied `.js` files (not Bun TypeScript):** Claude Code hooks run via the command string in `settings.json`. The existing hooks are plain `node` scripts. This remains correct for v3.0 — no compilation step required, `node` is universally available, and `bun` is not guaranteed to be in the user's PATH unless configured.

---

## Architectural Patterns

### Pattern 1: Install Script — Copy-Based Framework Wiring

**What:** A shell script (or Bun TypeScript script) that copies the framework's agents, hooks, and commands into the user's `.claude/` directory, then generates a `settings.json` and creates the `.synapse/config/` skeleton.

**When to use:** One-time setup per project. Re-run to update when the framework is updated.

**Trade-offs:** Copies diverge from the source if the framework is updated. A re-run is required to pull updates. This is acceptable — users know they need to update.

**What install does:**
1. Detect project root (look for `package.json`, `Cargo.toml`, `pyproject.toml`, or `.git`)
2. Create `.claude/agents/`, `.claude/commands/synapse/`, `.claude/hooks/`
3. Copy all files from `packages/framework/agents/` → `.claude/agents/`
4. Copy all files from `packages/framework/commands/synapse/` → `.claude/commands/synapse/`
5. Copy all files from `packages/framework/hooks/` → `.claude/hooks/`
6. Generate `.claude/settings.json` from `settings.template.json` — substitute absolute path to Synapse server
7. Create `.synapse/config/` directory
8. Copy `packages/framework/config/trust.toml` → `.synapse/config/trust.toml`
9. Copy `packages/framework/config/agents.toml` → `.synapse/config/agents.toml`
10. Create `.synapse/config/synapse.toml` with placeholder db path (user completes with `/synapse:init`)
11. Print "Run `/synapse:init` in Claude Code to complete setup"

**Key constraint:** Hooks in `settings.json` reference paths relative to the project root. The generated `settings.json` must use paths like `.claude/hooks/synapse-startup.js`, not absolute paths, to remain portable if the project moves.

```json
// Generated .claude/settings.json (from settings.template.json)
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/synapse/packages/server/src/index.ts"
      ],
      "env": {
        "OLLAMA_URL": "http://localhost:11434",
        "EMBED_MODEL": "nomic-embed-text",
        "SYNAPSE_DB_PATH": ""
      }
    }
  },
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node .claude/hooks/synapse-startup.js" }] }
    ],
    "PreToolUse": [
      { "matcher": "mcp__synapse__store_decision", "hooks": [
        { "type": "command", "command": "node .claude/hooks/tier-gate.js" },
        { "type": "command", "command": "node .claude/hooks/precedent-gate.js" }
      ]},
      { "matcher": "mcp__synapse__.*", "hooks": [
        { "type": "command", "command": "node .claude/hooks/tool-allowlist.js" }
      ]}
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "node .claude/hooks/audit-log.js" }] }
    ]
  }
}
```

---

### Pattern 2: project_id Injection via SessionStart Hook

**What:** The `synapse-startup.js` hook reads `.synapse/config/project.toml` at session start and injects the `project_id` into `additionalContext`. Every agent starts each session knowing the project_id without the user specifying it.

**When to use:** Every session. This is the core mechanism for making project_id seamless.

**Why this approach:** MCP tool calls require `project_id` on every call. Without injection, agents must either discover it (a tool call that costs time and tokens) or the user must specify it manually. The SessionStart hook's `additionalContext` is injected before the first agent turn, making project_id available immediately.

**Trade-offs:** If `project.toml` does not exist (project not initialized), the hook must degrade gracefully — it cannot block session start. It should inject an instruction telling the agent to run `/synapse:init` before using Synapse tools.

```javascript
// packages/framework/hooks/synapse-startup.js — key modification for v3.0

// Read project.toml for project_id
let projectId = null;
let activeSkills = [];
try {
  const projectToml = fs.readFileSync('.synapse/config/project.toml', 'utf8');
  const config = parseToml(projectToml);
  projectId = config.project?.id || null;
  activeSkills = config.project?.skills || [];
} catch {
  // project.toml missing — first-run state
}

let projectContext = '';
if (projectId) {
  projectContext = [
    '',
    '## Active Project',
    '',
    `project_id: "${projectId}"`,
    '',
    'Include this project_id on ALL Synapse MCP tool calls.',
    `Active skills: [${activeSkills.join(', ')}]`,
  ].join('\n');
} else {
  projectContext = [
    '',
    '## Synapse Not Initialized',
    '',
    'No project found. Run `/synapse:init` to initialize this project before using Synapse tools.',
  ].join('\n');
}
```

**project.toml format (new file):**

```toml
# .synapse/config/project.toml
# Created by /synapse:init — do not edit manually

[project]
id = "my-project-abc123"
name = "My Project"
skills = ["typescript", "bun", "vitest"]
created_at = "2026-03-03T00:00:00Z"
```

---

### Pattern 3: Slash Commands as Agent Dispatch Files

**What:** Claude Code slash commands are `.md` files in `.claude/commands/<namespace>/`. When invoked, Claude Code reads the file and executes it as instructions. Commands can spawn agents, call MCP tools, or provide structured prompts.

**When to use:** User-facing entry points into Synapse functionality. Three commands cover the core user journey: init → map → plan.

**Trade-offs:** Commands are markdown instructions, not code. They are executed by Claude, not by a script runtime. This means they are flexible but also dependent on Claude's interpretation. Keep commands procedural and explicit — list steps, not goals.

**`/synapse:init` — first-run setup:**

```markdown
# /synapse:init

Initialize this project with Synapse.

## Steps

1. Check if `.synapse/config/project.toml` exists. If it does, ask the user whether to reinitialize.

2. Ask the user:
   - "What is this project called?" (project name)
   - "Where should Synapse store its database?" (default: `.synapse/synapse.db`)

3. Call `mcp__synapse__init_project` with:
   - `name`: the user-provided project name
   - A generated `project_id` (use a short slug from the name + timestamp)

4. Write `.synapse/config/project.toml` with the project_id, name, and detected skills.

5. Detect project skills automatically:
   - Look for `package.json` → add "typescript", "bun" if bun.lockb exists
   - Look for `bun.lockb` → add "bun"
   - Look for `vitest.config.*` → add "vitest"
   - Look for `tailwind.config.*` → add "tailwind"
   - Look for `pyproject.toml` or `requirements.txt` → add "python"

6. Update `.synapse/config/synapse.toml` with the db path.

7. Update `.claude/settings.json` to set `SYNAPSE_DB_PATH` env var to the db path.

8. Confirm: "Project '[name]' initialized. Skills detected: [list]. Run `/synapse:map` to index your codebase."
```

**`/synapse:map` — codebase indexing:**

```markdown
# /synapse:map

Index or re-index this project's codebase in Synapse.

## Steps

1. Read project_id from `.synapse/config/project.toml`.

2. Call `mcp__synapse__index_codebase` with:
   - `project_id`: from project.toml
   - `root_path`: current working directory (or user-specified path)

3. Call `mcp__synapse__get_index_status` to confirm index completion.

4. Report: files indexed, languages detected, time taken.
```

**`/synapse:plan` — trigger PEV workflow:**

```markdown
# /synapse:plan

Plan and execute a goal using the Synapse PEV workflow.

## Steps

1. Read project_id from `.synapse/config/project.toml`.
2. Spawn the `synapse-orchestrator` agent with:
   - The user's goal (passed as argument or ask if missing)
   - project_id injected as context
3. The orchestrator handles the full PEV workflow per `@packages/framework/workflows/pev-workflow.md`.
```

---

### Pattern 4: Dynamic Skill Injection via agents.toml

**What:** Instead of hardcoding skill lists in `agents.toml` per agent, skills are determined at session start by reading `project.toml` and dynamically constructing each agent's skill context. The `synapse-startup.js` hook already injects the active skill list. Agents read this injected context and include the relevant skills in their system prompt priming.

**When to use:** When a user sets up a project with different technologies than the defaults. A Python project should not load TypeScript skills into the Executor.

**Current state:** `agents.toml` has hardcoded skill lists (`skills = ["typescript", "bun"]` for executor). This works for the default stack but doesn't adapt to the project.

**Target state:** A `project.toml` field `skills = [...]` drives which skills are loaded. The orchestrator agent reads these from the injected session context and mentions them in prompts to spawned subagents.

**Implementation approach (v3.0):**
- Keep `agents.toml` skill assignments as *defaults* (what to use when project.toml doesn't specify)
- `synapse-startup.js` hook reads `project.toml` skills and injects them as additional context
- Agent prompts (especially orchestrator) learn from the session context which skills apply and reference them when spawning subagents
- Full dynamic programmatic injection (loading skill content into agent system prompts at spawn time) is a later refinement — for v3.0, injecting skill names + project context via SessionStart is the pragmatic path

**agents.toml change:**

```toml
# Before (hardcoded)
[agents.executor]
skills = ["typescript", "bun"]

# After (default skills — overridden by project.toml at runtime)
[agents.executor]
skills = ["typescript", "bun"]  # default; project.toml overrides these at runtime
```

---

### Pattern 5: Progress Visibility via Status Line + Wave Checkpoints

**What:** Two mechanisms provide progress visibility within Claude Code:

1. **Status line** (`statusLine` in `settings.json`): A command that Claude Code calls to display a persistent status line. Can show active epic + task progress.
2. **Wave checkpoint blocks**: The `synapse-orchestrator` agent emits structured status blocks after each wave (already in the orchestrator agent prompt). These appear in the Claude Code conversation and are the primary progress signal.

**When to use:** Always active once project is initialized.

**Status line implementation:**

```javascript
// packages/framework/hooks/synapse-statusline.js (NEW)
// Called by Claude Code to populate the status bar

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

try {
  // Read project.toml to get project_id
  const projectToml = fs.readFileSync('.synapse/config/project.toml', 'utf8');
  // Parse minimally (avoid smol-toml dependency in status line)
  const match = projectToml.match(/id\s*=\s*"([^"]+)"/);
  const projectId = match?.[1];

  if (!projectId) {
    process.stdout.write('Synapse: not initialized');
    process.exit(0);
  }

  // Output static project name — dynamic task query is too slow for status line
  const nameMatch = projectToml.match(/name\s*=\s*"([^"]+)"/);
  const projectName = nameMatch?.[1] || projectId;
  process.stdout.write(`Synapse: ${projectName}`);
} catch {
  process.stdout.write('Synapse: not initialized');
}
```

**settings.json addition:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/synapse-statusline.js"
  }
}
```

**Wave checkpoint blocks** (existing in orchestrator agent prompt — no change needed):

```
## Wave {N} Complete — Feature: {feature_title} ({done}/{total} tasks)

| Task | Status | Agent | Notes |
|------|--------|-------|-------|
| {task_title} | done | executor | {brief summary} |

Integration check: PASSED/FAILED
Next: {next_feature_or_epic_integration} ({task_count} tasks ready)
```

---

### Pattern 6: Hook Path Resolution — Relative vs Absolute

**What:** Hooks in `settings.json` use command strings like `node .claude/hooks/tier-gate.js`. These paths are resolved relative to the project root (where `settings.json` lives). The hooks themselves use `process.cwd()` to find config files.

**Current issue:** Existing hooks use `path.join(process.cwd(), 'packages/framework/config/trust.toml')` — paths that only work when running from the Synapse monorepo root. After install to a user project, the hooks need to find config at `.synapse/config/trust.toml`.

**Fix pattern:** Update hooks to search multiple config locations:

```javascript
// Updated path resolution in tier-gate.js and tool-allowlist.js
const cwd = process.cwd();
const possibleConfigDirs = [
  path.join(cwd, '.synapse', 'config'),          // installed in user project
  path.join(cwd, 'packages', 'framework', 'config'), // monorepo dev
  path.join(cwd, 'config'),                       // flat layout
];

let trustTomlPath = null;
for (const dir of possibleConfigDirs) {
  const candidate = path.join(dir, 'trust.toml');
  if (fs.existsSync(candidate)) {
    trustTomlPath = candidate;
    break;
  }
}

if (!trustTomlPath) {
  // fail-closed: can't find config
  process.stdout.write(denyOutput('DENIED: trust.toml not found in any config location.'));
  process.exit(0);
}
```

---

## Data Flow

### User Journey: Install to First Workflow

```
Developer runs: npx synapse-install (or: bun run install.ts)
    │
    ▼
install.sh/ts:
  - Copy agents/ → .claude/agents/
  - Copy hooks/ → .claude/hooks/
  - Copy commands/synapse/ → .claude/commands/synapse/
  - Generate .claude/settings.json (with absolute path to Synapse server)
  - Create .synapse/config/ skeleton
    │
    ▼
User opens project in Claude Code
    │
    ▼
SessionStart hook fires: synapse-startup.js
  - Reads .synapse/config/project.toml → NOT FOUND
  - Injects: "Run /synapse:init to initialize"
    │
    ▼
User runs: /synapse:init
  - Claude (in main session) reads init.md command
  - Calls mcp__synapse__init_project (db created, tables initialized)
  - Detects skills from project files
  - Writes .synapse/config/project.toml
  - Reports: "Initialized. Run /synapse:map to index codebase."
    │
    ▼
User runs: /synapse:map
  - Claude reads map.md command
  - Calls mcp__synapse__index_codebase
  - Reports: "Indexed N files across M languages."
    │
    ▼
User says: "I want to add a JWT authentication module"
  or
User runs: /synapse:plan "Add JWT authentication module"
    │
    ▼
SessionStart hook re-fires (if new session):
  - Reads .synapse/config/project.toml → project_id found
  - Injects: project_id + active skills + "check for open work streams" instruction
    │
    ▼
synapse-orchestrator agent activates:
  - Reads injected session context (project_id, skills)
  - Calls mcp__synapse__get_task_tree (check for open epics)
  - Calls mcp__synapse__check_precedent (any prior auth decisions?)
  - Creates epic via mcp__synapse__create_task
  - Spawns decomposer subagent → feature breakdown
  - Presents feature list for user approval (if trust.toml pev.approval_threshold = "epic")
    │
    ▼
User approves feature list
    │
    ▼
Orchestrator spawns executor subagents (wave-based):
  - Wave 1: independent tasks execute in parallel
  - After each wave: validator subagent checks output
  - Status blocks emitted after each wave
    │
    ▼
Epic complete:
  - Integration checker validates cross-feature integration
  - Orchestrator emits final status summary
  - Stores completion decision via mcp__synapse__store_decision
```

### Hook Execution Flow (per Synapse MCP tool call)

```
Agent calls mcp__synapse__store_decision(project_id="...", tier=1, actor="architect", ...)
    │
    ▼
PreToolUse hooks fire (matchers apply):
  1. tier-gate.js (matcher: mcp__synapse__store_decision)
     - Reads .synapse/config/trust.toml
     - Checks tier_authority["architect"] contains 1 → ALLOW (exits silently)
  2. precedent-gate.js (matcher: mcp__synapse__store_decision)
     - Injects additionalContext: "check precedent before storing" → ALLOW with context
  3. tool-allowlist.js (matcher: mcp__synapse__.*)
     - Reads .synapse/config/agents.toml
     - Checks agents["architect"].allowed_tools includes "mcp__synapse__store_decision" → ALLOW
    │
    ▼
MCP tool call executes: Synapse stores decision
    │
    ▼
PostToolUse hooks fire:
  1. audit-log.js (no matcher — all tools)
     - Logs tool name, timestamp, session_id to stderr
```

### Skill Injection Data Flow

```
/synapse:init detects skills:
  package.json + bun.lockb → ["typescript", "bun"]
  vitest.config.ts found → adds "vitest"
    │
    ▼
Writes .synapse/config/project.toml:
  skills = ["typescript", "bun", "vitest"]
    │
    ▼
Session starts → synapse-startup.js:
  Reads project.toml → skills = ["typescript", "bun", "vitest"]
  Injects into additionalContext:
    "Active skills: [typescript, bun, vitest]
     When spawning executor: include typescript, bun skills
     When spawning validator: include vitest skill"
    │
    ▼
Orchestrator agent reads injected context:
  Knows which skills apply to this project
  When constructing prompts for subagent spawning:
    "Use typescript patterns, bun runtime, vitest for tests"
    │
    ▼
[Future v3.x: orchestrator loads SKILL.md content and injects into subagent prompts]
```

---

## Integration Points

### New vs Modified Components

| Component | Status | Location | Change |
|-----------|--------|----------|--------|
| `install.sh` or `install.ts` | NEW | `packages/framework/` | Copies framework files into user's `.claude/`; generates `settings.json` |
| `/synapse:init` command | NEW | `packages/framework/commands/synapse/init.md` | First-run setup; creates `project.toml`; calls `init_project` |
| `/synapse:map` command | NEW | `packages/framework/commands/synapse/map.md` | Triggers `index_codebase` with project_id |
| `/synapse:plan` command | NEW | `packages/framework/commands/synapse/plan.md` | Entry point to PEV workflow |
| `synapse-startup.js` hook | MODIFY | `packages/framework/hooks/` | Add `project.toml` read; inject `project_id` + skill list; graceful degradation if not initialized |
| `synapse-statusline.js` hook | NEW | `packages/framework/hooks/` | Return project name for Claude Code status bar |
| `tier-gate.js` hook | MODIFY | `packages/framework/hooks/` | Update config path resolution to find `.synapse/config/trust.toml` |
| `tool-allowlist.js` hook | MODIFY | `packages/framework/hooks/` | Update config path resolution to find `.synapse/config/agents.toml` |
| `precedent-gate.js` hook | MODIFY | `packages/framework/hooks/` | Update config path resolution |
| `settings.template.json` | MODIFY | `packages/framework/` | Add `statusLine` entry; update hook paths for installed layout |
| `project.toml` | NEW | `.synapse/config/` (per user project) | Created by `/synapse:init`; holds `project_id`, `name`, `skills` |
| Agent `.md` files | MODIFY | `packages/framework/agents/` | Add MCP usage instructions; add `project_id` usage guidance; update skill injection instructions |
| `agents.toml` | MODIFY | `packages/framework/config/` | Document that skill assignments are defaults; project.toml overrides at runtime |
| `synapse.toml` | UNMODIFIED | `packages/framework/config/` | Template still correct; install fills in paths |
| `trust.toml` | UNMODIFIED | `packages/framework/config/` | Default remains correct; user edits `.synapse/config/trust.toml` |
| `pev-workflow.md` | MODIFY | `packages/framework/workflows/` | Add explicit `project_id` usage throughout; reference `/synapse:init` for initialization |
| Server tools (existing) | UNMODIFIED | `packages/server/src/tools/` | All 21 tools already accept `project_id` |
| `src/config.ts` (framework) | UNMODIFIED | `packages/framework/src/` | TOML loaders already correct |
| `src/skills.ts` (framework) | MINOR MODIFY | `packages/framework/src/` | Update default `skillsDir` to check `.synapse/skills/` as well |

### External Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Claude Code → hooks | `node .claude/hooks/*.js` command exec via `settings.json` | Hooks communicate via stdin (hook input JSON) and stdout (hook output JSON) |
| Claude Code → agents | `.claude/agents/*.md` files read at agent spawn | YAML frontmatter defines name/tools/model; body is system prompt |
| Claude Code → commands | `.claude/commands/synapse/*.md` files read on slash command invocation | Command file is executed as Claude instructions |
| Claude Code → MCP server | stdio subprocess per session via `mcpServers` in `settings.json` | Agent SDK pattern; server spawned fresh each session |
| Hooks → config files | `fs.readFileSync` with path search | Hooks must search `.synapse/config/` and `packages/framework/config/` |
| `/synapse:init` → MCP server | MCP tool calls in Claude Code session | `init_project`, `index_codebase` called by Claude in the main session |
| install script → user filesystem | File copy + template generation | Must be runnable without dependencies (pure shell or single-file Bun script) |

---

## Suggested Build Order

Dependencies drive ordering. Each deliverable is independently testable.

| Order | Deliverable | Depends On | What You Can Test |
|-------|-------------|------------|-------------------|
| 1 | `project.toml` schema + format documented | Nothing | Can define format without code |
| 2 | `synapse-startup.js` — add project_id injection | `project.toml` format | Run hook with a sample project.toml; verify `additionalContext` contains project_id |
| 3 | Hook config path resolution update (tier-gate, tool-allowlist) | Nothing | Run hooks from a non-monorepo directory; verify they find `.synapse/config/trust.toml` |
| 4 | `project.toml` creation in `/synapse:init` command | project_id injection | Init command runs, creates file, hook reads it correctly |
| 5 | `/synapse:init` command file (full) | `project.toml` format; MCP tools exist | Run `/synapse:init` in Claude Code; verify project_id in DB, project.toml written, skills detected |
| 6 | `/synapse:map` command file | `init_project` must have run | Run `/synapse:map`; verify `index_codebase` called with correct project_id |
| 7 | Install script (copy mechanism) | Files exist in `packages/framework/` | Run install; verify `.claude/agents/`, `.claude/hooks/`, `.claude/commands/` populated |
| 8 | `settings.json` generation in install script | Framework hook paths correct | Generated settings.json has correct hook commands; hooks resolve to copied files |
| 9 | `/synapse:plan` command file | Orchestrator agent + PEV workflow | Run `/synapse:plan "goal"`; verify orchestrator picks it up |
| 10 | Agent prompt improvements (MCP usage, project_id, language-agnostic) | Existing agent files | Agent files are self-contained markdown — review + edit each |
| 11 | `synapse-statusline.js` hook | `project.toml` format | Install hook, see project name in Claude Code status bar |
| 12 | E2E PEV workflow test on a real project | Full stack wired | Run `/synapse:plan` on a real task; observe full Plan → Execute → Validate cycle |
| 13 | Dynamic skill injection via project.toml | project.toml written by init | Change skills in project.toml; verify next session context reflects changes |
| 14 | Tech debt resolution (escapeSQL dedup, created_at, lint) | Nothing blocking | Fix independently; run `bun test` after each |

**Phase groupings:**
- **Phase A (project_id wiring):** Steps 1-4 — the foundation for everything else
- **Phase B (user journey commands):** Steps 5-6 — init and map commands working
- **Phase C (install script):** Steps 7-8 — can be parallelized with Phase B
- **Phase D (plan command + agent polish):** Steps 9-10 — depends on Phase B complete
- **Phase E (progress visibility):** Step 11 — independent, low risk
- **Phase F (E2E validation + dynamic skills):** Steps 12-14 — needs Phases A-D complete

---

## Anti-Patterns

### Anti-Pattern 1: Absolute Paths in Copied Hook Files

**What people do:** Write hook files that use `__dirname` or absolute paths to find config files. These work in the monorepo but break when hooks are copied to a user's project.

**Why it's wrong:** `__dirname` in a copied file still resolves to `.claude/hooks/` — but the config files are in `.synapse/config/`, not relative to the hooks directory. Absolute paths are machine-specific.

**Do this instead:** Use `process.cwd()` (which is the project root when Claude Code invokes hooks) as the anchor. Search a prioritized list of config locations: `.synapse/config/`, then `packages/framework/config/` for monorepo dev fallback.

---

### Anti-Pattern 2: Storing project_id in Claude Code Session State

**What people do:** Rely on agents to "remember" the project_id across turns within a conversation. Have the user tell the orchestrator the project_id once and assume it propagates.

**Why it's wrong:** Agent context windows compact. New subagents spawned mid-workflow start with no project_id knowledge. The hook's SessionStart injection is the only reliable delivery mechanism because it fires for every new session and subagent spawn.

**Do this instead:** Always read project_id from `project.toml` in the SessionStart hook and inject it as `additionalContext`. Every agent receives it fresh at the start of every session.

---

### Anti-Pattern 3: Bun-Specific Hook Scripts

**What people do:** Write hooks as Bun TypeScript (`.ts` files) and invoke them with `bun run .claude/hooks/tier-gate.ts`. This is natural for the monorepo but breaks on user machines where Bun may not be in the PATH expected by Claude Code.

**Why it's wrong:** `node` is universally available; `bun` in PATH is user-specific. Claude Code invokes hooks via the command string in `settings.json` — if `bun` is not resolved, the hook silently fails (or worse, crashes with a deny for fail-closed hooks).

**Do this instead:** Keep hooks as CommonJS `.js` files invoked with `node`. The existing hooks already follow this pattern. Avoid `import` / `export` syntax (use `require`). The only dependency (`smol-toml`) must be available to `node`, not just `bun` — either bundle it or limit hook dependencies to `node:fs`, `node:path`, and `node:child_process`.

---

### Anti-Pattern 4: Commands That Spawn Subagents Directly

**What people do:** Write slash command `.md` files that use `Task` tool calls to spawn subagents. This seems elegant but bypasses the orchestrator agent.

**Why it's wrong:** Slash commands in Claude Code are executed in the main session context. The `Task` tool is not available in main session — only to agents. More importantly, routing through the orchestrator ensures hooks fire (tier-gate, tool-allowlist) before subagents make Synapse calls.

**Do this instead:** Commands that need subagent work should spawn the `synapse-orchestrator` agent (via `@synapse-orchestrator` mention or `Task` call with agent name). The orchestrator then manages subagent spawning under hook enforcement.

---

### Anti-Pattern 5: Writing to .claude/settings.json from the Install Script Repeatedly

**What people do:** Re-run the install script to update settings.json whenever the framework changes. Each run overwrites the file, losing any user customizations.

**Why it's wrong:** Users may add their own hooks or modify MCP server config. An overwriting install destroys those customizations without warning.

**Do this instead:** The install script generates `settings.json` on first run only (check for existence). For updates, either: (a) provide a `--force` flag that overwrites with a warning, or (b) install generates `settings.synapse.json` and instructs the user to merge it manually. Option (b) is safer for production use.

---

## Scaling Considerations

This remains a single-user, local-first tool. Scaling means "more complexity in the project" not "more users."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single project, simple goal | No adjustments. The default install + init + plan flow works as-is. |
| Multiple projects on same machine | `project.toml` holds the project_id for whichever project the user is working in. No shared state across projects — each `.synapse/` is independent. |
| Large project (many files, deep task trees) | `index_codebase` handles incrementally. Task trees with depth 4+ may be slow to assemble in `get_task_tree` — the BFS is bounded at depth 5. |
| Team using same Synapse DB | Not in scope for v3.0. Single-user assumption baked into `project.toml` pattern. |
| Multiple Claude Code workspaces | Each workspace has its own `.claude/` and `.synapse/`. If pointing at the same DB, project_id scoping handles isolation. |

---

## Sources

- Synapse v2.0 codebase inspection (2026-03-03): `packages/framework/hooks/*.js`, `packages/framework/agents/*.md`, `packages/framework/config/*.toml`, `packages/framework/settings.template.json`, `packages/framework/src/skills.ts`, `packages/framework/src/config.ts` — HIGH confidence (direct source inspection)
- Existing `.claude/settings.json` in this repo — HIGH confidence (shows Claude Code hook integration pattern in practice)
- Existing `.claude/agents/*.md` (GSD agents) — HIGH confidence (shows Claude Code agent frontmatter conventions used in production)
- `packages/framework/workflows/pev-workflow.md` — HIGH confidence (authoritative PEV workflow specification)
- `packages/framework/agents/synapse-orchestrator.md` — HIGH confidence (shows how orchestrator reads and follows pev-workflow.md)
- Claude Code documentation (inferred from existing `.claude/` structure and `settings.template.json` hook format) — MEDIUM confidence (direct docs not fetched; inferred from working examples in this repo)
- `.planning/PROJECT.md` — HIGH confidence (project requirements and Active milestone list for v3.0)
- `milestone 3 - notes and questions.md` — HIGH confidence (open questions and missing work items for v3.0)

---

*Architecture research for: Synapse v3.0 Working Prototype — Claude Code integration, install script, dynamic skills, project_id injection, E2E workflow wiring, progress visibility*
*Researched: 2026-03-03*
