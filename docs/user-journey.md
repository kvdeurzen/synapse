# Synapse User Journey

Complete Guide — Installation, Commands, Configuration, and Troubleshooting

Synapse gives agents the right context for any task — from both project decisions and actual code — without wasting tokens on irrelevant content. The orchestrator ensures agents respect established decisions and decompose work into context-window-sized executable units.

## Prerequisites

- **Bun** (runtime): https://bun.sh — any version, must be on PATH
- **Ollama** (local embeddings): https://ollama.ai — any version; must be running when using `/synapse:map` and the smoke test
  - Pull the embedding model: `ollama pull nomic-embed-text`
- **Claude Code** (AI assistant): https://claude.ai/code — latest version

## Installation

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh | bash
```

### What install.sh does

install.sh checks prerequisites, copies framework files into your project's `.claude/` directory, generates configuration files, and runs a smoke test to verify the full pipeline.

### Install modes

**Local install (default)** — installs directly into the current project only:

```bash
bash install.sh
# or explicitly:
bash install.sh --local
```

**Global install** — installs to `~/.synapse/` as a shared source, then wires into the current project. Useful if you work with Synapse across many projects and want to cache the files once:

```bash
bash install.sh --global
```

### Flags reference

| Flag | Description |
|------|-------------|
| `--local` | Install into current project only (default) |
| `--global` | Install to `~/.synapse/` as shared source |
| `--smoke-test` | Run smoke test only (without reinstalling files) |
| `--quiet` | Suppress step-by-step output; only print errors and final result |
| `--version TAG` | Install a specific tagged release (e.g., `--version v3.0`) |
| `--help` | Show usage information |

### Re-install and update behavior

If Synapse is already installed, install.sh prompts before overwriting:

```
Synapse is already installed. Update to latest? [y/N]
```

On update: framework files (agents, hooks, commands, skills) are overwritten with the latest. Your configuration customizations in `.synapse/config/project.toml` and `trust.toml` are preserved.

### What gets created

```
.claude/
  agents/             # 14 agent definitions + shared protocol
  hooks/              # 7 hook scripts + lib/
  commands/synapse/   # 5 slash commands
  skills/             # 18 skill definitions
  server/             # Synapse MCP server (self-contained per project)
  settings.json       # Hook configuration (gitignored)
.synapse/
  config/             # Project configuration skeleton (committed)
.mcp.json             # MCP server entry (gitignored)
```

Note: `.claude/settings.json` and `.mcp.json` are gitignored — each developer on the project runs `install.sh` once to wire up their local environment.

## Step 1: Install Synapse

Run the one-liner from the Installation section above, or run `bash install.sh` if you have the repository cloned locally.

## Step 2: Initialize Your Project

```
/synapse:init
```

What happens:
1. Synapse detects your project name (from `package.json` or directory name)
2. You confirm or adjust the project ID
3. A `.synapse/config/project.toml` is created with your project identity
4. You walk through RPEV preferences (how involved you want to be at each level)
5. Synapse registers the project in its database
6. Optionally, a `## Synapse` section is added to your `CLAUDE.md`

After init, every Claude Code session automatically loads your project context via the startup hook. Agents always know what project they're in — you never have to tell them.

## Step 3: Map Your Codebase

```
/synapse:map
```

What happens:
1. Synapse checks that Ollama is running and has the embedding model (`nomic-embed-text`)
2. Your codebase is scanned: source files parsed, AST structures extracted, embeddings generated
3. A summary shows how many files and symbols were indexed

After mapping, agents can find relevant code and documentation using semantic search. Re-run `/synapse:map` periodically as your codebase evolves — mapping is incremental and only processes changed files.

## Step 4: Start Your First Epic

```
/synapse:refine
```

Describe what you want to build. Synapse acts as a thinking partner:
- Asks clarifying questions to understand your vision
- Surfaces related decisions from your project history
- Tracks decisions as DECIDED, OPEN, or EMERGING
- Checks readiness criteria for your hierarchy level

Example session:

```
> /synapse:refine "Add user authentication"

Synapse: "Let's explore that. What kind of authentication does your app need?
  Are we talking about username/password, OAuth, magic links, or something else?"

You: "OAuth with Google and GitHub, plus email magic links as fallback"

Synapse: "Good. That gives us three auth strategies. Let me check if there are
  any prior decisions about auth in this project..."

[Decision stored: "Auth strategies: OAuth (Google, GitHub) + email magic links" — Tier 1]
```

At Project and Epic levels, YOU decide when the foundation is solid enough to move to planning. At Feature and Work Package levels, the transition can be lighter based on your trust config.

## Step 5: Planning (System-Driven)

When refinement is complete — readiness criteria met, key decisions captured — the system automatically decomposes the item into children and queues planning. There is no `/synapse:plan` command; the transition is system-driven.

- At **Project and Epic level**, you explicitly signal readiness during refinement before planning begins
- At **Feature and Work Package level**, this transition can be lighter or automatic based on your trust config
- The Plan stage resolves all decisions that children will need so they can execute autonomously
- If the system needs your approval on a plan, it surfaces as a blocked item on your dashboard

## Step 6: Check Your Dashboard

```
/synapse:status
```

See everything at a glance:
- Epics in priority order with their RPEV stage (Refining / Planning / Executing / Done)
- Feature progress within each epic
- Blocked items that need your input
- Active agents and what they're working on (agent pool section)

The dashboard embodies the "system drives, user unblocks" philosophy — the system handles execution, and you provide the decisions that require human judgment.

## Step 7: Navigate and Unblock

```
/synapse:focus "JWT token refresh"
/synapse:focus 2.3.1
/synapse:focus agent C
```

Three addressing modes — pick whichever is natural:
- **By name** (fuzzy matched): `/synapse:focus "JWT token refresh"`
- **By path shorthand** (positional): `/synapse:focus 2.3.1` — 2nd epic, 3rd feature, 1st work package
- **By agent**: `/synapse:focus agent C` — jumps to a specific agent's current task; the fastest path to unblocking a stuck agent

When you focus on a blocked item, Synapse presents the decision context and helps you work through it — then continues execution once the decision is made.

## Configuration Reference

### project.toml

Created by `/synapse:init`. Contains project identity and active skills.

```toml
[project]
project_id = "my-app"
name = "My App"
skills = ["typescript", "react", "testing-strategy"]
created_at = "2026-03-06T10:00:00Z"
```

Fields:
- `project_id` — unique identifier used by all Synapse tools
- `name` — human-readable project name
- `skills` — array of active skill names from `.claude/skills/`; controls which skills are loaded into agent context
- `created_at` — ISO timestamp set at init time

### trust.toml

RPEV involvement matrix. Controls how involved you are at each level of the hierarchy and at each RPEV stage.

**Involvement modes:**

| Mode | Meaning |
|------|---------|
| `drives` | You initiate the action |
| `co-pilot` | Agent proposes, you approve |
| `reviews` | Agent does, you review the output |
| `autopilot` | Agent does, no user involvement |
| `monitors` | Agent does, you are notified and can intervene |

**Default involvement matrix (all 16 entries):**

```toml
[rpev.involvement]
project_refine   = "drives"
project_plan     = "co-pilot"
project_execute  = "monitors"
project_validate = "monitors"

epic_refine   = "co-pilot"
epic_plan     = "reviews"
epic_execute  = "autopilot"
epic_validate = "monitors"

feature_refine   = "reviews"
feature_plan     = "autopilot"
feature_execute  = "autopilot"
feature_validate = "autopilot"

work_package_refine   = "autopilot"
work_package_plan     = "autopilot"
work_package_execute  = "autopilot"
work_package_validate = "autopilot"
```

**Agent pool capacity:**

```toml
[rpev]
max_pool_slots = 3   # Maximum concurrent agent slots (all types share this limit)
```

**Domain autonomy overrides:** Give specific domains a different autonomy level regardless of RPEV level:

```toml
[domains]
architecture    = "co-pilot"
dependencies    = "co-pilot"
implementation  = "autopilot"
testing         = "autopilot"
documentation   = "autopilot"
product_strategy = "advisory"
```

**Domain overrides for specific RPEV stages:**

```toml
[rpev.domain_overrides]
# Format: {domain}_{stage} = "mode"
# Example: security_execute = "co-pilot"
```

### agents.toml

Agent role configuration. Assigns skills to each of the 14 agents and sets their allowed tools and model tier.

The 14 agents and their roles:

**Pipeline agents (spawned by orchestrator):**
- **product-researcher** — Gathers product context and synthesizes requirements during refinement (Opus)
- **architect** — Designs system architecture and drafts Tier 1-2 decisions (Opus)
- **architecture-auditor** — Reviews and activates architectural decision drafts; sole gatekeeper for Tier 1-2 decisions (Opus)
- **planner** — Decomposes epics and features into the task hierarchy (Opus)
- **plan-auditor** — Reviews decomposition plans before execution; activates Tier 2 planning decisions (Opus)
- **task-designer** — Designs detailed task specifications with acceptance criteria and test expectations (Opus)
- **task-auditor** — Reviews task specs for completeness and executability (Sonnet)
- **executor** — Implements work packages in isolated git worktrees (Sonnet)
- **validator** — Validates completed work against acceptance criteria (Sonnet)
- **integration-checker** — Checks cross-feature integration after wave completion (Sonnet)

**Support agents:**
- **researcher** — Gathers external context, documentation, and library research (Sonnet)
- **debugger** — Diagnoses failures and produces diagnostic reports for retries (Sonnet)
- **codebase-analyst** — Indexes and searches the codebase for context (Sonnet)

**Orchestration:**
- **synapse-orchestrator** — Dispatches pipeline agents, manages the pool, escalates failures (Opus)

Role skills are assigned per agent:

```toml
[agents.executor]
model = "sonnet"
role_skills = ["testing-strategy", "security", "documentation"]
```

### synapse.toml

Server connection configuration. Edit paths to match your local environment after install.

```toml
[server]
db = "/path/to/your/synapse.db"
ollama_url = "http://localhost:11434"
embed_model = "nomic-embed-text"

[connection]
transport = "stdio"
command = "bun"
args = ["run", "/path/to/.claude/server/src/index.ts"]
```

In installed projects, the server lives at `.claude/server/src/index.ts` and the DB is at `.synapse/data/synapse.db`. The `.mcp.json` at your project root configures these paths automatically.

## Command Reference

### /synapse:init

**Purpose:** Set up this project for Synapse — creates config files, configures RPEV preferences, registers with the database.

**Syntax:** `/synapse:init`

**What it does:**
- Detects project name from `package.json` or directory name
- Creates `.synapse/config/project.toml` with your project identity
- Walks you through RPEV involvement preferences
- Registers the project in the Synapse LanceDB database
- Optionally amends `CLAUDE.md` with a Synapse section

**Example session:**

```
/synapse:init

Detected project: "my-app" — confirm? [Y/n]

RPEV preferences (how involved do you want to be?):
  Epic level: [co-pilot] (agent proposes, you approve)
  Feature level: [reviews] (agent does, you review)
  ...

Synapse initialized for "my-app" (my-app)
Created: .synapse/config/project.toml
Next step: Run /synapse:map to index your codebase
```

### /synapse:map

**Purpose:** Index the project codebase for semantic search.

**Syntax:** `/synapse:map`

**What it does:**
- Verifies Ollama is running with `nomic-embed-text`
- Scans source files, extracts AST structures, generates vector embeddings
- Stores code and documentation in the Synapse database
- Reports file count, symbol count, and document count

**Example session:**

```
/synapse:map

Ollama is running with nomic-embed-text. Starting indexing...
Indexing codebase at /home/user/my-app...

Codebase indexed successfully.
Files processed: 47
Code symbols extracted: 312
Documents in knowledge base: 8

Run /synapse:refine to start defining your first epic.
```

### /synapse:refine

**Purpose:** Start or resume a refinement session — brainstorm ideas, track decisions, and shape requirements.

**Syntax:** `/synapse:refine` or `/synapse:refine "topic"`

**What it does:**
- Detects the hierarchy level (epic, feature, or work package) from the topic
- Loads any existing refinement state for cross-session continuity
- Surfaces related prior decisions via semantic search
- Runs a structured brainstorm with Socratic questioning
- Tracks DECIDED, OPEN, and EMERGING decisions throughout the session
- Persists all state to the Synapse database before session ends

**Example session:**

```
/synapse:refine "Add API rate limiting"

Refining at Feature level: API rate limiting
Found in-progress refinement — 3 decisions made, 1 open. Resume? [Y/n]

DECIDED:
- Rate limit by API key (not by IP) — Tier 2
- Limits: 1000/hour free, 10000/hour paid

OPEN:
- Should we use Redis or in-memory store?

What's your thinking on the storage backend?
```

### /synapse:status

**Purpose:** Show the RPEV project dashboard.

**Syntax:** `/synapse:status`

**What it does:**
- Displays all epics by priority with RPEV stage and completion percentage
- Shows blocked items that need your input
- Shows agent pool status (active agents, queued work)
- Lists recent decisions
- Suggests next actions based on current state

**Example output:**

```
## Synapse Dashboard

### Epics (by priority)

**Epic: Auth System** [EXECUTING] (65% complete) -- 142k tokens used
  - Feature: Login flow [DONE] -- 48k tokens used
  - Feature: JWT refresh [EXECUTING] -- 31k tokens used (2/4 tasks done)
  - Feature: Session mgmt [QUEUED]

### Needs Your Input

1 item needs your attention:
  1. JWT refresh [Feature] PLANNING — plan proposal ready for review
     Involvement mode: reviews | Use `/synapse:focus "JWT refresh"` to review

### Agent Pool (2/3 active, 1 queued)
- A [executor] Implement token rotation (Epic: Auth System) -- 4m
- B [validator] Validate login flow (Epic: Auth System) -- 2m
- C idle
Queued (1): Session management feature
```

### /synapse:focus

**Purpose:** Navigate to a specific item and present full context — status, decisions, related documents, and options.

**Syntax:** `/synapse:focus "name"` or `/synapse:focus 2.3.1` or `/synapse:focus agent C`

**What it does:**
- Resolves the target by name (fuzzy match), path shorthand (priority position), or agent slot
- Displays item status, decisions, related documents, and open questions
- For blocked items: presents decision context and starts an inline refinement session
- For pending approvals: shows a summary-first view (approve / reject / discuss deeper)
- For agent slots: shows running task, recent tool calls, and cancel option

**Example — unblocking a decision:**

```
/synapse:focus "JWT token refresh"

## Focus: JWT token refresh
Level: Feature | Status: PLANNING | Priority: 2 of 3

### Decision Needed: Storage backend for token state

Context: Refresh tokens need to be stored for revocation. Redis vs in-memory
has implications for horizontal scaling and operational complexity.

Options:
A) Approve the plan — proceed with Redis
B) Reject — provide different guidance
C) Discuss deeper — review the full proposal
```

## Agent Pool

The agent pool provides a configurable number of concurrent agent slots. All agent types (executor, validator, integration-checker, debugger) share the pool.

### Configure pool size

In `.synapse/config/trust.toml`:

```toml
[rpev]
max_pool_slots = 3  # default; increase for more parallelism
```

### How it works

- The orchestrator auto-assigns agents to the highest-priority unblocked work
- Finish-first policy: when a task completes, its validator gets the slot before new execution is dispatched
- Costs stay predictable: more slots = faster throughput but higher parallel cost

### Viewing pool state

```
/synapse:status          # Shows pool section with all active agents and queue
/synapse:focus agent A   # Detail view for agent A — task, running time, recent tool calls
/synapse:focus agent B   # Detail view for agent B
```

### Cancelling an agent

```
/synapse:focus agent A

## Agent A: [executor]
Task: Implement token rotation (Epic: Auth System) — 4m

Actions:
A) Cancel this agent
B) Back to status

> A

Cancel Agent A running 'Implement token rotation'? This will stop the agent.
What should happen to the task?
  1) Requeue — returns task to queue for next available slot
  2) Skip — marks task as skipped, continues with other work
```

## Ongoing Use

### The RPEV Rhythm

Your daily interaction follows a natural rhythm:

1. **Check status** (`/synapse:status`) — see what's happening and what needs you
2. **Unblock items** (`/synapse:focus` on blocked items) — make the decisions only you can make
3. **Shape the next thing** (`/synapse:refine`) — brainstorm the next epic while current work executes
4. **Repeat**

The system drives forward autonomously between your interactions. You're not managing tasks — you're making decisions and shaping vision.

### Key Concepts

- **Recursive RPEV**: Every layer (Project > Epic > Feature > Work Package) goes through Refine → Plan → Execute → Done. The same cycle applies at every scale.
- **Decisions only in Refine + Plan**: Execution follows the plan. If something unexpected comes up, agents escalate rather than deciding on their own.
- **Escalation, not ad-hoc decisions**: If execution hits something the plan didn't cover, the agent escalates to its parent layer — and ultimately to you if needed. This surfaces as a blocked item on your dashboard.
- **Decision precedent**: Agents check existing decisions before making new ones. If a precedent conflicts with the current scope, agents propose reconsideration rather than silently overriding. Decisions are superseded with a full audit trail, never deleted.
- **Everything is persisted**: All decisions, requirements, and refinement state live in the Synapse database — queryable by any agent, survivable across sessions.
- **Trust config**: You choose how involved you are at each level. More trust = more autonomy for agents. Less trust = more checkpoints for you.

## Troubleshooting

### Ollama not running

**Symptom:** `/synapse:map` reports "Ollama is not running"

**Fix:**
```bash
ollama serve   # run in a separate terminal
```

Verify Ollama is ready:
```bash
curl -sf http://localhost:11434/api/tags
```

After starting Ollama, run `install.sh --smoke-test` to verify the full pipeline:
```bash
bash install.sh --smoke-test
```

### Smoke test failed

**Symptom:** install.sh reports smoke test failed

**Fix:**
1. Ensure Ollama is running: `ollama serve`
2. Ensure `nomic-embed-text` is pulled: `ollama pull nomic-embed-text`
3. Retry: `bash install.sh --smoke-test`

### Hooks not firing

**Symptom:** Startup context is missing, audit log is empty, or tier gates are not triggering

**Fix:**
1. Check `.claude/settings.json` exists in your project root
2. Verify hook paths use `$CLAUDE_PROJECT_DIR` prefix — not absolute paths:
   ```json
   "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/synapse-startup.js"
   ```
3. Verify `bun` is on PATH: `which bun`
4. If missing, re-run: `bash install.sh`

### MCP server not connecting

**Symptom:** "MCP server not found" or Synapse tools unavailable in Claude Code

**Fix:**
1. Check `.mcp.json` exists at your project root
2. Verify the server path in `.mcp.json` points to `.claude/server/src/index.ts` in your project
3. Verify `bun` is on PATH: `which bun`
4. Restart Claude Code after making changes to `.mcp.json`

### Agent doesn't know project context

**Symptom:** Agent asks for project ID or doesn't recognize the project

**Fix:**
1. Run `/synapse:init` if not done — this creates `.synapse/config/project.toml`
2. Verify `project.toml` exists: `ls .synapse/config/project.toml`
3. Restart Claude Code session — the startup hook reads `project.toml` at session start

### Skills not loading

**Symptom:** Agent doesn't follow project-specific conventions or mentions unknown skill names

**Fix:**
1. Check `skills` array in `.synapse/config/project.toml` matches directory names in `.claude/skills/`
2. List available skills: `ls .claude/skills/`
3. Update `project.toml` with correct skill names:
   ```toml
   [project]
   skills = ["typescript", "testing-strategy", "security"]
   ```

## Two Starting Paths

**New project with Synapse:**
1. Create your project directory
2. Install Synapse: `curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh | bash`
3. `/synapse:init` (project is empty — that's fine)
4. `/synapse:refine` to start shaping your first epic
5. `/synapse:map` when you have code to index

**Adding Synapse to an existing project:**
1. Install Synapse: `curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh | bash`
2. `/synapse:init` (detects your existing project name and structure)
3. `/synapse:map` (indexes your existing codebase)
4. `/synapse:refine` to define your next piece of work within the existing context
5. `/synapse:status` to see the full dashboard

---

*This document describes the v3.0 user journey.*
