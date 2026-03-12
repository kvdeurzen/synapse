import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUTPUT_CONTRACT_GATE_HOOK = join(
  import.meta.dir,
  "../../hooks/output-contract-gate.js",
);

// Project root so hook can resolve packages/framework/config/ paths via monorepo fallback
const PROJECT_ROOT = join(import.meta.dir, "../../../..");

/**
 * Run the output-contract-gate hook with given input JSON.
 * @param input - Hook input object
 * @param env - Optional environment overrides (e.g., CLAUDE_PROJECT_DIR for config isolation)
 */
function runHook(input: object, env: Record<string, string> = {}) {
  return spawnSync("node", [OUTPUT_CONTRACT_GATE_HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
  });
}

function parsedOutput(stdout: string) {
  return JSON.parse(stdout);
}

// Shared temp dir for config isolation tests
let tempDir: string;
let synapseCfgDir: string;

beforeAll(() => {
  // Create a temp project dir with a minimal output-contracts.toml for config-isolation tests
  tempDir = mkdtempSync(join(tmpdir(), "synapse-ocg-test-"));
  synapseCfgDir = join(tempDir, ".synapse", "config");
  mkdirSync(synapseCfgDir, { recursive: true });
});

afterAll(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ─── output-contract-gate.js tests ───────────────────────────────────────────

describe("output-contract-gate.js (PostToolUse enforcement hook)", () => {
  // Test 1: Deny when executor sets done but provides no output docs
  test("denies executor update_task(status: done) with no output_doc_ids", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "executor",
        task_id: "task-abc-123",
        status: "done",
        output_doc_ids: null,
      },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("implementation");
  });

  // Test 1b: Deny when executor sets done with empty output_doc_ids array
  test("denies executor update_task(status: done) with empty output_doc_ids array", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "executor",
        task_id: "task-abc-123",
        status: "done",
        output_doc_ids: [],
      },
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
  });

  // Test 2: Allow when executor provides matching output doc
  test("allows executor update_task(status: done) when output_doc_ids contains required doc", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "executor",
        task_id: "task-abc-123",
        status: "done",
        output_doc_ids: ["executor-implementation-task-abc-123"],
      },
    });

    expect(result.status).toBe(0);
    // Allow is signaled by empty stdout (silent exit 0)
    expect(result.stdout.trim()).toBe("");
  });

  // Test 2b: Allow when output_doc_ids has the matching doc plus extras
  test("allows executor update_task(status: done) when output_doc_ids includes required doc among others", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "executor",
        task_id: "task-xyz-456",
        status: "done",
        output_doc_ids: [
          "executor-implementation-task-xyz-456",
          "executor-some-other-doc-task-xyz-456",
        ],
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Test 3: Fail-closed when output-contracts.toml is missing
  test("denies (fail-closed) when output-contracts.toml cannot be found", () => {
    // Use a temp dir with no config file, blocking monorepo fallback via CLAUDE_PROJECT_DIR
    const emptyDir = mkdtempSync(join(tmpdir(), "synapse-ocg-empty-"));
    try {
      const result = runHook(
        {
          tool_name: "mcp__synapse__update_task",
          tool_input: {
            actor: "executor",
            task_id: "task-abc-123",
            status: "done",
            output_doc_ids: [],
          },
        },
        { CLAUDE_PROJECT_DIR: emptyDir },
      );

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  // Test 4: Pass through silently for non-update_task tool calls
  test("passes through silently for store_document calls", () => {
    const result = runHook({
      tool_name: "mcp__synapse__store_document",
      tool_input: {
        actor: "executor",
        doc_id: "executor-implementation-task-abc-123",
        content: "some content",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("passes through silently for get_task_tree calls", () => {
    const result = runHook({
      tool_name: "mcp__synapse__get_task_tree",
      tool_input: { actor: "executor" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Test 5: Pass through for update_task calls that do NOT set status to done
  test("passes through silently for update_task(status: in_progress)", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "executor",
        task_id: "task-abc-123",
        status: "in_progress",
        output_doc_ids: null,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("passes through silently for update_task(status: blocked)", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "executor",
        task_id: "task-abc-123",
        status: "blocked",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("passes through silently for update_task with no status field (spec update)", () => {
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "task-designer",
        task_id: "task-abc-123",
        spec: "some spec content",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Test 6: Pass through for agents NOT listed in output-contracts.toml
  test("passes through silently for update_task(status: done) from agent not in output-contracts.toml", () => {
    // synapse-orchestrator updates parent task status but has no output contract
    const result = runHook({
      tool_name: "mcp__synapse__update_task",
      tool_input: {
        actor: "synapse-orchestrator",
        task_id: "task-parent-789",
        status: "done",
        output_doc_ids: null,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  // Fail-closed: malformed JSON should result in deny
  test("denies on malformed JSON input (fail-closed)", () => {
    const result = spawnSync("node", [OUTPUT_CONTRACT_GATE_HOOK], {
      input: "this is not valid json!!!",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const out = parsedOutput(result.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  // Custom config test: use a temp dir with specific output-contracts.toml
  test("uses output-contracts.toml from CLAUDE_PROJECT_DIR when set", () => {
    // Create a minimal config for architect in the temp dir
    const minimalToml = `
# Test output-contracts.toml
[agents.architect]
required_docs = [
  { doc_id_pattern = "architect-architecture-{task_id}", provides = "architecture" }
]
`;
    writeFileSync(join(synapseCfgDir, "output-contracts.toml"), minimalToml);

    // Architect with correct doc should be allowed
    const resultAllow = runHook(
      {
        tool_name: "mcp__synapse__update_task",
        tool_input: {
          actor: "architect",
          task_id: "task-custom-001",
          status: "done",
          output_doc_ids: ["architect-architecture-task-custom-001"],
        },
      },
      { CLAUDE_PROJECT_DIR: tempDir },
    );

    expect(resultAllow.status).toBe(0);
    expect(resultAllow.stdout.trim()).toBe("");

    // Architect without correct doc should be denied
    const resultDeny = runHook(
      {
        tool_name: "mcp__synapse__update_task",
        tool_input: {
          actor: "architect",
          task_id: "task-custom-001",
          status: "done",
          output_doc_ids: [],
        },
      },
      { CLAUDE_PROJECT_DIR: tempDir },
    );

    expect(resultDeny.status).toBe(0);
    const out = parsedOutput(resultDeny.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});
