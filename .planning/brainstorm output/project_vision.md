# 🛸 Project Vision: The "Nexus" Agent Framework
**Internal Code Name:** Synapse-Nexus  
**Status:** Architecture Refined (v2.0 - LanceDB/MCP Optimized)

---

## 💎 Fundamental Principles

### 1. Unified Vector Memory (Synapse-First)
To prevent "Context Window Bloat," all project information—code, task hierarchies, and architectural decisions—is stored in **LanceDB**. Agents do not ingest whole repositories; they use semantic search to "check out" relevant shards of code and the specific "Case Law" required for their task.

### 2. Macro-to-Micro Refinement
Projects follow a recursive refinement lifecycle:
* **Digital Twin Phase:** Agents build a high-level "Knowledge Graph" of the project structure in LanceDB before writing production code.
* **Recursive Funnel Phase:** Large features are broken down into granular, executable tasks with strict parent-child relationships (Task Hierarchy) to ensure context fits within standard LLM windows.

### 3. The "Case Law" of Development (Decision Precedent)
Every choice (from Product Strategy to Implementation) is stored as a **Decision Object**. Before any agent begins a task, it queries the "Decision Ledger" to ensure its work aligns with established precedents. This maintains architectural integrity across a distributed agent swarm.

### 4. Adaptive Oversight (The Trust-Knowledge Matrix)
User involvement is a gradient, not a toggle. The system adjusts its interruption frequency based on:
* **User Trust:** Autonomy granted to specific domains (e.g., Frontend vs. Security).
* **User Knowledge:** The user’s expertise level in a specific technical area.
* **Decision Tier:** The inherent impact/risk of the choice.

### 5. MCP-Driven Gatekeeping
The **Model Context Protocol (MCP)** acts as the framework's nervous system. **Validator Agents** serve as automated gatekeepers, using MCP tools to verify code against project constraints and "accept" work back into the core database.

---

## 🚦 Decision Tiers & Authority

| Tier | Category | Impact | Involvement Mode |
| :--- | :--- | :--- | :--- |
| **Tier 0** | **Product Strategy** | High (The "What/Why") | **User Mandatory** |
| **Tier 1** | **Architecture** | High (Structure/Logic) | **Strategic Approval** |
| **Tier 2** | **Functional/Design** | Medium (UX/Patterns) | **Veto Power** |
| **Tier 3** | **Execution** | Low (Boilerplate/Syntax) | **Autopilot (Logged)** |

---

## 🗄️ Database Architecture (LanceDB Schema)



### 1. `Project_Context` (Hybrid Search Collection)
* **vector:** Semantic embedding of requirements or code.
* **metadata.type:** `task` | `decision` | `code_snippet`
* **metadata.hierarchy_path:** (e.g., `epic_01/feature_02/task_03`) for recursive retrieval.
* **metadata.status:** `draft` | `validated` | `accepted`.

### 2. `Decision_Ledger`
* **metadata.tier:** (0–3)
* **metadata.rationale:** The "Why" behind the choice to preserve creative intent.
* **metadata.precedent_status:** `enforced` | `deprecated` | `suggestion`.

### 3. `User_Authority_Matrix` (Registry)
* **domain:** (e.g., `frontend`, `security`, `devops`)
* **mode:** `autopilot` | `co-pilot` | `advisory`
* **trust_score:** (0.0–1.0) Influences the "Ambiguity Threshold" for agent questions.

---

## 🛠️ The Integrated Workflow

1.  **Brainstorming (Chat):** User defines a goal; Product Agent creates Tier 0 Decision Objects.
2.  **Mapping (Graph View):** Architect Swarm builds the "Digital Twin" in LanceDB; User validates high-level nodes.
3.  **Decomposition:** Scoping Agent uses the Recursive Funnel to create Task Objects.
4.  **Execution:** Coding Agents query Synapse for semantic context + Precedent Decisions.
5.  **Validation:** Gatekeeper Agent uses MCP tools to run tests and check alignment. 
6.  **Acceptance:** Once validated, code and new decisions are committed to the "Brain" as new precedents.