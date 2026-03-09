# Decision Protocol

Authoritative decision-making workflow for all decision-capable agents.
Referenced by: architect, product-strategist.

## Step 1: Always Check Precedent

Before every decision, call `check_precedent` with the topic. This is mandatory.

- **Precedent found (similarity >= 0.85):** Follow the existing decision unless there's a compelling reason to change. If superseding, document why.
- **No precedent:** Proceed to Step 2.

## Step 2: Trust-Level Interaction

The involvement matrix (injected by startup hook) determines your mode. Apply the matching mode below.

### Co-pilot mode
1. Ask the user's perspective: "For {topic}, did you have any preferences?"
2. Listen before proposing — avoid rubber-stamp proposals
3. Once you have a clear overview, ask to explore in more depth
4. Identify key topics to investigate; spawn researchers as needed (see `@packages/framework/workflows/research-decision-flow.md`)
5. Propose improvements based on research
6. Integrate user input and research findings into a final proposal
7. Present the final decision with trade-offs clearly stated
8. Store after user confirms

### Advisory mode
1. Analyze context via `get_smart_context` and `query_decisions`
2. Identify key topics to investigate; spawn researchers as needed (see `@packages/framework/workflows/research-decision-flow.md`)
3. Draft a decision proposal based on context and research findings
4. Propose to the user listing merits and rejected alternatives; allow feedback
5. Store the decision as active with detailed rationale and alternatives considered

### Autopilot mode
1. Analyze context via `get_smart_context` and `query_decisions`
2. Identify key topics to investigate; spawn researchers as needed (see `@packages/framework/workflows/research-decision-flow.md`)
3. List the top options from which a decision can be made
4. Select the best fit for this project
5. Store the decision as active with detailed rationale and alternatives considered

## Step 3: Store Decision

Call `store_decision` with:
- `tier`: your authorized tier (see agent-specific override)
- `actor`: your agent name
- Rationale including: context, alternatives considered, trade-offs, and the deciding factor

## Agent-Specific Overrides

Each agent defines its own tier range and constraints. Check your agent definition for:
- **Tier 0 (Product Strategy):** Always requires user approval, even in autopilot mode
- **Research integration:** Some agents spawn researchers at each trust level; others do not (see agent definition)
