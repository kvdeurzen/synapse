# Synapse User Journey

A step-by-step guide from installation to running your first RPEV workflow.

## Prerequisites

- **Bun** (runtime): https://bun.sh
- **Ollama** (local embeddings): https://ollama.ai
  - Pull the embedding model: `ollama pull nomic-embed-text`
- **Claude Code** (AI assistant): https://claude.ai/code

## Step 1: Install Synapse

Run the install script from the Synapse repository:

```bash
bash install.sh
```

This copies agents, hooks, commands, and configuration files into your project's `.claude/` directory and creates the `.synapse/config/` directory structure.

> **Note:** The `install.sh` script is part of Phase 17. For now, copy the `packages/framework/` contents manually into your project's `.claude/` directory.

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

## Step 5: Check Your Dashboard

```
/synapse:status
```

See everything at a glance:
- Epics in priority order with their RPEV stage (Refining / Planning / Executing / Done)
- Feature progress within each epic
- Blocked items that need your input
- Recent decisions and suggested next actions

The dashboard embodies the "system drives, user unblocks" philosophy — the system handles execution, and you provide the decisions that require human judgment.

## Step 6: Navigate and Unblock

```
/synapse:focus "JWT token refresh"
/synapse:focus 2.3.1
```

Jump to any item by name (fuzzy matched) or path shorthand. Path shorthand reflects the current priority order: `2.3.1` means the 2nd epic, its 3rd feature, that feature's 1st work package.

When you focus on a blocked item, Synapse presents the decision context and helps you work through it — then continues execution once the decision is made.

## Ongoing Use

### The RPEV Rhythm

Your daily interaction follows a natural rhythm:

1. **Check status** (`/synapse:status`) — see what's happening and what needs you
2. **Unblock items** (`/synapse:focus` on blocked items) — make the decisions only you can make
3. **Shape the next thing** (`/synapse:refine`) — brainstorm the next epic while current work executes
4. **Repeat**

The system drives forward autonomously between your interactions. You're not managing tasks — you're making decisions and shaping vision.

### Key Concepts

- **Recursive RPEV**: Every layer (Project > Epic > Feature > Work Package) goes through Refine-Plan-Execute-Validate. The same model applies at every scale.
- **Decisions only in Refine + Plan**: Execution follows the plan; if something unexpected comes up during execution, it escalates back to you rather than proceeding on assumptions.
- **Everything is persisted**: All decisions, requirements, and refinement state live in the Synapse database — queryable by any agent, survivable across sessions.
- **Trust config**: You choose how involved you are at each level. More trust = more autonomy for agents. Less trust = more checkpoints for you.

### Command Reference

| Command | Purpose | When to use |
|---------|---------|-------------|
| `/synapse:init` | Set up project | Once, at the start |
| `/synapse:map` | Index codebase | After init, and periodically as code changes |
| `/synapse:refine` | Brainstorm and shape work | Whenever you're defining or exploring something |
| `/synapse:status` | Project dashboard | To check progress and find blocked items |
| `/synapse:focus` | Navigate to specific item | To drill into or unblock a specific item |

### Two Starting Paths

**New project with Synapse:**
1. Create your project directory
2. Install Synapse (`bash install.sh`)
3. `/synapse:init` (project is empty — that's fine)
4. `/synapse:refine` to start shaping your first epic
5. `/synapse:map` when you have code to index

**Adding Synapse to an existing project:**
1. Install Synapse (`bash install.sh`)
2. `/synapse:init` (detects your existing project name and structure)
3. `/synapse:map` (indexes your existing codebase)
4. `/synapse:refine` to define your next piece of work within the existing context
5. `/synapse:status` to see the full dashboard

---

*This document describes the v3.0 user journey. Some features (agent pool, proactive notifications) are planned for future phases and not yet available.*
