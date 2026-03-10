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
  TASKS_SCHEMA,
  TaskRowSchema,
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
  test("TABLE_NAMES has exactly 8 entries", () => {
    expect(TABLE_NAMES.length).toBe(8);
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

  test("TABLE_NAMES includes 'tasks'", () => {
    expect(TABLE_NAMES).toContain("tasks");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. TASKS_SCHEMA tests (Phase 11)
// ────────────────────────────────────────────────────────────────────────────

describe("TASKS_SCHEMA Arrow schema", () => {
  test("tasks schema has 23 fields", () => {
    expect(TASKS_SCHEMA.fields.length).toBe(23);
  });

  test("task_id is non-null in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "task_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("parent_id is nullable in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "parent_id");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("is_blocked is non-null Bool in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "is_blocked");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
    // Bool type check — type name should include "Bool"
    expect(field?.type.toString()).toContain("Bool");
  });

  test("is_cancelled is non-null Bool in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "is_cancelled");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
    expect(field?.type.toString()).toContain("Bool");
  });

  test("vector field is nullable in tasks schema (768-dim)", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "vector");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("depth field is non-null Int32 in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "depth");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(false);
  });

  test("context_doc_ids is nullable Utf8 in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "context_doc_ids");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("context_decision_ids is nullable Utf8 in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "context_decision_ids");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("spec is nullable Utf8 in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "spec");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });

  test("output_doc_ids is nullable Utf8 in tasks schema", () => {
    const field = TASKS_SCHEMA.fields.find((f) => f.name === "output_doc_ids");
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
  });
});

describe("Zod TaskRowSchema validation", () => {
  const nowIso2 = new Date().toISOString();
  const validTask = {
    task_id: ulid(),
    project_id: "test-project",
    parent_id: null,
    root_id: ulid(),
    depth: 0,
    title: "Test Epic",
    description: "An epic task",
    status: "pending" as const,
    is_blocked: false,
    is_cancelled: false,
    block_reason: null,
    priority: null,
    assigned_agent: null,
    estimated_effort: null,
    tags: "",
    phase: null,
    context_doc_ids: null,
    context_decision_ids: null,
    spec: null,
    output_doc_ids: null,
    created_at: nowIso2,
    updated_at: nowIso2,
    vector: null,
  };

  test("valid task row passes", () => {
    const result = TaskRowSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  test("depth 0-3 passes", () => {
    for (const depth of [0, 1, 2, 3]) {
      const result = TaskRowSchema.safeParse({ ...validTask, depth });
      expect(result.success).toBe(true);
    }
  });

  test("depth 4 fails", () => {
    const result = TaskRowSchema.safeParse({ ...validTask, depth: 4 });
    expect(result.success).toBe(false);
  });

  test("depth -1 fails", () => {
    const result = TaskRowSchema.safeParse({ ...validTask, depth: -1 });
    expect(result.success).toBe(false);
  });

  test("valid status values pass", () => {
    for (const status of ["pending", "ready", "in_progress", "review", "done"] as const) {
      const result = TaskRowSchema.safeParse({ ...validTask, status });
      expect(result.success).toBe(true);
    }
  });

  test("invalid status fails", () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
    const result = TaskRowSchema.safeParse({ ...validTask, status: "invalid" as any });
    expect(result.success).toBe(false);
  });

  test("is_blocked boolean validation", () => {
    expect(TaskRowSchema.safeParse({ ...validTask, is_blocked: true }).success).toBe(true);
    expect(TaskRowSchema.safeParse({ ...validTask, is_blocked: false }).success).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
    expect(TaskRowSchema.safeParse({ ...validTask, is_blocked: "true" as any }).success).toBe(
      false,
    );
  });

  test("valid priority values pass", () => {
    for (const priority of ["critical", "high", "medium", "low"] as const) {
      const result = TaskRowSchema.safeParse({ ...validTask, priority });
      expect(result.success).toBe(true);
    }
  });

  test("null priority passes (optional)", () => {
    const result = TaskRowSchema.safeParse({ ...validTask, priority: null });
    expect(result.success).toBe(true);
  });

  test("invalid priority fails", () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
    const result = TaskRowSchema.safeParse({ ...validTask, priority: "urgent" as any });
    expect(result.success).toBe(false);
  });

  test("valid assigned_agent role passes", () => {
    const result = TaskRowSchema.safeParse({ ...validTask, assigned_agent: "executor" });
    expect(result.success).toBe(true);
  });

  test("null assigned_agent passes (optional)", () => {
    const result = TaskRowSchema.safeParse({ ...validTask, assigned_agent: null });
    expect(result.success).toBe(true);
  });

  test("invalid assigned_agent role fails", () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
    const result = TaskRowSchema.safeParse({ ...validTask, assigned_agent: "superman" as any });
    expect(result.success).toBe(false);
  });

  test("vector null passes (nullable)", () => {
    const result = TaskRowSchema.safeParse({ ...validTask, vector: null });
    expect(result.success).toBe(true);
  });

  test("vector 768-dim array passes", () => {
    const result = TaskRowSchema.safeParse({
      ...validTask,
      vector: Array.from({ length: 768 }, () => 0.1),
    });
    expect(result.success).toBe(true);
  });

  test("vector wrong dimension fails", () => {
    const result = TaskRowSchema.safeParse({
      ...validTask,
      vector: Array.from({ length: 100 }, () => 0.1),
    });
    expect(result.success).toBe(false);
  });
});
