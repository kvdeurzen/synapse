import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const QueryDocumentsInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  category: z.enum(VALID_CATEGORIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  phase: z.string().optional(),
  tags: z.string().optional().describe("Single tag to filter by, e.g. 'typescript'"),
  priority: z.number().int().min(1).max(5).optional().describe("Minimum priority filter"),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

type QueryDocumentsArgs = z.infer<typeof QueryDocumentsInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface QueryDocumentsResult {
  documents: Array<{
    doc_id: string;
    title: string;
    category: string;
    status: string;
    version: number;
    phase: string | null;
    tags: string;
    priority: number | null;
    summary: string;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Summary truncation helper
// ────────────────────────────────────────────────────────────────────────────

function makeSummary(content: string, maxChars = 400): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}...`;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function queryDocuments(
  dbPath: string,
  projectId: string,
  args: QueryDocumentsArgs,
): Promise<QueryDocumentsResult> {
  const validated = QueryDocumentsInputSchema.parse(args);

  // Validate tag input to prevent SQL injection — only allow safe characters
  if (validated.tags !== undefined && validated.tags !== null) {
    if (!/^[a-zA-Z0-9_-]+$/.test(validated.tags)) {
      throw new Error(
        "INVALID_TAG: Tag must contain only letters, numbers, hyphens, and underscores",
      );
    }
  }

  const db = await connectDb(dbPath);
  const table = await db.openTable("documents");

  // Build WHERE predicate parts — always AND combination
  const parts: string[] = [`project_id = '${projectId}'`];

  if (validated.category) {
    parts.push(`category = '${validated.category}'`);
  }

  // Status filter: if not provided, exclude superseded by default
  if (validated.status) {
    parts.push(`status = '${validated.status}'`);
  } else {
    parts.push(`status != 'superseded'`);
  }

  if (validated.phase) {
    parts.push(`phase = '${validated.phase}'`);
  }

  if (validated.tags) {
    // Pipe-delimited exact tag match (Research Pitfall 4)
    parts.push(`tags LIKE '%|${validated.tags}|%'`);
  }

  if (validated.priority !== undefined) {
    parts.push(`priority >= ${validated.priority}`);
  }

  const predicate = parts.join(" AND ");
  const limit = validated.limit ?? 20;

  const rows = await table.query().where(predicate).limit(limit).toArray();

  const documents = rows.map((row) => ({
    doc_id: row.doc_id as string,
    title: row.title as string,
    category: row.category as string,
    status: row.status as string,
    version: row.version as number,
    phase: (row.phase as string | null) ?? null,
    tags: row.tags as string,
    priority: (row.priority as number | null) ?? null,
    summary: makeSummary(row.content as string),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));

  return { documents, total: documents.length };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerQueryDocumentsTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "query_documents",
    {
      description:
        "Browse and filter documents by category, phase, status, tags, and priority using metadata-only SQL filtering. " +
        "No embedding calls — pure metadata scan. Returns metadata and ~100-token summary per document. " +
        "Superseded documents are hidden by default; use status='superseded' to retrieve them explicitly.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        category: z
          .enum(VALID_CATEGORIES)
          .optional()
          .describe(
            "Filter by document category: architecture_decision, design_pattern, glossary, code_pattern, " +
              "dependency, plan, task_spec, requirement, technical_context, change_record, research, learning",
          ),
        status: z
          .enum(VALID_STATUSES)
          .optional()
          .describe(
            "Filter by lifecycle status (default excludes superseded). Valid: draft, active, approved, superseded, archived",
          ),
        phase: z.string().optional().describe("Filter by project phase or milestone"),
        tags: z
          .string()
          .optional()
          .describe(
            "Single tag to filter by (exact match), e.g. 'typescript'. " +
              "Documents use pipe-delimited format '|tag1|tag2|'.",
          ),
        priority: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe(
            "Minimum priority filter (1=highest, 5=lowest). Returns this priority and lower values.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum results to return (default: 20, max: 100)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("query_documents");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = QueryDocumentsInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          category: parsed.category,
          status: parsed.status,
          phase: parsed.phase,
          tags: parsed.tags,
          priority: parsed.priority,
          limit: parsed.limit,
        },
        "query_documents invoked",
      );

      try {
        const data = await queryDocuments(dbPath, parsed.project_id, parsed);
        const result: ToolResult<QueryDocumentsResult> = { success: true, data };
        log.info({ durationMs: Date.now() - start, total: data.total }, "query_documents complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "query_documents failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
