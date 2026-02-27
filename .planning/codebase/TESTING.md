# Testing Patterns

**Analysis Date:** 2026-02-27

## Test Framework

**Status:**
- No test framework currently configured
- No test files present in codebase
- No test runner scripts in package.json
- No test configuration files (jest.config.js, vitest.config.ts, etc.)

**Implication:**
- Code is not tested via automated unit/integration tests
- Functionality is verified through manual testing or integration testing
- GSD itself provides test scaffolding templates for client projects (see `/gsd:add-tests` command)

## Testing Guidance for Client Projects

The GSD codebase includes templates and workflows to guide testing in project codebases:

**Available Templates:**
- `.claude/get-shit-done/templates/codebase/testing.md` - Template for client TESTING.md
- `.claude/commands/gsd/add-tests.md` - GSD command to add tests to phases
- `.claude/get-shit-done/workflows/add-tests.md` - Workflow for writing tests

**Recommended Pattern for GSD Projects:**
Per the testing template, recommended approach is:
- **Test Framework:** Vitest (modern, fast, ESM-friendly)
- **Test Location:** *.test.ts files collocated with source
- **Test Structure:** describe/it blocks with arrange/act/assert pattern
- **Mocking:** Vitest vi mocking for fs, child_process, external APIs
- **Coverage:** Track for awareness (no hard target enforced)

## Code Verification Strategy (Current)

Since no automated tests exist in this codebase, verification occurs through:

**1. Manual Testing:**
- GSD commands tested by running `/gsd:<command>` interactively
- Hooks tested via Claude Code session events (PostToolUse, SessionStart)
- State files verified by checking .planning/ directory integrity

**2. Structural Verification:**
- Frontmatter parsing tested via `cmdVerifySummary()` and `cmdFrontmatterValidate()`
- Phase numbering checked by `cmdPhaseNextDecimal()` and phase rename operations
- Git operations verified by `execGit()` error handling

**3. Integration Testing:**
- End-to-end workflows tested by running complete GSD milestones
- File creation verified by checking `.planning/` directory after operations
- CLI tool output validated against expected JSON/text schema

**Location of Verification Code:**
- `/home/kanter/code/project_mcp/.claude/get-shit-done/bin/lib/verify.cjs` - Main verification suite
  - `cmdVerifySummary()` - Checks SUMMARY.md structure and file references
  - `cmdVerifyPathExists()` - Validates file/directory existence
  - `cmdVerifyConsistency()` - Checks phase numbering and disk/roadmap sync
  - `cmdVerifyHealth()` - Validates .planning/ integrity

**Example Verification Pattern:**
```javascript
// From verify.cjs: Spot-checking files mentioned in SUMMARY
function cmdVerifySummary(cwd, summaryPath, checkFileCount, raw) {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const errors = [];

  // Extract file paths from markdown
  const mentionedFiles = new Set();
  const patterns = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const filePath = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  // Check files exist
  const filesToCheck = Array.from(mentionedFiles).slice(0, checkFileCount);
  const missing = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Report results
  const checks = {
    summary_exists: true,
    files_created: { checked: filesToCheck.length, found: filesToCheck.length - missing.length, missing },
    commits_exist: commitsExist,
    self_check: selfCheck,
  };

  output(result, raw, missing.length === 0 ? 'passed' : 'failed');
}
```

## Error Handling & Validation Patterns

**Frontmatter Validation:**
```javascript
// From frontmatter.cjs: YAML parsing with nested object support
function extractFrontmatter(content) {
  const frontmatter = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return frontmatter;  // Silent default on malformed

  const yaml = match[1];
  const lines = yaml.split('\n');

  // Stack-based parsing for nested structures
  let stack = [{ obj: frontmatter, key: null, indent: -1 }];

  for (const line of lines) {
    if (line.trim() === '') continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    // Parse key: value patterns with array support
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const [, , key, value] = keyMatch;
      // Handle inline arrays: key: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        current.obj[key] = value.slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
      // ... more parsing logic
    }
  }

  return frontmatter;
}
```

**State File Parsing:**
```javascript
// From state.cjs: Graceful parsing with section extraction
function cmdStateGet(cwd, section, raw) {
  try {
    const content = fs.readFileSync(statePath, 'utf-8');

    if (!section) {
      output({ content }, raw, content);
      return;
    }

    // Try field pattern first
    const fieldEscaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fieldPattern = new RegExp(`\\*\\*${fieldEscaped}:\\*\\*\\s*(.*)`, 'i');
    const fieldMatch = content.match(fieldPattern);
    if (fieldMatch) {
      output({ [section]: fieldMatch[1].trim() }, raw, fieldMatch[1].trim());
      return;
    }

    // Try section pattern
    const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch) {
      output({ [section]: sectionMatch[1].trim() }, raw, sectionMatch[1].trim());
      return;
    }

    // Not found
    output({ error: `Section or field "${section}" not found` }, raw, '');
  } catch {
    error('STATE.md not found');
  }
}
```

## Context Monitoring (Hook-based Testing)

The codebase includes automated context-aware monitoring via hooks:

**Location:** `/home/kanter/code/project_mcp/.claude/hooks/gsd-context-monitor.js`

**Pattern:**
```javascript
// Debounce-based warning system
const WARNING_THRESHOLD = 35;  // remaining_percentage <= 35%
const CRITICAL_THRESHOLD = 25; // remaining_percentage <= 25%
const DEBOUNCE_CALLS = 5;      // min tool uses between warnings

// Read context metrics from statusline bridge
const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
const remaining = metrics.remaining_percentage;

// Emit warning or critical message
if (remaining <= CRITICAL_THRESHOLD) {
  message = `CONTEXT MONITOR CRITICAL: Usage at ${usedPct}%. ` +
    'STOP new work immediately. Save state NOW.';
} else if (remaining <= WARNING_THRESHOLD) {
  message = `CONTEXT MONITOR WARNING: Usage at ${usedPct}%. ` +
    'Begin wrapping up current task.';
}

// Inject as additionalContext for agent awareness
const output = {
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: message
  }
};
```

**What This Tests:**
- Context limits are enforced
- Agent receives warnings before context exhaustion
- Debouncing prevents alert spam
- Session metrics are properly tracked

## CLI Tool Output Validation

**Verification Pattern:**
All GSD CLI commands output JSON for machine parsing:

```javascript
// From commands.cjs
function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));  // Raw mode: plain text
  } else {
    const json = JSON.stringify(result, null, 2);
    if (json.length > 50000) {
      // Large payloads written to tmpfile
      const tmpPath = path.join(os.tmpdir(), `gsd-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      process.stdout.write('@file:' + tmpPath);  // Signal large output
    } else {
      process.stdout.write(json);
    }
  }
  process.exit(0);
}
```

**Output Schema:**
- Success: JSON object with operation results
- Errors: `process.stderr` + exit code 1
- Large outputs: `@file:` prefix + tmpfile path
- Raw mode (`--raw` flag): plain text suitable for bash scripts

## Recommendation for Adding Tests

When adding test infrastructure to this codebase:

1. **Choose Framework:** Vitest (no additional config needed)
2. **Test Location:** Collocate tests with source
   - `lib/config.cjs` → `lib/config.test.cjs`
   - `hooks/gsd-context-monitor.js` → `hooks/gsd-context-monitor.test.js`
3. **Test Approach:**
   - Unit test individual functions (parsing, config, phase operations)
   - Mock fs, child_process for filesystem/git operations
   - Test error paths (missing files, malformed JSON)
   - Verify output schema matches expected JSON structure
4. **Priority Coverage:**
   - Frontmatter parsing (complex state machine logic)
   - Phase number normalization and comparison
   - Config merging and defaults
   - Verification suite (used by /gsd:verify-work)

---

*Testing analysis: 2026-02-27*
*Update when testing infrastructure is added*
