import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test, expect, afterEach } from 'bun:test';

const STARTUP_HOOK = join(import.meta.dir, '../../hooks/synapse-startup.js');
const AUDIT_HOOK = join(import.meta.dir, '../../hooks/synapse-audit.js');

// Track temp dirs to clean up after each test
const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'synapse-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

// ─── SessionStart hook tests ────────────────────────────────────────────────

describe('synapse-startup.js (SessionStart hook)', () => {
  test('outputs valid JSON with hookSpecificOutput', () => {
    const result = spawnSync('node', [STARTUP_HOOK], {
      input: '{}',
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('hookSpecificOutput');
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string');
    expect(parsed.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('get_task_tree');
  });

  test('additionalContext includes attribution instructions', () => {
    const result = spawnSync('node', [STARTUP_HOOK], {
      input: '{}',
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    // Should mention attribution requirement with actor keyword
    const hasAttribution = ctx.includes('Attribution') || ctx.includes('actor');
    expect(hasAttribution).toBe(true);
  });

  test('exits 0 on malformed input', () => {
    const result = spawnSync('node', [STARTUP_HOOK], {
      input: 'not valid json at all!!!',
      encoding: 'utf8',
    });

    // Hook should exit 0 (no crash) regardless of input
    expect(result.status).toBe(0);
  });

  test('exits 0 on empty input', () => {
    const result = spawnSync('node', [STARTUP_HOOK], {
      input: '',
      encoding: 'utf8',
    });

    // Hook should exit 0 (no crash) even with empty stdin
    expect(result.status).toBe(0);
  });
});

// ─── PostToolUse audit hook tests ───────────────────────────────────────────

describe('synapse-audit.js (PostToolUse audit hook)', () => {
  test('logs Synapse tool call to audit file', () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: 'mcp__synapse__create_task',
      tool_input: { project_id: 'test-project', title: 'Test task', actor: 'orchestrator' },
      tool_output: '{"task_id": "t-001"}',
    });

    const result = spawnSync('node', [AUDIT_HOOK], {
      input: hookInput,
      encoding: 'utf8',
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, '.synapse-audit.log');
    expect(existsSync(logPath)).toBe(true);

    const logContent = readFileSync(logPath, 'utf8').trim();
    const logEntry = JSON.parse(logContent);

    expect(logEntry.tool).toBe('mcp__synapse__create_task');
    expect(typeof logEntry.ts).toBe('string');
    expect(logEntry.ts.length).toBeGreaterThan(0);
    expect(Array.isArray(logEntry.input_keys)).toBe(true);
    expect(logEntry.input_keys).toContain('project_id');
    expect(logEntry.input_keys).toContain('title');
  });

  test('ignores non-Synapse tool calls', () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: '/some/file.ts' },
      tool_output: 'file contents',
    });

    const result = spawnSync('node', [AUDIT_HOOK], {
      input: hookInput,
      encoding: 'utf8',
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, '.synapse-audit.log');
    // No log file should be created for non-Synapse tools
    expect(existsSync(logPath)).toBe(false);
  });

  test('exits 0 on malformed input', () => {
    const tmpDir = makeTmpDir();

    const result = spawnSync('node', [AUDIT_HOOK], {
      input: 'garbage input that is not json',
      encoding: 'utf8',
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);
  });

  test('captures agent identity from actor field', () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: 'mcp__synapse__store_decision',
      tool_input: { actor: 'orchestrator', decision: 'Use TypeScript', project_id: 'my-project' },
      tool_output: '{"id": "d-001"}',
    });

    const result = spawnSync('node', [AUDIT_HOOK], {
      input: hookInput,
      encoding: 'utf8',
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, '.synapse-audit.log');
    const logEntry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    expect(logEntry.agent).toBe('orchestrator');
  });

  test('captures agent identity from assigned_agent field', () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: 'mcp__synapse__update_task',
      tool_input: { assigned_agent: 'executor', task_id: 't-001', status: 'done' },
      tool_output: '{}',
    });

    const result = spawnSync('node', [AUDIT_HOOK], {
      input: hookInput,
      encoding: 'utf8',
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, '.synapse-audit.log');
    const logEntry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    expect(logEntry.agent).toBe('executor');
  });

  test('agent defaults to unknown when no identity provided', () => {
    const tmpDir = makeTmpDir();
    const hookInput = JSON.stringify({
      tool_name: 'mcp__synapse__get_task_tree',
      tool_input: { project_id: 'my-project', root_id: 'epic-001' },
      tool_output: '{"tasks": []}',
    });

    const result = spawnSync('node', [AUDIT_HOOK], {
      input: hookInput,
      encoding: 'utf8',
      cwd: tmpDir,
    });

    expect(result.status).toBe(0);

    const logPath = join(tmpDir, '.synapse-audit.log');
    const logEntry = JSON.parse(readFileSync(logPath, 'utf8').trim());
    expect(logEntry.agent).toBe('unknown');
  });
});
