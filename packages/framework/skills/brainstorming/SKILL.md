---
name: brainstorming
description: Structured technical problem-solving before implementation. Load when planning a feature, exploring architectural choices, or unstuck from a design problem.
disable-model-invocation: true
user-invocable: false
---

## Conventions

Execute these steps in strict sequence. Do not skip or reorder.

### Step 1: Load project context

Query Synapse DB before anything else:
- `get_smart_context` for the topic area
- `query_documents` for recent decisions related to the topic
- `query_documents` for related documents (previous designs, ADRs, requirements)

Do NOT begin with raw file exploration. The knowledge base is the primary context source.

### Step 2: Scope gate

Map the topic to the Synapse hierarchy before asking any questions:

- **Epic** (multiple independent subsystems or Features): decompose into Features first. Each Feature gets its own brainstorm → design → plan cycle. Do not brainstorm an Epic in one pass.
- **Feature** (one coherent deliverable spanning multiple Work Packages): proceed with brainstorm.
- **Work Package** (single deliverable): proceed with brainstorm.

If the topic is Epic-sized, flag this immediately and propose a decomposition before continuing.

### Step 3: Ask clarifying questions

Ask ONE question per message — one question only. No exceptions.

- Prefer multiple-choice questions — they produce faster, more actionable answers.
- Open-ended questions are appropriate when the possibility space is too large for predefined options.
- Never combine a question with a long explanation.
- Goal: understand purpose, constraints, success criteria, and non-obvious requirements.
- Time-box: if 3 rounds of questions yield no consensus, escalate to a decision maker rather than continuing to explore.

### Step 4: Propose approaches

Enumerate at least 3 distinct approaches **neutrally** before recommending. For each approach:
- Description
- Benefits
- Drawbacks
- "Best when" conditions
- Risk assessment

**Then recommend**: state the chosen approach with the explicit selection criteria that led to it.

- Avoid hybrid defaults — they optimize for neither option; force a clear choice.
- Apply YAGNI ruthlessly — simplest solution that solves the stated problem wins unless there is a clear documented reason otherwise.
- Explicitly label all assumptions as assumptions, not facts.
- List open questions separately from decided items.

### Step 5: Present design

Scale the presentation to the complexity of the design:

- **Simple designs** (clear scope, few moving parts): present the full design in one message and ask for approval.
- **Complex designs** (3+ sections, architectural decisions, multiple components): present section by section. Ask "does this look right so far?" after each section before proceeding.

Cover as applicable: architecture, components, data flow, error handling, testing strategy.

Be ready to revise earlier sections if later discussion reveals problems.

### Step 6: Store design document

After user approval, store the design to Synapse DB:

```
store_document(
  category: "plan"           # or "architecture_decision" for architectural choices
  tags: [<relevant-tags>]
  status: "active"
)
```

If the design produced decisions that should be tracked separately, store those via `store_decision`. Link the design document to any related existing documents or decisions in Synapse DB via `link_documents`.

### Step 7: Offer to continue

Ask the user if they want to proceed to the Plan phase or stop here. Do not auto-transition to planning.

---

<HARD-GATE>
Do NOT take any implementation action until a design has been presented and the
user has approved it. This applies to EVERY topic regardless of perceived
simplicity. "Simple" topics are where unexamined assumptions cause the most
wasted work. The design can be brief for truly simple topics, but it MUST exist
and be approved.
</HARD-GATE>

---

## Quality Criteria

- At least 3 distinct approaches enumerated before any recommendation
- Each option has explicit pros, cons, and "best when" conditions documented
- Final recommendation states the selection criteria explicitly
- Design document stored in Synapse DB before any implementation begins
- Open questions listed separately from decided items
- Design constraints (performance, integration, team skills) identified before evaluation
- All assumptions explicitly labeled as assumptions, not treated as facts
- Problem statement written and agreed upon before options are explored
- Risk assessment completed for the chosen option before design is stored
- Time-box enforced: 3 rounds without consensus = escalate

## Vocabulary

- **YAGNI**: "You Aren't Gonna Need It" — don't build features until there is a clear, immediate need
- **design document**: a document in Synapse DB capturing the problem, options explored, chosen direction, and open questions
- **tradeoff matrix**: a structured comparison of options across dimensions (complexity, coupling, performance)
- **hybrid solution**: an approach trying to combine two options; often has the downsides of both
- **design constraint**: a fixed requirement (performance budget, existing system, team skill) that limits viable options
- **scope gate**: the step that maps a topic to the Synapse hierarchy before any exploration begins
- **success signal**: a measurable outcome that confirms the chosen solution solved the original problem
- **open question**: an unresolved issue explicitly listed in the design; must be resolved before implementation begins
- **phase handoff**: the point where brainstorming output becomes planning input — store the design doc before moving on

## Anti-patterns

- Multiple simultaneous questions — ask one at a time to get useful answers
- Jumping to HOW before understanding WHAT — explore intent and constraints before proposing solutions
- Recommending without presenting alternatives first — enumerate at least 3 options before advocating
- Hybrid solutions as default — rarely the right answer; force a clear choice with explicit criteria
- Overly complex solutions when simpler ones solve the stated problem (YAGNI)
- Unvalidated assumptions about constraints or requirements — surface and validate them explicitly
- Skipping Step 6 and proceeding directly to implementation — the design document IS the phase gate
- Starting implementation before all open questions are resolved or explicitly deferred
- Treating an Epic-sized topic as a single brainstorm — decompose into Features first (scope gate)

## Anti-Rationalization

These are the most common rationalizations for skipping steps in this skill. Each one leads to wasted work.

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "This is too simple to need a design" | Simple topics are exactly where unexamined assumptions cause the most wasted work. The design can be brief — one paragraph — but skipping it means skipping the step where bad assumptions surface. (Superpowers brainstorming skill: hard gate rationale) | Write a brief design. If it truly is simple, the process takes 2 minutes and produces a record. |
| "The user seems impatient, I should skip the questions" | Impatience signals that the user wants a result, not fewer questions. Skipping clarification produces the wrong result — which wastes more time than the questions would have taken. (Superpowers using-superpowers skill: "user impatience is not a signal to skip process") | Ask ONE better, more targeted question. Multiple-choice is faster than open-ended. |
| "I already know the right approach from context" | Your first instinct anchors on the constraint that is most salient to you, not necessarily the most important constraint. The process surfaces what you would miss. (Superpowers brainstorming skill: "enumeration before recommendation") | Run Step 4 anyway. If your instinct is right, enumeration confirms it quickly. |
| "Multiple questions would be more efficient" | Batched questions produce vague, hedged answers. One question at a time produces more specific, actionable answers. The total time is lower, not higher. (Superpowers brainstorming skill: one-question-at-a-time rule) | Break your questions into a sequence. Ask the most important one first. |
| "The design approval step is just a formality" | Design approval is the step where the user catches misaligned assumptions before implementation begins. Treating it as a formality means bad assumptions pass through uncaught. (Superpowers verification-before-completion: "do not skip the gate") | Present the design explicitly and wait for a clear approval signal before proceeding. |

## Commands

This is a cognitive skill — no executable commands. Store design documents to Synapse DB via `store_document` (category: `plan` or `architecture_decision`). Store decisions via `store_decision`.
