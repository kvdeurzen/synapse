# Synapse

An MCP server that gives AI agents persistent, searchable memory over project knowledge and source code — backed by LanceDB with semantic and hybrid search.

## What It Does

Synapse exposes 21 MCP tools that let AI agents store, query, and search two kinds of project data:

- **Project knowledge** — requirements, architecture decisions, design patterns, glossaries, and any other document an agent produces during development. Documents are chunked, embedded, versioned, and searchable.
- **Source code** — TypeScript, Python, and Rust files are parsed with tree-sitter into AST-aware chunks (functions, classes, methods), embedded, and indexed incrementally. Import relationships are auto-extracted into a knowledge graph.

Agents retrieve context through hybrid search (semantic vectors + full-text via Reciprocal Rank Fusion) and a two-phase smart context tool that first returns lightweight overviews, then fetches detailed content on demand — keeping token usage efficient.

## Why

AI agents working on codebases face two problems:

1. **No memory between sessions.** Context is lost when conversations end. Decisions, architecture rationale, and project conventions vanish.
2. **Context window waste.** Dumping entire repositories into a prompt is expensive and noisy. Agents need the right context, not all the context.

Synapse solves both. It stores project knowledge persistently in LanceDB and lets agents retrieve only what's relevant via semantic search — so they get the context they need without burning tokens on everything else.

## How It Works

Synapse organizes work into a recursive hierarchy — **Project > Epic > Feature > Work Package** — where every layer goes through the same cycle:

**Refine → Plan → Execute → Done**

- **Refine**: Brainstorm, set requirements, make decisions. User involvement is highest here at upper layers.
- **Plan**: Decompose into children, resolve dependencies, ensure children can execute autonomously.
- **Execute**: At every layer except Work Package, this means spawning children that each run their own RPEV cycle. At Work Package level, it means writing code.
- **Done**: The item meets its requirements.

The system drives, the user unblocks. After initial project setup, agents work autonomously on the highest-priority items they can. Your primary interaction is making decisions that require human judgment — the system surfaces what needs your attention, and you navigate to those moments.

For the full walkthrough from install to daily use, see the [User Journey](docs/user-journey.md).

## Key Principles

- **Unified vector memory.** All project information — documents, code, decisions, tasks — lives in one embedded database. Agents query it semantically instead of ingesting whole repos.
- **Decision precedent ("Case Law").** Architectural choices are stored as searchable decision objects with tier-based authority (Tier 0: product strategy through Tier 3: implementation). Agents check precedent before acting, maintaining architectural consistency across sessions.
- **Macro-to-micro refinement.** Work decomposes recursively — epics to features to components to tasks — with each level small enough to fit a context window.
- **Adaptive oversight.** User involvement is a gradient, not a toggle. A Trust-Knowledge Matrix configures per-domain autonomy levels (autopilot / co-pilot / advisory) based on domain and decision impact.
- **Agent pool execution.** A configurable number of agent slots work autonomously on the highest-priority unblocked items. The system assigns work automatically — you shape vision and make decisions, agents handle implementation.
- **Escalation, not guessing.** Agents follow the plan. If execution surfaces something the plan didn't cover, agents escalate to their parent layer — and ultimately to you — rather than deciding on their own.
- **Fail-fast writes, graceful reads.** Write operations (storing documents, indexing code) require the embedding service and fail immediately if it's unavailable — no silent data corruption. Read operations continue working on existing data.

## Architecture

Synapse is an MCP server that communicates via stdio. It runs as a subprocess of Claude Code (or any MCP client) and stores everything locally in LanceDB — no external database needed.

```
MCP Client (Claude Code, Cursor, etc.)
    │
    │ stdio (JSON-RPC)
    │
Synapse MCP Server
    ├── 21 MCP tools (documents, search, code, decisions, tasks)
    ├── Embedding service (Ollama / nomic-embed-text / 768-dim)
    ├── Chunking engine (category-specific strategies)
    ├── AST parser (tree-sitter for TS/Python/Rust)
    └── LanceDB (8 tables, vector + FTS indexes)
```

### MCP Tools

| Category | Tools | Purpose |
|----------|-------|---------|
| **Documents** | `store_document`, `query_documents`, `update_document`, `delete_document`, `project_overview` | Store and manage project knowledge with versioning and lifecycle tracking |
| **Search** | `semantic_search`, `get_smart_context`, `get_related_documents` | Find relevant context via vector search, hybrid search, and graph traversal |
| **Code** | `index_codebase`, `search_code`, `get_index_status` | AST-aware code indexing with incremental updates and hybrid code search |
| **Relationships** | `link_documents` | Create typed relationships between documents for knowledge graph traversal |
| **Decisions** | `store_decision`, `query_decisions`, `check_precedent` | Store architectural decisions with tier authority and semantic precedent matching |
| **Tasks** | `create_task`, `update_task`, `get_task_tree` | Recursive task hierarchy (Epic/Feature/Component/Task) with cascade status propagation |
| **Project** | `init_project`, `delete_project` | Initialize and manage projects with multi-project support |

### Database Tables

| Table | Purpose |
|-------|---------|
| `documents` | Document chunks with embeddings, versioning, lifecycle states |
| `doc_chunks` | Fine-grained document sections for precise retrieval |
| `code_chunks` | AST-extracted code symbols with embeddings and metadata |
| `relationships` | Typed edges between documents/code (manual + auto-generated from imports) |
| `decisions` | Tiered architectural decisions with embedded rationale |
| `tasks` | Recursive task tree with dependency tracking and status propagation |
| `project_meta` | Project configuration and indexing state |
| `activity_log` | Audit trail of all mutations |

## Prerequisites

- **Bun** — [bun.sh](https://bun.sh) (any version)
- **Ollama** — [ollama.ai](https://ollama.ai) running locally with the `nomic-embed-text` model

```sh
ollama pull nomic-embed-text
```

## Installation

One command installs Synapse into your project:

```sh
curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh | bash
```

This checks prerequisites, copies agents/hooks/commands/skills/server into `.claude/`, generates `settings.json` and `.mcp.json`, installs server dependencies, and runs a smoke test.

### What gets created

```
.claude/
  agents/          # 11 agent definitions
  hooks/           # 7 hook scripts + lib/
  commands/synapse/ # 5 slash commands
  skills/          # 18 skill definitions
  server/          # Synapse MCP server
  settings.json    # Hook configuration (gitignored)
.synapse/
  config/          # Project configuration (committed)
.mcp.json          # MCP server entry (gitignored)
```

Each developer runs `install.sh` — `.claude/settings.json` and `.mcp.json` are gitignored.

### Install options

| Flag | Description |
|------|-------------|
| `--local` | Install into current project only (default) |
| `--global` | Install to `~/.synapse/` as shared source, then wire into current project |
| `--quiet` | Suppress step-by-step output, only errors and final pass/fail |
| `--smoke-test` | Run only the smoke test (skip install) |
| `--version TAG` | Install a specific release (default: latest) |

Re-running `install.sh` detects an existing install, prompts before updating, and preserves your `.synapse/config/` customizations.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNAPSE_DB_PATH` | `.synapse/data/synapse.db` | LanceDB database directory |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama service endpoint |
| `EMBED_MODEL` | `nomic-embed-text` | Embedding model (768 dimensions) |

### Getting started

After install, run `/synapse:init` in Claude Code to initialize your project. For the full walkthrough — from install to daily use — see the [User Journey](docs/user-journey.md).

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Database:** LanceDB (embedded, zero-config)
- **Embeddings:** Ollama with nomic-embed-text (768 dimensions)
- **MCP SDK:** @modelcontextprotocol/sdk
- **Code parsing:** tree-sitter (TypeScript, Python, Rust grammars)
- **Validation:** Zod
- **Search:** Hybrid semantic + full-text via Reciprocal Rank Fusion

## Testing

```sh
bun test
```

612 tests across 37 test files. Tests cover tool behavior, chunking strategies, embedding integration, search quality, code indexing, decision tracking, task hierarchy, and edge cases.

## Project Status

**v1.0 Data Layer** — shipped. 21 MCP tools, 8 LanceDB tables, complete document and code search pipeline.

**v2.0 Agentic Framework** — shipped. Coordination layer on top of the data layer:

- [x] Decision tracking with semantic precedent search (Phase 10)
- [x] Recursive task hierarchy with cascade propagation (Phase 11)
- [x] Framework bootstrap with TOML config and test harness (Phase 12)
- [x] 10 specialized agents, skill loading system, trust matrix (Phase 13)
- [x] Quality gates and Plan-Execute-Validate workflow (Phase 14)

**v3.0 Working Prototype** — in progress. Wiring everything into a usable end-to-end product:

- [x] User journey definition — install → init → map → refine → status → focus (Phase 16)
- [x] Tech debt resolution (Phase 17)
- [x] RPEV orchestration — readiness gating, auto-queue, trust config expansion (Phase 18)
- [x] Agent prompts — MCP-first, level-aware behavior, handoff protocol (Phase 19)
- [x] Skill system — dynamic injection, language-agnostic agents (Phase 20)
- [x] Agent pool — configurable slots, auto-assignment, work queue (Phase 21)
- [x] Installation & setup — install script, smoke test, usage manual (Phase 22)
- [ ] Visibility + notifications — statusline, blocked counter (Phase 23)
- [ ] E2E workflow validation — full RPEV cycle on a real project (Phase 24)

Agents are level-aware: Brainstorm, Planner, Executor, Validator, and others adjust their rigor, criteria, and focus based on hierarchy level (Project → Epic → Feature → Work Package). Coordinated through a skill loading system, configurable trust tiers, and the recursive RPEV cycle.

## License

MIT
