import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import { DocChunkRowSchema, DocumentRowSchema } from "../db/schema.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import { chunkDocument } from "../services/chunker.js";
import { embed } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Category and status enumerations
// ────────────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  "architecture_decision",
  "design_pattern",
  "glossary",
  "code_pattern",
  "dependency",
  "plan",
  "task_spec",
  "requirement",
  "technical_context",
  "change_record",
  "research",
  "learning",
] as const;

const VALID_STATUSES = ["draft", "active", "approved", "superseded", "archived"] as const;

/**
 * Carry-forward categories are never auto-archived during re-versioning.
 * Superseding them is allowed (it means "a newer version exists"), but
 * archiving is not (it means "no longer relevant").
 */
export const CARRY_FORWARD_CATEGORIES = new Set([
  "architecture_decision",
  "design_pattern",
  "glossary",
  "code_pattern",
  "dependency",
]);

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const StoreDocumentInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.enum(VALID_CATEGORIES),
  doc_id: z
    .string()
    .optional()
    .describe("If provided, creates a new version of the existing document"),
  status: z.enum(VALID_STATUSES).optional().default("draft"),
  phase: z.string().optional(),
  tags: z
    .string()
    .optional()
    .default("")
    .describe("Pipe-separated tags, e.g. '|typescript|backend|'"),
  priority: z.number().int().min(1).max(5).optional(),
});

type StoreDocumentArgs = z.infer<typeof StoreDocumentInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface StoreDocumentResult {
  doc_id: string;
  version: number;
  chunk_count: number;
  token_estimate: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function storeDocument(
  dbPath: string,
  projectId: string,
  args: StoreDocumentArgs,
  config: SynapseConfig,
): Promise<StoreDocumentResult> {
  // Runtime validation — ensures category and status are valid even when called without Zod parse
  const validated = StoreDocumentInputSchema.parse(args);
  const db = await connectDb(dbPath);
  const documentsTable = await db.openTable("documents");

  // ── 1. Version resolution ──────────────────────────────────────────────────
  let docId: string;
  let newVersion: number;
  let isReVersioning = false;

  if (validated.doc_id) {
    // Re-versioning: find the current max version (Research Pitfall 2: descending sort)
    const existing = await documentsTable
      .query()
      .where(`doc_id = '${validated.doc_id}' AND project_id = '${projectId}'`)
      .limit(1)
      .toArray();

    if (existing.length === 0) {
      throw new Error(
        `DOC_NOT_FOUND: No document found with doc_id '${validated.doc_id}' in project '${projectId}'`,
      );
    }

    // Find max version (query may not guarantee order, so sort manually)
    const allVersions = await documentsTable
      .query()
      .where(`doc_id = '${validated.doc_id}' AND project_id = '${projectId}'`)
      .toArray();

    const maxVersion = allVersions.reduce((max, row) => {
      const v = row.version as number;
      return v > max ? v : max;
    }, 0);

    docId = validated.doc_id;
    newVersion = maxVersion + 1;
    isReVersioning = true;
  } else {
    // New document
    docId = ulid();
    newVersion = 1;
  }

  // ── 2. Mark old chunks as superseded (if re-versioning) ───────────────────
  if (isReVersioning) {
    const docChunksTable = await db.openTable("doc_chunks");

    // Mark old chunks superseded
    await docChunksTable.update({
      where: `doc_id = '${docId}' AND project_id = '${projectId}' AND status = 'active'`,
      values: { status: "superseded" },
    });

    // Mark old document rows superseded (carry-forward guard: only superseded, never archived)
    const now = new Date().toISOString();
    await documentsTable.update({
      where: `doc_id = '${docId}' AND project_id = '${projectId}' AND status != 'superseded'`,
      values: { status: "superseded", updated_at: now },
    });
  }

  // ── 3. Insert new document row ────────────────────────────────────────────
  const now = new Date().toISOString();
  await insertBatch(
    documentsTable,
    [
      {
        doc_id: docId,
        project_id: projectId,
        title: validated.title,
        content: validated.content,
        category: validated.category,
        status: validated.status ?? "draft",
        version: newVersion,
        created_at: now,
        updated_at: now,
        tags: validated.tags ?? "",
        phase: validated.phase ?? null,
        priority: validated.priority ?? null,
        parent_id: null,
        depth: null,
        decision_type: null,
      },
    ],
    DocumentRowSchema,
  );

  // ── 4. Chunk and embed ────────────────────────────────────────────────────
  const chunks = await chunkDocument(validated.title, validated.content, validated.category);
  const chunkContents = chunks.map((c) => c.content);

  let vectors: number[][];
  try {
    vectors = await embed(chunkContents, projectId, config);
  } catch (err) {
    // Roll back: delete the document row we just inserted to prevent orphaned rows
    await documentsTable.delete(
      `doc_id = '${docId}' AND project_id = '${projectId}' AND version = ${newVersion}`,
    );
    throw err;
  }

  // ── 5. Insert doc_chunks rows ─────────────────────────────────────────────
  const docChunksTable = await db.openTable("doc_chunks");
  const chunkRows = chunks.map((chunk, index) => ({
    chunk_id: ulid(),
    project_id: projectId,
    doc_id: docId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    vector: vectors[index] ?? null,
    header: chunk.header,
    version: newVersion,
    status: "active",
    token_count: chunk.tokenCount,
    created_at: now,
  }));

  await insertBatch(docChunksTable, chunkRows, DocChunkRowSchema);

  // ── 6. Calculate token estimate ───────────────────────────────────────────
  const tokenEstimate = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

  // ── 7. Log activity ───────────────────────────────────────────────────────
  await logActivity(db, projectId, "store_document", docId, "document", {
    version: newVersion,
    chunk_count: chunks.length,
  });

  // ── 8. Return result ──────────────────────────────────────────────────────
  return {
    doc_id: docId,
    version: newVersion,
    chunk_count: chunks.length,
    token_estimate: tokenEstimate,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerStoreDocumentTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "store_document",
    {
      description:
        "Store a document in the Synapse knowledge base. Validates input, chunks content, embeds chunks for semantic search, " +
        "supports versioning (re-versioning increments version and supersedes old chunks), and logs activity. " +
        "Returns doc_id, version, chunk_count, and token_estimate.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        title: z.string().min(1).describe("Document title"),
        content: z.string().min(1).describe("Document content (markdown supported)"),
        category: z
          .enum(VALID_CATEGORIES)
          .describe(
            "Document category — one of: architecture_decision, design_pattern, glossary, code_pattern, " +
              "dependency, plan, task_spec, requirement, technical_context, change_record, research, learning",
          ),
        doc_id: z
          .string()
          .optional()
          .describe(
            "If provided, creates a new version of the existing document (re-versioning). Omit to create a new document.",
          ),
        status: z
          .enum(VALID_STATUSES)
          .optional()
          .describe(
            "Document lifecycle status (default: draft). Valid: draft, active, approved, superseded, archived",
          ),
        phase: z
          .string()
          .optional()
          .describe("Project phase or milestone this document belongs to"),
        tags: z.string().optional().describe("Pipe-separated tags, e.g. '|typescript|backend|'"),
        priority: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Priority level 1-5 (1=highest, 5=lowest)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("store_document");
      const start = Date.now();
      const dbPath = config.db;

      // Parse with defaults applied (status defaults to 'draft', tags defaults to '')
      const parsed = StoreDocumentInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          title: parsed.title,
          category: parsed.category,
          docId: parsed.doc_id,
        },
        "store_document invoked",
      );

      try {
        const data = await storeDocument(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<StoreDocumentResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            docId: data.doc_id,
            version: data.version,
            chunkCount: data.chunk_count,
          },
          "store_document complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "store_document failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
