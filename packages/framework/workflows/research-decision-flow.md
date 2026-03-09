# Research-Supported Decision Flow

Authoritative workflow for spawning Researchers to inform decisions and decomposition.
Referenced by: architect, decomposer.

## When to Spawn a Researcher

**Spawn when:**
- Choosing between libraries, frameworks, or external dependencies
- Multiple valid approaches where the choice affects task/decision structure
- Complex integrations with external services or systems
- The decision will be difficult to reverse (data storage, auth strategy, deployment model)
- Unfamiliar technology or libraries the codebase hasn't used before

**Do NOT spawn when:**
- Precedent already exists (`check_precedent` returned a match)
- Straightforward application of an existing codebase pattern
- The architect already provided research findings in the handoff `doc_ids` — check for `researcher-findings-*` documents before spawning a duplicate
- Pure refactoring where the target pattern is already decided
- The decision is Tier 3 (implementation detail — the Executor's domain)

## Research -> Decision Flow

1. Identify the topic and formulate 2-3 specific research questions
2. Spawn Researcher via Task tool:
   ```
   Task(
     subagent_type: "researcher",
     prompt: "
       --- SYNAPSE HANDOFF ---
       project_id: {project_id}
       task_id: {task_id}
       hierarchy_level: {level}
       rpev_stage_doc_id: rpev-stage-{task_id}
       doc_ids: {relevant_doc_ids or "none"}
       decision_ids: {relevant_decision_ids or "none"}
       --- END HANDOFF ---

       Research the following for {decision topic / implementation approach}:
       Topic: {topic}
       Questions:
       1. {specific question about approaches}
       2. {specific question about trade-offs or pitfalls}
       3. {specific question about best practices or structure}

       Focus on: {relevant technologies, constraints, context}
       Store findings as: researcher-findings-{task_id}
     "
   )
   ```
3. After Researcher completes, fetch findings: `query_documents(category: "research", tags: "|{task_id}|")`
4. Synthesize findings with project context from `get_smart_context`
5. Use findings to inform your next step (decision or decomposition — see agent-specific integration below)
6. Reference the research document in your output rationale: "Based on research findings (doc: researcher-findings-{task_id}), ..."
7. Link the output to the research: `link_documents(from_id: "{decision_or_plan_id}", to_id: "researcher-findings-{task_id}", type: "references")`

## Agent-Specific Integration

### Architect
After Step 4, proceed with Decision Protocol Step 2 (Trust-Level Interaction) using findings to inform the proposal.

### Decomposer
After Step 4, use findings to inform:
- Task sizing (hidden complexities that require finer splits)
- Dependency ordering (research-suggested build order)
- Acceptance criteria (specific patterns/libraries tasks should use)

**If the Researcher fails:** Log a warning in the plan document's Research References section and proceed with available information. Research is informational, not gating.
