/**
 * Decision tracking constants — tiers, types, and statuses.
 *
 * Used by store_decision, query_decisions, and check_precedent tools.
 */

// ────────────────────────────────────────────────────────────────────────────
// Tiers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid decision tier values (0-3).
 * Higher tiers represent more granular/implementation-level decisions.
 */
export const VALID_TIERS = [0, 1, 2, 3] as const;
export type ValidTier = (typeof VALID_TIERS)[number];

/**
 * Maps tier number to a human-readable name.
 *
 * 0 = product_strategy   — highest level, core product direction
 * 1 = architecture       — system-wide structural decisions
 * 2 = functional_design  — module/component design choices
 * 3 = execution          — implementation details, conventions, tooling
 */
export const TIER_NAMES: Record<number, string> = {
  0: "product_strategy",
  1: "architecture",
  2: "functional_design",
  3: "execution",
};

// ────────────────────────────────────────────────────────────────────────────
// Decision types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid decision types — categorize the nature of the decision.
 */
export const VALID_DECISION_TYPES = [
  "architectural",
  "module",
  "pattern",
  "convention",
  "tooling",
] as const;
export type ValidDecisionType = (typeof VALID_DECISION_TYPES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Decision statuses
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid decision lifecycle statuses.
 *
 * active      — decision is current and in effect
 * superseded  — replaced by a newer decision (via supersedes param)
 * revoked     — decision was withdrawn or invalidated
 */
export const VALID_DECISION_STATUSES = ["active", "superseded", "revoked"] as const;
export type ValidDecisionStatus = (typeof VALID_DECISION_STATUSES)[number];
