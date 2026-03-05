/**
 * fulltext_search MCP tool — BM25 full-text search on doc_chunks.
 *
 * Uses LanceDB's native FTS (tantivy-backed BM25 index). No Ollama required.
 *
 * Exports:
 * - fulltextSearch: core function (testable without MCP server)
 * - registerFulltextSearchTool: MCP registration wrapper
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";
import {
  buildSearchPredicate,
  extractSnippet,
  fetchDocMetadata,
  normalizeFtsScore,
  type SearchResultItem,
} from "./search-utils.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const FulltextSearchInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  query: z.string().min(1),
  category: z.enum(VALID_CATEGORIES).optional(),
  phase: z.string().optional(),
  tags: z.string().optional(),
  status: z.enum(VALID_STATUSES).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  limit: z.number().int().min(1).max(50).optional().default(5),
  min_score: z.number().min(0).max(1).optional().default(0.0),
  include_superseded: z.boolean().optional().default(false),
});

type FulltextSearchArgs = z.infer<typeof FulltextSearchInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface FulltextSearchResult {
  results: SearchResultItem[];
  total: number;
  search_type: "fulltext";
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function fulltextSearch(
  dbPath: string,
  projectId: string,
  args: Partial<FulltextSearchArgs> & { project_id: string; query: string },
  _config: SynapseConfig,
): Promise<FulltextSearchResult> {
  const validated = FulltextSearchInputSchema.parse(args);
  const limit = validated.limit ?? 5;
  const minScore = validated.min_score ?? 0.0;
  const includeSuperseded = validated.include_superseded ?? false;

  // ── 1. Build WHERE predicate via search-utils (no Ollama needed) ──────────
  const searchFilters: {
    category?: string;
    phase?: string;
    tags?: string;
    status?: string;
    priority?: number;
  } = {};
  if (validated.category !== undefined) searchFilters.category = validated.category;
  if (validated.phase !== undefined) searchFilters.phase = validated.phase;
  if (validated.tags !== undefined) searchFilters.tags = validated.tags;
  if (validated.status !== undefined) searchFilters.status = validated.status;
  if (validated.priority !== undefined) searchFilters.priority = validated.priority;

  const { predicate, docMap, postFilterRequired } = await buildSearchPredicate(
    projectId,
    searchFilters,
    { includeSuperseded, dbPath },
  );

  // ── 2. Run BM25 full-text search ──────────────────────────────────────────
  const db = await connectDb(dbPath);
  const docChunksTable = await db.openTable("doc_chunks");

  const rows = await docChunksTable
    .query()
    .fullTextSearch(validated.query)
    .where(predicate)
    .limit(limit * 2)
    .toArray();

  // ── 3. Normalize BM25 scores and filter by min_score ──────────────────────
  const rawResults: Array<{ row: Record<string, unknown>; score: number }> = [];

  for (const row of rows) {
    // LanceDB FTS returns score in _score field
    const rawScore = (row._score as number) ?? 0;
    const score = normalizeFtsScore(rawScore);
    if (score >= minScore) {
      rawResults.push({ row: row as Record<string, unknown>, score });
    }
  }

  // ── 4. Post-filter if needed (when metadata filter exceeded 200 doc cap) ──
  let filteredResults = rawResults;
  if (postFilterRequired && docMap.size > 0) {
    filteredResults = rawResults.filter((r) => docMap.has(r.row.doc_id as string));
  }

  // ── 5. Collect any doc_ids not already in docMap ──────────────────────────
  const knownDocIds = new Set(docMap.keys());
  const missingDocIds = filteredResults
    .map((r) => r.row.doc_id as string)
    .filter((id) => !knownDocIds.has(id));

  let enrichedDocMap = docMap;
  if (missingDocIds.length > 0) {
    const extraMeta = await fetchDocMetadata(dbPath, projectId, [...new Set(missingDocIds)]);
    enrichedDocMap = new Map([...docMap, ...extraMeta]);
  }

  // ── 6. Build SearchResultItem[] ───────────────────────────────────────────
  const results: SearchResultItem[] = filteredResults.slice(0, limit).map(({ row, score }) => {
    const docId = row.doc_id as string;
    const meta = enrichedDocMap.get(docId);
    const content = (row.content as string) ?? "";

    return {
      doc_id: docId,
      chunk_id: row.chunk_id as string,
      title: meta?.title ?? "",
      category: meta?.category ?? (row.category as string) ?? "",
      status: (row.status as string) ?? "",
      relevance_score: score,
      snippet: extractSnippet(content, validated.query),
      source: "document",
    };
  });

  return {
    results,
    total: results.length,
    search_type: "fulltext",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerFulltextSearchTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "fulltext_search",
    {
      description:
        "Search documents by keyword relevance using BM25 full-text search. " +
        "No embedding calls — works regardless of Ollama status. " +
        "Returns results ranked by BM25 score normalized to [0,1]. " +
        "Best for exact keyword matches; use semantic_search for conceptual similarity.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        query: z.string().min(1).describe("Search query with keywords to match"),
        category: z.enum(VALID_CATEGORIES).optional().describe("Filter by document category"),
        phase: z.string().optional().describe("Filter by project phase or milestone"),
        tags: z.string().optional().describe("Filter by single tag (exact match)"),
        status: z.enum(VALID_STATUSES).optional().describe("Filter by document status"),
        priority: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Minimum priority filter (1=highest)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results to return (default: 5, max: 50)"),
        min_score: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum relevance score threshold 0.0-1.0 (default: 0.0)"),
        include_superseded: z
          .boolean()
          .optional()
          .describe("Include superseded document chunks (default: false)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("fulltext_search");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = FulltextSearchInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          query: parsed.query,
          category: parsed.category,
          limit: parsed.limit,
          minScore: parsed.min_score,
        },
        "fulltext_search invoked",
      );

      try {
        const data = await fulltextSearch(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<FulltextSearchResult> = { success: true, data };
        log.info({ durationMs: Date.now() - start, total: data.total }, "fulltext_search complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "fulltext_search failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
