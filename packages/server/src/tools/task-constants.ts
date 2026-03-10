/**
 * Task management constants — statuses, priorities, depths, and agent roles.
 *
 * Used by create_task, update_task, and get_task_tree tools.
 */

// ────────────────────────────────────────────────────────────────────────────
// Task statuses
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid task lifecycle statuses.
 *
 * pending     — task not yet started (default for newly created tasks)
 * ready       — task is unblocked and ready to begin
 * in_progress — task is actively being worked on
 * review      — task work is complete, awaiting review
 * done        — task is fully complete
 */
export const VALID_TASK_STATUSES = ["pending", "ready", "in_progress", "review", "done"] as const;
export type ValidTaskStatus = (typeof VALID_TASK_STATUSES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Task priorities
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid task priority levels (highest to lowest).
 *
 * critical — must be resolved immediately, blocks other work
 * high     — important, should be worked on soon
 * medium   — normal priority (default)
 * low      — nice to have, can be deferred
 */
export const VALID_TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type ValidTaskPriority = (typeof VALID_TASK_PRIORITIES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Depths
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid task depth values (0-3).
 * Represents the 4-level task hierarchy.
 */
export const VALID_DEPTHS = [0, 1, 2, 3] as const;
export type ValidDepth = (typeof VALID_DEPTHS)[number];

/**
 * Maps depth number to a human-readable name.
 *
 * 0 = epic       — highest level, represents a major initiative
 * 1 = feature    — a distinct capability within an epic
 * 2 = component  — an implementation unit within a feature
 * 3 = task       — an atomic unit of work within a component
 */
export const DEPTH_NAMES: Record<number, string> = {
  0: "epic",
  1: "feature",
  2: "component",
  3: "task",
};

// ────────────────────────────────────────────────────────────────────────────
// Agent roles
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid agent role values — specialized agents that can be assigned to tasks.
 *
 * executor              — implements assigned tasks
 * validator             — reviews and validates completed work
 * architect             — designs system structure and interfaces
 * architecture_auditor  — activates Tier 1-2 decision drafts; blocks deficient proposals
 * planner               — breaks down architecture into epics/features/components
 * plan_auditor          — reviews and approves plans before execution
 * task_designer         — synthesizes detailed task specs from component plans
 * task_auditor          — reviews task specs before wave execution
 * integration_checker   — verifies component integration points
 * debugger              — diagnoses and resolves failures
 * codebase_analyst      — analyzes existing code for context
 * product_researcher    — gathers and synthesizes product context for gateway
 * researcher            — investigates unknowns and gathers domain information
 * synapse_orchestrator  — dispatches and coordinates the agent pipeline
 */
export const VALID_AGENT_ROLES = [
  "executor",
  "validator",
  "architect",
  "architecture_auditor",
  "planner",
  "plan_auditor",
  "task_designer",
  "task_auditor",
  "integration_checker",
  "debugger",
  "codebase_analyst",
  "product_researcher",
  "researcher",
  "synapse_orchestrator",
] as const;
export type ValidAgentRole = (typeof VALID_AGENT_ROLES)[number];
