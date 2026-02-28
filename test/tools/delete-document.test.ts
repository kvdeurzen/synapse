import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import {
  DocChunkRowSchema,
  DocumentRowSchema,
  RelationshipRowSchema,
} from "../../src/db/schema.js";
import { deleteDocument } from "../../src/tools/delete-document.js";
import { initProject } from "../../src/tools/init-project.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Insert a document row directly.
 */
async function insertDoc(
  dbPath: string,
  projectId: string,
  override: {
    doc_id?: string;
    title?: string;
    category?: string;
    status?: string;
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
        content: "# Test\n\nContent.",
        category: override.category ?? "plan",
        status: override.status ?? "active",
        version: override.version ?? 1,
        created_at: now,
        updated_at: now,
        tags: "",
        phase: null,
        priority: null,
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
 * Insert a doc_chunk row directly.
 */
async function insertChunk(
  dbPath: string,
  projectId: string,
  docId: string,
  chunkIndex = 0,
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const chunksTable = await db.openTable("doc_chunks");
  const now = new Date().toISOString();
  const chunk_id = `CHUNK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await insertBatch(
    chunksTable,
    [
      {
        chunk_id,
        project_id: projectId,
        doc_id: docId,
        chunk_index: chunkIndex,
        content: "Chunk content.",
        vector: null,
        header: "Chunk Header",
        version: 1,
        status: "active",
        token_count: 5,
        created_at: now,
      },
    ],
    DocChunkRowSchema,
  );

  return chunk_id;
}

/**
 * Insert a relationship row.
 */
async function insertRelationship(
  dbPath: string,
  projectId: string,
  fromId: string,
  toId: string,
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const relTable = await db.openTable("relationships");
  const now = new Date().toISOString();
  const relationship_id = `REL${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await insertBatch(
    relTable,
    [
      {
        relationship_id,
        project_id: projectId,
        from_id: fromId,
        to_id: toId,
        type: "references",
        source: "test",
        created_at: now,
        metadata: null,
      },
    ],
    RelationshipRowSchema,
  );

  return relationship_id;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "delete-doc-test-"));
  await initProject(tmpDir, "test-proj");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("deleteDocument", () => {
  // ── 1. Soft delete (DOC-07) ───────────────────────────────────────────────

  describe("soft delete (DOC-07)", () => {
    test("soft delete sets status=archived and leaves doc_chunks intact", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "plan",
      });
      await insertChunk(tmpDir, "test-proj", docId);

      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.action).toBe("archived");
        expect(result.doc_id).toBe(docId);
      }

      // Verify status is archived
      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const rows = await table.query().where(`doc_id = '${docId}'`).toArray();
      expect(rows[0].status).toBe("archived");

      // Verify doc_chunks still exist
      const chunksTable = await db.openTable("doc_chunks");
      const chunks = await chunksTable.query().where(`doc_id = '${docId}'`).toArray();
      expect(chunks.length).toBe(1);
    });

    test("soft delete creates activity_log with action=archive_document", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "plan",
      });

      await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
      });

      const db = await lancedb.connect(tmpDir);
      const activityTable = await db.openTable("activity_log");
      const logs = await activityTable.query().toArray();

      const archiveLogs = logs.filter(
        (l) => l.action === "archive_document" && l.target_id === docId,
      );
      expect(archiveLogs.length).toBe(1);
    });
  });

  // ── 2. Hard delete (DOC-07) ───────────────────────────────────────────────

  describe("hard delete (DOC-07)", () => {
    test("hard delete removes document row, doc_chunks, and relationships", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "plan",
      });
      await insertChunk(tmpDir, "test-proj", docId, 0);
      await insertChunk(tmpDir, "test-proj", docId, 1);

      // Create another doc for relationship target
      const otherDocId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "research",
      });
      await insertRelationship(tmpDir, "test-proj", docId, otherDocId);

      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        hard: true,
        force: true,
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.action).toBe("hard_deleted");
        expect(result.chunks_deleted).toBe(2);
        expect(result.relationships_deleted).toBe(1);
      }

      // Verify document row removed
      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("documents");
      const docRows = await table.query().where(`doc_id = '${docId}'`).toArray();
      expect(docRows.length).toBe(0);

      // Verify doc_chunks removed
      const chunksTable = await db.openTable("doc_chunks");
      const chunks = await chunksTable.query().where(`doc_id = '${docId}'`).toArray();
      expect(chunks.length).toBe(0);

      // Verify relationships removed
      const relTable = await db.openTable("relationships");
      const rels = await relTable
        .query()
        .where(`from_id = '${docId}' OR to_id = '${docId}'`)
        .toArray();
      expect(rels.length).toBe(0);
    });

    test("hard delete creates activity_log with action=hard_delete_document", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "plan",
      });

      await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        hard: true,
        force: true,
      });

      const db = await lancedb.connect(tmpDir);
      const activityTable = await db.openTable("activity_log");
      const logs = await activityTable.query().toArray();

      const deleteLogs = logs.filter(
        (l) => l.action === "hard_delete_document" && l.target_id === docId,
      );
      expect(deleteLogs.length).toBe(1);
    });
  });

  // ── 3. Existence check ─────────────────────────────────────────────────────

  describe("existence check", () => {
    test("returns DOC_NOT_FOUND for non-existent doc_id", async () => {
      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: "NONEXISTENTDOCID00000000X",
        force: true,
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("DOC_NOT_FOUND");
      }
    });
  });

  // ── 4. Carry-forward protection (DOC-10) ──────────────────────────────────

  describe("carry-forward protection (DOC-10)", () => {
    test("soft delete on glossary without force returns CARRY_FORWARD_PROTECTED", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "glossary",
      });

      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("CARRY_FORWARD_PROTECTED");
        expect(result.message).toContain("glossary");
      }
    });

    test("soft delete on glossary with force=true succeeds", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "glossary",
      });

      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        force: true,
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.action).toBe("archived");
      }
    });

    test("hard delete on code_pattern without force returns CARRY_FORWARD_PROTECTED", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "code_pattern",
      });

      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        hard: true,
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("CARRY_FORWARD_PROTECTED");
      }
    });
  });

  // ── 5. Hard delete cascade ─────────────────────────────────────────────────

  describe("hard delete cascade", () => {
    test("hard delete removes 3 chunks and 2 relationships (both directions)", async () => {
      const docId = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "plan",
      });

      // Insert 3 chunks
      await insertChunk(tmpDir, "test-proj", docId, 0);
      await insertChunk(tmpDir, "test-proj", docId, 1);
      await insertChunk(tmpDir, "test-proj", docId, 2);

      // Insert another doc for relationships
      const otherDoc1 = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "research",
      });
      const otherDoc2 = await insertDoc(tmpDir, "test-proj", {
        status: "active",
        category: "requirement",
      });

      // Create relationships: docId -> otherDoc1, otherDoc2 -> docId
      await insertRelationship(tmpDir, "test-proj", docId, otherDoc1);
      await insertRelationship(tmpDir, "test-proj", otherDoc2, docId);

      const result = await deleteDocument(tmpDir, "test-proj", {
        project_id: "test-proj",
        doc_id: docId,
        hard: true,
        force: true,
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.action).toBe("hard_deleted");
        expect(result.chunks_deleted).toBe(3);
        expect(result.relationships_deleted).toBe(2);
      }

      const db = await lancedb.connect(tmpDir);

      // All 3 chunks gone
      const chunksTable = await db.openTable("doc_chunks");
      const remainingChunks = await chunksTable.query().where(`doc_id = '${docId}'`).toArray();
      expect(remainingChunks.length).toBe(0);

      // Both relationships gone
      const relTable = await db.openTable("relationships");
      const remainingRels = await relTable
        .query()
        .where(`from_id = '${docId}' OR to_id = '${docId}'`)
        .toArray();
      expect(remainingRels.length).toBe(0);

      // Other docs still exist
      const table = await db.openTable("documents");
      const otherDoc1Rows = await table.query().where(`doc_id = '${otherDoc1}'`).toArray();
      expect(otherDoc1Rows.length).toBe(1);
    });
  });
});
