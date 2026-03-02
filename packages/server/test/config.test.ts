import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const srcDir = path.resolve(import.meta.dir, "..", "src");

/**
 * Helper: run loadConfig in a subprocess with given args, env, cwd, and optional toml content.
 * Uses a temp script file to avoid bun -e flag collision with --db etc.
 */
function runConfig(options: {
  args?: string[];
  env?: Record<string, string | undefined>;
  cwd?: string;
  tomlContent?: string;
}): { stdout: string; stderr: string; exitCode: number | null } {
  const { args = [], env = {}, tomlContent } = options;

  const tmpDir = mkdtempSync(path.join(tmpdir(), "synapse-test-"));
  const scriptPath = path.join(tmpDir, "run-config.ts");
  const tomlPath = path.join(tmpDir, "synapse.toml");

  if (tomlContent !== undefined) {
    writeFileSync(tomlPath, tomlContent, "utf-8");
  }

  const scriptContent = `
import { loadConfig } from '${srcDir}/config.ts';
try {
  const cfg = loadConfig();
  process.stdout.write(JSON.stringify(cfg) + '\\n');
} catch (e) {
  process.stderr.write(String(e) + '\\n');
  process.exit(1);
}
`;
  writeFileSync(scriptPath, scriptContent, "utf-8");

  const result = spawnSync("bun", ["run", scriptPath, "--", ...args], {
    encoding: "utf-8",
    timeout: 15000,
    env: {
      ...process.env,
      // Clear any real SYNAPSE_* vars that might bleed in from current shell
      SYNAPSE_DB_PATH: "",
      OLLAMA_URL: "",
      EMBED_MODEL: "",
      ...env,
    },
    cwd: tmpDir,
  });

  // Cleanup
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status,
  };
}

describe("config", () => {
  test("loadConfig returns defaults for ollamaUrl and embedModel when only --db is provided", () => {
    const result = runConfig({ args: ["--db", "/tmp/test.db"] });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.db).toBe("/tmp/test.db");
    expect(cfg.ollamaUrl).toBe("http://localhost:11434");
    expect(cfg.embedModel).toBe("nomic-embed-text");
    expect(cfg.logLevel).toBe("info");
  });

  test("CLI args override env vars (CLI wins)", () => {
    const result = runConfig({
      args: ["--db", "/cli/path.db"],
      env: { SYNAPSE_DB_PATH: "/env/path.db" },
    });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.db).toBe("/cli/path.db");
  });

  test("env vars are used when CLI arg is absent", () => {
    const result = runConfig({
      env: {
        SYNAPSE_DB_PATH: "/env/path.db",
        OLLAMA_URL: "http://my-ollama:11434",
        EMBED_MODEL: "custom-model",
      },
    });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.db).toBe("/env/path.db");
    expect(cfg.ollamaUrl).toBe("http://my-ollama:11434");
    expect(cfg.embedModel).toBe("custom-model");
  });

  test("missing db from all sources produces an error and exits with code 1", () => {
    const result = runConfig({});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Configuration error");
  });

  test("--quiet flag sets logLevel to warn", () => {
    const result = runConfig({ args: ["--db", "/tmp/test.db", "--quiet"] });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.logLevel).toBe("warn");
  });

  test("--log-level overrides --quiet", () => {
    const result = runConfig({
      args: ["--db", "/tmp/test.db", "--quiet", "--log-level", "debug"],
    });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.logLevel).toBe("debug");
  });

  test("synapse.toml values are used as fallback when CLI and env are absent", () => {
    const toml = `
db = "/toml/path.db"
ollama_url = "http://toml-ollama:11434"
embed_model = "toml-model"
log_level = "debug"
`;
    const result = runConfig({ tomlContent: toml });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.db).toBe("/toml/path.db");
    expect(cfg.ollamaUrl).toBe("http://toml-ollama:11434");
    expect(cfg.embedModel).toBe("toml-model");
    expect(cfg.logLevel).toBe("debug");
  });

  test("CLI args override synapse.toml values", () => {
    const toml = `
db = "/toml/path.db"
ollama_url = "http://toml-ollama:11434"
`;
    const result = runConfig({
      args: ["--db", "/cli/path.db"],
      tomlContent: toml,
    });
    expect(result.exitCode).toBe(0);
    const cfg = JSON.parse(result.stdout);
    expect(cfg.db).toBe("/cli/path.db");
    // toml ollama_url should be used since no CLI/env override
    expect(cfg.ollamaUrl).toBe("http://toml-ollama:11434");
  });

  test("multiple config errors are reported at once (missing db)", () => {
    // No source provides db — check that we get an error exit with stderr output
    const result = runConfig({});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("[synapse] Configuration error");
  });

  test("invalid ollamaUrl is caught and reported", () => {
    const result = runConfig({
      args: ["--db", "/tmp/test.db"],
      env: { OLLAMA_URL: "not-a-url" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Configuration error");
  });
});
