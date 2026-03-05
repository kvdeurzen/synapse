import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Import the module under test
import { resolveConfig } from "./resolve-config.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-config-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // Restore env var if we changed it
  delete process.env.CLAUDE_PROJECT_DIR;
});

describe("resolveConfig", () => {
  test("returns absolute path when .synapse/config/{filename} exists in startDir", () => {
    const configDir = path.join(tmpDir, ".synapse", "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "project.toml"), '[project]\nproject_id = "test"\n');

    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    const result = resolveConfig("project.toml");

    expect(result).toBe(path.join(configDir, "project.toml"));
  });

  test("walk-up traverses parent directories to find .synapse/config/{filename}", () => {
    // Create .synapse/config in tmpDir, start from nested subdirectory
    const configDir = path.join(tmpDir, ".synapse", "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "project.toml"), '[project]\nproject_id = "test"\n');

    const nestedDir = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nestedDir, { recursive: true });

    process.env.CLAUDE_PROJECT_DIR = nestedDir;
    const result = resolveConfig("project.toml");

    expect(result).toBe(path.join(configDir, "project.toml"));
  });

  test("returns monorepo fallback path when .synapse/config/ does not exist but packages/framework/config/{filename} does", () => {
    // CLAUDE_PROJECT_DIR points to a directory with no .synapse/config
    // The monorepo fallback should find packages/framework/config/trust.toml
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    const result = resolveConfig("trust.toml");

    // Should find the real trust.toml in packages/framework/config
    expect(result).not.toBeNull();
    expect(result).toContain("trust.toml");
    expect(fs.existsSync(result)).toBe(true);
  });

  test("returns null when file is not found in any search location", () => {
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    const result = resolveConfig("nonexistent.toml");

    expect(result).toBeNull();
  });

  test("CLAUDE_PROJECT_DIR env var overrides cwd as walk-up start directory", () => {
    // Create .synapse/config in tmpDir (not cwd)
    const configDir = path.join(tmpDir, ".synapse", "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "project.toml"), '[project]\nproject_id = "from-env"\n');

    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    const result = resolveConfig("project.toml");

    // Should find the file starting from CLAUDE_PROJECT_DIR
    expect(result).toBe(path.join(configDir, "project.toml"));
  });

  test("walk-up stops at filesystem root without infinite loop", () => {
    // Use filesystem root as start — should not find project.toml and should not infinite loop
    process.env.CLAUDE_PROJECT_DIR = "/";
    const result = resolveConfig("project.toml");

    // Should return null or the monorepo fallback (not found in .synapse/config at root)
    // The monorepo fallback wouldn't have project.toml, so expect null
    expect(result).toBeNull();
  });

  test("first match wins — does not continue searching after a hit", () => {
    // Create .synapse/config in a nested dir AND in its parent
    const parentConfigDir = path.join(tmpDir, ".synapse", "config");
    fs.mkdirSync(parentConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(parentConfigDir, "project.toml"),
      '[project]\nproject_id = "parent"\n',
    );

    const childDir = path.join(tmpDir, "child");
    const childConfigDir = path.join(childDir, ".synapse", "config");
    fs.mkdirSync(childConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(childConfigDir, "project.toml"),
      '[project]\nproject_id = "child"\n',
    );

    process.env.CLAUDE_PROJECT_DIR = childDir;
    const result = resolveConfig("project.toml");

    // Should find child's config first (nearest match)
    expect(result).toBe(path.join(childConfigDir, "project.toml"));
  });
});
