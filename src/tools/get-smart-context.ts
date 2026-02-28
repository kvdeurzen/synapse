/**
 * get_smart_context MCP tool — two-phase context assembly system.
 *
 * Overview mode: metadata scan returning ~100-token summaries per document,
 * sorted by priority/recency, accumulated to a max_tokens budget.
 *
 * Detailed mode: full content for specified doc_ids with 1-hop graph expansion,
 * priority-ordered related documents, max_tokens budget respected.
 *
 * Both modes use drop-lowest-relevance strategy (never truncate mid-content).
 *
 * Exports:
 * - getSmartContext: core function (testable without MCP server)
 * - registerGetSmartContextTool: MCP tool registration wrapper
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { countTokens } from "gpt-tokenizer";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";
import { getRelatedDocuments } from "./get-related-documents.js";
import { extractSnippet } from "./search-utils.js";

// ────────────────────────────────────────────────────────────────────────────
// Relationship priority for 1-hop graph expansion
// ────────────────────────────────────────────────────────────────────────────

const RELATIONSHIP_PRIORITY: Record<string, number> = {
  depends_on: 1,
  implements: 1,
  references: 2,
  related_to: 2,
  contradicts: 3,
  child_of: 3,
  supersedes: 3,
};

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const GetSmartContextInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  mode: z.enum(["overview", "detailed"]),
  doc_ids: z.array(z.string().min(1)).optional(),
  max_tokens: z.number().int().min(500).max(20000).optional().default(4000),
  category: z.enum(VALID_CATEGORIES).optional(),
  phase: z.string().optional(),
  tags: z.string().optional(),
  status: z.enum(VALID_STATUSES).optional(),
});

type GetSmartContextArgs = z.infer<typeof GetSmartContextInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface OverviewDocument {
  doc_id: string;
  title: string;
  category: string;
  status: string;
  priority: number | null;
  summary: string;
  token_count: number;
}

export interface DetailedDocument {
  doc_id: string;
  title: string;
  category: string;
  status: string;
  content: string;
  token_count: number;
  is_requested: boolean;
  relationship_type?: string;
  relationship_direction?: "outgoing" | "incoming";
}

export interface OverviewResult {
  mode: "overview";
  documents: OverviewDocument[];
  total_documents: number;
  included_documents: number;
  total_tokens: number;
  max_tokens: number;
  source: "document";
}

export interface DetailedResult {
  mode: "detailed";
  documents: DetailedDocument[];
  total_tokens: number;
  max_tokens: number;
  source: "document";
  graph_expansion: {
    requested_count: number;
    related_found: number;
    related_included: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic — overview mode
// ────────────────────────────────────────────────────────────────────────────

async function runOverviewMode(
  dbPath: string,
  projectId: string,
  args: GetSmartContextArgs,
): Promise<OverviewResult> {
  const maxTokens = args.max_tokens ?? 4000;

  const db = await connectDb(dbPath);
  const docsTable = await db.openTable("documents");

  // Build predicate — always filter by project_id
  const parts: string[] = [`project_id = '${projectId}'`];

  // Exclude superseded by default unless status filter explicitly overrides
  if (args.status) {
    parts.push(`status = '${args.status}'`);
  } else {
    parts.push(`status != 'superseded'`);
  }

  if (args.category) {
    parts.push(`category = '${args.category}'`);
  }

  if (args.phase) {
    parts.push(`phase = '${args.phase}'`);
  }

  if (args.tags) {
    // Validate tags to prevent SQL injection
    if (!/^[a-zA-Z0-9_-]+$/.test(args.tags)) {
      throw new Error(
        "INVALID_TAG: Tag must contain only letters, numbers, hyphens, and underscores",
      );
    }
    parts.push(`tags LIKE '%|${args.tags}|%'`);
  }

  const predicate = parts.join(" AND ");

  // Fetch up to 100 rows — budget trimming handles the actual limit
  const rows = await docsTable.query().where(predicate).limit(100).toArray();

  const totalDocuments = rows.length;

  // Sort by priority (ascending, nulls last), then updated_at (descending)
  rows.sort((a, b) => {
    const pa = (a.priority as number | null) ?? 999;
    const pb = (b.priority as number | null) ?? 999;
    if (pa !== pb) return pa - pb;
    return (b.updated_at as string).localeCompare(a.updated_at as string);
  });

  // Accumulate summaries into token budget
  const documents: OverviewDocument[] = [];
  let totalTokens = 0;

  for (const row of rows) {
    const content = row.content as string;
    // Generate ~100-token summary (empty query = first ~100 tokens)
    const summary = extractSnippet(content, "", 100);
    const summaryTokens = countTokens(summary);

    // Drop entire document if it would exceed the budget
    if (totalTokens + summaryTokens > maxTokens) {
      break;
    }

    documents.push({
      doc_id: row.doc_id as string,
      title: row.title as string,
      category: row.category as string,
      status: row.status as string,
      priority: (row.priority as number | null) ?? null,
      summary,
      token_count: summaryTokens,
    });

    totalTokens += summaryTokens;
  }

  return {
    mode: "overview",
    documents,
    total_documents: totalDocuments,
    included_documents: documents.length,
    total_tokens: totalTokens,
    max_tokens: maxTokens,
    source: "document",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic — detailed mode
// ────────────────────────────────────────────────────────────────────────────

async function runDetailedMode(
  dbPath: string,
  projectId: string,
  args: GetSmartContextArgs,
): Promise<DetailedResult> {
  const maxTokens = args.max_tokens ?? 4000;
  const docIds = args.doc_ids;

  // Validate doc_ids is provided and non-empty
  if (!docIds || docIds.length === 0) {
    throw new Error("MISSING_DOC_IDS: doc_ids is required and must be non-empty for detailed mode");
  }

  const db = await connectDb(dbPath);
  const docsTable = await db.openTable("documents");

  // Fetch requested documents
  const idList = docIds.map((id) => `'${id}'`).join(",");
  const docPredicate = `doc_id IN (${idList}) AND project_id = '${projectId}' AND status != 'superseded'`;
  const requestedRows = await docsTable.query().where(docPredicate).toArray();

  // Build map for quick lookup
  const requestedMap = new Map<string, (typeof requestedRows)[0]>();
  for (const row of requestedRows) {
    requestedMap.set(row.doc_id as string, row);
  }

  // Start accumulating — requested docs go first (always included)
  const documents: DetailedDocument[] = [];
  let totalTokens = 0;

  for (const row of requestedRows) {
    const content = row.content as string;
    const tokenCount = countTokens(content);

    documents.push({
      doc_id: row.doc_id as string,
      title: row.title as string,
      category: row.category as string,
      status: row.status as string,
      content,
      token_count: tokenCount,
      is_requested: true,
    });

    totalTokens += tokenCount;
  }

  // 1-hop graph expansion: collect all related doc_ids for each requested doc
  const relatedEntriesMap = new Map<
    string,
    { relationship_type: string; relationship_direction: "outgoing" | "incoming" }
  >();

  for (const docId of docIds) {
    try {
      const relResult = await getRelatedDocuments(dbPath, projectId, {
        project_id: projectId,
        doc_id: docId,
      });

      for (const rel of relResult.related) {
        // Skip already-requested docs
        if (requestedMap.has(rel.doc_id)) continue;
        // Skip if we already have an entry (use highest-priority relationship)
        if (relatedEntriesMap.has(rel.doc_id)) {
          const existing = relatedEntriesMap.get(rel.doc_id)!;
          const existingPri = RELATIONSHIP_PRIORITY[existing.relationship_type] ?? 99;
          const newPri = RELATIONSHIP_PRIORITY[rel.relationship_type] ?? 99;
          if (newPri < existingPri) {
            relatedEntriesMap.set(rel.doc_id, {
              relationship_type: rel.relationship_type,
              relationship_direction: rel.direction,
            });
          }
        } else {
          relatedEntriesMap.set(rel.doc_id, {
            relationship_type: rel.relationship_type,
            relationship_direction: rel.direction,
          });
        }
      }
    } catch {
      // If graph traversal fails for a doc, skip it (doc may not exist)
    }
  }

  const relatedFound = relatedEntriesMap.size;

  // Sort related docs by priority (depends_on/implements first), then title
  const sortedRelated = Array.from(relatedEntriesMap.entries()).sort(([aId, aRel], [bId, bRel]) => {
    const aPri = RELATIONSHIP_PRIORITY[aRel.relationship_type] ?? 99;
    const bPri = RELATIONSHIP_PRIORITY[bRel.relationship_type] ?? 99;
    if (aPri !== bPri) return aPri - bPri;
    // Alphabetical by doc_id as tiebreaker (title not yet loaded)
    return aId.localeCompare(bId);
  });

  // Fetch full content of related documents
  let relatedIncluded = 0;

  for (const [relDocId, relMeta] of sortedRelated) {
    const relRows = await docsTable
      .query()
      .where(`doc_id = '${relDocId}' AND project_id = '${projectId}' AND status != 'superseded'`)
      .limit(1)
      .toArray();

    if (relRows.length === 0) continue;

    const relRow = relRows[0];
    const content = relRow.content as string;
    const tokenCount = countTokens(content);

    // Stop adding when budget would be exceeded (drop-lowest, no partial)
    if (totalTokens + tokenCount > maxTokens) {
      continue; // Skip this one, try next (lower priority docs may be smaller)
    }

    documents.push({
      doc_id: relRow.doc_id as string,
      title: relRow.title as string,
      category: relRow.category as string,
      status: relRow.status as string,
      content,
      token_count: tokenCount,
      is_requested: false,
      relationship_type: relMeta.relationship_type,
      relationship_direction: relMeta.relationship_direction,
    });

    totalTokens += tokenCount;
    relatedIncluded++;
  }

  return {
    mode: "detailed",
    documents,
    total_tokens: totalTokens,
    max_tokens: maxTokens,
    source: "document",
    graph_expansion: {
      requested_count: docIds.length,
      related_found: relatedFound,
      related_included: relatedIncluded,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Core function (exported for testing)
// ────────────────────────────────────────────────────────────────────────────

export async function getSmartContext(
  dbPath: string,
  projectId: string,
  args: {
    project_id: string;
    mode: "overview" | "detailed";
    doc_ids?: string[];
    max_tokens?: number;
    category?: string;
    phase?: string;
    tags?: string;
    status?: string;
  },
): Promise<OverviewResult | DetailedResult> {
  const validated = GetSmartContextInputSchema.parse(args);

  if (validated.mode === "overview") {
    return runOverviewMode(dbPath, projectId, validated);
  } else {
    return runDetailedMode(dbPath, projectId, validated);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerGetSmartContextTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "get_smart_context",
    {
      description:
        "Two-phase context assembly tool. " +
        "Overview mode: metadata scan returning ~100-token summaries for all documents " +
        "(or filtered subset), sorted by priority/recency, accumulated to max_tokens budget. " +
        "Use overview first to discover what documents exist. " +
        "Detailed mode: fetches full content for specific doc_ids with 1-hop relationship graph " +
        "expansion. Related documents are included in priority order " +
        "(depends_on/implements before references/related_to). " +
        "Both modes drop entire documents when budget is exhausted — never truncates mid-content. " +
        "source is always 'document'. Default max_tokens is 4000.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        mode: z
          .enum(["overview", "detailed"])
          .describe(
            "overview: metadata scan with ~100-token summaries; " +
              "detailed: full content for doc_ids with 1-hop graph expansion",
          ),
        doc_ids: z
          .array(z.string().min(1))
          .optional()
          .describe("Required for detailed mode. Document IDs to fetch full content for."),
        max_tokens: z
          .number()
          .int()
          .min(500)
          .max(20000)
          .optional()
          .describe("Token budget for context assembly (default: 4000, min: 500, max: 20000)"),
        category: z
          .enum(VALID_CATEGORIES)
          .optional()
          .describe("Filter documents by category"),
        phase: z.string().optional().describe("Filter documents by project phase or milestone"),
        tags: z
          .string()
          .optional()
          .describe("Filter by single tag (exact match). Documents use pipe-delimited format."),
        status: z
          .enum(VALID_STATUSES)
          .optional()
          .describe(
            "Filter by status. Superseded documents are excluded by default unless specified.",
          ),
      }),
    },
    async (args) => {
      const log = createToolLogger("get_smart_context");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = GetSmartContextInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          mode: parsed.mode,
          docIds: parsed.doc_ids,
          maxTokens: parsed.max_tokens,
          category: parsed.category,
          phase: parsed.phase,
          tags: parsed.tags,
          status: parsed.status,
        },
        "get_smart_context invoked",
      );

      try {
        const data = await getSmartContext(dbPath, parsed.project_id, parsed);
        const result: ToolResult<typeof data> = { success: true, data };
        log.info({ durationMs: Date.now() - start, mode: parsed.mode }, "get_smart_context complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error(
          { error: String(err), durationMs: Date.now() - start },
          "get_smart_context failed",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
