import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { ACTIVITY_LOG_SCHEMA } from "../../src/db/schema.js";
import { logActivity } from "../../src/services/activity-log.js";

let tmpDir: string;
let db: lancedb.Connection;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "activity-log-test-"));
  db = await lancedb.connect(tmpDir);
  // Create the activity_log table with the correct schema
  await db.createEmptyTable("activity_log", ACTIVITY_LOG_SCHEMA, { existOk: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("logActivity", () => {
  test("inserts a valid row with all fields populated", async () => {
    await logActivity(db, "test-project", "document_created", "doc-123", "document", {
      title: "My Doc",
      version: 1,
    });

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(1);

    const row = rows[0];
    expect(row.project_id).toBe("test-project");
    expect(row.actor).toBe("agent");
    expect(row.action).toBe("document_created");
    expect(row.target_id).toBe("doc-123");
    expect(row.target_type).toBe("document");
  });

  test("log_id is a ULID-format string", async () => {
    await logActivity(db, "test-project", "document_created", null, null);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(1);

    const logId = rows[0].log_id as string;
    // ULID is 26 characters, uppercase base32
    expect(typeof logId).toBe("string");
    expect(logId.length).toBe(26);
    expect(logId).toMatch(/^[0-9A-Z]{26}$/);
  });

  test("created_at is a valid ISO datetime string", async () => {
    await logActivity(db, "test-project", "some_action", null, null);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    const createdAt = rows[0].created_at as string;
    expect(typeof createdAt).toBe("string");
    // ISO 8601 datetime should parse without error
    const parsed = new Date(createdAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  test("inserts row with null target_id and target_type", async () => {
    await logActivity(db, "test-project", "project_init", null, null);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].target_id).toBeNull();
    expect(rows[0].target_type).toBeNull();
  });

  test("inserts row with no metadata (undefined)", async () => {
    await logActivity(db, "test-project", "project_init", null, null);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].metadata).toBeNull();
  });

  test("serializes metadata object to JSON string", async () => {
    const metadataInput = { version: 2, previous_status: "draft" };
    await logActivity(db, "test-project", "document_updated", "doc-456", "document", metadataInput);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(1);

    const metadataStr = rows[0].metadata as string;
    expect(typeof metadataStr).toBe("string");
    const parsed = JSON.parse(metadataStr);
    expect(parsed.version).toBe(2);
    expect(parsed.previous_status).toBe("draft");
  });

  test("inserts multiple log entries for the same project", async () => {
    await logActivity(db, "test-project", "action_one", null, null);
    await logActivity(db, "test-project", "action_two", "doc-1", "document");
    await logActivity(db, "test-project", "action_three", "doc-2", "document");

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(3);

    const actions = rows.map((r) => r.action as string);
    expect(actions).toContain("action_one");
    expect(actions).toContain("action_two");
    expect(actions).toContain("action_three");
  });

  test("multiple entries are in chronological order (created_at increasing)", async () => {
    await logActivity(db, "test-project", "first_action", null, null);
    // Small delay to ensure distinct timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
    await logActivity(db, "test-project", "second_action", null, null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await logActivity(db, "test-project", "third_action", null, null);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows.length).toBe(3);

    // Sort by created_at to check ordering
    const sorted = [...rows].sort(
      (a, b) =>
        new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime(),
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].created_at as string).getTime();
      const curr = new Date(sorted[i].created_at as string).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  test("actor is always 'agent'", async () => {
    await logActivity(db, "test-project", "some_action", null, null);

    const table = await db.openTable("activity_log");
    const rows = await table.query().toArray();
    expect(rows[0].actor).toBe("agent");
  });
});
