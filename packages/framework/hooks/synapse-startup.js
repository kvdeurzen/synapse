#!/usr/bin/env node
// SessionStart hook -- inject startup instructions for Synapse work stream detection
// and agent tier identity from trust.toml + agents.toml (GATE-06).
// CRITICAL: This hook runs BEFORE MCP servers are available to the agent.
// It CANNOT call Synapse tools directly. Instead, it injects instructions
// via additionalContext that the agent executes in its first turn.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    // Base work stream detection and attribution instructions (always present)
    const baseInstructions = [
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

    // Attempt to inject tier identity context from config files (GATE-06)
    let tierContext = '';
    try {
      // Resolve config paths relative to the framework package directory
      // Try monorepo root first, then fall back to relative paths
      const cwd = process.cwd();
      const possibleRoots = [
        cwd,
        path.join(cwd, 'packages', 'framework'),
        path.join(path.dirname(new URL(import.meta.url).pathname), '..'),
      ];

      let trustToml = null;
      let agentsToml = null;

      for (const root of possibleRoots) {
        const trustPath = path.join(root, 'config', 'trust.toml');
        const agentsPath = path.join(root, 'config', 'agents.toml');
        if (fs.existsSync(trustPath) && fs.existsSync(agentsPath)) {
          trustToml = parseToml(fs.readFileSync(trustPath, 'utf8'));
          agentsToml = parseToml(fs.readFileSync(agentsPath, 'utf8'));
          break;
        }
      }

      if (trustToml && agentsToml) {
        const tierAuthority = trustToml.tier_authority || {};
        const agents = agentsToml.agents || {};

        const tierLines = [
          '',
          '## Agent Tier Authority (from trust.toml)',
          '',
          'When you are spawned as an agent, your boundaries are:',
        ];

        for (const [agentName, tiers] of Object.entries(tierAuthority)) {
          const tierStr = Array.isArray(tiers) && tiers.length > 0
            ? tiers.join(', ')
            : 'none';
          tierLines.push(`- ${agentName}: Tier authority [${tierStr}] -- can store Tier ${tierStr} decisions`);
        }

        tierLines.push(
          '',
          'Tier 0 (Product Strategy) decisions ALWAYS require user collaboration.',
          'If a decision is above your tier, escalate to the appropriate agent.',
          '',
          '## Permitted Synapse Tools (from agents.toml)',
          '',
          'Each agent is restricted to its allowed_tools list. Do not call tools outside your list.',
        );

        // Add a brief per-agent tool summary
        for (const [agentName, agentConfig] of Object.entries(agents)) {
          const tools = agentConfig.allowed_tools || [];
          const synapseTools = tools.filter(t => t.startsWith('mcp__synapse__'));
          if (synapseTools.length > 0) {
            tierLines.push(`- ${agentName}: ${synapseTools.map(t => t.replace('mcp__synapse__', '')).join(', ')}`);
          }
        }

        tierContext = tierLines.join('\n');
      }
    } catch (configErr) {
      // Graceful degradation: config files unreadable -- log warning, continue without tier context
      process.stderr.write(`[synapse-startup] Warning: Could not load tier config: ${configErr.message}\n`);
    }

    const additionalContext = tierContext
      ? baseInstructions + '\n' + tierContext
      : baseInstructions;

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
