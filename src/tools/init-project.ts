import { resolve } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { TABLE_NAMES, TABLE_SCHEMAS } from "../db/schema.js";
import { createToolLogger, logger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

const ProjectIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
  );

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface InitProjectResult {
  tables_created: number;
  tables_skipped: number;
  database_path: string;
  project_id: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function initProject(dbPath: string, projectId: string): Promise<InitProjectResult> {
  // Validate project_id format (FOUND-05: project_id must be a safe slug for SQL predicates)
  ProjectIdSchema.parse(projectId);

  const absPath = resolve(dbPath);
  const db = await connectDb(dbPath);
  const existing = new Set(await db.tableNames());

  let tables_created = 0;
  let tables_skipped = 0;

  for (const name of TABLE_NAMES) {
    if (existing.has(name)) {
      tables_skipped++;
      logger.debug({ table: name }, "Table exists, skipping");
    } else {
      const schema = TABLE_SCHEMAS[name];
      if (!schema) {
        throw new Error(`[initProject] No schema registered for table '${name}'`);
      }
      await db.createEmptyTable(name, schema, { existOk: true });

      // Create BTree index on project_id for multi-project scoping (FOUND-05)
      // Pitfall 3: BTree index on empty table may fail in some LanceDB versions
      // Wrap in try/catch — log warning but do not fail the entire init
      const table = await db.openTable(name);
      try {
        await table.createIndex("project_id", { config: lancedb.Index.btree() });
        logger.debug({ table: name }, "BTree index created on project_id");
      } catch (err) {
        logger.warn(
          { table: name, error: String(err) },
          "BTree index creation failed on empty table — index will be available after first insert",
        );
      }

      tables_created++;
    }
  }

  return {
    tables_created,
    tables_skipped,
    database_path: absPath,
    project_id: projectId,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerInitProjectTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "init_project",
    {
      description:
        "Initialize a Synapse project database with all required tables. " +
        "Creates the database directory and 5 LanceDB tables (documents, code_chunks, " +
        "relationships, project_meta, activity_log). Idempotent — safe to call multiple times.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        db_path: z
          .string()
          .optional()
          .describe("Database path override (defaults to server --db config)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("init_project");
      const start = Date.now();
      const dbPath = args.db_path ?? config.db;
      log.info({ projectId: args.project_id, dbPath }, "init_project invoked");

      try {
        const data = await initProject(dbPath, args.project_id);
        const result: ToolResult<InitProjectResult> = { success: true, data };
        log.info({ durationMs: Date.now() - start, ...data }, "init_project complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "init_project failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
