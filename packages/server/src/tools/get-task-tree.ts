import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { DEPTH_NAMES, VALID_AGENT_ROLES, VALID_TASK_STATUSES } from "./task-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const GetTaskTreeInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  root_task_id: z.string().min(1).describe("Task ID to use as tree root (can be any depth)"),
  max_depth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum relative depth from root (default: 5)"),
  max_tasks: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(200)
    .describe("Maximum number of tasks to include (default: 200)"),
  filters: z
    .object({
      status: z.enum(VALID_TASK_STATUSES).optional(),
      assigned_agent: z.enum(VALID_AGENT_ROLES).optional(),
      is_blocked: z.boolean().optional(),
      depth: z.number().int().min(0).max(3).optional(),
    })
    .optional()
    .describe("Optional filters — unmatched nodes shown as collapsed for hierarchy context"),
});

type GetTaskTreeArgs = z.infer<typeof GetTaskTreeInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface RollupStats {
  total_descendants: number;
  done_count: number;
  blocked_count: number;
  in_progress_count: number;
  children_all_done: boolean;
  completion_percentage: number;
}

export interface TaskTreeNode {
  task_id: string;
  title: string;
  description: string;
  depth: number;
  depth_name: string;
  status: string;
  is_blocked: boolean;
  is_cancelled: boolean;
  block_reason: string | null;
  priority: string | null;
  assigned_agent: string | null;
  estimated_effort: string | null;
  tags: string;
  phase: string | null;
  context_doc_ids: string | null;
  context_decision_ids: string | null;
  spec: string | null;
  output_doc_ids: string | null;
  parent_id: string | null;
  dependency_ids: string[];
  created_at: string;
  updated_at: string;
  children: TaskTreeNode[];
  rollup: RollupStats;
  collapsed?: boolean; // true if node doesn't match filters but shown for hierarchy context
}

export interface GetTaskTreeResult {
  tree: TaskTreeNode;
  truncated: boolean;
  truncated_count: number;
  total_tasks: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute rollup stats for a node post-order (bottom-up after children assembled).
 * Mutates the node's rollup in-place and returns it.
 */
function computeRollup(node: TaskTreeNode): RollupStats {
  if (node.children.length === 0) {
    // Leaf node — no descendants
    node.rollup = {
      total_descendants: 0,
      done_count: 0,
      blocked_count: 0,
      in_progress_count: 0,
      children_all_done: false, // leaf: vacuously false (no children to be "all done")
      completion_percentage: 0,
    };
    return node.rollup;
  }

  // Recurse: compute rollup for all children first
  for (const child of node.children) {
    computeRollup(child);
  }

  // Aggregate from direct children
  let totalDescendants = 0;
  let doneCount = 0;
  let blockedCount = 0;
  let inProgressCount = 0;

  // children_all_done: true IFF ALL direct children have status "done"
  const allDirectChildrenDone = node.children.every((c) => c.status === "done");

  for (const child of node.children) {
    // Count the child itself
    totalDescendants++;
    if (child.status === "done") doneCount++;
    if (child.is_blocked) blockedCount++;
    if (child.status === "in_progress") inProgressCount++;

    // Add child's descendants
    totalDescendants += child.rollup.total_descendants;
    doneCount += child.rollup.done_count;
    blockedCount += child.rollup.blocked_count;
    inProgressCount += child.rollup.in_progress_count;
  }

  const completionPercentage =
    totalDescendants > 0 ? Math.round((doneCount / totalDescendants) * 100) : 0;

  node.rollup = {
    total_descendants: totalDescendants,
    done_count: doneCount,
    blocked_count: blockedCount,
    in_progress_count: inProgressCount,
    children_all_done: allDirectChildrenDone,
    completion_percentage: completionPercentage,
  };

  return node.rollup;
}

/**
 * Apply filters to the tree. Nodes that don't match are marked as collapsed=true
 * and their description replaced with "[collapsed]". Ancestors of matching nodes
 * are kept (not collapsed) for hierarchy context.
 *
 * Root node is always shown regardless of filters.
 */
function applyFilters(
  node: TaskTreeNode,
  filters: NonNullable<GetTaskTreeArgs["filters"]>,
  isRoot: boolean,
): boolean {
  // Check if this node matches the filter
  let matches = true;

  if (filters.status !== undefined && node.status !== filters.status) {
    matches = false;
  }
  if (filters.assigned_agent !== undefined && node.assigned_agent !== filters.assigned_agent) {
    matches = false;
  }
  if (filters.is_blocked !== undefined && node.is_blocked !== filters.is_blocked) {
    matches = false;
  }
  if (filters.depth !== undefined && node.depth !== filters.depth) {
    matches = false;
  }

  // Recursively apply to children; track if any descendant matches
  let anyDescendantMatches = false;
  for (const child of node.children) {
    const childOrDescendantMatches = applyFilters(child, filters, false);
    if (childOrDescendantMatches) {
      anyDescendantMatches = true;
    }
  }

  // A node is shown (not collapsed) if:
  // 1. It's the root (always shown), OR
  // 2. It matches the filter, OR
  // 3. A descendant matches (ancestor path for context)
  const shouldShow = isRoot || matches || anyDescendantMatches;

  if (!shouldShow) {
    // Collapse this node
    node.collapsed = true;
    node.description = "[collapsed]";
  }

  return matches || anyDescendantMatches;
}

export async function getTaskTree(
  dbPath: string,
  projectId: string,
  args: GetTaskTreeArgs,
): Promise<GetTaskTreeResult> {
  // ── a. Validate input ──────────────────────────────────────────────────────
  const validated = GetTaskTreeInputSchema.parse(args);
  const db = await connectDb(dbPath);

  // ── b. Fetch all tasks for the subtree in ONE query ────────────────────────
  // Use root_id denormalization: fetch the root task first, then fetch all tasks
  // sharing the same root_id (the epic root), then filter to the requested subtree.
  const rootTaskId = validated.root_task_id;
  const tasksTable = await db.openTable("tasks");

  // First, fetch the root task itself to get its root_id (epic anchor)
  const rootTaskRows = await tasksTable
    .query()
    .where(`task_id = '${rootTaskId}' AND project_id = '${projectId}'`)
    .limit(1)
    .toArray();

  if (rootTaskRows.length === 0) {
    throw new Error(
      `TASK_NOT_FOUND: No task found with task_id='${rootTaskId}' in project='${projectId}'`,
    );
  }

  const rootTaskRow = rootTaskRows[0];
  if (!rootTaskRow) throw new Error(`Expected root task row for task_id='${rootTaskId}'`);
  const epicRootId = rootTaskRow.root_id as string; // The epic-level root_id

  // Fetch ALL tasks in the epic subtree using root_id denormalization (single query)
  // root_id = epicRootId fetches all descendants; task_id = epicRootId fetches the epic itself
  const allEpicRows = await tasksTable
    .query()
    .where(
      `(root_id = '${epicRootId}' OR task_id = '${epicRootId}') AND project_id = '${projectId}'`,
    )
    .toArray();

  // The requested root task and all rows we'll work with
  const rootId = rootTaskId;

  // Total tasks = all tasks in the epic subtree (before our subtree cap)
  // We'll report total_tasks = rows in the requested subtree
  const allRows = allEpicRows;

  const totalTasks = allRows.length;

  // ── c. Fetch all dependency relationships for this project ─────────────────
  const relTable = await db.openTable("relationships");
  const allDepRels = await relTable
    .query()
    .where(`project_id = '${projectId}' AND type = 'task_depends_on'`)
    .toArray();

  // Build dependency map: from_id -> [to_ids]
  const depMap = new Map<string, string[]>();
  for (const rel of allDepRels) {
    const fromId = rel.from_id as string;
    const toId = rel.to_id as string;
    if (!depMap.has(fromId)) {
      depMap.set(fromId, []);
    }
    depMap.get(fromId)?.push(toId);
  }

  // ── d. Build parent->children map ─────────────────────────────────────────
  // Map from parent_id -> array of child rows (sorted by created_at for stable ordering)
  const childrenMap = new Map<string, typeof allRows>();
  const taskMap = new Map<string, (typeof allRows)[0]>();

  for (const row of allRows) {
    const taskId = row.task_id as string;
    taskMap.set(taskId, row);
  }

  for (const row of allRows) {
    const parentId = row.parent_id as string | null;
    if (parentId !== null && taskMap.has(parentId)) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(row);
    }
  }

  // ── e. BFS tree assembly with depth and task caps ─────────────────────────
  const maxDepth = validated.max_depth;
  const maxTasks = validated.max_tasks;

  let tasksIncluded = 0;
  let truncated = false;
  let truncatedCount = 0;

  // Map from task_id to assembled TaskTreeNode (so we can attach children to parents)
  const nodeMap = new Map<string, TaskTreeNode>();

  // BFS queue: { taskId, relativeDepth }
  const queue: Array<{ taskId: string; relativeDepth: number }> = [
    { taskId: rootId, relativeDepth: 0 },
  ];

  let rootNode: TaskTreeNode | null = null;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break; // Guarded by queue.length > 0, but satisfies type checker
    const { taskId, relativeDepth } = item;

    const row = taskMap.get(taskId);
    if (!row) continue; // task not in subtree (shouldn't happen)

    // Check caps
    if (tasksIncluded >= maxTasks) {
      truncated = true;
      truncatedCount++;
      continue;
    }

    if (relativeDepth >= maxDepth) {
      truncated = true;
      // Count how many tasks are in this subtree that we're skipping
      // Count children recursively
      const countSubtree = (tid: string): number => {
        let count = 1; // this node
        const children = childrenMap.get(tid) ?? [];
        for (const child of children) {
          count += countSubtree(child.task_id as string);
        }
        return count;
      };
      // We're skipping this task and its subtree
      const skippedCount = countSubtree(taskId);
      truncatedCount += skippedCount;
      continue;
    }

    // Create the tree node (no vector field)
    const node: TaskTreeNode = {
      task_id: row.task_id as string,
      title: row.title as string,
      description: row.description as string,
      depth: row.depth as number,
      depth_name: DEPTH_NAMES[row.depth as number] ?? "task",
      status: row.status as string,
      is_blocked: row.is_blocked as boolean,
      is_cancelled: row.is_cancelled as boolean,
      block_reason: row.block_reason as string | null,
      priority: row.priority as string | null,
      assigned_agent: row.assigned_agent as string | null,
      estimated_effort: row.estimated_effort as string | null,
      tags: row.tags as string,
      phase: row.phase as string | null,
      context_doc_ids: row.context_doc_ids as string | null,
      context_decision_ids: row.context_decision_ids as string | null,
      spec: row.spec as string | null,
      output_doc_ids: row.output_doc_ids as string | null,
      parent_id: row.parent_id as string | null,
      dependency_ids: depMap.get(taskId) ?? [],
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      children: [],
      rollup: {
        total_descendants: 0,
        done_count: 0,
        blocked_count: 0,
        in_progress_count: 0,
        children_all_done: false,
        completion_percentage: 0,
      },
    };

    nodeMap.set(taskId, node);
    tasksIncluded++;

    if (taskId === rootId) {
      rootNode = node;
    }

    // Attach to parent
    const parentId = row.parent_id as string | null;
    if (parentId !== null && nodeMap.has(parentId)) {
      nodeMap.get(parentId)?.children.push(node);
    }

    // Enqueue children (sorted by created_at for stable order)
    const children = (childrenMap.get(taskId) ?? []).sort((a, b) => {
      const aAt = a.created_at as string;
      const bAt = b.created_at as string;
      return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
    });

    for (const child of children) {
      queue.push({ taskId: child.task_id as string, relativeDepth: relativeDepth + 1 });
    }
  }

  if (!rootNode) {
    throw new Error(
      `TASK_NOT_FOUND: No task found with task_id='${rootId}' in project='${projectId}'`,
    );
  }

  // ── f. Apply filters (if provided) ────────────────────────────────────────
  if (
    validated.filters &&
    Object.keys(validated.filters).some((k) => {
      const v = (validated.filters as Record<string, unknown>)[k];
      return v !== undefined;
    })
  ) {
    applyFilters(rootNode, validated.filters, true);
  }

  // ── g. Compute rollup stats bottom-up (post-order DFS) ────────────────────
  computeRollup(rootNode);

  return {
    tree: rootNode,
    truncated,
    truncated_count: truncatedCount,
    total_tasks: totalTasks,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerGetTaskTreeTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "get_task_tree",
    {
      description:
        "Retrieve a task hierarchy tree rooted at any task. Returns nested structure with rollup " +
        "statistics (total/done/blocked/in_progress counts, children_all_done signal, completion " +
        "percentage). Supports BFS traversal with depth (5) and task count (200) caps. Optional " +
        "filters for status, assigned_agent, is_blocked, and depth. Uses root_id denormalization " +
        "for single-query subtree fetch.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        root_task_id: z
          .string()
          .min(1)
          .describe(
            "Task ID to use as tree root (can be any depth: epic, feature, component, task)",
          ),
        max_depth: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Maximum relative depth from root (default: 5)"),
        max_tasks: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Maximum number of tasks to include (default: 200)"),
        filters: z
          .object({
            status: z
              .enum(VALID_TASK_STATUSES)
              .optional()
              .describe("Filter to show only tasks with this status"),
            assigned_agent: z
              .enum(VALID_AGENT_ROLES)
              .optional()
              .describe("Filter to show only tasks assigned to this agent"),
            is_blocked: z
              .boolean()
              .optional()
              .describe("Filter to show only blocked (true) or unblocked (false) tasks"),
            depth: z
              .number()
              .int()
              .min(0)
              .max(3)
              .optional()
              .describe("Filter to show only tasks at this absolute depth level"),
          })
          .optional()
          .describe("Optional filters — unmatched nodes shown as collapsed for hierarchy context"),
      }),
    },
    async (args) => {
      const log = createToolLogger("get_task_tree");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = GetTaskTreeInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          rootTaskId: parsed.root_task_id,
          maxDepth: parsed.max_depth,
          maxTasks: parsed.max_tasks,
        },
        "get_task_tree invoked",
      );

      try {
        const data = await getTaskTree(dbPath, parsed.project_id, parsed);
        const result: ToolResult<GetTaskTreeResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            totalTasks: data.total_tasks,
            truncated: data.truncated,
          },
          "get_task_tree complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "get_task_tree failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
