import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const CONVENTIONAL_COMMIT_HOOK = join(
  import.meta.dir,
  "../../hooks/conventional-commit.js",
);

// Project root so hook can resolve paths
const PROJECT_ROOT = join(import.meta.dir, "../../../..");

/**
 * Run the conventional-commit hook with given input JSON.
 * @param input - Hook input object (tool_name + tool_input)
 */
function runHook(input: object) {
  return spawnSync("node", [CONVENTIONAL_COMMIT_HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });
}

function parsedOutput(stdout: string) {
  return JSON.parse(stdout);
}

// ─── conventional-commit.js tests ────────────────────────────────────────────

describe("conventional-commit.js (PostToolUse validation hook)", () => {
  // ── Valid commits that PASS silently ───────────────────────────────────────

  describe("valid conventional commits pass silently", () => {
    const validCommits = [
      'git commit -m "feat(auth): add JWT signing"',
      'git commit -m "fix(session): handle expired tokens"',
      'git commit -m "refactor(db): normalize query patterns"',
      'git commit -m "docs(readme): update install instructions"',
      'git commit -m "test(auth): add login edge cases"',
      'git commit -m "chore(deps): bump dependencies"',
      'git commit -m "style(lint): fix formatting"',
      'git commit -m "perf(query): optimize N+1 queries"',
      'git commit -m "ci(pipeline): add staging deploy"',
      'git commit -m "build(docker): multi-stage build"',
    ];

    for (const command of validCommits) {
      test(`passes: ${command}`, () => {
        const result = runHook({
          tool_name: "Bash",
          tool_input: { command },
        });

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe("");
      });
    }

    test("passes commit with hyphenated scope: feat(my-feature): add thing", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "feat(my-feature): add thing"' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes commit with numeric scope: fix(v2): patch issue", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "fix(v2): patch issue"' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes multi-line commit (first line valid, body present)", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: {
          command: 'git commit -m "feat(auth): add login\\n\\nDetailed body here"',
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });
  });

  // ── Invalid commits that are DENIED ────────────────────────────────────────

  describe("invalid commits are denied with guidance", () => {
    test("denies commit with no type or scope: 'add login'", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login"' },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    });

    test("denies commit missing scope: 'feat: add login'", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "feat: add login"' },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    });

    test("denies commit missing colon after scope: 'feat(auth) add login'", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "feat(auth) add login"' },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    });

    test("denies commit with uppercase scope: 'feat(AUTH): add login'", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "feat(AUTH): add login"' },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    });

    test("denies commit with [task:id] suffix: 'feat(auth): add login [task:abc123]'", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: {
          command: 'git commit -m "feat(auth): add login [task:abc123]"',
        },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("[task:");
    });

    test("denies commit with invalid type: 'yolo(auth): whatever'", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "yolo(auth): whatever"' },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    });

    test("denies commit with first line exceeding 72 characters", () => {
      // Build a commit where first line exceeds 72 chars
      const longDesc = "a".repeat(60); // "feat(auth): " + 60 chars = 72+, >72
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: `git commit -m "feat(auth): ${longDesc}"` },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(out.hookSpecificOutput.permissionDecisionReason).toContain("DENIED");
    });

    test("deny message includes format guidance", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login without type"' },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
      // Should include guidance about correct format
      const reason = out.hookSpecificOutput.permissionDecisionReason;
      expect(reason).toMatch(/type\(scope\)/i);
    });
  });

  // ── Edge cases that PASS silently (fail-open) ───────────────────────────────

  describe("edge cases pass silently (fail-open)", () => {
    test("passes when tool_name is Read (not Bash)", () => {
      const result = runHook({
        tool_name: "Read",
        tool_input: { file_path: "/some/file.ts" },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes when tool_name is Write (not Bash)", () => {
      const result = runHook({
        tool_name: "Write",
        tool_input: { file_path: "/some/file.ts", content: "content" },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes when Bash command is 'ls -la' (not git commit)", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: "ls -la" },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes when Bash command is 'git status' (git but not commit)", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: "git status" },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes when Bash command is 'git add .' (git but not commit)", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: "git add ." },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes when Bash command is 'git log --oneline' (not commit)", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: "git log --oneline" },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes with empty input (fail-open)", () => {
      const result = spawnSync("node", [CONVENTIONAL_COMMIT_HOOK], {
        input: "",
        encoding: "utf8",
        cwd: PROJECT_ROOT,
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes with malformed JSON input (fail-open)", () => {
      const result = spawnSync("node", [CONVENTIONAL_COMMIT_HOOK], {
        input: "this is not valid json!!!",
        encoding: "utf8",
        cwd: PROJECT_ROOT,
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("passes with missing tool_input (fail-open)", () => {
      const result = runHook({
        tool_name: "Bash",
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });
  });

  // ── HEREDOC and multi-line commit extraction ────────────────────────────────

  describe("HEREDOC and multi-line commit extraction", () => {
    test("extracts first line from HEREDOC-style commit and validates it", () => {
      // HEREDOC pattern: git commit -m "$(cat <<'EOF'\nfeat(auth): add login\nEOF\n)"
      // The command string itself contains the first line after the opening
      const result = runHook({
        tool_name: "Bash",
        tool_input: {
          command:
            "git commit -m \"$(cat <<'EOF'\\nfeat(auth): add login\\nEOF\\n)\"",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });

    test("denies HEREDOC-style commit with invalid first line", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: {
          command:
            "git commit -m \"$(cat <<'EOF'\\nadd login without type\\nEOF\\n)\"",
        },
      });

      expect(result.status).toBe(0);
      const out = parsedOutput(result.stdout);
      expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    });

    test("validates only first line of multi-line -m commit", () => {
      // Second line is not valid conventional commit but should not matter
      const result = runHook({
        tool_name: "Bash",
        tool_input: {
          command:
            'git commit -m "feat(auth): add login\\n\\nThis body line is fine without format"',
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });
  });

  // ── git commit --amend handling ─────────────────────────────────────────────

  describe("git commit --amend handling", () => {
    test("passes 'git commit --amend --no-edit' (no message to validate)", () => {
      const result = runHook({
        tool_name: "Bash",
        tool_input: { command: "git commit --amend --no-edit" },
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    });
  });
});
