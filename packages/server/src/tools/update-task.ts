import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import { RelationshipRowSchema } from "../db/schema.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import { embed } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { detectCycles } from "./create-task.js";
import { VALID_AGENT_ROLES, VALID_TASK_PRIORITIES, VALID_TASK_STATUSES } from "./task-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const UpdateTaskInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  task_id: z.string().min(1).describe("Task ID to update"),
  status: z.enum(VALID_TASK_STATUSES).optional().describe("New task lifecycle status"),
  title: z.string().min(1).optional().describe("New task title (triggers re-embedding)"),
  description: z.string().optional().describe("New task description (triggers re-embedding)"),
  priority: z
    .enum(VALID_TASK_PRIORITIES)
    .optional()
    .nullable()
    .describe("Task priority (nullable to clear)"),
  assigned_agent: z
    .enum(VALID_AGENT_ROLES)
    .optional()
    .nullable()
    .describe("Assigned agent role (nullable to unassign)"),
  estimated_effort: z
    .string()
    .optional()
    .nullable()
    .describe("Estimated effort string, e.g. '2h', '3d'"),
  is_blocked: z
    .boolean()
    .optional()
    .describe("Manual is_blocked override (true = blocked, false = unblocked)"),
  is_cancelled: z.boolean().optional().describe("Mark task as cancelled"),
  block_reason: z
    .string()
    .optional()
    .nullable()
    .describe("Human-readable reason for block (nullable to clear)"),
  tags: z.string().optional().describe("Pipe-separated tags, e.g. '|auth|backend|'"),
  phase: z.string().optional().nullable().describe("Project phase (nullable to clear)"),
  context_doc_ids: z
    .string()
    .optional()
    .nullable()
    .describe("JSON array string of context document IDs (nullable to clear)"),
  context_decision_ids: z
    .string()
    .optional()
    .nullable()
    .describe("JSON array string of context decision IDs (nullable to clear)"),
  spec: z
    .string()
    .optional()
    .nullable()
    .describe("Detailed task specification for the assigned agent (nullable to clear)"),
  output_doc_ids: z
    .string()
    .optional()
    .nullable()
    .describe("JSON array string of output document IDs produced by this task (nullable to clear)"),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("New dependency list — replaces ALL existing dependencies"),
});

type UpdateTaskArgs = z.infer<typeof UpdateTaskInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface UpdateTaskResult {
  task_id: string;
  status: string;
  is_blocked: boolean;
  is_cancelled: boolean;
  updated_at: string;
  changed_fields: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// is_blocked recomputation helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recompute is_blocked for a single task based on its dependency states.
 *
 * Logic:
 * - If no dependencies: set is_blocked = false (unless there's a manual block_reason)
 * - If dependencies exist: is_blocked = true if ANY dependency is neither done nor cancelled
 */
export async function recomputeIsBlocked(
  db: Awaited<ReturnType<typeof connectDb>>,
  projectId: string,
  taskId: string,
): Promise<void> {
  // Fetch all task_depends_on relationships where from_id = taskId
  const relTable = await db.openTable("relationships");
  const depRels = await relTable
    .query()
    .where(`project_id = '${projectId}' AND type = 'task_depends_on' AND from_id = '${taskId}'`)
    .toArray();

  const tasksTable = await db.openTable("tasks");

  // Fetch current task to check block_reason
  const currentRows = await tasksTable
    .query()
    .where(`task_id = '${taskId}' AND project_id = '${projectId}'`)
    .limit(1)
    .toArray();

  if (currentRows.length === 0) return;

  const now = new Date().toISOString();

  if (depRels.length === 0) {
    // No dependencies — use manual block_reason if set, otherwise unblock
    const hasBlockReason = currentRows[0]?.block_reason != null;
    const isBlocked = hasBlockReason ? (currentRows[0]?.is_blocked as boolean) : false;
    await tasksTable.update({
      where: `task_id = '${taskId}' AND project_id = '${projectId}'`,
      values: { is_blocked: isBlocked, updated_at: now },
    });
    return;
  }

  // Fetch all dependency tasks
  const depIds = depRels.map((r) => r.to_id as string);

  // Guard: if depIds is empty, don't run IN-clause query (shouldn't happen since depRels.length > 0)
  if (depIds.length === 0) {
    await tasksTable.update({
      where: `task_id = '${taskId}' AND project_id = '${projectId}'`,
      values: { is_blocked: false, updated_at: now },
    });
    return;
  }

  // Fetch all dependency rows
  const depIdList = depIds.map((id) => `'${id}'`).join(", ");
  const depRows = await tasksTable
    .query()
    .where(`project_id = '${projectId}' AND task_id IN (${depIdList})`)
    .toArray();

  // is_blocked = true if ANY dep is not (done or cancelled)
  const isBlocked = depRows.some((dep) => dep.status !== "done" && !(dep.is_cancelled as boolean));

  await tasksTable.update({
    where: `task_id = '${taskId}' AND project_id = '${projectId}'`,
    values: { is_blocked: isBlocked, updated_at: now },
  });
}

/**
 * Recompute is_blocked for all DIRECT dependents of a given task.
 * Called when a task's status changes to "done" or is_cancelled becomes true.
 */
export async function recomputeDependentsIsBlocked(
  db: Awaited<ReturnType<typeof connectDb>>,
  projectId: string,
  taskId: string,
): Promise<void> {
  // Fetch all task_depends_on relationships where to_id = taskId (tasks that depend on THIS task)
  const relTable = await db.openTable("relationships");
  const dependentRels = await relTable
    .query()
    .where(`project_id = '${projectId}' AND type = 'task_depends_on' AND to_id = '${taskId}'`)
    .toArray();

  // Recompute is_blocked for each direct dependent
  for (const rel of dependentRels) {
    const dependentId = rel.from_id as string;
    await recomputeIsBlocked(db, projectId, dependentId);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function updateTask(
  dbPath: string,
  projectId: string,
  args: UpdateTaskArgs,
  config: SynapseConfig,
): Promise<UpdateTaskResult> {
  // ── a. Validate input ──────────────────────────────────────────────────────
  const validated = UpdateTaskInputSchema.parse(args);
  const db = await connectDb(dbPath);

  // ── b. Fetch existing task row ─────────────────────────────────────────────
  const tasksTable = await db.openTable("tasks");
  const existingRows = await tasksTable
    .query()
    .where(`task_id = '${validated.task_id}' AND project_id = '${validated.project_id}'`)
    .limit(1)
    .toArray();

  if (existingRows.length === 0) {
    throw new Error(
      `TASK_NOT_FOUND: No task found with task_id='${validated.task_id}' in project='${validated.project_id}'`,
    );
  }

  const existing = existingRows[0];
  if (!existing) throw new Error(`Expected existing row for task_id='${validated.task_id}'`);

  // ── c. Validate transition ─────────────────────────────────────────────────
  // Cannot set status=done on an already-cancelled task
  if ((existing.is_cancelled as boolean) && validated.status === "done") {
    throw new Error(
      `INVALID_TRANSITION: Cannot set status='done' on a cancelled task (task_id='${validated.task_id}')`,
    );
  }

  // ── d. Build update values and track changed fields ────────────────────────
  const updateValues: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if (validated.status !== undefined) {
    updateValues.status = validated.status;
    changedFields.push("status");
  }
  if (validated.priority !== undefined) {
    updateValues.priority = validated.priority;
    changedFields.push("priority");
  }
  if (validated.assigned_agent !== undefined) {
    updateValues.assigned_agent = validated.assigned_agent;
    changedFields.push("assigned_agent");
  }
  if (validated.estimated_effort !== undefined) {
    updateValues.estimated_effort = validated.estimated_effort;
    changedFields.push("estimated_effort");
  }
  if (validated.is_blocked !== undefined) {
    updateValues.is_blocked = validated.is_blocked;
    changedFields.push("is_blocked");
  }
  if (validated.is_cancelled !== undefined) {
    updateValues.is_cancelled = validated.is_cancelled;
    changedFields.push("is_cancelled");
  }
  if (validated.block_reason !== undefined) {
    updateValues.block_reason = validated.block_reason;
    changedFields.push("block_reason");
  }
  if (validated.tags !== undefined) {
    updateValues.tags = validated.tags;
    changedFields.push("tags");
  }
  if (validated.phase !== undefined) {
    updateValues.phase = validated.phase;
    changedFields.push("phase");
  }
  if (validated.context_doc_ids !== undefined) {
    updateValues.context_doc_ids = validated.context_doc_ids;
    changedFields.push("context_doc_ids");
  }
  if (validated.context_decision_ids !== undefined) {
    updateValues.context_decision_ids = validated.context_decision_ids;
    changedFields.push("context_decision_ids");
  }
  if (validated.spec !== undefined) {
    updateValues.spec = validated.spec;
    changedFields.push("spec");
  }
  if (validated.output_doc_ids !== undefined) {
    updateValues.output_doc_ids = validated.output_doc_ids;
    changedFields.push("output_doc_ids");
  }

  // ── e. Handle dependency replacement ──────────────────────────────────────
  if (validated.dependencies !== undefined) {
    const relTable = await db.openTable("relationships");

    // 1. Fetch existing dependency edges for this task
    const existingDepRels = await relTable
      .query()
      .where(
        `project_id = '${projectId}' AND type = 'task_depends_on' AND from_id = '${validated.task_id}'`,
      )
      .toArray();

    // 2. Build "what if" graph: all existing project edges MINUS this task's current edges PLUS proposed new edges
    const allProjectRels = await relTable
      .query()
      .where(`project_id = '${projectId}' AND type = 'task_depends_on'`)
      .toArray();

    const existingDepRelIds = new Set(existingDepRels.map((r) => r.relationship_id as string));
    const otherEdges = allProjectRels
      .filter((r) => !existingDepRelIds.has(r.relationship_id as string))
      .map((r) => ({ from: r.from_id as string, to: r.to_id as string }));

    const proposedEdges = validated.dependencies.map((depId) => ({
      from: validated.task_id,
      to: depId,
    }));

    // 3. Run cycle detection on the "what if" graph
    const { hasCycle } = detectCycles(otherEdges, proposedEdges);
    if (hasCycle) {
      throw new Error(
        `CYCLE_DETECTED: Adding dependencies ${JSON.stringify(validated.dependencies)} for task '${validated.task_id}' would create a dependency cycle`,
      );
    }

    // 4. No cycle — delete old edges
    for (const rel of existingDepRels) {
      await relTable.delete(`relationship_id = '${rel.relationship_id as string}'`);
    }

    // 5. Insert new edges
    if (validated.dependencies.length > 0) {
      const now = new Date().toISOString();
      const newRelRows = validated.dependencies.map((depId) => ({
        relationship_id: ulid(),
        project_id: projectId,
        from_id: validated.task_id,
        to_id: depId,
        type: "task_depends_on",
        source: "update_task",
        created_at: now,
        metadata: null,
      }));
      await insertBatch(relTable, newRelRows, RelationshipRowSchema);
    }

    changedFields.push("dependencies");
  }

  // ── f. Handle title/description re-embedding ───────────────────────────────
  const titleChanged = validated.title !== undefined;
  const descriptionChanged = validated.description !== undefined;

  if (titleChanged) {
    updateValues.title = validated.title;
    changedFields.push("title");
  }
  if (descriptionChanged) {
    updateValues.description = validated.description;
    changedFields.push("description");
  }

  if (titleChanged || descriptionChanged) {
    // Get the final title and description (prefer new value, fallback to existing)
    const finalTitle = (validated.title ?? existing.title) as string;
    const finalDescription = (validated.description ?? existing.description) as string;
    const embedText = `Title: ${finalTitle}\n${finalDescription}`;

    // Fail fast if Ollama is down (write operation)
    const vectors = await embed([embedText], projectId, config);
    const vector = vectors[0] ?? [];
    if (vector.length === 768) {
      updateValues.vector = vector;
    }
  }

  // ── g. Set updated_at ─────────────────────────────────────────────────────
  const now = new Date().toISOString();
  updateValues.updated_at = now;

  // ── h. Apply update to tasks table ────────────────────────────────────────
  await tasksTable.update({
    where: `task_id = '${validated.task_id}' AND project_id = '${validated.project_id}'`,
    values: updateValues,
  });

  // ── i. Recompute is_blocked after dependency change ────────────────────────
  if (validated.dependencies !== undefined) {
    await recomputeIsBlocked(db, projectId, validated.task_id);
  }

  // ── j. Propagate is_blocked to direct dependents ──────────────────────────
  const statusChangedToDone = validated.status === "done";
  const isCancelledChangedToTrue = validated.is_cancelled === true;

  if (statusChangedToDone || isCancelledChangedToTrue) {
    await recomputeDependentsIsBlocked(db, projectId, validated.task_id);
  }

  // ── k. Log activity ───────────────────────────────────────────────────────
  await logActivity(db, projectId, "update_task", validated.task_id, "task", {
    changed_fields: changedFields,
  });

  // ── l. Fetch final state ───────────────────────────────────────────────────
  const finalRows = await tasksTable
    .query()
    .where(`task_id = '${validated.task_id}' AND project_id = '${validated.project_id}'`)
    .limit(1)
    .toArray();

  const finalRow = finalRows[0];
  if (!finalRow)
    throw new Error(`Expected final row for task_id='${validated.task_id}' after update`);

  return {
    task_id: validated.task_id,
    status: finalRow.status as string,
    is_blocked: finalRow.is_blocked as boolean,
    is_cancelled: finalRow.is_cancelled as boolean,
    updated_at: finalRow.updated_at as string,
    changed_fields: changedFields,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerUpdateTaskTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "update_task",
    {
      description:
        "Update a task in the Synapse task hierarchy. Supports status lifecycle transitions " +
        "(pending -> ready -> in_progress -> review -> done), dependency replacement with cycle " +
        "detection, selective re-embedding on title/description changes, and automatic is_blocked " +
        "propagation to dependents when status changes to done or task is cancelled.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        task_id: z.string().min(1).describe("Task ID to update"),
        status: z
          .enum(VALID_TASK_STATUSES)
          .optional()
          .describe("New lifecycle status: pending, ready, in_progress, review, or done"),
        title: z
          .string()
          .min(1)
          .optional()
          .describe("New task title (triggers semantic re-embedding)"),
        description: z
          .string()
          .optional()
          .describe("New task description (triggers semantic re-embedding)"),
        priority: z
          .enum(VALID_TASK_PRIORITIES)
          .optional()
          .nullable()
          .describe("Task priority: critical, high, medium, or low (null to clear)"),
        assigned_agent: z
          .enum(VALID_AGENT_ROLES)
          .optional()
          .nullable()
          .describe("Agent role to assign (null to unassign)"),
        estimated_effort: z
          .string()
          .optional()
          .nullable()
          .describe("Estimated effort, e.g. '2h', '3d', '1w' (null to clear)"),
        is_blocked: z.boolean().optional().describe("Manual is_blocked override"),
        is_cancelled: z
          .boolean()
          .optional()
          .describe("Mark task as cancelled (unblocks dependents)"),
        block_reason: z.string().optional().nullable().describe("Reason for block (null to clear)"),
        tags: z.string().optional().describe("Pipe-separated tags, e.g. '|auth|backend|'"),
        phase: z.string().optional().nullable().describe("Project phase (null to clear)"),
        context_doc_ids: z
          .string()
          .optional()
          .nullable()
          .describe(
            "JSON array string of context document IDs (e.g. '[\"doc-001\"]') (null to clear)",
          ),
        context_decision_ids: z
          .string()
          .optional()
          .nullable()
          .describe(
            "JSON array string of context decision IDs (e.g. '[\"dec-001\"]') (null to clear)",
          ),
        spec: z
          .string()
          .optional()
          .nullable()
          .describe(
            "Detailed task specification for the assigned agent (plain text or markdown) (null to clear)",
          ),
        output_doc_ids: z
          .string()
          .optional()
          .nullable()
          .describe(
            "JSON array string of output document IDs produced by this task (e.g. '[\"doc-out-001\"]') (null to clear)",
          ),
        dependencies: z
          .array(z.string())
          .optional()
          .describe("New dependency list — replaces ALL existing dependencies"),
      }),
    },
    async (args) => {
      const log = createToolLogger("update_task");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = UpdateTaskInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          taskId: parsed.task_id,
        },
        "update_task invoked",
      );

      try {
        const data = await updateTask(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<UpdateTaskResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            taskId: data.task_id,
            changedFields: data.changed_fields,
          },
          "update_task complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "update_task failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
