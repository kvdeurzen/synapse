import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { DocumentRowSchema } from "../../src/db/schema.js";
import { getRelatedDocuments } from "../../src/tools/get-related-documents.js";
import { initProject } from "../../src/tools/init-project.js";
import { linkDocuments } from "../../src/tools/link-documents.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const BASE_DOC = {
  title: "Test Document",
  content: "# Test\n\nContent for testing.",
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

let docCounter = 0;

async function insertDoc(
  dbPath: string,
  projectId: string,
  override: Partial<typeof BASE_DOC> & { doc_id?: string },
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("documents");
  const now = new Date().toISOString();
  docCounter++;
  const doc_id = override.doc_id ?? `DOC${docCounter.toString().padStart(4, "0")}`;

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

async function link(
  dbPath: string,
  projectId: string,
  fromId: string,
  toId: string,
  type:
    | "implements"
    | "depends_on"
    | "supersedes"
    | "references"
    | "contradicts"
    | "child_of"
    | "related_to",
  bidirectional = false,
) {
  return linkDocuments(dbPath, projectId, {
    project_id: projectId,
    from_id: fromId,
    to_id: toId,
    type,
    bidirectional,
  });
}

async function markSuperseded(dbPath: string, projectId: string, docId: string) {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("documents");
  await table.update({
    where: `doc_id = '${docId}' AND project_id = '${projectId}'`,
    values: { status: "superseded", updated_at: new Date().toISOString() },
  });
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "get-related-docs-test-"));
  await initProject(tmpDir, "test-proj");
  docCounter = 0;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("getRelatedDocuments", () => {
  // ── 1. Basic 1-hop traversal (GRAPH-03) ───────────────────────────────────

  describe("basic 1-hop traversal (GRAPH-03)", () => {
    test("returns documents linked from the given doc", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });
      const docC = await insertDoc(tmpDir, "test-proj", { title: "Doc C" });

      await link(tmpDir, "test-proj", docA, docB, "references");
      await link(tmpDir, "test-proj", docA, docC, "depends_on");

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      expect(result.doc_id).toBe(docA);
      const relIds = result.related.map((r) => r.doc_id);
      expect(relIds).toContain(docB);
      expect(relIds).toContain(docC);
    });

    test("returns correct relationship types for each related doc", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });
      const docC = await insertDoc(tmpDir, "test-proj", { title: "Doc C" });

      await link(tmpDir, "test-proj", docA, docB, "references");
      await link(tmpDir, "test-proj", docA, docC, "depends_on");

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      const relB = result.related.find((r) => r.doc_id === docB);
      const relC = result.related.find((r) => r.doc_id === docC);
      expect(relB?.relationship_type).toBe("references");
      expect(relC?.relationship_type).toBe("depends_on");
    });
  });

  // ── 2. Direction tracking ─────────────────────────────────────────────────

  describe("direction tracking", () => {
    test("outgoing link shows direction='outgoing' for the source doc", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await link(tmpDir, "test-proj", docA, docB, "references");

      const resultA = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      const relB = resultA.related.find((r) => r.doc_id === docB);
      expect(relB?.direction).toBe("outgoing");
    });

    test("incoming link shows direction='incoming' for the target doc", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await link(tmpDir, "test-proj", docA, docB, "references");

      const resultB = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docB,
      });

      const relA = resultB.related.find((r) => r.doc_id === docA);
      expect(relA?.direction).toBe("incoming");
    });
  });

  // ── 3. Bidirectional links ─────────────────────────────────────────────────

  describe("bidirectional links", () => {
    test("bidirectional link appears in both docs' results", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await link(tmpDir, "test-proj", docA, docB, "related_to", true);

      const resultA = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });
      const resultB = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docB,
      });

      expect(resultA.related.map((r) => r.doc_id)).toContain(docB);
      expect(resultB.related.map((r) => r.doc_id)).toContain(docA);
    });
  });

  // ── 4. Type filter ────────────────────────────────────────────────────────

  describe("type filter", () => {
    test("filtering by type returns only matching relationships", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });
      const docC = await insertDoc(tmpDir, "test-proj", { title: "Doc C" });

      await link(tmpDir, "test-proj", docA, docB, "references");
      await link(tmpDir, "test-proj", docA, docC, "depends_on");

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
        type: "references",
      });

      const relIds = result.related.map((r) => r.doc_id);
      expect(relIds).toContain(docB);
      expect(relIds).not.toContain(docC);
    });

    test("filtering by type excludes non-matching relationship types", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await link(tmpDir, "test-proj", docA, docB, "implements");

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
        type: "references", // Different type — should return empty
      });

      expect(result.related).toHaveLength(0);
    });
  });

  // ── 5. No relationships ───────────────────────────────────────────────────

  describe("no relationships", () => {
    test("returns empty related array for a document with no relationships", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      expect(result.doc_id).toBe(docA);
      expect(result.related).toHaveLength(0);
    });
  });

  // ── 6. Source attribution (GRAPH-04) ──────────────────────────────────────

  describe("source attribution (GRAPH-04)", () => {
    test("relationship_source is 'manual' for manually created links", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await link(tmpDir, "test-proj", docA, docB, "references");

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      const relB = result.related.find((r) => r.doc_id === docB);
      expect(relB?.relationship_source).toBe("manual");
    });
  });

  // ── 7. Superseded documents excluded ─────────────────────────────────────

  describe("superseded documents excluded", () => {
    test("superseded related doc is excluded from results", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B (will be superseded)" });

      await link(tmpDir, "test-proj", docA, docB, "references");

      // Mark docB as superseded
      await markSuperseded(tmpDir, "test-proj", docB);

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      const relIds = result.related.map((r) => r.doc_id);
      expect(relIds).not.toContain(docB);
    });
  });

  // ── 8. Return shape ───────────────────────────────────────────────────────

  describe("return shape", () => {
    test("result has doc_id and related array", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      expect("doc_id" in result).toBe(true);
      expect("related" in result).toBe(true);
      expect(Array.isArray(result.related)).toBe(true);
    });

    test("each related doc has all expected fields", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await link(tmpDir, "test-proj", docA, docB, "implements");

      const result = await getRelatedDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docA,
      });

      expect(result.related.length).toBeGreaterThanOrEqual(1);
      const relB = result.related.find((r) => r.doc_id === docB);
      expect(relB).toBeDefined();
      if (relB) {
        expect(typeof relB.doc_id).toBe("string");
        expect(typeof relB.title).toBe("string");
        expect(typeof relB.category).toBe("string");
        expect(typeof relB.status).toBe("string");
        expect(typeof relB.relationship_type).toBe("string");
        expect(typeof relB.relationship_source).toBe("string");
        expect(relB.direction === "outgoing" || relB.direction === "incoming").toBe(true);
      }
    });
  });
});
