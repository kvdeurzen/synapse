# Phase 20: Skills Completion - Research

**Researched:** 2026-03-05
**Domain:** Skill injection, agents.toml two-layer model, language-agnostic agent prompts, skill content authoring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Skill assignment model**
- Project.toml skills + role-specific `role_skills` in agents.toml — two-layer model
- `role_skills` in agents.toml is always additive (merged with project.toml skills, no override option)
- Manifest injection: startup hook injects a compact skill manifest (names + one-line descriptions) into additionalContext
- Agents read full SKILL.md on demand — only load skills relevant to current task
- Manifest shows ALL available skills (project + role), with role-specific ones tagged: `testing-strategy (role: validator, debugger)`
- Remove empty `project` skill directory — serves no purpose

**Language skills (from project.toml)**
- Available to: researcher, architect, executor, codebase-analyst, debugger, validator, integration-checker
- TS stack: typescript, bun, vitest, react, tailwind
- Python stack: python, pytest
- Rust stack: rust, cargo-test (no framework skills for now)
- Go stack: go, go-test (no framework skills for now)
- Standalone: sql

**Generic role_skills (assigned in agents.toml)**
- testing-strategy → decomposer, architect, executor, validator, integration-checker, debugger, codebase-analyst
- architecture-design → product-strategist, architect
- security → architect, decomposer, plan-reviewer, executor, codebase-analyst, validator
- brainstorming → product-strategist, architect, decomposer
- defining-requirements → product-strategist, researcher, decomposer
- documentation → product-strategist, architect, executor, researcher

**Language-agnostic agent prompts**
- Replace hardcoded .ts/.tsx/bun references with generic descriptions (e.g., "implement the signing utility" instead of "implement src/auth/jwt.ts")
- Skills provide language-specific commands and conventions — agent prompts stay generic
- Test command comes from skill content (vitest skill says `bun test`, pytest skill says `pytest`), NOT from project.toml
- MCP tool call examples in agent prompts keep their domain context (JWT, auth examples) — only replace file extensions and tool-specific commands

**Skill content format and depth**
- All skills (language and generic) use the same 5-section format: Conventions, Quality Criteria, Vocabulary, Anti-patterns, Commands
- Commands section added to all skills — lists relevant tools/commands for that skill domain
- Target depth: 60-100 lines per skill (up from current ~38 lines)
- No token budget tracking in frontmatter — keep it simple

**Skill content sourcing**
- Adapt best existing open-source skills (cursor rules repos, Claude Code skills, awesome-cursorrules) and fill gaps
- Researcher should search for highly-rated community skills during research phase
- Write from scratch only where nothing good exists
- Use official language style guides as secondary source (Rust book, Effective Go, PEP 8, etc.)

### Claude's Discretion
- Exact manifest format in additionalContext
- How to structure the on-demand read directive in agent prompts
- Specific content choices when adapting community skills
- Whether to restructure existing skill directory names (e.g., rename `vitest` or keep it)

### Deferred Ideas (OUT OF SCOPE)
- Framework-specific skills for Rust (axum/actix) and Go (gin/echo) — add when demand exists
- Token budget tracking in skill frontmatter — add if context overflow becomes an issue
- project-planning generic skill — dropped from initial set, can revisit
- code-review generic skill — dropped from initial set, can revisit
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SKILL-01 | synapse.toml `skills` field drives dynamic skill injection via startup hook | Startup hook already reads `skills`; needs manifest build + inject pattern documented below |
| SKILL-02 | Hardcoded TypeScript/Bun skills removed from agents.toml per-agent entries | agents.toml fully audited — 6 agents have hardcoded skills to remove; `role_skills` field schema documented |
| SKILL-03 | Agent prompts are language-agnostic (no hardcoded `.ts` examples or `bun test` references) | All 7 affected agent files and specific lines identified |
| SKILL-04 | Thin skills (tailwind, python, sql) fleshed out from community standards | All three audited; community sources identified; Commands section pattern documented |
| SKILL-05 | New generic skills added: brainstorming, testing-strategy, architecture-design | Security, defining-requirements, documentation also locked in CONTEXT.md; community sources found |
</phase_requirements>

---

## Summary

Phase 20 has two plans with clearly separate concerns. Plan 20-01 is entirely mechanical JavaScript work: extend `synapse-startup.js` to build a skill manifest from project.toml skills + agents.toml `role_skills`, inject it into `additionalContext`, and strip the hardcoded per-agent `skills` entries from agents.toml. Plan 20-02 is content work: make 7 agent `.md` files language-agnostic by removing hardcoded `.ts`/`bun test` references, flesh out the three thin skills (tailwind, python, sql) to 60-100 lines each with a new `Commands` section, and author 6 new generic skills.

The code is already well-structured for this change. The startup hook uses a clear `contextParts.push()` pattern; adding a manifest section follows the exact same shape as tierContext, rpevContext, and domainContext. The agents.toml `role_skills` field is a new TOML array per agent — smol-toml parses it transparently. Community resources for skill content are excellent: Microsoft's Rust Guidelines have an agent-optimized condensed format, Google's Go Style Guide + Effective Go + github.com/cxuu/golang-skills cover Go, awesome-cursorrules has Python/TS, and fastmcp.me has a pytest testing patterns skill.

**Primary recommendation:** Build manifest in startup hook as a new `skillContext` block inserted after domainContext; author all 6 new generic skills using the existing 5-section format + Commands; flesh out thin skills by adapting community sources.

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| smol-toml | current (used in startup) | Parse project.toml and agents.toml | Already used; handles `role_skills` array transparently |
| node:fs | built-in | Read SKILL.md files from disk | Already used in startup hook |
| node:path | built-in | Construct skill file paths | Already used |

### No new dependencies required
The entire implementation uses existing imports in synapse-startup.js. No new packages needed.

---

## Architecture Patterns

### Recommended Skill Directory Structure

New skills to create under `packages/framework/skills/`:

```
packages/framework/skills/
├── typescript/SKILL.md        (exists — add Commands section)
├── bun/SKILL.md               (exists — add Commands section)
├── python/SKILL.md            (exists — flesh out + Commands)
├── vitest/SKILL.md            (exists — add Commands section)
├── react/SKILL.md             (exists — add Commands section)
├── tailwind/SKILL.md          (exists — flesh out + Commands)
├── sql/SKILL.md               (exists — flesh out + Commands)
├── rust/SKILL.md              (NEW — from MS Rust Guidelines)
├── cargo-test/SKILL.md        (NEW — from Rust Book ch11)
├── go/SKILL.md                (NEW — from Effective Go + Google Style)
├── go-test/SKILL.md           (NEW — Go testing conventions)
├── pytest/SKILL.md            (NEW — from fastmcp.me + PEP)
├── testing-strategy/SKILL.md  (NEW — generic, language-agnostic)
├── architecture-design/SKILL.md (NEW — generic)
├── security/SKILL.md          (NEW — generic)
├── brainstorming/SKILL.md     (NEW — generic)
├── defining-requirements/SKILL.md (NEW — generic)
├── documentation/SKILL.md     (NEW — generic)
└── project/                   (DELETE — empty, serves no purpose)
```

### Pattern 1: Skill Manifest Build + Injection

The startup hook already builds `tierContext`, `rpevContext`, `domainContext` using the same shape. Skill manifest follows the same pattern.

**What:** Read project.toml `skills` array + agents.toml `role_skills` per agent. Build a compact text manifest listing all available skills with one-line descriptions. Append to `additionalContext`.

**When to use:** Always when project.toml is valid.

**Example:**

```javascript
// In synapse-startup.js, after domainContext block
// (Source: direct extension of existing pattern at lines 262-272)

let skillContext = "";
try {
  // Build full skill list: project skills + all unique role_skills from agents.toml
  const projectSkills = skills; // already read from project.toml at line 81
  const roleSkillsMap = {}; // skill -> [agent names]

  if (agentsToml) {
    for (const [agentName, agentConfig] of Object.entries(agentsToml.agents || {})) {
      for (const skillName of (agentConfig.role_skills || [])) {
        if (!roleSkillsMap[skillName]) roleSkillsMap[skillName] = [];
        roleSkillsMap[skillName].push(agentName);
      }
    }
  }

  const allSkills = new Set([...projectSkills, ...Object.keys(roleSkillsMap)]);
  const skillLines = [
    "",
    "## Available Skills",
    "",
    "These skills are available for this project. Read the full SKILL.md on demand when working in that domain.",
    "",
  ];

  for (const skillName of allSkills) {
    const skillMdPath = path.join(projectRoot, ".claude", "skills", skillName, "SKILL.md");
    let description = "(no description)";
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, "utf8");
      // Extract description from YAML frontmatter
      const match = content.match(/^description:\s*(.+)$/m);
      if (match) description = match[1].trim();
    }
    const roleTag = roleSkillsMap[skillName]
      ? ` (role: ${roleSkillsMap[skillName].join(", ")})`
      : "";
    skillLines.push(`- **${skillName}**${roleTag}: ${description}`);
  }

  skillLines.push(
    "",
    "To load a skill, read the file: `.claude/skills/{skill-name}/SKILL.md`",
  );

  skillContext = skillLines.join("\n");
} catch (skillErr) {
  process.stderr.write(
    `[synapse-startup] Warning: Could not build skill manifest: ${skillErr.message}\n`,
  );
}

// Add to contextParts
if (skillContext) {
  contextParts.push(skillContext);
}
```

**Key implementation note:** The `projectRoot` variable is already computed at line 100 of synapse-startup.js: `const projectRoot = path.dirname(path.dirname(path.dirname(projectTomlPath)))`. Skills are looked up in the installed location (`.claude/skills/`) not the framework source (`packages/framework/skills/`).

### Pattern 2: agents.toml role_skills Field

**What:** Replace per-agent `skills = ["typescript", "bun"]` entries with `role_skills` arrays where needed per CONTEXT.md assignments. Remove all language skill hardcoding.

**Example agents.toml change:**

```toml
# BEFORE
[agents.executor]
model = "sonnet"
tier = 3
skills = ["typescript", "bun"]

# AFTER
[agents.executor]
model = "sonnet"
tier = 3
role_skills = ["testing-strategy", "security"]
```

**Full assignment matrix from CONTEXT.md:**

| Agent | role_skills |
|-------|-------------|
| product-strategist | architecture-design, brainstorming, defining-requirements, documentation |
| researcher | defining-requirements, documentation |
| architect | testing-strategy, architecture-design, security, brainstorming, defining-requirements, documentation |
| decomposer | testing-strategy, security, brainstorming, defining-requirements |
| plan-reviewer | security |
| executor | testing-strategy, security, documentation |
| validator | testing-strategy, security |
| integration-checker | testing-strategy, security |
| debugger | testing-strategy, security |
| codebase-analyst | testing-strategy, security |

**Agents with skills currently hardcoded that must be cleared:**
- `architect`: `skills = ["typescript"]` → remove, add role_skills
- `decomposer`: `skills = ["typescript"]` → remove, add role_skills
- `executor`: `skills = ["typescript", "bun"]` → remove, add role_skills
- `validator`: `skills = ["typescript", "vitest"]` → remove, add role_skills
- `integration-checker`: `skills = ["typescript"]` → remove, add role_skills
- `debugger`: `skills = ["typescript", "vitest"]` → remove, add role_skills
- `codebase-analyst`: `skills = ["typescript"]` → remove, add role_skills

**Agents with empty skills that need role_skills added:**
- product-strategist, researcher, plan-reviewer: add role_skills per matrix above

### Pattern 3: SKILL.md Format (5 Sections)

All skills use this format. The 5th section `Commands` is new:

```markdown
---
name: {skill-name}
description: {one-line description for manifest — keep under 120 chars}
disable-model-invocation: true
user-invocable: false
---

## Conventions
[6-10 bullet points of must-follow rules]

## Quality Criteria
[5-8 measurable pass/fail checks]

## Vocabulary
[4-8 domain terms with definitions]

## Anti-patterns
[5-8 things NOT to do, each with brief explanation]

## Commands
[Runnable commands specific to this skill domain]
```

**Target:** 60-100 lines total per skill. Existing skills are ~38 lines and lack `Commands`.

### Pattern 4: Language-Agnostic Agent Prompt Changes

**Files to edit and specific changes:**

| File | Line(s) | Change |
|------|---------|--------|
| `decomposer.md` | 171-173 | Replace `.ts`/`.test.ts` file extensions with language-neutral descriptions: "implement the JWT signing utility", "create the token payload schema" |
| `decomposer.md` | 220 | Replace `bun test packages/server/src/auth/` with `run tests for the auth module` |
| `executor.md` | 109-110 | Replace `src/auth/jwt.ts` with "implement the JWT signing utility", `.test.ts` with generic test equivalent |
| `validator.md` | 82 | Replace `bun test {test_file}` with `{test_command} {test_file}` |
| `validator.md` | 109 | Replace `bun test src/auth/jwt` with `{test_command} for the JWT module` |
| `validator.md` | 131 | Replace "Use `bun test` (not jest or vitest) for this project" with "Use the test command from the project's testing skill" |
| `integration-checker.md` | 77, 105 | Replace `bun test {path}` with `{test_command} {path}` |
| `integration-checker.md` | 100-102 | Replace `.ts` file extensions with module/component names |
| `debugger.md` | 85 | Replace `.ts` file reference with module-level description |

**Pattern for the test command placeholder:** Use `{test_command}` in instructional text, but keep `Bash("{test_command} {test_file}")` as the call pattern — the agent reads the skill to know what command to use.

**Rule from CONTEXT.md:** MCP tool call examples keep their JWT/auth domain context — only file extensions and tool-specific commands change.

### Anti-Patterns to Avoid

- **Reading SKILL.md files at startup into additionalContext:** Decided against this — only inject the manifest (names + descriptions). Agents read full content on demand. Injecting all skill content at startup would consume 3000-6000+ tokens unconditionally.
- **Override semantics for role_skills:** All role_skills are additive — no agent can suppress project skills. Don't add override logic.
- **Hardcoding skill paths relative to repo root:** Always derive from `projectRoot` (computed from project.toml path), never from `__dirname` or hardcoded paths.
- **Blocking session start on skill errors:** Skill validation is warn-only. Missing SKILL.md files log warnings but never cause `process.exit(1)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill content for Rust | Write from scratch | Adapt Microsoft's Pragmatic Rust Guidelines agent-optimized condensed format | MS guidelines are purpose-built for LLM consumption, ~22k tokens of vetted content |
| Skill content for Go | Write from scratch | Adapt google/styleguide Go + Effective Go + cxuu/golang-skills repo | 16 modular skills derived from Google, Uber, and community standards |
| Skill content for pytest | Write from scratch | Adapt fastmcp.me/skills/details/138/python-testing-patterns | Already structured as an agent skill with AAA pattern, fixtures, parameterize |
| TOML parsing | Custom parser | smol-toml (already in use) | Role_skills is just an array; smol-toml parses it without changes |

**Key insight:** Community skill repos (awesome-cursorrules, cxuu/golang-skills, Microsoft Rust Guidelines) have already distilled official style guides into LLM-digestible formats. Adapting these is faster and higher quality than writing from scratch.

---

## Common Pitfalls

### Pitfall 1: role_skills consumed at startup vs. used at startup
**What goes wrong:** The startup hook injects the manifest so agents know what skills exist. Agents then read SKILL.md on demand. If the manifest builder tries to resolve agent-specific role_skills per-session (i.e., per spawned agent), it won't work — the startup hook runs once for the entire session, not per-agent.
**Why it happens:** Confusing "know what skills exist" (manifest, session-level) with "load skill content" (agent-level, on demand).
**How to avoid:** Manifest lists ALL skills (project + all role_skills from all agents), tagged with which roles have them. Each agent decides on its own which skills are relevant to load.
**Warning signs:** Trying to detect which agent is currently active inside synapse-startup.js.

### Pitfall 2: Skill path resolution — installed vs. source
**What goes wrong:** Skills in `packages/framework/skills/` are the source. After install, they land in `.claude/skills/`. The startup hook must look in `.claude/skills/` (relative to `projectRoot`), not in `packages/framework/skills/`.
**Why it happens:** The existing validation code at lines 98-108 already does this correctly (`projectRoot/.claude/skills/skill/SKILL.md`). Easy to accidentally change when extending.
**How to avoid:** Keep the same path construction. Never use `__dirname`-relative paths to find skill files.
**Warning signs:** Skills found during dev in monorepo but not found in installed projects.

### Pitfall 3: smol-toml sub-table ordering with new fields
**What goes wrong:** TOML requires sub-tables to be declared after all scalar keys in a section. Adding `role_skills` as an array is fine. Adding sub-tables would break smol-toml parsing.
**Why it happens:** [Phase 18-01] decision documented this: "TOML sub-table ordering: sub-tables declared before scalar keys causes parse errors."
**How to avoid:** `role_skills = [...]` is a simple array value, not a sub-table. Keep it inline like `allowed_tools`.
**Warning signs:** smol-toml parse errors when loading agents.toml.

### Pitfall 4: Decomposer example still prescribes file extensions
**What goes wrong:** The decomposer example at lines 171-173 lists `.ts` files as the "output" of task decomposition. If left, agents decomposing Python projects will still produce TypeScript file paths.
**Why it happens:** The example was written with a TypeScript project in mind and never genericized.
**How to avoid:** Replace file paths in the example with functional descriptions: "implement the JWT signing utility (language-specific implementation files)" and indicate that the skill provides naming conventions.
**Warning signs:** Decomposer creating `.ts` task descriptions for a Python project.

### Pitfall 5: validator.md "Use bun test" instruction
**What goes wrong:** Line 131 of validator.md contains a direct instruction: "Use `bun test` (not jest or vitest) for this project". This overrides any skill content for non-TypeScript projects.
**Why it happens:** Written during Phase 19 when the skill system was not yet in scope.
**How to avoid:** Replace with "Use the test command specified in the project's testing skill (e.g., `pytest` for Python, `cargo test` for Rust, `bun test` for TypeScript)."
**Warning signs:** Validator running `bun test` on a Python project.

---

## Code Examples

### Building the Skill Manifest (additionalContext injection)

```javascript
// Source: extension of existing pattern in synapse-startup.js lines 229-272
// Placed after domainContext block, before final contextParts.join()

let skillContext = "";
try {
  const roleSkillsMap = {}; // skillName -> [agentNames]
  if (agentsToml) {
    for (const [agentName, agentConfig] of Object.entries(agentsToml.agents || {})) {
      for (const skillName of (agentConfig.role_skills || [])) {
        if (!roleSkillsMap[skillName]) roleSkillsMap[skillName] = [];
        roleSkillsMap[skillName].push(agentName);
      }
    }
  }

  const allSkillNames = [...new Set([...skills, ...Object.keys(roleSkillsMap)])];

  if (allSkillNames.length > 0) {
    const manifestLines = [
      "",
      "## Available Skills",
      "",
      "Read a skill's full content on demand: `.claude/skills/{skill-name}/SKILL.md`",
      "",
    ];

    for (const skillName of allSkillNames) {
      const skillMdPath = path.join(projectRoot, ".claude", "skills", skillName, "SKILL.md");
      let description = "(no description available)";
      if (fs.existsSync(skillMdPath)) {
        const raw = fs.readFileSync(skillMdPath, "utf8");
        const match = raw.match(/^description:\s*(.+)$/m);
        if (match) description = match[1].trim();
      } else {
        process.stderr.write(
          `[synapse-startup] Warning: skill "${skillName}" has no SKILL.md at ${skillMdPath}\n`,
        );
      }
      const roleTag = roleSkillsMap[skillName]
        ? ` *(role: ${roleSkillsMap[skillName].join(", ")})*`
        : "";
      manifestLines.push(`- **${skillName}**${roleTag}: ${description}`);
    }
    skillContext = manifestLines.join("\n");
  }
} catch (skillErr) {
  process.stderr.write(
    `[synapse-startup] Warning: Could not build skill manifest: ${skillErr.message}\n`,
  );
}
if (skillContext) contextParts.push(skillContext);
```

### SKILL.md With Commands Section (example: pytest)

```markdown
---
name: pytest
description: Python testing conventions using pytest — fixtures, parameterization, markers, and async test patterns. Load when writing or reviewing Python tests.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Test functions named `test_<behavior>_<condition>`: `test_login_fails_with_invalid_password`
- Arrange-Act-Assert structure in every test: set up inputs, call the unit, assert outputs
- Use `@pytest.fixture` for setup/teardown — prefer function scope for isolation
- Use `@pytest.mark.parametrize` to test multiple inputs without copy-pasting test bodies
- Separate unit tests (`tests/unit/`), integration tests (`tests/integration/`), e2e (`tests/e2e/`)
- Use `unittest.mock.patch` or `pytest-mock`'s `mocker` fixture for external dependencies
- `conftest.py` for shared fixtures — one per directory level as needed

## Quality Criteria

- All tests pass with `pytest -x` (fail fast on first error)
- No shared mutable state between test functions — each test is independent
- External services (HTTP, DB, filesystem) mocked in unit tests
- Parametrized tests cover happy path, edge cases, and error conditions
- `mypy` passes on test files (use `# type: ignore` only with comment explaining why)
- Test names read as sentences describing expected behavior

## Vocabulary

- **fixture**: a function decorated with `@pytest.fixture` providing reusable test state or setup
- **parametrize**: `@pytest.mark.parametrize` runs one test function with multiple input sets
- **conftest.py**: auto-discovered pytest config file; fixtures defined here are available to all tests in the directory tree
- **marker**: a label (`@pytest.mark.slow`, `@pytest.mark.integration`) for filtering test runs
- **mock**: a stand-in for an external dependency that records calls and returns controlled values

## Anti-patterns

- Vague names: `test_user()`, `test_1()` — always describe the behavior being tested
- Shared mutable state: modifying a module-level list or dict across tests — use fixtures
- Not mocking I/O in unit tests: real network calls, real DB writes in unit tests make tests slow and flaky
- Coverage theater: asserting that code ran but not that it did the right thing
- `assert len(result) > 0` when you know the exact expected value — assert the value

## Commands

- Run all tests: `pytest`
- Run with fail-fast: `pytest -x`
- Run specific file: `pytest tests/unit/test_auth.py`
- Run specific test: `pytest tests/unit/test_auth.py::test_login_fails_with_invalid_password`
- Run marked tests: `pytest -m integration`
- Run with coverage: `pytest --cov=src --cov-report=term-missing`
- Type-check tests: `mypy tests/`
```

### agents.toml role_skills Field (final shape)

```toml
[agents.executor]
model = "sonnet"
tier = 3
role_skills = ["testing-strategy", "security", "documentation"]
allowed_tools = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "mcp__synapse__get_task_tree",
  ...
]
```

Note: The old `skills = [...]` field is removed entirely. `role_skills` is the only skill-related field in agents.toml going forward.

### Language-Agnostic Prompt Pattern (validator.md example)

```markdown
# BEFORE (language-specific):
2. Run tests via `Bash("bun test {test_file}")` -- capture exit code
...
   - Use `bun test` (not jest or vitest) for this project

# AFTER (language-agnostic):
2. Run tests via `Bash("{test_command} {test_file}")` -- capture exit code
   (test_command comes from the project's testing skill, e.g., `pytest`, `bun test`, `cargo test`)
...
   - Use the test command from the project's testing skill
```

---

## Skill Content Research Findings

### Thin Skills to Flesh Out (SKILL-04)

**python/SKILL.md** (currently 38 lines, missing Commands)
- Current state: Good conventions (type hints, dataclasses, pathlib, f-strings, context managers). Missing: async patterns, packaging conventions, Commands section.
- Additions needed: async/await patterns, `__slots__` for performance-sensitive dataclasses, `typing.Protocol` usage, Commands section (`python -m pytest`, `mypy --strict`, `python -m pip install -e .`, `ruff check .`).
- Source: PEP 8, PEP 20, existing SKILL.md is solid — just needs expansion.

**tailwind/SKILL.md** (currently 38 lines, missing Commands)
- Current state: Good v3 conventions. Needs v4 update.
- Key v4 changes (released January 2025, HIGH confidence from official tailwindcss.com):
  - CSS-first configuration: `@theme` block replaces `tailwind.config.js` for most cases
  - CSS variables drive all theme tokens: `--color-purple-500` auto-generates `bg-purple-500`, `text-purple-500`
  - `bg-linear-to-*` replaces `bg-gradient-to-*`
  - Lightning CSS engine: 5x faster builds
  - Class aliases removed — class names now directly match CSS property names
- Commands section: `npx @tailwindcss/cli`, `bunx tailwindcss`, `npx tailwindcss --watch`
- Source: tailwindcss.com/docs (MEDIUM — checked via WebSearch, matches official changelog)

**sql/SKILL.md** (currently 38 lines, missing Commands)
- Current state: Solid conventions (CTEs, explicit JOINs, parameterized queries). Missing: transaction patterns, migration conventions, Commands.
- Additions needed: migration tooling conventions (describe approach, not tool), `EXPLAIN ANALYZE` usage, index creation patterns, Commands section (psql, sqlite3 CLI invocations).
- Source: existing SKILL.md is good — expand rather than rewrite.

### New Language Skills (for rust, cargo-test, go, go-test, pytest)

**rust/SKILL.md**
- Best source: Microsoft Pragmatic Rust Guidelines — agent-optimized condensed version available at microsoft.github.io/rust-guidelines/agents/index.html (HIGH confidence — verified)
- Key conventions: ownership model, error handling with `Result<T, E>`, `?` operator, traits over inheritance, `clippy` for linting, `rustfmt` for formatting, no `unwrap()` in production code
- Commands: `cargo build`, `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt`, `cargo check`

**cargo-test/SKILL.md**
- Source: Official Rust Book Chapter 11 (HIGH confidence — doc.rust-lang.org)
- Key conventions: `#[cfg(test)]` module in same file, `tests/` directory for integration tests, `#[test]` attribute, `assert!`/`assert_eq!`/`assert_ne!` macros, `Result<(), Box<dyn Error>>` return type for tests using `?`
- Commands: `cargo test`, `cargo test -- --nocapture`, `cargo test {test_name}`, `cargo test --test {integration_test_file}`

**go/SKILL.md**
- Best source: google/styleguide Go + Effective Go + cxuu/golang-skills (covers naming, error handling, goroutines, interfaces) (HIGH confidence — verified at github.com/cxuu/golang-skills)
- Key conventions: `gofmt`/`goimports` always, error wrapping with `fmt.Errorf("context: %w", err)`, table-driven tests, interfaces for behavior not data, goroutine lifecycle management
- Commands: `go build ./...`, `go test ./...`, `go vet ./...`, `golangci-lint run`, `goimports -w .`

**go-test/SKILL.md**
- Source: Effective Go + cxuu/golang-skills testing skill
- Key conventions: table-driven tests with `[]struct{ name, input, want }`, `t.Run` for subtests, `t.Parallel()` for independent tests, `testdata/` directory for fixtures, no `init()` in test files
- Commands: `go test ./...`, `go test -run TestName`, `go test -v`, `go test -race`, `go test -cover`

**pytest/SKILL.md**
- Best source: fastmcp.me/skills/details/138/python-testing-patterns + PEP 8 test naming
- Key conventions: documented in Code Examples section above
- Commands: documented in Code Examples section above

### New Generic Skills (SKILL-05) — Community-Sourced

Full research with source URLs: see `generic-skills-research.md` in this directory.

**testing-strategy/SKILL.md** (Sources: Martin Fowler's Practical Test Pyramid, awesome-cursorrules Vitest/Cypress rules, caduh.com Testing Pyramid guide, AI Hero TDD Claude Code skill)
- Pyramid ratio: 60–70% unit / 20–30% integration / 5–10% E2E
- Test behavior not implementation: public interfaces only; private methods indicate design problems
- Mocking discipline: mock at boundaries (external services, I/O, clock), not internal collaborators
- No duplication across levels: if a unit test covers an edge case, E2E should not repeat it
- TDD vertically: one test → one implementation → repeat; never bulk-write tests
- Flake prevention: control time, randomness, and network deterministically; never sleep
- Commands: language-neutral (reference to project's testing skill for actual commands)

**architecture-design/SKILL.md** (Sources: "The Architecture is the Prompt" hexagonal design, joelparkerhenderson/architecture-decision-record, Kirill Markin cursor IDE rules, DDD+Hexagonal for AI Agents)
- Dependency direction is non-negotiable: infrastructure → application → domain; never reverse
- Interface before implementation: define ports/contracts first, then write adapters
- ADR every significant decision: Title / Status / Context / Decision / Consequences; one decision per ADR; immutable once accepted
- Functional core, imperative shell: pure business logic at center; I/O and side effects at edges
- Architecture as AI prompt: clean boundaries let agents work in isolated slices without full system context
- Y-statement format: "In the context of X, facing concern Y, we decided Z, to achieve Q, accepting R"
- Commands: documentation-related (no executables — this is a cognitive skill)

**security/SKILL.md** (Sources: Cloud Security Alliance R.A.I.L.G.U.A.R.D. framework, Sean Goedecke "Principles for Coding Securely with LLMs", Van-LLM-Crew/cursor-secure-coding ASVS Level 1/2)
- Parameterized queries always: never concatenate user input into SQL/queries
- Secrets in vaults, never in code: environment variables minimum; proper secret management preferred
- Least privilege everywhere: DB permissions, API scopes, agent tool access
- LLM output = untrusted input: sanitize before execution or display
- No unsafe functions: `eval()`, `exec()`, raw SQL string construction are banned
- Dependency audit continuously: scan for CVEs; approve new dependencies explicitly
- Human in the loop for destructive operations: shell commands, DB writes, user impersonation
- Commands: `npm audit`, `cargo audit`, `pip-audit`, `trivy` (tool-agnostic listing)

**brainstorming/SKILL.md** (Sources: ratacat/claude-skills brainstorming skill, claude-cortex brainstorming skill, TechnickAI brainstorming skill)
- One question at a time: never overwhelm with multiple simultaneous questions
- Present options before recommending: enumerate at least 3 distinct approaches with explicit tradeoffs
- Structure each option: description / benefits / drawbacks / "best when" conditions / risk assessment
- YAGNI discipline: simplest solution that solves the stated problem wins unless clear reason otherwise
- Document the decision: capture what, why, key decisions, and open questions in markdown
- Avoid hybrid defaults: they optimize for neither option; force a clear choice with explicit criteria
- Commands: none (cognitive skill)

**defining-requirements/SKILL.md** (Sources: Kiro spec-driven development, nikiforovall spec-driven skill with EARS format, Prolifics Testing "Ten Attributes of Testable Requirements", Gherkin Acceptance Criteria Claude Code skill)
- EARS format: "When [condition], the system shall [behavior]" — eliminates ambiguity
- Given/When/Then acceptance criteria: every requirement has a testable scenario
- No feature without business justification: necessity attribute prevents gold-plating
- Sequential gate process: Requirements → Design → Tasks → Implementation; never skip
- Zero improvisation in implementation: execute spec exactly as written; deviations require spec update
- Unambiguous language: ban "easy", "fast", "adequate", "sometimes"; use measurable quantities
- Traceability: every requirement has a unique ID and links to test cases
- Commands: none (cognitive skill)

**documentation/SKILL.md** (Sources: Kirill Markin cursor IDE rules, awesome-cursorrules JS/TS quality rules, community consensus on comments, DEV Community cursor rules guide)
- Comments explain why, not what: if code is clear, comment explains the reasoning, not the mechanics
- JSDoc for all public API surfaces: exported functions, classes, and types need doc comments; private internals do not
- README at major feature boundaries: each significant module/feature should have a README
- Never duplicate documentation: single source of truth; link rather than restate
- Self-documenting names reduce comment need: invest in naming before writing a comment
- Structured logging over string interpolation: treat log output as queryable data
- Commands: documentation generator references (language-specific, listed neutrally)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-agent `skills = ["typescript", "bun"]` hardcoded | Two-layer: project.toml language skills + agents.toml role_skills | Phase 20 | Skills follow project stack, not hardcoded TypeScript assumption |
| Skills listed by name only in additionalContext (`skills: typescript, bun`) | Full manifest with descriptions + on-demand read directive | Phase 20 | Agents know what each skill does and how to load it |
| 4-section SKILL.md (Conventions, Quality Criteria, Vocabulary, Anti-patterns) | 5-section with Commands added | Phase 20 | Agent knows the exact commands to run, not just conventions |
| agent prompts with `bun test`, `.ts` file paths | Language-neutral placeholders, skill-driven commands | Phase 20 | Framework works for Python, Rust, Go, TypeScript equally |
| tailwind/SKILL.md: v3 conventions | v4 conventions (CSS-first @theme, Lightning CSS, bg-linear-to-*) | January 2025 (Tailwind v4 release) | Projects using v4 get correct utility names |

**Deprecated/outdated in existing skills:**
- `bun:test` reference in vitest/SKILL.md description — vitest and bun:test are conflated; skill is used for both but description says "Vitest or bun:test" which is accurate
- tailwind/SKILL.md: `bg-gradient-to-*` anti-pattern not yet documented — v4 uses `bg-linear-to-*`; existing skill needs v4 update in Commands section

---

## Open Questions

1. **Skill discovery path for installed projects**
   - What we know: synapse-startup.js resolves `projectRoot` from `project.toml` path (`path.dirname * 3`). Skills live at `projectRoot/.claude/skills/{name}/SKILL.md`.
   - What's unclear: Does install.sh copy framework skills to `.claude/skills/`? (Phase 22 concern — install.sh not yet written.)
   - Recommendation: Phase 20 should work correctly for dev (monorepo) use. Leave install.sh skill copying as a Phase 22 concern. For Phase 20, the manifest builder should warn (not fail) if a skill file is missing — already the established pattern.

2. **vitest skill naming**
   - What we know: `vitest/SKILL.md` is named for Vitest but its description says "Vitest or bun:test." The bun skill covers `bun:test` imports.
   - What's unclear: Whether to rename it or keep as-is (marked as Claude's Discretion in CONTEXT.md).
   - Recommendation: Keep the directory named `vitest` — renaming would require updating all references in agents.toml and docs. The description already covers both frameworks.

3. **Manifest format: ordered vs. unordered**
   - What we know: The manifest lists skills with names + descriptions. Role-tagged skills show which agents they apply to.
   - What's unclear: Whether alphabetical or project-skills-first ordering is more useful for the agent.
   - Recommendation: Project skills first (as configured in project.toml order), then role skills sorted alphabetically. This matches how a user thinks: "what stack am I on" then "what roles are available."

---

## Sources

### Primary (HIGH confidence)
- synapse-startup.js (lines 98-272) — direct code inspection of injection pattern
- packages/framework/config/agents.toml — direct audit of all hardcoded skills entries
- packages/framework/agents/*.md — direct audit of language-specific references
- packages/framework/skills/*/SKILL.md — all 7 existing skills read and audited
- packages/framework/hooks/lib/resolve-config.js — path resolution pattern confirmed
- microsoft.github.io/rust-guidelines/agents/index.html — verified, agent-optimized condensed format confirmed
- github.com/cxuu/golang-skills — verified, 16 skills from Google/Uber/community
- doc.rust-lang.org/book/ch11-03-test-organization.html — Rust testing conventions

### Secondary (MEDIUM confidence)
- fastmcp.me/skills/details/138/python-testing-patterns — pytest skill structure verified via WebFetch
- tailwindcss.com v4 release notes — CSS-first config, bg-linear-to-*, Lightning CSS confirmed via WebSearch cross-referenced with official site
- github.com/PatrickJS/awesome-cursorrules — Python/TS cursor rules community source

### Tertiary (HIGH confidence — upgraded from LOW after dedicated research)
- Martin Fowler's Practical Test Pyramid — canonical language-agnostic testing reference
- Cloud Security Alliance R.A.I.L.G.U.A.R.D. framework — security cursor rules
- Sean Goedecke "Principles for Coding Securely with LLMs" — LLM-specific security
- Van-LLM-Crew/cursor-secure-coding — OWASP/ASVS cursor rules
- joelparkerhenderson/architecture-decision-record — canonical ADR reference
- ratacat/claude-skills, claude-cortex, TechnickAI brainstorming skills — 3 independently verified
- Kiro spec-driven development, nikiforovall EARS format skill — requirements processes
- Prolifics Testing "Ten Attributes of Testable Requirements" — quality reference
- Full details: generic-skills-research.md in phase directory

---

## Metadata

**Confidence breakdown:**
- Standard stack (no new deps): HIGH — all existing code inspected directly
- Architecture (manifest build pattern): HIGH — direct extension of existing code pattern; code example provided
- agents.toml changes: HIGH — all 7 agents with hardcoded skills identified; role_skills matrix from locked CONTEXT.md decisions
- Agent prompt changes: HIGH — all 7 files inspected; all 9 specific lines identified
- Skill content (existing 3 thin skills): HIGH for sql/python (extend established pattern); MEDIUM for tailwind (v4 update needed, verified via official source)
- Skill content (new language skills: rust, go, cargo-test, go-test, pytest): HIGH — authoritative community sources identified
- Skill content (new generic skills): HIGH — 18+ community sources researched; top 3 per domain condensed (see generic-skills-research.md)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain — no fast-moving libraries involved)
