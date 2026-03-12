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

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "I'll use `.unwrap()` here and clean it up later" | `.unwrap()` in production code is a deferred panic. It will fire at runtime, in production, on the exact input that wasn't tested. The "later" cleanup almost never happens. (Rust community: "unwrap is technical debt with interest") | Use `?` to propagate the error, or `expect("descriptive reason")` if panic is truly intended. The message tells the responder what went wrong. |
| "Cloning here avoids the borrow checker complaint" | Cloning to satisfy the borrow checker means you haven't understood the ownership structure yet. The clone is masking a design problem — who should own this data? (Rust Book: "borrow checker complaints are design feedback") | Understand the ownership. Restructure to pass references or redesign ownership. Cloning has runtime cost and hides intent. |
| "This `unsafe` block is fine — I know the invariants" | Unsafe blocks are promises to the compiler that the programmer cannot verify mechanically. Every unsafe block is a human-verified contract that must be documented. If the invariant isn't written down, it will be violated during the next refactor. (Rust Reference: "every unsafe block requires a SAFETY comment") | Add a `// SAFETY:` comment explaining exactly which invariants make this block safe. If you can't write the comment, the block is not safe. |
| "Clippy warnings are overly pedantic for this codebase" | Clippy warnings encode Rust community best practices derived from real-world bugs and performance issues. Each warning suppressed is a known pitfall left unaddressed. (Rust team: "clippy warnings are applied best practices, not style preferences") | Fix clippy warnings. If a specific warning is a false positive, use `#[allow(clippy::specific_lint)]` with a comment explaining why. |

## Commands

- Build: `cargo build`
- Build release: `cargo build --release`
- Run tests: `cargo test`
- Lint: `cargo clippy -- -D warnings`
- Format: `cargo fmt`
- Check (no binary): `cargo check`
- Open docs: `cargo doc --open`
