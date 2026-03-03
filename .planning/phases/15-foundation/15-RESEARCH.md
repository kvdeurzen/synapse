# Phase 15: Foundation - Research

**Researched:** 2026-03-03
**Domain:** Claude Code hook internals, TOML config schema, ESM path resolution, hook command path wiring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**project.toml Schema**
- Single config file at `.synapse/config/project.toml` replaces both project config AND `synapse.toml` server config
- `[project]` section: `project_id` (lowercase slug), `name` (human-readable), `skills` (array), `created_at` (ISO timestamp)
- `[server]` section: full MCP config including `db`, `ollama_url`, `embed_model`, `transport`, `command`, `args` — eliminates separate synapse.toml
- Domain modes stay in `trust.toml` (separate concern: identity vs autonomy rules)
- Skills must be validated against existing SKILL.md files — warn/error if no matching SKILL.md exists
- Startup hook validates project.toml on session start: checks project_id format and required fields, fails early with clear error if malformed
- Git policy: project.toml is committed (shared identity). A `.synapse/config/local.toml` (gitignored) provides section-scoped overrides — only `[server]` section can be overridden, `[project]` section is always from project.toml
- When project.toml doesn't exist: hard fail with error directing user to run `/synapse:init`

**project_id Injection**
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

**Config Resolution Order**
- Shared utility function `resolveConfig(filename)` in `packages/framework/hooks/lib/resolve-config.js` — all hooks import it
- Resolution order: 1) `.synapse/config/` (walk up directory tree), 2) `packages/framework/config/` (monorepo dev fallback), 3) relative to hook file location
- Walk-up behavior: search current dir, then parent, then grandparent, etc. until `.synapse/config/` is found or filesystem root reached (git-style)
- Stop at first match — no merging configs from multiple locations
- audit-log.js uses the shared resolver to find `.synapse/` directory, then writes `.synapse-audit.log` in the same parent directory (always project root regardless of launch dir)

**Hook Path Strategy**
- settings.json references hooks directly from `packages/framework/hooks/` — no copy or symlink needed
- Paths use `$CLAUDE_PROJECT_DIR` prefix: `"bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/tier-gate.js"`
- Use `bun` (not `node`) to run hook files — consistent with CLAUDE.md, handles ESM natively
- Phase 15 updates the actual `.claude/settings.json` in this repo with new Synapse hook references — hooks work immediately for monorepo development

### Claude's Discretion
- Exact structured context block formatting and delimiters
- Error message wording for validation failures
- Internal implementation of walk-up directory search algorithm
- Whether resolveConfig returns the path or the parsed content

### Deferred Ideas (OUT OF SCOPE)
- Full SKILL.md content injection into agent context — Phase 19
- Dynamic skill-to-agent mapping from project.toml — Phase 19
- Agent prompt updates to reference project_id — Phase 18
- E2E verification that startup hook fires for subagents — Phase 21
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | project.toml schema defined with project_id, name, skills, and created_at fields | `smol-toml` parses `[project]` and `[server]` sections correctly (verified). Schema mirrors the `ProjectIdSchema` regex already used by server tools. `stringify` works for generating the file in Phase 16. |
| FOUND-02 | synapse-startup.js reads project.toml and injects project_id into session context | `additionalContext` field in SessionStart hook response is the correct injection mechanism (confirmed by Phase 14 research). Walk-up resolver finds `.synapse/config/project.toml` before the existing fallback roots. Validated injection block format specified in CONTEXT.md. |
| FOUND-03 | All hook command paths use `$CLAUDE_PROJECT_DIR` prefix instead of relative paths | `.claude/settings.json` must be updated. Claude Code resolves `$CLAUDE_PROJECT_DIR` at hook invocation time as the directory containing `.claude/`. Both `$CLAUDE_PROJECT_DIR` in the command string and `process.env.CLAUDE_PROJECT_DIR` inside the hook process are populated. PITFALLS.md documents this as a confirmed fix for GitHub issues #3583 and #10367. |
| FOUND-04 | tier-gate.js, tool-allowlist.js, and precedent-gate.js resolve config from `.synapse/config/` first with monorepo fallback | All three hooks currently use `path.join(process.cwd(), 'packages/framework/config/...')` — a hardcoded path that fails when cwd is not the repo root. Shared `resolveConfig()` utility with walk-up logic extracts this concern once and fixes all three hooks. |
</phase_requirements>

---

## Summary

Phase 15 is a wiring and schema phase with no new external dependencies. Every piece of the implementation builds on code that already exists in the repo. The startup hook (`synapse-startup.js`) already reads TOML config files using `smol-toml` and already injects `additionalContext`. The three gate hooks (`tier-gate.js`, `tool-allowlist.js`, `precedent-gate.js`) already read TOML files — they just read them from wrong paths. The audit log hook (`audit-log.js`) already writes to `process.cwd()` — it just needs to walk up to find the project root instead.

The two plans map cleanly: 15-01 is the data model work (define the schema, update the startup hook to read it and inject project_id), and 15-02 is the infrastructure work (create the `resolveConfig` utility, update the three gate hooks to use it, update `.claude/settings.json` with `$CLAUDE_PROJECT_DIR` paths). Both plans are independent enough to proceed in either order, but 15-01 should go first because the resolver utility in 15-02 needs to know what files to look for (which comes from the schema definition in 15-01).

**Primary recommendation:** Extract `resolveConfig(filename)` as the core primitive first, then update all hooks to use it. Every other change in this phase is additive on top of that utility.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `smol-toml` | latest (peer dep in package.json) | Parse `project.toml`, `trust.toml`, `agents.toml` | Already used by `synapse-startup.js` and all gate hooks; `parse()` and `stringify()` both work as needed (verified) |
| `node:fs` | built-in | File system access for walk-up search | Used in all existing hooks; sync `fs.existsSync` and `fs.readFileSync` are correct for synchronous hook scripts |
| `node:path` | built-in | Path joining and normalization | Used in all existing hooks |
| `node:url` | built-in | `import.meta.url` → `__dirname` equivalent | Pattern already used in `synapse-startup.js` for self-location |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `process.env.CLAUDE_PROJECT_DIR` | runtime env var | Project root inside hook runtime | Available to hook processes; use as a fast-path in resolveConfig before doing the walk-up search |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Walk-up directory search | Single hardcoded `SYNAPSE_ROOT` env var | Walk-up matches the git mental model; env var requires install-time config that Phase 17 hasn't done yet |
| `smol-toml` parse | JSON for config | TOML is already the established format for all framework config files; switching to JSON here would be inconsistent |
| Returning resolved path from `resolveConfig` | Returning parsed content | Returning the path is more flexible — callers parse it with their own error handling; also allows callers to derive the directory for adjacent files (e.g., audit log writes `.synapse-audit.log` next to the `.synapse/` dir) |

**Installation:** No new packages needed. `smol-toml` is already a peer dependency.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/framework/hooks/
├── lib/
│   └── resolve-config.js     # NEW: shared walk-up resolver utility
├── synapse-startup.js         # MODIFIED: reads project.toml, injects project_id
├── tier-gate.js               # MODIFIED: uses resolveConfig instead of process.cwd()
├── tool-allowlist.js          # MODIFIED: uses resolveConfig instead of process.cwd()
├── precedent-gate.js          # MODIFIED: advisory; currently has no config read, no change needed
├── audit-log.js               # MODIFIED: uses resolveConfig to find .synapse/ root for log path
└── synapse-audit.js           # UNMODIFIED: already correct (Synapse-MCP-only audit variant)

.synapse/
└── config/
    └── project.toml           # NEW: schema definition (written by Phase 16 /synapse:init)

.claude/
└── settings.json              # MODIFIED: adds Synapse hook entries with $CLAUDE_PROJECT_DIR paths
```

### Pattern 1: ESM Self-Location (`import.meta.url` as `__dirname`)

**What:** In ESM `.js` files, `__dirname` is not available. The standard replacement is:
```js
const __dirname = path.dirname(new URL(import.meta.url).pathname);
```
**When to use:** Any hook that needs to resolve paths relative to its own file location, not `process.cwd()`.

`synapse-startup.js` already uses this pattern (line 47: `path.dirname(new URL(import.meta.url).pathname)`). The new `resolve-config.js` utility should use it as its baseline "hook location" fallback.

```js
// Source: existing synapse-startup.js line 47
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

Note: `fileURLToPath` is cleaner than `new URL(...).pathname` for Windows compatibility, though both work on Linux.

### Pattern 2: Walk-Up Directory Search (git-style)

**What:** Search for a config directory starting from `cwd`, walking up to the filesystem root. Stop at the first match.
**When to use:** Finding `.synapse/config/` regardless of where Claude Code was launched from.

```js
// Conceptual implementation — internal details at Claude's discretion
function findSynapseConfigDir(startDir) {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, '.synapse', 'config');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null; // reached filesystem root
    current = parent;
  }
}
```

The stop condition (`parent === current`) is the standard way to detect filesystem root — `path.dirname('/')` returns `'/'`.

### Pattern 3: `resolveConfig(filename)` Return Value

**What:** The shared utility returns the full path to the config file, not its parsed content.
**Why:** Callers have different error handling needs (fail-closed vs. fail-open). Returning the path lets each hook decide how to handle parse errors per its own semantics.

```js
// resolve-config.js exports this function
export function resolveConfig(filename) {
  // 1. Walk up from process.env.CLAUDE_PROJECT_DIR or process.cwd()
  // 2. Try packages/framework/config/ relative to __dirname
  // 3. Return absolute path string, or null if not found
}
```

**Caller pattern** (tier-gate.js after update):
```js
import { resolveConfig } from './lib/resolve-config.js';

const trustPath = resolveConfig('trust.toml');
if (!trustPath) {
  process.stdout.write(denyOutput('DENIED: trust.toml not found. Denying as fail-closed precaution.'));
  process.exit(0);
}
const trustConfig = parse(fs.readFileSync(trustPath, 'utf8'));
```

### Pattern 4: SessionStart `additionalContext` Injection

**What:** The `additionalContext` field in a SessionStart hook response injects text into the agent's initial context for the session.
**When to use:** Injecting project_id, project name, and active skills names.

```js
// SessionStart hook output structure (verified from Phase 14 research and existing hooks)
const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: '... injected text ...',
  },
};
process.stdout.write(JSON.stringify(output));
```

The current `synapse-startup.js` already uses this exact pattern. Phase 15 adds project_id injection to the existing `additionalContext` string.

### Pattern 5: `.claude/settings.json` Hook Registration with `$CLAUDE_PROJECT_DIR`

**What:** Hook command strings in `.claude/settings.json` use `$CLAUDE_PROJECT_DIR` as a prefix so they resolve correctly regardless of where Claude Code is launched.
**When to use:** Every Synapse hook registration.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/synapse-startup.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/tier-gate.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/tool-allowlist.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/precedent-gate.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/audit-log.js"
          }
        ]
      }
    ]
  }
}
```

Note: The existing `.claude/settings.json` in this repo uses `node` for GSD hooks. The Synapse hooks use `bun` per CLAUDE.md. Both can coexist — they are separate hook entries.

### Anti-Patterns to Avoid

- **`path.join(process.cwd(), 'packages/framework/config/...')`**: This is the current bug in all three gate hooks. `process.cwd()` is the Claude Code launch directory, not the repo root. Replace with `resolveConfig()`.
- **Silent failure when project.toml missing**: The CONTEXT.md decision is hard fail with a clear error message directing the user to `/synapse:init`. Do not silently degrade to "no project context."
- **Merging configs from multiple locations**: Stop at first match. Merging `.synapse/config/trust.toml` with `packages/framework/config/trust.toml` creates unpredictable behavior.
- **Loading project.toml inside the gate hooks**: Only the startup hook reads `project.toml`. The gate hooks read `trust.toml` and `agents.toml` only. Keeping concerns separated prevents one missing file from breaking everything.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parsing | Custom regex parser | `smol-toml` `parse()` | Already a peer dep; handles arrays, sections, strings, dates. Verified working for the full project.toml schema (tested in research). |
| project_id validation | Custom regex in startup hook | Reuse `^[a-z0-9][a-z0-9_-]*$` regex already defined in server's `init-project.ts` | Identical regex used in 15+ server tool schemas. Write it once in the startup hook to match. |
| TOML generation (Phase 16 will need it) | String template with manual escaping | `smol-toml` `stringify()` | `stringify()` is available and produces correctly formatted TOML (verified). Note the SUMMARY.md caution about preserving comments — use string templates only if comment preservation is required. |

**Key insight:** This phase has zero new dependencies. Every tool it needs is already in the codebase or is a Node.js built-in.

---

## Common Pitfalls

### Pitfall 1: `process.cwd()` as Config Root (Current Bug in All Three Gate Hooks)

**What goes wrong:** `tier-gate.js` line 68 reads `path.join(process.cwd(), 'packages/framework/config/trust.toml')`. When Claude Code is launched from a subdirectory (e.g., from inside `packages/server/`), `process.cwd()` is not the repo root, so the path resolves to a non-existent file. `tier-gate.js` is fail-closed, so it denies every `store_decision` call. The hook fires but appears broken — agents see `DENIED: Failed to load trust.toml configuration` on every decision.

**Why it happens:** The hooks were written assuming the repo root is always the cwd. This is true for monorepo development but breaks for any other launch directory.

**How to avoid:** Replace all `path.join(process.cwd(), 'packages/framework/config/...')` calls with `resolveConfig('trust.toml')` or `resolveConfig('agents.toml')`.

**Warning signs:** `.synapse-audit.log` is written (audit hook fires) but all `store_decision` calls are denied despite valid tier authority. `DENIED: Failed to load trust.toml` in Claude Code output.

### Pitfall 2: `$CLAUDE_PROJECT_DIR` in settings.json vs. `process.env.CLAUDE_PROJECT_DIR` in Hook Scripts

**What goes wrong:** `$CLAUDE_PROJECT_DIR` in the `command` string is expanded by Claude Code's shell before running the hook. Inside the hook script, the same value is available as `process.env.CLAUDE_PROJECT_DIR`. These are two different things. The command string expansion is automatic; the env var access inside the script requires explicit use.

**How to avoid:** In `resolve-config.js`, use `process.env.CLAUDE_PROJECT_DIR` as the preferred walk-up start point (it's the project root directly, skipping the walk). Fall back to `process.cwd()` if it's unset.

```js
const startDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
```

**Why this matters:** When `CLAUDE_PROJECT_DIR` is available, the walk-up terminates immediately (first check finds `.synapse/config/` right there). Without it, the walk-up has to traverse up from wherever `cwd` happens to be.

### Pitfall 3: Hard Fail vs. Silent Degradation for Missing project.toml

**What goes wrong:** The CONTEXT.md decision is explicit: when `project.toml` doesn't exist, the startup hook must hard fail with a clear error directing the user to run `/synapse:init`. However, the existing `synapse-startup.js` wraps everything in a top-level try/catch that does `process.exit(0)` on any error — silently swallowing the failure.

**How to avoid:** The missing-project.toml case must be handled inside the try block with an explicit error response, not caught by the outer catch. The startup hook should output a message via `process.stderr` and exit non-zero (or emit a special `additionalContext` instructing the agent to tell the user to run `/synapse:init`).

**Warning signs:** Session starts normally with no error, but agent has no project_id context and immediately fails on the first MCP tool call.

### Pitfall 4: Skills Validation Against Non-Existent SKILL.md Files

**What goes wrong:** The project.toml `skills` array contains skill names. The startup hook must validate these against existing SKILL.md files. But during Phase 15, there is no `.claude/skills/` directory in this repo (verified: directory does not exist). The hook will warn about every skill listed.

**How to avoid:** The validation should be a warning, not an error (the CONTEXT.md says "warn/error" — favor warn for missing SKILL.md to avoid blocking sessions during development). Log the warning to stderr. The hook continues with the skill names listed in `additionalContext` regardless of whether SKILL.md exists.

**Where to look for SKILL.md files:** The hook should search `.claude/skills/{skill-name}/SKILL.md` relative to the `.synapse/config/` directory's grandparent (i.e., the project root).

### Pitfall 5: `precedent-gate.js` Does Not Read Config Files

**What goes wrong:** `precedent-gate.js` is advisory and does not read any config files. It has no `path.join(process.cwd(), ...)` calls. It does not need to be updated for config resolution. Including it in the resolveConfig migration would be a no-op refactor that adds complexity with no benefit.

**How to avoid:** Only update `tier-gate.js`, `tool-allowlist.js`, and `audit-log.js`. Leave `precedent-gate.js` as-is.

### Pitfall 6: ESM Import of `resolve-config.js` Requires `.js` Extension

**What goes wrong:** All hook files are ESM with `"type": "module"` in the framework `package.json`. ESM requires explicit `.js` extensions on relative imports. `import { resolveConfig } from './lib/resolve-config'` will fail with `ERR_MODULE_NOT_FOUND`.

**How to avoid:** Always include `.js` in the import path:
```js
import { resolveConfig } from './lib/resolve-config.js';
```

### Pitfall 7: `smol-toml` `created_at` Field Returns a Date Object, Not a String

**What goes wrong:** TOML has a native datetime type. If `created_at` in project.toml is written as a bare datetime literal (`created_at = 2026-03-03T00:00:00Z`), `smol-toml` parses it as a `TomlDate` object, not a string. Calling `.toString()` on it works, but string interpolation needs awareness of this.

**How to avoid:** In project.toml, write `created_at` as a quoted string (`created_at = "2026-03-03T00:00:00Z"`) to ensure it parses as a JavaScript string. When `/synapse:init` writes project.toml in Phase 16, it should use `stringify()` with the string value, not a Date object.

**Verified:** `smol-toml` correctly parses `created_at = "2026-03-03T00:00:00Z"` (with quotes) as a plain string (tested during research).

---

## Code Examples

Verified patterns from official sources and direct codebase inspection:

### project.toml Schema (Full)

```toml
# .synapse/config/project.toml
# Committed to git — this is the project's shared identity.
# Use local.toml for machine-specific [server] overrides.

[project]
project_id = "my-project"
name = "My Project"
skills = ["typescript", "bun"]
created_at = "2026-03-03T00:00:00Z"

[server]
db = "/home/user/.synapse/my-project.db"
ollama_url = "http://localhost:11434"
embed_model = "nomic-embed-text"
transport = "stdio"
command = "bun"
args = ["run", "/path/to/synapse/packages/server/src/index.ts"]
```

### project_id Validation (Reuse from Server)

```js
// Same regex used across 15+ server tool schemas
const PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9_-]*$/;

function validateProjectId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('project_id is required');
  }
  if (!PROJECT_ID_REGEX.test(id)) {
    throw new Error(
      `project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric). Got: "${id}"`
    );
  }
}
```

### resolveConfig Utility (Conceptual)

```js
// packages/framework/hooks/lib/resolve-config.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the path to a config file using priority-ordered search.
 * Returns the absolute path to the first match, or null if not found.
 *
 * Search order:
 * 1. Walk up from CLAUDE_PROJECT_DIR (or cwd) looking for .synapse/config/{filename}
 * 2. packages/framework/config/{filename} relative to this file's location (monorepo dev)
 */
export function resolveConfig(filename) {
  // 1. Walk-up search for .synapse/config/
  const startDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let current = startDir;
  while (true) {
    const candidate = path.join(current, '.synapse', 'config', filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root reached
    current = parent;
  }

  // 2. Monorepo dev fallback: packages/framework/config/ relative to lib/
  const monorepoCandidate = path.join(__dirname, '..', '..', 'config', filename);
  if (fs.existsSync(monorepoCandidate)) return monorepoCandidate;

  return null;
}
```

### Startup Hook project.toml Reading (Conceptual)

```js
// In synapse-startup.js, inside the try block for tier context:
const projectTomlPath = resolveConfig('project.toml');

if (!projectTomlPath) {
  // Hard fail — direct user to /synapse:init
  process.stderr.write('[synapse-startup] ERROR: .synapse/config/project.toml not found. Run /synapse:init to set up this project.\n');
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'ERROR: Synapse project not initialized. Run /synapse:init to create project.toml before using Synapse MCP tools.',
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

const projectToml = parseToml(fs.readFileSync(projectTomlPath, 'utf8'));
const project = projectToml.project || {};
const projectId = project.project_id || '';

// Validate project_id format
validateProjectId(projectId); // throws on malformed — caught by outer catch

const projectName = project.name || projectId;
const skills = Array.isArray(project.skills) ? project.skills : [];

// Inject structured context block
const projectContext = [
  '─── SYNAPSE PROJECT CONTEXT ───',
  `project_id: ${projectId}`,
  `name: ${projectName}`,
  `skills: ${skills.join(', ') || '(none)'}`,
  '────────────────────────────────',
  `IMPORTANT: Always include project_id: "${projectId}" in every Synapse MCP tool call.`,
].join('\n');
```

### audit-log.js Path Fix (Conceptual)

```js
// Current (broken): uses process.cwd() which varies by launch directory
const logPath = path.join(process.cwd(), '.synapse-audit.log');

// Fixed: walk up to find .synapse/ dir, write log in its parent
const synapseConfigPath = resolveConfig('project.toml'); // finds .synapse/config/project.toml
const projectRoot = synapseConfigPath
  ? path.dirname(path.dirname(path.dirname(synapseConfigPath))) // .synapse/config/ → .synapse/ → project root
  : process.cwd(); // fallback if no project.toml yet
const logPath = path.join(projectRoot, '.synapse-audit.log');
```

### Updated settings.json (Synapse hooks added)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/gsd-check-update.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/synapse-startup.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/tier-gate.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/tool-allowlist.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/precedent-gate.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/gsd-context-monitor.js"
          },
          {
            "type": "command",
            "command": "bun $CLAUDE_PROJECT_DIR/packages/framework/hooks/audit-log.js"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/gsd-statusline.js"
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.cwd()` for config resolution | Walk-up from `CLAUDE_PROJECT_DIR` or cwd | Phase 15 | Hooks work from any launch directory, not just repo root |
| Separate `synapse.toml` for server config | `project.toml` `[server]` section consolidates everything | Phase 15 | Single source of truth; simpler mental model for users |
| No project_id injection | `additionalContext` injection from startup hook | Phase 15 | Agents never need to ask for or discover project_id |
| Relative hook paths in settings.json | `$CLAUDE_PROJECT_DIR`-prefixed paths | Phase 15 | Hooks fire correctly regardless of Claude Code launch directory |
| Each gate hook resolves config independently | Shared `resolveConfig()` utility | Phase 15 | DRY; one fix covers all hooks; consistent resolution order |

**Deprecated/outdated:**
- `packages/framework/config/synapse.toml`: Superseded by `.synapse/config/project.toml [server]` section. The monorepo copy remains as a template/fallback reference during Phase 15 development but will be retired once `/synapse:init` is implemented in Phase 16.

---

## Open Questions

1. **Where does `resolveConfig` look for `trust.toml` and `agents.toml` in a deployed (non-monorepo) project?**
   - What we know: The resolution order is `.synapse/config/` first, then `packages/framework/config/` (monorepo fallback). In a deployed project where the user has installed Synapse separately, `packages/framework/` does not exist at their project root.
   - What's unclear: Should `trust.toml` and `agents.toml` be copied into `.synapse/config/` by the install script (Phase 17), or should they remain in the Synapse repo and be referenced by absolute path?
   - Recommendation: For Phase 15, the monorepo fallback is sufficient — this is the monorepo dev phase. Phase 17 (install script) must decide whether to copy these files or embed their path into a env variable. Flag this as a Phase 17 dependency.

2. **Does the startup hook's hard fail on missing project.toml create a problem for new Claude Code sessions before `/synapse:init` is run?**
   - What we know: The CONTEXT.md says hard fail. But new users who haven't run init yet will see an error on every session start.
   - What's unclear: Is the error shown in the UI as a blocking dialog or as logged output?
   - Recommendation: Hard fail via `additionalContext` message (the agent tells the user) is less disruptive than `process.exit(1)`. The agent saying "Run /synapse:init to set up this project" is helpful UX. Error to stderr + graceful context output is the right balance.

3. **Does `audit-log.js` or `synapse-audit.js` take precedence post-Phase 14?**
   - What we know: Both files exist. `audit-log.js` logs ALL tool calls. `synapse-audit.js` logs only `mcp__synapse__*` calls. Phase 14 delivered `audit-log.js` as the expanded audit hook.
   - What's unclear: Should `synapse-audit.js` be removed or kept as a redundant narrower logger?
   - Recommendation: Use `audit-log.js` in settings.json (the comprehensive one). Leave `synapse-audit.js` in place but do not register it — it's a historical artifact that can be cleaned up in Phase 20 (tech debt).

---

## Validation Architecture

Skipped — `workflow.nyquist_validation` is not enabled in `.planning/config.json`.

Manual verification for success criteria:

1. **FOUND-01:** A `.synapse/config/project.toml` file with `project_id`, `name`, `skills`, and `created_at` fields parses without error through `smol-toml`. Verify: create the file manually, run `bun -e "import { parse } from 'smol-toml'; console.log(parse(require('fs').readFileSync('.synapse/config/project.toml','utf8')))"` and confirm all fields present.

2. **FOUND-02:** Start a new Claude Code session. The startup hook injects the SYNAPSE PROJECT CONTEXT block. Verify: check session opening context — it should contain `project_id: {id}` and the IMPORTANT instruction line.

3. **FOUND-03:** Launch Claude Code from a subdirectory (e.g., `cd packages/server && claude`). Make a Synapse MCP tool call. Verify: `.synapse-audit.log` is written at the project root.

4. **FOUND-04:** Launch Claude Code from a subdirectory. Attempt to call `mcp__synapse__store_decision` with tier 1 as `executor`. Verify: hook correctly denies with `DENIED: executor cannot store Tier 1 decisions` (not `DENIED: Failed to load trust.toml`).

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `packages/framework/hooks/synapse-startup.js`, `tier-gate.js`, `tool-allowlist.js`, `precedent-gate.js`, `audit-log.js`, `synapse-audit.js` — full file reads
- Direct codebase inspection — `packages/framework/config/synapse.toml`, `trust.toml`, `agents.toml` — full file reads
- Direct codebase inspection — `packages/server/src/tools/init-project.ts` — ProjectIdSchema regex `^[a-z0-9][a-z0-9_-]*$` confirmed
- Direct codebase inspection — `packages/framework/package.json` — `smol-toml` is a peer dependency
- smol-toml runtime verification — `parse()` tested with full project.toml schema; `stringify()` tested with same document; both work correctly (executed during research)
- `.planning/research/PITFALLS.md` (first-party) — Pitfall 1 and Pitfall 5 directly address FOUND-03 and FOUND-04; GitHub issues #3583 and #10367 cited as confirming sources
- `.planning/phases/15-foundation/15-CONTEXT.md` — locked decisions, schema, resolution order

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` (first-party) — architecture approach and technology stack; consistent with codebase inspection
- `.planning/milestones/v2.0-phases/14-quality-gates-and-pev-workflow/14-RESEARCH.md` — hook output structure patterns verified for Phase 14; SessionStart `additionalContext` injection confirmed

### Tertiary (LOW confidence)

- None — all critical claims verified against codebase or first-party research documents

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tools verified in existing codebase
- Architecture: HIGH — all four patterns exist in current hook files; research is extraction and extension, not invention
- Pitfalls: HIGH — Pitfalls 1-4 confirmed by codebase inspection; Pitfalls 5-7 confirmed by file reads; prior PITFALLS.md research provides GitHub issue backing for hook path resolution bug

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain — Node.js built-ins, smol-toml, Claude Code hook API)
