# Generic Skills Research: Community Cursor Rules & LLM Coding Guidelines

Research conducted: 2026-03-05
Methodology: Web searches across cursor rules repos, awesome-cursorrules, Claude Code skills directories, cursor.directory, and authoritative testing/architecture references.

---

## 1. Testing Strategy

### Source 1: Martin Fowler — The Practical Test Pyramid (https://martinfowler.com/articles/practical-test-pyramid.html)

The canonical reference for language-agnostic testing strategy. Repeatedly cited across cursor rules and agent skills.

- Write lots of small, fast unit tests; some integration tests; very few E2E tests
- Unit tests: test public interfaces, not private methods or implementation details
- Unit tests: test observable behavior — what the code does, not how it does it
- Mocking: stub external dependencies (databases, APIs, filesystems); avoid hitting production systems
- Two mocking philosophies: "solitary" (mock all collaborators) vs. "sociable" (use real collaborators when practical)
- Integration tests: test one integration point at a time narrowly (DB, API boundary, filesystem)
- Contract tests: consumer-driven contracts (CDC) ensure both sides of a service boundary respect the interface
- E2E: test core user journeys only; never duplicate conditions already covered at lower levels
- Universal rule: "push tests as far down the pyramid as possible"
- Structure: Arrange-Act-Assert (or Given-When-Then) consistently across all levels
- Do NOT test: trivial getters/setters, private methods (refactor instead), code without conditional logic

### Source 2: awesome-cursorrules — Vitest Unit Testing + Cypress E2E Rules (https://github.com/PatrickJS/awesome-cursorrules)

Extracted from `.cursorrules` files for Vitest unit testing and Cypress E2E testing.

- Mock dependencies before imports using `vi.mock` / `cy.intercept` — mocking happens before the module under test is loaded
- Clear mocks between tests: `beforeEach(() => { vi.clearAllMocks(); })`
- Use `data-testid` selectors (not CSS or XPath) for resilient test selection
- Limit to 3–5 focused tests per file for maintainability
- Use `describe` blocks to group related tests; Arrange-Act-Assert explicitly
- Test async operations with `async/await` and proper error handling
- Verify both success outcomes and error states
- For E2E: avoid hard-coded waits; use `cy.wait()` on intercepted requests
- Test API calls: assert on mock invocation parameters and call count
- Search existing mocks before creating new ones
- Use `afterAll()` for cleanup rather than excessive `beforeEach()` setup
- TDD constraint: "Focus ONLY on user-provided test cases, ignore existing source code assumptions"
- DOM selection priority: `data-testid` → `id` → className → complex selectors (avoid)

### Source 3: The Testing Pyramid That Actually Works (https://www.caduh.com/blog/testing-pyramid-that-actually-works)

A practical, opinionated testing strategy guide widely cited in testing communities.

- Test ratios by count: Unit 60–70% / Integration 20–30% / E2E 5–10%
- Time budgets: Unit ≤ 2–3 min total / Integration ≤ 5–7 min / E2E smoke < 3 min on PRs; full suite nightly
- Unit scope: functions, small classes, reducers, utilities — "no network/disk/clock; use fakes for boundaries"
- Integration scope: your code + real DB, queues, caches (use Testcontainers or docker-compose)
- E2E scope: cross-service flows via browser + API + DB; test happy paths + a couple of edge cases
- Mock: third-party APIs, email/SMS, payments, clock, randomness, OS/FS when slow
- Do NOT mock: the code under test (creates false positives), your own internal interfaces (use fakes instead), snapshot tests except stable human-reviewable output
- Coverage targets: ~80% line / ~60% branch overall; gate merges on changed-file coverage not repo-wide
- Use mutation testing on critical modules to validate assertion quality
- Flake control: freeze clocks, block unexpected HTTP, wait for signals instead of sleeping, seed RNGs

### Source 4: Claude Code TDD Skill — AI Hero (https://www.aihero.dev/skill-test-driven-development-claude-code)

Claude Code skill enforcing TDD discipline for AI-assisted development.

- Strict red-green-refactor: write one failing test → minimal implementation → refactor
- Never write tests in bulk — tests written in bulk "test imagined behavior, not observed behavior"
- Good tests: exercise real code through public interfaces, describe WHAT not HOW, survive refactors unchanged
- Bad tests: mock internal collaborators, test implementation details, break on refactor without behavior change
- Pre-implementation checklist: What interface changes are needed? Which behaviors matter most? Can design favor deep modules? Can design support testability?
- Principle: "When you can trust the tests, you can trust the code"

### Condensed Takeaways

- **Pyramid ratio**: 60–70% unit / 20–30% integration / 5–10% E2E — enforce this proportion deliberately
- **Test behavior, not implementation**: public interfaces only; private methods indicate design problems
- **Mocking discipline**: mock at boundaries (external services, I/O, clock), not internal collaborators
- **data-testid selectors**: use stable test IDs over CSS/XPath for UI tests
- **No duplication across levels**: if a unit test covers an edge case, the E2E should not repeat it
- **TDD vertically**: one test → one implementation → repeat; never bulk-write tests
- **Flake prevention**: control time, randomness, and network deterministically; never sleep

---

## 2. Architecture Design

### Source 1: Hexagonal Architecture / Ports & Adapters — "The Architecture is the Prompt" (https://notes.muthu.co/2025/11/the-architecture-is-the-prompt-guiding-ai-with-hexagonal-design/)

Explores how clean architectural boundaries make AI coding agents more effective.

- All dependency arrows point inward: infrastructure depends on business logic, never the reverse
- Three layers: Core (pure business logic, zero external dependencies) / Ports (interface contracts at boundaries) / Adapters (concrete implementations for specific technologies)
- Isolation of concerns: business domain cannot access infrastructure libraries
- Interface-first design: ports (driving and driven) establish formal contracts before implementation
- Compiler enforcement: architectural boundaries become physically impossible to violate via missing dependencies
- Single responsibility: each component (domain object, use case, adapter) handles one concern
- "The architecture itself becomes the ultimate prompt" — clean structure guides AI more than verbose documentation
- Break AI tasks into focused, isolated work within defined boundaries rather than comprehensive instructions

### Source 2: Architecture Decision Records (ADR) — joelparkerhenderson/architecture-decision-record (https://github.com/joelparkerhenderson/architecture-decision-record)

The canonical ADR reference collecting templates and best practices.

- Each ADR addresses one decision, not multiple
- Standard sections: **Title / Status / Context / Decision / Consequences / Rationale**
- Context: explain organizational priorities, business context, relevant constraints
- Decision: the specific architectural choice made
- Consequences: what follows from the decision; subsequent ADRs triggered; after-action review plan
- Rationale: pros/cons aligned with organizational needs; reasoning not just the conclusion
- Immutability: when team accepts an ADR it becomes immutable; new insights create a new superseding ADR
- Include timestamps for information that may change over time
- File naming convention: present-tense imperative verbs, lowercase with dashes (e.g., `choose-database.md`)
- Y-statement format: "In the context of X, facing concern Y, we decided Z, to achieve Q, accepting that R"

### Source 3: Cursor IDE Rules for AI — Kirill Markin (https://kirill-markin.com/articles/cursor-ide-rules-for-ai/)

Practical architectural conventions embedded in cursor rules for AI assistants.

- Code is the primary documentation — use clear naming, types, and docstrings
- Minimize external docs; keep documentation in function/class docstrings; separate files only when concept cannot be expressed in code
- Functional programming as default methodology; OOP reserved for connectors and interfaces to external systems
- Pure functions with no side effects on inputs or global state
- Structured data models (Pydantic, interfaces) over loose dictionaries
- Single source of truth: avoid duplicating documentation across multiple locations
- Reference instead of repeat: link to existing sources rather than restating
- Repository-level rules should include: brief project overview, architecture patterns for AI to understand, specific code conventions

### Source 4: DDD and Hexagonal Architecture for AI Agents (https://medium.com/@bardia.khosravi/backend-coding-rules-for-ai-coding-agents-ddd-and-hexagonal-architecture-ecafe91c753f)

Backend coding rules designed specifically for AI coding agents.

- Domain layer has zero knowledge of adapter implementations
- Ports define interfaces between layers; external systems implement driven ports
- Dependency injection wires adapters to ports at composition root
- Domain services contain business logic with no infrastructure imports
- Repository interfaces defined in domain layer, implemented in infrastructure layer
- Use case / application service layer orchestrates domain objects without business logic
- Validate at boundaries: input validation happens in the adapter layer before reaching domain

### Condensed Takeaways

- **Dependency direction is non-negotiable**: infrastructure → application → domain; never reverse
- **Interface before implementation**: define ports/contracts first, then write adapters
- **ADR every significant decision**: Title / Status / Context / Decision / Consequences; one decision per ADR; immutable once accepted
- **Functional core, imperative shell**: pure business logic at center; I/O and side effects at edges
- **Architecture as AI prompt**: clean boundaries let agents work in isolated slices without needing full system context
- **Single responsibility + composition**: small, focused components composed rather than monolithic classes

---

## 3. Security

### Source 1: Cloud Security Alliance — Secure Vibe Coding with Cursor Rules (https://cloudsecurityalliance.org/blog/2025/05/06/secure-vibe-coding-level-up-with-cursor-rules-and-the-r-a-i-l-g-u-a-r-d-framework)

Security conventions from the R.A.I.L.G.U.A.R.D. framework for embedding security into cursor rules.

- Never hardcode secrets, credentials, or API keys — use environment variables or secure vaults
- Validate and sanitize all user input; escape output in HTML, JS, and SQL contexts
- Use parameterized queries for all database access (ORM preferred); never concatenate strings for queries
- Implement RBAC for sensitive operations; enforce principle of least privilege (zero trust)
- Prohibit unsafe functions: `exec()`, `eval()`, dynamic SQL string construction
- Implement secure authentication frameworks rather than custom solutions
- Store passwords using strong, salted hashes (Argon2)
- Set security headers: CSP, HSTS, X-Content-Type-Options
- Use HTTPS; httpOnly, SameSite cookies for sessions
- Never expose stack traces or internal errors to users
- Log security events without capturing sensitive data
- Packages must originate from verified sources; new dependencies require explicit approval
- R.A.I.L.G.U.A.R.D.: embed security reasoning into AI prompts before code output

### Source 2: Principles for Coding Securely with LLMs — Sean Goedecke (https://www.seangoedecke.com/ai-security/)

First-principles analysis of security risks specific to LLM-assisted development.

- Core rule: "treat LLM output like user input" — models can act unpredictably or be manipulated
- Prompt injection is unavoidable: any user-generated content in prompts creates vulnerability
- Tool access control: scope LLM tools to current user permissions as if they were user-facing APIs
- Never expose tools via LLM that you wouldn't expose directly to the end user
- Multi-user tools (send_message, transactions) require manual approval or strict isolation
- All LLM-generated code requires sanitization equivalent to untrusted user input
- MCP servers are remote libraries: treat with same caution as external dependencies
- Implement human-in-the-loop approval for shell commands and code execution
- DOS mitigation: concurrent session limits, token length constraints, controlled free tier access
- Use established, trusted models; custom-trained models carry data leakage risks

### Source 3: OWASP Top 10 / cursor-secure-coding — Van-LLM-Crew (https://github.com/Van-LLM-Crew/cursor-secure-coding)

ASVS Level 1 and Level 2 cursor rules for application security verification.

- Input validation: positive allow-lists and strong data typing eliminate >90% of injection attacks
- Parameterized queries / ORMs mandatory for all database access including stored procedures
- Secrets management: use key vault for passwords, key material, DB credentials, API keys — never in source code or build artifacts
- Dependency scanning: regularly run vulnerability scans; watch advisories for all dependencies (Transformers, LangChain, etc.)
- Output handling: validate, sanitize, and secure LLM outputs before execution or display
- Least privilege at DB engine level: SELECT-only where INSERT/DELETE not needed
- Authentication: OAuth 2.0, JWT, httpOnly cookies
- Never log sensitive data, secrets, or session tokens
- Supply chain: compromised MCP tools, poisoned model weights, and vulnerable libraries are active threats (341 malicious skills found Feb 2026)

### Condensed Takeaways

- **Parameterized queries always**: never concatenate user input into SQL/queries
- **Secrets in vaults, never in code**: environment variables minimum; proper secret management preferred
- **Least privilege everywhere**: DB permissions, API scopes, agent tool access
- **LLM output = untrusted input**: sanitize before execution or display; treat as you would user-submitted content
- **Dependency audit continuously**: scan for CVEs; approve new dependencies explicitly
- **No unsafe functions**: `eval()`, `exec()`, raw SQL string construction are banned patterns
- **Human in the loop for destructive operations**: shell commands, DB writes, user impersonation

---

## 4. Brainstorming

### Source 1: ratacat/claude-skills Brainstorming Skill (https://playbooks.com/skills/ratacat/claude-skills/brainstorming)

A 4-phase Claude Code skill for structured technical brainstorming before implementation.

- Phase 0: Assess Clarity — determine if brainstorming is needed (explicit requirements vs. vague language)
- Phase 1: Understand the Idea — ask questions one at a time to understand intent; explore purpose, users, constraints, success criteria, edge cases, existing patterns
- Phase 2: Explore Approaches — present 2–3 concrete options with pros, cons, and "best when" conditions
- Phase 3: Capture Design — document decisions in structured markdown (what, why, key decisions, open questions)
- Phase 4: Handoff — offer next steps: proceed to planning, refine further, or defer
- Lead with a recommendation and explain reasoning explicitly
- Apply YAGNI: "choose the simplest approach that solves the stated problem"
- Anti-patterns to avoid: multiple simultaneous questions, jumping to HOW before understanding WHAT, overly complex solutions, ignoring existing codebase patterns, unvalidated assumptions, lengthy design documents

### Source 2: claude-cortex Brainstorming Skill (https://awesomeskill.ai/skill/claude-cortex-brainstorming)

Structured brainstorming for technical pre-planning with formal output documentation.

- Six-section structure: Problem/Goal Definition / Success Signals / Constraints & Risks / Existing Assets / Options & Tradeoffs / Chosen Direction
- Require "at least three distinct approaches" per option enumeration
- Each option needs: implementation pathway, specific tradeoffs (complexity, coupling, scalability), use-case suitability, risk assessment, required verification steps
- Apply methodology: before writing any code; after major context shifts; when stuck in solution space
- Validated designs move to documented plans in `docs/plans/[topic]-design.md`, committed to version control
- Brainstorming outputs seed downstream planning activities through systematic ideation

### Source 3: TechnickAI Brainstorming Skill (https://www.skillsdirectory.com/skills/technickai-brainstorming)

Three-phase collaborative brainstorming approach with explicit tradeoff comparison.

- Phase 1: Understanding Context — ask questions one at a time; use multiple choice when possible
- Phase 2: Exploring Alternatives — present all options first before making recommendation
- Phase 3: Presenting Design — validate incrementally in small sections rather than wholesale
- Structured tradeoff comparison: "Direct integration — fast but creates coupling. Good if temporary" vs. event-driven vs. separate service — explicitly surface complexity costs against flexibility gains
- One question per message: prevents overwhelming the user
- YAGNI ruthlessly: eliminate unnecessary features
- Avoid hybrid defaults: "hybrid solutions are rarely the right answer"
- Make clear recommendations: pick one approach with explicit criteria stated

### Condensed Takeaways

- **One question at a time**: never overwhelm with multiple simultaneous questions
- **Present options before recommending**: enumerate at least 3 distinct approaches with explicit tradeoffs
- **Structure each option**: description / benefits / drawbacks / "best when" conditions / risk assessment
- **YAGNI discipline**: simplest solution that solves the stated problem wins unless clear reason to do otherwise
- **Document the decision**: capture what, why, key decisions, and open questions in markdown before moving to implementation
- **Stay on WHAT before HOW**: brainstorming explores intent and approach, not implementation details
- **Avoid hybrid defaults**: they optimize for neither option; force a clear choice with explicit criteria

---

## 5. Defining Requirements

### Source 1: Kiro Spec-Driven Development (https://kiro.dev/docs/specs/)

Requirements conventions from Amazon's Kiro spec-driven AI development tool.

- Three foundational spec documents: Requirements file (user stories + acceptance criteria) / Design document (architecture, sequence diagrams, data flow) / Tasks file (discrete, trackable implementation tasks)
- Feature specs: user stories with acceptance criteria using structured notation
- Bugfix specs: current behavior vs. expected behavior analysis
- Task granularity: each task is executable and testable in isolation (TDD for AI agents)
- Documentation-first: specs are created before any coding begins
- Real-time status tracking as implementation progresses

### Source 2: nikiforovall Spec-Driven Skill (https://nikiforovall.blog/claude-code-rules/component-reference/skills/spec-driven/)

Detailed workflow for converting feature ideas into executable specifications.

- EARS format (Easy Approach to Requirements Syntax): "When [condition], the system shall [behavior]" — converts ambiguous requests into machine-testable statements
- Four mandatory sequential phases: Requirements → Design → Tasks → Implementation
- "Zero Improvisation" during implementation: execute specs exactly as written; no deviation
- Never advance phases without explicit user confirmation: "never assume satisfaction"
- File organization: `specs/{feature_name}/requirements.md` → `design.md` → `tasks.md`
- Acceptance criteria: explicit, measurable, testable — bridge between product intent and QA validation
- Edge case enumeration: identify negative scenarios and boundary conditions, not just happy path
- Completeness and consistency check before design: gap analysis prevents scope creep
- Traceability: requirements → test cases must be explicit and linked

### Source 3: Ten Attributes of Testable Requirements — Prolifics Testing (https://www.prolifics-testing.com/news/ten-attributes-of-a-testable-requirement)

Reference standard for requirement quality used in QA and systems engineering.

1. **Complete**: all necessary detail for every stakeholder who uses it
2. **Correct**: error-free and consistent with source materials and standards
3. **Feasible**: can be satisfied and proven satisfied at acceptable cost
4. **Necessary**: traced to business goals or stakeholder needs (anti-gold-plating gate)
5. **Prioritised**: ranked to manage limited resources effectively
6. **Unambiguous**: single, clear interpretation — eliminate "easy", "fast", "adequate", "sometimes"
7. **Consistent**: does not contradict other requirements or use conflicting terminology
8. **Traceable**: unique identifier and documented source
9. **Concise**: one requirement expressed with minimal words
10. **Verifiable**: can be proven met through demonstration, analysis, inspection, or testing

- Supplement natural language with tables, diagrams, or structured specification languages when ambiguity persists
- Apply necessity attribute strictly: requirements must satisfy business goals, not speculative features (gold-plating prevention)
- Use numeric scales for non-functional requirements ("< 200ms" not "fast")

### Source 4: Gherkin Acceptance Criteria — Claude Code Skill (https://mcpmarket.com/tools/skills/gherkin-acceptance-criteria)

BDD-style acceptance criteria skill for Claude Code.

- Given/When/Then format for all acceptance criteria
- Behavior-driven: acceptance criteria describe system behavior from user perspective
- "Works" means "passes tests" and meets acceptance criteria — they are the same thing
- Start every story with three practices: define acceptance criteria, force a plan before code, require tests
- INVEST criteria for user stories: Independent / Negotiable / Valuable / Estimable / Small / Testable
- Acceptance criteria are ready when: template compliance, testability validation (each criterion measurable), traceability checks, stakeholder validation checklist

### Condensed Takeaways

- **EARS format**: structured requirement syntax eliminates ambiguity by enforcing condition-behavior structure
- **Given/When/Then acceptance criteria**: every requirement has a testable scenario
- **No feature without business justification**: necessity attribute prevents gold-plating
- **Sequential gate process**: Requirements → Design → Tasks → Implementation; never skip or merge phases
- **Zero improvisation in implementation**: execute spec exactly as written; deviations require spec update
- **Explicit approval gates**: never advance phases without user confirmation
- **Unambiguous language**: ban "easy", "fast", "adequate", "sometimes"; use measurable quantities
- **Traceability**: every requirement has a unique ID and links to test cases

---

## 6. Documentation

### Source 1: Cursor IDE Rules for AI — Kirill Markin (https://kirill-markin.com/articles/cursor-ide-rules-for-ai/)

Documentation philosophy embedded in cursor rules for AI-assisted development.

- "Code is the primary documentation — use clear naming, types, and docstrings"
- Minimize external docs: keep documentation in function/class docstrings rather than separate files
- Separate documentation files only when a concept cannot be expressed in code
- Single source of truth: avoid duplicating documentation across multiple locations
- Reference instead of repeat: link to existing sources rather than restating information
- Current state focus: document present system state, not modification history
- Comments in English only
- Structured logging over interpolated strings: log dynamic values as structured data fields
- AI-readable project documentation: `.cursor/rules/` or `CLAUDE.md` serves both human and machine

### Source 2: PatrickJS/awesome-cursorrules — JS/TS Code Quality Rules (https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/javascript-typescript-code-quality-cursorrules-pro/.cursorrules)

Documentation conventions extracted from widely-used TypeScript/JavaScript cursor rules.

- Add descriptive comments at function start
- Use JSDoc for JavaScript (non-TypeScript files); TypeScript types are self-documenting
- Flag problematic areas with "TODO:" comments rather than silently fixing bugs
- Less code = less debt; "lines of code = debt" philosophy discourages over-documentation
- Early returns to reduce nesting (readable code reduces need for comments)
- Prefix event handlers consistently (e.g., `handleClick`); this is self-documentation
- Use descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)
- Organize functions so composing functions appear earlier in files

### Source 3: "Comments Explain Why, Not What" — Community Consensus (https://anthonysciamanna.com/2014/04/05/self-documenting-code-and-meaningful-comments.html, https://dev.to/jsantanadev/do-not-comment-your-code-it-should-be-self-documentated-well-i-dont-agree-2n59)

Distilled community consensus on when and how to comment code.

- Comments convey the "why" behind actions, not what the code obviously does
- Avoid redundant comments: "groups users by id" on a function named `groupUsersById` adds no value
- Comment unusual behaviors: integration quirks with third-party services, non-obvious business rules, critical path optimizations
- Self-documenting code and meaningful comments are complementary, not mutually exclusive
- Expressive function signatures: name and parameters should describe purpose; avoid single-letter parameters
- When feeling like writing a comment, ask: can this be expressed as a variable, function, or class name instead?
- Self-documenting code is necessary but not sufficient: the "why" still needs comments

### Source 4: DEV Community — Mastering Cursor Rules for Documentation (https://dev.to/anshul_02/mastering-cursor-rules-your-complete-guide-to-ai-powered-coding-excellence-2j5h)

Practical cursor rules documentation conventions from real-world usage.

- JSDoc for all exported functions (mandatory in many cursor rules)
- Inline comments for complex business logic only
- README.md in each major feature directory
- Updating README.md when adding new features is a cursor rule convention
- API documentation: OpenAPI v3 spec derivable from codebase; cursor rules can enforce validation and structure
- 72% of AI-generated code lacks comments (2025 benchmark) — explicit documentation rules are critical
- Documentation rule scope: `docs.mdc` as a cursor rule that mandates JSDoc, inline explanations for logic, README updates for features
- Conventional Commits format for commit messages as documentation of change history

### Condensed Takeaways

- **Comments explain why, not what**: if the code is clear, the comment explains the reasoning, not the mechanics
- **JSDoc for all public API surfaces**: exported functions, classes, and types need doc comments; private internals do not
- **README at major feature boundaries**: each significant module/feature should have a README
- **Never duplicate documentation**: single source of truth; link rather than restate
- **Self-documenting names reduce comment need**: invest in naming before writing a comment
- **Structured logging over string interpolation**: treat log output as queryable data
- **Document the "what and when" externally; the "why" inline**: README explains purpose and setup; comments explain non-obvious decisions
- **Cursor rule for documentation**: explicit machine-readable rules are needed because AI generates uncommented code by default

---

## Cross-Domain Patterns

Patterns appearing across 3+ domains and sources:

1. **One thing at a time**: single question, single test, single responsibility, single decision per ADR
2. **Explicit approval gates**: requirements gate before design, design gate before tasks, user confirmation before each phase advance
3. **YAGNI / necessity filter**: eliminate speculative features; every artifact must justify its existence against stated goals
4. **Behavior over implementation**: test behavior (not internals), document behavior (not mechanics), specify behavior (not technology)
5. **Structure before code**: brainstorm before designing, design before specifying, specify before implementing
6. **Machine-readable conventions**: cursor rules, CLAUDE.md, AGENTS.md serve as both human and AI documentation simultaneously
7. **Measurable not vague**: "< 200ms" not "fast"; "data-testid" not "some selector"; numeric scales for non-functional requirements
8. **Traceability**: requirements → tests, ADR → decision log, commits → conventional format all maintain audit trails
