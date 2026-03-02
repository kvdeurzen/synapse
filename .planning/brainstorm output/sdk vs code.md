Your instinct is sound. GSD is already proof that Claude Code works as an orchestration runtime:

  ┌─────────────────────┬──────────────────────────────────┬─────────────────────────────────────────────────┐
  │     Capability      │  Agent SDK builds from scratch   │             Claude Code already has             │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ Agent spawning      │ You implement the agent loop     │ Task tool with subagent_types                   │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ System prompts      │ Hardcoded or loaded in code      │ .claude/agents/*.md files                       │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ Tool filtering      │ AgentDefinition tools arrays     │ Agent file allowed_tools                        │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ Hooks (enforcement) │ PreToolUse/PostToolUse SDK hooks │ .claude/hooks/ with same events                 │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ Skill injection     │ Custom skill registry code       │ Skill files, workflow markdown                  │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ MCP integration     │ mcpServers config in code        │ Claude Code settings.json mcpServers            │
  ├─────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
  │ Session management  │ You build it                     │ Claude Code sessions + /gsd:resume-work pattern │
  └─────────────────────┴──────────────────────────────────┴─────────────────────────────────────────────────┘

  What you'd gain:
  - Skip building ~80% of Phase 12's infrastructure (process management, MCP client, subprocess wiring)
  - Focus immediately on the hard/interesting parts: agent prompts, skill design, trust enforcement, PEV workflow
  - Use your subscription instead of per-token API billing
  - Iterate on prompts by editing markdown files, not rebuilding code
  - GSD-like DevX that you already know works

  What you'd lose (initially):
  - Headless/CI execution (Claude Code needs a terminal)
  - Fine-grained programmatic control over the agent loop
  - Independence from Claude Code versioning

  The decouple path later:
  The valuable IP is in the agent prompts, skills, trust config, and workflow logic — all of which are portable markdown/YAML. Migrating to Agent SDK later would be a runtime/transport
   swap, not a rewrite of the orchestration logic.

  This would change Phases 12-14 significantly. Instead of building a standalone orchestrator/ package, you'd be building a Synapse-specific agent/skill/hook layer on top of Claude
  Code — similar to how GSD works but domain-specific. 