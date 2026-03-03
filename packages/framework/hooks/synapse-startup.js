#!/usr/bin/env node
// SessionStart hook -- inject startup instructions for Synapse work stream detection
// and agent tier identity from trust.toml + agents.toml (GATE-06).
// Also reads .synapse/config/project.toml to inject project_id and context.
// CRITICAL: This hook runs BEFORE MCP servers are available to the agent.
// It CANNOT call Synapse tools directly. Instead, it injects instructions
// via additionalContext that the agent executes in its first turn.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { resolveConfig } from './lib/resolve-config.js';

const PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9_-]*$/;

function validateProjectId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('project_id is required in [project] section of project.toml');
  }
  if (!PROJECT_ID_REGEX.test(id)) {
    throw new Error(
      `project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric). Got: "${id}"`
    );
  }
}

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

    // --- Project context from .synapse/config/project.toml ---
    let projectContext = '';
    const projectTomlPath = resolveConfig('project.toml');

    if (!projectTomlPath) {
      // Check if .synapse/ directory exists (local install indicator)
      const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const synapseDir = path.join(projectDir, '.synapse');
      if (!fs.existsSync(synapseDir)) {
        // Not a Synapse project — exit silently
        process.exit(0);
      }
      // Local install but missing project.toml — user must run /synapse:init
      process.stderr.write(
        '[synapse-startup] ERROR: .synapse/config/project.toml not found. Run /synapse:init to set up this project.\n'
      );
      const output = {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext:
            'ERROR: Synapse project not initialized. Run /synapse:init to create project.toml before using Synapse MCP tools.',
        },
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(0);
    }

    const projectToml = parseToml(fs.readFileSync(projectTomlPath, 'utf8'));
    const project = projectToml.project || {};
    const { project_id, name, skills = [], created_at } = project;

    // Validate project_id — surface error via additionalContext so AI can guide the user
    try {
      validateProjectId(project_id);
    } catch (validationErr) {
      process.stderr.write(`[synapse-startup] ${validationErr.message}\n`);
      const output = {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `ERROR: Invalid project_id in project.toml — ${validationErr.message}`,
        },
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(0);
    }

    // Validate skills against existing SKILL.md files (warn, do not fail)
    // Derive project root from project.toml path: .synapse/config/project.toml -> project root
    const projectRoot = path.dirname(path.dirname(path.dirname(projectTomlPath)));
    for (const skill of skills) {
      const skillMd = path.join(projectRoot, '.claude', 'skills', skill, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        process.stderr.write(
          `[synapse-startup] Warning: skill "${skill}" listed in project.toml but no SKILL.md found at ${skillMd}\n`
        );
      }
    }

    const skillsDisplay = skills.length > 0 ? skills.join(', ') : '(none)';
    projectContext = [
      '─── SYNAPSE PROJECT CONTEXT ───',
      `project_id: ${project_id}`,
      `name: ${name || '(unnamed)'}`,
      `skills: ${skillsDisplay}`,
      '────────────────────────────────',
      `IMPORTANT: Always include project_id: "${project_id}" in every Synapse MCP tool call.`,
    ].join('\n');

    // --- Tier context from trust.toml + agents.toml ---
    let tierContext = '';
    try {
      const trustPath = resolveConfig('trust.toml');
      const agentsPath = resolveConfig('agents.toml');

      let trustToml = null;
      let agentsToml = null;

      if (trustPath && agentsPath) {
        trustToml = parseToml(fs.readFileSync(trustPath, 'utf8'));
        agentsToml = parseToml(fs.readFileSync(agentsPath, 'utf8'));
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

    // Build final additionalContext: project context first, then base instructions, then tier context
    const contextParts = [projectContext, baseInstructions];
    if (tierContext) {
      contextParts.push(tierContext);
    }
    const additionalContext = contextParts.join('\n\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail -- never block session start
    process.stderr.write(`[synapse-startup] Unexpected error: ${e.message}\n`);
    process.exit(0);
  }
});
