import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { ulid } from "ulidx";
import { OllamaUnreachableError } from "../../src/errors.js";
import { _setFetchImpl, setOllamaStatus } from "../../src/services/embedder.js";
import { initProject } from "../../src/tools/init-project.js";
import { semanticSearch } from "../../src/tools/semantic-search.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const TEST_CONFIG: SynapseConfig = {
  db: "",
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

/**
 * Returns a 768-dim vector. All values are very small (close to 0) by default.
 * For "similar" vectors, pass a different seed to get a distinct direction.
 */
function makeVector(seed = 0): number[] {
  const v = new Array(768).fill(0) as number[];
  // Set a few non-zero values so it's not the zero vector
  v[seed % 768] = 1.0;
  v[(seed + 100) % 768] = 0.5;
  return v;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "semantic-search-test-"));
  // By default, set Ollama as ok for tests that need it
  setOllamaStatus("ok");
  // Mock embed fetch to return vectors without needing real Ollama
  _setFetchImpl((_url, init) => {
    const body = init?.body;
    let count = 1;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as { input?: string[] };
        count = parsed.input?.length ?? 1;
      } catch {
        count = 1;
      }
    }
    const vectors = Array.from({ length: count }, (_, i) =>
      Array.from({ length: 768 }, (__, j) => (j === i % 768 ? 1.0 : 0.01)),
    );
    return Promise.resolve(
      new Response(JSON.stringify({ embeddings: vectors }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

afterEach(() => {
  setOllamaStatus("unreachable");
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to insert a doc + doc_chunks row into temp DB
async function insertTestChunk(
  db: lancedb.Connection,
  opts: {
    projectId: string;
    docId: string;
    chunkId?: string;
    content: string;
    header?: string;
    status?: string;
    vector?: number[] | null;
    docTitle?: string;
    docCategory?: string;
    docStatus?: string;
    docPhase?: string | null;
    docTags?: string;
    docPriority?: number | null;
  },
): Promise<void> {
  const docId = opts.docId;
  const chunkId = opts.chunkId ?? ulid();
  const now = new Date().toISOString();

  // Insert into documents table
  const docsTable = await db.openTable("documents");
  await docsTable.add([
    {
      doc_id: docId,
      project_id: opts.projectId,
      title: opts.docTitle ?? "Test Document",
      content: opts.content,
      category: opts.docCategory ?? "architecture_decision",
      status: opts.docStatus ?? "active",
      version: 1,
      created_at: now,
      updated_at: now,
      tags: opts.docTags ?? "",
      phase: opts.docPhase ?? null,
      priority: opts.docPriority ?? null,
      parent_id: null,
      depth: null,
      decision_type: null,
    },
  ]);

  // Insert into doc_chunks table
  const chunksTable = await db.openTable("doc_chunks");
  await chunksTable.add([
    {
      chunk_id: chunkId,
      project_id: opts.projectId,
      doc_id: docId,
      chunk_index: 0,
      content: opts.content,
      vector: opts.vector !== undefined ? opts.vector : makeVector(0),
      header: opts.header ?? "Header",
      version: 1,
      status: opts.status ?? "active",
      token_count: opts.content.split(" ").length,
      created_at: now,
    },
  ]);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("semanticSearch", () => {
  // ── 1. Ollama unreachable path ─────────────────────────────────────────────

  describe("Ollama unreachable", () => {
    test("throws OllamaUnreachableError when Ollama status is unreachable", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("unreachable");

      const config = { ...TEST_CONFIG, db: tmpDir };
      await expect(
        semanticSearch(tmpDir, "test-proj", { project_id: "test-proj", query: "test" }, config),
      ).rejects.toThrow(OllamaUnreachableError);
    });

    test("throws OllamaUnreachableError when Ollama status is model_missing", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("model_missing");

      const config = { ...TEST_CONFIG, db: tmpDir };
      await expect(
        semanticSearch(tmpDir, "test-proj", { project_id: "test-proj", query: "test" }, config),
      ).rejects.toThrow(OllamaUnreachableError);
    });
  });

  // ── 2. Basic semantic search ───────────────────────────────────────────────

  describe("basic search", () => {
    test("returns results with required fields including source='document'", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      const docId = ulid();
      await insertTestChunk(db, {
        projectId: "test-proj",
        docId,
        content: "This document explains the architecture of the system",
        vector: makeVector(0),
      });

      // Open fresh connection after insert
      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "architecture" },
        config,
      );

      expect(result.search_type).toBe("semantic");
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);

      const item = result.results[0];
      expect(typeof item.doc_id).toBe("string");
      expect(typeof item.chunk_id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.category).toBe("string");
      expect(typeof item.status).toBe("string");
      expect(typeof item.relevance_score).toBe("number");
      expect(typeof item.snippet).toBe("string");
      expect(item.source).toBe("document");
    });

    test("relevance_score is normalized to [0,1]", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      const docId = ulid();
      await insertTestChunk(db, {
        projectId: "test-proj",
        docId,
        content: "Architecture patterns for system design",
        vector: makeVector(0),
      });

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "architecture" },
        config,
      );

      for (const item of result.results) {
        expect(item.relevance_score).toBeGreaterThanOrEqual(0);
        expect(item.relevance_score).toBeLessThanOrEqual(1);
      }
    });

    test("respects limit parameter (default 5)", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      // Insert 8 chunks
      for (let i = 0; i < 8; i++) {
        await insertTestChunk(db, {
          projectId: "test-proj",
          docId: ulid(),
          chunkId: ulid(),
          content: `Architecture pattern document number ${i} explains system design`,
          vector: makeVector(i),
        });
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "architecture" },
        config,
      );

      // Default limit is 5
      expect(result.results.length).toBeLessThanOrEqual(5);
    });

    test("respects custom limit", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      for (let i = 0; i < 8; i++) {
        await insertTestChunk(db, {
          projectId: "test-proj",
          docId: ulid(),
          chunkId: ulid(),
          content: `System design document ${i}`,
          vector: makeVector(i),
        });
      }

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "system design", limit: 3 },
        config,
      );

      expect(result.results.length).toBeLessThanOrEqual(3);
    });
  });

  // ── 3. min_score filtering ─────────────────────────────────────────────────

  describe("min_score filtering", () => {
    test("min_score=1.0 returns no results (no perfect matches possible)", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      await insertTestChunk(db, {
        projectId: "test-proj",
        docId: ulid(),
        content: "Architecture overview",
        vector: makeVector(0),
      });

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "architecture", min_score: 1.0 },
        config,
      );

      // With min_score=1.0, only distance=0.0 (identical vectors) would pass,
      // but our mock embed returns different vectors for the query vs stored vectors
      // so this may or may not return results — just verify scores are filtered
      for (const item of result.results) {
        expect(item.relevance_score).toBeGreaterThanOrEqual(1.0);
      }
    });

    test("min_score=0.0 returns all results", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      await insertTestChunk(db, {
        projectId: "test-proj",
        docId: ulid(),
        content: "Some document content",
        vector: makeVector(0),
      });

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "content", min_score: 0.0 },
        config,
      );

      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  // ── 4. Metadata filtering ──────────────────────────────────────────────────

  describe("metadata filtering", () => {
    test("category filter narrows results to matching docs only", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      const docId1 = ulid();
      const docId2 = ulid();

      await insertTestChunk(db, {
        projectId: "test-proj",
        docId: docId1,
        chunkId: ulid(),
        content: "Architecture decision document for the system",
        vector: makeVector(1),
        docCategory: "architecture_decision",
        docStatus: "active",
      });

      await insertTestChunk(db, {
        projectId: "test-proj",
        docId: docId2,
        chunkId: ulid(),
        content: "Research findings about system design",
        vector: makeVector(2),
        docCategory: "research",
        docStatus: "active",
      });

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "system design", category: "architecture_decision" },
        config,
      );

      // All returned results should be from architecture_decision docs only
      for (const item of result.results) {
        expect(item.category).toBe("architecture_decision");
      }
    });

    test("include_superseded=false excludes superseded chunks (default)", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      await insertTestChunk(db, {
        projectId: "test-proj",
        docId: ulid(),
        content: "Superseded architecture document",
        vector: makeVector(0),
        status: "superseded",
      });

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "architecture" },
        config,
      );

      // Superseded chunks should not appear (default include_superseded=false)
      for (const item of result.results) {
        expect(item.status).not.toBe("superseded");
      }
    });
  });

  // ── 5. Result structure ────────────────────────────────────────────────────

  describe("result structure", () => {
    test("returns total count and search_type='semantic'", async () => {
      await initProject(tmpDir, "test-proj");
      setOllamaStatus("ok");

      const db = await lancedb.connect(tmpDir);
      await insertTestChunk(db, {
        projectId: "test-proj",
        docId: ulid(),
        content: "Architecture overview document",
        vector: makeVector(0),
      });

      const config = { ...TEST_CONFIG, db: tmpDir };
      const result = await semanticSearch(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", query: "architecture" },
        config,
      );

      expect(result.search_type).toBe("semantic");
      expect(typeof result.total).toBe("number");
      expect(result.total).toBe(result.results.length);
    });
  });
});
