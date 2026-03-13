#!/usr/bin/env node

// PostToolUse hook -- enforces agent output contracts on update_task(status: "done") calls
// Reads output-contracts.toml to determine which documents each agent must produce
// before being allowed to mark a task as done.
//
// Contract enforcement logic:
//   1. Only gates on mcp__synapse__update_task calls with status === "done"
//   2. Looks up the calling agent (actor) in output-contracts.toml
//   3. Agents not listed in the config are allowed through (e.g., synapse-orchestrator
//      closing parent tasks after child completion — no output doc expected)
//   4. For listed agents: checks that tool_input.output_doc_ids contains a doc_id
//      matching each required pattern (with {task_id} substituted)
//   5. Agents with required_on_fail_only = true are allowed through on status "done"
//      (they only store docs on failure; passing means no doc needed)
//   6. FAIL-CLOSED: any error (missing config, parse failure, malformed input) results in deny

import fs from "node:fs";
import { parse } from "smol-toml";
import { resolveConfig } from "./lib/resolve-config.js";

function denyOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      permissionDecision: "deny",
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

    // Only gate on update_task calls — pass all others silently
    if (toolName !== "mcp__synapse__update_task") {
      process.exit(0);
    }

    const toolInput = data.tool_input || {};
    const status = toolInput.status;

    // Only enforce when status is being set to "done" — pass all other updates silently
    if (status !== "done") {
      process.exit(0);
    }

    const actor = toolInput.actor || "";
    const taskId = toolInput.task_id || "";

    // Load output-contracts.toml — fail-closed if missing or unparseable
    const contractsPath = resolveConfig("output-contracts.toml");
    if (!contractsPath) {
      process.stdout.write(
        denyOutput(
          "DENIED: output-contracts.toml not found. Denying as fail-closed precaution.",
        ),
      );
      process.exit(0);
    }

    let contractsConfig;
    try {
      const tomlContent = fs.readFileSync(contractsPath, "utf8");
      contractsConfig = parse(tomlContent);
    } catch {
      process.stdout.write(
        denyOutput(
          "DENIED: Failed to load output-contracts.toml configuration. Denying as fail-closed precaution.",
        ),
      );
      process.exit(0);
    }

    const agentContracts = (contractsConfig.agents || {});

    // Agents not listed in output-contracts.toml are allowed through freely.
    // This covers synapse-orchestrator and any other coordination agents
    // that close parent tasks after child work completes.
    if (!(actor in agentContracts)) {
      process.exit(0);
    }

    const agentEntry = agentContracts[actor] || {};

    // Agents with required_on_fail_only flag only store docs on failure.
    // When they reach status="done", it implies a pass — no doc required.
    if (agentEntry.required_on_fail_only === true) {
      process.exit(0);
    }

    const requiredDocs = agentEntry.required_docs || [];

    // If agent is listed but has no required docs, allow through
    if (requiredDocs.length === 0) {
      process.exit(0);
    }

    // Get the list of doc ids the agent claims to have produced
    const outputDocIds = Array.isArray(toolInput.output_doc_ids)
      ? toolInput.output_doc_ids
      : [];

    // Check each required doc pattern against the provided output_doc_ids.
    // Pattern matching: replace {task_id} placeholder with the actual task_id,
    // then check for exact match in the output_doc_ids list.
    const missingDocs = [];
    for (const reqDoc of requiredDocs) {
      const pattern = (reqDoc.doc_id_pattern || "").replace("{task_id}", taskId);
      const found = outputDocIds.includes(pattern);
      if (!found) {
        missingDocs.push({
          pattern,
          provides: reqDoc.provides || "(unknown)",
        });
      }
    }

    if (missingDocs.length > 0) {
      const missingList = missingDocs
        .map((d) => `"${d.pattern}" (${d.provides})`)
        .join(", ");
      process.stdout.write(
        denyOutput(
          `DENIED: ${actor} called update_task(status: "done") without required output documents. Missing: ${missingList}. Store the required documents via store_document before marking the task done.`,
        ),
      );
      process.exit(0);
    }

    // All required docs are present — exit silently to allow
    process.exit(0);
  } catch (_e) {
    // Top-level catch — fail-closed on any unexpected error
    process.stdout.write(
      denyOutput(
        "DENIED: Unexpected error in output-contract-gate hook. Denying as fail-closed precaution.",
      ),
    );
    process.exit(0);
  }
});
