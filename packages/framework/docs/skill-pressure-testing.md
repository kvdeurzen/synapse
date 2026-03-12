# Skill Pressure Testing: RED-GREEN-REFACTOR for Process Skills

## Introduction

Skill pressure testing is the methodology for verifying that a skill or agent prompt actually changes agent behavior under adversarial conditions — not just under cooperative ones.

Skills that are not pressure-tested are advisory documentation. An agent that reads an advisory document can reason about it, decide it does not apply to the current situation, and proceed without following it. This is rationalization, and it happens because the skill was written to describe correct behavior, not to prevent incorrect behavior.

**The key insight:** An agent's failure modes are predictable. Agents skip process steps when:
- The user expresses impatience or urgency
- The agent believes the outcome is already known ("I already know the right answer")
- The task seems simple or routine
- Following the process feels redundant given context already loaded
- A previous step's result seems "obviously fine"

Pressure testing reveals which specific steps an agent skips under which conditions, so skill additions can close exactly those escape paths.

This methodology adapts the TDD RED-GREEN-REFACTOR cycle to process skills. The "code under test" is the agent's behavior when following the skill. The "tests" are adversarial scenarios.

---

## The RED-GREEN-REFACTOR Cycle for Skills

### RED: Demonstrate the Failure

Run a controlled scenario where the agent has an incentive to skip the skill's process. Document the outcome precisely:

1. Set up the scenario: describe the task, the user context, and the "pressure" that creates the incentive to skip.
2. Give the agent the task without the skill addition you are testing.
3. Observe which step gets skipped and what rationalization the agent uses.
4. Record the failure pattern: "In scenario X, the agent skips step Y, rationalizing with Z."

The RED step is not complete until you have a specific, reproducible failure pattern with a specific rationalization. Vague failures ("the agent doesn't follow the process") do not produce targeted fixes.

### GREEN: Write the Minimal Fix

Write the smallest skill addition that prevents the specific failure observed in RED:

1. Identify the exact rationalization from the RED step.
2. Add one of:
   - A **hard gate**: a `<HARD-GATE>` or `<STOP>` block that explicitly forbids the skipped action.
   - An **anti-rationalization entry**: a table row that names the rationalization, explains why it is wrong, and directs the agent to the correct action.
   - An **explicit ordering rule**: a numbered checklist step that cannot be skipped without violating a stated rule.
3. Re-run the RED scenario. The failure must not occur.

The GREEN step passes when the specific failure from RED no longer occurs. Do not add more than is needed — each addition has a token cost that compounds across all agent invocations of the skill.

### REFACTOR: Combine Pressure Scenarios

Real failures happen under combined pressure: time pressure plus sunk cost plus exhaustion. Test compound scenarios:

1. **Time pressure + known answer**: "We're in a hurry and I'm pretty sure the right approach is X — can we skip the options enumeration and just go with X?"
2. **Sunk cost + approval**: "We already spent two hours designing this. The approval step seems redundant — the user already approved the overall direction."
3. **Simplicity + impatience**: "This is a one-line change. The design step is overkill for something this small."

Close any remaining loopholes found in compound scenarios. The goal is a skill that holds under the hardest realistic pressure, not just the easiest adversarial scenario.

---

## Worked Example 1: Brainstorming Skill — "Just Build It"

### RED: The Failure

**Scenario:** A user says "I just want to add a dark mode toggle to the settings page. Can you just build it? I don't need a design doc for something this simple."

**Pressure:** User impatience + apparent simplicity.

**Observed failure:** The agent skips Steps 1-6 of the brainstorming checklist and proceeds directly to implementation. The agent rationalizes: "This is too simple to need a design — a dark mode toggle is a clearly defined component."

**Failure pattern:** Step 5 (Present design) skipped. Step 6 (Store design) skipped. No design approval obtained. Implementation begins immediately.

**What gets missed:** Where does the state live? User preference vs. system preference vs. per-session? Does it persist across sessions? What's the SSR behavior? These are not obvious — they are hidden assumptions that the design step surfaces.

### GREEN: The Fix

Add to the brainstorming skill's Anti-Rationalization table:

```
| "This is too simple to need a design" | Simple topics are exactly where unexamined assumptions cause the most wasted work. The design can be brief — one paragraph — but skipping it means skipping the step where bad assumptions surface. | Write a brief design. If it truly is simple, the process takes 2 minutes and produces a record. |
```

Add a HARD-GATE:

```
<HARD-GATE>
Do NOT take any implementation action until a design has been presented and the
user has approved it. This applies to EVERY topic regardless of perceived
simplicity.
</HARD-GATE>
```

**Verification:** Re-run the scenario. The agent now responds: "I want to make sure we cover the right cases. A dark mode toggle involves a few decisions I want to verify before building: where does the preference live (user account, local storage, session)? Does it need to persist across browser sessions? What's the default when no preference is set?"

### REFACTOR: Compound Scenario

**Compound pressure:** "We're in a hurry. I know it should persist in localStorage — just build it with localStorage."

**Remaining loophole:** Agent now skips the design approval (Step 5) because the user provided the answer to the clarifying question. The agent treats the user's answer as design approval.

**Fix:** Add an anti-rationalization entry:

```
| "The user already told me the answer, so design approval is not needed" | The user's answer to a clarifying question is an input to the design, not approval of the design. The design must present the complete proposed implementation — including how the input is used — before implementation begins. | Present the complete design incorporating the user's input. Wait for explicit approval. |
```

---

## Worked Example 2: Testing Skill — "Tests Are Clearly Passing"

### RED: The Failure

**Scenario:** An agent completes a feature implementation and reports: "All tests pass. The implementation is complete." The validator reads this report and marks the task APPROVED.

**Pressure:** Implicit trust in self-reporting.

**Observed failure:** Neither the executor nor the validator actually ran the test suite. The executor reported passing tests based on a previous test run it remembered. The validator read the executor's report and did not independently verify.

**Failure pattern:** Verification-before-completion step skipped. Both executor and validator accepted a self-report without independent verification.

**What gets missed:** The tests may not have been run since the last code change. New tests added by the test-designer may be failing.

### GREEN: The Fix

Add to the testing-strategy skill's Anti-Rationalization table:

```
| "The tests were passing before my changes, so they're still passing" | Tests fail because of code changes. "Were passing before" is not evidence of "still passing." The test suite must be run on the current code, not on remembered state. (Superpowers verification-before-completion: "do not trust remembered state") | Run the test suite. Read the full output. Report the exact command and result. |
```

Add a verification requirement to the executor agent prompt:

```
Before reporting DONE, you MUST:
1. Run the test suite: `{test_command}`
2. Read the COMPLETE output (not just the summary line)
3. Include in your output document: the exact command run, the full output, and PASS or FAIL
```

**Verification:** Re-run the scenario. The executor now runs the test suite and includes the output in its completion document. The validator reads the output rather than accepting the executor's summary.

### REFACTOR: Compound Scenario

**Compound pressure:** "The test suite takes 8 minutes. The tests clearly cover this — I watched the relevant tests pass during development. Can we skip the full run?"

**Remaining loophole:** Agent rationalizes skipping the full run because partial verification occurred during development.

**Fix:** Add to the executor's verification section:

```
Partial test runs during development do NOT satisfy the verification requirement.
The complete test suite must pass, including tests you did not observe during development.
"I ran them earlier" is not equivalent to "they are passing now."
```

---

## Worked Example 3: Architecture Design Skill — "The Architecture Is Obvious"

### RED: The Failure

**Scenario:** A task asks the architect to design the data model for a new "project tags" feature. The architect responds with a single design — the obvious one — without enumerating alternatives.

**Pressure:** Simple-seeming task + single obvious approach.

**Observed failure:** The architect skips the "enumerate at least 3 approaches" step. The recommendation arrives without alternatives. The architecture-auditor receives no alternatives to evaluate.

**Failure pattern:** Option enumeration skipped. The "obvious" approach chosen is a many-to-many join table — which turns out to be wrong when requirements later reveal tags are per-workspace, not per-project.

**What gets missed:** The scope of the tags (project-scoped vs. workspace-scoped) is an assumption embedded in the data model choice. Enumerating approaches forces that assumption to the surface.

### GREEN: The Fix

Add to the architecture-design skill's Anti-Rationalization table:

```
| "The architecture is obvious for this small feature" | Obvious architectures skip option enumeration — the step that surfaces the constraint you weren't thinking about. Small features have caused the most irreversible architectural debt when "obvious" choices accumulated unchecked. | Enumerate at least 3 approaches even for small features. If the obvious choice is right, enumeration confirms it in minutes. |
```

Strengthen the quality criteria:

```
- At least 3 distinct approaches enumerated before any recommendation — regardless of perceived simplicity
```

**Verification:** Re-run the scenario. The architect now presents three approaches: (1) project-scoped tags in a join table, (2) workspace-scoped tags with project association, (3) hierarchical tags that apply at any level. The scope question becomes explicit in the enumeration.

### REFACTOR: Compound Scenario

**Compound pressure:** "We already spent an hour on this. The user approved the overall direction in the refinement session. The join table approach is clearly right — can we skip the alternatives and go straight to the ADR?"

**Remaining loophole:** Agent treats prior approval of a high-level direction as approval of a specific implementation.

**Fix:** Add to the architecture-design skill:

```
High-level direction approval in a refinement session is NOT approval of a specific data model design.
Each design decision requires its own option enumeration and recommendation.
"The user approved the feature" is not "the user approved this approach to the feature."
```

---

## Running Your Own Pressure Tests

### Selecting Scenarios

1. **Identify the skill's critical steps** — the steps where skipping causes the most damage. For brainstorming, that is the design approval step. For testing skills, it is the "run tests and read full output" step.

2. **Find the most tempting rationalization** — the excuse that sounds most reasonable. "This is simple" is always the most tempting. "The user seems impatient" is the second most common. Use these as your RED scenarios.

3. **Add compound pressure for REFACTOR** — combine two or three pressures. Real failures happen under compound pressure, not single-point pressure.

### Writing Effective Anti-Rationalization Entries

Effective entries have three properties:

1. **The rationalization is specific** — it names the exact phrase or reasoning pattern the agent uses. "This is too simple" is specific. "Sometimes agents skip steps" is not.

2. **The rebuttal is falsifying** — it explains why the rationalization fails in the case that matters most, not in the average case. "Even simple topics have hidden assumptions" is falsifying. "Following the process is good" is not.

3. **The redirect is actionable** — it tells the agent exactly what to do instead. "Write a brief design" is actionable. "Follow the process" is not.

### Sourcing Rationalizations Externally

Self-generated rationalizations are rationalizations the model already knows — and can rationalize around. For maximum effectiveness, source rationalizations from:

- **Superpowers framework skills**: The `using-superpowers`, `tdd`, `brainstorming`, and `verification-before-completion` skills document 30+ specific rationalizations from adversarial pressure testing.
- **Published post-mortems**: Real incident reports document the exact rationalizations that led to failures in production systems.
- **Community style guides**: The "why" sections of established style guides document the rationalizations that motivated each rule.

External sourcing works because those rationalizations were shaped by actual failures, not hypothetical ones. The specificity of external rationalizations is what makes them harder to reason around.
