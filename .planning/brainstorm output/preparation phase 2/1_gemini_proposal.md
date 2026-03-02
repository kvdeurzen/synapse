🛸 Project Vision: The "Nexus" Agent Framework

Internal Code Name: Project Brain

Objective: A high-level project management and execution framework that allows a "Creative Lead" (User) to direct a swarm of agents through a persistent, database-backed context, minimizing cognitive load and maximizing architectural consistency.
💎 Fundamental Principles

    Context Externalization (Context-as-a-Service)
    To prevent "Context Window Bloat," project information, architectural decisions, and task states are stored in a central database. Agents "check out" only the specific context needed for their granular task, keeping them lean and accurate.

    Macro-to-Micro Refinement
    Projects follow a dual-phase lifecycle:

        Phase 1: Digital Twin: High-level mapping and dependency discovery.

        Phase 2: Recursive Funnel: Detailed task decomposition into executable units.

    The "Case Law" of Development (Decision Precedent)
    Every choice—from product strategy to variable naming—is logged. Future agents must query the project's "Case Law" before proposing new directions, ensuring that the project doesn't drift into inconsistency.

    Variable Oversight (The Trust-Knowledge Matrix)
    User involvement is a gradient. The framework adjusts its "interruption frequency" based on the user's Knowledge of a domain and their Trust in the agent's current reliability.

    Agentic Gatekeeping
    A specialized layer of "Validator Agents" enforces constraints, runs tests, and triages decisions before they ever reach the user dashboard.

🚦 Decision Tiers & Authority
Tier	Category	Focus	User Involvement
Tier 0	Product Strategy	The "What" and "Why"	Mandatory
Tier 1	Architecture	Structural "Hard" Choices	Strategic Approval
Tier 2	Functional/Design	UX/UI and Logic Patterns	Veto Power
Tier 3	Execution	Boilerplate and Syntax	Autopilot (Logged)
🗄️ Initial Database Schema: "The Decision Engine"
1. Project_Knowledge_Graph

Manages the "Digital Twin" and task hierarchy.

    node_id: UUID (PK)

    type: ENUM (Epic, Feature, Component, Task)

    status: ENUM (Draft, Validated, In-Progress, Completed)

    parent_id: UUID (Self-reference for the Recursive Funnel)

    context_blob: JSONB (Technical requirements, constraints, and metadata)

2. Decision_Ledger

The "Case Law" library for project-wide consistency.

    decision_id: UUID (PK)

    tier: INT (0-3)

    subject: STRING (e.g., "Primary_Frontend_Framework")

    choice: STRING (e.g., "Next.js")

    rationale: TEXT (The "Why" provided by the agent or user)

    is_precedent: BOOLEAN (If true, it enforces future agent behavior)

    source_task_id: UUID (Link to the task where the decision was made)

3. User_Authority_Matrix

Manages the "Trust & Knowledge" interface.

    domain: STRING (e.g., "Frontend", "Backend", "Security")

    involvement_mode: ENUM (Autopilot, Co-Pilot, Advisory)

    trust_score: FLOAT (0.0 - 1.0; grows as the user approves work)

    gatekeeper_required: BOOLEAN (Mandatory agentic validation toggle)