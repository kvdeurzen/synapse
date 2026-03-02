import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { ActivityLogRowSchema, DocumentRowSchema } from "../../src/db/schema.js";
import { initProject } from "../../src/tools/init-project.js";
import { projectOverview } from "../../src/tools/project-overview.js";

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

async function insertActivityLog(
  dbPath: string,
  projectId: string,
  action: string,
  createdAt: string,
  targetId: string | null = null,
): Promise<void> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("activity_log");
  const log_id = `LOG${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await insertBatch(
    table,
    [
      {
        log_id,
        project_id: projectId,
        actor: "agent",
        action,
        target_id: targetId,
        target_type: targetId ? "document" : null,
        metadata: null,
        created_at: createdAt,
      },
    ],
    ActivityLogRowSchema,
  );
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "project-overview-test-"));
  await initProject(tmpDir, "test-proj");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("projectOverview", () => {
  // ── 1. Empty project (just starters) ─────────────────────────────────────

  describe("empty project (just starter documents)", () => {
    test("total_documents matches starter count (4)", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      // initProject seeds 4 starter documents
      expect(result.total_documents).toBe(4);
    });

    test("counts_by_category has plan, architecture_decision, code_pattern, glossary starters", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      // Starters include one of each of these categories
      expect(result.counts_by_category.plan).toBeGreaterThanOrEqual(1);
      expect(result.counts_by_category.architecture_decision).toBeGreaterThanOrEqual(1);
      expect(result.counts_by_category.code_pattern).toBeGreaterThanOrEqual(1);
      expect(result.counts_by_category.glossary).toBeGreaterThanOrEqual(1);
    });

    test("recent_activity is empty on fresh project (init_project does not log to activity_log)", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.recent_activity).toEqual([]);
    });

    test("result has all expected fields", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.project_id).toBe("test-proj");
      expect(typeof result.total_documents).toBe("number");
      expect(typeof result.counts_by_category).toBe("object");
      expect(typeof result.counts_by_status).toBe("object");
      expect(Array.isArray(result.recent_activity)).toBe(true);
      expect(Array.isArray(result.key_documents)).toBe(true);
    });
  });

  // ── 2. Counts by category ─────────────────────────────────────────────────

  describe("counts_by_category", () => {
    test("counts reflect inserted documents per category", async () => {
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "active" });
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "active" });
      await insertDoc(tmpDir, "test-proj", { category: "plan", status: "active" });

      const result = await projectOverview(tmpDir, "test-proj");

      // 2 new research docs
      expect(result.counts_by_category.research).toBe(2);
      // 1 new plan + 1 starter plan = 2
      expect(result.counts_by_category.plan).toBeGreaterThanOrEqual(2);
    });

    test("only includes categories with count > 0", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      // No task_spec, requirement, etc. in starters — should not appear
      for (const [, count] of Object.entries(result.counts_by_category)) {
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  // ── 3. Counts by status ───────────────────────────────────────────────────

  describe("counts_by_status", () => {
    test("counts reflect inserted documents per status", async () => {
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "draft" });
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "draft" });
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "approved" });

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.counts_by_status.draft).toBeGreaterThanOrEqual(2);
      expect(result.counts_by_status.approved).toBeGreaterThanOrEqual(1);
    });

    test("superseded is excluded from counts_by_status", async () => {
      await insertDoc(tmpDir, "test-proj", { category: "research", status: "superseded" });

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.counts_by_status.superseded).toBeUndefined();
    });

    test("only includes statuses with count > 0", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      for (const [, count] of Object.entries(result.counts_by_status)) {
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  // ── 4. Superseded excluded ─────────────────────────────────────────────────

  describe("superseded excluded from all counts", () => {
    test("superseded doc is NOT counted in total_documents", async () => {
      const beforeResult = await projectOverview(tmpDir, "test-proj");
      const beforeTotal = beforeResult.total_documents;

      await insertDoc(tmpDir, "test-proj", { category: "research", status: "superseded" });

      const afterResult = await projectOverview(tmpDir, "test-proj");

      // Total should not increase — superseded is excluded
      expect(afterResult.total_documents).toBe(beforeTotal);
    });

    test("superseded doc is NOT counted in counts_by_category", async () => {
      const beforeResult = await projectOverview(tmpDir, "test-proj");
      const beforeResearchCount = beforeResult.counts_by_category.research ?? 0;

      await insertDoc(tmpDir, "test-proj", { category: "research", status: "superseded" });

      const afterResult = await projectOverview(tmpDir, "test-proj");
      const afterResearchCount = afterResult.counts_by_category.research ?? 0;

      // research count should not increase
      expect(afterResearchCount).toBe(beforeResearchCount);
    });
  });

  // ── 5. Recent activity ────────────────────────────────────────────────────

  describe("recent_activity", () => {
    test("returns last 5 activity entries ordered by created_at desc", async () => {
      // Insert 7 activity log entries with distinct timestamps
      const timestamps = [
        "2026-01-01T10:00:00.000Z",
        "2026-01-02T10:00:00.000Z",
        "2026-01-03T10:00:00.000Z",
        "2026-01-04T10:00:00.000Z",
        "2026-01-05T10:00:00.000Z",
        "2026-01-06T10:00:00.000Z",
        "2026-01-07T10:00:00.000Z",
      ];

      for (let i = 0; i < timestamps.length; i++) {
        await insertActivityLog(tmpDir, "test-proj", `action_${i + 1}`, timestamps[i]);
      }

      const result = await projectOverview(tmpDir, "test-proj");

      // Should return exactly 5 entries
      expect(result.recent_activity.length).toBe(5);

      // Should be sorted by created_at descending (most recent first)
      for (let i = 0; i < result.recent_activity.length - 1; i++) {
        expect(
          result.recent_activity[i].created_at >= result.recent_activity[i + 1].created_at,
        ).toBe(true);
      }

      // First item should be the most recent (action_7 from 2026-01-07)
      expect(result.recent_activity[0].action).toBe("action_7");
    });

    test("recent_activity entries have action, target_id, target_type, created_at fields", async () => {
      await insertActivityLog(
        tmpDir,
        "test-proj",
        "store_document",
        "2026-01-05T10:00:00.000Z",
        "doc123",
      );

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.recent_activity.length).toBeGreaterThanOrEqual(1);
      const entry = result.recent_activity.find((a) => a.action === "store_document");
      expect(entry).toBeDefined();
      if (entry) {
        expect(typeof entry.action).toBe("string");
        expect(typeof entry.created_at).toBe("string");
        // target_id and target_type can be null or string
        expect(entry.target_id === null || typeof entry.target_id === "string").toBe(true);
        expect(entry.target_type === null || typeof entry.target_type === "string").toBe(true);
      }
    });
  });

  // ── 6. Key documents (priority >= 4) ──────────────────────────────────────

  describe("key_documents (priority >= 4)", () => {
    test("returns only docs with priority >= 4 (not superseded)", async () => {
      const docP1 = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "active",
        priority: 1,
        title: "Priority 1 Doc",
      });
      const docP3 = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "active",
        priority: 3,
        title: "Priority 3 Doc",
      });
      const docP4 = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "active",
        priority: 4,
        title: "Priority 4 Doc",
      });
      const docP5 = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "active",
        priority: 5,
        title: "Priority 5 Doc",
      });

      const result = await projectOverview(tmpDir, "test-proj");

      const ids = result.key_documents.map((d) => d.doc_id);
      // Priority 4 and 5 should be in key_documents
      expect(ids).toContain(docP4);
      expect(ids).toContain(docP5);
      // Priority 1 and 3 should NOT be in key_documents
      expect(ids).not.toContain(docP1);
      expect(ids).not.toContain(docP3);
    });

    test("superseded docs with priority >= 4 are excluded from key_documents", async () => {
      const supersededHighPriority = await insertDoc(tmpDir, "test-proj", {
        category: "research",
        status: "superseded",
        priority: 5,
        title: "Superseded High Priority",
      });

      const result = await projectOverview(tmpDir, "test-proj");

      const ids = result.key_documents.map((d) => d.doc_id);
      expect(ids).not.toContain(supersededHighPriority);
    });

    test("key_documents have doc_id, title, category, status, priority fields", async () => {
      await insertDoc(tmpDir, "test-proj", {
        category: "plan",
        status: "active",
        priority: 4,
        title: "Key Plan",
      });

      const result = await projectOverview(tmpDir, "test-proj");

      const keyDoc = result.key_documents.find((d) => d.title === "Key Plan");
      expect(keyDoc).toBeDefined();
      if (keyDoc) {
        expect(typeof keyDoc.doc_id).toBe("string");
        expect(typeof keyDoc.title).toBe("string");
        expect(typeof keyDoc.category).toBe("string");
        expect(typeof keyDoc.status).toBe("string");
        expect(typeof keyDoc.priority).toBe("number");
        expect(keyDoc.priority).toBeGreaterThanOrEqual(4);
      }
    });
  });

  // ── 7. Return shape ───────────────────────────────────────────────────────

  describe("return shape", () => {
    test("result has all expected top-level fields", async () => {
      const result = await projectOverview(tmpDir, "test-proj");

      expect("project_id" in result).toBe(true);
      expect("counts_by_category" in result).toBe(true);
      expect("counts_by_status" in result).toBe(true);
      expect("total_documents" in result).toBe(true);
      expect("recent_activity" in result).toBe(true);
      expect("key_documents" in result).toBe(true);
    });

    test("project_id matches input", async () => {
      const result = await projectOverview(tmpDir, "test-proj");
      expect(result.project_id).toBe("test-proj");
    });
  });
});
