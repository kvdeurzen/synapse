import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { Schema } from "apache-arrow";
import { ulid } from "ulidx";
import { insertBatch } from "../../src/db/batch.js";
import {
  ACTIVITY_LOG_SCHEMA,
  ActivityLogRowSchema,
  CODE_CHUNKS_SCHEMA,
  CodeChunkRowSchema,
  DOCUMENTS_SCHEMA,
  DocumentRowSchema,
  PROJECT_META_SCHEMA,
  ProjectMetaRowSchema,
  RELATIONSHIPS_SCHEMA,
  RelationshipRowSchema,
  TABLE_NAMES,
  TABLE_SCHEMAS,
} from "../../src/db/schema.js";

// ────────────────────────────────────────────────────────────────────────────
// 1. Arrow schema field count tests
// ────────────────────────────────────────────────────────────────────────────

describe("Arrow schema field counts", () => {
  test("documents schema has 15 fields", () => {
    expect(DOCUMENTS_SCHEMA.fields.length).toBe(15);
  });

  test("code_chunks schema has 16 fields (including vector)", () => {
    expect(CODE_CHUNKS_SCHEMA.fields.length).toBe(16);
  });

  test("relationships schema has 8 fields", () => {
    expect(RELATIONSHIPS_SCHEMA.fields.length).toBe(8);
  });

  test("project_meta schema has 7 fields", () => {
    expect(PROJECT_META_SCHEMA.fields.length).toBe(7);
  });

  test("activity_log schema has 8 fields", () => {
    expect(ACTIVITY_LOG_SCHEMA.fields.length).toBe(8);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Arrow schema nullability tests
// ────────────────────────────────────────────────────────────────────────────

describe("Arrow schema nullability", () => {
  test("project_id is non-null in documents schema", () => {
    const field = DOCUMENTS_SCHEMA.fields.find((f) => f.name === "project_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("project_id is non-null in code_chunks schema", () => {
    const field = CODE_CHUNKS_SCHEMA.fields.find((f) => f.name === "project_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("project_id is non-null in relationships schema", () => {
    const field = RELATIONSHIPS_SCHEMA.fields.find((f) => f.name === "project_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("project_id is non-null in project_meta schema", () => {
    const field = PROJECT_META_SCHEMA.fields.find((f) => f.name === "project_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("project_id is non-null in activity_log schema", () => {
    const field = ACTIVITY_LOG_SCHEMA.fields.find((f) => f.name === "project_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("parent_id is nullable in documents schema", () => {
    const field = DOCUMENTS_SCHEMA.fields.find((f) => f.name === "parent_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("depth is nullable in documents schema", () => {
    const field = DOCUMENTS_SCHEMA.fields.find((f) => f.name === "depth");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("decision_type is nullable in documents schema", () => {
    const field = DOCUMENTS_SCHEMA.fields.find((f) => f.name === "decision_type");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("vector field exists in code_chunks and is non-null", () => {
    const field = CODE_CHUNKS_SCHEMA.fields.find((f) => f.name === "vector");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Zod schema validation tests
// ────────────────────────────────────────────────────────────────────────────

const nowIso = new Date().toISOString();
const testVector = Array.from({ length: 768 }, () => 0.1);

describe("Zod documents schema", () => {
  const validDoc = {
    doc_id: ulid(),
    project_id: "test-project",
    title: "Test Document",
    content: "Some content",
    category: "decision",
    status: "published",
    version: 1,
    created_at: nowIso,
    updated_at: nowIso,
    tags: "[]",
    phase: null,
    priority: null,
    parent_id: null,
    depth: null,
    decision_type: null,
  };

  test("valid document row passes", () => {
    const result = DocumentRowSchema.safeParse(validDoc);
    expect(result.success).toBe(true);
  });

  test("missing doc_id fails", () => {
    const { doc_id: _doc_id, ...rest } = validDoc;
    const result = DocumentRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("empty project_id fails", () => {
    const result = DocumentRowSchema.safeParse({ ...validDoc, project_id: "" });
    expect(result.success).toBe(false);
  });
});

describe("Zod code_chunks schema", () => {
  const validChunk = {
    chunk_id: ulid(),
    project_id: "test-project",
    doc_id: ulid(),
    file_path: "/src/index.ts",
    symbol_name: null,
    symbol_type: null,
    scope_chain: null,
    content: "function foo() {}",
    language: "typescript",
    imports: "[]",
    exports: "[]",
    start_line: null,
    end_line: null,
    created_at: nowIso,
    file_hash: null,
    vector: testVector,
  };

  test("valid code chunk row passes", () => {
    const result = CodeChunkRowSchema.safeParse(validChunk);
    expect(result.success).toBe(true);
  });

  test("missing chunk_id fails", () => {
    const { chunk_id: _chunk_id, ...rest } = validChunk;
    const result = CodeChunkRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("missing project_id fails", () => {
    const { project_id: _project_id, ...rest } = validChunk;
    const result = CodeChunkRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("Zod relationships schema", () => {
  const validRel = {
    relationship_id: ulid(),
    project_id: "test-project",
    from_id: ulid(),
    to_id: ulid(),
    type: "implements",
    source: "manual",
    created_at: nowIso,
    metadata: null,
  };

  test("valid relationship row passes", () => {
    const result = RelationshipRowSchema.safeParse(validRel);
    expect(result.success).toBe(true);
  });

  test("missing relationship_id fails", () => {
    const { relationship_id: _relationship_id, ...rest } = validRel;
    const result = RelationshipRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("Zod project_meta schema", () => {
  const validMeta = {
    project_id: "test-project",
    name: "Test Project",
    created_at: nowIso,
    updated_at: nowIso,
    description: null,
    last_index_at: null,
    settings: null,
  };

  test("valid project meta row passes", () => {
    const result = ProjectMetaRowSchema.safeParse(validMeta);
    expect(result.success).toBe(true);
  });

  test("missing name fails", () => {
    const { name: _name, ...rest } = validMeta;
    const result = ProjectMetaRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("Zod activity_log schema", () => {
  const validLog = {
    log_id: ulid(),
    project_id: "test-project",
    actor: "mcp-tool",
    action: "doc_created",
    target_id: null,
    target_type: null,
    metadata: null,
    created_at: nowIso,
  };

  test("valid activity log row passes", () => {
    const result = ActivityLogRowSchema.safeParse(validLog);
    expect(result.success).toBe(true);
  });

  test("missing actor fails", () => {
    const { actor: _actor, ...rest } = validLog;
    const result = ActivityLogRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Zod documents schema v2 forward-compat fields
// ────────────────────────────────────────────────────────────────────────────

describe("Zod documents v2 forward-compat fields accept null", () => {
  const base = {
    doc_id: ulid(),
    project_id: "test-project",
    title: "Doc",
    content: "Content",
    category: "adr",
    status: "active",
    version: 1,
    created_at: nowIso,
    updated_at: nowIso,
    tags: "[]",
    phase: null,
    priority: null,
    parent_id: null,
    depth: null,
    decision_type: null,
  };

  test("parent_id: null passes", () => {
    const result = DocumentRowSchema.safeParse({ ...base, parent_id: null });
    expect(result.success).toBe(true);
  });

  test("depth: null passes", () => {
    const result = DocumentRowSchema.safeParse({ ...base, depth: null });
    expect(result.success).toBe(true);
  });

  test("decision_type: null passes", () => {
    const result = DocumentRowSchema.safeParse({ ...base, decision_type: null });
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Zod code_chunks vector dimension validation
// ────────────────────────────────────────────────────────────────────────────

describe("Zod code_chunks vector dimension enforcement", () => {
  const baseChunk = {
    chunk_id: ulid(),
    project_id: "test-project",
    doc_id: ulid(),
    file_path: "/src/index.ts",
    symbol_name: null,
    symbol_type: null,
    scope_chain: null,
    content: "function foo() {}",
    language: null,
    imports: "[]",
    exports: "[]",
    start_line: null,
    end_line: null,
    created_at: nowIso,
    file_hash: null,
  };

  test("vector of 768 numbers passes", () => {
    const result = CodeChunkRowSchema.safeParse({
      ...baseChunk,
      vector: Array.from({ length: 768 }, () => 0.5),
    });
    expect(result.success).toBe(true);
  });

  test("vector of 767 numbers fails (wrong dimension)", () => {
    const result = CodeChunkRowSchema.safeParse({
      ...baseChunk,
      vector: Array.from({ length: 767 }, () => 0.5),
    });
    expect(result.success).toBe(false);
  });

  test("vector of 769 numbers fails (wrong dimension)", () => {
    const result = CodeChunkRowSchema.safeParse({
      ...baseChunk,
      vector: Array.from({ length: 769 }, () => 0.5),
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. insertBatch validation failure test
// ────────────────────────────────────────────────────────────────────────────

describe("insertBatch validation failure", () => {
  test("throws before writing when row is invalid", async () => {
    const tmpDir = join(tmpdir(), `lancedb-test-${Date.now()}`);
    const db = await lancedb.connect(tmpDir);
    const table = await db.createEmptyTable("test_docs", DOCUMENTS_SCHEMA);

    const invalidRow = {
      // missing doc_id
      project_id: "test-project",
      title: "Title",
      content: "Content",
      category: "adr",
      status: "active",
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
      tags: "[]",
      phase: null,
      priority: null,
      parent_id: null,
      depth: null,
      decision_type: null,
    };

    let error: Error | null = null;
    try {
      await insertBatch(
        table,
        [invalidRow as Parameters<typeof insertBatch>[1][0]],
        DocumentRowSchema,
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("[insertBatch]");
    expect(error?.message).toContain("Row 0");
    expect(error?.message).toContain("test_docs");

    // Verify no data was written
    const rowCount = await table.countRows();
    expect(rowCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. insertBatch empty array test
// ────────────────────────────────────────────────────────────────────────────

describe("insertBatch empty array", () => {
  test("returns without error for empty array", async () => {
    const tmpDir = join(tmpdir(), `lancedb-test-empty-${Date.now()}`);
    const db = await lancedb.connect(tmpDir);
    const table = await db.createEmptyTable("test_empty", DOCUMENTS_SCHEMA);

    // Should not throw
    await insertBatch(table, [], DocumentRowSchema);
    const rowCount = await table.countRows();
    expect(rowCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. TABLE_NAMES and TABLE_SCHEMAS tests
// ────────────────────────────────────────────────────────────────────────────

describe("TABLE_NAMES and TABLE_SCHEMAS registry", () => {
  test("TABLE_NAMES has exactly 7 entries", () => {
    expect(TABLE_NAMES.length).toBe(7);
  });

  test("TABLE_SCHEMAS has entry for each TABLE_NAME", () => {
    for (const name of TABLE_NAMES) {
      expect(TABLE_SCHEMAS[name]).toBeDefined();
    }
  });

  test("all TABLE_SCHEMAS entries are Schema instances", () => {
    for (const name of TABLE_NAMES) {
      expect(TABLE_SCHEMAS[name]).toBeInstanceOf(Schema);
    }
  });
});
