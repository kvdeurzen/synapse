/**
 * get_smart_context MCP tool — two-phase context assembly system.
 *
 * Overview mode: metadata scan returning ~100-token summaries per document/code item,
 * sorted by weighted relevance, accumulated to a max_tokens budget.
 * Supports unified document + code_chunks results via source_types and bias parameters.
 *
 * Detailed mode: full content for specified doc_ids (or chunk_ids) with 1-hop graph expansion,
 * priority-ordered related documents, max_tokens budget respected.
 * Accepts a unified ID list — resolves documents first, then code_chunks for unmatched IDs.
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
  source_types: z.enum(["documents", "code", "both"]).optional().default("both"),
  bias: z.number().min(0).max(1).optional().default(0.5),
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

export interface OverviewCodeItem {
  chunk_id: string;
  file_path: string;
  symbol_name: string | null;
  symbol_type: string | null;
  language: string | null;
  summary: string; // symbol signature + first comment via extractSnippet
  token_count: number;
  source: "code";
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
  code_items?: OverviewCodeItem[]; // present when source_types includes "code"
  total_documents: number;
  included_documents: number;
  total_code_items?: number;
  included_code_items?: number;
  total_tokens: number;
  max_tokens: number;
  source: "document" | "code" | "both";
  total_matches?: number; // total candidates before budget filtering
  docs_returned?: number; // docs in final response
  code_returned?: number; // code items in final response
  truncated?: boolean;
  tokens_used?: number;
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
// Overview candidate (internal)
// ────────────────────────────────────────────────────────────────────────────

interface OverviewCandidate {
  type: "document" | "code";
  relevance_score: number;
  token_count: number;
  data: OverviewDocument | OverviewCodeItem;
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
  const sourceTypes = args.source_types ?? "both";
  const bias = args.bias ?? 0.5;

  const db = await connectDb(dbPath);

  const candidates: OverviewCandidate[] = [];

  // ── Step A: Collect document candidates ───────────────────────────────────
  let totalDocCandidates = 0;

  if (sourceTypes === "documents" || sourceTypes === "both") {
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

    // Fetch up to 100 rows
    const rows = await docsTable.query().where(predicate).limit(100).toArray();
    totalDocCandidates = rows.length;

    // Sort by priority (ascending, nulls last), then updated_at (descending)
    rows.sort((a, b) => {
      const pa = (a.priority as number | null) ?? 999;
      const pb = (b.priority as number | null) ?? 999;
      if (pa !== pb) return pa - pb;
      return (b.updated_at as string).localeCompare(a.updated_at as string);
    });

    for (const row of rows) {
      const content = row.content as string;
      const summary = extractSnippet(content, "", 100);
      const summaryTokens = countTokens(summary);

      // Base relevance from priority (normalize: lower priority number = higher relevance)
      const priority = (row.priority as number | null) ?? null;
      const baseScore = priority != null ? Math.max(0, Math.min(1, 1 - priority / 10)) : 0.5;

      // Apply bias weighting: higher bias favors documents
      // bias=1.0 → documents get max boost; bias=0.0 → documents get no boost
      const weightedScore = baseScore * (1 + bias);

      candidates.push({
        type: "document",
        relevance_score: weightedScore,
        token_count: summaryTokens,
        data: {
          doc_id: row.doc_id as string,
          title: row.title as string,
          category: row.category as string,
          status: row.status as string,
          priority: (row.priority as number | null) ?? null,
          summary,
          token_count: summaryTokens,
        } satisfies OverviewDocument,
      });
    }
  }

  // ── Step B: Collect code candidates ───────────────────────────────────────
  let totalCodeCandidates = 0;

  if (sourceTypes === "code" || sourceTypes === "both") {
    try {
      const codeTable = await db.openTable("code_chunks");
      const codeRows = await codeTable
        .query()
        .where(`project_id = '${projectId}'`)
        .limit(100)
        .toArray();
      totalCodeCandidates = codeRows.length;

      for (const row of codeRows) {
        const content = row.content as string;
        const summary = extractSnippet(content, "", 100); // signature + first comment
        const summaryTokens = countTokens(summary);

        // Base relevance: uniform for overview (no query = no relevance ranking)
        const baseScore = 0.5;

        // Apply bias weighting: lower bias favors code
        // bias=0.0 → code gets max boost; bias=1.0 → code gets no extra boost
        const weightedScore = baseScore * (1 + (1 - bias));

        candidates.push({
          type: "code",
          relevance_score: weightedScore,
          token_count: summaryTokens,
          data: {
            chunk_id: row.chunk_id as string,
            file_path: row.file_path as string,
            symbol_name: (row.symbol_name as string | null) ?? null,
            symbol_type: (row.symbol_type as string | null) ?? null,
            language: (row.language as string | null) ?? null,
            summary,
            token_count: summaryTokens,
            source: "code",
          } satisfies OverviewCodeItem,
        });
      }
    } catch {
      // code_chunks table may not have data yet — graceful degradation
    }
  }

  // ── Step C: Merge by relevance and fill budget ────────────────────────────
  // Per CONTEXT.md: "When token budget is tight, fill by pure relevance ranking
  // regardless of source type." The bias parameter weights scores before merging.
  candidates.sort((a, b) => b.relevance_score - a.relevance_score);

  const includedDocuments: OverviewDocument[] = [];
  const includedCodeItems: OverviewCodeItem[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const candidate of candidates) {
    if (totalTokens + candidate.token_count > maxTokens) {
      truncated = true;
      continue; // skip this candidate, try smaller ones
    }
    totalTokens += candidate.token_count;
    if (candidate.type === "document") {
      includedDocuments.push(candidate.data as OverviewDocument);
    } else {
      includedCodeItems.push(candidate.data as OverviewCodeItem);
    }
  }

  // ── Step D: Populate metadata fields per CONTEXT.md ─────────────────────
  const totalMatches = candidates.length;
  const docsReturned = includedDocuments.length;
  const codeReturned = includedCodeItems.length;

  // Determine source field
  let source: "document" | "code" | "both";
  if (sourceTypes === "documents") {
    source = "document";
  } else if (sourceTypes === "code") {
    source = "code";
  } else {
    // "both"
    source = "both";
  }

  const result: OverviewResult = {
    mode: "overview",
    documents: includedDocuments,
    total_documents: totalDocCandidates,
    included_documents: docsReturned,
    total_tokens: totalTokens,
    max_tokens: maxTokens,
    source,
    total_matches: totalMatches,
    docs_returned: docsReturned,
    code_returned: codeReturned,
    truncated,
    tokens_used: totalTokens,
  };

  // Only include code fields when code is part of the query
  if (sourceTypes === "code" || sourceTypes === "both") {
    result.code_items = includedCodeItems;
    result.total_code_items = totalCodeCandidates;
    result.included_code_items = codeReturned;
  }

  return result;
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
  const sourceTypes = args.source_types ?? "both";

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

  // Try code_chunks for any IDs not found in documents table
  // (unified ID list: "try documents first, then code_chunks" per Pitfall 5 / CONTEXT.md)
  if (sourceTypes === "code" || sourceTypes === "both") {
    const foundDocIds = new Set(requestedRows.map((r) => r.doc_id as string));
    const missingIds = docIds.filter((id) => !foundDocIds.has(id));

    if (missingIds.length > 0) {
      try {
        const codeTable = await db.openTable("code_chunks");
        for (const cid of missingIds) {
          const codeRows = await codeTable
            .query()
            .where(`chunk_id = '${cid}' AND project_id = '${projectId}'`)
            .limit(1)
            .toArray();

          if (codeRows.length > 0) {
            const row = codeRows[0];
            const content = row.content as string;
            const tokenCount = countTokens(content);

            documents.push({
              doc_id: cid,
              title:
                (row.file_path as string) +
                " :: " +
                ((row.symbol_name as string | null) ?? "chunk"),
              category: "code",
              status: "active",
              content,
              token_count: tokenCount,
              is_requested: true,
            });

            totalTokens += tokenCount;
          }
        }
      } catch {
        // code_chunks table may not exist yet — graceful degradation
      }
    }
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
  const sortedRelated = Array.from(relatedEntriesMap.entries()).sort(
    ([aId, aRel], [bId, bRel]) => {
      const aPri = RELATIONSHIP_PRIORITY[aRel.relationship_type] ?? 99;
      const bPri = RELATIONSHIP_PRIORITY[bRel.relationship_type] ?? 99;
      if (aPri !== bPri) return aPri - bPri;
      // Alphabetical by doc_id as tiebreaker (title not yet loaded)
      return aId.localeCompare(bId);
    },
  );

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
    doc_ids?: string[] | undefined;
    max_tokens?: number | undefined;
    category?: string | undefined;
    phase?: string | undefined;
    tags?: string | undefined;
    status?: string | undefined;
    source_types?: "documents" | "code" | "both" | undefined;
    bias?: number | undefined;
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
        "Overview mode: metadata scan returning ~100-token summaries for all documents and code items " +
        "(or filtered subset), sorted by weighted relevance, accumulated to max_tokens budget. " +
        "Use overview first to discover what documents and code symbols exist. " +
        "Detailed mode: fetches full content for specific doc_ids (or chunk_ids) with 1-hop relationship graph " +
        "expansion. Related documents are included in priority order " +
        "(depends_on/implements before references/related_to). " +
        "Both modes drop entire items when budget is exhausted — never truncates mid-content. " +
        "source_types controls which tables are queried (default: 'both'). " +
        "bias (0.0-1.0) weights document vs code relevance: 0.0=favor code, 1.0=favor documents, 0.5=equal. " +
        "Default max_tokens is 4000.",
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
          .describe(
            "Required for detailed mode. Document IDs or code chunk_ids to fetch full content for.",
          ),
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
        source_types: z
          .enum(["documents", "code", "both"])
          .optional()
          .describe(
            "Which tables to query: 'documents', 'code', or 'both' (default: 'both'). " +
              "When 'documents': only queries documents table (legacy behavior). " +
              "When 'code': only queries code_chunks table. " +
              "When 'both': unified results from both tables.",
          ),
        bias: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe(
            "Bias for weighting documents vs code relevance scores before merging. " +
              "0.0=favor code, 1.0=favor documents, 0.5=equal (default: 0.5). " +
              "Only relevant when source_types is 'both'.",
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
          sourceTypes: parsed.source_types,
          bias: parsed.bias,
        },
        "get_smart_context invoked",
      );

      try {
        const data = await getSmartContext(dbPath, parsed.project_id, parsed);
        const result: ToolResult<typeof data> = { success: true, data };
        log.info(
          { durationMs: Date.now() - start, mode: parsed.mode },
          "get_smart_context complete",
        );
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
