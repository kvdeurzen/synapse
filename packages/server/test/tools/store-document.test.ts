import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { initProject } from "../../src/tools/init-project.js";
import { storeDocument } from "../../src/tools/store-document.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock Ollama /api/embed response returning 768-dim vectors.
 * count = number of texts to embed (one vector per text).
 */
function mockOllamaEmbed(count: number): Response {
  const vectors = Array.from({ length: count }, () =>
    Array.from({ length: 768 }, (_, i) => i * 0.001),
  );
  return new Response(JSON.stringify({ embeddings: vectors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const TEST_CONFIG: SynapseConfig = {
  db: "", // will be set per test
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "store-document-test-"));
  // Mock fetch to avoid needing real Ollama
  _setFetchImpl((_url, _init) => {
    // Count the number of texts in the request body to return matching vectors
    const body = _init?.body;
    let count = 1;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as { input?: string[] };
        count = parsed.input?.length ?? 1;
      } catch {
        count = 1;
      }
    }
    return Promise.resolve(mockOllamaEmbed(count));
  });
});

afterEach(() => {
  // Restore real fetch
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("storeDocument", () => {
  // ── 1. New document storage (DOC-01) ─────────────────────────────────────

  describe("new document storage (DOC-01)", () => {
    test("stores a document and returns doc_id, version, chunk_count, token_estimate", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Architecture Overview",
          content:
            "# Architecture Overview\n\n## Components\n\nThis system uses a layered architecture.\n\n## Data Flow\n\nRequests flow from the API layer to the service layer and then to the database.",
          category: "architecture_decision",
          status: "draft",
          tags: "|typescript|backend|",
          phase: "phase-1",
          priority: 1,
        },
        config,
      );

      expect(typeof result.doc_id).toBe("string");
      expect(result.doc_id.length).toBe(26); // ULID length
      expect(result.version).toBe(1);
      expect(result.chunk_count).toBeGreaterThan(0);
      expect(result.token_estimate).toBeGreaterThan(0);
    });

    test("document row is stored in documents table with correct fields", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "My Plan",
          content: "# My Plan\n\n## Objectives\n\nBuild a great system.",
          category: "plan",
          status: "active",
          tags: "|planning|",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();

      // Filter for non-starter docs (starters are seeded by initProject)
      const docRows = rows.filter((r) => r.doc_id === result.doc_id);
      expect(docRows.length).toBe(1);

      const row = docRows[0];
      expect(row.doc_id).toBe(result.doc_id);
      expect(row.project_id).toBe("test-proj");
      expect(row.title).toBe("My Plan");
      expect(row.category).toBe("plan");
      expect(row.status).toBe("active");
      expect(row.version).toBe(1);
      expect(row.tags).toBe("|planning|");
    });

    test("doc_chunks rows exist with status=active and valid vectors", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Design Pattern: Repository",
          content: "# Repository Pattern\n\nThe repository pattern abstracts data access.",
          category: "design_pattern",
          status: "draft",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const chunksTable = await db.openTable("doc_chunks");
      const chunks = await chunksTable.query().toArray();
      const docChunks = chunks.filter((c) => c.doc_id === result.doc_id);

      expect(docChunks.length).toBe(result.chunk_count);
      for (const chunk of docChunks) {
        expect(chunk.status).toBe("active");
        expect(chunk.version).toBe(1);
        // LanceDB returns FixedSizeList as a Float32Array or similar typed array (not plain Array)
        const vector = chunk.vector;
        expect(vector !== null && vector !== undefined).toBe(true);
        expect((vector as { length: number }).length).toBe(768);
      }
    });

    test("activity_log row created after successful store", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Glossary",
          content: "# Glossary\n\nA collection of terms.",
          category: "glossary",
          status: "draft",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const activityTable = await db.openTable("activity_log");
      const logs = await activityTable.query().toArray();

      const storeLogs = logs.filter(
        (l) => l.action === "store_document" && l.target_id === result.doc_id,
      );
      expect(storeLogs.length).toBe(1);
      expect(storeLogs[0].target_type).toBe("document");
    });

    test("new document defaults to status=draft when not specified", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Research Notes",
          content: "# Research\n\nSome research notes here.",
          category: "research",
          // No status provided — should default to draft
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.doc_id === result.doc_id);

      expect(row?.status).toBe("draft");
    });
  });

  // ── 2. Category validation ─────────────────────────────────────────────────

  describe("category validation", () => {
    test("accepts all 12 valid categories", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const validCategories = [
        "architecture_decision",
        "design_pattern",
        "glossary",
        "code_pattern",
        "dependency",
        "plan",
        "task_spec",
        "requirement",
        "technical_context",
        "change_record",
        "research",
        "learning",
      ] as const;

      for (const category of validCategories) {
        const result = await storeDocument(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: `Test ${category}`,
            content: `# Test\n\nContent for category ${category}.`,
            category,
            status: "draft",
          },
          config,
        );
        expect(result.version).toBe(1);
      }
    });

    test("rejects invalid category with validation error", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDocument(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Bad Doc",
            content: "Content",
            // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
            category: "invalid_category" as any,
            status: "draft",
          },
          config,
        ),
      ).rejects.toThrow();
    });
  });

  // ── 3. Re-versioning (DOC-04) ─────────────────────────────────────────────

  describe("re-versioning (DOC-04)", () => {
    test("re-versioning increments version to 2", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const v1 = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "My Doc",
          content: "# My Doc\n\nVersion 1 content.",
          category: "plan",
          status: "draft",
        },
        config,
      );

      const v2 = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          doc_id: v1.doc_id,
          title: "My Doc",
          content: "# My Doc\n\nVersion 2 content with more details.",
          category: "plan",
          status: "active",
        },
        config,
      );

      expect(v2.doc_id).toBe(v1.doc_id);
      expect(v2.version).toBe(2);
    });

    test("old doc_chunks have status=superseded after re-versioning", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const v1 = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Versioned Doc",
          content: "# Versioned Doc\n\nInitial content.",
          category: "requirement",
          status: "draft",
        },
        config,
      );

      await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          doc_id: v1.doc_id,
          title: "Versioned Doc",
          content: "# Versioned Doc\n\nUpdated content.",
          category: "requirement",
          status: "active",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const chunksTable = await db.openTable("doc_chunks");
      const allChunks = await chunksTable.query().toArray();
      const docChunks = allChunks.filter((c) => c.doc_id === v1.doc_id);

      const superseded = docChunks.filter((c) => c.status === "superseded");
      const active = docChunks.filter((c) => c.status === "active");

      expect(superseded.length).toBeGreaterThan(0);
      expect(active.length).toBeGreaterThan(0);

      // v1 chunks should be superseded
      const v1Chunks = docChunks.filter((c) => c.version === 1);
      for (const c of v1Chunks) {
        expect(c.status).toBe("superseded");
      }

      // v2 chunks should be active
      const v2Chunks = docChunks.filter((c) => c.version === 2);
      for (const c of v2Chunks) {
        expect(c.status).toBe("active");
      }
    });

    test("old document row has status=superseded after re-versioning", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const v1 = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task Spec",
          content: "# Task Spec\n\n## Objectives\n\nDo the thing.",
          category: "task_spec",
          status: "active",
        },
        config,
      );

      await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          doc_id: v1.doc_id,
          title: "Task Spec",
          content: "# Task Spec v2\n\n## Objectives\n\nDo the thing better.",
          category: "task_spec",
          status: "active",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      const docRows = rows.filter((r) => r.doc_id === v1.doc_id);

      const v1Rows = docRows.filter((r) => r.version === 1);
      expect(v1Rows.length).toBe(1);
      expect(v1Rows[0].status).toBe("superseded");

      const v2Rows = docRows.filter((r) => r.version === 2);
      expect(v2Rows.length).toBe(1);
      expect(v2Rows[0].status).toBe("active");
    });
  });

  // ── 4. Lifecycle states (DOC-09) ──────────────────────────────────────────

  describe("lifecycle states (DOC-09)", () => {
    test("can create document with status=active", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Active Doc",
          content: "# Active\n\nThis is active content.",
          category: "technical_context",
          status: "active",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.doc_id === result.doc_id);

      expect(row?.status).toBe("active");
    });

    test("can create document with status=approved", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Approved Doc",
          content: "# Approved\n\nFinal approved content.",
          category: "requirement",
          status: "approved",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.doc_id === result.doc_id);

      expect(row?.status).toBe("approved");
    });

    test("invalid status is rejected", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDocument(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Bad Status",
            content: "Content",
            category: "plan",
            // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
            status: "invalid_status" as any,
          },
          config,
        ),
      ).rejects.toThrow();
    });
  });

  // ── 5. Carry-forward protection (DOC-10) ──────────────────────────────────

  describe("carry-forward protection (DOC-10)", () => {
    test("architecture_decision re-versioning uses superseded not archived", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const v1 = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "ADR-001: Use LanceDB",
          content: "# ADR-001: Use LanceDB\n\n## Decision\n\nWe chose LanceDB for vector storage.",
          category: "architecture_decision",
          status: "active",
        },
        config,
      );

      await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          doc_id: v1.doc_id,
          title: "ADR-001: Use LanceDB v2",
          content: "# ADR-001: Use LanceDB v2\n\n## Decision\n\nRevised decision.",
          category: "architecture_decision",
          status: "active",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      const v1Row = rows.find((r) => r.doc_id === v1.doc_id && r.version === 1);

      // Must be superseded, NOT archived
      expect(v1Row?.status).toBe("superseded");
      expect(v1Row?.status).not.toBe("archived");
    });

    test("glossary re-versioning uses superseded not archived", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const v1 = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Glossary Terms",
          content: "# Glossary\n\n### API\nApplication Programming Interface.",
          category: "glossary",
          status: "active",
        },
        config,
      );

      await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          doc_id: v1.doc_id,
          title: "Glossary Terms v2",
          content:
            "# Glossary\n\n### API\nApplication Programming Interface.\n\n### SDK\nSoftware Development Kit.",
          category: "glossary",
          status: "active",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      const v1Row = rows.find((r) => r.doc_id === v1.doc_id && r.version === 1);

      expect(v1Row?.status).toBe("superseded");
      expect(v1Row?.status).not.toBe("archived");
    });
  });

  // ── 6. Return values (DOC-12) ─────────────────────────────────────────────

  describe("return values (DOC-12)", () => {
    test("doc_id is a valid ULID (26-char uppercase alphanumeric)", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Learning Notes",
          content: "# Learning\n\nSome notes about learning.",
          category: "learning",
          status: "draft",
        },
        config,
      );

      expect(typeof result.doc_id).toBe("string");
      expect(result.doc_id.length).toBe(26);
      expect(result.doc_id).toMatch(/^[0-9A-Z]{26}$/);
    });

    test("chunk_count matches number of doc_chunks rows", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Change Record",
          content: "# Change Record\n\nThis change was made on 2026-01-01.\n\nReason: needed.",
          category: "change_record",
          status: "draft",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const chunksTable = await db.openTable("doc_chunks");
      const chunks = await chunksTable.query().toArray();
      const docChunks = chunks.filter((c) => c.doc_id === result.doc_id);

      expect(docChunks.length).toBe(result.chunk_count);
    });

    test("token_estimate is a positive number", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDocument(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Dependency Spec",
          content: "# Dependencies\n\nlancedb@0.26.2 — vector database",
          category: "dependency",
          status: "draft",
        },
        config,
      );

      expect(result.token_estimate).toBeGreaterThan(0);
      expect(typeof result.token_estimate).toBe("number");
    });
  });

  // ── 7. Error handling ──────────────────────────────────────────────────────

  describe("error handling", () => {
    test("returns DOC_NOT_FOUND when doc_id does not exist", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDocument(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            doc_id: "01HXXXXXXXXXXXXXXXXXXXXXXX",
            title: "Update Nonexistent",
            content: "# Content\n\nThis doc doesn't exist.",
            category: "plan",
            status: "draft",
          },
          config,
        ),
      ).rejects.toThrow("DOC_NOT_FOUND");
    });

    test("embed failure rolls back document row insertion", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      // Override the mock to throw an error
      _setFetchImpl(() => Promise.reject(new TypeError("ECONNREFUSED")));

      await expect(
        storeDocument(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Failing Doc",
            content: "# Failing Doc\n\nThis should not be stored.",
            category: "plan",
            status: "draft",
          },
          config,
        ),
      ).rejects.toThrow();

      // Verify no orphaned document row was left behind
      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().toArray();
      // Only starter documents should be present
      const nonStarterRows = rows.filter((r) => r.title === "Failing Doc");
      expect(nonStarterRows.length).toBe(0);
    });
  });
});
