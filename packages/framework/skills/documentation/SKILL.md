---
name: documentation
description: Documentation standards for project files, APIs, and changelogs. Load when writing doc comments, README files, CHANGELOG entries, or planning documentation strategy.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- **Why over what**: comments explain reasoning, not mechanics; if code is clear, the comment explains why this approach was chosen (community consensus)
- **Single source of truth**: document in one place, link from others; duplication creates disagreement when the primary source changes (Markin)
- **Freshness principle**: stale documentation is worse than no documentation — update docs in the same PR as code changes, not after (Qodo 2026)
- **Changelog format**: group entries by type using conventional commit vocabulary (Added, Changed, Fixed, Removed, Deprecated, Security); one entry per meaningful change (Keep a Changelog)
- **Doc comments for public APIs**: exported functions, classes, and types require doc comments; private internals do not (awesome-cursorrules)
- **README at feature boundaries**: each significant module or feature directory should have a README explaining purpose, setup, and usage (DEV Community)
- **Self-documenting names reduce comment need**: invest in naming before writing a comment (community consensus)
- **Code is the primary documentation**: separate doc files only when a concept cannot be expressed in code (Markin)

## Quality Criteria

- **Accuracy**: documentation matches actual behavior — test by checking whether the documented behavior can be reproduced exactly as written
- **Completeness**: all public API surfaces have doc comments; no exported function, class, or type is undocumented
- **Audience awareness**: documentation matches the reader's expertise level — API docs assume library users, README assumes new contributors
- **Consistency**: one doc comment format (JSDoc, rustdoc, godoc, etc.) used uniformly across the project; never mixed
- **Freshness**: documentation updated in the same commit as code changes — never deferred to a follow-up PR

## Vocabulary

- **doc comment**: a comment attached to a public API surface, processed by documentation generators (JSDoc `/** */`, Python `"""`, rustdoc `///`)
- **self-documenting code**: code whose names, types, and structure communicate intent without requiring comments
- **changelog**: a curated human-readable log of notable changes per version; distinct from git log (Keep a Changelog)
- **CHANGELOG.md**: the canonical file for tracking version-by-version changes in a project; entries grouped by type
- **stale documentation**: documentation that no longer reflects the current behavior; actively harmful because it misleads readers
- **conventional commit**: a commit message format (`type(scope): description`) that enables automated changelog generation
- **ADR**: Architecture Decision Record; a document capturing a significant architectural decision, its context, and consequences

## Anti-patterns

**Standard anti-patterns:**
- Comments that restate the code: `// increment counter` above `counter++` (community consensus)
- Duplicating information across README, inline comments, and external docs (Markin: creates disagreement on update)
- Stale documentation left in place — outdated docs are actively worse than no docs (Qodo 2026 freshness principle)
- Documenting modification history inline — use git commit history instead (Markin)

**AI-specific anti-patterns:**
- Generating documentation boilerplate from templates without reading the actual implementation — produces plausible-looking but inaccurate docs (IBM AI documentation guidelines: anti-hallucination)
- Hallucinating API parameters or return types not present in the code — internal misuse from false docs causes more bugs than missing docs
- Documenting obvious code to appear thorough — `// returns true if the value is true` is noise, not documentation
- Generating a README without reading the implementation — leads to README describing a different system than what was built (awesome-cursorrules)

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "I'll add doc comments after the API stabilizes" | The moment of writing is the moment of maximum context. After the API stabilizes, the author has lost the design reasoning that makes doc comments valuable. (DEV Community: "write the comment when you have the context, not when you have the time") | Write doc comments at implementation time. The comment captures the reasoning that will not be obvious in 6 months. |
| "Keeping docs in multiple places ensures people find them" | Documentation in multiple places is documentation in disagreement. When the primary source updates and the copy does not, the copy is wrong. Wrong documentation misleads more than absent documentation. (Markin: single source of truth) | Document in one place. Link from all other places. When the primary changes, links remain correct. |
| "I'll update the docs in a follow-up PR" | Follow-up PRs for docs are rarely merged. Code and docs that diverge in the same release window create permanent staleness. Stale docs are worse than no docs. (Qodo 2026 freshness principle: update in the same PR as code) | Update documentation in the same commit or PR as the code change. No follow-up. |
| "Generated documentation from templates is good enough for internal tools" | Template-generated docs have the shape of documentation but not the content. They create a false impression that a function is documented when it is not. Internal APIs built on misunderstood contracts cause bugs. (awesome-cursorrules: "lines of generated documentation = lines of debt") | Write accurate descriptions. If the effort feels high, the complexity is real — and worth capturing. |

## Commands

- TypeScript docs: `typedoc`
- Rust docs: `cargo doc --open`
- Python docs: `pdoc`
- Go docs: `godoc -http=:6060`
