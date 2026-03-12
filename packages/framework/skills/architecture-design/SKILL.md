---
name: architecture-design
description: Architectural conventions for clean boundaries and decision records. Load when designing system architecture or recording architectural decisions.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Dependency direction is non-negotiable: infrastructure → application → domain; never reverse (Hexagonal + DDD)
- Interface before implementation: define ports/contracts first, then write adapters (Hexagonal)
- ADR every significant decision: Title / Status / Context / Decision / Consequences; one decision per ADR; immutable once accepted (joelparkerhenderson)
- Functional core, imperative shell: pure business logic at center; I/O and side effects at edges (Hexagonal)
- Architecture as AI prompt: clean boundaries let agents work in isolated slices without full system context (muthu.co)
- Single responsibility + composition: small, focused components composed rather than monolithic classes (Hexagonal + Markin)
- Code is the primary documentation — use clear naming, types, and docstrings; minimize external docs (Markin)
- Y-statement format for decisions: "In the context of X, facing concern Y, we decided Z, to achieve Q, accepting R" (joelparkerhenderson)
- Validate at boundaries: input validation happens in the adapter/controller layer before reaching domain (DDD + Hexagonal)

## Quality Criteria

- No domain layer imports from infrastructure layer — dependency direction enforced at module boundary
- Every port has a defined interface before any adapter implementation exists
- ADR files use present-tense imperative, lowercase-with-dashes naming (e.g., `choose-database.md`) (joelparkerhenderson)
- Each component handles one concern; extract when responsibility count exceeds one
- Repository interfaces defined in domain layer, implemented in infrastructure layer (DDD + Hexagonal)
- Architectural decisions recorded as ADRs in `docs/decisions/` or `docs/adr/`
- New ADR created when an accepted ADR is superseded — do not amend immutable decisions
- Composition root is the only place where concrete adapters are wired to ports

## Vocabulary

- **port**: an interface at a layer boundary defining what behavior is needed (driving or driven port)
- **adapter**: a concrete implementation of a port for a specific technology (DB driver, HTTP client)
- **hexagonal architecture**: a pattern where business logic lives at center, ports define edges, adapters connect external systems
- **ADR**: Architecture Decision Record — a short document capturing one significant architectural choice
- **domain layer**: contains business logic and entities; has zero knowledge of infrastructure
- **composition root**: the single location where all adapters are wired to their ports via dependency injection
- **driving port**: a port through which external actors trigger the application (e.g., HTTP controller)
- **driven port**: a port through which the application accesses external systems (e.g., repository)

## Anti-patterns

- Domain objects importing infrastructure libraries — violates dependency direction (Hexagonal + DDD)
- Making significant decisions without recording them as ADRs (joelparkerhenderson)
- Verbose documentation over clean code structure — "code is the primary documentation" (Markin)
- Monolithic classes combining business logic with I/O — violates functional core/imperative shell (Hexagonal)
- Duplicating documentation across locations — single source of truth; link rather than restate (Markin)
- Amending accepted ADRs — create a new superseding ADR instead (joelparkerhenderson)

## Anti-patterns (additional)

- Designing the entire system upfront before any implementation — architecture emerges; iterate with working code
- Skipping the dependency direction check — infrastructure imports in domain code are silent violations
- One monolithic ADR covering multiple decisions — each ADR captures exactly one decision (joelparkerhenderson)
- Tight coupling between adapters — adapters depend on ports, never on each other directly
- Skipping interface definition when "only one implementation exists" — testability requires the interface anyway

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "The architecture is obvious for this small feature" | Obvious architectures skip option enumeration — the step that surfaces the constraint you weren't thinking about. Small features have caused the most irreversible architectural debt when "obvious" choices accumulated unchecked. (Hexagonal Architecture community: "every dependency direction violation starts as obvious") | Enumerate at least 3 approaches even for small features. If the obvious choice is right, enumeration confirms it in minutes. |
| "I can write the ADR after we see if this works" | ADRs capture the reasoning at the moment of decision — when you know the context, constraints, and alternatives considered. Writing after-the-fact produces a justification, not a decision record. (joelparkerhenderson ADR methodology: "context is irreplaceable") | Write the ADR before implementation. The reasoning IS the valuable artifact, not the outcome description. |
| "Skipping the interface definition saves time — there's only one implementation" | Interfaces are required for testability, not just for multiple implementations. A class without an interface cannot be replaced with a test double. The time "saved" is paid back with interest in untestable code. (Hexagonal Architecture: ports exist for testability, not polymorphism) | Define the port/interface first. It takes minutes and unlocks the entire testing strategy. |
| "The dependency direction doesn't matter here, it's just a utility" | Every infrastructure import in domain code is "just a utility" until you need to swap the infrastructure. Silent violations accumulate until the architecture is unmovable. (DDD + Hexagonal: dependency direction is a non-negotiable invariant) | Route the dependency through a port at the domain boundary, even if it feels over-engineered today. |
| "We can refactor the architecture later when it matters" | Architecture is hardest to change when it matters most — under deadline pressure with existing users. The cost of a wrong dependency direction grows with every feature built on top of it. (Martin Fowler: "architecture is the decisions that are hard to change later") | Make the architectural decision explicitly now, document it, and accept the constraints that follow. |

## Commands

This is a cognitive skill — no executable commands. ADR files go in `docs/decisions/` or `docs/adr/` using the naming format: `NNN-title-with-dashes.md`.
