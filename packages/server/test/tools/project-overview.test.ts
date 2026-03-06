import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { ActivityLogRowSchema, DocumentRowSchema } from "../../src/db/schema.js";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { createTask } from "../../src/tools/create-task.js";
import { initProject } from "../../src/tools/init-project.js";
import { projectOverview } from "../../src/tools/project-overview.js";
import type { SynapseConfig } from "../../src/types.js";

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

function mockOllamaEmbed(count: number): Response {
  const vectors = Array.from({ length: count }, () =>
    Array.from({ length: 768 }, (_, i) => i * 0.001),
  );
  return new Response(JSON.stringify({ embeddings: vectors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const TEST_CONFIG: SynapseConfig = {
  db: "",
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

let tmpDir: string;
let config: SynapseConfig;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "project-overview-test-"));
  config = { ...TEST_CONFIG, db: tmpDir };
  _setFetchImpl((_url, _init) => {
    const body = _init?.body;
    let count = 1;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as { input?: string[] };
        count = parsed.input?.length ?? 1;
      } catch {
        count = 1;
      }
    }
    return Promise.resolve(mockOllamaEmbed(count));
  });
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

    test("task_progress is undefined on new project with no tasks", async () => {
      const result = await projectOverview(tmpDir, "test-proj");
      // No tasks table rows — task_progress should be undefined
      expect(result.task_progress).toBeUndefined();
    });

    test("pool_status is undefined on new project with no pool-state doc", async () => {
      const result = await projectOverview(tmpDir, "test-proj");
      expect(result.pool_status).toBeUndefined();
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

  // ── 8. task_progress ─────────────────────────────────────────────────────

  describe("task_progress", () => {
    test("task_progress returns epics array with one entry when one epic exists", async () => {
      await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Alpha", description: "First epic", depth: 0 },
        config,
      );

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.task_progress).toBeDefined();
      expect(result.task_progress?.epics).toHaveLength(1);
      expect(result.task_progress?.total_epics).toBe(1);
    });

    test("task_progress epic entry has required fields", async () => {
      await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Epic Beta",
          description: "Second epic",
          depth: 0,
          priority: "high",
        },
        config,
      );

      const result = await projectOverview(tmpDir, "test-proj");

      const epic = result.task_progress?.epics[0];
      expect(epic).toBeDefined();
      if (epic) {
        expect(typeof epic.task_id).toBe("string");
        expect(typeof epic.title).toBe("string");
        expect(epic.title).toBe("Epic Beta");
        expect(typeof epic.status).toBe("string");
        expect(epic.rpev_stage).toBeNull(); // no stage doc yet
        expect(typeof epic.rollup).toBe("object");
        expect(typeof epic.rollup.total_descendants).toBe("number");
        expect(typeof epic.rollup.done_count).toBe("number");
        expect(typeof epic.rollup.blocked_count).toBe("number");
        expect(typeof epic.rollup.in_progress_count).toBe("number");
        expect(typeof epic.rollup.completion_percentage).toBe("number");
      }
    });

    test("task_progress rollup includes child task counts", async () => {
      const epic = await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Gamma", description: "", depth: 0 },
        config,
      );
      // Add a child feature
      await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Feature 1",
          description: "",
          depth: 1,
          parent_id: epic.task_id,
        },
        config,
      );

      const result = await projectOverview(tmpDir, "test-proj");
      const epicEntry = result.task_progress?.epics.find((e) => e.title === "Epic Gamma");
      expect(epicEntry).toBeDefined();
      // Epic has 1 child feature
      expect(epicEntry?.rollup.total_descendants).toBeGreaterThanOrEqual(1);
    });

    test("task_progress sets rpev_stage from stage document when it exists", async () => {
      const epic = await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Delta", description: "", depth: 0 },
        config,
      );

      // Insert a stage document for this epic
      const stageContent = JSON.stringify({
        stage: "PLANNING",
        level: "epic",
        task_id: epic.task_id,
        involvement: "autopilot",
        pending_approval: false,
        proposal_doc_id: null,
        last_updated: new Date().toISOString(),
        notes: "",
      });
      await insertDoc(tmpDir, "test-proj", {
        doc_id: `rpev-stage-${epic.task_id}`,
        category: "plan",
        status: "active",
        tags: "|rpev-stage|epic|planning|",
        content: stageContent,
        title: "Stage doc for Epic Delta",
      });

      const result = await projectOverview(tmpDir, "test-proj");
      const epicEntry = result.task_progress?.epics.find((e) => e.title === "Epic Delta");
      expect(epicEntry?.rpev_stage).toBe("PLANNING");
    });

    test("task_progress rpev_stage_counts counts stages of child task stage docs", async () => {
      const epic = await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Epsilon", description: "", depth: 0 },
        config,
      );
      const feature1 = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Feature A",
          description: "",
          depth: 1,
          parent_id: epic.task_id,
        },
        config,
      );
      const feature2 = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Feature B",
          description: "",
          depth: 1,
          parent_id: epic.task_id,
        },
        config,
      );

      // Insert stage docs for features
      await insertDoc(tmpDir, "test-proj", {
        doc_id: `rpev-stage-${feature1.task_id}`,
        category: "plan",
        status: "active",
        tags: "|rpev-stage|feature|executing|",
        content: JSON.stringify({
          stage: "EXECUTING",
          level: "feature",
          task_id: feature1.task_id,
          involvement: "autopilot",
          pending_approval: false,
          proposal_doc_id: null,
          last_updated: new Date().toISOString(),
          notes: "",
        }),
        title: `Stage doc for Feature A`,
      });
      await insertDoc(tmpDir, "test-proj", {
        doc_id: `rpev-stage-${feature2.task_id}`,
        category: "plan",
        status: "active",
        tags: "|rpev-stage|feature|planning|",
        content: JSON.stringify({
          stage: "PLANNING",
          level: "feature",
          task_id: feature2.task_id,
          involvement: "autopilot",
          pending_approval: false,
          proposal_doc_id: null,
          last_updated: new Date().toISOString(),
          notes: "",
        }),
        title: `Stage doc for Feature B`,
      });

      const result = await projectOverview(tmpDir, "test-proj");
      const epicEntry = result.task_progress?.epics.find((e) => e.title === "Epic Epsilon");
      expect(epicEntry?.rpev_stage_counts).toBeDefined();
      expect(epicEntry?.rpev_stage_counts?.executing).toBe(1);
      expect(epicEntry?.rpev_stage_counts?.planning).toBe(1);
    });
  });

  // ── 9. pool_status ───────────────────────────────────────────────────────

  describe("pool_status", () => {
    test("pool_status is populated when a pool-state document exists", async () => {
      const poolContent = JSON.stringify({
        project_id: "test-proj",
        max_slots: 3,
        slots: {
          A: {
            task_id: "task-001",
            task_title: "Implementing auth",
            agent_type: "executor",
            epic_title: "Auth Epic",
            epic_id: "epic-001",
            started_at: new Date().toISOString(),
            rpev_stage: "EXECUTING",
            recent_tool_calls: [],
          },
          B: null,
          C: null,
        },
        queue: [{ task_id: "task-002", task_title: "Setup CI", epic_id: "epic-001", type: "executor" }],
        tokens_by_task: {},
        last_updated: new Date().toISOString(),
      });

      await insertDoc(tmpDir, "test-proj", {
        doc_id: "pool-state-test-proj",
        category: "plan",
        status: "active",
        tags: "|pool-state|active|",
        content: poolContent,
        title: "Pool state",
      });

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.pool_status).toBeDefined();
      expect(result.pool_status?.active_slots).toBe(1);
      expect(result.pool_status?.total_slots).toBe(3);
      expect(result.pool_status?.queued_count).toBe(1);
      expect(result.pool_status?.slots).toHaveLength(3);

      const slotA = result.pool_status?.slots.find((s) => s.letter === "A");
      expect(slotA?.task_id).toBe("task-001");
      expect(slotA?.task_title).toBe("Implementing auth");
      expect(slotA?.agent_type).toBe("executor");
      expect(slotA?.epic_title).toBe("Auth Epic");

      const slotB = result.pool_status?.slots.find((s) => s.letter === "B");
      expect(slotB?.task_id).toBeNull();
    });

    test("pool_status is undefined when no pool-state document exists", async () => {
      const result = await projectOverview(tmpDir, "test-proj");
      expect(result.pool_status).toBeUndefined();
    });
  });

  // ── 10. needs_attention ──────────────────────────────────────────────────

  describe("needs_attention", () => {
    test("needs_attention has empty arrays when no blocked items exist", async () => {
      // Create an epic but no stage docs with pending_approval or failure
      await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Zeta", description: "", depth: 0 },
        config,
      );

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.needs_attention).toBeDefined();
      expect(result.needs_attention?.approval_needed).toEqual([]);
      expect(result.needs_attention?.failed).toEqual([]);
    });

    test("needs_attention.approval_needed lists items where pending_approval=true", async () => {
      const epic = await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Eta", description: "", depth: 0 },
        config,
      );

      // Insert stage doc with pending_approval=true
      await insertDoc(tmpDir, "test-proj", {
        doc_id: `rpev-stage-${epic.task_id}`,
        category: "plan",
        status: "active",
        tags: "|rpev-stage|epic|planning|",
        content: JSON.stringify({
          stage: "PLANNING",
          level: "epic",
          task_id: epic.task_id,
          involvement: "co-pilot",
          pending_approval: true,
          proposal_doc_id: null,
          last_updated: new Date().toISOString(),
          notes: "",
        }),
        title: `Stage doc for Epic Eta`,
      });

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.needs_attention?.approval_needed).toHaveLength(1);
      const item = result.needs_attention?.approval_needed[0];
      expect(item?.task_id).toBe(epic.task_id);
      expect(item?.stage).toBe("PLANNING");
      expect(item?.involvement).toBe("co-pilot");
      expect(item?.level).toBe("epic");
    });

    test("needs_attention.failed lists items with failure notes", async () => {
      const epic = await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Theta", description: "", depth: 0 },
        config,
      );

      await insertDoc(tmpDir, "test-proj", {
        doc_id: `rpev-stage-${epic.task_id}`,
        category: "plan",
        status: "active",
        tags: "|rpev-stage|epic|executing|",
        content: JSON.stringify({
          stage: "EXECUTING",
          level: "epic",
          task_id: epic.task_id,
          involvement: "autopilot",
          pending_approval: false,
          proposal_doc_id: null,
          last_updated: new Date().toISOString(),
          notes: "retries exhausted after 3 attempts",
        }),
        title: `Stage doc for Epic Theta`,
      });

      const result = await projectOverview(tmpDir, "test-proj");

      expect(result.needs_attention?.failed).toHaveLength(1);
      const failedItem = result.needs_attention?.failed[0];
      expect(failedItem?.task_id).toBe(epic.task_id);
      expect(failedItem?.level).toBe("epic");
      expect(failedItem?.notes).toContain("retries exhausted");
    });

    test("needs_attention is defined with empty arrays when task_progress exists but no issues", async () => {
      await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Iota", description: "", depth: 0 },
        config,
      );

      const result = await projectOverview(tmpDir, "test-proj");
      expect(result.needs_attention).toBeDefined();
      expect(Array.isArray(result.needs_attention?.approval_needed)).toBe(true);
      expect(Array.isArray(result.needs_attention?.failed)).toBe(true);
    });
  });

  // ── 11. backward compatibility ───────────────────────────────────────────

  describe("backward compatibility", () => {
    test("still returns all existing fields with tasks present", async () => {
      await createTask(
        tmpDir,
        "test-proj",
        { project_id: "test-proj", title: "Epic Kappa", description: "", depth: 0 },
        config,
      );

      const result = await projectOverview(tmpDir, "test-proj");

      // All original fields still present
      expect(result.project_id).toBe("test-proj");
      expect(typeof result.total_documents).toBe("number");
      expect(typeof result.counts_by_category).toBe("object");
      expect(typeof result.counts_by_status).toBe("object");
      expect(Array.isArray(result.recent_activity)).toBe(true);
      expect(Array.isArray(result.key_documents)).toBe(true);
    });
  });
});
