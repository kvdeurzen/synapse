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

## Commands

- Build: `go build ./...`
- Run tests: `go test ./...`
- Vet: `go vet ./...`
- Lint: `golangci-lint run`
- Format imports: `goimports -w .`
- Tidy module: `go mod tidy`
- Check vulnerabilities: `govulncheck ./...`
- Generate code: `go generate ./...`
