/**
 * Shared document taxonomy constants — imported by all document tools.
 * Extracted from store-document.ts to avoid duplication across tools.
 */

export const VALID_CATEGORIES = [
  "architecture_decision",
  "design_pattern",
  "glossary",
  "code_pattern",
  "dependency",
  "plan",
  "task_spec",
  "requirement",
  "technical_context",
  "change_record",
  "research",
  "learning",
] as const;

export const VALID_STATUSES = ["draft", "active", "approved", "superseded", "archived"] as const;

/**
 * Carry-forward categories are never archived — only superseded.
 * Architecture decisions, design patterns, glossary, code patterns, and dependencies
 * are too foundational to discard; they stay visible for agent context even when outdated.
 */
export const CARRY_FORWARD_CATEGORIES = new Set([
  "architecture_decision",
  "design_pattern",
  "glossary",
  "code_pattern",
  "dependency",
]);

export type DocumentCategory = (typeof VALID_CATEGORIES)[number];
export type DocumentStatus = (typeof VALID_STATUSES)[number];
