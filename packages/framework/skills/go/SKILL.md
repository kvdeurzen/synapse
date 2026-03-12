---
name: go
description: Go conventions for idiomatic, readable, and maintainable code. Load when writing or reviewing Go code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- `gofmt` and `goimports` always — no manual formatting; CI enforces this
- Error wrapping with `fmt.Errorf("context: %w", err)` — preserves stack for `errors.Is`/`errors.As`
- Interfaces for behavior, not data: define interfaces where the consumer needs abstraction, not where the producer lives
- `context.Context` as first parameter for all cancellable or timed operations: `func Fetch(ctx context.Context, ...)`
- Goroutine lifecycle management: every goroutine needs a clear termination signal (context cancellation, channel close, WaitGroup)
- Named return values only for documentation, never as a shortcut — avoid naked returns
- `defer` for cleanup at acquisition site: open file → defer close on the next line
- Use `errors.Is` and `errors.As` for error checking, not string comparison

## Quality Criteria

- `go vet ./...` passes with zero issues
- `golangci-lint run` passes with project configuration
- No goroutine leaks — every goroutine has a termination path
- All exported symbols have doc comments (`// TypeName does X`)
- Errors are wrapped with context at each layer — root cause traceable via `errors.Unwrap`
- `go mod tidy` produces no changes — module graph is clean
- `go test -race ./...` passes — data race detector finds no races
- All interface types defined where they are consumed, not where they are implemented

## Vocabulary

- **goroutine**: a lightweight thread managed by the Go runtime; launched with `go func()`
- **channel**: typed communication pipe between goroutines; `chan T` (unbuffered) or `chan T` (buffered)
- **interface**: a set of method signatures; satisfied implicitly — no `implements` keyword
- **defer**: schedules a function call to run when the enclosing function returns
- **embedding**: including a type inside a struct without a field name — promotes its methods
- **slice**: a dynamic view into an underlying array; has length and capacity: `make([]T, len, cap)`
- **sentinel error**: a package-level `var ErrXxx = errors.New("...")` used with `errors.Is` for comparison

## Anti-patterns

- `interface{}` (or `any`) where a specific type or generic suffices — loses type safety
- Ignoring errors: `result, _ := fn()` — always handle or explicitly propagate
- String comparison for errors: `err.Error() == "not found"` — use `errors.Is` with sentinel errors
- Goroutines without termination paths — leaks resources in long-running services
- `init()` functions with side effects — prefer explicit initialization in `main()` or constructors
- Naked returns from long functions — obscures what values are being returned
- Package-level global variables for mutable state — use dependency injection to pass state explicitly
- Panic in library code — return errors; panic is reserved for unrecoverable programmer errors

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Ignoring this error with `_` is fine — it can't fail in practice" | "Can't fail in practice" is a prediction about all future inputs, all future environments, and all future refactors. When it does fail, the error is silently discarded and the program continues in an undefined state. (Go FAQ: "error handling is not optional") | Handle or explicitly propagate the error. If ignoring it is intentional, document why with a comment. |
| "Using `interface{}` is simpler than generics for this utility function" | `interface{}` moves type checking from compile time to runtime. The function's callers can pass any type and the error only appears at the assertion inside the function — if the assertion is even written. (Go 1.18 generics proposal: "type safety should not require verbosity trade-offs") | Use generics (`[T any]`) for type-safe utilities. Use concrete types when the domain is well-defined. |
| "A goroutine that runs until the program exits doesn't need a termination signal" | Goroutines without termination signals leak when the service shuts down. In test contexts, they cause "goroutine still running" errors and race conditions. In production, they exhaust the goroutine pool over time. (Go concurrency patterns: "every goroutine needs a clear lifetime") | Pass a `context.Context` for all goroutines. Cancel it on shutdown. Use `WaitGroup` to wait for clean termination. |
| "String comparison for error checking is simpler than sentinel errors" | String comparison breaks when the error message is changed, translated, or wrapped. It is also brittle across Go version updates. (Go errors package docs: "use errors.Is and errors.As, never string comparison") | Define package-level sentinel errors with `var ErrXxx = errors.New("...")` and check with `errors.Is`. |

## Commands

- Build: `go build ./...`
- Run tests: `go test ./...`
- Vet: `go vet ./...`
- Lint: `golangci-lint run`
- Format imports: `goimports -w .`
- Tidy module: `go mod tidy`
- Check vulnerabilities: `govulncheck ./...`
- Generate code: `go generate ./...`
