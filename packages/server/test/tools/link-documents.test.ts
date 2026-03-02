import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { DocumentRowSchema } from "../../src/db/schema.js";
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

async function getRelationships(dbPath: string, projectId: string) {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("relationships");
  return await table.query().where(`project_id = '${projectId}'`).toArray();
}

async function getActivityLogs(dbPath: string, projectId: string) {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("activity_log");
  return await table.query().where(`project_id = '${projectId}'`).toArray();
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "link-documents-test-"));
  await initProject(tmpDir, "test-proj");
  docCounter = 0;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("linkDocuments", () => {
  // ── 1. Basic link creation (GRAPH-01) ─────────────────────────────────────

  describe("basic link creation (GRAPH-01)", () => {
    test("creates a relationship between two documents with correct fields", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      const result = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "references",
        bidirectional: false,
      });

      expect("error" in result).toBe(false);
      if ("relationships_created" in result) {
        expect(result.relationships_created).toBe(1);
        expect(result.relationship_ids).toHaveLength(1);
      }

      // Verify the row in the database
      const rels = await getRelationships(tmpDir, "test-proj");
      const ourRel = rels.find((r) => r.from_id === docA && r.to_id === docB);
      expect(ourRel).toBeDefined();
      if (ourRel) {
        expect(ourRel.type).toBe("references");
        expect(ourRel.from_id).toBe(docA);
        expect(ourRel.to_id).toBe(docB);
        expect(ourRel.project_id).toBe("test-proj");
      }
    });

    test("sets source='manual' for manually created relationships (GRAPH-04)", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "implements",
        bidirectional: false,
      });

      const rels = await getRelationships(tmpDir, "test-proj");
      const ourRel = rels.find((r) => r.from_id === docA && r.to_id === docB);
      expect(ourRel?.source).toBe("manual");
    });

    test("logs activity after successful link creation", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "references",
        bidirectional: false,
      });

      const logs = await getActivityLogs(tmpDir, "test-proj");
      const linkLog = logs.find((l) => l.action === "link_documents");
      expect(linkLog).toBeDefined();
      expect(linkLog?.target_id).toBe(docA);
      expect(linkLog?.target_type).toBe("relationship");
    });
  });

  // ── 2. All relationship types ─────────────────────────────────────────────

  describe("all relationship types", () => {
    test("accepts all 7 valid relationship types", async () => {
      const types = [
        "implements",
        "depends_on",
        "supersedes",
        "references",
        "contradicts",
        "child_of",
        "related_to",
      ] as const;

      for (const relType of types) {
        const docA = await insertDoc(tmpDir, "test-proj", { title: `Doc A for ${relType}` });
        const docB = await insertDoc(tmpDir, "test-proj", { title: `Doc B for ${relType}` });

        const result = await linkDocuments(tmpDir, "test-proj", {
          project_id: "test-proj",
          from_id: docA,
          to_id: docB,
          type: relType,
          bidirectional: false,
        });

        expect("error" in result).toBe(false);
        if ("relationships_created" in result) {
          expect(result.relationships_created).toBe(1);
        }
      }
    });
  });

  // ── 3. Bidirectional relationships (GRAPH-02) ─────────────────────────────

  describe("bidirectional relationships (GRAPH-02)", () => {
    test("creates two rows when bidirectional=true", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      const result = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "related_to",
        bidirectional: true,
      });

      expect("error" in result).toBe(false);
      if ("relationships_created" in result) {
        expect(result.relationships_created).toBe(2);
        expect(result.relationship_ids).toHaveLength(2);
      }

      const rels = await getRelationships(tmpDir, "test-proj");
      const forward = rels.find((r) => r.from_id === docA && r.to_id === docB);
      const reverse = rels.find((r) => r.from_id === docB && r.to_id === docA);
      expect(forward).toBeDefined();
      expect(reverse).toBeDefined();
    });

    test("both directions have source='manual' (GRAPH-04)", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "related_to",
        bidirectional: true,
      });

      const rels = await getRelationships(tmpDir, "test-proj");
      for (const rel of rels) {
        expect(rel.source).toBe("manual");
      }
    });
  });

  // ── 4. Duplicate prevention (Research Pitfall 6) ─────────────────────────

  describe("duplicate prevention (Pitfall 6)", () => {
    test("second call with same from/to/type returns RELATIONSHIP_EXISTS error", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      // First link succeeds
      const first = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "references",
        bidirectional: false,
      });
      expect("relationships_created" in first).toBe(true);

      // Second link with same relationship returns error
      const second = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "references",
        bidirectional: false,
      });
      expect("error" in second).toBe(true);
      if ("error" in second) {
        expect(second.error).toBe("RELATIONSHIP_EXISTS");
      }

      // Only 1 relationship row was created
      const rels = await getRelationships(tmpDir, "test-proj");
      const matchingRels = rels.filter(
        (r) => r.from_id === docA && r.to_id === docB && r.type === "references",
      );
      expect(matchingRels).toHaveLength(1);
    });
  });

  // ── 5. Bidirectional dedup ────────────────────────────────────────────────

  describe("bidirectional dedup", () => {
    test("linking A->B bidirectional then B->A returns RELATIONSHIP_EXISTS", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      // A->B bidirectional creates A->B and B->A
      await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "related_to",
        bidirectional: true,
      });

      // Now try to create B->A explicitly — should fail since it exists
      const second = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docB,
        to_id: docA,
        type: "related_to",
        bidirectional: false,
      });
      expect("error" in second).toBe(true);
      if ("error" in second) {
        expect(second.error).toBe("RELATIONSHIP_EXISTS");
      }
    });
  });

  // ── 6. Document validation ────────────────────────────────────────────────

  describe("document validation", () => {
    test("returns DOC_NOT_FOUND when from_id does not exist", async () => {
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      const result = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: "NONEXISTENT_DOC_ID",
        to_id: docB,
        type: "references",
        bidirectional: false,
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("DOC_NOT_FOUND");
      }
    });

    test("returns DOC_NOT_FOUND when to_id does not exist", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });

      const result = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: "NONEXISTENT_DOC_ID",
        type: "references",
        bidirectional: false,
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("DOC_NOT_FOUND");
      }
    });
  });

  // ── 7. Return shape ───────────────────────────────────────────────────────

  describe("return shape", () => {
    test("successful result has relationships_created and relationship_ids", async () => {
      const docA = await insertDoc(tmpDir, "test-proj", { title: "Doc A" });
      const docB = await insertDoc(tmpDir, "test-proj", { title: "Doc B" });

      const result = await linkDocuments(tmpDir, "test-proj", {
        project_id: "test-proj",
        from_id: docA,
        to_id: docB,
        type: "depends_on",
        bidirectional: false,
      });

      expect("relationships_created" in result).toBe(true);
      if ("relationships_created" in result) {
        expect(typeof result.relationships_created).toBe("number");
        expect(Array.isArray(result.relationship_ids)).toBe(true);
        expect(result.relationship_ids.length).toBe(result.relationships_created);
      }
    });
  });
});
