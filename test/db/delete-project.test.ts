import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { ProjectMetaRowSchema } from "../../src/db/schema.js";
import { deleteProject } from "../../src/tools/delete-project.js";
import { initProject } from "../../src/tools/init-project.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "delete-project-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function insertProjectMeta(dbPath: string, projectId: string): Promise<void> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("project_meta");
  const now = new Date().toISOString();
  await insertBatch(
    table,
    [
      {
        project_id: projectId,
        name: `Project ${projectId}`,
        created_at: now,
        updated_at: now,
        description: null,
        last_index_at: null,
        settings: null,
      },
    ],
    ProjectMetaRowSchema,
  );
}

describe("deleteProject", () => {
  test("deletes all rows for project_id across all tables", async () => {
    await initProject(tmpDir, "proj-to-delete");
    await insertProjectMeta(tmpDir, "proj-to-delete");

    await deleteProject(tmpDir, "proj-to-delete");

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("project_meta");
    const rows = await table.query().where("project_id = 'proj-to-delete'").toArray();
    expect(rows.length).toBe(0);
  });

  test("does not delete rows from other projects", async () => {
    await initProject(tmpDir, "proj-a");
    await insertProjectMeta(tmpDir, "proj-a");
    await insertProjectMeta(tmpDir, "proj-b");

    await deleteProject(tmpDir, "proj-a");

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("project_meta");
    const remaining = await table.query().where("project_id = 'proj-b'").toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].project_id).toBe("proj-b");
  });

  test("returns cleanup summary", async () => {
    await initProject(tmpDir, "proj");
    const result = await deleteProject(tmpDir, "proj");
    expect(result.tables_cleaned).toBe(8);
    expect(result.project_id).toBe("proj");
  });

  test("handles empty tables gracefully", async () => {
    await initProject(tmpDir, "proj");
    // No data inserted — just call delete
    const result = await deleteProject(tmpDir, "proj");
    expect(result.tables_cleaned).toBe(8);
    expect(result.project_id).toBe("proj");
  });

  test("validates project_id as slug format", async () => {
    await initProject(tmpDir, "valid-proj");
    await expect(deleteProject(tmpDir, "BAD SLUG!")).rejects.toThrow();
    await expect(deleteProject(tmpDir, "UPPERCASE")).rejects.toThrow();
    await expect(deleteProject(tmpDir, "has spaces")).rejects.toThrow();
  });
});
