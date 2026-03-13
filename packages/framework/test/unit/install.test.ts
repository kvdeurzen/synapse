import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "../../../..");
const INSTALL_SCRIPT = join(REPO_ROOT, "install.sh");

describe("install.sh", () => {
  let targetDir: string;
  let result: ReturnType<typeof spawnSync>;

  beforeAll(() => {
    targetDir = mkdtempSync(join(tmpdir(), "synapse-install-test-"));
    result = spawnSync("bash", [INSTALL_SCRIPT, "--quiet"], {
      encoding: "utf8",
      env: { ...process.env, TARGET_DIR: targetDir },
      timeout: 30_000,
    });
  });

  afterAll(() => {
    try {
      rmSync(targetDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test("runs successfully (exit 0)", () => {
    if (result.status !== 0) {
      console.error("STDOUT:", result.stdout);
      console.error("STDERR:", result.stderr);
    }
    expect(result.status).toBe(0);
  });

  test("creates .claude directory structure", () => {
    for (const sub of [
      "agents",
      "hooks/lib",
      "commands/synapse",
      "skills",
      "server",
    ]) {
      expect(existsSync(join(targetDir, ".claude", sub))).toBe(true);
    }
  });

  test("creates .synapse/config with templates", () => {
    for (const f of ["trust.toml", "agents.toml", "synapse.toml"]) {
      expect(existsSync(join(targetDir, ".synapse/config", f))).toBe(true);
    }
  });

  test("installs agents (>=10 .md files)", () => {
    const agents = readdirSync(join(targetDir, ".claude/agents")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(agents.length).toBeGreaterThanOrEqual(10);
  });

  test("installs hooks", () => {
    const expected = [
      "synapse-startup.js",
      "tier-gate.js",
      "tool-allowlist.js",
      "precedent-gate.js",
      "audit-log.js",
      "lib/resolve-config.js",
    ];
    for (const f of expected) {
      expect(existsSync(join(targetDir, ".claude/hooks", f))).toBe(true);
    }
  });

  test("installs commands (>=4 .md files)", () => {
    const cmds = readdirSync(
      join(targetDir, ".claude/commands/synapse"),
    ).filter((f) => f.endsWith(".md"));
    expect(cmds.length).toBeGreaterThanOrEqual(4);
  });

  test("installs skills (>=15 directories)", () => {
    const skills = readdirSync(join(targetDir, ".claude/skills")).filter((f) =>
      lstatSync(join(targetDir, ".claude/skills", f)).isDirectory(),
    );
    expect(skills.length).toBeGreaterThanOrEqual(15);
  });

  test(".mcp.json uses npx tsx not bun run (BLOCKER #39 guard)", () => {
    const mcp = JSON.parse(
      readFileSync(join(targetDir, ".mcp.json"), "utf8"),
    );
    const synapse = mcp.mcpServers?.synapse;
    expect(synapse).toBeDefined();
    expect(synapse.command).toBe("npx");
    expect(synapse.args[0]).toBe("tsx");
    // Explicitly guard against the BLOCKER #39 regression
    expect(synapse.command).not.toBe("bun");
    expect(JSON.stringify(synapse)).not.toContain("bun run");
  });

  test("settings.json has valid hook structure", () => {
    const settings = JSON.parse(
      readFileSync(join(targetDir, ".claude/settings.json"), "utf8"),
    );
    expect(Array.isArray(settings.hooks?.SessionStart)).toBe(true);
    expect(Array.isArray(settings.hooks?.PreToolUse)).toBe(true);
    expect(Array.isArray(settings.hooks?.PostToolUse)).toBe(true);
    expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
    expect(settings.hooks.PreToolUse.length).toBeGreaterThan(0);
    expect(settings.hooks.PostToolUse.length).toBeGreaterThan(0);
    expect(settings.statusLine).toBeDefined();
    expect(settings.statusLine.command).toContain("synapse-statusline.js");
  });

  test("settings.json registers conventional-commit.js with Bash matcher in PostToolUse", () => {
    const settings = JSON.parse(
      readFileSync(join(targetDir, ".claude/settings.json"), "utf8"),
    );
    const postToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }> =
      settings.hooks?.PostToolUse ?? [];
    const conventionalCommitEntry = postToolUse.find(
      (entry) =>
        entry.matcher === "Bash" &&
        entry.hooks.some((h) => h.command.includes("conventional-commit.js")),
    );
    expect(conventionalCommitEntry).toBeDefined();
  });

  test("settings.json registers output-contract-gate.js with mcp__synapse__update_task matcher in PostToolUse", () => {
    const settings = JSON.parse(
      readFileSync(join(targetDir, ".claude/settings.json"), "utf8"),
    );
    const postToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }> =
      settings.hooks?.PostToolUse ?? [];
    const outputContractEntry = postToolUse.find(
      (entry) =>
        entry.matcher === "mcp__synapse__update_task" &&
        entry.hooks.some((h) => h.command.includes("output-contract-gate.js")),
    );
    expect(outputContractEntry).toBeDefined();
  });

  test("synapseSignatures in install.sh includes conventional-commit.js and output-contract-gate.js", () => {
    const installSh = readFileSync(INSTALL_SCRIPT, "utf8");
    expect(installSh).toContain("'conventional-commit.js'");
    expect(installSh).toContain("'output-contract-gate.js'");
  });

  test("creates .synapse/config/cliff.toml from template", () => {
    expect(existsSync(join(targetDir, ".synapse/config/cliff.toml"))).toBe(true);
    const contents = readFileSync(join(targetDir, ".synapse/config/cliff.toml"), "utf8");
    expect(contents).toContain("conventional_commits");
    expect(contents).toContain("[git]");
  });

  test(".gitignore has Synapse entries", () => {
    const gitignore = readFileSync(join(targetDir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".synapse-audit.log");
    expect(gitignore).toContain(".synapse/data/");
  });

  test("server is symlinked in dev mode", () => {
    const serverPath = join(targetDir, ".claude/server");
    const stat = lstatSync(serverPath);
    expect(stat.isSymbolicLink()).toBe(true);
  });
});

describe("synapse_version tracking", () => {
  let versionTargetDir: string;
  let versionResult: ReturnType<typeof spawnSync>;

  beforeAll(() => {
    versionTargetDir = mkdtempSync(join(tmpdir(), "synapse-version-test-"));
    // Pre-seed project.toml
    mkdirSync(join(versionTargetDir, ".synapse", "config"), { recursive: true });
    writeFileSync(
      join(versionTargetDir, ".synapse", "config", "project.toml"),
      '[project]\nproject_id = "test-proj"\nname = "Test"\nskills = []\n'
    );
    versionResult = spawnSync("bash", [INSTALL_SCRIPT, "--quiet"], {
      encoding: "utf8",
      env: { ...process.env, TARGET_DIR: versionTargetDir },
      timeout: 30_000,
    });
  });

  afterAll(() => { rmSync(versionTargetDir, { recursive: true, force: true }); });

  test("install runs successfully with pre-seeded project.toml", () => {
    if (versionResult.status !== 0) {
      console.error("STDOUT:", versionResult.stdout);
      console.error("STDERR:", versionResult.stderr);
    }
    expect(versionResult.status).toBe(0);
  });

  test("writes synapse_version to existing project.toml", () => {
    const toml = readFileSync(join(versionTargetDir, ".synapse", "config", "project.toml"), "utf8");
    expect(toml).toContain("synapse_version");
  });
});
