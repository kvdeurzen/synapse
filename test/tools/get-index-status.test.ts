import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as lancedb from "@lancedb/lancedb";
import { ulid } from "ulidx";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/tools/init-project.js";
import { getIndexStatus } from "../../src/tools/get-index-status.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const TEST_CONFIG: SynapseConfig = {
  db: "",
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

function makeVector(seed = 0): number[] {
  const v = new Array(768).fill(0) as number[];
  v[seed % 768] = 1.0;
  v[(seed + 100) % 768] = 0.5;
  return v;
}

async function insertCodeChunk(
  db: lancedb.Connection,
  opts: {
    projectId: string;
    filePath: string;
    language?: string;
    fileHash?: string | null;
    chunkId?: string;
    content?: string;
    symbolName?: string | null;
    symbolType?: string | null;
  },
): Promise<string> {
  const chunkId = opts.chunkId ?? ulid();
  const now = new Date().toISOString();

  const codeChunksTable = await db.openTable("code_chunks");
  await codeChunksTable.add([
    {
      chunk_id: chunkId,
      project_id: opts.projectId,
      doc_id: opts.filePath,
      file_path: opts.filePath,
      symbol_name: opts.symbolName ?? null,
      symbol_type: opts.symbolType ?? null,
      scope_chain: null,
      content: opts.content ?? `export function fn${chunkId.slice(-4)}(): void {}`,
      language: opts.language ?? null,
      imports: "{}",
      exports: "{}",
      start_line: 1,
      end_line: 3,
      created_at: now,
      file_hash: opts.fileHash ?? null,
      vector: makeVector(0),
    },
  ]);

  return chunkId;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "get-index-status-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("getIndexStatus", () => {
  // ── a. Empty project returns zero counts ──────────────────────────────────

  describe("empty project", () => {
    test("returns zero counts and empty languages array for project with no code_chunks", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await getIndexStatus(tmpDir, "test-proj");

      expect(result.project_id).toBe("test-proj");
      expect(result.total_files).toBe(0);
      expect(result.total_chunks).toBe(0);
      expect(result.last_index_at).toBeNull();
      expect(result.languages).toHaveLength(0);
    });
  });

  // ── b. Returns correct counts and per-language breakdown ──────────────────

  describe("counts and language breakdown", () => {
    test("returns correct total_files, total_chunks, and per-language breakdown", async () => {
      await initProject(tmpDir, "test-proj");
      const db = await lancedb.connect(tmpDir);

      // Insert 2 TypeScript chunks for 2 different files
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/a.ts",
        language: "typescript",
        chunkId: ulid(),
      });
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/b.ts",
        language: "typescript",
        chunkId: ulid(),
      });

      // Insert 1 Python chunk for 1 file
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/c.py",
        language: "python",
        chunkId: ulid(),
      });

      // Insert a second chunk for src/a.ts (same file, different symbol)
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/a.ts",
        language: "typescript",
        chunkId: ulid(),
      });

      const result = await getIndexStatus(tmpDir, "test-proj");

      // total_files = distinct file paths = 3 (a.ts, b.ts, c.py)
      expect(result.total_files).toBe(3);
      // total_chunks = 4 rows total
      expect(result.total_chunks).toBe(4);

      // Per-language breakdown
      expect(result.languages.length).toBe(2);

      const tsEntry = result.languages.find((l) => l.language === "typescript");
      const pyEntry = result.languages.find((l) => l.language === "python");

      expect(tsEntry).toBeDefined();
      expect(tsEntry!.file_count).toBe(2); // a.ts, b.ts
      expect(tsEntry!.chunk_count).toBe(3); // 3 chunks for typescript files

      expect(pyEntry).toBeDefined();
      expect(pyEntry!.file_count).toBe(1); // c.py
      expect(pyEntry!.chunk_count).toBe(1);
    });
  });

  // ── c. stale_files is null when project_root not provided ────────────────

  describe("stale_files null behavior", () => {
    test("stale_files is null when project_root not provided", async () => {
      await initProject(tmpDir, "test-proj");
      const db = await lancedb.connect(tmpDir);

      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/a.ts",
        language: "typescript",
      });

      // Call without project_root
      const result = await getIndexStatus(tmpDir, "test-proj");
      expect(result.stale_files).toBeNull();
    });

    test("stale_files is null when project_root not provided even with many chunks", async () => {
      await initProject(tmpDir, "test-proj");
      const db = await lancedb.connect(tmpDir);

      for (let i = 0; i < 5; i++) {
        await insertCodeChunk(db, {
          projectId: "test-proj",
          filePath: `src/file${i}.ts`,
          language: "typescript",
          chunkId: ulid(),
        });
      }

      const result = await getIndexStatus(tmpDir, "test-proj");
      // null, not 0 — we have not checked staleness
      expect(result.stale_files).toBeNull();
      expect(result.stale_files).not.toBe(0);
    });
  });

  // ── d. stale_files detects changed files ──────────────────────────────────

  describe("staleness detection", () => {
    test("stale_files is 0 when all files match their stored hashes", async () => {
      const dbPath = tmpDir;
      const projectRoot = join(tmpDir, "project");

      // We'll put files in a subdirectory to use as project_root
      const { mkdirSync } = await import("node:fs");
      mkdirSync(projectRoot, { recursive: true });

      await initProject(dbPath, "test-proj");
      const db = await lancedb.connect(dbPath);

      // Write a real file and compute its hash
      const filePath = join(projectRoot, "src/a.ts");
      const { mkdirSync: mkdirFn } = await import("node:fs");
      mkdirFn(join(projectRoot, "src"), { recursive: true });
      const fileContent = "export function add(a: number, b: number): number { return a + b; }";
      writeFileSync(filePath, fileContent);
      const hash = createHash("sha256").update(fileContent).digest("hex");

      // Insert chunk with matching hash (relative path from project_root)
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/a.ts",
        language: "typescript",
        fileHash: hash,
      });

      const result = await getIndexStatus(dbPath, "test-proj", projectRoot);

      // Hash matches — not stale
      expect(result.stale_files).toBe(0);
    });

    test("stale_files detects files whose content changed", async () => {
      const dbPath = tmpDir;
      const projectRoot = join(tmpDir, "project");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(projectRoot, "src"), { recursive: true });

      await initProject(dbPath, "test-proj");
      const db = await lancedb.connect(dbPath);

      // Write original file
      const filePath = join(projectRoot, "src/a.ts");
      const originalContent = "export function original(): void {}";
      writeFileSync(filePath, originalContent);
      const originalHash = createHash("sha256").update(originalContent).digest("hex");

      // Insert chunk with the original hash
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/a.ts",
        language: "typescript",
        fileHash: originalHash,
      });

      // Now modify the file on disk (simulate content change)
      const modifiedContent = "export function modified(): void {} // CHANGED";
      writeFileSync(filePath, modifiedContent);

      // getIndexStatus with project_root — should detect the file as stale
      const result = await getIndexStatus(dbPath, "test-proj", projectRoot);
      expect(result.stale_files).toBeGreaterThan(0);
    });
  });

  // ── e. stale_files counts deleted files ───────────────────────────────────

  describe("stale_files for deleted files", () => {
    test("stale_files counts files that do not exist on disk", async () => {
      const dbPath = tmpDir;
      const projectRoot = join(tmpDir, "project");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(projectRoot, { recursive: true });

      await initProject(dbPath, "test-proj");
      const db = await lancedb.connect(dbPath);

      // Insert chunk referencing a file that does NOT exist on disk
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/nonexistent.ts",
        language: "typescript",
        fileHash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      });

      const result = await getIndexStatus(dbPath, "test-proj", projectRoot);

      // File doesn't exist on disk — stale
      expect(result.stale_files).toBeGreaterThan(0);
    });

    test("stale_files counts only deleted files when some files are fresh", async () => {
      const dbPath = tmpDir;
      const projectRoot = join(tmpDir, "project");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(projectRoot, "src"), { recursive: true });

      await initProject(dbPath, "test-proj");
      const db = await lancedb.connect(dbPath);

      // Write one existing file with matching hash
      const existingContent = "export const PI = 3.14159;";
      writeFileSync(join(projectRoot, "src/math.ts"), existingContent);
      const existingHash = createHash("sha256").update(existingContent).digest("hex");

      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/math.ts",
        language: "typescript",
        fileHash: existingHash,
        chunkId: ulid(),
      });

      // Insert a second chunk for a file that does NOT exist on disk
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/deleted.ts",
        language: "typescript",
        fileHash: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd",
        chunkId: ulid(),
      });

      const result = await getIndexStatus(dbPath, "test-proj", projectRoot);

      // Only src/deleted.ts is stale (1 file not on disk)
      expect(result.stale_files).toBe(1);
    });
  });

  // ── f. Server registers get_index_status tool ─────────────────────────────

  describe("server registration", () => {
    test("get_index_status tool is registered and tool count is 18", () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      const server = createServer(config);

      // Access registered tools via _registeredTools (plain object, not Map)
      const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })
        ._registeredTools;

      expect(typeof registeredTools).toBe("object");
      expect("get_index_status" in registeredTools).toBe(true);

      // Verify tool count is 18
      const toolCount = Object.keys(registeredTools).length;
      expect(toolCount).toBe(18);
    });
  });
});
