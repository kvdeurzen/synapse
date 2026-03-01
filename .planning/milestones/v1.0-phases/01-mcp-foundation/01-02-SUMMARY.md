---
phase: 01-mcp-foundation
plan: 02
subsystem: infra
tags: [mcp, stdio, bun, typescript, zod, pino, json-rpc]

# Dependency graph
requires:
  - phase: 01-01
    provides: "logger.ts (Pino stderr singleton), config.ts (4-level loader), types.ts (ToolResult/SynapseConfig)"
provides:
  - "Functional MCP server runnable via `bun run src/index.ts --db /path`"
  - "src/index.ts entry point with config load, log level, server create+start"
  - "src/server.ts: McpServer with tools registered before transport.connect()"
  - "src/tools/ping.ts: ping tool returning server health (version, uptime, db, ollama, embed model)"
  - "src/tools/echo.ts: echo tool with Zod-validated string round-trip"
  - "test/smoke.test.ts: integration test proving stdout is clean JSON-RPC only"
  - "test/tools.test.ts: unit tests for ping and echo tool handlers"
  - "Phase 1 MCP foundation complete — Claude Code can connect and list tools"
affects:
  - "all subsequent phases (server.ts is the entry point for all future tool additions)"
  - "Phase 2 (LanceDB storage tools register via same server.ts pattern)"
  - "Phase 3 (Ollama tools will use same registerXTool pattern)"

# Tech tracking
tech-stack:
  added:
    - "@modelcontextprotocol/sdk (McpServer, StdioServerTransport) — already installed, now wired"
  patterns:
    - "registerXTool(server, config) pattern: each tool module exports a register function"
    - "Tools registered synchronously before StdioServerTransport.connect() — required for tools/list"
    - "Tool count tracked as plain counter (McpServer._registeredTools is a plain object, not Map)"
    - "Unit test tool invocation via (server as InternalServer)._registeredTools[name].handler()"
    - "Smoke test: Bun.spawn with pipe stdio, read stdout lines as JSON-RPC, verify parse succeeds"
    - "Notifications (notifications/initialized) sent between initialize and subsequent requests"

key-files:
  created:
    - "src/index.ts - Entry point: loadConfig, setLogLevel, createServer, startServer"
    - "src/server.ts - McpServer with tool registration before connect, exports createServer/startServer"
    - "src/tools/ping.ts - ping tool: server health info with ToolResult envelope"
    - "src/tools/echo.ts - echo tool: Zod-validated string round-trip with ToolResult envelope"
    - "test/smoke.test.ts - Integration test: stdout cleanliness, stderr log output, tools/list"
    - "test/tools.test.ts - Unit tests: ping fields, echo round-trip, ToolResult shape"
  modified: []

key-decisions:
  - "McpServer._registeredTools is a plain object (not Map) — accessed via bracket notation in tests"
  - "Tool count tracked as module-level counter since _registeredTools is private on McpServer type"
  - "registerXTool functions take server + config as params rather than returning handlers — cleaner API"
  - "notifications/initialized must be sent after initialize before tools/list — MCP protocol requirement"
  - "Smoke test sends notification between requests to follow MCP protocol handshake correctly"

patterns-established:
  - "registerXTool(server, config, ...extras) pattern for all future tool registrations"
  - "Tool unit tests use InternalServer type assertion to invoke handlers directly without full transport"

requirements-completed: [FOUND-01, FOUND-07]

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 1 Plan 02: Stdio MCP Server and Starter Tools Summary

**McpServer with StdioServerTransport, ping+echo tools registered before connect, and smoke test proving stdout carries only valid JSON-RPC with all logs on stderr**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T17:56:27Z
- **Completed:** 2026-02-27T18:00:46Z
- **Tasks:** 2
- **Files modified:** 6 created

## Accomplishments

- MCP server starts via `bun run src/index.ts --db /path` and connects via stdio transport
- ping and echo tools registered before transport.connect() — both appear in tools/list
- Smoke test proves stdout is exclusively valid JSON-RPC (JSON.parse succeeds, no contamination)
- Smoke test proves stderr carries all Pino log output ("Synapse" appears in stderr)
- tools/list integration test verifies both ping and echo tools are accessible
- 23 total tests pass (14 pre-existing + 9 new): 0 failures
- Zero console.log calls in any source file — all logging via Pino to stderr

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MCP server, entry point, and starter tools** - `a62c22b` (feat)
2. **Task 2: Create smoke test for stdout cleanliness and tool round-trip tests** - `e4724d8` (feat)

**Plan metadata:** (committed after SUMMARY.md creation)

## Files Created/Modified

- `src/index.ts` - Entry point: loadConfig, setLogLevel, createServer, startServer in async main()
- `src/server.ts` - McpServer creation + tool registration before StdioServerTransport.connect()
- `src/tools/ping.ts` - ping tool returning health info: version, uptime, dbPath, ollamaUrl, embedModel, toolCount
- `src/tools/echo.ts` - echo tool with z.object({ message: z.string() }) Zod schema, round-trips input
- `test/smoke.test.ts` - 3 integration tests via Bun.spawn: stdout clean, stderr has logs, tools/list works
- `test/tools.test.ts` - 6 unit tests: ping ToolResult shape, all fields, echo round-trip and content type

## Decisions Made

- **_registeredTools is a plain object:** McpServer's `_registeredTools` field at runtime is a keyed plain object `{ [toolName]: { handler } }`, not a Map. Test helper uses bracket notation access.
- **Tool count as counter:** Since `_registeredTools` is a private field on the TypeScript type, we track count externally with a module-level `toolCount` variable incremented on each registration call.
- **notifications/initialized required:** MCP protocol requires client to send `notifications/initialized` after the initialize response before subsequent requests. Smoke test includes this to properly test tools/list.
- **registerXTool function pattern:** Each tool module exports `registerXTool(server, config?, ...)` rather than a handler. Server.ts calls these before connect — clean, testable, extensible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed _registeredTools Map vs plain object in unit tests**
- **Found during:** Task 2 (tools.test.ts first run)
- **Issue:** Test helper called `tools.get(toolName)` expecting a Map, but `_registeredTools` at runtime is a plain object with tool names as keys
- **Fix:** Changed `tools.get(toolName)` to `tools[toolName]` in the `invokeTool` helper; updated type from `Map<...>` to `Record<string, InternalTool>`
- **Files modified:** test/tools.test.ts
- **Verification:** All 6 tool unit tests pass
- **Committed in:** e4724d8 (Task 2 commit, fix applied before commit)

**2. [Rule 1 - Bug] Fixed import order and formatting in new source files**
- **Found during:** Task 1 verification (biome check src/)
- **Issue:** Biome 2.x enforces import order (external packages before local, alphabetical within groups) and line-length formatting
- **Fix:** Ran `bunx biome check --write src/ test/` to auto-apply safe fixes; manually fixed `msg + "\n"` -> `` `${msg}\n` `` template literal
- **Files modified:** src/index.ts, src/server.ts, src/tools/ping.ts, src/tools/echo.ts, test/smoke.test.ts, test/tools.test.ts
- **Verification:** `bunx biome check src/ test/` reports no errors
- **Committed in:** a62c22b and e4724d8 (applied before each task commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes required for correctness and CI cleanliness. No scope creep.

## Issues Encountered

- MCP SDK `_registeredTools` is typed as `private` but accessible at runtime — standard pattern for internal state. Test uses `as unknown as InternalServer` type assertion, which is acceptable for unit test infrastructure.
- Biome `useTemplate` lint rule treats string concatenation as an error but marks the fix "unsafe" — manually applied the template literal change to avoid `--unsafe` flag.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 MCP Foundation complete — all success criteria met
- Server responds to initialize + tools/list JSON-RPC requests
- Stdout cleanliness verified by automated smoke test
- Pattern established for adding tools in Phase 2+: create `src/tools/X.ts` with `registerXTool()`, add call in `server.ts` before `transport.connect()`
- Phase 2 (LanceDB storage) can import `createServer`/`startServer` from server.ts and add `registerStorageTool()` calls

## Self-Check: PASSED

---
*Phase: 01-mcp-foundation*
*Completed: 2026-02-27*
