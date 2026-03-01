#!/usr/bin/env node
// SessionStart hook -- inject startup instructions for Synapse work stream detection
// CRITICAL: This hook runs BEFORE MCP servers are available to the agent.
// It CANNOT call Synapse tools directly. Instead, it injects instructions
// via additionalContext that the agent executes in its first turn.

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const additionalContext = [
      '## Synapse Session Start',
      '',
      'Before responding to the user, check for open work streams:',
      '',
      '1. Call `mcp__synapse__get_task_tree` for active epics (look for tasks with depth=0 and status "in_progress" or "pending")',
      '2. Call `mcp__synapse__get_smart_context` in overview mode for recent decisions and project context',
      '3. Present project status to the user:',
      '   - Active epic title and completion percentage',
      '   - Feature progress (done/total with status indicators)',
      '   - Recent activity summary',
      '4. If open work streams exist, offer to resume. If none, ask what the user wants to work on.',
      '',
      '**Attribution requirement:** On ALL Synapse tool calls, include your agent role in the input:',
      '- For store_decision: add `actor: "synapse-orchestrator"` or your agent name',
      '- For create_task/update_task: include your agent identity in metadata',
      '- This enables full audit trail of which agent performed each operation.',
    ].join('\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail -- never block session start
    process.exit(0);
  }
});
