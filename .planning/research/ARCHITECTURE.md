# Architecture Research

**Domain:** Agentic coordination layer — orchestrator + specialized agents + MCP client/server integration (Synapse v2.0)
**Researched:** 2026-03-01
**Confidence:** HIGH (Claude Agent SDK patterns verified via official docs at platform.claude.com; hook API confirmed; MCP subprocess config confirmed)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  User / Claude Code                                                  │
│  (launches orchestrator, passes prompts)                             │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Orchestrator Process  (orchestrator/src/)                           │
│  Runtime: Bun + TypeScript — @anthropic-ai/claude-agent-sdk          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  query() ── main Agent SDK entry point                       │     │
│  │  options: systemPrompt, allowedTools, agents, hooks,         │     │
│  │           mcpServers, model, maxTurns                         │     │
│  └───────────────────────┬─────────────────────────────────────┘     │
│                          │ tool invocations                           │
│  ┌───────────┐  ┌────────┴───────┐  ┌──────────────┐                │
│  │ Planner   │  │   Executor     │  │  Validator    │                │
│  │ (opus)    │  │   (sonnet)     │  │  (sonnet)     │                │
│  │           │  │                │  │               │                │
│  │ tiers 1-3 │  │  tier 3 only  │  │  tiers 2-3   │                │
│  │ create_task│ │ update_task   │  │ check_prec.  │                 │
│  │ store_dec  │ │ store_doc     │  │ query_dec.   │                 │
│  └─────┬─────┘  └───────┬────────┘  └──────┬───────┘                │
│        │                │                  │                         │
│  ┌─────▼────────────────▼──────────────────▼──────────────────┐     │
│  │  Hook Layer (orchestrator/src/hooks/)                        │     │
│  │                                                              │     │
│  │  PreToolUse:  tier-enforcement.ts  precedent-gate.ts         │     │
│  │              user-approval.ts                                │     │
│  │  PostToolUse: tool-audit.ts                                  │     │
│  └──────────────────────────┬───────────────────────────────────┘    │
│                             │ MCP tool calls (mcp__synapse__*)        │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ stdio subprocess
                              │ (Agent SDK spawns via mcpServers config)
┌─────────────────────────────▼───────────────────────────────────────┐
│  Synapse MCP Server  (src/)                                          │
│  Runtime: Bun + TypeScript — @modelcontextprotocol/sdk               │
│  Transport: StdioServerTransport                                      │
│                                                                      │
│  18 existing tools + 6 new tools (Phase 8-9):                        │
│  store_decision, query_decisions, check_precedent                    │
│  create_task, update_task, get_task_tree                             │
│                                                                      │
│  Embedding: Ollama nomic-embed-text (768-dim)                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LanceDB (embedded, Lance format)                                    │
│                                                                      │
│  Existing (v1):              New (v2, Phase 8-9):                    │
│  ┌──────────────┐           ┌───────────┐  ┌───────────┐            │
│  │  documents   │           │ decisions │  │  tasks    │            │
│  │  doc_chunks  │           │ (vector)  │  │ (vector)  │            │
│  │  code_chunks │           └───────────┘  └───────────┘            │
│  │  relationships│                                                   │
│  │  project_meta│                                                    │
│  │  activity_log│                                                    │
│  └──────────────┘                                                    │
│  Storage: ./.synapse/ (configurable --db flag)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `orchestrator/src/orchestrator.ts` | Core class — wraps `query()`, manages session lifecycle, exposes `run(prompt, mode)` | Agent SDK `query()`, config, agent definitions, hooks |
| `orchestrator/src/synapse-connection.ts` | Builds `mcpServers` config pointing to Synapse subprocess | Consumed by orchestrator's `query()` options |
| `orchestrator/src/config.ts` | Zod-validated config (synapse path, project_id, model, API key) | Loaded at startup; passed to orchestrator |
| `orchestrator/src/agents/` | AgentDefinition objects — system prompts, tool lists, model choice, tier authority | Passed to `query()` options as `agents: {}` |
| `orchestrator/src/prompts/` | System prompt templates with precedent-check instructions | Imported by agent definitions |
| `orchestrator/src/hooks/` | PreToolUse/PostToolUse callbacks for tier enforcement, precedent gates, audit log | Passed to `query()` options as `hooks: {}` |
| `orchestrator/src/workflows/plan-execute-validate.ts` | Full PEV loop — sequences Planner → checkpoint → Executor → Validator | Calls orchestrator `run()` with different modes |
| `orchestrator/src/skill-registry.ts` | Loads skill files, maps project attributes to skill bundles | Injects skill content into agent system prompts at construction time |
| `orchestrator/src/decision-tiers.ts` | Authority matrix — maps agent names to allowed tier numbers | Imported by tier-enforcement hook |
| `src/db/schema.ts` | Arrow schemas + Zod row schemas for `decisions` and `tasks` tables | Modified in Phase 8-9; no orchestrator dependency |
| `src/tools/store-decision.ts` etc. | New MCP tools following existing registerXTool pattern | Called by orchestrator via MCP protocol |

---

## Recommended Project Structure

### Synapse MCP Server (existing — src/)

```
src/
├── index.ts                         # Entry point (unchanged)
├── server.ts                        # McpServer + tool registrations (add 6 new tools)
├── config.ts                        # CLI arg parsing (unchanged)
│
├── db/
│   ├── connection.ts                # connectDb() helper (unchanged)
│   └── schema.ts                   # ADD: DECISIONS_SCHEMA, TASKS_SCHEMA,
│                                   #      DecisionRowSchema, TaskRowSchema
│
├── tools/
│   ├── ...existing 18 tools...
│   ├── store-decision.ts            # NEW: Phase 8
│   ├── query-decisions.ts           # NEW: Phase 8
│   ├── check-precedent.ts           # NEW: Phase 8
│   ├── create-task.ts               # NEW: Phase 9
│   ├── update-task.ts               # NEW: Phase 9
│   └── get-task-tree.ts             # NEW: Phase 9
│
└── ...existing services...
```

### Orchestrator (new — orchestrator/)

```
orchestrator/
├── package.json                     # Separate package: @anthropic-ai/claude-agent-sdk
├── tsconfig.json                    # Extends root or standalone
├── src/
│   ├── index.ts                     # Entry point: parse args, run PEV workflow
│   ├── orchestrator.ts              # Core class: run(prompt, mode) wrapping query()
│   ├── config.ts                    # Zod config: synapsePath, projectId, model, apiKey
│   ├── synapse-connection.ts        # buildSynapseConfig() -> McpServerConfig
│   ├── decision-tiers.ts            # TIER_AUTHORITY: Record<AgentName, number[]>
│   ├── skill-registry.ts            # loadSkills(projectAttrs) -> SkillBundle
│   │
│   ├── agents/
│   │   ├── types.ts                 # AgentDefinition factory type
│   │   ├── planner.ts               # Planner AgentDefinition (opus, tiers 1-3)
│   │   ├── executor.ts              # Executor AgentDefinition (sonnet, tier 3)
│   │   ├── validator.ts             # Validator AgentDefinition (sonnet, tiers 2-3)
│   │   └── index.ts                 # buildAgents(config, skills) -> agents record
│   │
│   ├── prompts/
│   │   ├── planner.md               # Planner system prompt template
│   │   ├── executor.md              # Executor system prompt template
│   │   └── validator.md             # Validator system prompt template
│   │
│   ├── hooks/
│   │   ├── tier-enforcement.ts      # PreToolUse: block store_decision by tier
│   │   ├── precedent-gate.ts        # PreToolUse: inject "check precedent" context
│   │   ├── user-approval.ts         # PreToolUse: return "ask" for tier 0 decisions
│   │   └── tool-audit.ts            # PostToolUse: log all MCP tool calls
│   │
│   ├── workflows/
│   │   └── plan-execute-validate.ts # PEV loop: plan -> checkpoint -> execute -> validate
│   │
│   └── skills/
│       ├── registry.ts              # Skill file loading and project attribute mapping
│       └── examples/
│           ├── typescript-web.md    # Example skill bundle for TS web projects
│           └── data-science.md      # Example skill bundle for data science projects
```

### Structure Rationale

- **`orchestrator/` as separate package:** Keeps runtime dependencies isolated (Agent SDK only in orchestrator). Synapse stays independent — it does not know the orchestrator exists. Each can be versioned separately.
- **`agents/` as factory functions, not singletons:** Agent definitions are built at runtime from config + loaded skills. This allows injecting project-specific skill content into system prompts without hardcoding.
- **`prompts/` as separate .md files:** System prompts are large and change frequently. Markdown files are more readable than template literal strings in code. Loaded at runtime via `fs.readFile`.
- **`hooks/` as single-responsibility modules:** Each hook file handles exactly one concern. Hooks are chained in `query()` options — ordering matters (tier enforcement before precedent gate before audit).
- **`skills/` inside orchestrator:** Skill files are orchestrator concerns (they shape agent behavior), not Synapse concerns (Synapse is data-layer only).
- **No shared types package:** The boundary between orchestrator and Synapse is the MCP protocol. Orchestrator never imports from `src/`. All typing at the boundary comes from the MCP client SDK types or JSON.

---

## Architectural Patterns

### Pattern 1: MCP Subprocess Configuration

**What:** The Agent SDK spawns Synapse as a stdio subprocess. The orchestrator provides the `mcpServers` config object to `query()` — the SDK handles spawn, lifecycle, and protocol.

**When to use:** Any `query()` call that needs Synapse tools. Built in `synapse-connection.ts` and passed through to all agent queries.

**How the SDK manages lifecycle:** The SDK spawns the subprocess per `query()` session. Health check information arrives in the `system/init` message (`message.mcp_servers` field with status). Reconnect is available programmatically via `query.reconnectMcpServer(name)`. The 60-second default connection timeout applies — Synapse starts fast (no heavy initialization), so this is not a concern.

**Trade-offs:** No direct import possible. All data exchange is via MCP tool calls. This is the correct constraint — it enforces the data-layer/control-layer boundary. Startup cost is ~100ms per `query()` session (subprocess spawn + MCP handshake).

```typescript
// orchestrator/src/synapse-connection.ts
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { SynapseOrchestratorConfig } from "./config.js";

export type McpStdioServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export function buildSynapseConfig(
  config: SynapseOrchestratorConfig,
): Record<string, McpStdioServerConfig> {
  return {
    synapse: {
      command: "bun",
      args: ["run", config.synapsePath, "--db", config.dbPath],
      env: {
        OLLAMA_URL: config.ollamaUrl ?? "http://localhost:11434",
        EMBED_MODEL: "nomic-embed-text",
      },
    },
  };
}
```

**MCP tool naming in orchestrator:** All Synapse tools are referenced as `mcp__synapse__<tool_name>` in hook matchers and `allowedTools`. Example: `mcp__synapse__store_decision`, `mcp__synapse__check_precedent`.

---

### Pattern 2: AgentDefinition as TypeScript Configuration Objects

**What:** Agents are plain TypeScript objects conforming to the SDK's `AgentDefinition` type. They declare `description` (when to invoke), `prompt` (system prompt), `tools` (allowlist), `model`, and optional `maxTurns`.

**When to use:** Every specialized agent. Build at runtime via factory functions that inject loaded skills into the prompt.

**Trade-offs:** No code execution in agents — they are pure configuration. The `prompt` is the only customization knob beyond tool lists. Skills are injected as prompt content, not code plugins.

```typescript
// orchestrator/src/agents/planner.ts
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { SkillBundle } from "../skill-registry.js";

// Tier 0 decisions always go to user approval — Planner can only store tiers 1-3.
// Enforced by tier-enforcement hook, not by tool list (store_decision exists in all agents).
const PLANNER_BASE_TOOLS = [
  "mcp__synapse__get_smart_context",
  "mcp__synapse__query_documents",
  "mcp__synapse__check_precedent",
  "mcp__synapse__query_decisions",
  "mcp__synapse__create_task",
  "mcp__synapse__store_decision",
  "mcp__synapse__get_task_tree",
];

export function buildPlannerAgent(
  promptTemplate: string,
  skills: SkillBundle,
): AgentDefinition {
  const skillSection = skills.content.length > 0
    ? `\n\n## Project-Specific Skills\n${skills.content}`
    : "";

  return {
    description:
      "Strategic planner. Use for decomposing user requests into task trees, " +
      "making architecture and design decisions (tiers 1-3), and checking precedents " +
      "before starting work.",
    prompt: promptTemplate + skillSection,
    tools: PLANNER_BASE_TOOLS,
    model: "opus",
    maxTurns: 30,
  };
}
```

---

### Pattern 3: Hook-Based Tier Enforcement

**What:** A `PreToolUse` hook intercepts `mcp__synapse__store_decision` calls and checks the tier value in the tool input against the calling agent's authority. If the agent lacks authority, the hook returns `permissionDecision: "deny"`.

**When to use:** Required for every `store_decision` call. Chained with `precedent-gate.ts` and `user-approval.ts`.

**How to identify the calling agent:** The hook input includes `session_id`. The orchestrator tracks which agent is currently running via `parent_tool_use_id` on messages. Alternative: pass the current agent name into the hook closure at construction time — simpler and reliable because each agent's `query()` call has its own hook instance.

**Trade-offs:** Hooks run synchronously in the hot path. Keep them fast — no DB calls, no HTTP requests. Read authority from the in-memory `TIER_AUTHORITY` map, not from Synapse.

```typescript
// orchestrator/src/hooks/tier-enforcement.ts
import type { HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import { TIER_AUTHORITY } from "../decision-tiers.js";

export function buildTierEnforcementHook(agentName: string): HookCallback {
  const allowedTiers: number[] = TIER_AUTHORITY[agentName] ?? [];

  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};

    const preInput = input as PreToolUseHookInput;
    if (!preInput.tool_name.endsWith("store_decision")) return {};

    const toolInput = preInput.tool_input as Record<string, unknown>;
    const requestedTier = Number(toolInput.tier);

    if (!allowedTiers.includes(requestedTier)) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `Agent '${agentName}' cannot store tier-${requestedTier} decisions. ` +
            `Allowed tiers: [${allowedTiers.join(", ")}]. ` +
            `Tier 0 (Product Strategy) always requires user approval.`,
        },
      };
    }

    return {};
  };
}
```

---

### Pattern 4: Tier 0 User Approval via Hook

**What:** A `PreToolUse` hook intercepts `store_decision` calls with `tier: 0` and returns `permissionDecision: "ask"` instead of "deny". This surfaces a user prompt before executing.

**When to use:** Tier 0 (Product Strategy) decisions. No agent can decide these autonomously.

**Trade-offs:** `permissionDecision: "ask"` is only useful in interactive mode. In batch/CI mode, this effectively blocks execution. Consider a config flag to fail-fast vs. block on tier 0 depending on run context.

```typescript
// orchestrator/src/hooks/user-approval.ts
import type { HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

export const userApprovalHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {};

  const preInput = input as PreToolUseHookInput;
  if (!preInput.tool_name.endsWith("store_decision")) return {};

  const toolInput = preInput.tool_input as Record<string, unknown>;
  if (Number(toolInput.tier) !== 0) return {};

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason:
        "Tier 0 (Product Strategy) decisions require user approval. " +
        `Subject: "${toolInput.subject}". Choice: "${toolInput.choice}".`,
    },
  };
};
```

---

### Pattern 5: Async Tool Audit Logging

**What:** A `PostToolUse` hook fires after every MCP tool call and logs tool name, input summary, result, and timestamp. Because logging is a side effect with no need to influence agent behavior, the hook returns `{ async: true }` so the agent proceeds without waiting.

**When to use:** All `mcp__synapse__*` tool calls. Provides full audit trail for traceability.

**Trade-offs:** Async mode means failed log writes do not surface to the agent. Acceptable — audit log loss is preferable to blocking the agent. Log to a file (not Synapse's `activity_log` — that creates circular dependency and adds latency).

```typescript
// orchestrator/src/hooks/tool-audit.ts
import { appendFile } from "node:fs/promises";
import type { HookCallback, PostToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

export const toolAuditHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "PostToolUse") return {};

  const postInput = input as PostToolUseHookInput;
  if (!postInput.tool_name.startsWith("mcp__synapse__")) return {};

  // Fire-and-forget — do not await
  appendFile(
    "./orchestrator-audit.log",
    JSON.stringify({
      ts: new Date().toISOString(),
      tool: postInput.tool_name,
      session: postInput.session_id,
    }) + "\n",
  ).catch(() => { /* ignore */ });

  return { async: true, asyncTimeout: 5000 };
};
```

---

### Pattern 6: Skill Registry — File-Based, Injected at Prompt Construction

**What:** Skills are Markdown files in `orchestrator/src/skills/`. Each skill file contains domain knowledge, quality criteria, and vocabulary. The registry maps project attributes (language, domain, framework) to skill file names. At agent construction time, matched skill files are concatenated and injected as a section of the system prompt.

**When to use:** Always — even a minimal project has at least a default skill. Project-specific skills are injected based on config attributes.

**Why files, not code:** Skills are text content, not executable logic. Markdown files are readable, diffable, and editable without TypeScript knowledge. No dynamic code loading required.

**Trade-offs:** Skill content inflates system prompts. Keep individual skill files under 500 tokens. Do not inject all skills into all agents — Executor does not need architecture knowledge; Planner does not need test-execution syntax.

```typescript
// orchestrator/src/skill-registry.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SkillBundle {
  content: string;  // Concatenated markdown content
  names: string[];  // Skill names loaded
}

export interface ProjectAttributes {
  language: string;       // "typescript", "python", "rust"
  domain: string;         // "web-api", "data-science", "cli-tool"
  framework?: string;     // "express", "fastapi", "axum"
}

const SKILL_MAP: Record<string, string[]> = {
  "typescript": ["typescript-patterns.md"],
  "python": ["python-patterns.md"],
  "web-api": ["api-design.md", "rest-conventions.md"],
  "data-science": ["data-pipelines.md", "ml-patterns.md"],
};

const SKILLS_DIR = join(import.meta.dirname, "skills");

export async function loadSkills(
  attrs: ProjectAttributes,
  agentName: string,
): Promise<SkillBundle> {
  const skillFiles = new Set<string>();

  // Map project attributes to skill files
  for (const [key, files] of Object.entries(SKILL_MAP)) {
    const attrValues = [attrs.language, attrs.domain, attrs.framework].filter(Boolean);
    if (attrValues.includes(key)) {
      files.forEach((f) => skillFiles.add(f));
    }
  }

  const contents: string[] = [];
  const loaded: string[] = [];

  for (const file of skillFiles) {
    try {
      const content = await readFile(join(SKILLS_DIR, file), "utf-8");
      contents.push(content);
      loaded.push(file);
    } catch {
      // Skill file missing — skip silently, log warning
    }
  }

  return {
    content: contents.join("\n\n---\n\n"),
    names: loaded,
  };
}
```

---

### Pattern 7: New LanceDB Tables — decisions and tasks

**What:** Two new Arrow schemas added to `src/db/schema.ts`, following the exact same pattern as existing schemas.

**Decisions table — vector search on semantic precedent:**
The `vector` field embeds `subject + ": " + rationale`. Query with `check_precedent` calls `nearestTo(queryVector).where("is_precedent = 'true' AND status = 'active'").limit(5)`. No recursive queries needed — flat table with semantic search.

**Tasks table — recursive parent_id hierarchy:**
LanceDB does not support recursive CTEs or graph traversal. Hierarchy is assembled on the JavaScript side in `get_task_tree`: fetch all tasks for a project, group by `parent_id`, build the tree in memory. Same pattern as `get_related_documents` (v1). This is efficient because task counts are bounded (hundreds, not millions).

**Utf8 boolean pattern:** LanceDB has no native boolean type. Follow existing convention: `is_precedent: Utf8` storing `"true"` or `"false"`. Filter with `WHERE is_precedent = 'true'`.

**JSON arrays pattern:** `depends_on` and `decision_ids` on tasks are stored as JSON strings (`JSON.stringify(["id1", "id2"])`). Deserialized in the tool handler after fetch. Same pattern as existing `tags` fields.

```typescript
// src/db/schema.ts — additions for Phase 8

export const DECISIONS_SCHEMA = new Schema([
  new Field("decision_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("tier", new Int32(), false),          // 0-3
  new Field("subject", new Utf8(), false),
  new Field("choice", new Utf8(), false),
  new Field("rationale", new Utf8(), false),
  new Field("is_precedent", new Utf8(), false),   // "true" | "false"
  new Field("status", new Utf8(), false),          // "active" | "superseded" | "revoked"
  new Field("source_task_id", new Utf8(), true),
  new Field("tags", new Utf8(), false),            // pipe-separated
  new Field("created_at", new Utf8(), false),
  new Field("vector", new FixedSizeList(768, new Field("item", new Float32(), true)), false),
]);

// src/db/schema.ts — additions for Phase 9

export const TASKS_SCHEMA = new Schema([
  new Field("task_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("parent_id", new Utf8(), true),        // null = Epic root
  new Field("depth", new Int32(), false),          // 0=Epic, 1=Feature, 2=Component, 3=Task
  new Field("title", new Utf8(), false),
  new Field("description", new Utf8(), false),
  new Field("status", new Utf8(), false),
  new Field("task_type", new Utf8(), false),       // "epic"|"feature"|"component"|"task"
  new Field("depends_on", new Utf8(), false),      // JSON array of task_ids
  new Field("assigned_agent", new Utf8(), true),
  new Field("decision_ids", new Utf8(), false),    // JSON array of decision_ids
  new Field("tags", new Utf8(), false),
  new Field("priority", new Int32(), true),
  new Field("created_at", new Utf8(), false),
  new Field("updated_at", new Utf8(), false),
  new Field("vector", new FixedSizeList(768, new Field("item", new Float32(), true)), false),
]);
```

---

## Data Flow

### Orchestrator Initialization Flow

```
User runs: bun run orchestrator/src/index.ts --project myapp "Build auth module"
    │
    ▼
config.ts: loadConfig() → validate env vars + CLI args → SynapseOrchestratorConfig
    │
    ▼
synapse-connection.ts: buildSynapseConfig() → { synapse: { command, args, env } }
    │
    ▼
skill-registry.ts: loadSkills(projectAttrs, agentName) → SkillBundle per agent
    │
    ▼
agents/index.ts: buildAgents(config, skills) → { planner: AgentDef, executor: AgentDef, ... }
    │
    ▼
hooks construction: buildTierEnforcementHook("planner"), userApprovalHook, toolAuditHook
    │
    ▼
orchestrator.ts: Orchestrator.run(prompt) →
  query({
    prompt,
    options: {
      mcpServers: synapseConfig,    // SDK spawns Synapse subprocess
      agents: agentDefs,
      hooks: { PreToolUse: [...], PostToolUse: [...] },
      allowedTools: ["Task", "mcp__synapse__*"],
      systemPrompt: plannerPrompt,
      model: "claude-opus-4-6",
      maxTurns: 50
    }
  })
    │
    ▼
system/init message → check mcp_servers[0].status === "connected"
    │
    ▼
Agent loop begins → subagent Task calls route to Planner/Executor/Validator
```

### Plan-Execute-Validate (PEV) Data Flow

```
User prompt: "Build a JWT authentication module"
    │
    ▼
[PLAN phase]
Planner subagent:
  check_precedent("authentication framework") → finds prior decisions
  create_task("Auth Epic", depth=0)
  create_task("JWT library selection", depth=1, parent=Epic)
  create_task("Token validation", depth=2, parent=Feature)
  create_task("Implement validateToken()", depth=3, parent=Component)
  store_decision(tier=1, "JWT library", "jose", rationale="...")
  → Hook: tier-enforcement allows tier=1 for Planner ✓
  get_task_tree() → returns hierarchical task structure
    │
    ▼
[CHECKPOINT — tier 0/1 decisions]
user-approval hook triggered? → If tier 0: user reviews and approves
    │
    ▼
[EXECUTE phase — leaf tasks in parallel waves]
Executor subagent (wave 1 — no dependencies):
  get_task_tree() → finds leaf tasks with status="validated"
  [works on task: "Implement validateToken()"]
  update_task(task_id, status="in_progress", assigned_agent="executor")
  store_document(title="validateToken implementation", ...)
  update_task(task_id, status="completed")
    │
    ▼
[VALIDATE phase]
Validator subagent:
  get_task_tree() → checks completion status
  query_decisions() → retrieves governing decisions
  check_precedent("token validation approach") → confirms no contradictions
  update_task(epic_id, status="completed") if all children validated
    │
    ▼
Orchestrator: collects result messages, formats output, returns to user
```

### Hook Execution Order (per tool call)

```
Agent calls mcp__synapse__store_decision(tier=0, ...)
    │
    ▼
PreToolUse hooks fire in registration order:
  1. userApprovalHook    → tier=0, returns permissionDecision: "ask"
     [deny takes priority over ask — but we register user-approval FIRST
      so tier enforcement (deny for wrong tiers) fires second]
  2. tierEnforcementHook → deny wins if agent lacks authority
  3. precedentGateHook   → inject "check precedent" context (systemMessage)
    │
    ▼
If approved: tool executes → Synapse stores decision
    │
    ▼
PostToolUse hooks fire:
  1. toolAuditHook → async log, agent proceeds immediately
```

**Hook priority rule (from SDK docs):** When multiple hooks apply, `deny` takes priority over `ask`, which takes priority over `allow`. Register `user-approval` (returns "ask") before `tier-enforcement` (returns "deny" for unauthorized agents) to avoid tier-0 decisions being silently denied instead of surfaced for user review. Tier-0 is a special case: no agent has tier-0 authority, so only the user-approval hook applies.

---

## Integration Points

### Orchestrator → Synapse (the critical boundary)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Orchestrator → Synapse | MCP protocol over stdio — NO direct imports | Agent SDK spawns Synapse as subprocess; all calls are JSON-RPC via MCP tool invocations |
| Tool naming | `mcp__synapse__<tool_name>` | `synapse` is the key name in `mcpServers` config object |
| Type safety | No shared types package; type tool I/O as `Record<string, unknown>` in hooks | Tool schemas are defined in Synapse's Zod schemas; orchestrator has no compile-time access |
| Error handling | MCP tool errors surface as error result in tool call response | Hooks see `PostToolUseFailure` events; orchestrator should handle gracefully |

### MCP Subprocess Lifecycle (managed by Agent SDK)

| Event | SDK Behavior | Orchestrator Action |
|-------|-------------|---------------------|
| Session start | SDK spawns subprocess, waits for MCP handshake | Check `system/init` message for `mcp_servers[0].status` |
| Connection failure | Server reports `status: "failed"` in init message | Abort or retry — `query.reconnectMcpServer("synapse")` |
| Session end | SDK sends SIGTERM to subprocess | Automatic — no orchestrator cleanup needed |
| Mid-session reconnect | Available via `query.reconnectMcpServer(name)` | Use on transient failures |
| Timeout | 60-second default connection timeout | Synapse starts fast; unlikely to hit this |

### New vs Modified Components

| Component | New or Modified | Phase |
|-----------|-----------------|-------|
| `src/db/schema.ts` | Modified — add DECISIONS_SCHEMA, TASKS_SCHEMA | 8, 9 |
| `src/tools/store-decision.ts` | New | 8 |
| `src/tools/query-decisions.ts` | New | 8 |
| `src/tools/check-precedent.ts` | New | 8 |
| `src/tools/create-task.ts` | New | 9 |
| `src/tools/update-task.ts` | New | 9 |
| `src/tools/get-task-tree.ts` | New | 9 |
| `src/tools/init-project.ts` | Modified — create decisions + tasks tables | 8, 9 |
| `src/server.ts` | Modified — register 6 new tools | 8, 9 |
| `orchestrator/` | New directory — entire package | 10-12 |
| `orchestrator/package.json` | New | 10 |
| `orchestrator/src/orchestrator.ts` | New | 10 |
| `orchestrator/src/config.ts` | New | 10 |
| `orchestrator/src/synapse-connection.ts` | New | 10 |
| `orchestrator/src/agents/` | New | 11 |
| `orchestrator/src/prompts/` | New | 11 |
| `orchestrator/src/decision-tiers.ts` | New | 11 |
| `orchestrator/src/hooks/` | New | 12 |
| `orchestrator/src/workflows/plan-execute-validate.ts` | New | 12 |
| `orchestrator/src/skill-registry.ts` | New | 11 |

---

## Suggested Build Order

Dependencies drive ordering. Each step is independently testable.

| Order | Component | Depends On | What You Can Test |
|-------|-----------|------------|-------------------|
| 1 | `src/db/schema.ts` — add DECISIONS_SCHEMA | Existing Arrow imports | Schema parses, Zod schema validates a sample row |
| 2 | `src/tools/store-decision.ts` | schema.ts, embedder.ts, connectDb | Full round-trip: embed rationale, insert, verify vector stored |
| 3 | `src/tools/query-decisions.ts` | schema.ts, connectDb | Filter by tier/status/is_precedent |
| 4 | `src/tools/check-precedent.ts` | schema.ts, embedder.ts, connectDb | Vector search on decisions table |
| 5 | `src/tools/init-project.ts` — add decisions table | schema.ts | init_project creates decisions table + indexes |
| 6 | `src/server.ts` — register decision tools | All decision tools | `bun test` passes with 21 tools |
| 7 | `src/db/schema.ts` — add TASKS_SCHEMA | Existing Arrow imports | Schema parses, Zod validates |
| 8 | `src/tools/create-task.ts` | schema.ts, embedder.ts, connectDb | Validate parent/depth, embed, insert |
| 9 | `src/tools/update-task.ts` | schema.ts, connectDb | Status transitions, field updates |
| 10 | `src/tools/get-task-tree.ts` | schema.ts, connectDb | Fetch all tasks, assemble tree JS-side, rollup stats |
| 11 | `src/tools/init-project.ts` — add tasks table | schema.ts | init_project creates tasks table + indexes |
| 12 | `src/server.ts` — register task tools | All task tools | `bun test` passes with 24 tools |
| 13 | `orchestrator/package.json`, `tsconfig.json` | npm | Package installs, TypeScript compiles |
| 14 | `orchestrator/src/config.ts` | zod | Config loads from env/args, rejects invalid |
| 15 | `orchestrator/src/synapse-connection.ts` | config.ts | buildSynapseConfig() returns correct McpServerConfig shape |
| 16 | `orchestrator/src/orchestrator.ts` | config, synapse-connection, Agent SDK | query() runs, Synapse subprocess spawned, init message received |
| 17 | `orchestrator/src/decision-tiers.ts` | Nothing | TIER_AUTHORITY map is correct (unit test) |
| 18 | `orchestrator/src/skill-registry.ts` | fs | loadSkills() returns content for known project types |
| 19 | `orchestrator/src/prompts/` | Nothing | Prompt files load, template interpolation works |
| 20 | `orchestrator/src/agents/` | prompts, skill-registry, decision-tiers | AgentDefinition objects have correct tool lists |
| 21 | `orchestrator/src/hooks/tier-enforcement.ts` | decision-tiers | Hook denies unauthorized tier, allows authorized tier |
| 22 | `orchestrator/src/hooks/precedent-gate.ts` | Nothing | Hook injects systemMessage on check_precedent calls |
| 23 | `orchestrator/src/hooks/user-approval.ts` | Nothing | Hook returns "ask" for tier 0 decisions |
| 24 | `orchestrator/src/hooks/tool-audit.ts` | fs/promises | Hook writes async audit log entry |
| 25 | `orchestrator/src/workflows/plan-execute-validate.ts` | orchestrator, agents, hooks | Full PEV loop with real Synapse subprocess |
| 26 | End-to-end integration test | Full stack | User prompt → task tree → decisions → execution → validation |

**Phase 8 MVP (decisions tooling in Synapse):** Steps 1-6
**Phase 9 MVP (task hierarchy in Synapse):** Steps 7-12
**Phase 10 MVP (orchestrator process up, basic query):** Steps 13-16
**Phase 11 MVP (specialized agents):** Steps 17-20
**Phase 12 MVP (enforcement + full PEV workflow):** Steps 21-26

---

## Anti-Patterns

### Anti-Pattern 1: Direct Import from Synapse src/ into Orchestrator

**What people do:** Import `storeDocument` or `connectDb` directly in orchestrator code to bypass MCP overhead.

**Why it's wrong:** Collapses the data-layer/control-layer boundary. Orchestrator becomes tightly coupled to Synapse's internal types and refactors. Two processes cannot share the same LanceDB connection (LanceDB embedded is single-process). The MCP protocol boundary is the feature — it enforces clean separation and allows Synapse to evolve independently.

**Do this instead:** All orchestrator → Synapse communication goes through MCP tool calls. Use `mcp__synapse__*` tool calls only. The 1-2ms MCP overhead is irrelevant at agent turn timescales.

---

### Anti-Pattern 2: Putting Tier Authority in Synapse (as a DB table)

**What people do:** Add a `user_authority_matrix` table to LanceDB. Synapse tools check authority before writing.

**Why it's wrong:** Synapse is the data layer — it should not know about orchestration concepts like agents or authority levels. This creates coupling in the wrong direction (data layer enforcing control-layer policy). It also makes the authority matrix harder to inspect and change (DB query vs. config file read).

**Do this instead:** Authority lives in `orchestrator/src/decision-tiers.ts` as a plain TypeScript record. Enforcement is a PreToolUse hook in the orchestrator. Synapse's `store_decision` tool is authority-agnostic — it stores any valid decision. The orchestrator is responsible for what agents are allowed to store.

---

### Anti-Pattern 3: Injecting Skills as Code Plugins

**What people do:** Load skill files as JavaScript modules that export functions. Call those functions to extend agent behavior at runtime.

**Why it's wrong:** Dynamic code loading is a security surface and a complexity multiplier. Skills change frequently (user edits) and should not require TypeScript compilation. Skill content at its core is text that shapes the system prompt — it does not need to execute.

**Do this instead:** Skills are Markdown files. The registry reads them as strings and concatenates them into the system prompt at agent construction time. Simpler, safer, and more maintainable.

---

### Anti-Pattern 4: Recursive CTE for Task Hierarchy in LanceDB

**What people do:** Attempt a recursive SQL query or multiple table JOINs to fetch the full task tree.

**Why it's wrong:** LanceDB does not support recursive CTEs. Its SQL dialect is limited (Apache DataFusion). Recursive SQL would require either multiple round-trips or features that don't exist.

**Do this instead:** Fetch all tasks for a `project_id` in a single query (`WHERE project_id = 'X'`), then assemble the tree in JavaScript using a map-reduce over `parent_id`. Task counts are bounded (hundreds per project), so fetching all tasks into memory is fast and correct. Same pattern as `get_related_documents` in v1.

---

### Anti-Pattern 5: Using `permissionMode: "bypassPermissions"` Globally

**What people do:** Set `bypassPermissions` on the main `query()` call to avoid all approval prompts.

**Why it's wrong:** This propagates to all subagents, disabling the `permissionDecision: "ask"` hook output for tier 0 decisions. The user-approval hook becomes a no-op.

**Do this instead:** Use `permissionMode: "default"` (the SDK default). Tier enforcement hooks handle what agents can and cannot do. User-approval hook handles what needs user input. This preserves the safety model.

---

### Anti-Pattern 6: One Monolithic Agent with All Tools

**What people do:** Give the main agent access to all 24 Synapse tools. Skip subagent specialization.

**Why it's wrong:** A context window stuffed with 24 tool definitions degrades tool selection quality. The agent conflates planning decisions (tier 1-3) with execution decisions (tier 3). Without tier-specific tool lists, hooks are the only enforcement layer — a single mistake in the hook logic exposes everything.

**Do this instead:** Narrow tool lists per agent. Planner gets planning tools. Executor gets execution tools. Validator gets read + approval tools. Defense-in-depth: tool lists restrict what's possible; hooks enforce what's allowed within that set.

---

## Scaling Considerations

This is a single-user, local-first tool. Scaling means "larger projects" not "more users."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Small project (< 50 tasks, < 100 decisions) | No changes. In-memory tree assembly for tasks is instant. Brute-force vector search on decisions is fast. |
| Medium project (50-500 tasks, 100-1000 decisions) | Create BTree index on `tasks.parent_id` and `tasks.project_id`. Create IVF_HNSW_SQ on `decisions.vector`. Add BTree index on `decisions.status` + `decisions.is_precedent` for filter pushdown. |
| Large project (500+ tasks) | Wave-based parallel execution becomes important. Orchestrator should track task waves (all tasks with no incomplete dependencies) and run Executor subagents in parallel per wave. |
| Multiple projects | Already scoped by `project_id` in all tables. No architectural change needed. |

---

## Sources

- [Claude Agent SDK Overview — Anthropic official docs](https://platform.claude.com/docs/en/agent-sdk/overview) — HIGH confidence
- [Claude Agent SDK Hooks — Anthropic official docs](https://platform.claude.com/docs/en/agent-sdk/hooks) — HIGH confidence
- [Claude Agent SDK MCP Integration — Anthropic official docs](https://platform.claude.com/docs/en/agent-sdk/mcp) — HIGH confidence
- [Claude Agent SDK Subagents — Anthropic official docs](https://platform.claude.com/docs/en/agent-sdk/subagents) — HIGH confidence
- [Claude Agent SDK TypeScript Reference — Anthropic official docs](https://platform.claude.com/docs/en/agent-sdk/typescript) — HIGH confidence (AgentDefinition type, Options type, Query object methods confirmed)
- [Synapse v1.0 Architecture Research — .planning/research/ARCHITECTURE.md](./ARCHITECTURE.md) — HIGH confidence (existing patterns)
- [Synapse v2.0 Milestone Plan — .planning/MILESTONE_2_PLAN.md](../MILESTONE_2_PLAN.md) — HIGH confidence (design decisions)

---

*Architecture research for: Synapse v2.0 — Agentic coordination layer (orchestrator + specialized agents)*
*Researched: 2026-03-01*
