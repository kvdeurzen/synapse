import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import { RelationshipRowSchema, TaskRowSchema } from "../db/schema.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import { embed } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import {
  DEPTH_NAMES,
  VALID_AGENT_ROLES,
  VALID_DEPTHS,
  VALID_TASK_PRIORITIES,
  VALID_TASK_STATUSES,
} from "./task-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const CreateTaskInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  title: z.string().min(1).describe("Task title"),
  description: z.string().default("").describe("Task description"),
  depth: z.number().int().min(0).max(3).describe("Depth level: 0=Epic, 1=Feature, 2=Component, 3=Task"),
  parent_id: z.string().optional().describe("Parent task ID (required for depth > 0)"),
  dependencies: z.array(z.string()).optional().default([]).describe("Task IDs this task depends on"),
  priority: z.enum(VALID_TASK_PRIORITIES).optional().describe("Task priority"),
  assigned_agent: z.enum(VALID_AGENT_ROLES).optional().describe("Agent role assigned to this task"),
  estimated_effort: z.string().optional().describe("Estimated effort string, e.g. '2h', '3d'"),
  tags: z.string().optional().default("").describe("Pipe-separated tags, e.g. '|auth|backend|'"),
  phase: z.string().optional().describe("Project phase this task belongs to"),
});

type CreateTaskArgs = z.infer<typeof CreateTaskInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface CreateTaskResult {
  task_id: string;
  depth: number;
  depth_name: string;
  status: string;
  is_blocked: boolean;
  created_at: string;
  parent_id: string | null;
  root_id: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Cycle detection (exported for unit testing)
// ────────────────────────────────────────────────────────────────────────────

interface Edge {
  from: string;
  to: string;
}

interface CycleDetectionResult {
  hasCycle: boolean;
}

/**
 * Detect cycles in a directed graph using DFS 3-color cycle detection.
 *
 * @param existingEdges - All existing edges in the graph (from_id -> to_id)
 * @param proposedEdges - New edges to add (from_id -> to_id)
 * @returns { hasCycle: boolean }
 */
export function detectCycles(
  existingEdges: Edge[],
  proposedEdges: Edge[],
): CycleDetectionResult {
  // Build adjacency map from all edges (existing + proposed)
  const adjacency = new Map<string, Set<string>>();

  const allEdges = [...existingEdges, ...proposedEdges];

  for (const edge of allEdges) {
    // Check for self-loop before building adjacency
    if (edge.from === edge.to) {
      return { hasCycle: true };
    }
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, new Set());
    }
    adjacency.get(edge.from)!.add(edge.to);
    // Ensure the "to" node exists in adjacency (even if it has no outgoing edges)
    if (!adjacency.has(edge.to)) {
      adjacency.set(edge.to, new Set());
    }
  }

  // DFS 3-color cycle detection
  // WHITE (0) = unvisited, GRAY (1) = in current path, BLACK (2) = fully visited
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  // Initialize all nodes as WHITE
  for (const node of adjacency.keys()) {
    color.set(node, WHITE);
  }

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    const neighbors = adjacency.get(node) ?? new Set<string>();
    for (const neighbor of neighbors) {
      if (color.get(neighbor) === GRAY) {
        // Back edge — cycle detected
        return true;
      }
      if (color.get(neighbor) === WHITE) {
        if (dfs(neighbor)) {
          return true;
        }
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const node of adjacency.keys()) {
    if (color.get(node) === WHITE) {
      if (dfs(node)) {
        return { hasCycle: true };
      }
    }
  }

  return { hasCycle: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function createTask(
  dbPath: string,
  projectId: string,
  args: CreateTaskArgs,
  config: SynapseConfig,
): Promise<CreateTaskResult> {
  // ── a. Validate input ──────────────────────────────────────────────────────
  const validated = CreateTaskInputSchema.parse(args);
  const db = await connectDb(dbPath);

  // ── b. Generate task ID ────────────────────────────────────────────────────
  const taskId = ulid();
  const now = new Date().toISOString();
  const depthName = DEPTH_NAMES[validated.depth] ?? "task";

  // ── c. Validate parent and compute root_id ─────────────────────────────────
  let rootId: string;
  let parentId: string | null = null;

  if (validated.depth === 0) {
    // Epics have no parent — root_id = task_id (self-referential)
    if (validated.parent_id) {
      throw new Error(
        `INVALID_DEPTH: Epics (depth=0) must not have a parent_id. Received parent_id='${validated.parent_id}'`,
      );
    }
    rootId = taskId;
  } else {
    // Non-epics require a parent_id
    if (!validated.parent_id) {
      throw new Error(
        `INVALID_DEPTH: Tasks with depth=${validated.depth} require a parent_id`,
      );
    }
    parentId = validated.parent_id;

    // Fetch the parent task
    const tasksTable = await db.openTable("tasks");
    const parentRows = await tasksTable
      .query()
      .where(`task_id = '${parentId}' AND project_id = '${projectId}'`)
      .limit(1)
      .toArray();

    if (parentRows.length === 0) {
      throw new Error(
        `TASK_NOT_FOUND: No task found with task_id='${parentId}' in project='${projectId}'`,
      );
    }

    const parent = parentRows[0];
    const parentDepth = parent.depth as number;

    // Validate depth: child depth must equal parent depth + 1
    if (validated.depth !== parentDepth + 1) {
      throw new Error(
        `INVALID_DEPTH: Task depth=${validated.depth} is not valid for parent depth=${parentDepth}. ` +
        `Child depth must be parent depth + 1 (expected ${parentDepth + 1})`,
      );
    }

    // Inherit root_id from parent
    rootId = parent.root_id as string;
  }

  // ── d. Validate dependencies exist ────────────────────────────────────────
  const dependencies = validated.dependencies ?? [];
  if (dependencies.length > 0) {
    const tasksTable = await db.openTable("tasks");
    for (const depId of dependencies) {
      const depRows = await tasksTable
        .query()
        .where(`task_id = '${depId}' AND project_id = '${projectId}'`)
        .limit(1)
        .toArray();

      if (depRows.length === 0) {
        throw new Error(
          `DEPENDENCY_NOT_FOUND: Dependency task_id='${depId}' not found in project='${projectId}'`,
        );
      }
    }
  }

  // ── e. Detect dependency cycles ────────────────────────────────────────────
  if (dependencies.length > 0) {
    // Fetch all existing task_depends_on relationships for this project
    const relTable = await db.openTable("relationships");
    const existingRels = await relTable
      .query()
      .where(`project_id = '${projectId}' AND type = 'task_depends_on'`)
      .toArray();

    const existingEdges: Edge[] = existingRels.map((r) => ({
      from: r.from_id as string,
      to: r.to_id as string,
    }));

    // Proposed edges: taskId depends on each dependency
    const proposedEdges: Edge[] = dependencies.map((depId) => ({
      from: taskId,
      to: depId,
    }));

    const { hasCycle } = detectCycles(existingEdges, proposedEdges);
    if (hasCycle) {
      throw new Error(
        `CYCLE_DETECTED: Adding dependencies ${JSON.stringify(dependencies)} for task '${taskId}' would create a dependency cycle`,
      );
    }
  }

  // ── f. Embed title+description ─────────────────────────────────────────────
  const embedText = `Title: ${validated.title}\n${validated.description}`;
  const vectors = await embed([embedText], projectId, config);
  const vector = vectors[0] ?? [];

  // ── g. Insert task row ─────────────────────────────────────────────────────
  const tasksTable = await db.openTable("tasks");
  await insertBatch(
    tasksTable,
    [
      {
        task_id: taskId,
        project_id: projectId,
        parent_id: parentId,
        root_id: rootId,
        depth: validated.depth,
        title: validated.title,
        description: validated.description,
        status: "pending",
        is_blocked: false, // will be recomputed after dependency insertion
        is_cancelled: false,
        block_reason: null,
        priority: validated.priority ?? null,
        assigned_agent: validated.assigned_agent ?? null,
        estimated_effort: validated.estimated_effort ?? null,
        tags: validated.tags ?? "",
        phase: validated.phase ?? null,
        created_at: now,
        updated_at: now,
        vector: vector.length === 768 ? vector : null,
      },
    ],
    TaskRowSchema,
  );

  // ── h. Insert dependency relationships ────────────────────────────────────
  if (dependencies.length > 0) {
    const relTable = await db.openTable("relationships");
    const relRows = dependencies.map((depId) => ({
      relationship_id: ulid(),
      project_id: projectId,
      from_id: taskId,   // the dependent (the task that HAS the dependency)
      to_id: depId,      // the dependency (the task it depends on / is blocked by)
      type: "task_depends_on",
      source: "create_task",
      created_at: now,
      metadata: null,
    }));
    await insertBatch(relTable, relRows, RelationshipRowSchema);
  }

  // ── i. Recompute is_blocked ────────────────────────────────────────────────
  let isBlocked = false;
  if (dependencies.length > 0) {
    const tasksTable2 = await db.openTable("tasks");
    // Fetch all dependency tasks and check if any is not done/cancelled
    for (const depId of dependencies) {
      const depRows = await tasksTable2
        .query()
        .where(`task_id = '${depId}' AND project_id = '${projectId}'`)
        .limit(1)
        .toArray();

      if (depRows.length > 0) {
        const dep = depRows[0];
        const depStatus = dep.status as string;
        const depCancelled = dep.is_cancelled as boolean;
        // is_blocked = true if any dependency is NOT (done or cancelled)
        if (depStatus !== "done" && !depCancelled) {
          isBlocked = true;
          break;
        }
      }
    }

    if (isBlocked) {
      await tasksTable2.update({
        where: `task_id = '${taskId}'`,
        values: { is_blocked: true },
      });
    }
  }

  // ── j. Log activity ───────────────────────────────────────────────────────
  await logActivity(db, projectId, "create_task", taskId, "task", {
    depth: validated.depth,
    parent_id: parentId,
  });

  // ── k. Return result ───────────────────────────────────────────────────────
  return {
    task_id: taskId,
    depth: validated.depth,
    depth_name: depthName,
    status: "pending",
    is_blocked: isBlocked,
    created_at: now,
    parent_id: parentId,
    root_id: rootId,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerCreateTaskTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "create_task",
    {
      description:
        "Create a task in the Synapse task hierarchy. Supports 4 depth levels (0=Epic, 1=Feature, " +
        "2=Component, 3=Task), dependency cycle detection, semantic description embedding, and " +
        "automatic is_blocked computation from dependencies.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        title: z.string().min(1).describe("Task title"),
        description: z.string().optional().describe("Task description (will be embedded)"),
        depth: z
          .number()
          .int()
          .min(0)
          .max(3)
          .describe("Hierarchy depth: 0=Epic, 1=Feature, 2=Component, 3=Task"),
        parent_id: z
          .string()
          .optional()
          .describe("Parent task ID (required for depth > 0, omitted for epics)"),
        dependencies: z
          .array(z.string())
          .optional()
          .describe("Array of task_ids this task depends on (must already exist)"),
        priority: z
          .enum(VALID_TASK_PRIORITIES)
          .optional()
          .describe("Task priority: critical, high, medium, or low"),
        assigned_agent: z
          .enum(VALID_AGENT_ROLES)
          .optional()
          .describe("Agent role to assign to this task"),
        estimated_effort: z
          .string()
          .optional()
          .describe("Estimated effort, e.g. '2h', '3d', '1w'"),
        tags: z.string().optional().describe("Pipe-separated tags, e.g. '|auth|backend|'"),
        phase: z.string().optional().describe("Project phase this task belongs to"),
      }),
    },
    async (args) => {
      const log = createToolLogger("create_task");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = CreateTaskInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          title: parsed.title,
          depth: parsed.depth,
          parentId: parsed.parent_id,
        },
        "create_task invoked",
      );

      try {
        const data = await createTask(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<CreateTaskResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            taskId: data.task_id,
            depth: data.depth,
            depthName: data.depth_name,
            isBlocked: data.is_blocked,
          },
          "create_task complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "create_task failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}

// Export constants for callers that need them alongside this module
export { VALID_DEPTHS, DEPTH_NAMES, VALID_TASK_STATUSES, VALID_TASK_PRIORITIES, VALID_AGENT_ROLES };
