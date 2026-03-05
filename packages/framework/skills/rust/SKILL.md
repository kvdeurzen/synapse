---
name: rust
description: Rust conventions for safe, idiomatic, and performant systems code. Load when writing or reviewing Rust code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Ownership model: each value has one owner; transfer ownership explicitly rather than cloning unnecessarily
- `Result<T, E>` for all fallible operations — use the `?` operator to propagate errors up the call stack
- Traits over inheritance: define behavior through trait implementations; compose via trait bounds
- Use `clippy` for linting — treat all clippy warnings as errors in CI (`-D warnings`)
- Use `rustfmt` for formatting — do not override default formatting preferences
- No `unwrap()` in production code — use `expect("reason")` with a descriptive message, or handle the error
- Prefer `&str` over `String` in function parameters when ownership is not needed
- Use `Arc<Mutex<T>>` for shared mutable state across threads; prefer message passing (channels) when feasible
- Derive `Debug`, `Clone`, and `PartialEq` on structs and enums when semantically appropriate
- Use `thiserror` crate for library error types; use `anyhow` for application-level error propagation
- Prefer iterators and `collect()` over manual loop accumulation for transformations

## Quality Criteria

- `cargo clippy -- -D warnings` passes with zero warnings in CI
- No `unwrap()` calls in library code — only in tests and main() with explicit justification
- All public APIs documented with `///` doc comments
- `cargo test` passes with zero failures
- No unsafe blocks without a safety comment explaining why the invariants are upheld
- Memory safety verified by the borrow checker — no raw pointer arithmetic without justification
- `cargo fmt -- --check` passes in CI — no unformatted code merged
- Error types implement `std::error::Error` + `Display` for proper propagation

## Vocabulary

- **ownership**: each value has exactly one owner; value is dropped when owner goes out of scope
- **borrowing**: temporary reference to a value without taking ownership (`&T` immutable, `&mut T` mutable)
- **lifetime**: annotation (`'a`) that tells the compiler how long a reference is valid
- **trait**: a set of method signatures that a type can implement (analogous to an interface)
- **enum variant**: a named case in a Rust enum; may carry associated data (sum type)
- **pattern matching**: `match` expression that exhaustively covers all enum variants or value ranges
- **RAII**: Resource Acquisition Is Initialization — resources tied to object lifetimes; `Drop` runs on scope exit
- **zero-cost abstraction**: a higher-level construct that compiles to the same code as hand-written low-level code

## Anti-patterns

- `unwrap()` without justification — panics on `None`/`Err`; use `?` or explicit error handling
- Cloning to avoid borrow checker complaints — rethink ownership instead
- `unsafe` blocks without a `// SAFETY:` comment explaining the invariants upheld
- Overusing `Arc<Mutex<T>>` when a single-threaded design would suffice
- Ignoring clippy warnings — they encode community best practices
- Using `String` parameter types where `&str` suffices — forces unnecessary allocation

## Commands

- Build: `cargo build`
- Build release: `cargo build --release`
- Run tests: `cargo test`
- Lint: `cargo clippy -- -D warnings`
- Format: `cargo fmt`
- Check (no binary): `cargo check`
- Open docs: `cargo doc --open`
