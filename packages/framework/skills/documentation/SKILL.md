---
name: documentation
description: When, what, and how to document code and systems. Load when writing comments, doc comments, README files, or planning documentation strategy.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Comments explain why, not what: if code is clear, the comment explains the reasoning, not the mechanics (community consensus)
- Doc comments for all public API surfaces: exported functions, classes, and types need doc comments; private internals do not (awesome-cursorrules + DEV Community)
- README at major feature boundaries: each significant module or feature directory should have a README (DEV Community)
- Never duplicate documentation: single source of truth; link rather than restate (Markin)
- Self-documenting names reduce comment need: invest in naming before writing a comment (community consensus)
- Structured logging over string interpolation: treat log output as queryable data with named fields (Markin)
- Document the "what and when" externally (README); the "why" inline (comments) (synthesis across sources)
- Code is the primary documentation — separate doc files only when concept cannot be expressed in code (Markin)
- Flag incomplete or uncertain code with `TODO:` or `FIXME:` comments — do not silently leave ambiguities (awesome-cursorrules)

## Quality Criteria

- All exported functions/classes have doc comments (JSDoc, docstring, rustdoc, godoc as appropriate) (awesome-cursorrules)
- No redundant comments restating what clear code already expresses (community consensus)
- Each major feature directory has a README.md (DEV Community)
- Comments explain WHY, not WHAT — test by checking if removing the comment loses information (community consensus)
- Log statements use structured fields, not string interpolation (Markin)
- No documentation duplicated across multiple locations — single source of truth (Markin)

## Vocabulary

- **doc comment**: a comment attached to a public API surface, processed by documentation generators (JSDoc `/** */`, Python `"""`, rustdoc `///`)
- **self-documenting code**: code whose names, types, and structure communicate intent without needing comments
- **structured logging**: log output with named key-value fields rather than interpolated strings
- **README**: a markdown file in a directory explaining purpose, setup, and usage
- **docstring**: an inline string literal (Python `"""..."""`) serving as the doc comment for a function or class
- **API documentation**: generated reference docs derived from doc comments; never written separately from source

## Anti-patterns

- Comments that restate the code: `// increment counter` above `counter++` (community consensus)
- Missing doc comments on public API while commenting private internals (awesome-cursorrules: inverted priority)
- Duplicating the same information in README, inline comments, and external docs (Markin)
- String-interpolated log messages instead of structured logging (Markin)
- Documenting modification history inline — use git commit history instead (Markin)
- Over-documenting trivial code to meet coverage metrics (awesome-cursorrules: "lines of code = debt")

## Anti-patterns (additional)

- Writing comments before checking if a better name would eliminate the need for the comment
- Using comments to compensate for confusing code — refactor the code instead
- Keeping stale documentation instead of updating it — outdated docs are worse than no docs
- Generating documentation from boilerplate templates instead of writing accurate descriptions
- Inconsistent doc comment style across the codebase — pick one format (JSDoc, rustdoc, etc.) and enforce it

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "I'll add doc comments after the API stabilizes" | Doc comments are hardest to write accurately after the API stabilizes — by then, the author has lost the design context that makes comments valuable. The moment of writing is the moment of maximum context. (DEV Community: "write the comment when you have the context, not when you have the time") | Write doc comments at the time of implementation. The comment explains the reasoning that won't be obvious in 6 months. |
| "A comment explaining what the code does is better than nothing" | Comments that restate what the code does add visual noise without information. They become incorrect when the code changes but the comment is not updated — worse than no comment. (Community consensus: "comments that describe the what are technical debt") | Delete the what-comment. Improve the name if the code is not self-explanatory. If reasoning context is needed, write the why. |
| "Keeping documentation in multiple places ensures people find it" | Documentation in multiple places is documentation in disagreement. When the primary source is updated and the copy is not, the copy is wrong. Wrong documentation is more harmful than absent documentation. (Markin: "single source of truth; link rather than restate") | Document in one place. Link from other places. When the primary changes, the links are still correct. |
| "Generated documentation from templates is good enough for internal tools" | Template-generated documentation has the shape of documentation but not the content. It creates the false impression that a function is documented when it is not. Internal tools built on misunderstood APIs cause more bugs than external APIs. (awesome-cursorrules: "lines of generated documentation = lines of debt") | Write accurate descriptions. If accuracy requires effort, the effort is worth making — internal misuse is still misuse. |

## Commands

- TypeScript docs: `typedoc`
- Rust docs: `cargo doc --open`
- Python docs: `pdoc`
- Go docs: `godoc -http=:6060`
