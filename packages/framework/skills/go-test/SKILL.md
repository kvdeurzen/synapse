---
name: go-test
description: Go testing conventions using the standard testing package. Load when writing or reviewing Go tests.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Table-driven tests: define a slice of `struct{ name, input, want }` and range over it with `t.Run()`
- `t.Run("description", func(t *testing.T) {...})` for subtests — enables targeted execution
- `t.Parallel()` at the top of independent tests to enable concurrent execution
- `testdata/` directory for test fixtures (files, golden outputs, fixtures) — never inline large data
- No `init()` functions in test files — use `TestMain` for package-level setup if needed
- Test helper functions accept `t *testing.T` as first arg and call `t.Helper()` at start
- Error messages use `t.Errorf` (continue test) not `t.Fatalf` unless failure makes further steps meaningless
- Use `//go:build integration` build tag on integration tests to exclude them from regular `go test ./...`
- Clean up resources with `t.Cleanup(func() { ... })` — runs after test completion in all cases

## Quality Criteria

- All table test cases have a descriptive `name` field that makes failures self-explanatory
- Test functions cover happy path, error paths, and edge cases (zero, max, nil)
- No shared mutable state between test functions — each test is independent
- `go test -race ./...` passes — no data races detected
- Integration tests tagged with `//go:build integration` to separate from unit tests
- Test file names follow `*_test.go` convention; package name matches source or uses `_test` suffix
- Test helpers call `t.Helper()` — ensures failure messages point to the test line, not the helper
- `go test -count=1 ./...` passes with `-count=1` to bypass test caching and get fresh results

## Vocabulary

- **table-driven test**: a test using a slice of inputs/outputs iterated with `t.Run()` per case
- **subtest**: a named test case created with `t.Run()` — can be run individually
- **test helper**: a function called from tests that calls `t.Helper()` to improve failure attribution
- **golden file**: a file in `testdata/` containing expected output, compared against actual output in tests
- **race detector**: Go's built-in concurrency analyzer; enabled with `-race` flag
- **TestMain**: a special function for package-level setup/teardown; calls `m.Run()` to execute tests

## Anti-patterns

- One large test function asserting many unrelated behaviors — split into subtests
- Hard-coded test data inline for complex inputs — use `testdata/` files
- `t.Fatal` in helper functions without `t.Helper()` — reports wrong file and line
- Non-parallel tests that could safely run in parallel — slows the test suite unnecessarily
- Asserting on error message strings — use `errors.Is` or type assertions instead
- Tests that depend on execution order — every test must be independent
- Table-driven tests without a `name` field — failure output becomes impossible to trace
- Using `log.Fatal` or `os.Exit` in test code — bypasses cleanup and panics goroutines

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Writing a single test function that covers multiple behaviors is more concise" | One function covering multiple behaviors produces failure messages that don't identify which behavior failed. Adding a case requires modifying a large function instead of adding a row to a table. (Go testing community: "table-driven tests are the canonical Go testing pattern") | Use table-driven tests with `t.Run()`. Each case has a name, and failures are immediately traceable. |
| "Test helpers don't need `t.Helper()` — the line numbers are close enough" | Without `t.Helper()`, a failure in a helper function reports the helper's line number, not the test's line number. The failure appears to be in the shared helper, not in the test that triggered it. (Go testing docs: "t.Helper() is required for correct failure attribution") | Add `t.Helper()` as the first line of every test helper function. |
| "Running tests in parallel everywhere could cause race conditions" | Tests that cannot safely run in parallel have implicit shared state or implicit ordering dependencies. Both are bugs. `t.Parallel()` makes safe tests faster and makes unsafe tests reveal their problems. (Go testing docs: "parallel tests expose race conditions that sequential tests hide") | Add `t.Parallel()` to tests that are independent. Fix the shared state or ordering dependency in tests that fail with parallel execution. |
| "I'll inline test data rather than use testdata/ files for this complex case" | Large inline test data clutters the test function, makes diffs hard to review, and cannot be versioned independently of the test logic. Binary test data cannot be inlined at all. (Go community: "testdata/ is the canonical location for test fixtures") | Put complex input/output data in `testdata/` files. Load them with `os.ReadFile`. Update them with golden file patterns. |

## Commands

- Run all tests: `go test ./...`
- Run single test: `go test -run TestFunctionName ./...`
- Verbose output: `go test -v ./...`
- Race detector: `go test -race ./...`
- Coverage: `go test -cover ./...`
- Coverage report: `go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out`
- Run with fresh cache: `go test -count=1 ./...`
- Run integration tests: `go test -tags integration ./...`
