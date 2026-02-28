/**
 * semantic_search MCP tool — vector search on doc_chunks using cosine similarity.
 *
 * Exports:
 * - semanticSearch: core function (testable without MCP server)
 * - registerSemanticSearchTool: MCP registration wrapper
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { OllamaUnreachableError } from "../errors.js";
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

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const SemanticSearchInputSchema = z.object({
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

type SemanticSearchArgs = z.infer<typeof SemanticSearchInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface SemanticSearchResult {
  results: SearchResultItem[];
  total: number;
  search_type: "semantic";
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function semanticSearch(
  dbPath: string,
  projectId: string,
  args: Partial<SemanticSearchArgs> & { project_id: string; query: string },
  config: SynapseConfig,
): Promise<SemanticSearchResult> {
  const validated = SemanticSearchInputSchema.parse(args);
  const limit = validated.limit ?? 5;
  const minScore = validated.min_score ?? 0.0;
  const includeSuperseded = validated.include_superseded ?? false;

  // ── 1. Require Ollama for semantic search ──────────────────────────────────
  const ollamaStatus = getOllamaStatus();
  if (ollamaStatus !== "ok") {
    throw new OllamaUnreachableError(config.ollamaUrl);
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

  // ── 4. Run vector search on doc_chunks ────────────────────────────────────
  const db = await connectDb(dbPath);
  const docChunksTable = await db.openTable("doc_chunks");

  const rows = await docChunksTable
    .query()
    .nearestTo(queryVector)
    .distanceType("cosine")
    .where(predicate)
    .limit(limit * 2) // fetch extra for post-filter and min_score
    .toArray();

  // ── 5. Normalize scores and filter ────────────────────────────────────────
  const rawResults: Array<{ row: Record<string, unknown>; score: number }> = [];

  for (const row of rows) {
    const distance = (row._distance as number) ?? 0;
    const score = normalizeVectorScore(distance);
    if (score >= minScore) {
      rawResults.push({ row: row as Record<string, unknown>, score });
    }
  }

  // ── 6. Post-filter if needed (when metadata filter exceeded 200 doc cap) ──
  let filteredResults = rawResults;
  if (postFilterRequired && docMap.size > 0) {
    filteredResults = rawResults.filter((r) => docMap.has(r.row.doc_id as string));
  }

  // ── 7. Collect any doc_ids not already in docMap ──────────────────────────
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
    search_type: "semantic",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerSemanticSearchTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "semantic_search",
    {
      description:
        "Search documents by semantic similarity using vector embeddings. " +
        "Converts the query to a vector via Ollama and finds the most similar document chunks using cosine distance. " +
        "Returns ranked results with relevance scores normalized to [0,1]. " +
        "Requires Ollama to be running — use fulltext_search if Ollama is unavailable.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        query: z.string().min(1).describe("Natural language search query"),
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
      const log = createToolLogger("semantic_search");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = SemanticSearchInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          query: parsed.query,
          category: parsed.category,
          limit: parsed.limit,
          minScore: parsed.min_score,
        },
        "semantic_search invoked",
      );

      try {
        const data = await semanticSearch(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<SemanticSearchResult> = { success: true, data };
        log.info(
          { durationMs: Date.now() - start, total: data.total },
          "semantic_search complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "semantic_search failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
