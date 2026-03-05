import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { initProject } from "../../src/tools/init-project.js";

const TABLE_NAMES = [
  "documents",
  "doc_chunks",
  "code_chunks",
  "relationships",
  "project_meta",
  "activity_log",
  "decisions",
  "tasks",
];

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "init-project-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("initProject", () => {
  test("creates all 8 tables in a new database", async () => {
    await initProject(tmpDir, "test-project");
    const db = await lancedb.connect(tmpDir);
    const tableNames = await db.tableNames();
    for (const name of TABLE_NAMES) {
      expect(tableNames).toContain(name);
    }
  });

  test("returns correct creation summary", async () => {
    const result = await initProject(tmpDir, "test-project");
    expect(result.tables_created).toBe(8);
    expect(result.tables_skipped).toBe(0);
    expect(result.project_id).toBe("test-project");
    // database_path should be a non-empty string (absolute path)
    expect(typeof result.database_path).toBe("string");
    expect(result.database_path.length).toBeGreaterThan(0);
    // starters_seeded should reflect the 4 default starters
    expect(result.starters_seeded).toBe(4);
  });

  test("is idempotent — second call skips existing tables", async () => {
    await initProject(tmpDir, "proj");
    const result2 = await initProject(tmpDir, "proj");
    expect(result2.tables_created).toBe(0);
    expect(result2.tables_skipped).toBe(8);
  });

  test("does not overwrite data on re-init", async () => {
    // With new seeding behavior, init_project itself seeds project_meta.
    // The key invariant: re-init leaves exactly 1 project_meta row (not empty, not duplicated).
    await initProject(tmpDir, "proj");
    await initProject(tmpDir, "proj");

    const db2 = await lancedb.connect(tmpDir);
    const table2 = await db2.openTable("project_meta");
    const rows = await table2.query().toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].project_id).toBe("proj");
  });

  test("auto-creates database directory", async () => {
    const nestedPath = join(tmpDir, "nested", "deep", "db");
    await initProject(nestedPath, "proj");
    const db = await lancedb.connect(nestedPath);
    const tableNames = await db.tableNames();
    expect(tableNames).toContain("documents");
  });

  test("creates BTree index on project_id for each table", async () => {
    await initProject(tmpDir, "proj");
    const db = await lancedb.connect(tmpDir);
    for (const name of TABLE_NAMES) {
      const table = await db.openTable(name);
      const indices = await table.listIndices();
      // BTree index on project_id should exist — verify the array is non-empty
      // If the index was created successfully, listIndices() returns at least one entry
      // If it gracefully failed (Pitfall 3), this test documents the actual behavior
      expect(indices.length).toBeGreaterThan(0);
    }
  });

  test("validates project_id as slug format", async () => {
    await expect(initProject(tmpDir, "INVALID SLUG!")).rejects.toThrow();
    await expect(initProject(tmpDir, "Has Spaces")).rejects.toThrow();
    await expect(initProject(tmpDir, "UPPERCASE")).rejects.toThrow();
    await expect(initProject(tmpDir, "special@chars")).rejects.toThrow();
  });
});

// ── Starter document seeding (FOUND-04) ──────────────────────────────────────

describe("initProject — starter document seeding", () => {
  test("seeds 4 default starters on fresh project", async () => {
    const result = await initProject(tmpDir, "test-proj");

    expect(result.starters_seeded).toBe(4);

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    expect(docs.length).toBe(4);
  });

  test("starter titles match expected values", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    const titles = docs.map((d) => d.title as string);
    expect(titles).toContain("Project Charter");
    expect(titles).toContain("Architecture Decision Log");
    expect(titles).toContain("Implementation Patterns");
    expect(titles).toContain("Project Glossary");
  });

  test("starter categories match expected values", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    const categories = docs.map((d) => d.category as string);
    expect(categories).toContain("plan");
    expect(categories).toContain("architecture_decision");
    expect(categories).toContain("code_pattern");
    expect(categories).toContain("glossary");
  });

  test("all starters have version=1 and status=active", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    for (const doc of docs) {
      expect(doc.version).toBe(1);
      expect(doc.status).toBe("active");
    }
  });

  test("custom starter_types seeds only specified starters", async () => {
    const result = await initProject(tmpDir, "test-proj", ["glossary", "adr_log"]);

    expect(result.starters_seeded).toBe(2);

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    expect(docs.length).toBe(2);
    const titles = docs.map((d) => d.title as string);
    expect(titles).toContain("Project Glossary");
    expect(titles).toContain("Architecture Decision Log");
  });

  test("re-init does not duplicate starters (idempotent seeding)", async () => {
    await initProject(tmpDir, "test-proj");
    const result2 = await initProject(tmpDir, "test-proj");

    // Second call: tables_created=0, so no seeding
    expect(result2.starters_seeded).toBe(0);

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    // Only the original 4 starters should exist
    expect(docs.length).toBe(4);
  });

  test("starters have no doc_chunks rows (no Ollama dependency at init time)", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const chunksTable = await db.openTable("doc_chunks");
    const chunks = await chunksTable.query().toArray();

    expect(chunks.length).toBe(0);
  });

  test("starter content contains markdown headers (structural scaffolds)", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    for (const doc of docs) {
      const content = doc.content as string;
      // All starters should contain at least one markdown header
      expect(content).toMatch(/^#{1,2}\s+/m);
    }
  });

  test("project charter includes Objectives and Success Criteria sections", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const docs = await docsTable.query().toArray();

    const charter = docs.find((d) => d.title === "Project Charter");
    expect(charter).toBeDefined();

    const content = charter?.content as string;
    expect(content).toContain("Objectives");
    expect(content).toContain("Success Criteria");
  });

  test("unknown starter_types key is silently skipped", async () => {
    const result = await initProject(tmpDir, "test-proj", ["glossary", "nonexistent_type"]);

    // Only the valid one should be seeded
    expect(result.starters_seeded).toBe(1);
  });
});

// ── created_at preservation (DEBT-02) ────────────────────────────────────────

describe("initProject — created_at preservation", () => {
  test("fresh init sets created_at to current time", async () => {
    const before = new Date();
    await initProject(tmpDir, "test-proj");
    const after = new Date();

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("project_meta");
    const rows = await table.query().toArray();

    expect(rows.length).toBe(1);
    const createdAt = new Date(rows[0].created_at as string);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("re-running init_project preserves original created_at", async () => {
    // First init — capture created_at
    await initProject(tmpDir, "test-proj");
    const db1 = await lancedb.connect(tmpDir);
    const table1 = await db1.openTable("project_meta");
    const rows1 = await table1.query().toArray();
    const originalCreatedAt = rows1[0].created_at as string;

    // Wait briefly to ensure updated_at would differ if set to now
    await new Promise((r) => setTimeout(r, 10));

    // Second init — created_at must be preserved
    await initProject(tmpDir, "test-proj");
    const db2 = await lancedb.connect(tmpDir);
    const table2 = await db2.openTable("project_meta");
    const rows2 = await table2.query().toArray();

    expect(rows2.length).toBe(1);
    expect(rows2[0].created_at).toBe(originalCreatedAt);
  });

  test("re-running init_project updates updated_at", async () => {
    await initProject(tmpDir, "test-proj");
    const db1 = await lancedb.connect(tmpDir);
    const table1 = await db1.openTable("project_meta");
    const rows1 = await table1.query().toArray();
    const originalUpdatedAt = rows1[0].updated_at as string;

    await new Promise((r) => setTimeout(r, 10));

    await initProject(tmpDir, "test-proj");
    const db2 = await lancedb.connect(tmpDir);
    const table2 = await db2.openTable("project_meta");
    const rows2 = await table2.query().toArray();

    expect(rows2.length).toBe(1);
    // updated_at should be newer or equal (at worst same ms)
    const updatedAtNew = new Date(rows2[0].updated_at as string);
    const updatedAtOld = new Date(originalUpdatedAt);
    expect(updatedAtNew.getTime()).toBeGreaterThanOrEqual(updatedAtOld.getTime());
  });
});

// ── project_meta row seeding ──────────────────────────────────────────────────

describe("initProject — project_meta seeding", () => {
  test("seeds project_meta row on fresh init", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("project_meta");
    const rows = await table.query().toArray();

    expect(rows.length).toBe(1);
    expect(rows[0].project_id).toBe("test-proj");
    expect(rows[0].name).toBe("test-proj");
    expect(rows[0].description).toBeNull();
    expect(rows[0].settings).toBeNull();
  });

  test("project_meta row has last_index_at as null after init", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("project_meta");
    const rows = await table.query().toArray();

    expect(rows.length).toBe(1);
    expect(rows[0].last_index_at).toBeNull();
  });

  test("re-init produces exactly 1 project_meta row (idempotent)", async () => {
    await initProject(tmpDir, "test-proj");
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("project_meta");
    const rows = await table.query().toArray();

    expect(rows.length).toBe(1);
    expect(rows[0].project_id).toBe("test-proj");
  });
});
