# Stack Research

**Domain:** Agentic framework additions to existing MCP/LanceDB server (v2.0)
**Project:** Synapse
**Researched:** 2026-03-01
**Confidence:** HIGH (Agent SDK from official Anthropic docs; Bun compatibility from official Anthropic/Bun sources; LanceDB SQL limits from official DataFusion-backed docs)

---

## Scope: v2.0 NEW Additions Only

The v1.0 stack (LanceDB 0.26.2, Ollama nomic-embed-text, tree-sitter, @modelcontextprotocol/sdk, Zod v4, Bun) is validated and unchanged. This file covers only what is new for the v2.0 agentic coordination layer.

The original v1.0 STACK.md content is preserved in the v1.0 baseline section at the bottom of this file.

---

## Recommended Stack (NEW additions)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.63` | Agent loop, subagents, hooks, MCP client | Official Anthropic SDK; provides `query()` async generator, `AgentDefinition` type for 10 specialized agents, full hook system for tier enforcement, built-in stdio MCP client that spawns Synapse as subprocess. No custom agent runtime to maintain. Anthropic acquired Bun — long-term Bun investment is guaranteed. |

### Supporting Libraries (orchestrator only — no changes to root)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `^4.0.0` | Tool input validation, structured output schemas | SDK peer dep; project already uses Zod v4. Declare explicitly in `orchestrator/package.json`. |
| `ulidx` | `^2.4.1` | ULID generation for decision_id, task_id | Already installed at root. Re-declare in orchestrator if separate package.json. |

### No New Infrastructure

| Statement | Rationale |
|-----------|-----------|
| No new database | LanceDB handles `decisions` and `tasks` tables with same Apache Arrow schema patterns as existing tables. |
| No message queue | Wave-based parallel execution uses `Promise.all()` over SDK `query()` calls. No broker needed for single-user local-first use. |
| No new embedding service | Ollama nomic-embed-text (768-dim) already running. The `decisions.rationale` vector reuses the same embedding space. |
| No HTTP server | Orchestrator spawns Synapse as stdio subprocess via SDK `mcpServers` config. MCP stdio stays the interface. |

---

## Claude Agent SDK API Surface

### Installation

```bash
# In orchestrator/ directory
npm install @anthropic-ai/claude-agent-sdk
# or
bun add @anthropic-ai/claude-agent-sdk
```

Current stable version: `0.2.63` (last published 2026-02-28). The V2 preview interface (`send()` + `stream()`) exists but is not production-ready — use the V1 `query()` API.

### query() — primary entry point

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Returns Query which extends AsyncGenerator<SDKMessage, void>
const q = query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
});

for await (const message of q) {
  // Session init — MCP server connection status
  if (message.type === "system" && message.subtype === "init") {
    const synapse = message.mcp_servers.find(s => s.name === "synapse");
    if (synapse?.status !== "connected") {
      throw new Error(`Synapse MCP failed: ${synapse?.status}`);
    }
    sessionId = message.session_id;
  }
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
  if (message.type === "result" && message.subtype === "error_during_execution") {
    console.error("Agent failed");
  }
}
```

### Options — key fields for this project

```typescript
interface Options {
  // Spawn Synapse as MCP subprocess (stdio)
  mcpServers: Record<string, McpServerConfig>;

  // Per-agent tool allowlists (Synapse tools named mcp__synapse__<tool>)
  allowedTools: string[];
  disallowedTools?: string[];

  // Permission control
  // 'bypassPermissions' = fully autonomous (use for most agents)
  // 'acceptEdits' = auto-approve file edits without asking
  // 'plan' = planning only, no execution
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowDangerouslySkipPermissions?: boolean; // required when bypassPermissions

  // System prompt — inject skill content here at spawn time
  systemPrompt: string | { type: 'preset'; preset: 'claude_code'; append?: string };

  // Define 10 specialized subagents programmatically
  agents: Record<string, AgentDefinition>;

  // Hook-based quality gates
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  // Working directory (set to project root so Synapse MCP finds DB)
  cwd: string;

  // Session resume for multi-turn orchestration workflows
  resume?: string;
  forkSession?: boolean;   // fork instead of continuing original

  // Runtime — Bun is explicitly supported
  executable?: 'bun' | 'node' | 'deno';

  // Guard rails
  maxTurns?: number;
  maxBudgetUsd?: number;

  // Load .claude/skills/ from filesystem (optional — see Skill Loading section)
  settingSources?: ('user' | 'project' | 'local')[];

  // Model selection (can differ per agent tier)
  model?: string;  // e.g. "claude-opus-4-5" for orchestrator, "claude-sonnet-4-5" for workers
}
```

### mcpServers — spawning Synapse as stdio subprocess

```typescript
// In orchestrator Options:
mcpServers: {
  synapse: {
    command: "bun",
    args: ["run", "/absolute/path/to/synapse-mcp/src/index.ts"],
    env: {
      SYNAPSE_DB_PATH: process.env.SYNAPSE_DB_PATH ?? "./synapse.db"
    }
  }
}

// All Synapse tools accessible as mcp__synapse__<tool_name>:
// mcp__synapse__init_project
// mcp__synapse__store_document
// mcp__synapse__query_documents
// mcp__synapse__semantic_search
// mcp__synapse__get_smart_context
// mcp__synapse__link_documents
// mcp__synapse__update_document
// mcp__synapse__delete_document
// mcp__synapse__project_overview
// mcp__synapse__index_codebase
// mcp__synapse__search_code
// mcp__synapse__get_index_status
// mcp__synapse__store_decision     (new v2)
// mcp__synapse__query_decisions    (new v2)
// mcp__synapse__check_precedent    (new v2)
// mcp__synapse__create_task        (new v2)
// mcp__synapse__update_task        (new v2)
// mcp__synapse__get_task_tree      (new v2)

// Grant specific tool access per agent:
allowedTools: ["mcp__synapse__*"]                           // all Synapse tools
allowedTools: ["mcp__synapse__store_decision", "mcp__synapse__query_decisions"]
allowedTools: ["mcp__synapse__*", "Read", "Write", "Edit", "Bash"]  // + built-ins
```

### AgentDefinition — subagent configuration

```typescript
type AgentDefinition = {
  description: string;         // When to use this agent (natural language, Claude reads this)
  tools?: string[];            // Tool allowlist — inherits all parent tools if omitted
  disallowedTools?: string[];  // Explicit blocklist
  prompt: string;              // System prompt — inject skill content here
  model?: "sonnet" | "opus" | "haiku" | "inherit";
  mcpServers?: AgentMcpServerSpec[];  // Inherit parent's servers by string name or inline config
  skills?: string[];           // Skill names from .claude/skills/ (if using filesystem Skills)
  maxTurns?: number;
  criticalSystemReminder_EXPERIMENTAL?: string;
};

// AgentMcpServerSpec — reference parent server by name or inline new config
type AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>;

// Example — Executor agent
agents: {
  "executor": {
    description: "Implements a single task by writing or editing code files. Use when a task is assigned and ready for implementation.",
    prompt: BASE_EXECUTOR_PROMPT + "\n\n" + loadedSkillContent,
    tools: [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "mcp__synapse__update_task",
      "mcp__synapse__store_decision",
      "mcp__synapse__search_code",
    ],
    model: "inherit",   // uses parent orchestrator model
    maxTurns: 20
  },
  "validator": {
    description: "Validates implemented code against task acceptance criteria and existing decisions.",
    prompt: BASE_VALIDATOR_PROMPT + "\n\n" + loadedSkillContent,
    tools: [
      "Read", "Bash", "Glob", "Grep",
      "mcp__synapse__query_decisions",
      "mcp__synapse__check_precedent",
      "mcp__synapse__update_task",
    ],
    model: "inherit",
    maxTurns: 10
  }
}

// Subagents are invoked via the Task tool — include "Task" in parent allowedTools:
allowedTools: ["Task", "Read", "Glob", "mcp__synapse__*"]
```

### Hook types and signatures

```typescript
// All hook events (TypeScript SDK)
type HookEvent =
  | "PreToolUse"           // Before tool runs — USE FOR TIER ENFORCEMENT AND PRECEDENT CHECKS
  | "PostToolUse"          // After tool succeeds — USE FOR AUDIT TRAIL
  | "PostToolUseFailure"   // After tool fails
  | "UserPromptSubmit"     // Before prompt submitted — can inject context
  | "Stop"                 // Agent execution finished
  | "SessionStart"         // Session initialization (TypeScript only)
  | "SessionEnd"           // Session termination (TypeScript only)
  | "SubagentStart"        // Subagent initializing — track parallel spawning
  | "SubagentStop"         // Subagent completed — aggregate results
  | "Notification"         // Agent status messages (permission_prompt, idle_prompt, etc.)
  | "PreCompact"           // Before context compaction
  | "PermissionRequest"    // Custom permission handling
  | "TaskCompleted"        // Background task done (TypeScript only)
  | "TeammateIdle"         // (TypeScript only)
  | "ConfigChange"         // (TypeScript only)
  | "WorktreeCreate"       // (TypeScript only)
  | "WorktreeRemove";      // (TypeScript only)

// HookCallback signature
type HookCallback = (
  input: HookInput,             // typed union — cast to specific type in body
  toolUseId: string | undefined,
  context: { signal: AbortSignal }
) => Promise<HookOutput>;

// HookCallbackMatcher — wire hooks with optional regex filter on tool name
type HookCallbackMatcher = {
  matcher?: string;   // Regex against tool name. e.g. "^mcp__synapse__store_decision"
  hooks: HookCallback[];
  timeout?: number;   // seconds, default 60
};

// Hook inputs (cast inside callback body)
import {
  PreToolUseHookInput,
  PostToolUseHookInput,
  SubagentStopHookInput,
  NotificationHookInput
} from "@anthropic-ai/claude-agent-sdk";

// PreToolUse — tier enforcement example
const tierEnforcement: HookCallback = async (input, toolUseId, { signal }) => {
  const pre = input as PreToolUseHookInput;
  // pre.tool_name — e.g. "mcp__synapse__store_decision"
  // pre.tool_input — unknown, cast as needed
  // pre.session_id, pre.hook_event_name, pre.cwd

  if (isHighTierTool(pre.tool_name) && agentTier < 1) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Agent tier 2 cannot store decisions directly"
      }
    };
  }
  return {}; // allow
};

// PostToolUse — audit trail (fire-and-forget)
const auditLogger: HookCallback = async (input, toolUseId, { signal }) => {
  const post = input as PostToolUseHookInput;
  // post.tool_name, post.tool_input, post.tool_response
  logToActivityLog(post.tool_name, post.tool_input);
  return { async: true, asyncTimeout: 5000 }; // don't block agent
};

// PreToolUse — modify tool input
const redirectPaths: HookCallback = async (input, toolUseId, { signal }) => {
  const pre = input as PreToolUseHookInput;
  const toolInput = pre.tool_input as Record<string, unknown>;
  if (pre.tool_name === "Write" && typeof toolInput.file_path === "string") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",     // REQUIRED when using updatedInput
        updatedInput: { ...toolInput, file_path: `/sandbox${toolInput.file_path}` }
      }
    };
  }
  return {};
};

// Wire hooks in Options:
hooks: {
  PreToolUse: [
    { matcher: "^mcp__synapse__store_decision", hooks: [tierEnforcement] },
    { matcher: "^mcp__synapse__", hooks: [precedentCheck] },
  ],
  PostToolUse: [
    { hooks: [auditLogger] }  // no matcher = all tools
  ],
  SubagentStop: [
    { hooks: [resultAggregator] }
  ]
}

// Priority rule: deny > ask > allow (first deny wins across all hooks)
```

### Session management

```typescript
import { query, listSessions } from "@anthropic-ai/claude-agent-sdk";

// Capture session ID at init
let sessionId: string | undefined;
for await (const msg of query({ prompt, options })) {
  if (msg.type === "system" && msg.subtype === "init") {
    sessionId = msg.session_id;
  }
}

// Resume session (full context preserved — use for multi-turn PEV loop)
for await (const msg of query({
  prompt: "Validate the implementation from the previous turn",
  options: { resume: sessionId }
})) { ... }

// Fork session (explore alternative approach without losing original)
for await (const msg of query({
  prompt: "Try an alternative implementation",
  options: { resume: sessionId, forkSession: true }
})) { ... }

// Persist session to disk for later resume (default: true)
// options: { persistSession: false } to disable (e.g. short-lived utility agents)

// List past sessions for a project
const sessions = await listSessions({ dir: "/path/to/project", limit: 10 });
// SDKSessionInfo: { sessionId, summary, lastModified, firstPrompt, gitBranch, cwd }
```

### Query object methods (streaming input mode)

```typescript
// Query interface extends AsyncGenerator<SDKMessage, void>
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
  reconnectMcpServer(serverName: string): Promise<void>;
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
  stopTask(taskId: string): Promise<void>;
  close(): void;
}
```

---

## LanceDB Patterns for v2 Tables

### decisions table — vector search on rationale

Identical pattern to existing doc_chunks table. Use the same 768-dim nomic-embed-text embedding on the `rationale` field for semantic precedent search.

```typescript
// Add to src/db/schema.ts alongside existing schemas
import { Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from "apache-arrow";

export const DECISIONS_SCHEMA = new Schema([
  new Field("decision_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("title", new Utf8(), false),
  new Field("rationale", new Utf8(), false),         // embed this field
  new Field("outcome", new Utf8(), false),
  new Field("decision_type", new Utf8(), false),     // architecture|product|process|technical
  new Field("tier", new Int32(), false),             // 0|1|2|3 authority level
  new Field("status", new Utf8(), false),            // active|superseded|archived
  new Field("made_by", new Utf8(), false),           // agent name or "human"
  new Field("made_at", new Utf8(), false),
  new Field("task_id", new Utf8(), true),            // linked task (nullable)
  new Field("tags", new Utf8(), false),              // JSON array string
  new Field("vector", new FixedSizeList(768, new Field("item", new Float32(), true)), false),
]);

// Semantic precedent search — same pattern as existing semantic_search tool
const queryVector = await embedText(rationale); // 768-dim from Ollama
const results = await decisionsTable
  .search(queryVector)
  .where(`project_id = '${projectId}'`)
  .limit(5)
  .toArray();

// Hybrid precedent search (semantic + FTS on rationale) using existing RRF
// — follows same pattern as doc_chunks hybrid search in v1.0
```

### tasks table — recursive parent_id hierarchy

LanceDB uses DataFusion as its SQL engine. DataFusion does NOT support recursive CTEs (`WITH RECURSIVE`). This is a hard limit confirmed by the absence of `WITH RECURSIVE` from LanceDB SQL filter docs. The tree traversal must be done at the application layer.

**Pattern: iterative WHERE IN queries (depth-bounded)**

The task hierarchy has at most 4 levels (Epic → Feature → Component → Task). This means tree traversal needs at most 4 LanceDB queries — not a performance concern.

```typescript
// Add to src/db/schema.ts
export const TASKS_SCHEMA = new Schema([
  new Field("task_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("parent_id", new Utf8(), true),          // null for root (Epic) tasks
  new Field("title", new Utf8(), false),
  new Field("description", new Utf8(), false),
  new Field("task_type", new Utf8(), false),          // epic|feature|component|task
  new Field("status", new Utf8(), false),             // pending|in_progress|done|blocked
  new Field("depth", new Int32(), false),             // 0=epic,1=feature,2=component,3=task
  new Field("assigned_agent", new Utf8(), true),
  new Field("decision_ids", new Utf8(), false),       // JSON array of linked decision IDs
  new Field("acceptance_criteria", new Utf8(), false),
  new Field("created_at", new Utf8(), false),
  new Field("updated_at", new Utf8(), false),
]);

// Application-level tree traversal (max 4 LanceDB queries for max-depth tree)
async function getTaskTree(tasksTable: Table, rootId: string): Promise<Task[]> {
  const all: Map<string, Task> = new Map();

  // Fetch root
  const roots = await tasksTable
    .query()
    .where(`task_id = '${rootId}'`)
    .toArray();
  roots.forEach(r => all.set(r.task_id, r));

  let frontier: string[] = roots.map(r => r.task_id);

  // Traverse down level by level (max 4 iterations for 4-level hierarchy)
  while (frontier.length > 0) {
    const ids = frontier.map(id => `'${id}'`).join(", ");
    const children = await tasksTable
      .query()
      .where(`parent_id IN (${ids})`)
      .toArray();

    frontier = [];
    for (const child of children) {
      if (!all.has(child.task_id)) {
        all.set(child.task_id, child);
        frontier.push(child.task_id);
      }
    }
  }

  return Array.from(all.values());
}

// Get siblings (tasks at same level under same parent)
async function getSiblings(tasksTable: Table, parentId: string): Promise<Task[]> {
  return tasksTable
    .query()
    .where(`parent_id = '${parentId}'`)
    .toArray();
}
```

---

## Skill Loading Pattern

The Agent SDK supports skills via two mechanisms. Use **programmatic prompt injection** — not the filesystem SKILL.md pattern — for orchestrator-controlled deterministic behavior.

### Why NOT the filesystem Skills mechanism

The official `settingSources: ['project']` + SKILL.md + `allowedTools: ["Skill"]` pattern makes skills model-invoked: Claude autonomously decides when to use them based on the skill `description` field. This is non-deterministic. The project requires skills "injected at runtime" (PROJECT.md) — meaning the orchestrator controls when and which skill content reaches each agent. Direct prompt injection achieves this.

### Recommended: inject skill content into AgentDefinition.prompt at spawn time

```typescript
// skill-registry.ts

interface Skill {
  name: string;
  domain: string;              // e.g. "react-frontend", "postgres-backend"
  systemPromptContent: string; // Markdown injected into agent system prompt
  qualityCriteria: string;     // What "done" looks like for this domain
  vocabulary: Record<string, string>; // Domain-specific terms map
}

// Load skill content from a SKILL.md file or from Synapse docs table
async function loadSkillForDomain(domain: string): Promise<Skill> {
  // Option A: read from .claude/skills/{domain}/SKILL.md
  const skillPath = path.join(cwd, ".claude/skills", domain, "SKILL.md");
  const content = await fs.readFile(skillPath, "utf-8");
  return parseSkillMarkdown(content);

  // Option B: query from Synapse docs table (category = "skill")
  // const rows = await queryDocuments({ category: "skill", tags: domain });
}

// Inject at agent spawn time (deterministic — always applied, not model-invoked)
const skill = await loadSkillForDomain(projectConfig.domain);

const executorAgent: AgentDefinition = {
  description: "Implements a single task by writing or editing code files.",
  prompt: [
    BASE_EXECUTOR_PROMPT,
    "",
    "## Domain Skills",
    skill.systemPromptContent,
    "",
    "## Quality Criteria",
    skill.qualityCriteria,
  ].join("\n"),
  tools: [...allowedExecutorTools],
  model: "inherit",
  maxTurns: 20
};

// Multiple skills can be composed:
const composedSkillContent = [primarySkill, secondarySkill]
  .map(s => s.systemPromptContent)
  .join("\n\n---\n\n");
```

This approach:
- Deterministic: skill always applied, every time, to every spawned instance
- Zero new dependencies: string concatenation into prompt
- Composable: multiple skills combined via string join
- Inspectable: log injected prompt at orchestrator startup
- Testable: no SDK filesystem loading to mock

---

## Orchestrator Package Structure

```
orchestrator/
  package.json              # Separate package — keeps MCP server lean
  tsconfig.json
  src/
    index.ts                # Entry: read config, spawn Synapse, start PEV loop
    agents/
      definitions.ts        # 10 AgentDefinition objects
      skills.ts             # Skill registry and loader
    hooks/
      tier-enforcement.ts   # PreToolUse: block cross-tier tool calls
      audit-trail.ts        # PostToolUse: async fire-and-forget to activity_log
      precedent-check.ts    # PreToolUse: warn when decision precedent exists
    workflow/
      pev.ts                # Plan-Execute-Validate loop (max 3 iterations)
      waves.ts              # Promise.all() parallel wave execution
    config/
      trust-matrix.ts       # Trust-Knowledge Matrix (from YAML/JSON config file)
```

### orchestrator/package.json

```json
{
  "name": "synapse-orchestrator",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.63",
    "zod": "^4.0.0",
    "ulidx": "^2.4.1"
  },
  "devDependencies": {
    "@types/node": "latest",
    "bun-types": "latest",
    "typescript": "latest"
  }
}
```

WHY separate `orchestrator/package.json` (not in root):
- Keeps `@anthropic-ai/claude-agent-sdk` out of the Synapse MCP server process's dependency tree — Synapse has no knowledge of what orchestrates it
- Avoids circular confusion: Synapse is a subprocess of orchestrator, not a peer
- tree-sitter native binary postinstall script in root is unaffected
- Orchestrator installs independently with `cd orchestrator && bun install`

WHY not a Bun workspace:
- tree-sitter requires `node scripts/setup-tree-sitter.js` postinstall; Bun workspaces would complicate postinstall scoping
- Simple is better — two separate `bun install` calls, no workspace config to debug

---

## Bun Compatibility

Bun is explicitly first-class for the Claude Agent SDK:

- Anthropic acquired Bun (announced 2026). SDK Bun support is a strategic priority.
- The `options.executable: 'bun'` field is documented in official SDK reference — not an afterthought.
- `@anthropic-ai/sdk` (the underlying client SDK) supports Bun 1.0+.
- Running the orchestrator with `bun run src/index.ts` works without issues.

**One known caveat:** GitHub issue #150 (closed Feb 19, 2026) — when bundling with `bun build`, the SDK fails to find its internal `cli.js` because `import.meta.url` resolves to a virtual Bun filesystem path. **Resolution:** Use `bun run` (not `bun build`), or set `options.pathToClaudeCodeExecutable` explicitly. Since the orchestrator is run with `bun run src/index.ts`, this caveat does not apply.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@anthropic-ai/claude-agent-sdk` | Custom loop with `@anthropic-ai/sdk` | SDK provides `query()`, subagents, hooks, MCP client, session management. Building from scratch is months of work and won't be maintained by Anthropic. |
| Direct `systemPrompt` prompt injection for skills | `settingSources + SKILL.md` filesystem pattern | SKILL.md is model-invoked (Claude decides when to use skills). Project requires deterministic orchestrator-controlled injection at agent spawn time. |
| Application-level iterative `WHERE IN` for task tree | Recursive CTE in LanceDB | LanceDB/DataFusion does not support `WITH RECURSIVE`. Max 4 depth levels = max 4 queries — not a scalability concern. |
| Separate `orchestrator/package.json` | Add SDK to root package.json | Keeps MCP server process lean. Clean boundary: Synapse knows nothing about the agent SDK orchestrating it. |
| `Promise.all()` for parallel wave execution | External queue (BullMQ, Redis) | Single-user, local-first. SDK `query()` calls are async — `Promise.all()` is sufficient. |
| V1 `query()` API | V2 SDK preview `send()` + `stream()` | V2 is explicitly labeled "preview" — not production-ready. V1 is stable and fully documented. |
| `zod` v4 (already in project) | `zod` v3 | SDK peer dep supports both v3.24.1+ and v4.0.0+. Project already uses v4. No conflict. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain / LlamaIndex agent frameworks | Conflicts with SDK's agent loop abstractions; redundant | `@anthropic-ai/claude-agent-sdk` only |
| Redis / BullMQ / any queue broker | Unnecessary for single-user local-first orchestrator | `Promise.all()` over async `query()` calls |
| PostgreSQL / SQLite for orchestrator state | LanceDB already handles decisions + tasks with vector search baked in | New `decisions` and `tasks` tables in existing LanceDB |
| HTTP server for orchestrator (express, fastify) | MCP stdio transport is the interface; no web server needed | stdio process only |
| SDK V2 preview interface (`send()` + `stream()`) | Explicitly labeled "preview" / not production-ready | V1 `query()` API — stable, documented, current |
| `bun build` to bundle the orchestrator | Known compatibility issue with SDK's `import.meta.url` CLI path resolution | `bun run src/index.ts` directly |
| Any second embedding provider | Would fracture the 768-dim vector space; break existing hybrid search | Ollama nomic-embed-text only (existing constraint) |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.63` | Bun 1.0+, Node 18+ | `executable: 'bun'` explicitly supported in Options. Use `bun run`, not `bun build`. |
| `zod` | `^4.0.0` | SDK peer dep `^3.24.1 OR ^4.0.0` | Project uses v4; SDK supports both. No conflict. Declare in orchestrator package.json. |
| `@lancedb/lancedb` | `0.26.2` (existing, unchanged) | No change | Same version handles `decisions` and `tasks` tables with identical schema pattern. |
| `@anthropic-ai/claude-agent-sdk` | any | `@anthropic-ai/sdk` | SDK wraps the client SDK internally; do NOT install `@anthropic-ai/sdk` separately in the orchestrator to avoid version conflicts. |

---

## Installation

```bash
# Orchestrator only — no changes to root package.json
cd /path/to/project_mcp/orchestrator
bun install

# Or individual installs:
bun add @anthropic-ai/claude-agent-sdk zod ulidx
bun add -d typescript @types/node bun-types
```

---

## Sources

- [Agent SDK TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — `query()` signature, `Options` type (all 40+ fields), `AgentDefinition`, `Query` interface methods, hook types. HIGH confidence (official Anthropic docs, fetched 2026-03-01).
- [MCP in the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/mcp) — `mcpServers` config, stdio transport, tool naming `mcp__<server>__<tool>`, connection error handling. HIGH confidence (official Anthropic docs).
- [Agent SDK hooks](https://platform.claude.com/docs/en/agent-sdk/hooks) — full HookEvent enum, `HookCallback` signature, `PreToolUseHookInput`, `PostToolUseHookInput`, `permissionDecision` output shape, deny > ask > allow priority. HIGH confidence (official Anthropic docs).
- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview) — subagents via Task tool, session resume pattern, V1 vs V2 preview distinction. HIGH confidence (official Anthropic docs).
- [Agent SDK Skills](https://platform.claude.com/docs/en/agent-sdk/skills) — Skills are filesystem-based and model-invoked (confirms deterministic injection requires prompt concatenation). HIGH confidence (official Anthropic docs).
- [Bun joins Anthropic](https://bun.com/blog/bun-joins-anthropic) — acquisition confirmed; `executable: 'bun'` is strategic priority. HIGH confidence (official announcement).
- [Bun bundling issue #150](https://github.com/anthropics/claude-agent-sdk-typescript/issues/150) — `bun build` path resolution issue; CLOSED Feb 19, 2026; `bun run` unaffected. MEDIUM confidence (GitHub issue, resolved).
- npm WebSearch — version 0.2.63 current as of 2026-02-28. MEDIUM confidence (WebSearch result).
- [LanceDB SQL filtering docs](https://docs.lancedb.com/search/filtering) — DataFusion-based SQL; `WITH RECURSIVE` absent from docs; recursive CTEs confirmed unsupported. MEDIUM confidence (official LanceDB docs + DataFusion upstream knowledge).
- [AGNT.gg SDK cheatsheet](https://agnt.gg/articles/claude-agent-sdk-cheatsheet) — confirmed `HookCallbackMatcher` shape, `PermissionMode` enum values, `Options` field list. MEDIUM confidence (community source, verified against official docs).
- [DeepWiki reference](https://deepwiki.com/anthropics/claude-agent-sdk-typescript/9-reference) — Node.js 18+ minimum, Zod peer dep `^3.24.1 OR ^4.0.0`. MEDIUM confidence (community aggregated, cross-referenced with official).

---

## v1.0 Baseline Stack (unchanged)

The following is preserved from the original 2026-02-27 research for reference. Nothing below changes for v2.0.

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x latest | Primary language |
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP server, stdio transport |
| `@lancedb/lancedb` | 0.26.2 | Embedded vector database |
| `tree-sitter` | 0.25.1 | AST parsing |
| `tree-sitter-typescript` | 0.23.2 | TypeScript grammar |
| `tree-sitter-python` | 0.25.0 | Python grammar |
| `tree-sitter-rust` | 0.24.0 | Rust grammar |
| `zod` | 4.x | Input validation |
| `ollama` | latest | Embedding client |
| `ignore` | latest | .gitignore-aware file filtering |
| `ulidx` | 2.4.1 | ID generation |
| `pino` | latest | Logging |
| `@biomejs/biome` | latest | Linting and formatting |
| Bun | 1.x | Runtime and test runner |

---

*Stack research for: Synapse v2.0 Agentic Framework (orchestrator layer)*
*Researched: 2026-03-01*
