# Phase 22: Install Script - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A new user can wire Synapse into any project with a single command and receive actionable feedback at every step. The install script checks prerequisites, copies framework files, generates config, runs a smoke test, and produces a usage manual. This phase does NOT handle project initialization (`/synapse:init` does that) or CLAUDE.md amendment.

</domain>

<decisions>
## Implementation Decisions

### Distribution Model
- Entry point: `curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash` — standard GitHub raw URL pattern
- install.sh downloads a tagged release tarball, extracts needed files, copies into target project
- Two install modes supported:
  - **Global**: Installs to `~/.synapse/` — shared source across all projects, each project still gets its own server copy
  - **Local**: Installs directly into the current project only — no global footprint
- Server is always copied per project (not shared) — each project is self-contained with its own server files
- Unneeded source files are discarded after copying the relevant files into the target project

### File Layout in Target Project
- Framework files go to `.claude/` following Claude Code convention:
  - `.claude/agents/` — all 11 agent markdown files
  - `.claude/hooks/` — all hook JS files + lib/
  - `.claude/commands/synapse/` — all 5 slash commands
  - `.claude/skills/` — all 18 skill directories
- Config skeleton goes to `.synapse/config/` (project.toml, trust.toml, agents.toml templates)
- `.mcp.json` at project root — Synapse MCP server entry
- `.claude/settings.json` at project root — hooks configuration

### Existing Project Handling
- **settings.json**: Merge Synapse hooks into existing settings.json — preserve user's other hooks (e.g., GSD, custom hooks)
- **.mcp.json**: Merge Synapse server entry into existing .mcp.json — preserve other MCP servers
- **.gitignore**: Auto-add Synapse entries (`.synapse-audit.log`, `.synapse/config/local.toml`, LanceDB data dir) — don't touch other entries
- **Re-run behavior**: Interactive prompt — "Synapse is already installed. Update to latest? [y/N]" — user controls whether to overwrite
- **On update**: Overwrite Synapse framework files (agents, hooks, commands, skills) with latest. Preserve user config (`.synapse/config/project.toml`, `trust.toml` customizations)
- **Skills**: Copy all 18 skill directories — project.toml controls which are active, unused ones just sit on disk
- **CLAUDE.md**: Left for `/synapse:init` — install.sh only handles file setup, not project-specific config

### Prerequisite Checks
- **Bun**: Must be on PATH — no minimum version enforcement, just check existence
- **Ollama**: Must be installed (binary exists) — needn't be running during install. Print "Start Ollama before using /synapse:map" if not running
- **nomic-embed-text**: Checked if Ollama is running — if model not pulled, print `ollama pull nomic-embed-text` instruction
- **Claude Code**: Not checked by script (assumed since user is running install for Claude Code integration)

### Smoke Test
- **Full smoke test required**: Ollama must be running for smoke test to pass
- Tests: `init_project` → `store_document` → `semantic_search` — verifies the full pipeline (DB, embeddings, search)
- If Ollama not running: install completes but smoke test is skipped with instructions to run `install.sh --smoke-test` later to verify
- User only sees "Done" if smoke test passes

### Output Style
- Step-by-step with status indicators: ✓ for success, ✗ for errors, ⚠ for warnings
- Colored output with auto-detection (isatty check) — green/red/yellow. Falls back to plain text in pipes/CI
- Success message: summary of what was installed + single clear next step ("Next: Run /synapse:init in Claude Code")
- `--quiet` flag for CI/scripted use — suppresses step-by-step, only prints errors and final pass/fail

### Claude's Discretion
- Exact mechanism for starting/stopping MCP server during smoke test
- Release tarball structure and download URL pattern
- How to detect global vs local install mode (flag, prompt, or auto-detect)
- Internal implementation of JSON merging for settings.json and .mcp.json
- How to detect if Synapse is already installed (marker file, check for known files, etc.)

</decisions>

<specifics>
## Specific Ideas

- The two install modes (global/local) should feel natural — global is "install once, use everywhere" and local is "just this project"
- Merge behavior for settings.json/mcp.json is critical — users with existing Claude Code setups must not lose their hooks
- The smoke test is the user's confidence signal — "if smoke test passed, Synapse works"
- Step-by-step output with checkmarks gives immediate feedback at every stage — no silent waits

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/framework/settings.template.json`: Existing template with MCP server config and hook definitions — can be used as the source template for settings.json generation
- `packages/framework/agents/`: 11 agent markdown files to copy
- `packages/framework/hooks/`: 7 hook JS files + lib/ directory to copy
- `packages/framework/commands/synapse/`: 5 slash command files to copy
- `packages/framework/skills/`: 18 skill directories to copy
- `packages/framework/config/`: agents.toml, trust.toml, synapse.toml templates for .synapse/config/ skeleton

### Established Patterns
- Hook paths use `$CLAUDE_PROJECT_DIR` prefix (Phase 15 decision) — install.sh must generate paths with this prefix
- Hooks are run with `bun` (CLAUDE.md convention) — settings.json entries use `bun $CLAUDE_PROJECT_DIR/...`
- Config files use TOML format (trust.toml, agents.toml, project.toml)
- MCP server started via `bun run packages/server/src/index.ts` with `--db` flag
- `.synapse/config/project.toml` is single source of truth — created by `/synapse:init`, not by install.sh (install creates skeleton dir only)

### Integration Points
- `.claude/settings.json`: Generated/merged by install.sh — hooks point to `.claude/hooks/` with `$CLAUDE_PROJECT_DIR` prefix
- `.mcp.json`: Generated/merged by install.sh — Synapse MCP server entry with DB path and Ollama env
- `.synapse/config/`: Directory skeleton created by install.sh — actual config files populated by `/synapse:init`
- `docs/user-journey.md`: Existing user journey doc — needs updating as part of INST-04 usage manual
- `.gitignore`: Modified by install.sh to add Synapse entries

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-install-script*
*Context gathered: 2026-03-06*
