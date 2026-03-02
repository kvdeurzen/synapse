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
