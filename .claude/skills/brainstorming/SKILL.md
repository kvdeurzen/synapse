---
name: brainstorming
description: Structured technical problem-solving before implementation. Load when planning a feature, exploring architectural choices, or unstuck from a design problem.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- One question at a time: never overwhelm with multiple simultaneous questions (ratacat + TechnickAI)
- Present options before recommending: enumerate at least 3 distinct approaches with explicit tradeoffs (claude-cortex + TechnickAI)
- Structure each option: description / benefits / drawbacks / "best when" conditions / risk assessment (claude-cortex)
- YAGNI discipline: simplest solution that solves the stated problem wins unless there is a clear reason otherwise (ratacat + TechnickAI)
- Document the decision: capture what, why, key decisions, and open questions in markdown before moving to implementation (ratacat + claude-cortex)
- Stay on WHAT before HOW: brainstorming explores intent and approach, not implementation details (ratacat)
- Avoid hybrid defaults: they optimize for neither option; force a clear choice with explicit criteria (TechnickAI)
- Use multiple-choice questions when possible — they generate faster, more actionable answers than open-ended questions

## Quality Criteria

- At least 3 distinct approaches enumerated before any recommendation (claude-cortex)
- Each option has explicit pros, cons, and "best when" conditions documented (claude-cortex + TechnickAI)
- Final recommendation states the selection criteria explicitly (TechnickAI)
- Design document committed to version control before implementation begins (ratacat phase 3 → phase 4 handoff)
- Open questions listed separately from decided items (ratacat)
- Design constraints (performance, integration, team skills) identified and documented before evaluation
- All assumptions explicitly labeled as assumptions, not treated as facts

## Vocabulary

- **YAGNI**: "You Aren't Gonna Need It" — don't build features until there is a clear, immediate need
- **design document**: a markdown file capturing the problem, options explored, chosen direction, and open questions
- **tradeoff matrix**: a structured comparison of options across dimensions (complexity, coupling, performance)
- **hybrid solution**: an approach trying to combine two options; often has the downsides of both
- **design constraint**: a fixed requirement (performance budget, existing system, team skill) that limits viable options
- **phase handoff**: the point where brainstorming output becomes planning input — commit the design doc before moving on
- **success signal**: a measurable outcome that confirms the chosen solution solved the original problem
- **open question**: an unresolved issue explicitly listed in the design doc; must be resolved before implementation begins

## Anti-patterns

- Multiple simultaneous questions — ask one at a time to get useful answers (ratacat + TechnickAI)
- Jumping to HOW before understanding WHAT — explore intent and constraints before proposing solutions (ratacat)
- Recommending without presenting alternatives first — enumerate options before advocating (claude-cortex + TechnickAI)
- Hybrid solutions as default — rarely the right answer; force a clear choice (TechnickAI)
- Overly complex solutions when simpler ones solve the stated problem (ratacat: YAGNI)
- Unvalidated assumptions about constraints or requirements — surface and validate them explicitly (ratacat)
- Skipping the design document step and proceeding directly to implementation — commits without explicit decision record
- Starting implementation before all open questions are resolved or explicitly deferred

## Quality Criteria (additional)

- Problem statement written and agreed upon before options are explored
- Each explored option references at least one real-world system or precedent that uses this approach
- Risk assessment completed for the chosen option before design document is committed
- Time-box the brainstorming phase: if 3 rounds of questions yield no consensus, escalate to decision maker

## Commands

This is a cognitive skill — no executable commands. Output design documents to `docs/plans/` or `docs/decisions/`.
