import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { TABLE_NAMES } from "../db/schema.js";
import { createToolLogger, logger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

const ProjectIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "project_id must be a lowercase slug");

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface DeleteProjectResult {
  tables_cleaned: number;
  project_id: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function deleteProject(
  dbPath: string,
  projectId: string,
): Promise<DeleteProjectResult> {
  // Validate project_id — slug validation prevents SQL injection in the predicate below
  ProjectIdSchema.parse(projectId);

  const db = await connectDb(dbPath);
  const existing = new Set(await db.tableNames());

  let tables_cleaned = 0;

  for (const name of TABLE_NAMES) {
    if (existing.has(name)) {
      const table = await db.openTable(name);
      // project_id is validated as slug (alphanumeric + hyphens + underscores) so no SQL injection risk
      await table.delete(`project_id = '${projectId}'`);
      tables_cleaned++;
      logger.debug({ table: name, projectId }, "Deleted rows for project_id");
    }
  }

  return { tables_cleaned, project_id: projectId };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerDeleteProjectTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "delete_project",
    {
      description:
        "Delete all data for a project across all tables. " +
        "Removes rows matching the given project_id from all 6 tables " +
        "(documents, doc_chunks, code_chunks, relationships, project_meta, activity_log).",
      inputSchema: z.object({
        project_id: z.string().describe("Project identifier to delete (lowercase slug)"),
        db_path: z
          .string()
          .optional()
          .describe("Database path override (defaults to server --db config)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("delete_project");
      const start = Date.now();
      const dbPath = args.db_path ?? config.db;
      log.info({ projectId: args.project_id, dbPath }, "delete_project invoked");

      try {
        const data = await deleteProject(dbPath, args.project_id);
        const result: ToolResult<DeleteProjectResult> = { success: true, data };
        log.info({ durationMs: Date.now() - start, ...data }, "delete_project complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "delete_project failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
