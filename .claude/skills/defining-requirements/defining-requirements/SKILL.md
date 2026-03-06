---
name: defining-requirements
description: Requirements quality and specification-driven development conventions. Load when writing requirements, user stories, or acceptance criteria.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- EARS format for requirements: "When [condition], the system shall [behavior]" — eliminates ambiguity (nikiforovall)
- Given/When/Then acceptance criteria: every requirement has at least one testable scenario (Gherkin skill)
- No feature without business justification: necessity attribute prevents gold-plating (Prolifics Testing)
- Sequential gate process: Requirements → Design → Tasks → Implementation; never skip or merge phases (Kiro + nikiforovall)
- Zero improvisation in implementation: execute spec exactly as written; deviations require spec update (nikiforovall)
- Unambiguous language: ban "easy", "fast", "adequate", "sometimes"; use measurable quantities (Prolifics Testing)
- Traceability: every requirement has a unique ID and links to test cases (Prolifics Testing + nikiforovall)
- Explicit approval gates: never advance phases without user confirmation (nikiforovall)
- Prioritize requirements: mark each as Must Have / Should Have / Could Have / Won't Have (MoSCoW)

## Quality Criteria

- Every requirement uses EARS format or equivalent structured syntax (nikiforovall)
- Every requirement has at least one Given/When/Then acceptance criterion (Gherkin skill)
- Requirements are: complete, correct, feasible, necessary, prioritized, unambiguous, consistent, traceable, concise, verifiable (Prolifics Testing 10 attributes)
- No requirement contains vague adjectives ("fast", "easy", "adequate") — use numeric thresholds (Prolifics Testing)
- Each requirement has a unique identifier (e.g., REQ-001) enabling traceability (Prolifics Testing)
- Edge cases and negative scenarios enumerated, not just the happy path (nikiforovall)
- User story follows INVEST: Independent / Negotiable / Valuable / Estimable / Small / Testable
- Gap analysis run before design phase: all acceptance criteria covered by at least one task

## Vocabulary

- **EARS**: Easy Approach to Requirements Syntax — structured format "When [condition], the system shall [behavior]"
- **acceptance criterion**: a specific, testable condition that must be met for a requirement to be considered done
- **traceability**: the ability to link a requirement to its source, design, and test cases via unique IDs
- **gold-plating**: implementing features not traced to stated business goals or stakeholder needs
- **INVEST**: Independent / Negotiable / Valuable / Estimable / Small / Testable — criteria for well-formed user stories
- **happy path**: the normal, expected flow without errors or edge cases; requirements must also cover negative paths
- **specification phase**: the formal phase before implementation begins; produces requirements, design, and task files

## Anti-patterns

- Vague requirements: "the system should be fast" — use "response time < 200ms at p95" (Prolifics Testing)
- Skipping requirements phase and jumping directly to code (Kiro + nikiforovall: sequential gates)
- Gold-plating: building features not traced to business goals (Prolifics Testing: necessity attribute)
- Improvising during implementation instead of updating the spec (nikiforovall: zero improvisation)
- Acceptance criteria that cannot be automated into tests (Gherkin skill: testability)
- Requirements without unique IDs — breaks traceability and makes gap analysis impossible (Prolifics Testing)

## Anti-patterns (additional)

- Writing acceptance criteria in implementation language ("the React component shall...") — keep them behavior-focused
- Allowing requirements to grow without corresponding test coverage — every new requirement needs a test path
- Treating requirements as immutable once written — update the spec when reality changes, but update it deliberately
- Mixing requirements and design in the same document — keep them separate with explicit phase gates
- Undeclared dependencies between requirements — trace cross-requirement dependencies explicitly with IDs

## Commands

This is a cognitive skill — no executable commands. Spec files go in `specs/{feature}/requirements.md` (Kiro convention) or equivalent project structure.
