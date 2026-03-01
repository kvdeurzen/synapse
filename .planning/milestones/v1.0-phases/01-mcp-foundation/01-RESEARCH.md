# Phase 1: MCP Foundation - Research

**Researched:** 2026-02-27
**Domain:** MCP TypeScript SDK (stdio transport), Bun runtime, Pino logging, TOML config, Zod validation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project setup & tooling**
- TypeScript + Bun runtime
- bun as package manager (bun.lockb lockfile)
- ESM modules ("type": "module" in package.json)
- Flat src/ layout with domain folders: src/server.ts, src/tools/, src/db/, src/embeddings/, src/config.ts
- Strict TypeScript: strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes
- Biome for linting and formatting (single tool, minimal config)
- bun:test for testing (zero config, Jest-compatible API)

**Configuration behavior**
- Precedence order: CLI args > env vars > synapse.toml > built-in defaults
- Config file: synapse.toml in current working directory (TOML format, CWD only — no directory walking)
- --db / SYNAPSE_DB_PATH: required — server fails with clear error if not provided from any source
- OLLAMA_URL: defaults to http://localhost:11434
- EMBED_MODEL: defaults to nomic-embed-text
- Validate all config values at startup; report all errors at once (don't fail on first)

**Logging approach**
- Pino logger configured to write only to stderr
- Structured JSON log format
- 4 levels: error, warn, info, debug — default level is info
- Startup logs: resolved config summary (db path, Ollama URL, model) + Ollama health check result + registered tool count
- Tool calls logged at info level: tool name, duration, success/error
- Request correlation ID on every tool invocation for tracing across log lines
- --quiet / -q flag sets log level to warn
- --log-level flag for explicit level control

**Starter tool registration**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Server starts via stdio transport and connects to MCP clients (Claude Code, Cursor) | MCP SDK v1.x McpServer + StdioServerTransport pattern documented; StdioServerTransport reads stdin/writes stdout as JSON-RPC 2.0 |
| FOUND-02 | Server accepts --db path CLI arg and OLLAMA_URL, EMBED_MODEL, SYNAPSE_DB_PATH env vars | Bun supports util.parseArgs from Node.js util module; process.env for env vars; smol-toml for TOML config file parsing |
| FOUND-07 | All logging goes to stderr only — no stdout contamination of MCP JSON-RPC stream | Pino with pino.destination(2) routes all log output to fd 2 (stderr); any console.log to stdout corrupts JSON-RPC stream silently |
</phase_requirements>

---

## Summary

Phase 1 establishes the stdio MCP server skeleton: project scaffolding, configuration loading, Pino-to-stderr logging, two starter tools (ping, echo), and a provable guarantee that nothing non-JSON-RPC reaches stdout.

The MCP TypeScript SDK is at v1.27.1 (stable, February 2025). A v2 restructuring (`@modelcontextprotocol/server`) exists on the main branch but is pre-release and not recommended for production. This project uses `@modelcontextprotocol/sdk` (v1.x) throughout. The SDK requires Zod as a peer dependency (`^3.25 || ^4.0`). The SDK internally uses the `zod/v4` import path. After install, verify the resolved Zod version immediately before writing any schema code — this is a flagged concern in STATE.md.

The stdout contamination problem is the critical correctness risk in this phase. Any `console.log`, debug banner, or unhandled exception that prints to stdout permanently breaks the MCP JSON-RPC channel — the client silently drops the connection with no useful error. The fix is total: Pino to `pino.destination(2)`, never call `console.log` anywhere in the server codebase, and redirect even process-level uncaught exception handlers to `console.error`.

**Primary recommendation:** Scaffold project with Bun, configure Pino to `pino.destination(2)` before any other code runs, use `@modelcontextprotocol/sdk` v1.x with `server.tool()` or `server.registerTool()`, and validate stdout cleanliness with a pipe-through-JSON-parser smoke test.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server, tool registration, stdio transport | Official Anthropic SDK for MCP; provides McpServer + StdioServerTransport |
| zod | ^3.25 or ^4.x | Input schema validation for MCP tools | Required peer dep of MCP SDK; used to define inputSchema per tool |
| pino | ^9.x | Structured JSON logging to stderr | Production-grade, fastest Node/Bun logger; explicit fd destination control |
| smol-toml | ^1.6.0 | Parse synapse.toml config file | Fastest TOML parser on npm, written in TypeScript, ESM-native, fully TOML 1.1.0 compliant |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @biomejs/biome | ^2.x | Lint + format in one tool | User decision; replaces ESLint+Prettier |
| bun:test | built-in | Unit and integration tests | Zero-config, Jest-compatible; built into Bun runtime |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @modelcontextprotocol/sdk v1.x | @modelcontextprotocol/server (v2) | v2 is pre-release, unstable API surface; v1.x is production stable |
| smol-toml | @iarna/toml, js-toml, Bun native TOML import | Bun's native `import './file.toml'` works for static files only, not runtime-path reads. smol-toml is the fastest and most correct for programmatic parsing |
| pino | winston, consola | Pino has explicit destination fd control (pino.destination(2)) and is faster; winston has no clean fd-2-only mode |
| util.parseArgs (built-in) | commander, yargs, meow | util.parseArgs is Node/Bun built-in, zero dependency, sufficient for this flag set |

**Installation:**
```bash
bun add @modelcontextprotocol/sdk zod pino smol-toml
bun add -d @biomejs/biome @types/node typescript
```

---

## Architecture Patterns

### Recommended Project Structure

```
project_mcp/
├── src/
│   ├── index.ts          # Entry point: parse args, build config, start server
│   ├── server.ts         # McpServer instantiation, tool registration, transport connect
│   ├── config.ts         # Config loading: CLI > env > synapse.toml > defaults
│   ├── logger.ts         # Pino instance configured to stderr; exported singleton
│   ├── tools/
│   │   ├── ping.ts       # ping tool: server info, uptime, Ollama status
│   │   └── echo.ts       # echo tool: returns input back
│   └── types.ts          # Shared types (Config, ToolResult envelope)
├── test/
│   └── smoke.test.ts     # Spawn server, verify stdout is clean JSON-RPC only
├── biome.json
├── tsconfig.json
├── package.json
└── synapse.toml          # (optional user config — not checked in)
```

### Pattern 1: Pino Logger Configured to stderr Before Anything Else

**What:** Create the Pino logger as the first side-effect in the process. All downstream code imports the singleton. No `console.log` anywhere in server code.
**When to use:** Always — this is the mechanism that satisfies FOUND-07.
**Example:**
```typescript
// Source: https://github.com/pinojs/pino/blob/main/docs/api.md
// src/logger.ts
import pino from 'pino';

// pino.destination(2) = file descriptor 2 = stderr
// This is the ONLY correct way to guarantee no stdout output
export const logger = pino(
  { level: process.env.LOG_LEVEL ?? 'info' },
  pino.destination(2)
);
```

The logger level is overridden after config is parsed (see Pattern 3). The logger module must NOT import config to avoid circular deps.

### Pattern 2: McpServer + StdioServerTransport + Tool Registration

**What:** Instantiate McpServer, register tools with Zod schemas, connect to StdioServerTransport. StdioServerTransport reads from stdin and writes JSON-RPC responses to stdout. The SDK handles all protocol framing.
**When to use:** This is the exact pattern for FOUND-01.
**Example:**
```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'synapse',
  version: '0.1.0',
});

// v1.x uses server.tool() shorthand or server.registerTool()
// registerTool() is the v2-preferred API, also works in v1.x
server.registerTool(
  'echo',
  {
    description: 'Echo input back',
    inputSchema: z.object({ message: z.string() }),
  },
  async ({ message }) => {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, data: { message } }) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Note: use console.error, NEVER console.log — or better, use the pino logger
console.error('Synapse MCP server running');
```

**Import paths (v1.x):** The old deep import paths still work in v1.x:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

### Pattern 3: Config Loading with 4-Level Precedence

**What:** CLI args override env vars, which override synapse.toml, which overrides built-in defaults. Report ALL validation errors at once, not first-error-only.
**When to use:** Required for FOUND-02.
**Example:**
```typescript
// Source: Bun docs https://bun.com/docs/guides/process/argv (util.parseArgs)
import { parseArgs } from 'util';
import { readFileSync } from 'fs';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';

const ConfigSchema = z.object({
  db: z.string().min(1, 'db path is required'),
  ollamaUrl: z.string().url().default('http://localhost:11434'),
  embedModel: z.string().default('nomic-embed-text'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export function loadConfig(): z.infer<typeof ConfigSchema> {
  // 1. CLI args
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      db: { type: 'string' },
      'log-level': { type: 'string' },
      quiet: { type: 'boolean', short: 'q' },
    },
    strict: false,
    allowPositionals: false,
  });

  // 2. Env vars
  const env = {
    db: process.env.SYNAPSE_DB_PATH,
    ollamaUrl: process.env.OLLAMA_URL,
    embedModel: process.env.EMBED_MODEL,
  };

  // 3. synapse.toml (CWD only, not required)
  let fileConfig: Record<string, unknown> = {};
  try {
    const raw = readFileSync('synapse.toml', 'utf8');
    fileConfig = parseToml(raw) as Record<string, unknown>;
  } catch {
    // No config file — acceptable
  }

  // 4. Merge with precedence: CLI > env > file > defaults
  const merged = {
    db: values.db ?? env.db ?? (fileConfig.db as string | undefined),
    ollamaUrl: env.ollamaUrl ?? (fileConfig.ollama_url as string | undefined),
    embedModel: env.embedModel ?? (fileConfig.embed_model as string | undefined),
    logLevel: values['log-level'] ?? (values.quiet ? 'warn' : undefined),
  };

  // 5. Parse and collect ALL errors
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const errors = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`);
    console.error(`Configuration errors:\n${errors.join('\n')}`);
    process.exit(1);
  }

  return result.data;
}
```

### Pattern 4: Request Correlation ID via Pino Child Logger

**What:** Generate a correlation ID per tool invocation; attach to a child logger; pass child logger into the tool handler.
**When to use:** Required by the locked logging decisions (correlation ID on every tool invocation).
**Example:**
```typescript
// Source: https://context7.com/pinojs/pino (child logger docs)
import { randomUUID } from 'crypto';
import { logger } from './logger.js';

server.registerTool('ping', { ... }, async (_args) => {
  const correlationId = randomUUID();
  const reqLogger = logger.child({ correlationId, tool: 'ping' });
  const start = Date.now();

  reqLogger.info('Tool invoked');
  // ... do work ...
  reqLogger.info({ durationMs: Date.now() - start, success: true }, 'Tool complete');

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

### Anti-Patterns to Avoid

- **`console.log()` anywhere in server code:** Writes to stdout, corrupts MCP JSON-RPC stream silently. The client drops the connection with no useful error message. Use `logger.info()` or `logger.debug()` (Pino to stderr).
- **`console.error()` in production paths:** Acceptable in fatal crash handlers but not for normal logging. Use Pino everywhere.
- **Importing logger after config parses (circular):** logger.ts must not import config.ts. Initialize at a safe default level; set the level after config loads via `logger.level = config.logLevel`.
- **Failing on first config error:** Use `safeParse()` and collect all errors; report them together. The user may have 3 missing fields and should see all of them at once.
- **Starting transport before registering tools:** Register all tools synchronously before calling `server.connect(transport)`. The SDK handles the tools/list request from tool registrations that are already present at connect time.
- **Using `bun run --watch` in production:** Watch mode re-spawns the process on file change, breaking long-lived MCP connections.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC 2.0 framing | Custom stdin reader + JSON parser | `StdioServerTransport` from MCP SDK | Handles framing, request/response correlation, error codes, batch requests, protocol negotiation |
| Zod schema → JSON Schema | Manual JSON Schema objects | Zod + MCP SDK's automatic conversion | SDK converts Zod schemas to JSON Schema for the tools/list response automatically |
| TOML parsing | Custom regex parser | smol-toml | TOML has 15+ edge cases (multi-line strings, datetime types, dotted keys) — a hand-rolled parser will be wrong |
| CLI arg parsing | Manual `process.argv` slicing | `util.parseArgs` (built-in) | Handles -- separators, short flags, boolean negation, unknown arg rejection |
| Structured logging | `JSON.stringify` to stderr | Pino | Handles circular refs, log level filtering, performance, and reliable fd-2 routing |
| Correlation IDs | Global variable | Pino child loggers | Child loggers propagate bindings to all child log entries atomically |

**Key insight:** The MCP stdio framing protocol is not just "write JSON to stdout." It is line-delimited JSON-RPC 2.0 with specific message structure. The SDK handles `initialize`, `tools/list`, `tools/call`, error responses, and capability negotiation. Rolling this by hand is multi-week work.

---

## Common Pitfalls

### Pitfall 1: Stdout Contamination — Silent Protocol Corruption

**What goes wrong:** The MCP client (Claude Code) receives malformed JSON on stdout and immediately drops the connection. From the server side, nothing appears to fail. No error is logged. The server just becomes unresponsive.
**Why it happens:** Any `console.log()`, startup banner, or dependency that writes to stdout contaminates the JSON-RPC stream. The MCP protocol parser on the client side cannot recover from unexpected non-JSON content.
**How to avoid:**
1. Configure Pino to `pino.destination(2)` before any other setup code runs
2. Grep the entire codebase for `console.log` before shipping — it must be zero
3. Wrap uncaught exception handlers to use `console.error` not `console.log`
4. Verify with: `bun run src/index.ts | node -e "process.stdin.setEncoding('utf8'); process.stdin.on('data', d => JSON.parse(d))"`
5. A better smoke test: pipe server stdout through `jq` — any non-JSON output causes `jq` to error

**Warning signs:** MCP client reports "connection closed" or "server not responding" immediately after launch; no errors appear in server stderr logs.

### Pitfall 2: Zod Version Conflict (v3 vs v4)

**What goes wrong:** `@modelcontextprotocol/sdk` v1.27 declares peer dependency `"zod": "^3.25 || ^4.0"`. If Bun resolves to Zod v4 while the project code uses v3 Zod API (e.g., `.parse()` works the same but `.safeParse()` error shape changed), or vice versa, schema validation may produce unexpected errors.
**Why it happens:** The SDK internally uses `zod/v4` import subpath. With Bun hoisting, you may end up with two Zod versions or the wrong one.
**How to avoid:**
- After `bun add`, immediately run: `bun pm ls | grep zod` to verify the resolved version
- Pin explicitly in package.json: `"zod": "^3.25.0"` for Zod v3 or `"zod": "^4.0.0"` for v4
- Use the same Zod version everywhere — don't mix v3 and v4 APIs in the same codebase
- This is flagged in STATE.md as a known concern: *"Zod peer dependency version (v3 vs v4) for @modelcontextprotocol/sdk@1.27.1 must be verified immediately after npm install before writing any schema code"*

**Warning signs:** Tool registration fails at runtime; `inputSchema` type errors; `.parse is not a function` errors.

### Pitfall 3: Process Exit Before Transport Flush

**What goes wrong:** Server calls `process.exit(1)` during startup (e.g., missing --db arg). If Pino is in async/buffered mode, the last log messages are lost. The client sees the connection close with no error output on stderr.
**Why it happens:** Pino's async mode buffers writes for performance. If the process exits before the buffer flushes, messages are lost.
**How to avoid:** Use synchronous Pino mode (`sync: true`) for startup validation logs, OR call `logger.flush()` before `process.exit()`, OR use the default pino.destination(2) which is synchronous by default.

**Note:** `pino.destination(2)` without explicit `sync: false` defaults to synchronous mode — safe for startup validation exits.

### Pitfall 4: Tool Registration After Transport Connect

**What goes wrong:** Tools registered after `server.connect(transport)` may not appear in `tools/list` responses if the client sends `tools/list` immediately after connection establishment.
**Why it happens:** The MCP SDK responds to `tools/list` using the set of tools registered at call time. If registration is async or deferred, the first list call returns an empty or incomplete set.
**How to avoid:** Register all tools synchronously (eager loading per user decision) before calling `server.connect(transport)`. In this project: import and register ping and echo in server.ts before the transport.connect() call.

### Pitfall 5: TypeScript Strict Mode With noUncheckedIndexedAccess

**What goes wrong:** `noUncheckedIndexedAccess` means array indexing returns `T | undefined`. Code like `const first = items[0]; first.doSomething()` is a type error. `exactOptionalPropertyTypes` means you cannot assign `undefined` to an optional property — you must omit the key entirely.
**Why it happens:** These flags expose real runtime bugs. They're correct but require discipline.
**How to avoid:** Use optional chaining (`items[0]?.doSomething()`), null checks before array access, and conditional spreads for optional properties. This affects Zod output objects, config objects, and tool handler results.

---

## Code Examples

Verified patterns from official sources:

### MCP Server Minimal Complete Setup (v1.x)

```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import pino from 'pino';

// Logger MUST be configured before anything else
const logger = pino({ level: 'info' }, pino.destination(2));

const server = new McpServer({
  name: 'synapse',
  version: '0.1.0',
});

// Register tools BEFORE connecting transport
server.registerTool(
  'ping',
  {
    description: 'Check server health and connectivity',
    inputSchema: z.object({}),
  },
  async (_args) => {
    const result = { success: true, data: { status: 'ok', uptime: process.uptime() } };
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Synapse MCP server running on stdio'); // Goes to stderr via pino
}

main().catch((error) => {
  // console.error is acceptable here (fatal crash path)
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### Pino Stderr-Only Logger

```typescript
// Source: https://github.com/pinojs/pino/blob/main/docs/api.md
import pino from 'pino';

// pino.destination(2) = stderr file descriptor
// Default behavior (no sync: false) = synchronous = safe for process.exit() paths
export const logger = pino(
  {
    level: 'info',  // Will be overridden after config loads
    // No 'transport' key here — we use destination directly
  },
  pino.destination(2)
);

// After config loads, update level:
// logger.level = config.logLevel;
```

### Child Logger for Tool Correlation

```typescript
// Source: https://context7.com/pinojs/pino (child logger docs)
import { randomUUID } from 'crypto';

function createToolLogger(toolName: string) {
  return logger.child({
    correlationId: randomUUID(),
    tool: toolName,
  });
}

// Usage in tool handler:
server.registerTool('echo', { ... }, async ({ message }) => {
  const reqLog = createToolLogger('echo');
  const t0 = Date.now();
  reqLog.info('Tool invoked');

  const result = { success: true, data: { message } };
  reqLog.info({ durationMs: Date.now() - t0, success: true }, 'Tool complete');

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

### TOML Config Parsing (smol-toml)

```typescript
// Source: https://github.com/squirrelchat/smol-toml
import { parse as parseToml } from 'smol-toml';
import { readFileSync } from 'fs';

function readTomlConfig(path: string): Record<string, unknown> {
  try {
    return parseToml(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};  // File not present — acceptable
    }
    throw err;  // Parse error — surface to user
  }
}
```

### CLI Args with util.parseArgs (Bun)

```typescript
// Source: https://bun.com/docs/guides/process/argv
import { parseArgs } from 'util';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    db:          { type: 'string' },
    'log-level': { type: 'string' },
    quiet:       { type: 'boolean', short: 'q' },
  },
  strict: false,  // Don't throw on unknown flags (future compat)
  allowPositionals: false,
});
// values.db, values['log-level'], values.quiet
```

### Stdout Cleanliness Smoke Test

```bash
# Start server in background, capture stdout only, pipe to jq
# Any non-JSON-RPC output causes jq to error with non-zero exit
bun run src/index.ts --db /tmp/test.db 2>/dev/null | head -1 | jq .
```

Or as a bun:test integration test:
```typescript
// test/smoke.test.ts
import { test, expect } from 'bun:test';
import { spawn } from 'bun';

test('server stdout contains only JSON-RPC', async () => {
  const proc = spawn(['bun', 'src/index.ts', '--db', '/tmp/smoke-test'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Send MCP initialize request
  const request = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test', version: '1.0' }, capabilities: {} }
  }) + '\n';

  proc.stdin?.write(request);

  // Read response — must be valid JSON
  const reader = proc.stdout.getReader();
  const { value } = await reader.read();
  const response = new TextDecoder().decode(value);

  // If this throws, stdout is not valid JSON
  const parsed = JSON.parse(response.trim());
  expect(parsed.jsonrpc).toBe('2.0');
  expect(parsed.id).toBe(1);

  proc.kill();
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@modelcontextprotocol/sdk` deep imports (`sdk/server/mcp.js`) | `@modelcontextprotocol/server` package (v2, pre-release) | Q1 2025 (v2 branch) | v2 not yet stable; use v1.x deep imports for now |
| `server.tool(name, schema, cb)` variadic | `server.registerTool(name, config, cb)` with config object | MCP SDK v1.x internal migration | `registerTool()` is the forward-compatible API; raw shape argument no longer works in v2 |
| Biome v1 | Biome v2 (released June 2025) | June 17, 2025 | v2 has TypeScript type inference for lint rules; current stable is v2.x |
| `console.error()` for all non-stdout logging | Pino to stderr | Community consensus 2024-2025 | Structured JSON logs, level filtering, child bindings, correlation IDs |

**Deprecated/outdated:**
- `server.tool(name, rawShape, cb)`: raw Zod shape (not `z.object({...})`) is deprecated; always use `z.object()` wrapped schema
- v2 package names (`@modelcontextprotocol/server`): not yet stable, do not use in this project

---

## Open Questions

1. **Zod v3 vs v4 after install**
   - What we know: MCP SDK peer dep is `^3.25 || ^4.0`; SDK internally uses `zod/v4` subpath
   - What's unclear: Which version Bun resolves in practice; whether v3 and v4 have incompatible types for the `inputSchema` field
   - Recommendation: After `bun add`, run `bun pm ls | grep zod` and pin the resolved version explicitly in package.json. Write all Zod schemas using whichever version resolved; do not mix.

2. **Entry point: `bun run src/index.ts` vs compiled binary**
   - What we know: Bun can run TypeScript directly with no compile step; Claude's Discretion per CONTEXT.md
   - What's unclear: Whether Claude Code's MCP config needs a `bun run` command or a compiled executable
   - Recommendation: For Phase 1, use `bun run src/index.ts` as the command in `.mcp.json`. The `bin` field and build step can be added in a later phase when distribution is needed.

3. **Biome v2 compatibility with bun:test**
   - What we know: Biome v2 is the current stable version (June 2025); current version is 2.x
   - What's unclear: Any known friction between Biome v2 rules and bun:test test file patterns
   - Recommendation: Use `bun add -d @biomejs/biome` and initialize with `bunx biome init`. Configure `files.includes` to cover `src/**/*.ts` and `test/**/*.ts`.

---

## Sources

### Primary (HIGH confidence)

- `/modelcontextprotocol/typescript-sdk` (Context7) — MCP server setup, StdioServerTransport, registerTool API, Zod inputSchema patterns
- `/pinojs/pino` (Context7) — pino.destination(2), child loggers, correlation ID patterns, fd documentation
- https://github.com/modelcontextprotocol/typescript-sdk/releases — confirmed v1.27.1 is current stable, v2 is pre-release
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/package.json — confirmed peerDep `"zod": "^3.25 || ^4.0"`
- https://github.com/squirrelchat/smol-toml — confirmed v1.6.0, ESM-native, TypeScript, TOML 1.1.0 compliant

### Secondary (MEDIUM confidence)

- https://bun.com/docs/guides/process/argv (via WebSearch) — util.parseArgs works in Bun with Bun.argv
- https://biomejs.dev/blog/biome-v2/ — Biome v2 released June 17, 2025; current stable is v2.x
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration-SKILL.md (Context7) — registerTool() vs server.tool() migration guidance
- WebSearch results on stdout contamination in MCP stdio servers — confirmed silent failure mode, community consensus to use console.error or structured logging to stderr

### Tertiary (LOW confidence)

- WebSearch claim that SDK "internally imports from zod/v4": plausible but not verified from source. Pin Zod version after install.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — MCP SDK version confirmed from GitHub releases; Pino fd documentation from official docs; smol-toml version from GitHub
- Architecture: HIGH — patterns verified against Context7 MCP SDK documentation and Pino docs
- Pitfalls: HIGH for stdout contamination (multiple real-world issue reports + official docs confirm); MEDIUM for Zod version conflict (flagged in STATE.md, confirmed peer dep range but not runtime behavior verified)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (MCP SDK is under active development; check for new releases before implementation)
