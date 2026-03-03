#!/usr/bin/env node
// PreToolUse hook -- enforces Synapse MCP tool allowlists per agent
// Reads agents.toml [agents.{actor}].allowed_tools to determine permitted tools.
// Only gates mcp__synapse__* tools — non-Synapse tools (Read, Write, Bash, etc.) pass through.
// Per locked decision: built-in tools are not gated by this hook.
// FAIL-CLOSED: any error (malformed input, missing config, parse failure) results in deny.

import { parse } from 'smol-toml';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig } from './lib/resolve-config.js';

function denyOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    // Parse hook input — fail-closed on any parse error
    let data;
    try {
      data = JSON.parse(input);
    } catch {
      process.stdout.write(
        denyOutput('DENIED: Failed to parse hook input. Denying as fail-closed precaution.'),
      );
      process.exit(0);
    }

    const toolName = data.tool_name || '';

    // Only gate Synapse MCP tools — pass non-Synapse tools silently
    if (!toolName.startsWith('mcp__synapse__')) {
      process.exit(0);
    }

    const toolInput = data.tool_input || {};
    const actor = toolInput.actor || '';

    // Load agents.toml — fail-closed on missing or unparseable file
    const agentsTomlPath = resolveConfig('agents.toml');
    if (!agentsTomlPath) {
      process.stdout.write(
        denyOutput('DENIED: agents.toml not found. Denying as fail-closed precaution.'),
      );
      process.exit(0);
    }
    let agentsConfig;
    try {
      const tomlContent = fs.readFileSync(agentsTomlPath, 'utf8');
      agentsConfig = parse(tomlContent);
    } catch {
      process.stdout.write(
        denyOutput(
          `DENIED: Failed to load agents.toml configuration. Denying as fail-closed precaution.`,
        ),
      );
      process.exit(0);
    }

    const agents = agentsConfig.agents || {};

    // Unknown actor gets no tools (most restrictive — fail-closed)
    if (!actor || !(actor in agents)) {
      process.stdout.write(
        denyOutput(
          `DENIED: ${actor || '(unknown)'} is not authorized to use ${toolName}. Check agents.toml for permitted tools.`,
        ),
      );
      process.exit(0);
    }

    const agentConfig = agents[actor] || {};
    const allowedTools = agentConfig.allowed_tools || [];

    // Check if the tool is in the actor's allowed list
    if (!allowedTools.includes(toolName)) {
      process.stdout.write(
        denyOutput(
          `DENIED: ${actor} is not authorized to use ${toolName}. Check agents.toml for permitted tools.`,
        ),
      );
      process.exit(0);
    }

    // Authorized — exit silently to allow
    process.exit(0);
  } catch (e) {
    // Top-level catch — fail-closed on any unexpected error
    process.stdout.write(
      denyOutput(
        `DENIED: Unexpected error in tool-allowlist hook. Denying as fail-closed precaution.`,
      ),
    );
    process.exit(0);
  }
});
