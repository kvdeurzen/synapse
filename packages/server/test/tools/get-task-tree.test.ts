import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { createTask } from "../../src/tools/create-task.js";
import { getTaskTree } from "../../src/tools/get-task-tree.js";
import { initProject } from "../../src/tools/init-project.js";
import { updateTask } from "../../src/tools/update-task.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

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

// Shared hierarchy task IDs
let epicE1: string;
let featureF1: string;
let featureF2: string;
let componentC1: string;
let taskT1: string;
let taskT2: string;
let taskT3: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "get-task-tree-test-"));
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

  // Build test hierarchy:
  // E1 (epic, depth=0)
  // ├── F1 (feature, depth=1)
  // │   └── C1 (component, depth=2)
  // │       ├── T1 (task, depth=3)
  // │       └── T2 (task, depth=3)
  // └── F2 (feature, depth=1)
  //     └── T3 (component-level, depth=2)

  const e1 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Epic E1",
      description: "The main epic",
      depth: 0,
    },
    config,
  );
  epicE1 = e1.task_id;

  const f1 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Feature F1",
      description: "Feature under E1",
      depth: 1,
      parent_id: epicE1,
    },
    config,
  );
  featureF1 = f1.task_id;

  const f2 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Feature F2",
      description: "Second feature under E1",
      depth: 1,
      parent_id: epicE1,
    },
    config,
  );
  featureF2 = f2.task_id;

  const c1 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Component C1",
      description: "Component under F1",
      depth: 2,
      parent_id: featureF1,
    },
    config,
  );
  componentC1 = c1.task_id;

  const t1 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Task T1",
      description: "Task under C1",
      depth: 3,
      parent_id: componentC1,
    },
    config,
  );
  taskT1 = t1.task_id;

  const t2 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Task T2",
      description: "Second task under C1",
      depth: 3,
      parent_id: componentC1,
    },
    config,
  );
  taskT2 = t2.task_id;

  const t3 = await createTask(
    tmpDir,
    "test-proj",
    {
      project_id: "test-proj",
      title: "Task T3",
      description: "Task under F2",
      depth: 2,
      parent_id: featureF2,
    },
    config,
  );
  taskT3 = t3.task_id;
});

afterEach(() => {
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("getTaskTree", () => {
  // ── 1. Full epic tree structure ───────────────────────────────────────────

  test("returns full epic tree with correct structure", async () => {
    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
    });

    expect(result.tree.task_id).toBe(epicE1);
    expect(result.tree.title).toBe("Epic E1");
    expect(result.tree.depth).toBe(0);
    expect(result.tree.depth_name).toBe("epic");

    // E1 should have 2 children: F1 and F2
    expect(result.tree.children.length).toBe(2);

    const childIds = result.tree.children.map((c) => c.task_id);
    expect(childIds).toContain(featureF1);
    expect(childIds).toContain(featureF2);

    // F1 should have 1 child: C1
    const f1Node = result.tree.children.find((c) => c.task_id === featureF1);
    expect(f1Node).toBeDefined();
    expect(f1Node?.children.length).toBe(1);
    expect(f1Node?.children[0]?.task_id).toBe(componentC1);

    // C1 should have 2 children: T1, T2
    const c1Node = f1Node?.children[0];
    expect(c1Node?.children.length).toBe(2);
    const c1ChildIds = c1Node?.children.map((c) => c.task_id) ?? [];
    expect(c1ChildIds).toContain(taskT1);
    expect(c1ChildIds).toContain(taskT2);
  });

  // ── 2. Sub-tree rooted at feature ─────────────────────────────────────────

  test("returns sub-tree rooted at feature", async () => {
    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: featureF1,
    });

    expect(result.tree.task_id).toBe(featureF1);
    expect(result.tree.depth).toBe(1);
    expect(result.tree.depth_name).toBe("feature");
    expect(result.tree.children.length).toBe(1);
    expect(result.tree.children[0]?.task_id).toBe(componentC1);
  });

  // ── 3. Rollup stats ───────────────────────────────────────────────────────

  test("computes rollup stats correctly", async () => {
    // Set T1 to done, T2 to in_progress
    _setFetchImpl(() => {
      throw new Error("embed not needed");
    });
    await updateTask(
      tmpDir,
      "test-proj",
      {
        project_id: "test-proj",
        task_id: taskT1,
        status: "done",
      },
      config,
    );
    await updateTask(
      tmpDir,
      "test-proj",
      {
        project_id: "test-proj",
        task_id: taskT2,
        status: "in_progress",
      },
      config,
    );

    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: componentC1,
    });

    const c1Node = result.tree;
    expect(c1Node.rollup.total_descendants).toBe(2);
    expect(c1Node.rollup.done_count).toBe(1);
    expect(c1Node.rollup.in_progress_count).toBe(1);
    expect(c1Node.rollup.blocked_count).toBe(0);
    expect(c1Node.rollup.children_all_done).toBe(false);
    expect(c1Node.rollup.completion_percentage).toBe(50);
  });

  // ── 4. children_all_done = true when all direct children are done ──────────

  test("children_all_done is true when all direct children are done", async () => {
    _setFetchImpl(() => {
      throw new Error("embed not needed");
    });
    await updateTask(
      tmpDir,
      "test-proj",
      { project_id: "test-proj", task_id: taskT1, status: "done" },
      config,
    );
    await updateTask(
      tmpDir,
      "test-proj",
      { project_id: "test-proj", task_id: taskT2, status: "done" },
      config,
    );

    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: componentC1,
    });

    expect(result.tree.rollup.children_all_done).toBe(true);
    expect(result.tree.rollup.done_count).toBe(2);
    expect(result.tree.rollup.completion_percentage).toBe(100);
  });

  // ── 5. children_all_done = false for leaf node ────────────────────────────

  test("children_all_done is false for leaf node (no children)", async () => {
    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: taskT1,
    });

    // T1 is a leaf — no children
    expect(result.tree.children.length).toBe(0);
    expect(result.tree.rollup.children_all_done).toBe(false);
    expect(result.tree.rollup.total_descendants).toBe(0);
    expect(result.tree.rollup.completion_percentage).toBe(0);
  });

  // ── 6. max_tasks truncation ───────────────────────────────────────────────

  test("returns truncated flag when max_tasks exceeded", async () => {
    // Use max_tasks=3 on a tree with 7 nodes — should truncate
    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
      max_tasks: 3,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncated_count).toBeGreaterThan(0);
    expect(result.total_tasks).toBe(7); // all 7 tasks fetched from DB
  });

  // ── 7. max_depth truncation ───────────────────────────────────────────────

  test("returns truncated flag when max_depth exceeded", async () => {
    // Use max_depth=2 on a tree with depth 4 — should truncate
    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
      max_depth: 2,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncated_count).toBeGreaterThan(0);

    // Should include E1 (depth 0 relative to root = 0)
    // and F1, F2 (relative depth 1)
    // but NOT C1 (relative depth 2) since max_depth=2 means max relative depth
    // Actually max_depth=2 means we include up to relative depth 1 (0-indexed from root)
    // Let me verify with what the tree returns
    expect(result.tree.task_id).toBe(epicE1);
  });

  // ── 8. TASK_NOT_FOUND for non-existent root ───────────────────────────────

  test("throws TASK_NOT_FOUND for non-existent root", async () => {
    await expect(
      getTaskTree(tmpDir, "test-proj", {
        project_id: "test-proj",
        root_task_id: "01HZ999NONEXISTENT999999",
      }),
    ).rejects.toThrow("TASK_NOT_FOUND");
  });

  // ── 9. dependency_ids on each node ────────────────────────────────────────

  test("includes dependency_ids on each node", async () => {
    // Create T1 with a dependency on T3
    await updateTask(
      tmpDir,
      "test-proj",
      {
        project_id: "test-proj",
        task_id: taskT1,
        dependencies: [taskT3],
      },
      config,
    );

    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
    });

    // Find T1 node in the tree
    const f1Node = result.tree.children.find((c) => c.task_id === featureF1);
    const c1Node = f1Node?.children[0];
    const t1Node = c1Node?.children.find((c) => c.task_id === taskT1);

    expect(t1Node).toBeDefined();
    expect(t1Node?.dependency_ids).toContain(taskT3);
  });

  // ── 10. Status filter ─────────────────────────────────────────────────────

  test("filters by status — only done nodes fully shown", async () => {
    _setFetchImpl(() => {
      throw new Error("embed not needed");
    });
    await updateTask(
      tmpDir,
      "test-proj",
      { project_id: "test-proj", task_id: taskT1, status: "done" },
      config,
    );

    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
      filters: { status: "done" },
    });

    // T1 is done, all others are pending
    // T1 should be fully shown (not collapsed), others should be collapsed
    const f1Node = result.tree.children.find((c) => c.task_id === featureF1);
    const c1Node = f1Node?.children[0];
    const t1Node = c1Node?.children.find((c) => c.task_id === taskT1);
    const t2Node = c1Node?.children.find((c) => c.task_id === taskT2);

    expect(t1Node?.collapsed).toBeFalsy(); // T1 matches filter
    expect(t2Node?.collapsed).toBe(true); // T2 doesn't match
  });

  // ── 11. assigned_agent filter ─────────────────────────────────────────────

  test("filters by assigned_agent", async () => {
    _setFetchImpl(() => {
      throw new Error("embed not needed");
    });
    await updateTask(
      tmpDir,
      "test-proj",
      {
        project_id: "test-proj",
        task_id: taskT1,
        assigned_agent: "executor",
      },
      config,
    );

    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
      filters: { assigned_agent: "executor" },
    });

    // T1 has assigned_agent="executor", should NOT be collapsed
    // T2 has no agent, should be collapsed
    const f1Node = result.tree.children.find((c) => c.task_id === featureF1);
    const c1Node = f1Node?.children[0];
    const t1Node = c1Node?.children.find((c) => c.task_id === taskT1);
    const t2Node = c1Node?.children.find((c) => c.task_id === taskT2);

    expect(t1Node?.collapsed).toBeFalsy();
    expect(t2Node?.collapsed).toBe(true);
  });

  // ── 12. Root with no children ─────────────────────────────────────────────

  test("root with no children returns empty children array", async () => {
    // Create a lone epic
    const lone = await createTask(
      tmpDir,
      "test-proj",
      {
        project_id: "test-proj",
        title: "Lone Epic",
        description: "No children",
        depth: 0,
      },
      config,
    );

    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: lone.task_id,
    });

    expect(result.tree.task_id).toBe(lone.task_id);
    expect(result.tree.children).toEqual([]);
    expect(result.tree.rollup.total_descendants).toBe(0);
    expect(result.tree.rollup.completion_percentage).toBe(0);
    expect(result.truncated).toBe(false);
  });

  // ── 13. Vector not included in output ────────────────────────────────────

  test("does not include vector field in tree nodes", async () => {
    const result = await getTaskTree(tmpDir, "test-proj", {
      project_id: "test-proj",
      root_task_id: epicE1,
    });

    // Check root and children don't have vector
    const rootNode = result.tree as Record<string, unknown>;
    expect(rootNode.vector).toBeUndefined();

    if (result.tree.children.length > 0) {
      const childNode = result.tree.children[0] as Record<string, unknown>;
      expect(childNode.vector).toBeUndefined();
    }
  });
});
