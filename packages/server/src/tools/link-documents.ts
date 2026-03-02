import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import { RelationshipRowSchema } from "../db/schema.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Valid relationship types
// ────────────────────────────────────────────────────────────────────────────

export const VALID_RELATIONSHIP_TYPES = [
  "implements",
  "depends_on",
  "supersedes",
  "references",
  "contradicts",
  "child_of",
  "related_to",
] as const;

export type RelationshipType = (typeof VALID_RELATIONSHIP_TYPES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const LinkDocumentsInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  from_id: z.string().min(1).describe("Source document ID"),
  to_id: z.string().min(1).describe("Target document ID"),
  type: z.enum(VALID_RELATIONSHIP_TYPES),
  bidirectional: z.boolean().optional().default(false).describe("Create reverse relationship too"),
  metadata: z.string().optional().describe("Optional JSON metadata for the relationship"),
});

type LinkDocumentsArgs = z.infer<typeof LinkDocumentsInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface LinkDocumentsResult {
  relationships_created: number;
  relationship_ids: string[];
}

export interface LinkDocumentsError {
  error: string;
  message: string;
}

type LinkDocumentsResponse = LinkDocumentsResult | LinkDocumentsError;

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function linkDocuments(
  dbPath: string,
  projectId: string,
  args: LinkDocumentsArgs,
): Promise<LinkDocumentsResponse> {
  const validated = LinkDocumentsInputSchema.parse(args);
  const { from_id: fromId, to_id: toId, type, bidirectional, metadata } = validated;

  const db = await connectDb(dbPath);
  const relTable = await db.openTable("relationships");
  const docsTable = await db.openTable("documents");

  // ── 1. Validate from_id document exists ───────────────────────────────────
  const fromDoc = await docsTable
    .query()
    .where(`doc_id = '${fromId}' AND project_id = '${projectId}'`)
    .limit(1)
    .toArray();

  if (fromDoc.length === 0) {
    return {
      error: "DOC_NOT_FOUND",
      message: `Source document ${fromId} not found`,
    };
  }

  // ── 2. Validate to_id document exists ─────────────────────────────────────
  const toDoc = await docsTable
    .query()
    .where(`doc_id = '${toId}' AND project_id = '${projectId}'`)
    .limit(1)
    .toArray();

  if (toDoc.length === 0) {
    return {
      error: "DOC_NOT_FOUND",
      message: `Target document ${toId} not found`,
    };
  }

  // ── 3. Check for duplicate forward relationship (Research Pitfall 6) ──────
  const existing = await relTable
    .query()
    .where(
      `from_id = '${fromId}' AND to_id = '${toId}' AND type = '${type}' AND project_id = '${projectId}'`,
    )
    .limit(1)
    .toArray();

  if (existing.length > 0) {
    return {
      error: "RELATIONSHIP_EXISTS",
      message: `Relationship already exists between ${fromId} and ${toId} with type ${type}`,
    };
  }

  // ── 4. Build relationship rows ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const forwardId = ulid();
  const rows: z.infer<typeof RelationshipRowSchema>[] = [
    {
      relationship_id: forwardId,
      project_id: projectId,
      from_id: fromId,
      to_id: toId,
      type,
      source: "manual", // GRAPH-04: manual source attribution
      created_at: now,
      metadata: metadata ?? null,
    },
  ];

  const relationshipIds = [forwardId];

  // ── 5. Create reverse relationship if bidirectional (GRAPH-02) ────────────
  if (bidirectional) {
    // Check reverse doesn't already exist
    const reverseExisting = await relTable
      .query()
      .where(
        `from_id = '${toId}' AND to_id = '${fromId}' AND type = '${type}' AND project_id = '${projectId}'`,
      )
      .limit(1)
      .toArray();

    if (reverseExisting.length === 0) {
      const reverseId = ulid();
      rows.push({
        relationship_id: reverseId,
        project_id: projectId,
        from_id: toId,
        to_id: fromId,
        type,
        source: "manual",
        created_at: now,
        metadata: metadata ?? null,
      });
      relationshipIds.push(reverseId);
    }
  }

  // ── 6. Insert all rows ────────────────────────────────────────────────────
  await insertBatch(relTable, rows, RelationshipRowSchema);

  // ── 7. Log activity ───────────────────────────────────────────────────────
  await logActivity(db, projectId, "link_documents", fromId, "relationship", {
    to_id: toId,
    type,
    bidirectional,
  });

  return {
    relationships_created: rows.length,
    relationship_ids: relationshipIds,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerLinkDocumentsTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "link_documents",
    {
      description:
        "Create a relationship between two documents. " +
        "Supports 7 relationship types: implements, depends_on, supersedes, references, contradicts, child_of, related_to. " +
        "Set bidirectional=true to create both A→B and B→A relationships in one call. " +
        "Duplicate relationships are rejected. All manually created links have source='manual'.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        from_id: z.string().min(1).describe("Source document ID"),
        to_id: z.string().min(1).describe("Target document ID"),
        type: z
          .enum(VALID_RELATIONSHIP_TYPES)
          .describe(
            "Relationship type: implements, depends_on, supersedes, references, contradicts, child_of, related_to",
          ),
        bidirectional: z
          .boolean()
          .optional()
          .describe("Create reverse relationship too (default: false)"),
        metadata: z.string().optional().describe("Optional JSON metadata for the relationship"),
      }),
    },
    async (args) => {
      const log = createToolLogger("link_documents");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = LinkDocumentsInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          fromId: parsed.from_id,
          toId: parsed.to_id,
          type: parsed.type,
        },
        "link_documents invoked",
      );

      try {
        const data = await linkDocuments(dbPath, parsed.project_id, parsed);
        const result: ToolResult<LinkDocumentsResponse> = { success: true, data };
        log.info({ durationMs: Date.now() - start }, "link_documents complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "link_documents failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
