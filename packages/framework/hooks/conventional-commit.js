#!/usr/bin/env node

// PostToolUse hook -- enforces conventional commit format on git commit Bash calls
// Validates that commit messages follow the pattern: type(scope): description
//
// Validation rules:
//   1. Only gates on Bash tool calls containing "git commit -m"
//   2. Extracts the commit message from the -m argument
//   3. Validates first line against: type(scope): description
//   4. Accepted types: feat, fix, refactor, test, docs, chore, style, perf, ci, build
//   5. Scope is required: lowercase alphanumeric + hyphens only
//   6. First line must be <= 72 characters
//   7. [task:id] suffix is explicitly rejected
//   8. FAIL-OPEN: any parse error or unexpected exception passes silently (not fail-closed)

/**
 * Build a deny JSON output for PostToolUse hook.
 * @param {string} reason - Human-readable reason for denial
 * @returns {string} JSON string for stdout
 */
function denyOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

// Accepted conventional commit types
const VALID_TYPES = new Set([
  "feat",
  "fix",
  "refactor",
  "test",
  "docs",
  "chore",
  "style",
  "perf",
  "ci",
  "build",
]);

// Regex for conventional commit first line: type(scope): description
// - type: lowercase word (validated against VALID_TYPES separately)
// - scope: lowercase alphanumeric + hyphens (non-empty)
// - description: at least one character after ": "
const COMMIT_FORMAT_REGEX = /^([a-z]+)\(([a-z0-9][a-z0-9-]*)\): (.+)$/;

// Regex to detect [task:...] suffix (task tracking IDs are not allowed)
const TASK_SUFFIX_REGEX = /\[task:[^\]]+\]/i;

/**
 * Extract the commit message from a git commit command string.
 * Handles:
 *   - git commit -m "message"
 *   - git commit -m 'message'
 *   - HEREDOC-style: git commit -m "$(cat <<'EOF'\nfirst line\nEOF\n)"
 *   - Multi-line: "first line\n\nbody"
 *
 * Returns null if no -m flag is found or message cannot be extracted.
 * @param {string} command
 * @returns {string|null}
 */
function extractCommitMessage(command) {
  // Match -m followed by a quoted string (double or single quotes)
  // We look for -m "..." or -m '...'
  const dmMatch = command.match(/-m\s+"((?:[^"\\]|\\.)*)"/s);
  const smMatch = command.match(/-m\s+'((?:[^'\\]|\\.)*)'/s);

  const rawMessage = dmMatch ? dmMatch[1] : smMatch ? smMatch[1] : null;
  if (rawMessage === null) {
    return null;
  }

  // For HEREDOC-style: the message starts with "$(cat <<'EOF'\n..."
  // Extract the first non-heredoc, non-shell-syntax line
  if (rawMessage.includes("$(cat <<")) {
    // The actual message lines follow the heredoc opener
    // Pattern: $(cat <<'EOF'\nACTUAL_FIRST_LINE\n...EOF\n)
    // or $(cat <<'EOF'\nACTUAL_FIRST_LINE\nEOF\n)
    const heredocContentMatch = rawMessage.match(
      /\$\(cat <<'?[A-Z]+'?\s*\\n(.*?)(?:\\n|$)/s,
    );
    if (heredocContentMatch) {
      return heredocContentMatch[1].trim();
    }
    // If we can't parse the heredoc, fail-open
    return null;
  }

  // Unescape common escape sequences in the message
  const unescaped = rawMessage.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

  // Return only the first line for validation
  const firstLine = unescaped.split("\n")[0].trim();
  return firstLine || null;
}

/**
 * Validate a commit message first line.
 * Returns null if valid, or an error reason string if invalid.
 * @param {string} firstLine
 * @returns {string|null}
 */
function validateFirstLine(firstLine) {
  // Check for [task:id] suffix first — explicit prohibition
  if (TASK_SUFFIX_REGEX.test(firstLine)) {
    return `DENIED: Commit message contains a [task:id] suffix, which is not allowed. Remove the [task:...] tracking reference from the commit message. Required format: type(scope): description`;
  }

  // Check first line length
  if (firstLine.length > 72) {
    return `DENIED: Commit message first line exceeds 72 characters (${firstLine.length} chars). Shorten the description to fit within 72 characters. Required format: type(scope): description`;
  }

  // Match against conventional commit format
  const match = firstLine.match(COMMIT_FORMAT_REGEX);
  if (!match) {
    return `DENIED: Commit message does not follow conventional commit format. Required format: type(scope): description — e.g. feat(auth): add login endpoint. Accepted types: ${[...VALID_TYPES].join(", ")}`;
  }

  const [, type, , description] = match;

  // Validate type is in the allowed set
  if (!VALID_TYPES.has(type)) {
    return `DENIED: Commit type "${type}" is not valid. Accepted types: ${[...VALID_TYPES].join(", ")}. Required format: type(scope): description`;
  }

  // Validate description is not empty (already guaranteed by regex, but explicit)
  if (!description.trim()) {
    return `DENIED: Commit message description is empty. Required format: type(scope): description — e.g. feat(auth): add login endpoint`;
  }

  return null;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    // Parse hook input — fail-OPEN on parse errors (unlike output-contract-gate which is fail-closed)
    let data;
    try {
      data = JSON.parse(input);
    } catch {
      // Malformed JSON — fail-open, pass silently
      process.exit(0);
    }

    // Handle empty or missing input — fail-open
    if (!data || typeof data !== "object") {
      process.exit(0);
    }

    const toolName = data.tool_name || "";

    // Only gate on Bash tool calls — pass all others silently
    if (toolName !== "Bash") {
      process.exit(0);
    }

    const toolInput = data.tool_input;

    // Missing tool_input — fail-open
    if (!toolInput || typeof toolInput !== "object") {
      process.exit(0);
    }

    const command = toolInput.command || "";

    // Only gate on git commit commands — pass all others silently
    // Must contain "git commit" and the -m flag to have a validatable message
    if (!command.includes("git commit")) {
      process.exit(0);
    }

    // Commands like --amend --no-edit don't supply a new -m message
    // If no -m flag is present, pass silently
    if (!command.includes(" -m ")) {
      process.exit(0);
    }

    // Extract the commit message from the command
    const commitMessage = extractCommitMessage(command);

    // If we can't extract the message (e.g., unusual quoting), fail-open
    if (commitMessage === null || commitMessage === "") {
      process.exit(0);
    }

    // Validate the first line of the commit message
    const errorReason = validateFirstLine(commitMessage);

    if (errorReason !== null) {
      process.stdout.write(denyOutput(errorReason));
      process.exit(0);
    }

    // Valid commit — exit silently to allow
    process.exit(0);
  } catch (_e) {
    // Top-level catch — fail-open on any unexpected error
    // (conventional commit hook is advisory; we don't want to block unrelated work)
    process.exit(0);
  }
});
