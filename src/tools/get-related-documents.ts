import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_RELATIONSHIP_TYPES } from "./link-documents.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const GetRelatedDocumentsInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  doc_id: z.string().min(1),
  type: z.enum(VALID_RELATIONSHIP_TYPES).optional().describe("Filter by relationship type"),
});

type GetRelatedDocumentsArgs = z.infer<typeof GetRelatedDocumentsInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface RelatedDocument {
  doc_id: string;
  title: string;
  category: string;
  status: string;
  relationship_type: string;
  relationship_source: string; // 'manual' or 'ast_import'
  direction: "outgoing" | "incoming";
}

export interface GetRelatedDocumentsResult {
  doc_id: string;
  related: RelatedDocument[];
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function getRelatedDocuments(
  dbPath: string,
  projectId: string,
  args: GetRelatedDocumentsArgs,
): Promise<GetRelatedDocumentsResult> {
  const validated = GetRelatedDocumentsInputSchema.parse(args);
  const { doc_id: docId, type } = validated;

  const db = await connectDb(dbPath);
  const relTable = await db.openTable("relationships");
  const docsTable = await db.openTable("documents");

  // ── 1. Query outgoing relationships (from_id = docId) ─────────────────────
  let outgoingWhere = `from_id = '${docId}' AND project_id = '${projectId}'`;
  if (type) {
    outgoingWhere += ` AND type = '${type}'`;
  }
  const outgoingRels = await relTable.query().where(outgoingWhere).toArray();

  // ── 2. Query incoming relationships (to_id = docId) ───────────────────────
  let incomingWhere = `to_id = '${docId}' AND project_id = '${projectId}'`;
  if (type) {
    incomingWhere += ` AND type = '${type}'`;
  }
  const incomingRels = await relTable.query().where(incomingWhere).toArray();

  // ── 3. Build a map of related doc metadata to avoid duplicate fetches ─────
  // Key: doc_id -> { direction, relationship_type, relationship_source }[]
  // We allow multiple relationship entries per doc (e.g., both outgoing and incoming)
  const relatedEntries: Array<{
    relDocId: string;
    relationship_type: string;
    relationship_source: string;
    direction: "outgoing" | "incoming";
  }> = [];

  for (const rel of outgoingRels) {
    relatedEntries.push({
      relDocId: rel.to_id as string,
      relationship_type: rel.type as string,
      relationship_source: rel.source as string,
      direction: "outgoing",
    });
  }

  for (const rel of incomingRels) {
    relatedEntries.push({
      relDocId: rel.from_id as string,
      relationship_type: rel.type as string,
      relationship_source: rel.source as string,
      direction: "incoming",
    });
  }

  // ── 4. Fetch document metadata for each related doc ────────────────────────
  const related: RelatedDocument[] = [];

  for (const entry of relatedEntries) {
    const docRows = await docsTable
      .query()
      .where(
        `doc_id = '${entry.relDocId}' AND project_id = '${projectId}' AND status != 'superseded'`,
      )
      .limit(1)
      .toArray();

    if (docRows.length > 0) {
      const doc = docRows[0];
      related.push({
        doc_id: doc.doc_id as string,
        title: doc.title as string,
        category: doc.category as string,
        status: doc.status as string,
        relationship_type: entry.relationship_type,
        relationship_source: entry.relationship_source,
        direction: entry.direction,
      });
    }
  }

  return {
    doc_id: docId,
    related,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerGetRelatedDocumentsTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "get_related_documents",
    {
      description:
        "Get documents related to a given document via 1-hop graph traversal. " +
        "Returns both outgoing (doc→related) and incoming (related→doc) relationships. " +
        "Superseded documents are excluded from results. " +
        "Optionally filter by relationship type (implements, depends_on, supersedes, references, contradicts, child_of, related_to). " +
        "Each result includes relationship_type, relationship_source ('manual' or 'ast_import'), and direction.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        doc_id: z.string().min(1).describe("Document ID to find related documents for"),
        type: z
          .enum(VALID_RELATIONSHIP_TYPES)
          .optional()
          .describe("Filter by relationship type (optional)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("get_related_documents");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = GetRelatedDocumentsInputSchema.parse(args);
      log.info(
        { projectId: parsed.project_id, docId: parsed.doc_id },
        "get_related_documents invoked",
      );

      try {
        const data = await getRelatedDocuments(dbPath, parsed.project_id, parsed);
        const result: ToolResult<GetRelatedDocumentsResult> = { success: true, data };
        log.info(
          { durationMs: Date.now() - start, relatedCount: data.related.length },
          "get_related_documents complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error(
          { error: String(err), durationMs: Date.now() - start },
          "get_related_documents failed",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
