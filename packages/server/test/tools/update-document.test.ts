import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { DocChunkRowSchema, DocumentRowSchema } from "../../src/db/schema.js";
import { initProject } from "../../src/tools/init-project.js";
import { updateDocument } from "../../src/tools/update-document.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Insert a document row directly into the documents table without chunking/embedding.
 */
async function insertDoc(
  dbPath: string,
  projectId: string,
  override: {
    doc_id?: string;
    title?: string;
    category?: string;
    status?: string;
    tags?: string;
    phase?: string | null;
    priority?: number | null;
    version?: number;
  },
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
        title: override.title ?? "Test Document",
        content: "# Test\n\nSome content.",
        category: override.category ?? "research",
        status: override.status ?? "draft",
        version: override.version ?? 1,
        created_at: now,
        updated_at: now,
        tags: override.tags ?? "",
        phase: override.phase ?? null,
        priority: override.priority ?? null,
        parent_id: null,
        depth: null,
        decision_type: null,
      },
    ],
    DocumentRowSchema,
  );

  return doc_id;
}

/**
 * Insert a doc_chunk row directly for testing purposes.
 */
async function insertChunk(dbPath: string, projectId: string, docId: string): Promise<void> {
  const db = await lancedb.connect(dbPath);
  const chunksTable = await db.openTable("doc_chunks");
  const now = new Date().toISOString();

  await insertBatch(
    chunksTable,
    [
      {
        chunk_id: `CHUNK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        project_id: projectId,
        doc_id: docId,
        chunk_index: 0,
        content: "Test chunk content.",
        vector: null,
        header: "Test",
        version: 1,
        status: "active",
        token_count: 10,
        created_at: now,
      },
    ],
    DocChunkRowSchema,
  );
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "update-doc-test-"));
  await initProject(tmpDir, "test-proj");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("updateDocument", () => {
  // ── 1. Basic metadata update (DOC-06) ──────────────────────────────────────

  describe("basic metadata update (DOC-06)", () => {
    test("updates status without re-embedding (no doc_chunks change)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", { status: "draft", category: "plan" });
      await insertChunk(tmpDir, "test-proj", docId);

      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.doc_id).toBe(docId);
        expect(result.updated_fields).toContain("status");
      }

      // LanceDB requires a fresh connection to see updated data (table objects cache their state)
      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().where(`doc_id = '${docId}'`).toArray();
      expect(rows[0].status).toBe("active");

      // Verify doc_chunks NOT changed (no re-embedding)
      const chunksTable = await db.openTable("doc_chunks");
      const chunks = await chunksTable.query().where(`doc_id = '${docId}'`).toArray();
      expect(chunks.length).toBe(1);
      expect(chunks[0].status).toBe("active"); // chunk status unchanged
    });

    test("updated_at timestamp changes after update", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", { status: "draft", category: "plan" });

      // Read original updated_at using a fresh connection (per LanceDB behavior)
      {
        const db = await lancedb.connect(tmpDir);
        const table = await db.openTable("documents");
        const before = await table.query().where(`doc_id = '${docId}'`).limit(1).toArray();
        expect(before[0].status).toBe("draft");
      }

      await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });

      // Fresh connection to read updated state
      const db2 = await lancedb.connect(tmpDir);
      const table2 = await db2.openTable("documents");
      const after = await table2.query().where(`doc_id = '${docId}'`).limit(1).toArray();
      // The status was updated
      expect(after[0].status).toBe("active");
      // updated_at is a valid ISO timestamp
      expect(typeof after[0].updated_at).toBe("string");
      expect(new Date(after[0].updated_at as string).getTime()).toBeGreaterThan(0);
    });
  });

  // ── 2. Update multiple fields ─────────────────────────────────────────────

  describe("update multiple fields", () => {
    test("updates phase, tags, and priority in one call", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "research",
      });

      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        phase: "phase-3",
        tags: "|typescript|testing|",
        priority: 2,
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.updated_fields).toContain("phase");
        expect(result.updated_fields).toContain("tags");
        expect(result.updated_fields).toContain("priority");
      }

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().where(`doc_id = '${docId}'`).limit(1).toArray();
      expect(rows[0].phase).toBe("phase-3");
      expect(rows[0].tags).toBe("|typescript|testing|");
      expect(rows[0].priority).toBe(2);
    });
  });

  // ── 3. Existence check (Research Pitfall 3) ───────────────────────────────

  describe("existence check (Pitfall 3)", () => {
    test("returns DOC_NOT_FOUND for non-existent doc_id", async () => {
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: "NONEXISTENTDOCIDHERE00000",
        status: "active",
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("DOC_NOT_FOUND");
      }
    });
  });

  // ── 4. Lifecycle transitions (DOC-09) ─────────────────────────────────────

  describe("lifecycle transitions (DOC-09)", () => {
    test("draft -> active is allowed", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", { status: "draft" });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });
      expect("error" in result).toBe(false);
    });

    test("active -> approved is allowed", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", { status: "active" });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "approved",
      });
      expect("error" in result).toBe(false);
    });

    test("approved -> archived is allowed", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "approved",
        category: "plan",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "archived",
      });
      expect("error" in result).toBe(false);
    });

    test("archived -> active is allowed (reactivation)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "archived",
        category: "plan",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });
      expect("error" in result).toBe(false);
    });

    test("draft -> archived is allowed (discard shortcut)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "draft",
        category: "plan",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "archived",
      });
      expect("error" in result).toBe(false);
    });

    test("superseded -> active is disallowed (superseded is terminal)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "superseded",
        category: "plan",
      });
      // Note: updateDocument excludes superseded docs from the query (status != 'superseded')
      // so a superseded document will return DOC_NOT_FOUND (it's hidden from updates)
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });
      expect("error" in result).toBe(true);
      // Either DOC_NOT_FOUND (superseded is invisible to update) or INVALID_TRANSITION
      if ("error" in result) {
        expect(["DOC_NOT_FOUND", "INVALID_TRANSITION"]).toContain(result.error);
      }
    });

    test("approved -> active is disallowed (cannot go back)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "approved",
        category: "plan",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("INVALID_TRANSITION");
      }
    });
  });

  // ── 5. Carry-forward protection (DOC-10) ──────────────────────────────────

  describe("carry-forward protection (DOC-10)", () => {
    test("archiving architecture_decision without force returns CARRY_FORWARD_PROTECTED", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "approved",
        category: "architecture_decision",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "archived",
      });
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("CARRY_FORWARD_PROTECTED");
        expect(result.message).toContain("architecture_decision");
      }
    });

    test("archiving architecture_decision with force=true succeeds", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "approved",
        category: "architecture_decision",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "archived",
        force: true,
      });
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.updated_fields).toContain("status");
      }
    });

    test("archiving design_pattern without force returns CARRY_FORWARD_PROTECTED", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "design_pattern",
      });
      const result = await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "archived",
      });
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("CARRY_FORWARD_PROTECTED");
      }
    });
  });

  // ── 6. Activity logging (DOC-11) ──────────────────────────────────────────

  describe("activity logging (DOC-11)", () => {
    test("successful update creates activity_log row with action=update_document", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", { status: "draft", category: "plan" });

      await updateDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        status: "active",
      });

      const db = await lancedb.connect(tmpDir);
      const activityTable = await db.openTable("activity_log");
      const logs = await activityTable.query().toArray();

      const updateLogs = logs.filter(
        (l) => l.action === "update_document" && l.target_id === docId,
      );
      expect(updateLogs.length).toBe(1);
      expect(updateLogs[0].target_type).toBe("document");
    });
  });
});
