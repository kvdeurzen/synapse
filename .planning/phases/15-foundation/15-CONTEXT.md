# Phase 15: Foundation - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

project_id is seamlessly available in every agent session and hooks execute correctly regardless of where Claude Code is launched from. This phase defines the project.toml schema, updates the startup hook to inject project_id, fixes hook path resolution, and normalizes config resolution across all gate hooks.

</domain>

<decisions>
## Implementation Decisions

### project.toml Schema
- Single config file at `.synapse/config/project.toml` replaces both project config AND `synapse.toml` server config
- `[project]` section: `project_id` (lowercase slug), `name` (human-readable), `skills` (array), `created_at` (ISO timestamp)
- `[server]` section: full MCP config including `db`, `ollama_url`, `embed_model`, `transport`, `command`, `args` — eliminates separate synapse.toml
- Domain modes stay in `trust.toml` (separate concern: identity vs autonomy rules)
- Skills must be validated against existing SKILL.md files — warn/error if no matching SKILL.md exists
- Startup hook validates project.toml on session start: checks project_id format and required fields, fails early with clear error if malformed
- Git policy: project.toml is committed (shared identity). A `.synapse/config/local.toml` (gitignored) provides section-scoped overrides — only `[server]` section can be overridden, `[project]` section is always from project.toml
- When project.toml doesn't exist: hard fail with error directing user to run `/synapse:init`

### project_id Injection
- Startup hook injects a structured instructions block into `additionalContext`:
  ```
  ─── SYNAPSE PROJECT CONTEXT ───
  project_id: {id}
  name: {name}
  skills: {skill1}, {skill2}
  ────────────────────────────────
  IMPORTANT: Always include project_id: "{id}" in every Synapse MCP tool call.
  ```
- Skill names only injected (not SKILL.md content) — content injection is Phase 19's scope
- Includes a direct instruction to always pass project_id to Synapse MCP tools
- Relies on startup hook firing for subagents too — verify during E2E (Phase 21)

### Config Resolution Order
- Shared utility function `resolveConfig(filename)` in `packages/framework/hooks/lib/resolve-config.js` — all hooks import it
- Resolution order: 1) `.synapse/config/` (walk up directory tree), 2) `packages/framework/config/` (monorepo dev fallback), 3) relative to hook file location
- Walk-up behavior: search current dir, then parent, then grandparent, etc. until `.synapse/config/` is found or filesystem root reached (git-style)
- Stop at first match — no merging configs from multiple locations
- audit-log.js uses the shared resolver to find `.synapse/` directory, then writes `.synapse-audit.log` in the same parent directory (always project root regardless of launch dir)

### Hook Path Strategy
- settings.json references hooks directly from `packages/framework/hooks/` — no copy or symlink needed
- Paths use `$CLAUDE_PROJECT_DIR` prefix: `"bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/tier-gate.js"`
- Use `bun` (not `node`) to run hook files — consistent with CLAUDE.md, handles ESM natively
- Phase 15 updates the actual `.claude/settings.json` in this repo with new Synapse hook references — hooks work immediately for monorepo development

### Claude's Discretion
- Exact structured context block formatting and delimiters
- Error message wording for validation failures
- Internal implementation of walk-up directory search algorithm
- Whether resolveConfig returns the path or the parsed content

</decisions>

<specifics>
## Specific Ideas

- Walk-up resolution should work like how git finds `.git/` — familiar mental model
- project.toml should be the "single source of truth" for the entire Synapse setup per project
- Hard fail on missing project.toml — no silent degradation, force explicit setup

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse-startup.js`: Already has 3-step fallback resolution (cwd → packages/framework/ → relative to hook). Can be extended to add .synapse/config/ as highest priority
- `tier-gate.js`, `tool-allowlist.js`, `precedent-gate.js`: All need the same resolution update — good candidate for shared utility extraction
- `audit-log.js`: PostToolUse hook that writes .synapse-audit.log — needs path resolution fix
- Server's `ProjectIdSchema` (init-project.ts): Zod regex `^[a-z0-9][a-z0-9_-]*$` — reuse same validation rule in startup hook

### Established Patterns
- Hooks are ESM `.js` files using `import.meta.url` for self-location
- Hooks read from stdin (JSON from Claude Code), return JSON to stdout
- `additionalContext` field in startup hook response is injected into Claude's session context
- Config files use TOML format (trust.toml, agents.toml, synapse.toml)
- Error handling: early exit with descriptive messages via process.exit(1)

### Integration Points
- `.claude/settings.json`: Hook registration — needs Synapse hooks added with $CLAUDE_PROJECT_DIR paths
- `packages/framework/config/synapse.toml`: Will be superseded by `.synapse/config/project.toml` [server] section
- `packages/framework/hooks/synapse-startup.js`: Primary modification target — add project.toml reading and project_id injection
- `.synapse/config/` directory: New directory to be created by /synapse:init (Phase 16) or manually

</code_context>

<deferred>
## Deferred Ideas

- Full SKILL.md content injection into agent context — Phase 19
- Dynamic skill-to-agent mapping from project.toml — Phase 19
- Agent prompt updates to reference project_id — Phase 18
- E2E verification that startup hook fires for subagents — Phase 21

</deferred>

---

*Phase: 15-foundation*
*Context gathered: 2026-03-03*
