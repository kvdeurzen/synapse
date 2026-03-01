# Phase 12: Orchestrator Bootstrap - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Bootstrap the Synapse orchestrator as a Claude Code framework (not a standalone Agent SDK process). Establish the framework repo structure, Synapse MCP integration, session lifecycle, configuration system, and three-layer test harness. This is the foundation all subsequent phases (13-14) build on.

**Architecture pivot:** The original roadmap specified `@anthropic-ai/claude-agent-sdk`. The decided approach builds on Claude Code instead — agents, skills, hooks, and workflows as markdown/JS/TOML files that Claude Code loads natively. This simplifies infrastructure, uses the user's Claude Code subscription, and allows focus on the interesting parts (prompts, skills, trust) rather than building an agent runtime.

**Decouple path:** The valuable IP (agent prompts, skills, trust config, workflows) is portable. Migration to Agent SDK can happen later as a runtime/transport swap without rewriting orchestration logic.

</domain>

<decisions>
## Implementation Decisions

### Architecture & AI Backbone
- Build on Claude Code framework (like GSD), NOT standalone Agent SDK process
- Agents, skills, hooks, and workflows are files Claude Code loads natively
- Uses Claude Code subscription instead of per-token Anthropic API billing
- Future decouple to Agent SDK is possible — orchestration logic is portable

### Repository Structure
- **Three separate repos:**
  - `synapse-server` — Synapse MCP server (data layer, renamed from project_mcp)
  - `synapse-framework` — Agent framework (agents, skills, hooks, workflows)
  - `synapse-example` — Example project demonstrating Synapse + agents
- Distribution model: CLI scaffolding (npx synapse-init) — user owns the files after scaffolding (shadcn-ui model). Distribution CLI is a future concern; Phase 12 establishes the repo structure.
- Framework repo mirrors `.claude/` target layout — what you see in the repo is what lands in the project

### Framework Directory Structure
- Six directories in synapse-framework:
  - `agents/` — Agent role definitions (system prompt, allowed tools, tier)
  - `skills/` — Domain knowledge injected into agent context at spawn time
  - `hooks/` — Enforcement and logging (PreToolUse, PostToolUse)
  - `workflows/` — Multi-step orchestration (PEV loop, task decomposition)
  - `commands/` — User-facing slash commands (/synapse:plan, /synapse:status)
  - `config/` — Trust matrix, model profiles, agent registry (TOML format)

### Session Model
- Hybrid model: persistent project context + goal-scoped work streams
- Synapse MCP is the persistent data layer — task trees, decisions, activity log survive across Claude Code sessions
- Work stream = one user goal being pursued, with its own task tree rooted at an epic
- Multiple parallel work streams supported
- Work stream initiation: either natural language goal OR structured command (/synapse:new-goal)
- Progressive decomposition: Epic → Features (with enough context to validate completeness) → Components/Tasks (decomposed when feature starts)
- Configurable tiered approval for decomposition levels:
  - `approval: always` (advisory) — user approves at every level
  - `approval: strategic` (co-pilot) — user approves epics, orchestrator handles features→tasks
  - `approval: none` (autopilot) — fully autonomous, user sees progress
- Full attribution: every decision and task records which agent role proposed/executed it
- Full rollback support: tasks can be reopened + associated code changes reverted via git

### Startup Behavior
- Auto-detect open work on session startup
- Two Synapse calls for context assembly:
  1. `get_task_tree` on active epic(s) — structural view with rollup stats
  2. `get_smart_context` in overview mode — recent decisions, relevant docs, token-budgeted
- Present project status: current epic, features with state, recent activity

### Configuration
- TOML format (smol-toml already a Synapse dependency)
- Multiple config files in config/ directory (one per concern)
- `config/synapse.toml` — Synapse server connection (db path, Ollama URL), with Claude Code settings.json as fallback
- `config/secrets.toml` — API keys (gitignored), validated on startup
- `config/trust.toml` — Trust matrix with per-domain autonomy and approval tiers
- `config/agents.toml` — Agent registry, model assignments

### Test Harness
- Three-layer test strategy:
  - **Layer 1 (Unit):** Hooks, config validation, TOML parsing — mocked inputs, no API
  - **Layer 2 (Integration):** Synapse MCP tool calls — real Synapse + temp LanceDB, no API
  - **Layer 3 (Behavioral):** Agent prompt evaluation — recorded API responses, replay
- Test runner: `bun test` (consistent with Synapse server)
- JSON fixture files for recorded API responses
- Auto-record on missing fixture (first run captures live response, subsequent runs replay)
- Fixtures committed to git (simple, reproducible, no S3 infrastructure)
- Prompt scorecards for agent quality evaluation over time
- Scorecards in separate test files: `test/scorecards/*.scorecard.toml`

### Claude's Discretion
- Exact startup auto-detect UX (how status is formatted/presented)
- Fixture file naming conventions and directory structure
- TOML schema details for each config file
- Hook implementation details (JS structure, error handling)
- Prompt scorecard criteria format and scoring algorithm

</decisions>

<specifics>
## Specific Ideas

- "Build on Claude Code like GSD does" — the GSD framework is the reference architecture for how agents, skills, hooks, and workflows integrate with Claude Code
- Progressive decomposition mirrors GSD's flow: Roadmap → discuss → plan → execute, but driven by Synapse's task hierarchy
- Decisions are LAW — they persist in Synapse as permanent precedent for all future work streams (not "resolved" when a work stream completes)
- The startup experience should feel like picking up where you left off — not starting fresh every time

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `get_task_tree` tool (Phase 11): Returns full task hierarchy with rollup stats — used for startup context assembly
- `get_smart_context` tool (Phase 5): Token-budgeted context assembly — used for startup knowledge loading
- `store_decision` / `check_precedent` tools (Phase 10): Decision persistence and precedent checking — decisions are project-wide law
- `create_task` / `update_task` tools (Phase 11): Task tree management with cascade propagation — work stream task trees live here
- `activity_log` table: Already tracks actor field — supports full attribution requirement
- `smol-toml` dependency: Already in Synapse — config parsing ready

### Established Patterns
- Synapse runs via `bun run src/index.ts` with `--db` flag, stdio MCP transport
- Zod validation on all tool inputs — config validation should follow same pattern
- GSD's `.claude/` structure: agents/, commands/, hooks/ directories — reference for framework layout
- GSD's skill loading: markdown files injected into agent context at spawn time

### Integration Points
- Claude Code `settings.json` mcpServers section — Synapse server connection
- Claude Code `.claude/agents/` — agent definition files
- Claude Code `.claude/hooks/` — enforcement hooks (PreToolUse, PostToolUse)
- Claude Code `.claude/commands/` — user-facing slash commands
- Synapse MCP tools — all 17+ tools available to agents via MCP protocol

</code_context>

<deferred>
## Deferred Ideas

- npx synapse-init CLI distribution tool — scaffolding command for installing framework into projects (future phase)
- Agent SDK decouple option — migrate from Claude Code to standalone Agent SDK runtime (future milestone)
- Prompt scorecard dashboard — visual tracking of agent quality over time (future phase)
- Shared fixture bucket (S3) — considered and rejected in favor of git-committed fixtures; revisit if repo size becomes an issue

</deferred>

---

*Phase: 12-orchestrator-bootstrap*
*Context gathered: 2026-03-01*
