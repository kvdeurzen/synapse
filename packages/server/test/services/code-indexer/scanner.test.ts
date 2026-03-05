import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_EXCLUSIONS,
  isTestFile,
  SUPPORTED_EXTENSIONS,
  scanFiles,
} from "../../../src/services/code-indexer/scanner";

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function createTempDir(): string {
  const dir = join(tmpdir(), `scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(base: string, relPath: string, content = ""): void {
  const full = join(base, relPath);
  mkdirSync(full.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// isTestFile
// ---------------------------------------------------------------------------

describe("isTestFile", () => {
  test("*.test.ts is a test file", () => {
    expect(isTestFile("utils.test.ts")).toBe(true);
  });

  test("*.spec.ts is a test file", () => {
    expect(isTestFile("config.spec.tsx")).toBe(true);
  });

  test("test_*.py is a test file", () => {
    expect(isTestFile("test_helper.py")).toBe(true);
  });

  test("*_test.rs is a test file", () => {
    expect(isTestFile("parser_test.rs")).toBe(true);
  });

  test("main.ts is NOT a test file", () => {
    expect(isTestFile("main.ts")).toBe(false);
  });

  test("directory named 'testing' does not make a file a test file", () => {
    expect(isTestFile("testing/helper.ts")).toBe(false);
  });

  test("nested path: src/utils.test.ts is a test file", () => {
    expect(isTestFile("src/utils.test.ts")).toBe(true);
  });

  test("nested path: src/main.ts is NOT a test file", () => {
    expect(isTestFile("src/main.ts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_EXCLUSIONS export
// ---------------------------------------------------------------------------

describe("DEFAULT_EXCLUSIONS", () => {
  test("contains node_modules/", () => {
    expect(DEFAULT_EXCLUSIONS).toContain("node_modules/");
  });

  test("contains __pycache__/", () => {
    expect(DEFAULT_EXCLUSIONS).toContain("__pycache__/");
  });

  test("contains target/", () => {
    expect(DEFAULT_EXCLUSIONS).toContain("target/");
  });
});

// ---------------------------------------------------------------------------
// SUPPORTED_EXTENSIONS export
// ---------------------------------------------------------------------------

describe("SUPPORTED_EXTENSIONS", () => {
  test("contains .ts, .tsx, .py, .rs", () => {
    expect(SUPPORTED_EXTENSIONS).toContain(".ts");
    expect(SUPPORTED_EXTENSIONS).toContain(".tsx");
    expect(SUPPORTED_EXTENSIONS).toContain(".py");
    expect(SUPPORTED_EXTENSIONS).toContain(".rs");
  });
});

// ---------------------------------------------------------------------------
// scanFiles
// ---------------------------------------------------------------------------

describe("scanFiles", () => {
  test("discovers .ts, .py, .rs files recursively", async () => {
    writeFile(tempDir, "src/main.ts", "const x = 1;");
    writeFile(tempDir, "src/utils.py", "def hello(): pass");
    writeFile(tempDir, "lib/parser.rs", "fn main() {}");
    writeFile(tempDir, "docs/readme.md", "# readme");

    const result = await scanFiles(tempDir);

    const relPaths = result.files.map((f) => f.relativePath);
    expect(relPaths).toContain("src/main.ts");
    expect(relPaths).toContain("src/utils.py");
    expect(relPaths).toContain("lib/parser.rs");
    // .md files should NOT appear
    expect(relPaths).not.toContain("docs/readme.md");
  });

  test("excludes node_modules by default", async () => {
    writeFile(tempDir, "src/main.ts", "const x = 1;");
    writeFile(tempDir, "node_modules/pkg/index.ts", "export {}");

    const result = await scanFiles(tempDir);
    const relPaths = result.files.map((f) => f.relativePath);

    expect(relPaths).toContain("src/main.ts");
    expect(relPaths.some((p) => p.startsWith("node_modules/"))).toBe(false);
  });

  test("respects .gitignore patterns", async () => {
    writeFile(tempDir, ".gitignore", "secrets/\n*.secret.ts\n");
    writeFile(tempDir, "src/main.ts", "const x = 1;");
    writeFile(tempDir, "secrets/config.ts", "const secret = true;");
    writeFile(tempDir, "src/auth.secret.ts", "const key = 'abc';");

    const result = await scanFiles(tempDir);
    const relPaths = result.files.map((f) => f.relativePath);

    expect(relPaths).toContain("src/main.ts");
    expect(relPaths.some((p) => p.startsWith("secrets/"))).toBe(false);
    expect(relPaths).not.toContain("src/auth.secret.ts");
  });

  test("exclude_patterns option excludes additional files", async () => {
    writeFile(tempDir, "src/main.ts", "const x = 1;");
    writeFile(tempDir, "src/generated.ts", "// generated");

    const result = await scanFiles(tempDir, { exclude_patterns: ["generated.ts"] });
    const relPaths = result.files.map((f) => f.relativePath);

    expect(relPaths).toContain("src/main.ts");
    expect(relPaths).not.toContain("src/generated.ts");
  });

  test("all returned paths are relative (not absolute)", async () => {
    writeFile(tempDir, "src/main.ts", "const x = 1;");

    const result = await scanFiles(tempDir);
    for (const file of result.files) {
      expect(file.relativePath.startsWith("/")).toBe(false);
    }
  });

  test("all returned paths use forward slashes", async () => {
    writeFile(tempDir, "src/deep/nested/main.ts", "const x = 1;");

    const result = await scanFiles(tempDir);
    for (const file of result.files) {
      expect(file.relativePath).not.toContain("\\");
    }
  });

  test("absolutePath is the full path to the file", async () => {
    writeFile(tempDir, "src/main.ts", "const x = 1;");

    const result = await scanFiles(tempDir);
    const found = result.files.find((f) => f.relativePath === "src/main.ts");
    expect(found).toBeDefined();
    expect(found?.absolutePath).toBe(join(tempDir, "src/main.ts"));
  });

  test("language is correctly detected for each extension", async () => {
    writeFile(tempDir, "a.ts", "");
    writeFile(tempDir, "b.tsx", "");
    writeFile(tempDir, "c.py", "");
    writeFile(tempDir, "d.rs", "");

    const result = await scanFiles(tempDir);
    const byRel: Record<string, string> = {};
    for (const f of result.files) {
      byRel[f.relativePath] = f.language;
    }

    expect(byRel["a.ts"]).toBe("typescript");
    expect(byRel["b.tsx"]).toBe("typescript");
    expect(byRel["c.py"]).toBe("python");
    expect(byRel["d.rs"]).toBe("rust");
  });

  test("isTest flag is set for test files", async () => {
    writeFile(tempDir, "utils.test.ts", "");
    writeFile(tempDir, "main.ts", "");

    const result = await scanFiles(tempDir);
    const byRel: Record<string, boolean> = {};
    for (const f of result.files) {
      byRel[f.relativePath] = f.isTest;
    }

    expect(byRel["utils.test.ts"]).toBe(true);
    expect(byRel["main.ts"]).toBe(false);
  });

  test("files_scanned matches number of files found", async () => {
    writeFile(tempDir, "a.ts", "");
    writeFile(tempDir, "b.py", "");
    writeFile(tempDir, "c.rs", "");

    const result = await scanFiles(tempDir);
    expect(result.files_scanned).toBe(result.files.length);
    expect(result.files_scanned).toBe(3);
  });

  test("include_patterns limits files to matching pattern", async () => {
    writeFile(tempDir, "src/main.ts", "");
    writeFile(tempDir, "src/helper.ts", "");
    writeFile(tempDir, "src/util.py", "");

    const result = await scanFiles(tempDir, { include_patterns: ["**/*.ts"] });
    const relPaths = result.files.map((f) => f.relativePath);

    expect(relPaths).toContain("src/main.ts");
    expect(relPaths).toContain("src/helper.ts");
    expect(relPaths).not.toContain("src/util.py");
  });
});
