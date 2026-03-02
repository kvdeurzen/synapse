#!/usr/bin/env node
// PostToolUse hook -- logs ALL tool calls for attribution, audit, and token cost estimation
// GATE-05: Expanded coverage beyond Synapse MCP tools -- logs every tool call.
// This hook CANNOT block tool execution (PostToolUse hooks are post-hoc).
// It appends a JSON log entry to .synapse-audit.log for each tool call.

import fs from 'node:fs';
import path from 'node:path';

// Token estimation: Math.ceil(chars / 4) -- matches estimateTokens pattern in skills.ts
const tokenEstimate = (str) => Math.ceil((str || '').length / 4);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};

    const inputStr = JSON.stringify(toolInput);
    const outputStr = JSON.stringify(data.tool_response || '');

    const logEntry = {
      ts: new Date().toISOString(),
      tool: toolName,
      agent: toolInput.actor || toolInput.assigned_agent || 'unknown',
      project_id: toolInput.project_id || null,
      input_tokens: tokenEstimate(inputStr),
      output_tokens: tokenEstimate(outputStr),
      input_keys: Object.keys(toolInput),
    };

    const logPath = path.join(process.cwd(), '.synapse-audit.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    process.exit(0);
  } catch (e) {
    // Silent fail -- never block tool execution (PostToolUse is post-hoc)
    process.exit(0);
  }
});
