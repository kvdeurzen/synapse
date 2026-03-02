import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { CARRY_FORWARD_CATEGORIES } from "./doc-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const DeleteDocumentInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  doc_id: z.string().min(1),
  hard: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, permanently removes document and all chunks/relationships. If false, sets status to 'archived'.",
    ),
  force: z.boolean().optional().default(false).describe("Force delete on carry-forward categories"),
});

type DeleteDocumentArgs = z.infer<typeof DeleteDocumentInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface DeleteDocumentResult {
  doc_id: string;
  action: "archived" | "hard_deleted";
  chunks_deleted?: number;
  relationships_deleted?: number;
}

export interface DeleteDocumentError {
  error: string;
  message: string;
}

type DeleteDocumentResponse = DeleteDocumentResult | DeleteDocumentError;

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function deleteDocument(
  dbPath: string,
  projectId: string,
  args: DeleteDocumentArgs,
): Promise<DeleteDocumentResponse> {
  const validated = DeleteDocumentInputSchema.parse(args);
  const { doc_id: docId } = validated;

  const db = await connectDb(dbPath);
  const table = await db.openTable("documents");

  // ── 1. Verify document exists ──────────────────────────────────────────────
  const existing = await table
    .query()
    .where(`doc_id = '${docId}' AND project_id = '${projectId}'`)
    .limit(1)
    .toArray();

  if (existing.length === 0) {
    return {
      error: "DOC_NOT_FOUND",
      message: `Document ${docId} not found in project ${projectId}`,
    };
  }

  const currentCategory = existing[0].category as string;

  // ── 2. Carry-forward guard (DOC-10) ───────────────────────────────────────
  if (CARRY_FORWARD_CATEGORIES.has(currentCategory) && !validated.force) {
    return {
      error: "CARRY_FORWARD_PROTECTED",
      message: `Cannot delete carry-forward category ${currentCategory}. Use force=true to override.`,
    };
  }

  const now = new Date().toISOString();

  if (!validated.hard) {
    // ── 3a. Soft delete: set status to 'archived' ─────────────────────────────
    await table.update({
      where: `doc_id = '${docId}' AND project_id = '${projectId}'`,
      values: { status: "archived", updated_at: now },
    });

    await logActivity(db, projectId, "archive_document", docId, "document", {
      category: currentCategory,
    });

    return { doc_id: docId, action: "archived" };
  }

  // ── 3b. Hard delete: remove all rows from documents, doc_chunks, relationships ──
  // Count chunks before deletion for metadata
  const docChunksTable = await db.openTable("doc_chunks");
  const chunksToDelete = await docChunksTable
    .query()
    .where(`doc_id = '${docId}' AND project_id = '${projectId}'`)
    .toArray();
  const chunksDeleted = chunksToDelete.length;

  // Count relationships before deletion for metadata
  const relTable = await db.openTable("relationships");
  const relsToDelete = await relTable
    .query()
    .where(`(from_id = '${docId}' OR to_id = '${docId}') AND project_id = '${projectId}'`)
    .toArray();
  const relsDeleted = relsToDelete.length;

  // Delete from documents table (all versions)
  await table.delete(`doc_id = '${docId}' AND project_id = '${projectId}'`);

  // Delete from doc_chunks table
  await docChunksTable.delete(`doc_id = '${docId}' AND project_id = '${projectId}'`);

  // Delete from relationships table (both directions)
  if (relsDeleted > 0) {
    await relTable.delete(
      `(from_id = '${docId}' OR to_id = '${docId}') AND project_id = '${projectId}'`,
    );
  }

  await logActivity(db, projectId, "hard_delete_document", docId, "document", {
    category: currentCategory,
    chunks_deleted: chunksDeleted,
    relationships_deleted: relsDeleted,
  });

  return {
    doc_id: docId,
    action: "hard_deleted",
    chunks_deleted: chunksDeleted,
    relationships_deleted: relsDeleted,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerDeleteDocumentTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "delete_document",
    {
      description:
        "Delete a document via soft-delete (archive) or hard-delete (permanent removal). " +
        "Soft-delete sets status to 'archived'. Hard-delete removes the document, all doc_chunks, " +
        "and all relationships referencing the document. " +
        "Carry-forward categories (architecture_decision, design_pattern, glossary, code_pattern, dependency) " +
        "require force=true to delete.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        doc_id: z.string().min(1).describe("Document ID to delete"),
        hard: z
          .boolean()
          .optional()
          .describe(
            "If true, permanently removes document, chunks, and relationships. If false (default), archives the document.",
          ),
        force: z
          .boolean()
          .optional()
          .describe(
            "Force delete on carry-forward categories (architecture_decision, design_pattern, etc.). Default: false",
          ),
      }),
    },
    async (args) => {
      const log = createToolLogger("delete_document");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = DeleteDocumentInputSchema.parse(args);
      log.info(
        { projectId: parsed.project_id, docId: parsed.doc_id, hard: parsed.hard },
        "delete_document invoked",
      );

      try {
        const data = await deleteDocument(dbPath, parsed.project_id, parsed);
        const result: ToolResult<DeleteDocumentResponse> = { success: true, data };
        log.info({ durationMs: Date.now() - start }, "delete_document complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "delete_document failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
