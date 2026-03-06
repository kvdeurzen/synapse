#!/usr/bin/env node

// PreToolUse hook -- enforces tier authority for store_decision calls
// Reads trust.toml [tier_authority] to determine which tiers each actor can store.
// Tier 0 (Product Strategy) always requires user approval ("ask").
// All other unauthorized tier access is denied.
// FAIL-CLOSED: any error (malformed input, missing config, parse failure) results in deny.

import fs from "node:fs";
import { parse } from "smol-toml";
import { resolveConfig } from "./lib/resolve-config.js";

function denyOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

function askOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: reason,
    },
  });
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    // Parse hook input — fail-closed on any parse error
    let data;
    try {
      data = JSON.parse(input);
    } catch {
      process.stdout.write(
        denyOutput("DENIED: Failed to parse hook input. Denying as fail-closed precaution."),
      );
      process.exit(0);
    }

    const toolName = data.tool_name || "";

    // Only enforce on store_decision calls — pass all others silently
    if (toolName !== "mcp__synapse__store_decision") {
      process.exit(0);
    }

    const toolInput = data.tool_input || {};
    const actor = toolInput.actor || "";
    const requestedTier = typeof toolInput.tier === "number" ? toolInput.tier : 99;

    // No actor = user's main session or slash command — allow all tiers
    // (Tier 0 still prompts below since it always requires user approval)
    if (!actor && requestedTier !== 0) {
      process.exit(0);
    }

    // Tier 0 always requires user approval regardless of actor
    if (requestedTier === 0) {
      process.stdout.write(
        askOutput(
          "This is a Tier 0 (Product Strategy) decision. User approval required per trust.toml configuration.",
        ),
      );
      process.exit(0);
    }

    // Load trust.toml — fail-closed on missing or unparseable file
    const trustTomlPath = resolveConfig("trust.toml");
    if (!trustTomlPath) {
      process.stdout.write(
        denyOutput("DENIED: trust.toml not found. Denying as fail-closed precaution."),
      );
      process.exit(0);
    }
    let trustConfig;
    try {
      const tomlContent = fs.readFileSync(trustTomlPath, "utf8");
      trustConfig = parse(tomlContent);
    } catch {
      process.stdout.write(
        denyOutput(
          `DENIED: Failed to load trust.toml configuration. Denying as fail-closed precaution.`,
        ),
      );
      process.exit(0);
    }

    const tierAuthority = trustConfig.tier_authority || {};

    // Unknown actor gets no tiers (most restrictive — fail-closed)
    if (!actor || !(actor in tierAuthority)) {
      process.stdout.write(
        denyOutput(
          `DENIED: ${actor || "(unknown)"} cannot store Tier ${requestedTier} decisions. Allowed tiers: []. Escalate to the appropriate agent.`,
        ),
      );
      process.exit(0);
    }

    const allowedTiers = tierAuthority[actor] || [];

    // Check if the requested tier is in the actor's allowed list
    if (!allowedTiers.includes(requestedTier)) {
      process.stdout.write(
        denyOutput(
          `DENIED: ${actor} cannot store Tier ${requestedTier} decisions. Allowed tiers: [${allowedTiers.join(", ")}]. Escalate to the appropriate agent.`,
        ),
      );
      process.exit(0);
    }

    // Authorized — exit silently to allow
    process.exit(0);
  } catch (_e) {
    // Top-level catch — fail-closed on any unexpected error
    process.stdout.write(
      denyOutput(`DENIED: Unexpected error in tier-gate hook. Denying as fail-closed precaution.`),
    );
    process.exit(0);
  }
});
