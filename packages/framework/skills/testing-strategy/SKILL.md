---
name: testing-strategy
description: Language-agnostic testing pyramid strategy. Load when planning test suites or reviewing test coverage and structure.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Pyramid ratio: 60-70% unit / 20-30% integration / 5-10% E2E — enforce this proportion deliberately (caduh.com)
- Test behavior, not implementation: exercise public interfaces only; private methods indicate design problems (Fowler)
- Mocking discipline: mock at boundaries (external services, I/O, clock), not internal collaborators (Fowler + caduh.com)
- No duplication across levels: if a unit test covers an edge case, E2E should not repeat it (Fowler)
- TDD vertically: one test → one implementation → repeat; never bulk-write tests (AI Hero TDD)
- Flake prevention: control time, randomness, and network deterministically; never use sleep in tests (caduh.com)
- Arrange-Act-Assert (or Given-When-Then) structure consistently across all levels (Fowler + awesome-cursorrules)
- Push tests as far down the pyramid as possible — a unit test is always preferred over an integration test (Fowler)
- Search existing mocks before creating new ones — avoid duplicate fake implementations (awesome-cursorrules)

## Quality Criteria

- Unit tests run in under 3 minutes total; integration tests under 7 minutes; E2E smoke under 3 minutes on PRs (caduh.com)
- Coverage: approximately 80% line / 60% branch overall; gate on changed-file coverage not repo-wide (caduh.com)
- Each test is independent — no shared mutable state between test functions (Fowler + awesome-cursorrules)
- External services (DB, HTTP, clock) mocked in unit tests; real dependencies used in integration tests (Fowler)
- Mocks cleared between tests: reset/clear before each test function (awesome-cursorrules)
- Test names describe the behavior being tested, not the implementation
- No flaky tests merged — quarantine and fix before next release
- Mutation testing run on critical modules to validate assertion quality (caduh.com)

## Vocabulary

- **test pyramid**: a model where unit tests form the base, integration tests the middle, E2E tests the tip
- **unit test**: tests a single function or class in isolation using fakes/mocks for all dependencies
- **integration test**: tests your code against a real dependency (DB, queue, filesystem) in a controlled environment
- **E2E test**: tests a complete user flow through the full stack; slowest, most expensive, least numerous
- **contract test**: verifies both sides of a service boundary respect a shared interface (consumer-driven)
- **test double**: any fake replacing a real dependency: stub (fixed return), spy (records calls), mock (verifies calls)
- **flaky test**: a test that passes and fails non-deterministically; must be fixed before merging
- **mutation testing**: deliberately breaking code to verify tests fail — validates assertion quality, not just coverage

## Anti-patterns

- Testing private methods directly — refactor to expose through the public interface instead (Fowler)
- Bulk-writing tests before implementation — tests imagined behavior, not observed behavior (AI Hero TDD)
- Hard-coded waits or sleeps in tests — use deterministic signals; control clocks explicitly (caduh.com + awesome-cursorrules)
- Coverage theater: asserting code ran without asserting correctness (caduh.com)
- Mocking the code under test — creates false positives (caduh.com)
- Snapshot tests for unstable or non-human-reviewable output (caduh.com)

## Anti-patterns (additional)

- Overly granular unit tests that couple to private implementation — they break on safe refactors (Fowler)
- No integration tests at all — leaves the DB/API boundary completely unverified
- E2E tests as the primary regression check — too slow; push coverage down to unit/integration level
- Running full E2E suite on every commit — reserve for nightly or pre-merge on main (caduh.com)
- Writing integration tests that depend on production data or external network connections

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "This function is too simple to test" | Untested simple functions become the unchecked assumptions that cause bugs in complex functions. The test is not for now — it's for the refactor that happens in 3 months when the "simple" function changes. (Fowler: "tests are the specification, not the verification") | Write the test. If it truly is simple, the test takes 2 minutes and documents the behavior permanently. |
| "I'll write tests after the implementation is working" | Tests written after implementation test the implementation, not the behavior. They are shaped by what the code does, not what it should do. Bugs in the implementation become assumptions in the tests. (Superpowers TDD skill: "tests written after are rationalization tests, not specification tests") | Write tests before or during implementation. The behavior spec must precede the implementation. |
| "Mocking the database makes tests too brittle — I'll use the real one" | Unit tests with real databases are integration tests. They run orders of magnitude slower, require database setup, and fail for network/state reasons unrelated to the code under test. The test pyramid breaks down. (Fowler: "mock at boundaries, use real dependencies in integration tests only") | Mock the DB in unit tests. Write separate integration tests against a real DB for boundary verification. |
| "Coverage is at 80%, we don't need more tests" | Coverage measures which lines ran, not whether they are correct. 80% line coverage with weak assertions is "coverage theater" — tests that run code without verifying behavior. (caduh.com: "assert correctness, not execution") | Check branch coverage and assertion quality. Coverage is a floor, not a target. |
| "E2E tests verify the whole stack, so unit tests are redundant" | E2E tests verify one path through the stack. They cannot isolate which component is wrong, they are slow to run, and they cannot test edge cases or error paths cost-effectively. Unit tests verify components; E2E tests verify integration. (Fowler testing pyramid: "E2E is for smoke, not regression") | Maintain all three pyramid levels. E2E tests find what unit tests miss by design, not by substitution. |

## Commands

This is a strategy skill. For actual test commands, read the project's language-specific testing skill (e.g., pytest, cargo-test, vitest, go-test).
