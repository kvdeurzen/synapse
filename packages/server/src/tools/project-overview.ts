import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";
import { getTaskTree } from "./get-task-tree.js";
import type { TaskTreeNode } from "./get-task-tree.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const ProjectOverviewInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
});

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectOverviewResult {
  project_id: string;
  counts_by_category: Record<string, number>;
  counts_by_status: Record<string, number>;
  total_documents: number;
  recent_activity: Array<{
    action: string;
    target_id: string | null;
    target_type: string | null;
    created_at: string;
  }>;
  key_documents: Array<{
    doc_id: string;
    title: string;
    category: string;
    status: string;
    priority: number;
  }>;

  // NEW: Task tree progress per epic
  task_progress?: {
    epics: Array<{
      task_id: string;
      title: string;
      priority: string | null;
      status: string;
      rpev_stage: string | null;
      rollup: {
        total_descendants: number;
        done_count: number;
        blocked_count: number;
        in_progress_count: number;
        completion_percentage: number;
      };
      rpev_stage_counts?: {
        refining: number;
        planning: number;
        executing: number;
        validating: number;
        done: number;
      };
    }>;
    total_epics: number;
  };

  // NEW: Pool status
  pool_status?: {
    active_slots: number;
    total_slots: number;
    queued_count: number;
    slots: Array<{
      letter: string;
      task_id: string | null;
      task_title: string | null;
      agent_type: string | null;
      epic_title: string | null;
    }>;
  };

  // NEW: Items needing user attention
  needs_attention?: {
    approval_needed: Array<{
      task_id: string;
      title: string;
      level: string;
      stage: string;
      involvement: string;
    }>;
    failed: Array<{
      task_id: string;
      title: string;
      level: string;
      notes: string;
    }>;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Collect all task_ids from a tree node and its descendants.
 */
function collectTaskIds(node: TaskTreeNode, result: Set<string>): void {
  result.add(node.task_id);
  for (const child of node.children) {
    collectTaskIds(child, result);
  }
}

/**
 * Find a task node by task_id in a tree (BFS).
 */
function findNodeInTree(node: TaskTreeNode, taskId: string): TaskTreeNode | null {
  if (node.task_id === taskId) return node;
  for (const child of node.children) {
    const found = findNodeInTree(child, taskId);
    if (found) return found;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function projectOverview(
  dbPath: string,
  projectId: string,
): Promise<ProjectOverviewResult> {
  const db = await connectDb(dbPath);
  const docsTable = await db.openTable("documents");
  const activityTable = await db.openTable("activity_log");

  // ── 1. Total documents (excluding superseded) ────────────────────────────
  const totalDocuments = await docsTable.countRows(
    `project_id = '${projectId}' AND status != 'superseded'`,
  );

  // ── 2. Counts by category (excluding superseded, only non-zero) ──────────
  const countsByCategory: Record<string, number> = {};
  for (const cat of VALID_CATEGORIES) {
    const count = await docsTable.countRows(
      `project_id = '${projectId}' AND category = '${cat}' AND status != 'superseded'`,
    );
    if (count > 0) {
      countsByCategory[cat] = count;
    }
  }

  // ── 3. Counts by status (excluding superseded, only non-zero) ────────────
  const countsByStatus: Record<string, number> = {};
  for (const status of VALID_STATUSES) {
    if (status === "superseded") continue; // Exclude superseded from status summary
    const count = await docsTable.countRows(`project_id = '${projectId}' AND status = '${status}'`);
    if (count > 0) {
      countsByStatus[status] = count;
    }
  }

  // ── 4. Recent activity (last 5 by created_at desc) ────────────────────────
  // LanceDB doesn't support ORDER BY in .where() predicate — fetch a larger
  // window and sort in JS, then take first 5.
  const activityRows = await activityTable
    .query()
    .where(`project_id = '${projectId}'`)
    .limit(50)
    .toArray();

  const sortedActivity = activityRows
    .sort((a, b) => (b.created_at as string).localeCompare(a.created_at as string))
    .slice(0, 5)
    .map((row) => ({
      action: row.action as string,
      target_id: (row.target_id as string | null) ?? null,
      target_type: (row.target_type as string | null) ?? null,
      created_at: row.created_at as string,
    }));

  // ── 5. Key documents (priority >= 4, non-superseded) ─────────────────────
  const keyDocRows = await docsTable
    .query()
    .where(`project_id = '${projectId}' AND priority >= 4 AND status != 'superseded'`)
    .limit(20)
    .toArray();

  const keyDocuments = keyDocRows.map((row) => ({
    doc_id: row.doc_id as string,
    title: row.title as string,
    category: row.category as string,
    status: row.status as string,
    priority: row.priority as number,
  }));

  // ── 6. Task tree progress (per epic) ─────────────────────────────────────
  let taskProgress: ProjectOverviewResult["task_progress"];
  let needsAttention: ProjectOverviewResult["needs_attention"];

  // Store tree results for each epic to use in stage_counts lookup
  const epicTreeResults: Map<string, TaskTreeNode> = new Map();

  try {
    const tasksTable = await db.openTable("tasks");
    // Query all depth=0 tasks (epics)
    const epicRows = await tasksTable
      .query()
      .where(`project_id = '${projectId}' AND depth = 0`)
      .toArray();

    if (epicRows.length > 0) {
      const epics: NonNullable<ProjectOverviewResult["task_progress"]>["epics"] = [];

      for (const epicRow of epicRows) {
        const epicId = epicRow.task_id as string;
        try {
          const treeResult = await getTaskTree(dbPath, projectId, {
            project_id: projectId,
            root_task_id: epicId,
            max_depth: 5,
            max_tasks: 200,
          });
          epicTreeResults.set(epicId, treeResult.tree);

          epics.push({
            task_id: epicId,
            title: epicRow.title as string,
            priority: epicRow.priority as string | null,
            status: epicRow.status as string,
            rpev_stage: null, // will be set in Section 7
            rollup: {
              total_descendants: treeResult.tree.rollup.total_descendants,
              done_count: treeResult.tree.rollup.done_count,
              blocked_count: treeResult.tree.rollup.blocked_count,
              in_progress_count: treeResult.tree.rollup.in_progress_count,
              completion_percentage: treeResult.tree.rollup.completion_percentage,
            },
          });
        } catch {
          // Skip epic on failure
        }
      }

      taskProgress = {
        epics,
        total_epics: epics.length,
      };

      // Initialize needs_attention (will be populated in Section 7)
      needsAttention = {
        approval_needed: [],
        failed: [],
      };
    }
  } catch {
    // Tasks table doesn't exist (new project) — leave task_progress undefined
  }

  // ── 7. RPEV stage documents ───────────────────────────────────────────────
  if (taskProgress) {
    try {
      const stageRows = await docsTable
        .query()
        .where(
          `project_id = '${projectId}' AND category = 'plan' AND tags LIKE '%|rpev-stage|%' AND status != 'superseded'`,
        )
        .limit(100)
        .toArray();

      // Build map of task_id -> parsed stage content
      interface StageContent {
        stage: string;
        level: string;
        task_id: string;
        involvement: string;
        pending_approval: boolean;
        proposal_doc_id: string | null;
        last_updated: string;
        notes: string;
      }

      const stageByTaskId = new Map<string, StageContent>();
      for (const stageRow of stageRows) {
        try {
          const content = JSON.parse(stageRow.content as string) as StageContent;
          if (content.task_id) {
            stageByTaskId.set(content.task_id, content);
          }
        } catch {
          // Skip malformed content
        }
      }

      // Match stage docs to epics and set rpev_stage
      for (const epic of taskProgress.epics) {
        const stageDoc = stageByTaskId.get(epic.task_id);
        if (stageDoc) {
          epic.rpev_stage = stageDoc.stage;
        }
      }

      // Build rpev_stage_counts per epic: walk the tree to find all task_ids in each epic,
      // then count stage docs for those task_ids
      for (const epic of taskProgress.epics) {
        const epicTree = epicTreeResults.get(epic.task_id);
        if (!epicTree) continue;

        // Collect all task_ids in this epic's tree
        const allTaskIds = new Set<string>();
        collectTaskIds(epicTree, allTaskIds);

        // Count stages for child tasks (not the epic itself)
        const stageCounts = {
          refining: 0,
          planning: 0,
          executing: 0,
          validating: 0,
          done: 0,
        };

        let hasAnyStageCounts = false;
        for (const taskId of allTaskIds) {
          if (taskId === epic.task_id) continue; // Skip epic itself
          const stageDoc = stageByTaskId.get(taskId);
          if (stageDoc) {
            hasAnyStageCounts = true;
            const stageLower = stageDoc.stage.toLowerCase();
            if (stageLower === "refining") stageCounts.refining++;
            else if (stageLower === "planning") stageCounts.planning++;
            else if (stageLower === "executing") stageCounts.executing++;
            else if (stageLower === "validating") stageCounts.validating++;
            else if (stageLower === "done") stageCounts.done++;
          }
        }

        if (hasAnyStageCounts) {
          epic.rpev_stage_counts = stageCounts;
        }
      }

      // Build needs_attention from stage docs
      if (needsAttention) {
        for (const [taskId, stageDoc] of stageByTaskId) {
          // Find the title from the epic trees
          let title = "";
          for (const [, epicTree] of epicTreeResults) {
            const node = findNodeInTree(epicTree, taskId);
            if (node) {
              title = node.title;
              break;
            }
          }
          // Fallback: try the stage doc itself doesn't store title, use task_id
          if (!title) title = taskId;

          // Check for approval_needed
          if (stageDoc.pending_approval === true) {
            needsAttention.approval_needed.push({
              task_id: taskId,
              title,
              level: stageDoc.level,
              stage: stageDoc.stage,
              involvement: stageDoc.involvement,
            });
          }

          // Check for failure notes
          if (stageDoc.notes && /retries? exhausted|failed|needs guidance/i.test(stageDoc.notes)) {
            needsAttention.failed.push({
              task_id: taskId,
              title,
              level: stageDoc.level,
              notes: stageDoc.notes,
            });
          }
        }
      }
    } catch {
      // Stage document query failed — leave needs_attention with empty arrays
    }
  }

  // ── 8. Pool state document ───────────────────────────────────────────────
  let poolStatus: ProjectOverviewResult["pool_status"];

  try {
    const poolRows = await docsTable
      .query()
      .where(`project_id = '${projectId}' AND tags LIKE '%|pool-state|%' AND status != 'superseded'`)
      .limit(1)
      .toArray();

    if (poolRows.length > 0) {
      const poolRow = poolRows[0];
      if (poolRow) {
        try {
          interface SlotData {
            task_id?: string;
            task_title?: string;
            agent_type?: string;
            epic_title?: string;
          }
          interface PoolContent {
            project_id: string;
            max_slots: number;
            slots: Record<string, SlotData | null>;
            queue: Array<{ task_id: string; task_title: string; epic_id: string; type: string }>;
            tokens_by_task: Record<string, number>;
            last_updated: string;
          }

          const content = JSON.parse(poolRow.content as string) as PoolContent;

          // Build slots array
          const slotsArray: NonNullable<ProjectOverviewResult["pool_status"]>["slots"] = [];
          let activeCount = 0;

          for (const [letter, slotData] of Object.entries(content.slots)) {
            if (slotData !== null && slotData !== undefined) {
              activeCount++;
              slotsArray.push({
                letter,
                task_id: slotData.task_id ?? null,
                task_title: slotData.task_title ?? null,
                agent_type: slotData.agent_type ?? null,
                epic_title: slotData.epic_title ?? null,
              });
            } else {
              slotsArray.push({
                letter,
                task_id: null,
                task_title: null,
                agent_type: null,
                epic_title: null,
              });
            }
          }

          poolStatus = {
            active_slots: activeCount,
            total_slots: content.max_slots,
            queued_count: content.queue.length,
            slots: slotsArray,
          };
        } catch {
          // Malformed pool-state content — skip
        }
      }
    }
  } catch {
    // Pool-state query failed — leave pool_status undefined
  }

  return {
    project_id: projectId,
    counts_by_category: countsByCategory,
    counts_by_status: countsByStatus,
    total_documents: totalDocuments,
    recent_activity: sortedActivity,
    key_documents: keyDocuments,
    task_progress: taskProgress,
    pool_status: poolStatus,
    needs_attention: needsAttention,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerProjectOverviewTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "project_overview",
    {
      description:
        "Get a dashboard summary of a project: document counts by category and status, " +
        "recent activity (last 5 actions), and key documents (priority >= 4). " +
        "Superseded documents are excluded from all counts. " +
        "Also returns task tree progress per epic (with rollup stats and RPEV stage), " +
        "pool status, and items needing user attention when tasks exist. " +
        "Provides a quick read on project state without browsing individual documents.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("project_overview");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = ProjectOverviewInputSchema.parse(args);
      log.info({ projectId: parsed.project_id }, "project_overview invoked");

      try {
        const data = await projectOverview(dbPath, parsed.project_id);
        const result: ToolResult<ProjectOverviewResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            totalDocuments: data.total_documents,
          },
          "project_overview complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error(
          { error: String(err), durationMs: Date.now() - start },
          "project_overview failed",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
