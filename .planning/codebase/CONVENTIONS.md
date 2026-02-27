# Coding Conventions

**Analysis Date:** 2026-02-27

## Naming Patterns

**Files:**
- CommonJS modules: `.cjs` extension (e.g., `config.cjs`, `core.cjs`, `phase.cjs`)
- JavaScript hooks: `.js` extension (e.g., `gsd-context-monitor.js`, `gsd-statusline.js`)
- All file names use kebab-case (e.g., `gsd-tools.cjs`, `context-monitor.js`)

**Functions:**
- Named functions use camelCase (e.g., `cmdConfigSet`, `cmdVerifySummary`, `cmdPhasesList`)
- Command functions prefixed with `cmd` followed by descriptor (e.g., `cmdStateLoad`, `cmdInitExecutePhase`)
- Internal helper functions: camelCase without prefix (e.g., `extractFrontmatter`, `normalizePhaseName`, `comparePhaseNum`)
- Module methods exported directly: camelCase (e.g., `safeReadFile`, `loadConfig`, `execGit`)

**Variables:**
- Local variables: camelCase (e.g., `configPath`, `phaseInfo`, `mentionedFiles`, `checkCount`)
- Constants: UPPER_SNAKE_CASE for truly immutable values (e.g., `WARNING_THRESHOLD = 35`, `CRITICAL_THRESHOLD = 25`, `STALE_SECONDS = 60`)
- Destructured variables: camelCase (e.g., `const { type, phase, includeArchived } = options`)
- Boolean flags: prefixed with `is` or `has` (e.g., `firstWarn`, `commitsExist`, `configExists`)

**Types/Objects:**
- Configuration objects: snake_case keys (e.g., `model_profile`, `commit_docs`, `branching_strategy`, `phase_branch_template`)
- Data structures: snake_case for field names when serializable (e.g., `session_id`, `remaining_percentage`, `used_pct`, `timestamp`)
- Result objects: snake_case keys (e.g., `files_created`, `commits_exist`, `self_check`, `phase_number`)

## Code Style

**Formatting:**
- No linting/formatting tools configured (ESLint, Prettier not present)
- Manual formatting conventions followed:
  - 2-space indentation
  - No semicolon requirement (present in most code, optional style)
  - Lines kept reasonably short (see patterns in files)
  - Blank lines between logical sections (often marked with comment separators)

**Comments:**
- Block comments use `/**` JSDoc style with clear description:
  ```javascript
  /**
   * Config — Planning config CRUD operations
   */
  ```
- Inline comments use `//` to explain non-obvious logic:
  ```javascript
  // If no metrics file, this is a subagent or fresh session -- exit silently
  ```
- Section dividers use `// ─── Name ───────` pattern to organize code visually
- No per-function JSDoc comments required; file-level header sufficient

**Error Handling:**
- `try/catch` blocks with silent failures where appropriate:
  ```javascript
  try {
    const result = JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {}  // Silent fail - recoverable
  ```
- Explicit error throwing via `error()` helper function (not `throw`):
  ```javascript
  if (!filePath) {
    error('path required for verification');
  }
  ```
- Early returns for validation failures:
  ```javascript
  if (!sessionId) {
    process.exit(0);
  }
  ```
- Non-blocking failures: silent catch blocks (e.g., "Silent fail -- never block tool execution")

## Import Organization

**Order:**
1. Node.js built-ins (fs, path, os, child_process)
2. Internal modules (./lib/*, ./core.cjs)
3. Named destructures spread across multiple lines for readability

**Pattern:**
```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { safeReadFile, loadConfig, isGitIgnored, execGit, normalizePhaseName,
        comparePhaseNum, getArchivedPhaseDirs, generateSlugInternal,
        getMilestoneInfo, resolveModelInternal, MODEL_PROFILES, output, error,
        findPhaseInternal } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
```

**Module Exports:**
- CommonJS export: `module.exports = { function1, function2, function3 }`
- All public functions exported at bottom of file
- One exported object per module with all functions

## Logging

**Framework:** No dedicated logging library; uses `process.stdout`, `process.stderr`, `console` (rare)

**Patterns:**
- Normal output to stdout via `output()` helper function (not console.log)
- Errors to stderr via `error()` helper function
- Context monitoring uses `process.stdout.write(JSON.stringify(output))`
- Silent failures preferred over stderr warnings in hooks
- No debug logging present; all output is user-facing or error-facing

**Output Helper:**
```javascript
function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    const json = JSON.stringify(result, null, 2);
    // Large payloads exceed buffer (~50KB)
    if (json.length > 50000) {
      const tmpPath = path.join(require('os').tmpdir(), `gsd-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      process.stdout.write('@file:' + tmpPath);
    } else {
      process.stdout.write(json);
    }
  }
  process.exit(0);
}
```

## Function Design

**Size:** Functions typically 20-60 lines; some utility functions shorter, lifecycle functions longer

**Parameters:**
- Explicit parameters for required values
- Options object for multiple optional parameters
- Use destructuring in function signature when possible:
  ```javascript
  function cmdPhasesList(cwd, options, raw) {
    const { type, phase, includeArchived } = options;
  ```

**Return Values:**
- Functions don't return values; instead call `output()` helper to exit
- Early exits via `process.exit(0)` for success
- Error handling via `error()` which calls `process.exit(1)`
- Result objects always structured with predictable keys

## Module Design

**Exports:**
- All functions exported as properties of single module.exports object:
  ```javascript
  module.exports = {
    cmdConfigEnsureSection,
    cmdConfigSet,
    cmdConfigGet,
  };
  ```
- One module per concern (config.cjs, phase.cjs, state.cjs, etc.)
- Clear naming: function name matches operation (cmd* for CLI commands)

**Module Structure:**
- Header JSDoc comment explaining module purpose
- Import section at top
- Helper functions before main exports
- Module.exports at bottom
- No barrel files; direct imports from specific modules

## Validation & Guards

**Validation Pattern:**
```javascript
if (!keyPath) {
  error('Usage: config-set <key.path> <value>');
}
if (!fs.existsSync(configPath)) {
  const result = { created: false, reason: 'already_exists' };
  output(result, raw, 'exists');
  return;
}
```

**File Checks:**
- Use `fs.existsSync()` before reading
- Graceful degradation when optional files missing
- Default values provided when config files not found

## String Handling

**Template Strings:**
- Use template literals for readability: `` `Error: ${message}` ``
- String concatenation for simple cases: `'key=' + value`
- Regex escaping helper: `escapeRegex()` for user input in patterns

**Encoding:**
- Always specify UTF-8: `fs.readFileSync(path, 'utf-8')`
- Process stdin setup: `process.stdin.setEncoding('utf8')`

---

*Convention analysis: 2026-02-27*
*Update when code patterns change*
