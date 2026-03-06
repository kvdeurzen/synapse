# Phase 22: Install Script - Research

**Researched:** 2026-03-06
**Domain:** Bash install scripting, JSON merging, MCP stdio protocol, release distribution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Distribution Model**
- Entry point: `curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash` — standard GitHub raw URL pattern
- install.sh downloads a tagged release tarball, extracts needed files, copies into target project
- Two install modes:
  - **Global**: Installs to `~/.synapse/` — shared source across all projects, each project still gets its own server copy
  - **Local**: Installs directly into the current project only — no global footprint
- Server is always copied per project — each project is self-contained
- Unneeded source files discarded after copying

**File Layout in Target Project**
- `.claude/agents/` — all 11 agent markdown files
- `.claude/hooks/` — all hook JS files + lib/
- `.claude/commands/synapse/` — all 5 slash commands
- `.claude/skills/` — all 18 skill directories
- Config skeleton to `.synapse/config/` (project.toml, trust.toml, agents.toml templates)
- `.mcp.json` at project root — Synapse MCP server entry
- `.claude/settings.json` at project root — hooks configuration

**Existing Project Handling**
- **settings.json**: Merge Synapse hooks into existing settings.json — preserve user's other hooks
- **.mcp.json**: Merge Synapse server entry into existing .mcp.json — preserve other MCP servers
- **.gitignore**: Auto-add Synapse entries — don't touch other entries
- **Re-run behavior**: Interactive prompt — "Synapse is already installed. Update to latest? [y/N]"
- **On update**: Overwrite framework files; preserve `.synapse/config/project.toml` and `trust.toml` customizations
- **Skills**: Copy all 18 skill directories — project.toml controls which are active
- **CLAUDE.md**: Left for `/synapse:init` — install.sh only handles file setup

**Prerequisite Checks**
- **Bun**: Must be on PATH — no minimum version, just check existence
- **Ollama**: Must be installed (binary exists) — needn't be running during install
- **nomic-embed-text**: Checked if Ollama is running — if not pulled, print `ollama pull nomic-embed-text`
- **Claude Code**: Not checked

**Smoke Test**
- Full smoke test: `init_project` → `store_document` → `semantic_search` — Ollama must be running
- If Ollama not running: install completes but smoke test skipped with instructions to run `install.sh --smoke-test` later
- User only sees "Done" if smoke test passes

**Output Style**
- Step-by-step with: `✓` success, `✗` errors, `⚠` warnings
- Colored output with isatty check — falls back to plain text in pipes/CI
- Success message: summary of what was installed + "Next: Run /synapse:init in Claude Code"
- `--quiet` flag for CI — suppresses step-by-step, only prints errors and final pass/fail

### Claude's Discretion
- Exact mechanism for starting/stopping MCP server during smoke test
- Release tarball structure and download URL pattern
- How to detect global vs local install mode (flag, prompt, or auto-detect)
- Internal implementation of JSON merging for settings.json and .mcp.json
- How to detect if Synapse is already installed (marker file, check for known files, etc.)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INST-01 | install.sh checks prerequisites (Bun, Ollama running, nomic-embed-text model) | Prerequisite check patterns, Ollama API health check endpoint confirmed |
| INST-02 | install.sh copies agents, hooks, commands to `.claude/` and generates settings.json and .mcp.json | File layout confirmed from codebase scan; settings.template.json exists as source; JSON merge via bun inline script |
| INST-03 | install.sh runs smoke test (init_project → store_document → semantic_search) before declaring success | MCP stdio JSON-RPC protocol confirmed from synapse-client.ts; standalone bun smoke script is the right mechanism |
| INST-04 | Usage manual documents the complete user journey, commands reference, and configuration | docs/user-journey.md exists and needs update; full command reference already documented there |
</phase_requirements>

---

## Summary

Phase 22 delivers `install.sh` — the single command that wires Synapse into any project — plus an updated usage manual. The install script is written in bash and handles prerequisite checking, file copying, JSON merging for existing Claude Code configs, and a smoke test that spawns the MCP server via its stdio interface to verify end-to-end functionality.

The technical challenge is not individual operations but their composition: merging into existing `settings.json`/`.mcp.json` without clobbering user config, generating correct `$CLAUDE_PROJECT_DIR`-prefixed hook paths, and running a smoke test that communicates over the MCP stdio JSON-RPC protocol. Every piece of this infrastructure already exists in the codebase — `settings.template.json`, `synapse-client.ts`, and the test project's `settings.json` are the canonical templates.

The smoke test is the highest complexity piece. It requires spawning `bun run packages/server/src/index.ts --db <tmpdir>`, performing the MCP initialization handshake, calling three tools, and verifying `success: true` in each response. The existing `synapse-client.ts` integration test helper is the exact implementation pattern to follow — install.sh shells out to a dedicated `scripts/smoke-test.mjs` that replicates this pattern.

**Primary recommendation:** Write install.sh as a pure bash script that uses `bun` as an inline interpreter for the two hard sub-problems (JSON merge and smoke test) — this avoids requiring `jq` or `python3` while staying portable.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| bash | System | Install script runtime | Universal, no installation needed; `curl | bash` is the standard pattern |
| bun | 1.3.9 (project standard) | JSON merging inline + smoke test | Already required by Synapse; avoids jq/python3 dependency; CLAUDE.md mandates bun |
| Ollama HTTP API | REST at localhost:11434 | Health check + model list check | Ollama exposes `/api/tags` endpoint for model listing |
| MCP stdio JSON-RPC | Protocol 2024-11-05 | Smoke test server communication | Established in smoke.test.ts and synapse-client.ts |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `curl` | System | Download release tarball + Ollama health check | Always present for `curl | bash` users; also used for `GET /api/tags` |
| `tar` | System | Extract release tarball | Standard POSIX tool |
| `cp -r` | System | Copy framework files | Simple recursive copy |
| `mkdir -p` | System | Create destination directories | Idempotent dir creation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bun for JSON merge | jq | jq not always installed; bun IS required by Synapse so it's safer to depend on it |
| bun for JSON merge | python3 | python3 is usually present but not guaranteed; bun is required and known to be available |
| standalone smoke-test.mjs | inline bash + JSON-RPC | Bash cannot reliably do async JSON-RPC stdio — bun script is cleaner and testable |

**Installation:**
```bash
# Nothing to install — install.sh is the installer
# It assumes bun is on PATH (which it checks)
```

---

## Architecture Patterns

### Recommended File Structure

```
synapse/
├── install.sh                   # Main installer script
├── scripts/
│   └── smoke-test.mjs           # Standalone bun smoke test (called by install.sh)
└── docs/
    └── user-journey.md          # Updated usage manual (INST-04)
```

### Pattern 1: Bash Install Script Structure

**What:** Single bash script with clear phases: parse args → check prerequisites → download/extract → copy files → merge configs → run smoke test → print summary

**When to use:** All install operations

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Color setup (isatty check) ─────────────────────────────────────────────
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; RESET=''
fi

QUIET=false
SMOKE_ONLY=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --quiet|-q) QUIET=true ;;
    --smoke-test) SMOKE_ONLY=true ;;
  esac
done

log_step()  { [ "$QUIET" = false ] && printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
log_warn()  { printf "  ${YELLOW}⚠${RESET}  %s\n" "$1"; }
log_error() { printf "  ${RED}✗${RESET}  %s\n" "$1" >&2; }
log_info()  { [ "$QUIET" = false ] && printf "     %s\n" "$1"; }
```

**Source:** Derived from `test_project/.claude/settings.json` and `CLAUDE.md` conventions. Confirmed by examining existing hook command patterns.

### Pattern 2: MCP Smoke Test via Standalone bun Script

**What:** A standalone `scripts/smoke-test.mjs` that spawns the MCP server, performs initialization handshake, calls three tools, validates responses. Called by install.sh via `bun run scripts/smoke-test.mjs --db <path> --server-path <path>`.

**When to use:** Smoke test phase of install.sh; also callable standalone with `install.sh --smoke-test`

```javascript
// scripts/smoke-test.mjs
// Source: adapted from packages/framework/test/helpers/synapse-client.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    db: { type: "string" },
    "server-path": { type: "string" },
  },
  strict: false,
});

const serverPath = values["server-path"] ?? "packages/server/src/index.ts";
const tmpDir = values.db ?? mkdtempSync(join(tmpdir(), "synapse-smoke-"));
const cleanup = !values.db; // cleanup temp dir only if we created it

let proc;
try {
  proc = Bun.spawn(["bun", "run", serverPath, "--db", tmpDir], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  // ... MCP handshake + 3 tool calls + validate success: true
  // Exit code 0 = smoke passed, 1 = smoke failed
  process.exit(0);
} catch (err) {
  console.error("Smoke test failed:", err.message);
  process.exit(1);
} finally {
  proc?.kill();
  if (cleanup) rmSync(tmpDir, { recursive: true, force: true });
}
```

**Source:** Pattern from `/home/kanter/code/synapse/packages/framework/test/helpers/synapse-client.ts`

### Pattern 3: JSON Merge via Inline bun Script

**What:** For merging Synapse entries into existing `settings.json`/`.mcp.json` without clobbering user config, run a bun one-liner that reads, merges, and writes.

**When to use:** Whenever target file already exists and has user content

```bash
# Merge Synapse hooks into existing settings.json
SYNAPSE_HOOKS='{"SessionStart":[...],"PreToolUse":[...],"PostToolUse":...}'
TARGET_FILE=".claude/settings.json"

bun -e "
  import { readFileSync, writeFileSync } from 'node:fs';
  const existing = JSON.parse(readFileSync('${TARGET_FILE}', 'utf-8'));
  const synapseHooks = ${SYNAPSE_HOOKS};
  // Deep merge: preserve existing hooks, append Synapse hooks
  const merged = { ...existing };
  merged.hooks = merged.hooks ?? {};
  for (const [event, hookList] of Object.entries(synapseHooks)) {
    merged.hooks[event] = [...(merged.hooks[event] ?? []), ...hookList];
  }
  writeFileSync('${TARGET_FILE}', JSON.stringify(merged, null, 2));
"
```

**Confidence:** HIGH — bun inline eval is documented and stable. The merge strategy (append, not replace) preserves user hooks.

### Pattern 4: Prerequisite Check Sequence

**What:** Check bun, then Ollama binary, then Ollama running status, then nomic-embed-text availability

```bash
# 1. Check bun on PATH
if ! command -v bun &>/dev/null; then
  log_error "Bun not found. Install from https://bun.sh"
  exit 1
fi
log_step "Bun found ($(bun --version))"

# 2. Check Ollama binary
if ! command -v ollama &>/dev/null; then
  log_warn "Ollama not found. Install from https://ollama.ai"
  log_info "You will need Ollama to use /synapse:map and for the smoke test."
  OLLAMA_AVAILABLE=false
else
  log_step "Ollama found"
  OLLAMA_AVAILABLE=true
fi

# 3. Check Ollama running (HTTP health check)
OLLAMA_RUNNING=false
if [ "$OLLAMA_AVAILABLE" = true ]; then
  if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_RUNNING=true
    log_step "Ollama is running"

    # 4. Check nomic-embed-text model
    if curl -sf http://localhost:11434/api/tags | grep -q "nomic-embed-text"; then
      log_step "nomic-embed-text model found"
    else
      log_warn "nomic-embed-text model not pulled"
      log_info "Run: ollama pull nomic-embed-text"
    fi
  else
    log_warn "Ollama is installed but not running"
    log_info "Start Ollama before using /synapse:map"
    log_info "Run 'install.sh --smoke-test' after starting Ollama to verify the full pipeline"
  fi
fi
```

**Source:** Ollama HTTP API at localhost:11434/api/tags is the standard health + model list endpoint. Confirmed against Ollama docs (HIGH confidence — Ollama is running on this machine, endpoint verified).

### Pattern 5: Hook Path Generation

**What:** install.sh generates settings.json with `$CLAUDE_PROJECT_DIR`-prefixed hook paths pointing to `.claude/hooks/`

```bash
# Generate .claude/settings.json from template
# Hook paths use: bun $CLAUDE_PROJECT_DIR/.claude/hooks/<hookname>.js
PROJECT_DIR_VAR='$CLAUDE_PROJECT_DIR'

cat > .claude/settings.json << 'SETTINGS_EOF'
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/synapse-startup.js"
          }
        ]
      }
    ],
    ...
  }
}
SETTINGS_EOF
```

**Source:** Pattern derived from `test_project/.claude/settings.json` — the real-world example where hooks point to `$CLAUDE_PROJECT_DIR/../packages/framework/hooks/`. For installed projects the path is `$CLAUDE_PROJECT_DIR/.claude/hooks/`. Phase 15 decision: `$CLAUDE_PROJECT_DIR` prefix is mandatory.

### Pattern 6: Already-Installed Detection

**What:** Check for a Synapse marker to decide whether to prompt for update vs fresh install

**Recommended approach:** Check for `.synapse/` directory existence. It's created by install.sh during fresh install and is authoritative — unlike individual framework files that might be absent after partial install.

```bash
if [ -d ".synapse" ]; then
  # Already installed — interactive update prompt
  if [ "$QUIET" = true ]; then
    log_info "Synapse already installed. Updating..."
    SHOULD_UPDATE=true
  else
    printf "Synapse is already installed. Update to latest? [y/N] "
    read -r response
    SHOULD_UPDATE=$( [ "$response" = "y" ] || [ "$response" = "Y" ] && echo true || echo false )
  fi
fi
```

### Anti-Patterns to Avoid

- **Hardcoding absolute paths in settings.json:** Hook paths MUST use `$CLAUDE_PROJECT_DIR` prefix. Never write `/home/user/project/.claude/hooks/...`
- **Using node instead of bun for hook commands:** CLAUDE.md mandates bun. Generated settings.json must use `bun $CLAUDE_PROJECT_DIR/...`, not `node`
- **Clobbering existing settings.json:** Install on top of a GSD or other custom hook setup must preserve other entries — deep merge only
- **Running smoke test when Ollama is down:** `semantic_search` requires embedding; if Ollama not running, skip smoke test gracefully and print `install.sh --smoke-test` retry instructions
- **Using `set -e` without traps:** Cleanup (kill server process, remove temp DB) must happen even on failure — use `trap cleanup EXIT`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON merging in bash | Regex sed/awk hacks on JSON | `bun -e` inline eval | JSON is not line-oriented; regex will break on nested objects, arrays, special chars |
| MCP protocol client in bash | nc/socat pipe games | `scripts/smoke-test.mjs` using Bun.spawn | MCP is async JSON-RPC with ordered message IDs; bash cannot handle this reliably |
| Ollama model detection | Parsing `ollama list` output | `curl localhost:11434/api/tags` | HTTP JSON API is machine-readable; `ollama list` output format is human-oriented and can change |
| Temp DB cleanup | Manual file deletion in smoke test | `trap cleanup EXIT` + rmSync in mjs | Process kill + cleanup must happen even on script error; traps handle this reliably |

**Key insight:** The install script's real complexity is in two subproblems — JSON merging and MCP smoke test. Both should be delegated to bun scripts, not handled in pure bash.

---

## Common Pitfalls

### Pitfall 1: Hook Path Prefix is Wrong
**What goes wrong:** Settings.json generated with `node` instead of `bun`, or with relative paths instead of `$CLAUDE_PROJECT_DIR` prefix — hooks fire from wrong directory or silently fail outside repo root
**Why it happens:** Copying the settings.template.json literally — it uses `node` and relative paths for the monorepo layout, not the installed layout
**How to avoid:** Generate settings.json from scratch with `bun $CLAUDE_PROJECT_DIR/.claude/hooks/<name>.js` pattern. Look at `test_project/.claude/settings.json` as the canonical reference — the hook paths there use `$CLAUDE_PROJECT_DIR/../packages/framework/hooks/` for the dev layout, installed projects use `$CLAUDE_PROJECT_DIR/.claude/hooks/`
**Warning signs:** Hooks appear in settings.json but don't fire; audit log is empty after tool calls

### Pitfall 2: MCP Server stdout Contamination
**What goes wrong:** Smoke test fails to parse JSON-RPC responses because the server emits non-JSON to stdout
**Why it happens:** Any `console.log()` in server startup path contaminates the stdio JSON-RPC channel
**How to avoid:** The server already uses Pino for logging to stderr only; smoke-test.mjs should treat any non-JSON stdout line as an error. Study existing smoke.test.ts — it explicitly tests "stdout is clean JSON-RPC"
**Warning signs:** `JSON.parse` throws in smoke-test.mjs

### Pitfall 3: MCP Initialization Handshake Order
**What goes wrong:** `tools/call` fails with "Server not initialized" because the `notifications/initialized` notification was not sent before tool calls
**Why it happens:** MCP protocol requires: `initialize` request → `notifications/initialized` notification → then tool calls. Skip the notification and all tool calls return errors
**How to avoid:** Follow the exact sequence in `synapse-client.ts`:
  1. `sendRequest("initialize", {...})`
  2. `sendNotification("notifications/initialized")`
  3. `callTool(name, args)`
**Warning signs:** `tools/call` returns error code -32002 "Server not initialized"

### Pitfall 4: Smoke Test DB Path Collision
**What goes wrong:** Parallel install runs (or re-runs) fail because temp DB from previous run still exists
**Why it happens:** LanceDB creates a directory; if it already exists from a crashed run, it may be in a corrupt state
**How to avoid:** Use timestamp-based temp dir: `/tmp/synapse-smoke-${Date.now()}` — guaranteed unique per run. Always `rmSync(tmpDir, { recursive: true })` in the cleanup trap.
**Warning signs:** `init_project` returns error about existing DB

### Pitfall 5: `curl | bash` Losing CWD
**What goes wrong:** When run via `curl -fsSL URL | bash`, the script may not have access to the expected working directory
**Why it happens:** `curl | bash` pipes into bash's stdin; some environments change the working directory. The script needs to detect and use `$PWD` explicitly.
**How to avoid:** At script start, capture `TARGET_DIR="${TARGET_DIR:-$PWD}"` and use it throughout. Never rely on implicit CWD from piped execution.
**Warning signs:** Files copied to wrong directory; scripts fail with "not found"

### Pitfall 6: settings.json and .mcp.json Are in .gitignore
**What goes wrong:** The install script creates or modifies `.claude/settings.json` and `.mcp.json`, but looking at `/home/kanter/code/synapse/.gitignore`, `settings.json` is gitignored — suggesting the file is intentionally local
**Why it happens:** settings.json contains machine-specific hook paths with `$CLAUDE_PROJECT_DIR` — it's project-local configuration
**How to avoid:** This is correct behavior — generated settings.json should NOT be committed. Install.sh should mention this in its output summary: "Note: .claude/settings.json is gitignored — each developer runs install.sh"
**Warning signs:** N/A — this is expected behavior, not a bug

### Pitfall 7: JSON Merge Duplicates Synapse Hooks on Re-Run
**What goes wrong:** Running install.sh a second time appends Synapse hooks again, resulting in double-firing
**Why it happens:** Naive append-to-array merge
**How to avoid:** Before merging, check if Synapse hooks are already present (look for `synapse-startup.js` in SessionStart hooks). If found, skip merge or replace the existing Synapse entries only.
**Warning signs:** Audit log entries doubled; `synapse-startup.js` appears twice in settings.json

---

## Code Examples

Verified patterns from existing codebase:

### MCP JSON-RPC Initialization Sequence
```javascript
// Source: /home/kanter/code/synapse/packages/framework/test/helpers/synapse-client.ts

const proc = Bun.spawn(["bun", "run", serverPath, "--db", tmpDir], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, OLLAMA_URL: "http://localhost:11434" },
});

// Step 1: initialize request
const initMsg = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "synapse-install", version: "1.0" },
  },
}) + "\n";
proc.stdin.write(initMsg);
await proc.stdin.flush();
// ... read response with id: 1

// Step 2: initialized notification (REQUIRED before any tool calls)
const initNotif = JSON.stringify({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {},
}) + "\n";
proc.stdin.write(initNotif);
await proc.stdin.flush();

// Step 3: tool call
const toolMsg = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "init_project",
    arguments: { project_id: "smoke-test" },
  },
}) + "\n";
proc.stdin.write(toolMsg);
await proc.stdin.flush();
// ... read response with id: 2, check result.content[0].text parsed as JSON has success: true
```

### Generated settings.json Shape (Installed Layout)
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/synapse-startup.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "mcp__synapse__store_decision",
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/tier-gate.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/precedent-gate.js"
          }
        ]
      },
      {
        "matcher": "mcp__synapse__.*",
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/tool-allowlist.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/audit-log.js"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/synapse-statusline.js"
  }
}
```
**Source:** Derived from `test_project/.claude/settings.json` (uses `$CLAUDE_PROJECT_DIR/../packages/framework/hooks/` for dev layout) and `settings.template.json` — installed layout moves hooks to `.claude/hooks/`

### Generated .mcp.json Shape
```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": [
        "run",
        "$CLAUDE_PROJECT_DIR/.claude/server/src/index.ts",
        "--db",
        "$CLAUDE_PROJECT_DIR/.synapse/data/synapse.db"
      ],
      "env": {
        "OLLAMA_URL": "http://localhost:11434",
        "EMBED_MODEL": "nomic-embed-text"
      }
    }
  }
}
```
**Source:** Adapted from `packages/framework/settings.template.json` — server path changes from `packages/server/src/index.ts` (monorepo) to `.claude/server/src/index.ts` (installed). DB path uses `.synapse/data/synapse.db` convention.

### Tool Call Result Validation
```javascript
// Source: server ToolResult<T> type pattern from packages/server/src/types.ts
// All tools return: { content: [{ type: "text", text: JSON.stringify({success: true, data: {...}}) }] }

function validateToolResult(response, toolName) {
  if (response.error) {
    throw new Error(`${toolName} RPC error: ${response.error.message}`);
  }
  const result = response.result;
  const content = result?.content?.[0]?.text;
  if (!content) throw new Error(`${toolName}: empty response`);
  const parsed = JSON.parse(content);
  if (!parsed.success) {
    throw new Error(`${toolName} returned success: false — ${parsed.error}`);
  }
  return parsed.data;
}
```

### Idempotent .gitignore Append
```bash
# Append Synapse gitignore entries only if not already present
GITIGNORE="${TARGET_DIR}/.gitignore"
ENTRIES=(
  ".synapse-audit.log"
  ".synapse/config/local.toml"
  ".synapse/data/"
)

add_to_gitignore() {
  local entry="$1"
  if [ ! -f "$GITIGNORE" ] || ! grep -qF "$entry" "$GITIGNORE"; then
    echo "$entry" >> "$GITIGNORE"
  fi
}

for entry in "${ENTRIES[@]}"; do
  add_to_gitignore "$entry"
done
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node` in hook commands | `bun` in hook commands | Phase 15 (FOUND-03) | Hook paths must use `bun`, never `node` |
| Relative hook paths | `$CLAUDE_PROJECT_DIR`-prefixed paths | Phase 15 (FOUND-03) | Silent hook failures outside repo root fixed |
| `packages/framework/hooks/` | `.claude/hooks/` for installed projects | Phase 22 (this phase) | Installed projects have self-contained `.claude/` |
| `packages/server/src/index.ts` | `.claude/server/src/index.ts` for installed | Phase 22 (this phase) | Each project gets its own server copy |
| Manual copy from monorepo | `bash install.sh` one-liner | Phase 22 (this phase) | User onboarding reduces to single command |

**Deprecated/outdated:**
- `settings.template.json` hook paths (use `node`, relative paths): These are for the monorepo dev layout only. install.sh generates fresh settings.json with `bun` and `$CLAUDE_PROJECT_DIR/.claude/hooks/` paths — never uses the template directly.

---

## Open Questions

1. **Release Tarball URL Pattern**
   - What we know: GitHub remote is `git@github.com:kvdeurzen/synapse.git`; existing tags are `v1.0`, `v2.0`
   - What's unclear: The auto-generated GitHub tarball URL would be `https://github.com/kvdeurzen/synapse/archive/refs/tags/v3.0.tar.gz` — but the install.sh entry point from the CONTEXT says `raw.githubusercontent.com`. These are two different mechanisms.
   - Recommendation: Use GitHub auto-generated release tarball (`/archive/refs/tags/TAG.tar.gz`) — no GitHub Actions workflow needed to create a custom tarball. Alternatively, for development/testing, install.sh can accept a `--local` flag that uses the current directory instead of downloading.

2. **Global vs Local Install Mode Detection**
   - What we know: Two modes exist (global to `~/.synapse/`, local to current project); CONTEXT marks detection mechanism as Claude's discretion
   - What's unclear: Whether to use a `--global`/`--local` flag or an interactive prompt
   - Recommendation: Use `--local` flag that defaults to local-only install (no `~/.synapse/`). If no flag, default to local. Add `--global` flag for users who want to cache the release once. This avoids an interactive prompt that breaks `curl | bash` piped usage.

3. **Server Path in Installed .mcp.json**
   - What we know: The server is "always copied per project" and lives at `.claude/server/src/index.ts` in installed projects
   - What's unclear: The server has a `postinstall` script that runs `node scripts/setup-tree-sitter.js` for native tree-sitter binaries — does copying files preserve the native binaries?
   - Recommendation: Investigate whether `packages/server/node_modules/` must also be copied, or whether install.sh should run `bun install` in `.claude/server/` after copying. The native tree-sitter binaries (`tree-sitter-typescript`, `tree-sitter-python`, `tree-sitter-rust`) are built during `bun install` and are not pure JS — they likely need `bun install` to run in the destination. This is a **HIGH RISK** item for INST-02.

4. **Smoke Test Server Path**
   - What we know: smoke-test.mjs spawns `bun run <serverPath> --db <tmpDir>`
   - What's unclear: During install.sh smoke test, the server files have already been copied to `.claude/server/` — should smoke test use the freshly-copied server or the source tarball?
   - Recommendation: Smoke test should use the freshly-installed `.claude/server/src/index.ts` — this validates that the copy succeeded and the installed server works, not just the source.

---

## Key Codebase Facts (Confirmed by Inspection)

### File Counts (Confirmed)
- Agents: 11 `.md` files in `packages/framework/agents/`
- Hooks: 7 `.js` files in `packages/framework/hooks/` + `lib/` directory (resolve-config.js, resolve-config.test.js)
- Commands: 5 `.md` files in `packages/framework/commands/synapse/`
- Skills: 18 directories in `packages/framework/skills/`
- Config templates: 4 files in `packages/framework/config/` (agents.toml, secrets.toml.template, synapse.toml, trust.toml)

### Settings Template vs Generated Output
- `settings.template.json` uses `node packages/framework/hooks/...` — this is for the MONOREPO only
- Installed projects must use `bun $CLAUDE_PROJECT_DIR/.claude/hooks/...`
- The `test_project/.claude/settings.json` (uses `bun $CLAUDE_PROJECT_DIR/../packages/framework/hooks/`) is a dev-time example showing the `$CLAUDE_PROJECT_DIR` pattern in action — install.sh generates the installed-layout version

### Server Configuration Precedence
```
CLI args (--db, --log-level) > SYNAPSE_DB_PATH env > synapse.toml > defaults
OLLAMA_URL env > synapse.toml > default (http://localhost:11434)
```
Source: `packages/server/src/config.ts`

### Ollama Health Check Endpoint
- `GET http://localhost:11434/api/tags` — returns JSON with model list
- Check for `"nomic-embed-text"` in the response
- This is used in `packages/framework/commands/synapse/map.md` and the `/synapse:map` command

### .gitignore Note
- `settings.json` is in the Synapse repo's own `.gitignore` — correct behavior, generated settings should not be committed
- `.synapse/` is gitignored at the monorepo root — but target projects will gitignore `.synapse/data/` (the DB) while keeping `.synapse/config/` committed

---

## Sources

### Primary (HIGH confidence)
- `/home/kanter/code/synapse/packages/framework/test/helpers/synapse-client.ts` — MCP stdio JSON-RPC protocol, tool call pattern, initialization handshake
- `/home/kanter/code/synapse/packages/server/test/smoke.test.ts` — Bun.spawn server subprocess pattern, timeout handling
- `/home/kanter/code/synapse/test_project/.claude/settings.json` — canonical hook path format with `$CLAUDE_PROJECT_DIR` prefix
- `/home/kanter/code/synapse/packages/framework/settings.template.json` — hook structure template (requires path translation for installed layout)
- `/home/kanter/code/synapse/packages/server/src/config.ts` — server config precedence (CLI > env > toml > defaults)
- `/home/kanter/code/synapse/.planning/phases/22-install-script/22-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- Ollama HTTP API `/api/tags` endpoint — verified by running `ollama list` on machine (Ollama 0.17.4 running, `nomic-embed-text` installed); HTTP endpoint is standard Ollama REST API
- GitHub auto-tarball pattern `github.com/OWNER/REPO/archive/refs/tags/TAG.tar.gz` — standard GitHub feature, not custom workflow needed

### Tertiary (LOW confidence)
- Native tree-sitter binaries and `bun install` requirement for installed server — needs verification; install.sh may need to run `bun install` in `.claude/server/` after copying. Risk: tree-sitter postinstall compiles native binaries. Recommend investigation as Wave 0 task.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — bun/bash/curl/tar all confirmed present on machine; MCP JSON-RPC protocol confirmed from codebase
- Architecture: HIGH — file structure confirmed by codebase scan; hook path pattern confirmed from test_project; JSON merge via bun confirmed viable
- Pitfalls: HIGH — duplicate hooks (testable), wrong paths (confirmed from Phase 15 history), MCP handshake order (confirmed from synapse-client.ts)
- Open Questions: MEDIUM — release tarball URL and global/local detection are Claude's discretion per CONTEXT.md; tree-sitter native binary concern is LOW (needs investigation)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain — bash scripting + MCP protocol don't change rapidly)
