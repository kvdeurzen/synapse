# Phase 1: MCP Foundation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold a stdio MCP server with stderr-only logging discipline. Server accepts connections via stdio, registers tools with Zod-validated inputs, accepts configuration via CLI args/env vars/config file, and provably writes nothing to stdout. This is the transport and configuration foundation that every subsequent phase builds on.

</domain>

<decisions>
## Implementation Decisions

### Project setup & tooling
- TypeScript + Bun runtime
- bun as package manager (bun.lockb lockfile)
- ESM modules ("type": "module" in package.json)
- Flat src/ layout with domain folders: src/server.ts, src/tools/, src/db/, src/embeddings/, src/config.ts
- Strict TypeScript: strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes
- Biome for linting and formatting (single tool, minimal config)
- bun:test for testing (zero config, Jest-compatible API)

### Configuration behavior
- Precedence order: CLI args > env vars > synapse.toml > built-in defaults
- Config file: synapse.toml in current working directory (TOML format, CWD only — no directory walking)
- --db / SYNAPSE_DB_PATH: required — server fails with clear error if not provided from any source
- OLLAMA_URL: defaults to http://localhost:11434
- EMBED_MODEL: defaults to nomic-embed-text
- Validate all config values at startup; report all errors at once (don't fail on first)

### Logging approach
- Pino logger configured to write only to stderr
- Structured JSON log format
- 4 levels: error, warn, info, debug — default level is info
- Startup logs: resolved config summary (db path, Ollama URL, model) + Ollama health check result + registered tool count
- Tool calls logged at info level: tool name, duration, success/error
- Request correlation ID on every tool invocation for tracing across log lines
- --quiet / -q flag sets log level to warn
- --log-level flag for explicit level control

### Starter tool registration
- Two starter tools: ping and echo
- ping returns rich server info: version, uptime, db path, Ollama connectivity status, registered tool count
- echo returns its input back — validates Zod schema validation and stdio round-trip
- Eager loading — all tools imported and registered at startup
- Consistent response envelope: { success: boolean, data: ..., error?: string } for all tools

### Claude's Discretion
- Entry point / CLI invocation pattern (bin field vs direct bun run)
- Exact project directory names within src/
- Pino transport configuration details
- Build step and distribution approach

</decisions>

<specifics>
## Specific Ideas

- Config file uses TOML format (synapse.toml) — user preference for readability over JSON
- Pino chosen over custom logger — production-grade structured logging with stderr transport
- Biome chosen over ESLint+Prettier — single fast tool, Rust-based, aligns with Bun's speed philosophy
- Response envelope pattern ({ success, data, error? }) for predictable agent consumption

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-mcp-foundation*
*Context gathered: 2026-02-27*
