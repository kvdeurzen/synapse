# Phase 20: Skills Completion - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Projects declare their stack once in project.toml and agents automatically receive the right skill content. The framework works for any language stack, not just TypeScript/Bun. Dynamic injection from project.toml, language-agnostic agent prompts, fleshed-out existing skills, and new generic skills.

</domain>

<decisions>
## Implementation Decisions

### Skill assignment model
- Project.toml skills + role-specific `role_skills` in agents.toml — two-layer model
- `role_skills` in agents.toml is always additive (merged with project.toml skills, no override option)
- Manifest injection: startup hook injects a compact skill manifest (names + one-line descriptions) into additionalContext
- Agents read full SKILL.md on demand — only load skills relevant to current task
- Manifest shows ALL available skills (project + role), with role-specific ones tagged: `testing-strategy (role: validator, debugger)`
- Remove empty `project` skill directory — serves no purpose

### Language skills (from project.toml)
- Available to: researcher, architect, executor, codebase-analyst, debugger, validator, integration-checker
- TS stack: typescript, bun, vitest, react, tailwind
- Python stack: python, pytest
- Rust stack: rust, cargo-test (no framework skills for now)
- Go stack: go, go-test (no framework skills for now)
- Standalone: sql

### Generic role_skills (assigned in agents.toml)
- testing-strategy → decomposer, architect, executor, validator, integration-checker, debugger, codebase-analyst
- architecture-design → product-strategist, architect
- security → architect, decomposer, plan-reviewer, executor, codebase-analyst, validator
- brainstorming → product-strategist, architect, decomposer
- defining-requirements → product-strategist, researcher, decomposer
- documentation → product-strategist, architect, executor, researcher

### Language-agnostic agent prompts
- Replace hardcoded .ts/.tsx/bun references with generic descriptions (e.g., "implement the signing utility" instead of "implement src/auth/jwt.ts")
- Skills provide language-specific commands and conventions — agent prompts stay generic
- Test command comes from skill content (vitest skill says `bun test`, pytest skill says `pytest`), NOT from project.toml
- MCP tool call examples in agent prompts keep their domain context (JWT, auth examples) — only replace file extensions and tool-specific commands

### Skill content format and depth
- All skills (language and generic) use the same 5-section format: Conventions, Quality Criteria, Vocabulary, Anti-patterns, Commands
- Commands section added to all skills — lists relevant tools/commands for that skill domain
- Target depth: 60-100 lines per skill (up from current ~38 lines)
- No token budget tracking in frontmatter — keep it simple

### Skill content sourcing
- Adapt best existing open-source skills (cursor rules repos, Claude Code skills, awesome-cursorrules) and fill gaps
- Researcher should search for highly-rated community skills during research phase
- Write from scratch only where nothing good exists
- Use official language style guides as secondary source (Rust book, Effective Go, PEP 8, etc.)

### Claude's Discretion
- Exact manifest format in additionalContext
- How to structure the on-demand read directive in agent prompts
- Specific content choices when adapting community skills
- Whether to restructure existing skill directory names (e.g., rename `vitest` or keep it)

</decisions>

<specifics>
## Specific Ideas

- "Instead of creating skills, let's search for the best-rated skills we can find online" — research priority
- "For a language stack it makes sense to have a styleguide skill (like MS-Rust), a testing skill, and whatever else makes sense" — stack-based skill composition
- Skills should be composable: `skills = ["python", "pytest", "fastapi"]` in project.toml
- Language stack skills bundled logically but individually selectable

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `synapse-startup.js` (lines 98-108): Already validates skills from project.toml against SKILL.md files — needs extension to build manifest and inject it
- `resolveConfig()` in `hooks/lib/resolve-config.js`: Canonical config resolution pattern for finding skill files
- Existing 7 skill SKILL.md files: typescript, python, react, sql, tailwind, bun, vitest — all ~38 lines, same 4-section format
- `agents.toml`: Already has per-agent `skills` field — needs `role_skills` field added, existing `skills` entries removed

### Established Patterns
- Skills are markdown files with YAML frontmatter (name, description, disable-model-invocation, user-invocable)
- `additionalContext` string concatenation in startup hook — manifest will be appended here
- smol-toml for TOML parsing — used for project.toml, trust.toml, agents.toml

### Integration Points
- `synapse-startup.js`: Primary integration point — reads project.toml, builds manifest, injects into additionalContext
- `agents.toml`: New `role_skills` field per agent entry
- Agent `.md` files: 7 files need hardcoded .ts/bun references replaced with generic descriptions
- `packages/framework/skills/`: New skill directories needed (rust, cargo-test, go, go-test, pytest, testing-strategy, architecture-design, security, brainstorming, defining-requirements, documentation)

</code_context>

<deferred>
## Deferred Ideas

- Framework-specific skills for Rust (axum/actix) and Go (gin/echo) — add when demand exists
- Token budget tracking in skill frontmatter — add if context overflow becomes an issue
- project-planning generic skill — dropped from initial set, can revisit
- code-review generic skill — dropped from initial set, can revisit

</deferred>

---

*Phase: 20-skills-completion*
*Context gathered: 2026-03-05*
