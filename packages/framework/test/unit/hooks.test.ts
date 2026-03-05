import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STARTUP_HOOK = join(import.meta.dir, "../../hooks/synapse-startup.js");
const AUDIT_HOOK = join(import.meta.dir, "../../hooks/audit-log.js");

// Project root so startup hook can resolve packages/framework/config/ paths
const PROJECT_ROOT = join(import.meta.dir, "../../../..");

// Track temp dirs to clean up after each test
const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "synapse-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

// ─── SessionStart hook tests ────────────────────────────────────────────────

describe("synapse-startup.js (SessionStart hook)", () => {
  test("outputs valid JSON with hookSpecificOutput", () => {
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "{}",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty("hookSpecificOutput");
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(typeof parsed.hookSpecificOutput.additionalContext).toBe("string");
    expect(parsed.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("get_task_tree");
  });

  test("additionalContext includes attribution instructions", () => {
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "{}",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    // Should mention attribution requirement with actor keyword
    const hasAttribution = ctx.includes("Attribution") || ctx.includes("actor");
    expect(hasAttribution).toBe(true);
  });

  test("additionalContext includes tier authority information when config files are accessible", () => {
    // Run from project root so trust.toml and agents.toml are resolvable
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "{}",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    // Should include tier authority section injected from trust.toml
    const hasTierAuthority =
      ctx.includes("Tier authority") ||
      ctx.includes("tier_authority") ||
      ctx.includes("Agent Tier Authority");
    expect(hasTierAuthority).toBe(true);
  });

  test("additionalContext includes Tier 0 warning language", () => {
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "{}",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    // Tier 0 decisions require user collaboration
    expect(ctx).toContain("Tier 0");
  });

  test("exits 0 on malformed input", () => {
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "not valid json at all!!!",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    // Hook should exit 0 (no crash) regardless of input
    expect(result.status).toBe(0);
  });

  test("exits 0 on empty input", () => {
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "",
      encoding: "utf8",
      cwd: PROJECT_ROOT,
    });

    // Hook should exit 0 (no crash) even with empty stdin
    expect(result.status).toBe(0);
  });

  test("gracefully degrades when run from a directory without config files", () => {
    // Run from a temp dir that has no config/ subdirectory
    const tmpDir = makeTmpDir();
    const result = spawnSync("node", [STARTUP_HOOK], {
      input: "{}",
      encoding: "utf8",
      cwd: tmpDir,
    });

    // Should still exit 0 and produce valid JSON with base instructions
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty("hookSpecificOutput");
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    // Base instructions still present even without tier context
    expect(parsed.hookSpecificOutput.additionalContext).toContain("get_task_tree");
  });
});

// ─── PostToolUse audit hook tests (audit-log.js) ─────────────────────────────

describe("audit-log.js (PostToolUse audit hook)", () => {
  test("logs Synapse tool call to audit file with token estimates", () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: "mcp__synapse__create_task",
      tool_input: { project_id: "test-project", title: "Test task", actor: "orchestrator" },
      tool_response: { task_id: "t-001" },
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, ".synapse-audit.log");
    expect(existsSync(logPath)).toBe(true);

    const logContent = readFileSync(logPath, "utf8").trim();
    const logEntry = JSON.parse(logContent);

    expect(logEntry.tool).toBe("mcp__synapse__create_task");
    expect(typeof logEntry.ts).toBe("string");
    expect(logEntry.ts.length).toBeGreaterThan(0);
    expect(Array.isArray(logEntry.input_keys)).toBe(true);
    expect(logEntry.input_keys).toContain("project_id");
    expect(logEntry.input_keys).toContain("title");
    // Token estimate fields must be present (GATE-05)
    expect(typeof logEntry.input_tokens).toBe("number");
    expect(typeof logEntry.output_tokens).toBe("number");
    expect(logEntry.input_tokens).toBeGreaterThan(0);
    expect(logEntry.output_tokens).toBeGreaterThan(0);
  });

  test("logs non-Synapse tool call (e.g., Read) -- no longer ignored", () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: "Read",
      tool_input: { file_path: "/some/file.ts" },
      tool_response: "file contents",
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    // GATE-05: Non-Synapse tool calls must now be logged (expanded audit coverage)
    const logPath = join(tmpDir, ".synapse-audit.log");
    expect(existsSync(logPath)).toBe(true);

    const logEntry = JSON.parse(readFileSync(logPath, "utf8").trim());
    expect(logEntry.tool).toBe("Read");
    expect(logEntry.agent).toBe("unknown");
    expect(logEntry.input_keys).toContain("file_path");
  });

  test("logs non-Synapse tool call with token estimates", () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "/some/file.ts", content: "const x = 1;" },
      tool_response: "File written successfully",
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, ".synapse-audit.log");
    expect(existsSync(logPath)).toBe(true);

    const logEntry = JSON.parse(readFileSync(logPath, "utf8").trim());
    expect(logEntry.tool).toBe("Write");
    expect(typeof logEntry.input_tokens).toBe("number");
    expect(typeof logEntry.output_tokens).toBe("number");
    // input has content string so tokens should be positive
    expect(logEntry.input_tokens).toBeGreaterThan(0);
  });

  test("input_tokens and output_tokens are positive numbers using Math.ceil(chars/4)", () => {
    const tmpDir = makeTmpDir();
    const toolInput = {
      project_id: "my-project",
      title: "A task with some description text for token estimation",
      actor: "orchestrator",
    };
    const toolResponse = { task_id: "task-001", status: "created" };

    const hookInput = JSON.stringify({
      tool_name: "mcp__synapse__create_task",
      tool_input: toolInput,
      tool_response: toolResponse,
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, ".synapse-audit.log");
    const logEntry = JSON.parse(readFileSync(logPath, "utf8").trim());

    // Verify token estimates match Math.ceil(chars/4) pattern
    const expectedInputTokens = Math.ceil(JSON.stringify(toolInput).length / 4);
    const expectedOutputTokens = Math.ceil(JSON.stringify(toolResponse).length / 4);

    expect(logEntry.input_tokens).toBe(expectedInputTokens);
    expect(logEntry.output_tokens).toBe(expectedOutputTokens);
    expect(logEntry.input_tokens).toBeGreaterThan(0);
    expect(logEntry.output_tokens).toBeGreaterThan(0);
  });

  test("exits 0 on malformed input", () => {
    const tmpDir = makeTmpDir();

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: "garbage input that is not json",
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);
  });

  test("captures agent identity from actor field", () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: "mcp__synapse__store_decision",
      tool_input: { actor: "orchestrator", decision: "Use TypeScript", project_id: "my-project" },
      tool_response: { id: "d-001" },
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, ".synapse-audit.log");
    const logEntry = JSON.parse(readFileSync(logPath, "utf8").trim());
    expect(logEntry.agent).toBe("orchestrator");
  });

  test("captures agent identity from assigned_agent field", () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: "mcp__synapse__update_task",
      tool_input: { assigned_agent: "executor", task_id: "t-001", status: "done" },
      tool_response: {},
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, ".synapse-audit.log");
    const logEntry = JSON.parse(readFileSync(logPath, "utf8").trim());
    expect(logEntry.agent).toBe("executor");
  });

  test("agent defaults to unknown when no identity provided", () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: "mcp__synapse__get_task_tree",
      tool_input: { project_id: "my-project", root_id: "epic-001" },
      tool_response: { tasks: [] },
    });

    const result = spawnSync("node", [AUDIT_HOOK], {
      input: hookInput,
      encoding: "utf8",
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, ".synapse-audit.log");
    const logEntry = JSON.parse(readFileSync(logPath, "utf8").trim());
    expect(logEntry.agent).toBe("unknown");
  });
});
