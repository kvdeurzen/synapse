# Phase 16: User Journey Commands - Context

**Gathered:** 2026-03-03
**Status:** In progress (partially discussed — resume with /gsd:discuss-phase 16)

<domain>
## Phase Boundary

A new user has a clear, documented path from zero to running their first PEV workflow — slash commands cover every step. This phase creates the commands and a user journey document.

</domain>

<decisions>
## Implementation Decisions

### User Journey Stages
- **Install → Init+Map → Goal → Execute** is the 4-stage flow
- Init and Map happen together (init triggers first index)
- Goal-setting and Execution are separate stages, each with sub-steps

### Audience
- Primary audience: developer adopting Synapse for their project
- Two use cases: starting a new project with Synapse, or adding Synapse to an existing project
- Not focused on evaluators/tire-kickers — assumes commitment to adopt

### Goal Stage Architecture
- **Two separate commands**, not one monolith:
  1. **Brainstorming/requirements command** — Conversational. User and Claude brainstorm, align, and produce measurable outcomes. Operates at Tier 0-1 (project/epic level). This discussion fills the context window.
  2. **Decomposition command** — Takes stored requirements as input. Breaks down into features → tasks. Operates at Tier 1-3. Requires fresh context window (/clear after brainstorming).
- The split is driven by context window constraints: brainstorming is rich conversation that consumes context, decomposition needs room for research and planning

### Goal Output Format
- Brainstorming command produces a **Synapse document** stored via `store_document`
- Decomposition command fetches it by doc_id — survives /clear, queryable via semantic search
- No local file needed; Synapse is the single source of truth

### Claude's Discretion
- (Not yet discussed — resume to complete)

</decisions>

<specifics>
## Specific Ideas

- Goal-setting should work toward an outline that becomes deconstructable into epics/features — not a single-line command
- Each decomposition level (epic → features → tasks) needs proper research and refinement
- User potentially works together with Synapse to refine next steps while execution is happening
- A good brainstorming discussion can fill the context window, so session clearing between stages is expected

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse:new-goal` command: Creates an epic from a goal — could become the decomposition command or be replaced
- `synapse:status` command: Shows work stream status — pattern for command markdown files with frontmatter
- `synapse-startup.js`: Already reads project.toml, injects project_id — init command creates what startup reads
- `init_project` MCP tool: Creates LanceDB tables and seeds starter documents
- `index_codebase` MCP tool: Scans files, parses AST, creates embeddings

### Established Patterns
- Slash commands are markdown files in `packages/framework/commands/synapse/` with frontmatter (name, description, allowed-tools)
- Commands use MCP tools via `mcp__synapse__*` tool names
- Hooks are ESM `.js` files reading stdin JSON, writing stdout JSON

### Integration Points
- `.synapse/config/project.toml`: Created by /synapse:init, read by synapse-startup.js
- `store_document` MCP tool: Brainstorming output stored here
- `synapse-orchestrator` agent: Receives decomposed goals for PEV execution
- `packages/framework/commands/synapse/`: Where new command files live

</code_context>

<deferred>
## Deferred Ideas

None yet — discussion stayed within phase scope so far.

</deferred>

---

## Remaining Gray Areas (Not Yet Discussed)

The following areas still need discussion before this context is complete:

1. **/synapse:init flow** — Auto-detect project name? Skill selection? CLAUDE.md amendment content? Init+Map combined behavior?
2. **/synapse:map UX** — Progress feedback format, Ollama-not-running handling
3. **Command naming** — What are the brainstorming and decomposition commands called? Relationship to existing `synapse:new-goal`
4. **Execution stage** — What command starts PEV execution? How does it differ from decomposition?
5. **User journey document** — Where does it live? Format? Level of detail?

---

*Phase: 16-user-journey-commands*
*Context gathered: 2026-03-03 (partial — resume to complete)*
