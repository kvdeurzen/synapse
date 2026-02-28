/**
 * hybrid_search MCP tool — RRF-merged vector + BM25 search on doc_chunks.
 *
 * Uses LanceDB native RRFReranker(60) for fusion. Falls back to FTS-only when
 * Ollama is unreachable (locked decision from CONTEXT.md).
 *
 * Exports:
 * - hybridSearch: core function (testable without MCP server)
 * - registerHybridSearchTool: MCP registration wrapper
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rerankers } from "@lancedb/lancedb";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import { embed, getOllamaStatus } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { VALID_CATEGORIES, VALID_STATUSES } from "./doc-constants.js";
import {
  type SearchResultItem,
  buildSearchPredicate,
  extractSnippet,
  fetchDocMetadata,
  normalizeVectorScore,
} from "./search-utils.js";
import { fulltextSearch, type FulltextSearchResult } from "./fulltext-search.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const HybridSearchInputSchema = z.object({
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

type HybridSearchArgs = z.infer<typeof HybridSearchInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  results: SearchResultItem[];
  total: number;
  search_type: "hybrid" | "hybrid_fts_fallback";
  fallback?: boolean;
  fallback_reason?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function hybridSearch(
  dbPath: string,
  projectId: string,
  args: Partial<HybridSearchArgs> & { project_id: string; query: string },
  config: SynapseConfig,
): Promise<HybridSearchResult> {
  const validated = HybridSearchInputSchema.parse(args);
  const limit = validated.limit ?? 5;
  const minScore = validated.min_score ?? 0.0;
  const includeSuperseded = validated.include_superseded ?? false;

  const log = createToolLogger("hybrid_search");

  // ── 1. Check Ollama status — fall back to FTS if unavailable ──────────────
  const ollamaStatus = getOllamaStatus();
  if (ollamaStatus !== "ok") {
    log.warn(
      { ollamaStatus },
      "Ollama unreachable — hybrid_search falling back to FTS-only",
    );

    const ftsResult: FulltextSearchResult = await fulltextSearch(
      dbPath,
      projectId,
      validated,
      config,
    );

    return {
      results: ftsResult.results,
      total: ftsResult.total,
      search_type: "hybrid_fts_fallback",
      fallback: true,
      fallback_reason: "Ollama unreachable",
    };
  }

  // ── 2. Build WHERE predicate via search-utils ──────────────────────────────
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

  // ── 3. Embed the query ─────────────────────────────────────────────────────
  const [queryVector] = await embed([validated.query], projectId, config);
  if (!queryVector) {
    throw new Error("Failed to embed query — no vector returned");
  }

  // ── 4. Run hybrid search with RRFReranker(60) ─────────────────────────────
  const db = await connectDb(dbPath);
  const docChunksTable = await db.openTable("doc_chunks");
  const reranker = await rerankers.RRFReranker.create(60);

  const rows = await docChunksTable
    .query()
    .nearestTo(queryVector)
    .distanceType("cosine")
    .fullTextSearch(validated.query)
    .where(predicate)
    .rerank(reranker)
    .limit(limit)
    .toArray();

  // ── 5. Extract relevance score from RRF output ────────────────────────────
  // RRFReranker may output _relevance_score or _score — detect at runtime
  const rawResults: Array<{ row: Record<string, unknown>; score: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;

    // Try known score field names from LanceDB RRF output
    let score: number;
    if (typeof row._relevance_score === "number") {
      score = row._relevance_score;
    } else if (typeof row._score === "number") {
      score = row._score;
    } else {
      // Position-based scoring (RRF formula): 1 / (rank + k) where k=60
      score = 1 / (i + 60);
    }

    // Normalize to [0,1] if needed
    // RRF scores are typically small positive floats (e.g., 0.016 for rank 1 with k=60)
    // They're already in (0,1] range, so just clamp
    const normalizedScore = Math.max(0, Math.min(1, score));

    if (normalizedScore >= minScore) {
      rawResults.push({ row, score: normalizedScore });
    }
  }

  // ── 6. Post-filter if needed ───────────────────────────────────────────────
  let filteredResults = rawResults;
  if (postFilterRequired && docMap.size > 0) {
    filteredResults = rawResults.filter((r) => docMap.has(r.row.doc_id as string));
  }

  // ── 7. Enrich with doc metadata ───────────────────────────────────────────
  const knownDocIds = new Set(docMap.keys());
  const missingDocIds = filteredResults
    .map((r) => r.row.doc_id as string)
    .filter((id) => !knownDocIds.has(id));

  let enrichedDocMap = docMap;
  if (missingDocIds.length > 0) {
    const extraMeta = await fetchDocMetadata(dbPath, projectId, [...new Set(missingDocIds)]);
    enrichedDocMap = new Map([...docMap, ...extraMeta]);
  }

  // ── 8. Build SearchResultItem[] ───────────────────────────────────────────
  const results: SearchResultItem[] = filteredResults.map(({ row, score }) => {
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
    search_type: "hybrid",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerHybridSearchTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "hybrid_search",
    {
      description:
        "Search documents using both vector similarity and BM25 keyword matching, merged via Reciprocal Rank Fusion (RRF). " +
        "Uses LanceDB native RRFReranker(k=60). Falls back to fulltext_search if Ollama is unreachable. " +
        "Best for queries that benefit from both semantic and keyword matching.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        query: z.string().min(1).describe("Search query combining keywords and natural language"),
        category: z
          .enum(VALID_CATEGORIES)
          .optional()
          .describe("Filter by document category"),
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
      const log = createToolLogger("hybrid_search");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = HybridSearchInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          query: parsed.query,
          category: parsed.category,
          limit: parsed.limit,
          minScore: parsed.min_score,
        },
        "hybrid_search invoked",
      );

      try {
        const data = await hybridSearch(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<HybridSearchResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            total: data.total,
            searchType: data.search_type,
            fallback: data.fallback,
          },
          "hybrid_search complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "hybrid_search failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
