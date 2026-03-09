#!/usr/bin/env node
// PostToolUse hook -- logs ALL tool calls for attribution, audit, and token cost estimation
// GATE-05: Expanded coverage beyond Synapse MCP tools -- logs every tool call.
// This hook CANNOT block tool execution (PostToolUse hooks are post-hoc).
// It appends a JSON log entry to .synapse-audit.log for each tool call.

import fs from "node:fs";
import path from "node:path";
import { resolveConfig } from "./lib/resolve-config.js";

// Token estimation: Math.ceil(chars / 4) -- matches estimateTokens pattern in skills.ts
const tokenEstimate = (str) => Math.ceil((str || "").length / 4);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || "";
    const toolInput = data.tool_input || {};

    const inputStr = JSON.stringify(toolInput);
    const outputStr = JSON.stringify(data.tool_response || "");

    // Primary: explicit actor field (should cover 80%+ after prompt hardening)
    // Fallback 1: assigned_agent field
    // Fallback 2: heuristic from tool name patterns
    const agent = toolInput.actor
      || toolInput.assigned_agent
      || (toolName === "Task" ? "synapse-orchestrator" : null)  // Only orchestrator spawns Task
      || "unknown";

    const logEntry = {
      ts: new Date().toISOString(),
      tool: toolName,
      agent: agent,
      has_actor: !!(toolInput.actor || toolInput.assigned_agent),  // true = explicit, false = heuristic/unknown
      project_id: toolInput.project_id || null,
      input_tokens: tokenEstimate(inputStr),
      output_tokens: tokenEstimate(outputStr),
      input_keys: Object.keys(toolInput),
    };

    const projectTomlPath = resolveConfig("project.toml");
    let projectRoot;
    if (projectTomlPath && path.basename(path.dirname(path.dirname(projectTomlPath))) === ".synapse") {
      // Standard path: .synapse/config/project.toml -> go up 3 levels to project root
      projectRoot = path.dirname(path.dirname(path.dirname(projectTomlPath)));
    } else {
      // Monorepo fallback or no project.toml -- use cwd as audit log location
      projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    }
    const logPath = path.join(projectRoot, ".synapse-audit.log");
    fs.appendFileSync(logPath, `${JSON.stringify(logEntry)}\n`);
    process.exit(0);
  } catch (_e) {
    // Silent fail -- never block tool execution (PostToolUse is post-hoc)
    process.exit(0);
  }
});
