#!/usr/bin/env node
// PreToolUse hook -- injects precedent check reminder before store_decision calls
// This is an ADVISORY hook, not an enforcement hook.
// It returns permissionDecision "allow" with additionalContext reminding the agent
// to call check_precedent before storing a new decision.
// On error: exits silently (precedent gate fails open since it's advisory).

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    let data;
    try {
      data = JSON.parse(input);
    } catch {
      // Advisory hook — fail open on malformed input (exits silently)
      process.exit(0);
    }

    const toolName = data.tool_name || "";

    // Only inject context for store_decision — pass all others silently
    if (toolName !== "mcp__synapse__store_decision") {
      process.exit(0);
    }

    // Inject precedent check reminder
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext:
          "REMINDER: Before storing this decision, verify you have called mcp__synapse__check_precedent with this decision's subject and rationale. If a similar decision already exists, reference it rather than creating a duplicate. This ensures decision consistency across the project.",
      },
    };

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (_e) {
    // Advisory hook — fail open on any unexpected error
    process.exit(0);
  }
});
