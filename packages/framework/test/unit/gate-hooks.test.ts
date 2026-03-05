import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const TIER_GATE_HOOK = join(import.meta.dir, "../../hooks/tier-gate.js");
const TOOL_ALLOWLIST_HOOK = join(import.meta.dir, "../../hooks/tool-allowlist.js");
const PRECEDENT_GATE_HOOK = join(import.meta.dir, "../../hooks/precedent-gate.js");

// Project root so hooks can resolve packages/framework/config/ paths
const PROJECT_ROOT = join(import.meta.dir, "../../../..");

function runHook(hookPath: string, input: object, cwd = PROJECT_ROOT) {
  return spawnSync("node", [hookPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd,
  });
}

function parsedOutput(stdout: string) {
  return JSON.parse(stdout);
}

// ─── tier-gate.js tests ──────────────────────────────────────────────────────

describe("tier-gate.js (PreToolUse enforcement hook)", () => {
  // executor is allowed tiers: [3] — tier 1 should be denied
  test("denies executor storing tier 1 decision", () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: { actor: "executor", tier: 1, subject: "Test", choice: "A", rationale: "B" },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
  });

  // Unknown actor (no actor field) should be denied — fail-closed
  test("denies unknown actor (no actor field) storing any decision", () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: { tier: 2, subject: "Test", choice: "A", rationale: "B" },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // executor is allowed tiers: [3] — tier 3 should be allowed
  test("allows executor storing tier 3 decision", () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: {
        actor: "executor",
        tier: 3,
        subject: "Impl detail",
        choice: "A",
        rationale: "B",
      },
    });

    expect(result.status).toBe(0);
    // Allow is signaled by empty stdout (exit 0 silently)
    expect(result.stdout.trim()).toBe("");
  });

  // architect is allowed tiers: [1, 2] — tier 2 should be allowed
  test("allows architect storing tier 2 decision", () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: { actor: "architect", tier: 2, subject: "Design", choice: "A", rationale: "B" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Tier 0 is always "ask" regardless of actor
  test('returns "ask" for any tier 0 decision (product-strategist)', () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: {
        actor: "product-strategist",
        tier: 0,
        subject: "Strategy",
        choice: "A",
        rationale: "B",
      },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("Tier 0");
  });

  test('returns "ask" for tier 0 even for executor (user approval always required)', () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: { actor: "executor", tier: 0, subject: "Strategy", choice: "A", rationale: "B" },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("ask");
  });

  // Fail-closed: malformed JSON should result in deny
  test("denies on malformed JSON input (fail-closed)", () => {
    const result = spawnSync("node", [TIER_GATE_HOOK], {
      input: "this is not valid json!!!",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // Fail-closed: empty stdin should result in deny
  test("denies on empty stdin (fail-closed)", () => {
    const result = spawnSync("node", [TIER_GATE_HOOK], {
      input: "",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // Non-store_decision tools should pass through silently
  test("exits silently for non-store_decision tools", () => {
    const result = runHook(TIER_GATE_HOOK, {
      tool_name: "mcp__synapse__get_task_tree",
      tool_input: { actor: "executor" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});

// ─── tool-allowlist.js tests ─────────────────────────────────────────────────

describe("tool-allowlist.js (PreToolUse enforcement hook)", () => {
  // executor's allowed_tools does NOT include mcp__synapse__index_codebase
  test("denies executor calling mcp__synapse__index_codebase", () => {
    const result = runHook(TOOL_ALLOWLIST_HOOK, {
      tool_name: "mcp__synapse__index_codebase",
      tool_input: { actor: "executor" },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
  });

  // executor's allowed_tools includes mcp__synapse__update_task
  test("allows executor calling mcp__synapse__update_task", () => {
    const result = runHook(TOOL_ALLOWLIST_HOOK, {
      tool_name: "mcp__synapse__update_task",
      tool_input: { actor: "executor" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Non-Synapse tools should pass through (Read, Write, Bash, etc.)
  test("passes through non-Synapse tool (Read) without deny", () => {
    const result = runHook(TOOL_ALLOWLIST_HOOK, {
      tool_name: "Read",
      tool_input: { file_path: "/some/file.ts" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("passes through Bash tool without deny", () => {
    const result = runHook(TOOL_ALLOWLIST_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Unknown actor calling any Synapse tool should be denied (fail-closed)
  test("denies unknown actor calling any Synapse tool", () => {
    const result = runHook(TOOL_ALLOWLIST_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: { actor: "unknown-agent" },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // No actor field — unknown agent — should be denied
  test("denies when no actor field provided for Synapse tool", () => {
    const result = runHook(TOOL_ALLOWLIST_HOOK, {
      tool_name: "mcp__synapse__get_task_tree",
      tool_input: {},
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // Fail-closed: malformed JSON
  test("denies on malformed JSON input (fail-closed)", () => {
    const result = spawnSync("node", [TOOL_ALLOWLIST_HOOK], {
      input: "garbage input!!!",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});

// ─── precedent-gate.js tests ─────────────────────────────────────────────────

describe("precedent-gate.js (PreToolUse advisory hook)", () => {
  test("returns allow + additionalContext for store_decision calls", () => {
    const result = runHook(PRECEDENT_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: {
        actor: "executor",
        tier: 3,
        subject: "Test decision",
        choice: "A",
        rationale: "B",
      },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(typeof out.hookSpecificOutput.additionalContext).toBe("string");
    expect(out.hookSpecificOutput.additionalContext).toContain("check_precedent");
  });

  test("additionalContext reminds to check for duplicates", () => {
    const result = runHook(PRECEDENT_GATE_HOOK, {
      tool_name: "mcp__synapse__store_decision",
      tool_input: { actor: "architect", tier: 1 },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    const ctx = out.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("REMINDER");
    expect(ctx).toContain("duplicate");
  });

  // Non-store_decision tools should pass through silently (exit 0, no output)
  test("exits silently for non-store_decision tools", () => {
    const result = runHook(PRECEDENT_GATE_HOOK, {
      tool_name: "mcp__synapse__get_task_tree",
      tool_input: { actor: "executor" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("exits silently on malformed input (advisory, not enforcement)", () => {
    const result = spawnSync("node", [PRECEDENT_GATE_HOOK], {
      input: "not json at all",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    // Precedent gate fails open (exits silently) since it's advisory
    expect(result.stdout.trim()).toBe("");
  });
});

// ─── GATE-07 ordering test ───────────────────────────────────────────────────

describe("GATE-07: most-restrictive-wins (multi-hook ordering)", () => {
  test("tier-gate denies and precedent-gate allows on same input — verify independent outputs", () => {
    // Executor trying to store tier 1 (not authorized — executor only has tier 3)
    const input = {
      tool_name: "mcp__synapse__store_decision",
      tool_input: {
        actor: "executor",
        tier: 1,
        subject: "Arch decision",
        choice: "A",
        rationale: "B",
      },
    };

    const tierGateResult = runHook(TIER_GATE_HOOK, input);
    const precedentGateResult = runHook(PRECEDENT_GATE_HOOK, input);

    // tier-gate should deny (unauthorized tier)
    expect(tierGateResult.status).toBe(0);
    const tierOut = parsedOutput(tierGateResult.stdout);
    expect(tierOut.hookSpecificOutput.permissionDecision).toBe("deny");

    // precedent-gate should allow (advisory only — reminds to check precedent)
    expect(precedentGateResult.status).toBe(0);
    const precedentOut = parsedOutput(precedentGateResult.stdout);
    expect(precedentOut.hookSpecificOutput.permissionDecision).toBe("allow");

    // Claude Code applies most-restrictive-wins: deny takes priority over allow.
    // When both hooks run under the same PreToolUse matcher, Claude Code
    // aggregates: deny + allow = deny. This is verified by confirming the
    // individual hook outputs that Claude Code would resolve.
    const decisions = [
      tierOut.hookSpecificOutput.permissionDecision,
      precedentOut.hookSpecificOutput.permissionDecision,
    ];
    const mostRestrictive = decisions.includes("deny")
      ? "deny"
      : decisions.includes("ask")
        ? "ask"
        : "allow";
    expect(mostRestrictive).toBe("deny");
  });
});
