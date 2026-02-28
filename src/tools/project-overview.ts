import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";

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

  return {
    project_id: projectId,
    counts_by_category: countsByCategory,
    counts_by_status: countsByStatus,
    total_documents: totalDocuments,
    recent_activity: sortedActivity,
    key_documents: keyDocuments,
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
