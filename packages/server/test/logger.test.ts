import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const srcDir = path.resolve(import.meta.dir, "..", "src");

describe("logger", () => {
  test("logger writes to stderr, not stdout", () => {
    // Spawn a subprocess that imports logger and logs a message
    const script = `
      import { logger } from '${srcDir}/logger.ts';
      logger.info({ test: true }, 'test-message');
    `;

    const result = spawnSync("bun", ["-e", script], {
      encoding: "utf-8",
      timeout: 10000,
    });

    // stdout should be empty (no log output on stdout)
    expect(result.stdout).toBe("");
    // stderr should contain the pino log output
    expect(result.stderr).toContain("test-message");
  });

  test("setLogLevel updates the logger level", () => {
    // Spawn a subprocess that sets level to error and then logs at info (should not appear)
    const script = `
      import { logger, setLogLevel } from '${srcDir}/logger.ts';
      setLogLevel('error');
      logger.info('this-should-not-appear');
      logger.error('this-should-appear');
    `;

    const result = spawnSync("bun", ["-e", script], {
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.stderr).not.toContain("this-should-not-appear");
    expect(result.stderr).toContain("this-should-appear");
  });

  test("createToolLogger returns child logger with correlationId and tool bindings", () => {
    const script = `
      import { createToolLogger } from '${srcDir}/logger.ts';
      const toolLogger = createToolLogger('test-tool');
      toolLogger.info('tool-log-entry');
    `;

    const result = spawnSync("bun", ["-e", script], {
      encoding: "utf-8",
      timeout: 10000,
    });

    // The stderr output should be valid JSON lines with correlationId and tool fields
    const lines = result.stderr
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);

    const lastLine = lines[lines.length - 1] ?? "{}";
    const logLine = JSON.parse(lastLine);
    expect(logLine.tool).toBe("test-tool");
    expect(typeof logLine.correlationId).toBe("string");
    expect(logLine.correlationId.length).toBeGreaterThan(0);
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(logLine.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("logger exports are correctly typed", () => {
    const script = `
      import { logger, setLogLevel, createToolLogger } from '${srcDir}/logger.ts';
      console.log(typeof logger);
      console.log(typeof setLogLevel);
      console.log(typeof createToolLogger);
    `;

    const result = spawnSync("bun", ["-e", script], {
      encoding: "utf-8",
      timeout: 10000,
    });

    // console.log writes to stdout
    const lines = result.stdout.trim().split("\n");
    expect(lines[0]).toBe("object");
    expect(lines[1]).toBe("function");
    expect(lines[2]).toBe("function");
  });
});
