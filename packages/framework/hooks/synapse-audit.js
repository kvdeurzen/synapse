#!/usr/bin/env node
// PostToolUse hook -- logs all Synapse MCP tool calls for attribution and audit
// This hook CANNOT block tool execution (PostToolUse hooks are post-hoc).
// It appends a JSON log entry to .synapse-audit.log for each Synapse tool call.

import fs from 'node:fs';
import path from 'node:path';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';

    // Only audit Synapse MCP tool calls
    if (!toolName.startsWith('mcp__synapse__')) {
      process.exit(0);
    }

    const toolInput = data.tool_input || {};

    const logEntry = {
      ts: new Date().toISOString(),
      tool: toolName,
      agent: toolInput.actor || toolInput.assigned_agent || 'unknown',
      project_id: toolInput.project_id || null,
      input_keys: Object.keys(toolInput),
    };

    const logPath = path.join(process.cwd(), '.synapse-audit.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    process.exit(0);
  } catch (e) {
    // Silent fail -- never block tool execution
    process.exit(0);
  }
});
