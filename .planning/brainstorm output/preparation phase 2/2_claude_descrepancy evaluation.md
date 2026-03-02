 Major Discrepancies

  1. Fundamentally Different Scope

  - Synapse (built): An MCP tool server — stores project knowledge and code, provides search/retrieval tools for agents to call.
  - Nexus (proposed): An agent orchestration framework — manages swarms of agents, task decomposition, decision authority, and user trust levels.

  These are different layers. Synapse is plumbing (storage + retrieval); Nexus is orchestration (who does what, when, and with what authority).

  2. Database Schema — No Overlap

  ┌───────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────┐
  │             Synapse (exists)              │                          Nexus (proposed)                           │
  ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ documents (knowledge chunks + embeddings) │ Project_Knowledge_Graph (hierarchical: Epic→Feature→Component→Task) │
  ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ code_chunks (AST-parsed source code)      │ Decision_Ledger (tiered decision log with precedent)                │
  ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ relationships (doc-to-doc links)          │ User_Authority_Matrix (trust scores per domain)                     │
  ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ project_meta (key-value store)            │ —                                                                   │
  ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ activity_log (operation history)          │ —                                                                   │
  └───────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────┘

  The Nexus schema is relational (ENUM, JSONB, BOOLEAN — PostgreSQL-style). Synapse uses LanceDB (embedded vector DB with Apache Arrow schemas). These are incompatible
   storage paradigms.

  3. Concepts That Don't Exist in Synapse

  - Decision Tiers (0-3): Synapse has no concept of authority levels or decision classification. It logs activity but not decisions with rationale and precedent.
  - Trust-Knowledge Matrix: No user modeling at all in Synapse. Every tool call is treated equally.
  - Validator Agents / Gatekeeping: Synapse is passive — it responds to tool calls. It doesn't initiate validation or enforce constraints.
  - Task Hierarchy (Epic→Task): Synapse stores flat documents by category (architecture, decision, task, etc.) but has no recursive parent-child decomposition.
  - "Digital Twin" / "Recursive Funnel": These lifecycle phases have no counterpart in the current implementation.

  4. Concepts in Synapse Not Addressed by Nexus

  - Code indexing & AST parsing (tree-sitter for TS/Python/Rust)
  - Embedding & vector search (Ollama, semantic/hybrid/fulltext)
  - Smart context assembly (two-phase retrieval with token budgets)
  - Document versioning (supersession chains)
  - Graph traversal (1-hop relationship expansion)

  Nexus doesn't mention how agents actually retrieve knowledge — it assumes a context_blob JSONB field but has no search/retrieval strategy.

  5. Technology Assumptions

  - Synapse: LanceDB, Bun, MCP SDK, Ollama embeddings
  - Nexus: Implies PostgreSQL (ENUM, JSONB), no mention of embeddings, vector search, or MCP protocol
