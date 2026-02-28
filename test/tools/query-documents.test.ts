import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { DocumentRowSchema } from "../../src/db/schema.js";
import { initProject } from "../../src/tools/init-project.js";
import { queryDocuments } from "../../src/tools/query-documents.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const BASE_DOC = {
  title: "Test Document",
  content: "# Test Document\n\nThis is some test content for the document.",
  category: "research",
  status: "active",
  version: 1,
  tags: "",
  phase: null,
  priority: null,
  parent_id: null,
  depth: null,
  decision_type: null,
};

/**
 * Insert a document row directly into the documents table without chunking/embedding.
 * This lets us test query filtering without Ollama dependency.
 */
async function insertDoc(
  dbPath: string,
  projectId: string,
  override: Partial<typeof BASE_DOC> & { doc_id?: string },
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("documents");
  const now = new Date().toISOString();
  const doc_id =
    override.doc_id ?? `TEST${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await insertBatch(
    table,
    [
      {
        doc_id,
        project_id: projectId,
        ...BASE_DOC,
        ...override,
        created_at: now,
        updated_at: now,
      },
    ],
    DocumentRowSchema,
  );

  return doc_id;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "query-docs-test-"));
  await initProject(tmpDir, "test-proj");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("queryDocuments", () => {
  // ── 1. Basic query — returns all non-superseded documents ─────────────────

  describe("basic query — non-superseded documents by default", () => {
    test("returns active and draft docs, hides superseded", async () => {
      await insertDoc(tmpDir, "test-proj", { status: "active", category: "research", tags: "" });
      await insertDoc(tmpDir, "test-proj", { status: "draft", category: "plan", tags: "" });
      await insertDoc(tmpDir, "test-proj", {
        status: "superseded",
        category: "research",
        tags: "",
      });

      const result = await queryDocuments(tmpDir, "test-proj", { project_id: "test-proj" });

      // Starters from initProject (4 seeded docs) + our 2 non-superseded = at least 2 of ours
      const nonSuperseded = result.documents.filter((d) => d.status !== "superseded");
      expect(nonSuperseded.length).toBe(result.total);

      const statuses = result.documents.map((d) => d.status);
      expect(statuses).not.toContain("superseded");
    });
  });

  // ── 2. Category filter ─────────────────────────────────────────────────────

  describe("category filter", () => {
    test("returns only documents matching the requested category", async () => {
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "active", tags: "" });
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "active", tags: "" });
      await insertDoc(tmpDir, "test-proj", { category: "plan", status: "active", tags: "" });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        category: "research",
      });

      for (const doc of result.documents) {
        expect(doc.category).toBe("research");
      }

      // We inserted 2 research docs
      const ourResearchDocs = result.documents.filter((d) => d.title === "Test Document");
      expect(ourResearchDocs.length).toBe(2);
    });
  });

  // ── 3. Status filter ───────────────────────────────────────────────────────

  describe("status filter", () => {
    test("filter by status=draft returns only draft docs", async () => {
      await insertDoc(tmpDir, "test-proj", { status: "draft", category: "plan", tags: "" });
      await insertDoc(tmpDir, "test-proj", { status: "active", category: "plan", tags: "" });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "draft",
      });

      for (const doc of result.documents) {
        expect(doc.status).toBe("draft");
      }
    });

    test("explicit status=superseded returns superseded docs (overrides default exclusion)", async () => {
      await insertDoc(tmpDir, "test-proj", {
        status: "superseded",
        category: "plan",
        tags: "",
        title: "Old Version",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "superseded",
      });

      expect(result.documents.length).toBeGreaterThan(0);
      for (const doc of result.documents) {
        expect(doc.status).toBe("superseded");
      }

      const ourDoc = result.documents.find((d) => d.title === "Old Version");
      expect(ourDoc).toBeDefined();
    });
  });

  // ── 4. Phase filter ────────────────────────────────────────────────────────

  describe("phase filter", () => {
    test("returns only documents matching the requested phase", async () => {
      await insertDoc(tmpDir, "test-proj", {
        phase: "phase-2",
        status: "active",
        category: "research",
        tags: "",
      });
      await insertDoc(tmpDir, "test-proj", {
        phase: "phase-1",
        status: "active",
        category: "plan",
        tags: "",
      });
      await insertDoc(tmpDir, "test-proj", {
        phase: "phase-2",
        status: "active",
        category: "learning",
        tags: "",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        phase: "phase-2",
      });

      for (const doc of result.documents) {
        expect(doc.phase).toBe("phase-2");
      }

      // We inserted 2 phase-2 docs
      expect(result.documents.filter((d) => d.phase === "phase-2").length).toBe(2);
    });
  });

  // ── 5. Tags filter (Research Pitfall 4 — pipe-delimited exact match) ──────

  describe("tags filter (pipe-delimited)", () => {
    test("filter by 'typescript' matches doc with tags='|typescript|backend|'", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        tags: "|typescript|backend|",
        status: "active",
        category: "research",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        tags: "typescript",
      });

      const found = result.documents.find((d) => d.doc_id === docId);
      expect(found).toBeDefined();
    });

    test("filter by 'type' does NOT match '|typescript|backend|' (partial match rejected)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        tags: "|typescript|backend|",
        status: "active",
        category: "research",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        tags: "type",
      });

      const found = result.documents.find((d) => d.doc_id === docId);
      expect(found).toBeUndefined();
    });

    test("filter by 'backend' matches doc with tags='|typescript|backend|'", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        tags: "|typescript|backend|",
        status: "active",
        category: "research",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        tags: "backend",
      });

      const found = result.documents.find((d) => d.doc_id === docId);
      expect(found).toBeDefined();
    });

    test("rejects tag with special characters (SQL injection protection)", async () => {
      await expect(
        queryDocuments(tmpDir, "test-proj", {
          project_id: "test-proj",
          tags: "bad'; DROP TABLE documents; --",
        }),
      ).rejects.toThrow("INVALID_TAG");
    });
  });

  // ── 6. Priority filter ─────────────────────────────────────────────────────

  describe("priority filter", () => {
    test("filter by priority=3 returns priority 3 and higher (lower number)", async () => {
      const idP1 = await insertDoc(tmpDir, "test-proj", {
        priority: 1,
        status: "active",
        category: "research",
        tags: "",
        title: "Priority 1 Doc",
      });
      const idP3 = await insertDoc(tmpDir, "test-proj", {
        priority: 3,
        status: "active",
        category: "research",
        tags: "",
        title: "Priority 3 Doc",
      });
      const idP5 = await insertDoc(tmpDir, "test-proj", {
        priority: 5,
        status: "active",
        category: "research",
        tags: "",
        title: "Priority 5 Doc",
      });

      // priority >= 3 means "minimum priority 3" — returns 3 and 5 (higher number = lower priority)
      // But the plan says priority=3 should return priority 3 AND 5 docs
      // The schema says "Minimum priority filter" — priorities >= 3 are returned
      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        priority: 3,
        category: "research",
      });

      const ourDocs = result.documents.filter((d) => [idP1, idP3, idP5].includes(d.doc_id));
      const priorities = ourDocs.map((d) => d.priority);

      // priority >= 3: returns 3 and 5 (not 1)
      expect(priorities).toContain(3);
      expect(priorities).toContain(5);
      expect(priorities).not.toContain(1);
    });
  });

  // ── 7. Combined filters (AND) ─────────────────────────────────────────────

  describe("combined filters — AND combination", () => {
    test("category AND status filters combine correctly", async () => {
      const researchActiveId = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "active",
        tags: "",
        title: "Research Active",
      });
      await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "draft",
        tags: "",
        title: "Research Draft",
      });
      await insertDoc(tmpDir, "test-proj", {
        category: "plan",
        status: "active",
        tags: "",
        title: "Plan Active",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        category: "research",
        status: "active",
      });

      for (const doc of result.documents) {
        expect(doc.category).toBe("research");
        expect(doc.status).toBe("active");
      }

      const found = result.documents.find((d) => d.doc_id === researchActiveId);
      expect(found).toBeDefined();
    });
  });

  // ── 8. Limit ──────────────────────────────────────────────────────────────

  describe("limit", () => {
    test("limit=2 returns exactly 2 documents", async () => {
      // Insert 5 research docs (plus starters but they are different categories)
      for (let i = 0; i < 5; i++) {
        await insertDoc(tmpDir, "test-proj", {
          category: "change_record",
          status: "active",
          tags: "",
          title: `Change Record ${i}`,
        });
      }

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        category: "change_record",
        limit: 2,
      });

      expect(result.documents.length).toBe(2);
      expect(result.total).toBe(2);
    });

    test("default limit is 20", async () => {
      // Insert 25 learning docs
      for (let i = 0; i < 25; i++) {
        await insertDoc(tmpDir, "test-proj", {
          category: "learning",
          status: "active",
          tags: "",
          title: `Learning Note ${i}`,
        });
      }

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        category: "learning",
      });

      expect(result.documents.length).toBe(20);
    });
  });

  // ── 9. Summary truncation ──────────────────────────────────────────────────

  describe("summary truncation", () => {
    test("content longer than 400 chars is truncated with '...'", async () => {
      const longContent = "A".repeat(500);
      const docId = await insertDoc(tmpDir, "test-proj", {
        content: longContent,
        status: "active",
        category: "research",
        tags: "",
        title: "Long Content Doc",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "active",
        category: "research",
      });

      const doc = result.documents.find((d) => d.doc_id === docId);
      expect(doc).toBeDefined();
      expect(doc?.summary.length).toBe(403); // 400 chars + "..."
      expect(doc?.summary.endsWith("...")).toBe(true);
    });

    test("content shorter than 400 chars is returned in full (no truncation)", async () => {
      const shortContent = "Short content here — less than 400 characters.";
      const docId = await insertDoc(tmpDir, "test-proj", {
        content: shortContent,
        status: "active",
        category: "research",
        tags: "",
        title: "Short Content Doc",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "active",
        category: "research",
      });

      const doc = result.documents.find((d) => d.doc_id === docId);
      expect(doc).toBeDefined();
      expect(doc?.summary).toBe(shortContent);
      expect(doc?.summary.endsWith("...")).toBe(false);
    });
  });

  // ── 10. Return shape ──────────────────────────────────────────────────────

  describe("return shape", () => {
    test("each document has all expected fields", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "active",
        tags: "|test|",
        phase: "phase-1",
        priority: 2,
        title: "Shape Test Doc",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "active",
        category: "research",
      });

      const doc = result.documents.find((d) => d.doc_id === docId);
      expect(doc).toBeDefined();

      // Verify all expected fields are present
      expect(typeof doc?.doc_id).toBe("string");
      expect(typeof doc?.title).toBe("string");
      expect(typeof doc?.category).toBe("string");
      expect(typeof doc?.status).toBe("string");
      expect(typeof doc?.version).toBe("number");
      expect(doc?.phase).toBe("phase-1");
      expect(doc?.tags).toBe("|test|");
      expect(doc?.priority).toBe(2);
      expect(typeof doc?.summary).toBe("string");
      expect(typeof doc?.created_at).toBe("string");
      expect(typeof doc?.updated_at).toBe("string");
    });

    test("total matches documents array length", async () => {
      await insertDoc(tmpDir, "test-proj", {
        category: "task_spec",
        status: "draft",
        tags: "",
      });
      await insertDoc(tmpDir, "test-proj", {
        category: "task_spec",
        status: "draft",
        tags: "",
      });

      const result = await queryDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "draft",
        category: "task_spec",
      });

      expect(result.total).toBe(result.documents.length);
    });
  });
});
