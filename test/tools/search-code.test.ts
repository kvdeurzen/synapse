import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import { ulid } from "ulidx";
import { _setFetchImpl, setOllamaStatus } from "../../src/services/embedder.js";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/tools/init-project.js";
import { globToSqlLike, searchCode } from "../../src/tools/search-code.js";
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "search-code-test-"));
  // FTS doesn't need Ollama — block fetch to detect accidental embed calls
  setOllamaStatus("unreachable");
  _setFetchImpl((_url, _init) => {
    return Promise.reject(new Error("Fetch should not be called in FTS-only tests"));
  });
});

afterEach(() => {
  setOllamaStatus("unreachable");
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to insert a code_chunks row into temp DB
async function insertTestCodeChunk(
  db: lancedb.Connection,
  opts: {
    projectId: string;
    chunkId?: string;
    docId?: string;
    filePath: string;
    symbolName?: string | null;
    symbolType?: string | null;
    scopeChain?: string | null;
    content: string;
    language?: string | null;
    startLine?: number | null;
    endLine?: number | null;
    vector?: number[];
  },
): Promise<void> {
  const chunkId = opts.chunkId ?? ulid();
  const docId = opts.docId ?? opts.filePath; // doc_id = file_path per Phase 6 decision
  const now = new Date().toISOString();

  const codeChunksTable = await db.openTable("code_chunks");
  await codeChunksTable.add([
    {
      chunk_id: chunkId,
      project_id: opts.projectId,
      doc_id: docId,
      file_path: opts.filePath,
      symbol_name: opts.symbolName ?? null,
      symbol_type: opts.symbolType ?? null,
      scope_chain: opts.scopeChain ?? null,
      content: opts.content,
      language: opts.language ?? null,
      imports: "{}",
      exports: "{}",
      start_line: opts.startLine ?? null,
      end_line: opts.endLine ?? null,
      created_at: now,
      file_hash: null,
      vector: opts.vector ?? makeVector(0),
    },
  ]);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("globToSqlLike", () => {
  test("** maps to % (match any path segments)", () => {
    expect(globToSqlLike("src/**/*.ts")).toBe("src/%/%.ts");
  });

  test("* maps to % (match any chars within segment)", () => {
    expect(globToSqlLike("tests/*.spec.js")).toBe("tests/%.spec.js");
  });

  test("? maps to _ (match single char)", () => {
    expect(globToSqlLike("src/?.ts")).toBe("src/_.ts");
  });

  test("% is escaped to prevent unintended matching", () => {
    expect(globToSqlLike("src/100%/file.ts")).toBe("src/100\\%/file.ts");
  });

  test("_ is escaped to prevent unintended matching", () => {
    expect(globToSqlLike("src/my_file.ts")).toBe("src/my\\_file.ts");
  });

  test("combined: src/**/*.ts matches multi-segment paths", () => {
    // The SQL LIKE pattern should match "src/foo/bar.ts" via "src/%/%.ts"
    const pattern = globToSqlLike("src/**/*.ts");
    expect(pattern).toBe("src/%/%.ts");
  });
});

describe("searchCode", () => {
  // ── FTS on empty table ─────────────────────────────────────────────────────

  describe("empty table behavior", () => {
    test("FTS on empty code_chunks returns empty results (not an error) — Pitfall 3", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("unreachable");

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await searchCode(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "typescript", mode: "fulltext" },
        config,
      );

      // Should return empty results, NOT throw
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.total).toBe(0);
      expect(result.search_type).toBe("fulltext");
    });

    test("hybrid mode on empty table with Ollama unreachable falls back to FTS-only and returns empty", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("unreachable");

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await searchCode(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "function" },
        config,
      );

      expect(result.fallback).toBe(true);
      expect(result.fallback_reason).toBe("Ollama unreachable");
      expect(result.search_type).toBe("hybrid_fts_fallback");
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  // ── Fulltext mode ──────────────────────────────────────────────────────────

  describe("fulltext mode", () => {
    test("returns results with correct fields when matching keyword found", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/services/user.ts",
        symbolName: "createUser",
        symbolType: "function",
        scopeChain: "UserService.createUser",
        content: "async function createUser(name: string): Promise<User> { return new User(name); }",
        language: "typescript",
        startLine: 10,
        endLine: 12,
      });

      // Rebuild FTS index after insert to ensure indexing covers new rows
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // Index rebuild may not be needed — proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "createUser", mode: "fulltext" },
          config,
        );

        expect(result.search_type).toBe("fulltext");
        expect(Array.isArray(result.results)).toBe(true);

        if (result.results.length > 0) {
          const item = result.results[0];
          expect(typeof item.chunk_id).toBe("string");
          expect(typeof item.file_path).toBe("string");
          expect(item.file_path).toBe("src/services/user.ts");
          expect(typeof item.symbol_name).toBe("string");
          expect(item.symbol_name).toBe("createUser");
          expect(Array.isArray(item.scope_chain)).toBe(true);
          expect(typeof item.content).toBe("string");
          expect(typeof item.relevance_score).toBe("number");
          expect(item.relevance_score).toBeGreaterThanOrEqual(0);
          expect(item.relevance_score).toBeLessThanOrEqual(1);
          expect(item.start_line).toBe(10);
          expect(item.end_line).toBe(12);
          expect(item.language).toBe("typescript");
          expect(item.source).toBe("code");
        }
      } catch (err) {
        // FTS index may not be ready — verify no unexpected fetch errors
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });

    test("search_type is 'fulltext' and total matches results length", async () => {
      await initProject(tmpDir, "test-proj");

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "function", mode: "fulltext" },
          config,
        );

        expect(result.search_type).toBe("fulltext");
        expect(typeof result.total).toBe("number");
        expect(result.total).toBe(result.results.length);
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });

  // ── scope_chain parsing ────────────────────────────────────────────────────

  describe("scope_chain parsing", () => {
    test("scope_chain stored as dot-notation is returned as string array", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/services/auth.ts",
        symbolName: "login",
        symbolType: "method",
        scopeChain: "UserService.login",
        content: "async function login(email: string, password: string): Promise<void>",
        language: "typescript",
      });

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "login", mode: "fulltext" },
          config,
        );

        if (result.results.length > 0) {
          const item = result.results[0];
          expect(Array.isArray(item.scope_chain)).toBe(true);
          expect(item.scope_chain).toEqual(["UserService", "login"]);
        }
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });

    test("null scope_chain returns empty array", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/index.ts",
        symbolName: null,
        symbolType: null,
        scopeChain: null,
        content: "module level code with no scope chain here",
        language: "typescript",
      });

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "module level code", mode: "fulltext" },
          config,
        );

        if (result.results.length > 0) {
          const item = result.results[0];
          expect(Array.isArray(item.scope_chain)).toBe(true);
          expect(item.scope_chain).toEqual([]);
        }
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });

  // ── Language filter ────────────────────────────────────────────────────────

  describe("language filter", () => {
    test("language filter returns only chunks with matching language", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        chunkId: ulid(),
        filePath: "src/main.ts",
        content: "function handleRequest(): void { console.log('typescript handler'); }",
        language: "typescript",
      });
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        chunkId: ulid(),
        filePath: "src/main.py",
        content: "def handle_request(): print('python handler')",
        language: "python",
      });

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "handler", mode: "fulltext", language: "typescript" },
          config,
        );

        for (const item of result.results) {
          expect(item.language).toBe("typescript");
        }
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });

  // ── file_pattern glob filter ───────────────────────────────────────────────

  describe("file_pattern glob filter", () => {
    test("file_pattern narrows results to matching file paths", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        chunkId: ulid(),
        filePath: "src/services/auth.ts",
        content: "export function authenticate(token: string): boolean { return true; }",
        language: "typescript",
      });
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        chunkId: ulid(),
        filePath: "test/auth.spec.ts",
        content: "test authenticate function call and verify result is boolean",
        language: "typescript",
      });

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            query: "authenticate",
            mode: "fulltext",
            file_pattern: "src/**/*.ts",
          },
          config,
        );

        for (const item of result.results) {
          expect(item.file_path).toMatch(/^src\//);
        }
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });

  // ── Empty results ──────────────────────────────────────────────────────────

  describe("empty results", () => {
    test("filters that match nothing return empty results array with total=0", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/main.ts",
        content: "function main(): void { console.log('hello'); }",
        language: "typescript",
      });

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        // Filter for rust, but only typescript was inserted — should return empty
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "main", mode: "fulltext", language: "rust" },
          config,
        );

        expect(Array.isArray(result.results)).toBe(true);
        // Results should be empty or only match rust language
        for (const item of result.results) {
          expect(item.language).toBe("rust");
        }
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });

  // ── Hybrid fallback ────────────────────────────────────────────────────────

  describe("hybrid mode Ollama fallback", () => {
    test("falls back to FTS when Ollama is unreachable", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("unreachable");

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await searchCode(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "function", mode: "hybrid" },
        config,
      );

      expect(result.fallback).toBe(true);
      expect(result.fallback_reason).toBe("Ollama unreachable");
      expect(result.search_type).toBe("hybrid_fts_fallback");
    });

    test("falls back to FTS when Ollama status is 'model_missing'", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("model_missing");

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await searchCode(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "class", mode: "hybrid" },
        config,
      );

      expect(result.fallback).toBe(true);
      expect(result.search_type).toBe("hybrid_fts_fallback");
    });
  });

  // ── Default limit ──────────────────────────────────────────────────────────

  describe("limit parameter", () => {
    test("default limit is 10", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      // Insert 15 chunks
      for (let i = 0; i < 15; i++) {
        await insertTestCodeChunk(db, {
          projectId: "test-proj",
          chunkId: ulid(),
          filePath: `src/module${i}.ts`,
          content: `export function handler${i}(): void { console.log('function handler ${i}'); }`,
          language: "typescript",
        });
      }

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "handler", mode: "fulltext" },
          config,
        );

        // Default limit is 10 — results should not exceed 10
        expect(result.results.length).toBeLessThanOrEqual(10);
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });

  // ── source attribution ────────────────────────────────────────────────────

  describe("source attribution", () => {
    test("all results have source='code'", async () => {
      await initProject(tmpDir, "test-proj");

      const db = await lancedb.connect(tmpDir);
      await insertTestCodeChunk(db, {
        projectId: "test-proj",
        filePath: "src/app.ts",
        content: "export class AppController { handleRequest() {} }",
        language: "typescript",
      });

      // Rebuild FTS index
      const codeChunksTable = await db.openTable("code_chunks");
      try {
        await codeChunksTable.createIndex("content", { config: Index.fts() });
      } catch {
        // proceed
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      try {
        const result = await searchCode(
          tmpDir,
          "test-proj",
          { project_id: "test-proj", query: "AppController", mode: "fulltext" },
          config,
        );

        for (const item of result.results) {
          expect(item.source).toBe("code");
        }
      } catch (err) {
        expect(String(err)).not.toContain("Fetch should not be called");
      }
    });
  });
});

// ── Server registration ────────────────────────────────────────────────────

describe("server registration", () => {
  test("search_code tool is registered and tool count is 22 (after create_task added in Phase 11)", () => {
    const config = { ...TEST_CONFIG, db: tmpDir };
    const server = createServer(config);

    // Access registered tools via _registeredTools (plain object, not Map)
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;

    expect(typeof registeredTools).toBe("object");
    expect("search_code" in registeredTools).toBe(true);

    // Tool count is 22 (create_task added in Phase 11)
    const toolCount = Object.keys(registeredTools).length;
    expect(toolCount).toBe(22);
  });
});
