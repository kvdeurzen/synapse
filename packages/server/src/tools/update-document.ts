import type { IntoSql } from "@lancedb/lancedb";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { CARRY_FORWARD_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Lifecycle transition rules
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valid status transitions for lifecycle enforcement (DOC-09).
 * Keys are current status, values are the set of allowed next statuses.
 *
 * - draft -> active, approved, archived (discard shortcut)
 * - active -> approved, archived
 * - approved -> archived
 * - archived -> active (reactivation)
 * - superseded -> (none — terminal for version management)
 */
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["active", "approved", "archived"]),
  active: new Set(["approved", "archived"]),
  approved: new Set(["archived"]),
  archived: new Set(["active"]),
  superseded: new Set(), // terminal — no outgoing transitions
};

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const UpdateDocumentInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  doc_id: z.string().min(1),
  status: z.enum(VALID_STATUSES).optional(),
  phase: z.string().optional(),
  tags: z.string().optional().describe("Pipe-separated tags, e.g. '|typescript|backend|'"),
  priority: z.number().int().min(1).max(5).optional(),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force archive on carry-forward categories"),
});

type UpdateDocumentArgs = z.infer<typeof UpdateDocumentInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface UpdateDocumentResult {
  doc_id: string;
  updated_fields: string[];
}

export interface UpdateDocumentError {
  error: string;
  message: string;
}

type UpdateDocumentResponse = UpdateDocumentResult | UpdateDocumentError;

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function updateDocument(
  dbPath: string,
  projectId: string,
  args: UpdateDocumentArgs,
): Promise<UpdateDocumentResponse> {
  const validated = UpdateDocumentInputSchema.parse(args);
  const { doc_id: docId } = validated;

  const db = await connectDb(dbPath);
  const table = await db.openTable("documents");

  // ── 1. Verify document exists (Research Pitfall 3) ─────────────────────────
  const existing = await table
    .query()
    .where(`doc_id = '${docId}' AND project_id = '${projectId}' AND status != 'superseded'`)
    .limit(1)
    .toArray();

  if (existing.length === 0) {
    return {
      error: "DOC_NOT_FOUND",
      message: `Document ${docId} not found in project ${projectId}`,
    };
  }

  const currentRow = existing[0];
  const currentStatus = currentRow.status as string;
  const currentCategory = currentRow.category as string;

  // ── 2. Lifecycle state transition validation (DOC-09) ──────────────────────
  if (validated.status) {
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.has(validated.status)) {
      return {
        error: "INVALID_TRANSITION",
        message: `Cannot transition from ${currentStatus} to ${validated.status}`,
      };
    }
  }

  // ── 3. Carry-forward guard (DOC-10) ───────────────────────────────────────
  if (validated.status === "archived" && CARRY_FORWARD_CATEGORIES.has(currentCategory)) {
    if (!validated.force) {
      return {
        error: "CARRY_FORWARD_PROTECTED",
        message: `Cannot archive carry-forward category ${currentCategory}. Use force=true to override.`,
      };
    }
  }

  // ── 4. Build update values (only provided fields) ──────────────────────────
  const values: Record<string, IntoSql> = { updated_at: new Date().toISOString() };
  if (validated.status) values.status = validated.status;
  if (validated.phase !== undefined) values.phase = validated.phase;
  if (validated.tags !== undefined) values.tags = validated.tags;
  if (validated.priority !== undefined) values.priority = validated.priority;

  // ── 5. Execute update (latest non-superseded version only) ─────────────────
  const predicate = `doc_id = '${docId}' AND project_id = '${projectId}' AND status != 'superseded'`;
  await table.update({ where: predicate, values });

  // ── 6. Log activity (DOC-11) ───────────────────────────────────────────────
  const updatedFields = Object.keys(values).filter((k) => k !== "updated_at");
  await logActivity(db, projectId, "update_document", docId, "document", {
    fields_updated: updatedFields,
  });

  return { doc_id: docId, updated_fields: updatedFields };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerUpdateDocumentTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "update_document",
    {
      description:
        "Update document metadata (status, phase, tags, priority) without re-chunking or re-embedding. " +
        "Enforces lifecycle state transitions: draft->active->approved, with archived as a terminal-adjacent state. " +
        "Carry-forward categories (architecture_decision, design_pattern, glossary, code_pattern, dependency) " +
        "cannot be archived without force=true.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        doc_id: z.string().min(1).describe("Document ID to update"),
        status: z
          .enum(VALID_STATUSES)
          .optional()
          .describe(
            "New lifecycle status. Valid transitions: draft->active/approved/archived, " +
              "active->approved/archived, approved->archived, archived->active. " +
              "superseded is terminal (no outgoing transitions).",
          ),
        phase: z.string().optional().describe("Update the project phase or milestone"),
        tags: z
          .string()
          .optional()
          .describe("Updated pipe-separated tags, e.g. '|typescript|backend|'"),
        priority: z.number().int().min(1).max(5).optional().describe("Updated priority level 1-5"),
        force: z
          .boolean()
          .optional()
          .describe(
            "Force archive on carry-forward categories (architecture_decision, design_pattern, etc.). Default: false",
          ),
      }),
    },
    async (args) => {
      const log = createToolLogger("update_document");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = UpdateDocumentInputSchema.parse(args);
      log.info(
        { projectId: parsed.project_id, docId: parsed.doc_id, status: parsed.status },
        "update_document invoked",
      );

      try {
        const data = await updateDocument(dbPath, parsed.project_id, parsed);
        const result: ToolResult<UpdateDocumentResponse> = { success: true, data };
        log.info({ durationMs: Date.now() - start }, "update_document complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "update_document failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
