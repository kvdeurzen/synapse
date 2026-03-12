---
name: vitest
description: Testing conventions for unit and integration tests using Vitest or bun:test. Load when writing or reviewing test code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Structure tests with `describe` blocks for grouping and `test`/`it` for individual cases
- Follow Arrange-Act-Assert: set up inputs, run the unit under test, then assert outcomes
- One concept per test — split unrelated assertions into separate `test` calls
- Co-locate test files with source: `src/auth.ts` → `src/auth.test.ts` or `test/unit/auth.test.ts`
- Test file names match source file names with `.test.ts` suffix
- Use `beforeEach`/`afterEach` for setup and teardown; prefer `afterEach` cleanup over `beforeAll` shared state

## Quality Criteria

- Each test runs in under 1 second — no slow I/O without mocking
- Tests are independent: no shared mutable state between `test` blocks
- Deterministic: no flaky behavior from timers, random values, or external services
- Tests verify behavior (inputs → outputs, side effects), not implementation details
- Spy/mock cleanup in `afterEach` to prevent test pollution

## Vocabulary

- **fixture**: reusable test data or setup shared across tests
- **spy**: a function wrapper that records calls without changing behavior
- **stub**: a replacement function with controlled return values for isolation
- **mock**: a full replacement of a module or dependency for isolation
- **snapshot**: a serialized value stored to detect regressions across test runs

## Anti-patterns

- Testing implementation details (internal function names, private state) — test behavior instead
- Shared mutable state across `test` blocks — use `beforeEach` to reset
- `setTimeout`/`sleep` in tests — use fake timers or redesign to avoid timing
- Testing third-party library behavior — test your integration code, not the library itself
- Over-mocking: mocking so much that the test only validates the mock configuration

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Testing implementation details is fine — I know the internals won't change" | Implementation tests couple the test to how the code works, not what it does. When you refactor (and you will), tests break even when behavior is preserved. The refactor becomes gated by test rewrites. (Fowler: "test behavior, not implementation") | Test through the public API. If behavior is the same, the test should not break on refactor. |
| "Shared mutable state across tests makes setup simpler" | Tests that share mutable state become order-dependent. They pass in one order and fail in another. The failure appears intermittent, making it nearly impossible to debug. (vitest docs: "each test must be independent") | Use `beforeEach` to reset state. The setup cost is minimal; the debugging cost of order-dependent tests is not. |
| "This test needs a `setTimeout` to let async operations settle" | `setTimeout` creates a timing dependency that makes tests flaky. On a slow machine or under load, the timeout is too short. On a fast machine, it is wasted time. (caduh.com: "control time explicitly; never use sleep") | Use `await` with the actual promise, or use fake timers (`vi.useFakeTimers()`) to control time deterministically. |
| "Over-mocking makes the test more isolated" | Over-mocked tests only validate that mock configuration is correct — they say nothing about whether the real code works. The more you mock, the less the test proves. (caduh.com: "mocking the code under test creates false positives") | Mock at boundaries (external services, I/O). Keep real logic in the code under test. |

## Commands

- Run all: `bun test` (bun:test) or `npx vitest` (vitest)
- Run specific: `bun test <file>` or `npx vitest <file>`
- Watch mode: `npx vitest --watch`
- Coverage: `npx vitest --coverage`
- Run single test: `npx vitest -t "test name"`
