---
name: cargo-test
description: Rust testing conventions using cargo test and the built-in test framework. Load when writing or reviewing Rust tests.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Unit tests go in a `#[cfg(test)]` module in the same file as the code under test
- Integration tests go in a `tests/` directory at the crate root — each file is a separate test binary
- Use `assert!`, `assert_eq!`, and `assert_ne!` macros for assertions
- Return `Result<(), Box<dyn std::error::Error>>` from tests to use `?` for propagation
- Use `#[should_panic]` with `expected = "message"` for tests that verify panic behavior
- Test names should describe behavior: `fn returns_error_when_token_expired()` not `fn test1()`
- Use `#[ignore]` for slow integration tests that should run explicitly, not on every `cargo test`
- Fixture data shared across tests goes in a `tests/common/mod.rs` helper module
- Use `tempfile` crate for tests that need temporary files or directories

## Quality Criteria

- All public API paths covered by unit or integration tests
- Each test function tests one behavior — split multi-assertion tests into separate functions
- Tests use `assert_eq!` rather than `assert!(a == b)` — better error messages on failure
- Integration tests in `tests/` do not depend on internal module state — use only public API
- `cargo test` passes with zero failures and zero warnings
- Test names are descriptive enough to diagnose failures without reading the test body

## Vocabulary

- **unit test**: a `#[test]` function inside a `#[cfg(test)]` module in the source file
- **integration test**: a file in `tests/` directory that tests the crate as an external user would
- **test binary**: the compiled executable produced from a `tests/*.rs` file or `#[cfg(test)]` module
- **#[should_panic]**: attribute marking a test that must panic to pass; `expected` asserts the panic message
- **#[ignore]**: marks a test to be skipped by default; run with `-- --ignored` flag
- **test harness**: the default cargo test runner that collects and runs `#[test]` functions

## Anti-patterns

- Tests with `unwrap()` on `Result` — use `?` with `Result<(), Box<dyn Error>>` return type instead
- Calling `unwrap()` in non-test code to make tests "pass" — handle errors properly
- Integration tests accessing private module internals — test the public API
- Tests with side effects that leave persistent state — clean up in `Drop` or test teardown
- Using `println!` in tests to understand failures — use `assert_eq!` with descriptive messages
- Ignoring `#[cfg(test)]` module entirely and only writing integration tests

## Anti-patterns (additional)

- Putting test helpers in the same `#[cfg(test)]` block without `#[test]` attribute — they compile in test mode only; put shared helpers in a separate module if needed in integration tests
- Writing one giant `#[test]` function that tests multiple behaviors — split into focused test functions

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Using `.unwrap()` in tests makes them shorter" | `.unwrap()` in tests produces panic messages with no context about which assertion failed or why. When a test panics, the output shows the unwrap location, not the test intent. (Rust testing docs: "return Result from tests to propagate errors with context") | Return `Result<(), Box<dyn std::error::Error>>` from test functions. Use `?` to propagate. Failures show the chain of causes. |
| "Integration tests can access private internals for better coverage" | Integration tests that access private internals are not integration tests — they are whitebox tests with the cost of both integration and unit tests and the benefits of neither. When internals change, both the code and the integration test break. (Rust testing docs: "tests/ directory tests the public API as an external user would") | Test the public API in `tests/`. Test internals via the `#[cfg(test)]` module in the source file. Each test type has a purpose. |
| "One large `#[test]` function covers the whole feature quickly" | A single large test function has a single success/failure status. When it fails, you know the feature is broken but not which behavior failed. Splitting into focused functions makes failures instantly diagnosable. (Rust community: "one test function = one behavior under test") | Split into focused test functions, each covering one behavior. The name of the failing function IS the diagnosis. |
| "I'll skip `#[ignore]` on slow integration tests — they only run in CI anyway" | Slow tests without `#[ignore]` run on every `cargo test` invocation during development, even locally. Slow local test runs discourage running tests frequently, which is when tests are most valuable. (cargo test docs: "use #[ignore] to separate fast and slow tests explicitly") | Mark slow integration tests with `#[ignore]`. Run them explicitly with `cargo test -- --ignored` or in CI only. |

## Commands

- Run all tests: `cargo test`
- Show output: `cargo test -- --nocapture`
- Run single test: `cargo test <test_name>`
- Run integration tests: `cargo test --test <integration_file>`
- Run ignored tests: `cargo test -- --ignored`
- List tests: `cargo test -- --list`
- Run with threads: `cargo test -- --test-threads=4`
