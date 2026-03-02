import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { initProject } from "../../src/tools/init-project.js";
import { createTask } from "../../src/tools/create-task.js";
import { updateTask } from "../../src/tools/update-task.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock Ollama /api/embed response returning 768-dim vectors.
 * count = number of texts to embed (one vector per text).
 */
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
  db: "", // will be set per test
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

let tmpDir: string;
let config: SynapseConfig;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "update-task-test-"));
  config = { ...TEST_CONFIG, db: tmpDir };
  // Mock fetch to return mock embeddings
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
  // Restore real fetch
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("updateTask", () => {
  // ── 1. Status update (no re-embedding) ────────────────────────────────────

  test("updates status without re-embedding", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "My Task",
      description: "Some description",
      depth: 0,
    }, config);

    // Now block embed to prove it's NOT called
    _setFetchImpl(() => {
      throw new Error("embed should NOT be called for status update");
    });

    const result = await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      status: "in_progress",
    }, config);

    expect(result.status).toBe("in_progress");
    expect(result.changed_fields).toContain("status");
  });

  // ── 2. Re-embedding on title change ───────────────────────────────────────

  test("re-embeds when title changes", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Old Title",
      description: "Existing description",
      depth: 0,
    }, config);

    // Get the original vector (fresh connection)
    const dbBefore = await lancedb.connect(tmpDir);
    const tableBefore = await dbBefore.openTable("tasks");
    const rowsBefore = await tableBefore.query().where(`task_id = '${task.task_id}'`).toArray();
    const vectorBefore = rowsBefore[0]?.vector as number[] | null;

    // Re-enable embed mock (with a different vector to verify change)
    let embedCalled = false;
    _setFetchImpl((_url, _init) => {
      embedCalled = true;
      const vectors = Array.from({ length: 1 }, () =>
        Array.from({ length: 768 }, (_, i) => (i + 1) * 0.002),
      );
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: vectors }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const result = await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      title: "New Title",
    }, config);

    expect(embedCalled).toBe(true);
    expect(result.changed_fields).toContain("title");

    // Verify updated state via fresh connection (LanceDB table handles are snapshot-based)
    const dbAfter = await lancedb.connect(tmpDir);
    const tableAfter = await dbAfter.openTable("tasks");
    const rowsAfter = await tableAfter.query().where(`task_id = '${task.task_id}'`).toArray();
    expect(rowsAfter[0]?.updated_at).toBeDefined();
    expect(rowsAfter[0]?.title).toBe("New Title");
    // Vector should have been updated (different from original)
    const vectorAfter = rowsAfter[0]?.vector as number[] | null;
    expect(vectorAfter).not.toBeNull();
    // Check vector changed (first element: before was i*0.001=0, after is (i+1)*0.002 = 0.002)
    expect(vectorBefore).not.toEqual(vectorAfter);
  });

  // ── 3. Re-embedding on description change ─────────────────────────────────

  test("re-embeds when description changes", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task Title",
      description: "Old description",
      depth: 0,
    }, config);

    let embedCalled = false;
    _setFetchImpl((_url, _init) => {
      embedCalled = true;
      const vectors = [Array.from({ length: 768 }, () => 0.5)];
      return Promise.resolve(
        new Response(JSON.stringify({ embeddings: vectors }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const result = await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      description: "New description",
    }, config);

    expect(embedCalled).toBe(true);
    expect(result.changed_fields).toContain("description");
  });

  // ── 4. Priority update (no re-embedding) ─────────────────────────────────

  test("does not re-embed for priority update", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task",
      description: "Description",
      depth: 0,
    }, config);

    _setFetchImpl(() => {
      throw new Error("embed should NOT be called for priority update");
    });

    const result = await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      priority: "high",
    }, config);

    expect(result.changed_fields).toContain("priority");
  });

  // ── 5. assigned_agent update ──────────────────────────────────────────────

  test("updates assigned_agent without re-embedding", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task",
      description: "",
      depth: 0,
    }, config);

    _setFetchImpl(() => {
      throw new Error("embed should NOT be called for agent update");
    });

    const result = await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      assigned_agent: "executor",
    }, config);

    expect(result.changed_fields).toContain("assigned_agent");

    // Verify in DB
    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("tasks");
    const rows = await table.query().where(`task_id = '${task.task_id}'`).toArray();
    expect(rows[0]?.assigned_agent).toBe("executor");
  });

  // ── 6. is_blocked propagation when status becomes done ───────────────────

  test("recomputes dependents is_blocked when status becomes done", async () => {
    // Create taskA (pending), then taskB that depends on taskA
    const taskA = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task A (blocker)",
      description: "",
      depth: 0,
    }, config);

    const taskB = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task B (blocked by A)",
      description: "",
      depth: 0,
      dependencies: [taskA.task_id],
    }, config);

    // Verify taskB is blocked initially
    expect(taskB.is_blocked).toBe(true);

    // Mark taskA as done
    await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: taskA.task_id,
      status: "done",
    }, config);

    // Check taskB is now unblocked
    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("tasks");
    const rowsB = await table.query().where(`task_id = '${taskB.task_id}'`).toArray();
    expect(rowsB[0]?.is_blocked).toBe(false);
  });

  // ── 7. Cancelling task unblocks dependents ────────────────────────────────

  test("cancelling task unblocks dependents", async () => {
    const taskA = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task A (blocker)",
      description: "",
      depth: 0,
    }, config);

    const taskB = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task B (blocked by A)",
      description: "",
      depth: 0,
      dependencies: [taskA.task_id],
    }, config);

    expect(taskB.is_blocked).toBe(true);

    // Cancel taskA
    await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: taskA.task_id,
      is_cancelled: true,
    }, config);

    // Check taskB is now unblocked
    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("tasks");
    const rowsB = await table.query().where(`task_id = '${taskB.task_id}'`).toArray();
    expect(rowsB[0]?.is_blocked).toBe(false);
  });

  // ── 8. Dependency replacement with cycle detection ────────────────────────

  test("replaces dependencies with cycle detection", async () => {
    // Create A, B, C with no deps
    const taskA = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task A",
      description: "",
      depth: 0,
    }, config);

    const taskB = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task B",
      description: "",
      depth: 0,
    }, config);

    const taskC = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task C",
      description: "",
      depth: 0,
    }, config);

    // C depends on A (valid)
    await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: taskC.task_id,
      dependencies: [taskA.task_id],
    }, config);

    // Now try to make A depend on C — would create A->C, C->A cycle
    await expect(
      updateTask(tmpDir, "test-proj", {
        project_id: "test-proj",
        task_id: taskA.task_id,
        dependencies: [taskC.task_id],
      }, config),
    ).rejects.toThrow("CYCLE_DETECTED");

    // B is unused but confirms tasks are distinct
    expect(taskB.task_id).not.toBe(taskA.task_id);
  });

  // ── 9. TASK_NOT_FOUND ─────────────────────────────────────────────────────

  test("rejects update on non-existent task", async () => {
    await expect(
      updateTask(tmpDir, "test-proj", {
        project_id: "test-proj",
        task_id: "01HZ999NONEXISTENT999999",
        status: "in_progress",
      }, config),
    ).rejects.toThrow("TASK_NOT_FOUND");
  });

  // ── 10. Manual is_blocked with block_reason ───────────────────────────────

  test("allows manual is_blocked with block_reason", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task",
      description: "",
      depth: 0,
    }, config);

    _setFetchImpl(() => {
      throw new Error("embed should NOT be called");
    });

    const result = await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      is_blocked: true,
      block_reason: "external dependency",
    }, config);

    expect(result.is_blocked).toBe(true);

    const db = await lancedb.connect(tmpDir);
    const table = await db.openTable("tasks");
    const rows = await table.query().where(`task_id = '${task.task_id}'`).toArray();
    expect(rows[0]?.block_reason).toBe("external dependency");
  });

  // ── 11. Activity logging ──────────────────────────────────────────────────

  test("logs activity on update", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task",
      description: "",
      depth: 0,
    }, config);

    _setFetchImpl(() => {
      throw new Error("embed should NOT be called");
    });

    await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      priority: "high",
    }, config);

    const db = await lancedb.connect(tmpDir);
    const activityTable = await db.openTable("activity_log");
    const logs = await activityTable.query().toArray();

    const updateLog = logs.find(
      (l) => l.action === "update_task" && l.target_id === task.task_id,
    );
    expect(updateLog).toBeDefined();
    expect(updateLog?.target_type).toBe("task");
  });

  // ── 12. Cannot complete a cancelled task ──────────────────────────────────

  test("cannot complete a cancelled task", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task",
      description: "",
      depth: 0,
    }, config);

    _setFetchImpl(() => {
      throw new Error("embed should NOT be called");
    });

    // First cancel the task
    await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      is_cancelled: true,
    }, config);

    // Now try to mark it as done — should throw INVALID_TRANSITION
    await expect(
      updateTask(tmpDir, "test-proj", {
        project_id: "test-proj",
        task_id: task.task_id,
        status: "done",
      }, config),
    ).rejects.toThrow("INVALID_TRANSITION");
  });

  // ── 13. updated_at changes on every update ────────────────────────────────

  test("sets updated_at on every update", async () => {
    const task = await createTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      title: "Task",
      description: "",
      depth: 0,
    }, config);

    const dbBefore = await lancedb.connect(tmpDir);
    const tableBefore = await dbBefore.openTable("tasks");
    const rowsBefore = await tableBefore.query().where(`task_id = '${task.task_id}'`).toArray();
    const createdAt = rowsBefore[0]?.created_at as string;

    // Small delay to ensure updated_at > created_at
    await new Promise((resolve) => setTimeout(resolve, 10));

    _setFetchImpl(() => {
      throw new Error("embed should NOT be called");
    });

    await updateTask(tmpDir, "test-proj", {
      project_id: "test-proj",
      task_id: task.task_id,
      priority: "high",
    }, config);

    // Use fresh connection to read updated data (LanceDB table handles are snapshot-based)
    const dbAfter = await lancedb.connect(tmpDir);
    const tableAfter = await dbAfter.openTable("tasks");
    const rowsAfter = await tableAfter.query().where(`task_id = '${task.task_id}'`).toArray();
    const updatedAt = rowsAfter[0]?.updated_at as string;

    expect(updatedAt).toBeDefined();
    expect(updatedAt > createdAt).toBe(true);
  });
});
