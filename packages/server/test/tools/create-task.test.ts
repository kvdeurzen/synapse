import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { createTask, detectCycles } from "../../src/tools/create-task.js";
import { initProject } from "../../src/tools/init-project.js";
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

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "create-task-test-"));
  config = { ...TEST_CONFIG, db: tmpDir };
  // Mock fetch to avoid needing real Ollama
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
});

afterEach(() => {
  // Restore real fetch
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("createTask", () => {
  // ── 1. Epic creation (depth=0) ─────────────────────────────────────────────

  describe("epic creation (depth=0)", () => {
    test("creates an epic (depth=0) with root_id = task_id", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Build Authentication System",
          description: "Epic for the authentication module",
          depth: 0,
        },
        config,
      );

      expect(result.task_id).toBeDefined();
      expect(result.task_id.length).toBe(26); // ULID
      expect(result.depth).toBe(0);
      expect(result.depth_name).toBe("epic");
      expect(result.status).toBe("pending");
      expect(result.is_blocked).toBe(false);
      expect(result.root_id).toBe(result.task_id);
      expect(result.parent_id).toBeNull();
      expect(typeof result.created_at).toBe("string");
    });

    test("epic has no parent_id in returned result", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "My Epic",
          description: "",
          depth: 0,
        },
        config,
      );

      expect(result.parent_id).toBeNull();
    });
  });

  // ── 2. Parent-child relationship ───────────────────────────────────────────

  describe("parent-child hierarchy", () => {
    test("creates a feature (depth=1) under an epic with correct root_id", async () => {
      await initProject(tmpDir, "test-proj");

      const epic = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Auth Epic",
          description: "",
          depth: 0,
        },
        config,
      );

      const feature = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Login Feature",
          description: "User login flow",
          depth: 1,
          parent_id: epic.task_id,
        },
        config,
      );

      expect(feature.depth).toBe(1);
      expect(feature.depth_name).toBe("feature");
      expect(feature.parent_id).toBe(epic.task_id);
      expect(feature.root_id).toBe(epic.root_id);
    });

    test("creates a component (depth=2) under a feature with inherited root_id", async () => {
      await initProject(tmpDir, "test-proj");

      const epic = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Auth Epic",
          description: "",
          depth: 0,
        },
        config,
      );

      const feature = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Login Feature",
          description: "",
          depth: 1,
          parent_id: epic.task_id,
        },
        config,
      );

      const component = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "JWT Component",
          description: "JWT token management",
          depth: 2,
          parent_id: feature.task_id,
        },
        config,
      );

      expect(component.depth).toBe(2);
      expect(component.depth_name).toBe("component");
      expect(component.root_id).toBe(epic.task_id);
    });

    test("creates an atomic task (depth=3) under a component", async () => {
      await initProject(tmpDir, "test-proj");

      const epic = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Auth Epic",
          description: "",
          depth: 0,
        },
        config,
      );

      const feature = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Login Feature",
          description: "",
          depth: 1,
          parent_id: epic.task_id,
        },
        config,
      );

      const component = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "JWT Component",
          description: "",
          depth: 2,
          parent_id: feature.task_id,
        },
        config,
      );

      const task = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Implement token signing",
          description: "Sign JWT tokens with RS256",
          depth: 3,
          parent_id: component.task_id,
        },
        config,
      );

      expect(task.depth).toBe(3);
      expect(task.depth_name).toBe("task");
      expect(task.root_id).toBe(epic.task_id);
    });

    test("rejects depth mismatch — component (depth=2) directly under epic (depth=0)", async () => {
      await initProject(tmpDir, "test-proj");

      const epic = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Auth Epic",
          description: "",
          depth: 0,
        },
        config,
      );

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "JWT Component",
            description: "Should fail — wrong depth",
            depth: 2,
            parent_id: epic.task_id,
          },
          config,
        ),
      ).rejects.toThrow("INVALID_DEPTH");
    });

    test("rejects non-existent parent_id", async () => {
      await initProject(tmpDir, "test-proj");

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Orphan Task",
            description: "Has no parent",
            depth: 1,
            parent_id: "01HZ999NONEXISTENT999999",
          },
          config,
        ),
      ).rejects.toThrow("TASK_NOT_FOUND");
    });

    test("rejects depth>0 with no parent_id", async () => {
      await initProject(tmpDir, "test-proj");

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Feature without parent",
            description: "Missing parent_id",
            depth: 1,
          },
          config,
        ),
      ).rejects.toThrow();
    });
  });

  // ── 3. Database persistence ───────────────────────────────────────────────

  describe("database persistence", () => {
    test("stores task with all 23 fields in the tasks table", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Stored Task",
          description: "Check all fields are stored",
          depth: 0,
          priority: "high",
          tags: "|auth|backend|",
          phase: "phase-1",
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.project_id).toBe("test-proj");
      expect(row?.title).toBe("Stored Task");
      expect(row?.description).toBe("Check all fields are stored");
      expect(row?.depth).toBe(0);
      expect(row?.status).toBe("pending");
      expect(row?.priority).toBe("high");
      expect(row?.tags).toBe("|auth|backend|");
      expect(row?.phase).toBe("phase-1");
      expect(row?.is_cancelled).toBe(false);
      expect(row?.block_reason).toBeNull();
    });

    test("new tasks always start with status 'pending'", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task",
          description: "",
          depth: 0,
        },
        config,
      );

      expect(result.status).toBe("pending");
    });
  });

  // ── 4. Embedding ───────────────────────────────────────────────────────────

  describe("embedding", () => {
    test("embeds title+description as 768-dim vector", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "My Task",
          description: "Do something important",
          depth: 0,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      const vector = row?.vector;
      expect(vector !== null && vector !== undefined).toBe(true);
      expect((vector as { length: number }).length).toBe(768);
    });
  });

  // ── 5. Dependencies ───────────────────────────────────────────────────────

  describe("dependencies", () => {
    test("stores dependencies as task_depends_on relationships", async () => {
      await initProject(tmpDir, "test-proj");

      const taskA = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task A",
          description: "",
          depth: 0,
        },
        config,
      );

      const taskB = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task B (depends on A)",
          description: "",
          depth: 0,
          dependencies: [taskA.task_id],
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const relTable = await db.openTable("relationships");
      const rels = await relTable.query().toArray();

      const depRel = rels.find((r) => r.from_id === taskB.task_id && r.to_id === taskA.task_id);
      expect(depRel).toBeDefined();
      expect(depRel?.type).toBe("task_depends_on");
      expect(depRel?.source).toBe("create_task");
    });

    test("auto-computes is_blocked=true when dependency is pending", async () => {
      await initProject(tmpDir, "test-proj");

      const taskA = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Blocker Task",
          description: "",
          depth: 0,
        },
        config,
      );

      const taskB = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Blocked Task",
          description: "",
          depth: 0,
          dependencies: [taskA.task_id],
        },
        config,
      );

      expect(taskB.is_blocked).toBe(true);
    });

    test("auto-computes is_blocked=false when no dependencies", async () => {
      await initProject(tmpDir, "test-proj");

      const task = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Independent Task",
          description: "",
          depth: 0,
        },
        config,
      );

      expect(task.is_blocked).toBe(false);
    });

    test("rejects dependency on non-existent task", async () => {
      await initProject(tmpDir, "test-proj");

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Task with bad dep",
            description: "",
            depth: 0,
            dependencies: ["01HZ999NONEXISTENT999999"],
          },
          config,
        ),
      ).rejects.toThrow("DEPENDENCY_NOT_FOUND");
    });
  });

  // ── 6. Activity logging ────────────────────────────────────────────────────

  describe("activity logging", () => {
    test("logs activity on creation", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Logged Task",
          description: "",
          depth: 0,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const activityTable = await db.openTable("activity_log");
      const logs = await activityTable.query().toArray();

      const createLog = logs.find(
        (l) => l.action === "create_task" && l.target_id === result.task_id,
      );
      expect(createLog).toBeDefined();
      expect(createLog?.target_type).toBe("task");
    });
  });

  // ── 7. Handoff fields (context_doc_ids, spec, output_doc_ids) ─────────────

  describe("handoff fields", () => {
    test("creates task with context_doc_ids JSON string, stored correctly", async () => {
      await initProject(tmpDir, "test-proj");

      const contextDocIds = JSON.stringify(["doc-001", "doc-002"]);
      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task with context",
          description: "Has context doc ids",
          depth: 0,
          context_doc_ids: contextDocIds,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.context_doc_ids).toBe(contextDocIds);
    });

    test("context_doc_ids defaults to null when omitted", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task without context",
          description: "",
          depth: 0,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.context_doc_ids).toBeNull();
    });

    test("creates task with spec string, stored correctly", async () => {
      await initProject(tmpDir, "test-proj");

      const spec = "Implement the token signing endpoint using RS256 algorithm.";
      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task with spec",
          description: "",
          depth: 0,
          spec,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.spec).toBe(spec);
    });

    test("spec defaults to null when omitted", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task without spec",
          description: "",
          depth: 0,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.spec).toBeNull();
    });

    test("output_doc_ids is always null on create (not settable)", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task checking output_doc_ids",
          description: "",
          depth: 0,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.output_doc_ids).toBeNull();
    });

    test("new agent role 'architecture_auditor' is accepted for assigned_agent", async () => {
      await initProject(tmpDir, "test-proj");

      const result = await createTask(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          title: "Task for architecture_auditor",
          description: "",
          depth: 0,
          // biome-ignore lint/suspicious/noExplicitAny: testing new role
          assigned_agent: "architecture_auditor" as any,
        },
        config,
      );

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("tasks");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.task_id === result.task_id);

      expect(row).toBeDefined();
      expect(row?.assigned_agent).toBe("architecture_auditor");
    });
  });

  // ── 8. Validation errors ───────────────────────────────────────────────────

  describe("validation errors", () => {
    test("rejects invalid depth value (5)", async () => {
      await initProject(tmpDir, "test-proj");

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Bad Task",
            description: "",
            // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
            depth: 5 as any,
          },
          config,
        ),
      ).rejects.toThrow();
    });

    test("rejects invalid priority", async () => {
      await initProject(tmpDir, "test-proj");

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Bad Priority Task",
            description: "",
            depth: 0,
            // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
            priority: "urgent" as any,
          },
          config,
        ),
      ).rejects.toThrow();
    });

    test("rejects invalid assigned_agent role", async () => {
      await initProject(tmpDir, "test-proj");

      await expect(
        createTask(
          tmpDir,
          "test-proj",
          {
            project_id: "test-proj",
            title: "Bad Agent Task",
            description: "",
            depth: 0,
            // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
            assigned_agent: "superman" as any,
          },
          config,
        ),
      ).rejects.toThrow();
    });
  });
});

// ── Cycle detection unit tests ─────────────────────────────────────────────────

describe("detectCycles", () => {
  test("returns false for empty graph", () => {
    const result = detectCycles([], []);
    expect(result.hasCycle).toBe(false);
  });

  test("returns false for valid DAG (A->B, B->C)", () => {
    // Existing edges: A->B (A depends on B), B->C (B depends on C)
    const existingEdges = [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ];
    // Proposed: D->A (D depends on A) — no cycle
    const proposedEdges = [{ from: "D", to: "A" }];
    const result = detectCycles(existingEdges, proposedEdges);
    expect(result.hasCycle).toBe(false);
  });

  test("returns true for direct cycle (proposed A->B where B->A exists)", () => {
    // Existing edges: B->A (B depends on A)
    const existingEdges = [{ from: "B", to: "A" }];
    // Proposed: A->B (A depends on B) — creates B->A->B cycle
    const proposedEdges = [{ from: "A", to: "B" }];
    const result = detectCycles(existingEdges, proposedEdges);
    expect(result.hasCycle).toBe(true);
  });

  test("returns true for transitive cycle (A->B, B->C, proposed C->A)", () => {
    // Existing edges: A->B, B->C
    const existingEdges = [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ];
    // Proposed: C->A — creates C->A->B->C cycle
    const proposedEdges = [{ from: "C", to: "A" }];
    const result = detectCycles(existingEdges, proposedEdges);
    expect(result.hasCycle).toBe(true);
  });

  test("returns true for self-loop (proposed A->A)", () => {
    const existingEdges: Array<{ from: string; to: string }> = [];
    const proposedEdges = [{ from: "A", to: "A" }];
    const result = detectCycles(existingEdges, proposedEdges);
    expect(result.hasCycle).toBe(true);
  });

  test("returns false for complex valid DAG", () => {
    // Diamond pattern: A depends on B and C, B depends on D, C depends on D
    const existingEdges = [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "B", to: "D" },
      { from: "C", to: "D" },
    ];
    // Proposed: E->A (E depends on A) — no cycle
    const proposedEdges = [{ from: "E", to: "A" }];
    const result = detectCycles(existingEdges, proposedEdges);
    expect(result.hasCycle).toBe(false);
  });

  test("returns true for indirect self-loop (A->B, proposed B->A)", () => {
    const existingEdges = [{ from: "A", to: "B" }];
    const proposedEdges = [{ from: "B", to: "A" }];
    const result = detectCycles(existingEdges, proposedEdges);
    expect(result.hasCycle).toBe(true);
  });
});
