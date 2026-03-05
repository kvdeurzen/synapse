# Phase 16: User Journey Commands - Research

**Researched:** 2026-03-05
**Domain:** Claude Code slash commands (markdown), hook authoring (ESM JS), TOML config authoring, MCP tool integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Process Model: Recursive RPEV**
- The process is a recursive Refine-Plan-Execute-Validate loop at every hierarchy level (Project → Epic → Feature → Work Package), replacing the linear pipeline model
- Decisions only happen in Refine or Plan stages — Execute and Validate follow the plan
- The user's primary interaction is Refine (brainstorming + decisions); Plan, Execute, and Validate are system-driven
- Core interaction model: "System drives, user unblocks" — system works on highest-priority unblocked items, surfaces decision moments to the user
- Reference document: `.planning/brainstorm output/recursive-rpev-model.md`

**Command Set: Five user-facing commands**
1. `/synapse:init` — Project setup with interactive RPEV configuration; creates project.toml, calls init_project, offers opt-in CLAUDE.md amendment; seeds trust.toml with per-layer involvement gradient
2. `/synapse:map` — Codebase indexing with Ollama health check and progress feedback (same scope as CMD-02)
3. `/synapse:refine` — Primary user interaction (Refine stage of RPEV); works at any hierarchy level; brainstorm agent tracks DECIDED/OPEN/EMERGING decisions; stores refinement state via `store_document`
4. `/synapse:status` — Full dashboard view with epics in priority order, blocked items, agent pool activity (stubbed), recent decisions
5. `/synapse:focus` — Navigate to specific items by name (semantic fuzzy) or path shorthand (2.3.1); agent-based focus deferred

**No /synapse:plan or /synapse:execute** — planning is system-driven, execution is auto-queued

**Replacing /synapse:new-goal** — deleted and replaced by `/synapse:refine`; `/synapse:status` evolved from existing status command

**Notification Model** — statusline stub in Phase 16 (blocked-item counter); full implementation in Visibility + Notifications phase

**Audience** — developer adopting Synapse; two use cases: new project with Synapse, or adding Synapse to existing project

**User Journey Documentation** — included in Phase 16, written based on the RPEV model vision

### Claude's Discretion
- /synapse:map progress feedback format and Ollama-not-running error handling
- /synapse:init project name auto-detection strategy
- Exact stubbing approach for features that depend on later phases (RPEV engine, agent pool)
- Internal implementation of fuzzy name matching for /synapse:focus

### Deferred Ideas (OUT OF SCOPE)
- Agent-based focus mode (`/synapse:focus agent C`) — deferred to Agent Pool phase
- Agent pool activity display in /synapse:status — stubbed until Agent Pool phase
- Proactive push notifications — implementation deferred to Visibility + Notifications phase; trust config option seeded by /synapse:init
- Detailed readiness criteria validation — the command stubs readiness checks; full level-aware readiness gating lands in RPEV Orchestration phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CMD-01 | `/synapse:init` command creates project.toml, calls init_project, offers opt-in CLAUDE.md amendment | Slash command pattern + project.toml schema documented; init_project MCP tool signature verified |
| CMD-02 | `/synapse:map` command wraps index_codebase with Ollama health check and progress feedback | index_codebase tool signature verified; OllamaUnreachableError already exists server-side |
| CMD-03 | `/synapse:plan` command — evolved to `/synapse:refine`; connects user to RPEV Refine stage with project context wired | Refinement state via store_document; brainstorm agent DECIDED/OPEN/EMERGING state model documented |
| CMD-04 | User journey from install to ongoing use documented as step-by-step flow | RPEV model + command set documented; user journey doc authoring pattern identified |
</phase_requirements>

---

## Summary

Phase 16 builds five slash commands that form every user touchpoint with Synapse: `init`, `map`, `refine`, `status`, and `focus`. These commands are markdown files following the established pattern in `packages/framework/commands/synapse/`. The implementation is primarily authoring work — writing clear procedural instructions that the AI agent executes — rather than code changes, though `/synapse:init` requires creating project.toml and trust.toml files programmatically.

The key design challenge is **stubbing correctly for later phases**. The RPEV orchestration engine (Phase 18), level-aware agent behavior (Phase 19), and agent pool (Phase 21) don't exist yet. Phase 16 commands must work meaningfully without those systems — `/synapse:refine` runs as a conversational brainstorm session that persists state to Synapse DB; `/synapse:status` shows what the task tree actually contains today; `/synapse:focus` navigates the task tree via semantic search.

The brainstorm skill (`/.claude/skills/brainstorm/SKILL.md`) already encodes the collaborative thinking partner pattern — `/synapse:refine` extends it with Synapse-specific decision tracking (DECIDED/OPEN/EMERGING states), persistence via `store_document`, and level-aware readiness criteria. The `store_document` and `check_precedent` MCP tools provide the persistence substrate.

**Primary recommendation:** Author all five command files as step-by-step procedural markdown with clear MCP tool sequences. Delete `new-goal.md`, evolve `status.md`. For `/synapse:init`, write the project.toml + trust.toml templates inline in the command instructions. Stub all Phase 18+ features with explicit placeholders that explain what will change.

---

## Standard Stack

### Core

| Library/Tool | Purpose | Why Standard |
|-------------|---------|--------------|
| Markdown command files | Slash command authoring | Established pattern: `packages/framework/commands/synapse/*.md` with frontmatter (`name`, `description`, `allowed-tools`) |
| smol-toml (already installed) | TOML parsing/writing in hooks | Used by synapse-startup.js and synapse-statusline.js; already in dependency tree |
| MCP tools via `mcp__synapse__*` | All Synapse data operations | Established pattern; every command uses these prefixed names |
| ESM `.js` hooks | Hook authoring | All existing hooks (synapse-startup.js, synapse-statusline.js) use ESM |

### Supporting

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `resolveConfig()` | Config file resolution | Any time a hook needs to read `.synapse/config/` files — established canonical pattern |
| `store_document` MCP | Refinement state persistence | `/synapse:refine` stores brainstorm output; category `plan` or a new refinement category |
| `check_precedent` + `store_decision` MCP | Decision tracking during refinement | Checking and storing DECIDED decisions in the RPEV flow |
| `semantic_search` MCP | Fuzzy item lookup | `/synapse:focus` name-based navigation |
| `get_task_tree` MCP | Task tree display | `/synapse:status` and `/synapse:focus` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Markdown command files | Custom tool handler | Markdown is AI-native, no compilation, versioned alongside agents |
| store_document for refinement state | Separate storage | store_document is the established persistence primitive; queryable via semantic_search |

**Installation:** No new dependencies needed. All tools are already available.

---

## Architecture Patterns

### Recommended Project Structure

New files to create in Phase 16:

```
packages/framework/commands/synapse/
├── init.md          # NEW: /synapse:init
├── map.md           # NEW: /synapse:map
├── refine.md        # NEW: /synapse:refine
├── status.md        # EVOLVE: add dashboard sections, blocked items
├── focus.md         # NEW: /synapse:focus
└── new-goal.md      # DELETE: replaced by refine.md

docs/
└── user-journey.md  # NEW: CMD-04 user journey document
```

### Pattern 1: Slash Command Anatomy

**What:** Markdown file with YAML frontmatter followed by objective + process sections

**When to use:** Every user-facing slash command

**Example (from existing `status.md`):**
```markdown
---
name: synapse:status
description: Show current Synapse work stream status including active epics, feature progress, and recent activity.
allowed-tools:
  - Read
  - mcp__synapse__get_task_tree
  - mcp__synapse__get_smart_context
  - mcp__synapse__project_overview
---

## Objective

[One sentence goal]

## Process

1. **Step name:** Call `mcp__synapse__tool_name` with...
   - Key: value
   - Key: value

2. **Present output:**
   ```
   ## Section Title
   [content]
   ```

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
```

**Key rules:**
- `allowed-tools` lists ALL tools the command may use (Read, Write, Bash, plus MCP tools)
- MCP tool names use `mcp__synapse__` prefix
- Every Synapse tool call includes `actor: "synapse-orchestrator"` per attribution requirement
- Process steps are numbered with bold names

### Pattern 2: project.toml Schema (established, Phase 15)

**What:** TOML file at `.synapse/config/project.toml` read by `synapse-startup.js`

**Required fields:**
```toml
[project]
project_id = "my-project"    # lowercase slug: [a-z0-9][a-z0-9_-]*
name = "My Project"
skills = []                   # array of skill names matching .claude/skills/*/
created_at = "2026-03-05T..."
```

**Validation:** `synapse-startup.js` validates `project_id` against `/^[a-z0-9][a-z0-9_-]*$/`; invalid IDs surface via `additionalContext` error message

**Auto-detection for project name:** Use `Bash` to read `package.json` `.name`, then `git remote get-url origin` hostname, then fallback to `basename $PWD`

### Pattern 3: trust.toml Expansion for RPEV

**What:** Expanded trust.toml with per-layer involvement gradient (new in Phase 16)

**Current trust.toml schema** (`packages/framework/config/trust.toml`):
```toml
[domains]
architecture = "co-pilot"
implementation = "autopilot"
product_strategy = "advisory"

[approval]
decomposition = "strategic"

[tier_authority]
product-strategist = [0, 1]
executor = [3]

[pev]
approval_threshold = "epic"
max_parallel_executors = 3
```

**New RPEV section to add:**
```toml
[rpev]
# Per-layer user involvement: "user-driven" | "co-pilot" | "advisory" | "autopilot"
project_refine = "user-driven"   # User drives project-level refinement
epic_refine = "co-pilot"         # Co-pilot at epic level
feature_refine = "advisory"      # Advisory at feature level
workpackage_refine = "autopilot" # Autopilot at WP level

# Explicit readiness gate: require user to signal "foundation is solid"
# before auto-transitioning to Plan at these levels
explicit_gate_levels = ["project", "epic"]

# Proactive push notifications (deferred to Phase 23 — seed option here)
proactive_notifications = false
```

### Pattern 4: Refinement State Document

**What:** `store_document` call that persists brainstorm session state for continuity across /clear

**Category:** `plan` (or extend with a new valid category — check `VALID_CATEGORIES` in doc-constants.ts)

**Structure:**
```
## Refinement Session: [Item Title] ([Level])

### DECIDED
- [Decision text] — stored as decision_id: ULID (Tier N)

### OPEN (must resolve before refinement complete)
- [Decision topic] — [why it matters at this level]

### EMERGING (surfaced, not yet explored)
- [Topic] — [brief description]

### Session Summary
[What was discussed, key insights]
```

**Retrieval:** At start of next `/synapse:refine` session, `get_smart_context` or `semantic_search` retrieves the latest refinement document for the item.

### Pattern 5: Stubbing for Future Phases

**What:** Commands that reference Phase 18+ features must stub gracefully

**Stub approach:** Add a clearly labeled section in the command explaining what happens now vs. what will happen after Phase 18:

```markdown
## Current Behavior (Phase 16)

After refinement completes, the command tells the user:
"Refinement state saved. When the RPEV orchestrator is available (Phase 18),
it will auto-trigger planning. For now, the decisions are stored in Synapse
and the project is ready for manual coordination."

## Future Behavior (Phase 18+)

The orchestrator will auto-detect refinement completion and queue the Plan stage.
```

### Anti-Patterns to Avoid

- **Omitting `actor` from MCP calls:** Every Synapse tool call needs attribution — the audit log depends on it
- **Hardcoding project_id in commands:** Commands must read project_id from context (synapse-startup.js injects it); never ask the user
- **Calling init_project twice without checking:** `init_project` is idempotent but calling it on an existing project skips starter document seeding — `/synapse:init` should show what already exists
- **Blocking session start:** Any hook or command error must use `process.exit(0)` not `process.exit(1)` — per established pattern
- **Modifying CLAUDE.md silently:** The opt-in prompt must be explicit; this is in the Out of Scope requirements ("Silent CLAUDE.md modification destroys trust")
- **Assuming Ollama is running for /synapse:init:** Only `/synapse:map` needs Ollama; `/synapse:init` only creates TOML files and calls init_project (which does not need Ollama)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config file resolution | Custom path search | `resolveConfig()` in `hooks/lib/resolve-config.js` | Walk-up + monorepo fallback already handles all edge cases |
| TOML parsing | Manual string parsing | `smol-toml` `parse()` | Already installed; handles multi-line strings, arrays, nested tables |
| project_id validation | Custom regex | Reuse `PROJECT_ID_REGEX` pattern from `synapse-startup.js` | Must match server-side `ProjectIdSchema` in init-project.ts |
| Decision persistence | Custom file storage | `store_decision` MCP tool | LanceDB-backed, searchable via `check_precedent`; not replaceable |
| Semantic item lookup | String matching | `semantic_search` MCP tool | Handles fuzzy/conceptual matching that exact string search misses |
| Brainstorming framework | New conversation pattern | Extend existing brainstorm skill pattern | `.claude/skills/brainstorm/SKILL.md` has the Socratic questioning framework already defined |

**Key insight:** Every data operation in commands goes through MCP tools. Commands are pure instruction documents — they never directly manipulate files or databases.

---

## Common Pitfalls

### Pitfall 1: project_id Auto-Generation Conflicts

**What goes wrong:** `/synapse:init` auto-generates a project_id from the directory name, but if that name contains spaces or uppercase letters, `synapse-startup.js` validation fails on next session start.

**Why it happens:** Directory names are not constrained to the `[a-z0-9][a-z0-9_-]*` pattern.

**How to avoid:** Slugify the auto-detected name: lowercase, replace spaces/special chars with hyphens, strip leading non-alphanumeric. Show the user the generated ID and allow correction before writing project.toml.

**Warning signs:** project_id contains uppercase letters, spaces, or starts with a hyphen.

### Pitfall 2: Re-init Overwrites created_at

**What goes wrong:** Running `/synapse:init` on an existing project creates a new `created_at` timestamp, erasing the original project creation date. This is DEBT-02 in REQUIREMENTS.md.

**Why it happens:** `init_project` in `init-project.ts` upserts the `project_meta` row unconditionally with `metaNow = new Date().toISOString()`.

**How to avoid:** `/synapse:init` should check if project.toml already exists, read the existing `created_at`, and preserve it. Show a warning: "This project is already initialized (created: DATE). Running init again will not affect existing data."

**Note:** DEBT-02 is a server-side fix (Phase 17/Tech Debt phase). The command can work around it by detecting existing project.toml and short-circuiting before calling init_project.

### Pitfall 3: Ollama Check Scope

**What goes wrong:** Checking Ollama status in `/synapse:init` unnecessarily blocks project setup if Ollama happens to be down.

**Why it happens:** It's tempting to check all prerequisites upfront.

**How to avoid:** Only `/synapse:map` (which calls `index_codebase`) requires Ollama. `/synapse:init` only creates TOML files and calls `init_project`, which creates LanceDB tables — no embeddings needed. Keep Ollama check in `/synapse:map` only.

### Pitfall 4: Refinement State Document Accumulation

**What goes wrong:** Each `/synapse:refine` session creates a new `store_document` call, accumulating many versions without a clear way to identify "the current state."

**Why it happens:** `store_document` versions documents but doesn't replace them; you need to pass the existing `doc_id` to create a new version of the same document.

**How to avoid:** At the start of each `/synapse:refine` session, `semantic_search` for a document matching the item title + "refinement state". If found, use that `doc_id` in subsequent `store_document` calls to version rather than duplicate.

### Pitfall 5: /synapse:focus Without Task Tree

**What goes wrong:** `/synapse:focus 2.3.1` fails silently if the task tree doesn't have the referenced item, or the numbering doesn't match user expectation (positions vs. priority order).

**Why it happens:** Path shorthand implies a positional index into the priority-ordered task tree, but tasks don't have stable positional numbers.

**How to avoid:** Phase 16 stub: treat `2.3.1` as "Epic 2 (by priority), Feature 3 (by priority), WP 1 (by priority)" — describe clearly in the command that these are positions in the current priority-ordered view. When task tree is unavailable or empty, tell the user what /synapse:status shows first.

### Pitfall 6: CLAUDE.md Amendment Content

**What goes wrong:** The CLAUDE.md amendment adds too much Synapse boilerplate that clutters the user's project instructions.

**Why it happens:** It's tempting to inject a full Synapse guide into CLAUDE.md.

**How to avoid:** The amendment should be minimal — just the `project_id` line and a reference to Synapse commands. Suggested content:
```markdown
## Synapse
This project uses Synapse for AI agent coordination.
Run `/synapse:status` to check project state, `/synapse:refine` to start work.
```

---

## Code Examples

Verified patterns from existing codebase:

### Slash Command Frontmatter Pattern

```markdown
---
name: synapse:init
description: Initialize a Synapse project — creates project.toml, registers with Synapse DB, and configures RPEV settings.
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__synapse__init_project
  - mcp__synapse__store_document
---
```

Source: `packages/framework/commands/synapse/status.md` (observed pattern)

### Project Name Auto-Detection (Bash)

```bash
# Try package.json name first
PROJECT_NAME=$(cat package.json 2>/dev/null | grep '"name"' | head -1 | sed 's/.*"name": *"\(.*\)".*/\1/' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-_')

# Fallback to directory name
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-_')
fi

echo "Detected project name: $PROJECT_NAME"
```

### project.toml Template

```toml
[project]
project_id = "{{project_id}}"
name = "{{project_name}}"
skills = []
created_at = "{{iso_timestamp}}"
```

### trust.toml RPEV Extension Template

```toml
# --- existing sections preserved above ---

[rpev]
# Per-layer involvement: "user-driven" | "co-pilot" | "advisory" | "autopilot"
project_refine = "user-driven"
epic_refine = "co-pilot"
feature_refine = "advisory"
workpackage_refine = "autopilot"

# Levels requiring explicit user "foundation is solid" gate before Plan
explicit_gate_levels = ["project", "epic"]

# Proactive blocked-item notifications (Phase 23 feature — set false for now)
proactive_notifications = false
```

### store_document for Refinement State

```
Call mcp__synapse__store_document with:
  project_id: [from context]
  title: "Refinement: [Item Title] ([Level])"
  category: "plan"
  status: "active"
  tags: "|refinement|[level]|[item_slug]|"
  content: [structured brainstorm output with DECIDED/OPEN/EMERGING sections]
  doc_id: [existing doc_id if found via semantic_search, otherwise omit for fresh create]
  actor: "synapse-orchestrator"
```

### MCP init_project Call

```
Call mcp__synapse__init_project with:
  project_id: "{{project_id}}"
  actor: "synapse-orchestrator"
```

Returns: `{ success: true, data: { tables_created: N, tables_skipped: N, project_id: "...", starters_seeded: N } }`

### MCP index_codebase Call (for /synapse:map)

```
Call mcp__synapse__index_codebase with:
  project_id: "{{project_id}}"
  project_root: "{{absolute_path_to_project}}"
  actor: "synapse-orchestrator"
```

Throws `OllamaUnreachableError` if Ollama is not running — surface this as user-friendly message.

### Semantic Search for Item Navigation (/synapse:focus)

```
Call mcp__synapse__semantic_search with:
  project_id: "{{project_id}}"
  query: "{{user_search_term}}"
  limit: 5
  actor: "synapse-orchestrator"
```

Cross-reference results with task tree from `get_task_tree` to identify the exact item.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `/synapse:new-goal` — creates epic, starts decomposition | `/synapse:refine` — brainstorm session at any RPEV level, stores state | Direct replacement; `new-goal.md` is deleted |
| Linear pipeline (Brainstorm → Decompose → Execute) | Recursive RPEV at every hierarchy level | Model change documented in `.planning/brainstorm output/recursive-rpev-model.md` |
| `/synapse:plan` — spawns orchestrator with goal | No separate plan command — plan is system-driven after refine | Locked decision in CONTEXT.md |
| Status shows work streams | Status shows RPEV dashboard with blocked items highlighted | Evolution of existing `status.md` |

**Deprecated:**
- `packages/framework/commands/synapse/new-goal.md`: Delete this file — `/synapse:refine` replaces it entirely. Reuse its `check_precedent` + `get_smart_context` patterns in `/synapse:refine`.

---

## Open Questions

1. **Valid `store_document` categories for refinement state**
   - What we know: `VALID_CATEGORIES` is defined in `packages/server/src/tools/doc-constants.ts`; current categories include `plan`, `architecture_decision`, `code_pattern`, `glossary`
   - What's unclear: Whether `plan` is the right category for brainstorm session state, or whether a new `refinement` category should be added (which would require a server-side change)
   - Recommendation: Use `plan` category for Phase 16 — it's the closest existing category; adding new categories is Phase 17/Tech Debt territory

2. **Path shorthand numbering for /synapse:focus**
   - What we know: `2.3.1` means Epic 2, Feature 3, WP 1 in priority order from current view
   - What's unclear: How to stably map priority-order position to actual task_ids when tasks can be reprioritized
   - Recommendation: Phase 16 stub — get task tree, sort by priority, index positionally, document that positions reflect current priority order

3. **CLAUDE.md detection and amendment**
   - What we know: The opt-in is a user decision; the content should be minimal
   - What's unclear: Exact format — should it use a comment block, a ## section, or inline text?
   - Recommendation: Use a `## Synapse` section with 2-3 lines; check if section already exists before offering the amendment

---

## Validation Architecture

> nyquist_validation is not set in .planning/config.json — skipping this section.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `packages/framework/commands/synapse/status.md` and `new-goal.md`: Command structure, frontmatter pattern, allowed-tools format, attribution requirement
- Direct codebase inspection — `packages/framework/hooks/synapse-startup.js`: project.toml schema (project_id, name, skills, created_at), resolveConfig() pattern, project_id validation regex
- Direct codebase inspection — `packages/server/src/tools/init-project.ts`: init_project input schema (project_id, db_path, starter_types), return shape, idempotency behavior
- Direct codebase inspection — `packages/server/src/tools/index-codebase.ts`: index_codebase input schema, OllamaUnreachableError behavior
- Direct codebase inspection — `packages/framework/config/trust.toml`: Current trust.toml schema, existing sections to extend
- Direct codebase inspection — `packages/framework/hooks/lib/resolve-config.js`: resolveConfig() function, search order, monorepo fallback
- Direct codebase inspection — `.claude/skills/brainstorm/SKILL.md`: Brainstorming pattern (DECIDED/OPEN/EMERGING analogous to the thinking-partner role), Socratic questioning framework
- Direct codebase inspection — `.planning/brainstorm output/recursive-rpev-model.md`: RPEV model definition, level-aware behavior, user involvement gradient

### Secondary (MEDIUM confidence)

- `.planning/phases/16-user-journey-commands/16-CONTEXT.md`: User decisions, command set specification, code context section — written after discussion session with user

---

## Metadata

**Confidence breakdown:**
- Command file structure: HIGH — verified against two existing command files
- project.toml + trust.toml authoring: HIGH — verified against startup hook and existing config
- MCP tool signatures: HIGH — read directly from server-side TypeScript source
- RPEV model / refinement state design: HIGH — directly from CONTEXT.md decisions and recursive-rpev-model.md
- Stub approach for Phase 18+ features: MEDIUM — reasonable given deferred scope, no prior art to verify against

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain — command pattern and config schema change rarely)
