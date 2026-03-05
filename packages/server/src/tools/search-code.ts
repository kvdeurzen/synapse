/**
 * search_code MCP tool — semantic, fulltext, and hybrid (RRF) search on code_chunks.
 *
 * Supports three search modes:
 * - semantic: vector similarity via Ollama embeddings
 * - fulltext: BM25 keyword search (no Ollama required)
 * - hybrid: RRF-merged vector + BM25 (falls back to FTS when Ollama unavailable)
 *
 * Code-specific filters: language, symbol_type, file_pattern (glob syntax).
 *
 * Exports:
 * - searchCode: core function (testable without MCP server)
 * - registerSearchCodeTool: MCP registration wrapper
 * - CodeSearchResultItem: result item type
 * - CodeSearchResult: result container type
 */

import { rerankers } from "@lancedb/lancedb";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { OllamaUnreachableError } from "../errors.js";
import { createToolLogger } from "../logger.js";
import { embed, getOllamaStatus } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { extractSnippet, normalizeFtsScore, normalizeVectorScore } from "./search-utils.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface CodeSearchResultItem {
  chunk_id: string;
  file_path: string;
  symbol_name: string | null;
  symbol_type: string | null;
  scope_chain: string[]; // parsed from stored dot-notation string via .split(".")
  content: string; // trimmed snippet via extractSnippet()
  relevance_score: number; // 0.0-1.0 normalized
  start_line: number | null;
  end_line: number | null;
  language: string | null;
  source: "code"; // always "code" for attribution
}

export interface CodeSearchResult {
  results: CodeSearchResultItem[];
  total: number;
  search_type: "semantic" | "fulltext" | "hybrid" | "hybrid_fts_fallback";
  fallback?: boolean;
  fallback_reason?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const SearchCodeInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  query: z.string().min(1),
  mode: z.enum(["semantic", "fulltext", "hybrid"]).optional().default("hybrid"),
  language: z.string().optional(),
  symbol_type: z.string().optional(),
  file_pattern: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
  min_score: z.number().min(0).max(1).optional().default(0.0),
});

type SearchCodeArgs = z.infer<typeof SearchCodeInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert a glob pattern to a SQL LIKE predicate string.
 *
 * - ** → % (match any path segments)
 * - * → % (match any chars within a segment)
 * - ? → _ (match single char)
 * - % and _ are escaped to prevent unintended matching
 */
export function globToSqlLike(glob: string): string {
  return glob
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*\*/g, "%")
    .replace(/\*/g, "%")
    .replace(/\?/g, "_");
}

/**
 * Build a row result item from a LanceDB code_chunks row.
 */
function buildResultItem(
  row: Record<string, unknown>,
  score: number,
  query: string,
): CodeSearchResultItem {
  const rawScopeChain = row.scope_chain as string | null | undefined;
  const scopeChain: string[] =
    rawScopeChain && rawScopeChain.trim().length > 0 ? rawScopeChain.split(".") : [];

  const content = (row.content as string) ?? "";

  return {
    chunk_id: row.chunk_id as string,
    file_path: row.file_path as string,
    symbol_name: (row.symbol_name as string | null) ?? null,
    symbol_type: (row.symbol_type as string | null) ?? null,
    scope_chain: scopeChain,
    content: extractSnippet(content, query),
    relevance_score: score,
    start_line: (row.start_line as number | null) ?? null,
    end_line: (row.end_line as number | null) ?? null,
    language: (row.language as string | null) ?? null,
    source: "code",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function searchCode(
  dbPath: string,
  projectId: string,
  args: Partial<SearchCodeArgs> & { project_id: string; query: string },
  config: SynapseConfig,
): Promise<CodeSearchResult> {
  const validated = SearchCodeInputSchema.parse(args);
  const limit = validated.limit ?? 10;
  const minScore = validated.min_score ?? 0.0;
  const mode = validated.mode ?? "hybrid";

  // ── Build code-specific predicate (inline — no cross-table joins) ──────────
  const predicateParts: string[] = [`project_id = '${projectId}'`];
  if (validated.language !== undefined) {
    predicateParts.push(`language = '${validated.language}'`);
  }
  if (validated.symbol_type !== undefined) {
    predicateParts.push(`symbol_type = '${validated.symbol_type}'`);
  }
  if (validated.file_pattern !== undefined) {
    predicateParts.push(`file_path LIKE '${globToSqlLike(validated.file_pattern)}'`);
  }
  const predicate = predicateParts.join(" AND ");

  const db = await connectDb(dbPath);
  const codeChunksTable = await db.openTable("code_chunks");

  // ── Fulltext mode ──────────────────────────────────────────────────────────
  if (mode === "fulltext") {
    try {
      const rows = await codeChunksTable
        .query()
        .fullTextSearch(validated.query)
        .where(predicate)
        .limit(limit * 2)
        .toArray();

      const results: CodeSearchResultItem[] = [];
      for (const row of rows) {
        const rawScore = (row._score as number) ?? 0;
        const score = normalizeFtsScore(rawScore);
        if (score >= minScore) {
          results.push(buildResultItem(row as Record<string, unknown>, score, validated.query));
        }
      }

      const limited = results.slice(0, limit);
      return {
        results: limited,
        total: limited.length,
        search_type: "fulltext",
      };
    } catch {
      // Empty table or FTS index not ready — return empty results (Pitfall 3)
      return { results: [], total: 0, search_type: "fulltext" };
    }
  }

  // ── Semantic mode ──────────────────────────────────────────────────────────
  if (mode === "semantic") {
    const ollamaStatus = getOllamaStatus();
    if (ollamaStatus !== "ok") {
      throw new OllamaUnreachableError(config.ollamaUrl);
    }

    const [queryVector] = await embed([validated.query], projectId, config);
    if (!queryVector) {
      throw new Error("Failed to embed query — no vector returned");
    }

    const rows = await codeChunksTable
      .query()
      .nearestTo(queryVector)
      .distanceType("cosine")
      .where(predicate)
      .limit(limit * 2)
      .toArray();

    const results: CodeSearchResultItem[] = [];
    for (const row of rows) {
      const distance = (row._distance as number) ?? 2;
      const score = normalizeVectorScore(distance);
      if (score >= minScore) {
        results.push(buildResultItem(row as Record<string, unknown>, score, validated.query));
      }
    }

    const limited = results.slice(0, limit);
    return {
      results: limited,
      total: limited.length,
      search_type: "semantic",
    };
  }

  // ── Hybrid mode (default) ──────────────────────────────────────────────────
  const ollamaStatus = getOllamaStatus();
  if (ollamaStatus !== "ok") {
    // Fall back to FTS-only when Ollama is unreachable
    const log = createToolLogger("search_code");
    log.warn({ ollamaStatus }, "Ollama unreachable — search_code hybrid falling back to FTS-only");

    try {
      const rows = await codeChunksTable
        .query()
        .fullTextSearch(validated.query)
        .where(predicate)
        .limit(limit * 2)
        .toArray();

      const results: CodeSearchResultItem[] = [];
      for (const row of rows) {
        const rawScore = (row._score as number) ?? 0;
        const score = normalizeFtsScore(rawScore);
        if (score >= minScore) {
          results.push(buildResultItem(row as Record<string, unknown>, score, validated.query));
        }
      }

      const limited = results.slice(0, limit);
      return {
        results: limited,
        total: limited.length,
        search_type: "hybrid_fts_fallback",
        fallback: true,
        fallback_reason: "Ollama unreachable",
      };
    } catch {
      // Empty table or FTS not ready
      return {
        results: [],
        total: 0,
        search_type: "hybrid_fts_fallback",
        fallback: true,
        fallback_reason: "Ollama unreachable",
      };
    }
  }

  // Ollama available — run full hybrid search with RRFReranker
  const [queryVector] = await embed([validated.query], projectId, config);
  if (!queryVector) {
    throw new Error("Failed to embed query — no vector returned");
  }

  const reranker = await rerankers.RRFReranker.create(60);

  const rows = await codeChunksTable
    .query()
    .nearestTo(queryVector)
    .distanceType("cosine")
    .fullTextSearch(validated.query)
    .where(predicate)
    .rerank(reranker)
    .limit(limit)
    .toArray();

  // Extract relevance score from RRF output — detect at runtime
  const results: CodeSearchResultItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;

    let score: number;
    if (typeof row._relevance_score === "number") {
      score = row._relevance_score;
    } else if (typeof row._score === "number") {
      score = row._score;
    } else {
      // Position-based scoring (RRF formula): 1 / (rank + k) where k=60
      score = 1 / (i + 60);
    }

    // RRF scores are already in (0,1] range — clamp to [0,1]
    const normalizedScore = Math.max(0, Math.min(1, score));

    if (normalizedScore >= minScore) {
      results.push(buildResultItem(row, normalizedScore, validated.query));
    }
  }

  return {
    results,
    total: results.length,
    search_type: "hybrid",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerSearchCodeTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "search_code",
    {
      description:
        "Search indexed code using semantic (vector), fulltext (BM25), or hybrid (RRF) modes against the code_chunks table. " +
        "Hybrid mode is default and combines vector similarity with keyword matching via Reciprocal Rank Fusion. " +
        "Falls back to fulltext-only if Ollama is unreachable. " +
        "Supports code-specific filters: language (e.g. 'typescript'), symbol_type (e.g. 'function', 'class'), " +
        "and file_pattern (glob syntax, e.g. 'src/**/*.ts'). " +
        "Returns file_path, symbol_name, scope_chain (array), content snippet, relevance_score, start_line, end_line.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        query: z
          .string()
          .min(1)
          .describe("Search query (natural language for semantic/hybrid, keywords for fulltext)"),
        mode: z
          .enum(["semantic", "fulltext", "hybrid"])
          .optional()
          .describe(
            "Search mode: 'semantic' (vector similarity), 'fulltext' (BM25 keyword), or 'hybrid' (RRF fusion, default)",
          ),
        language: z
          .string()
          .optional()
          .describe("Filter by programming language (e.g. 'typescript', 'python', 'rust')"),
        symbol_type: z
          .string()
          .optional()
          .describe("Filter by symbol type (e.g. 'function', 'class', 'method', 'constant')"),
        file_pattern: z
          .string()
          .optional()
          .describe("Filter by file path glob pattern (e.g. 'src/**/*.ts', 'tests/*.spec.js')"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results to return (default: 10, max: 50)"),
        min_score: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum relevance score threshold 0.0-1.0 (default: 0.0)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("search_code");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = SearchCodeInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          query: parsed.query,
          mode: parsed.mode,
          language: parsed.language,
          symbolType: parsed.symbol_type,
          filePattern: parsed.file_pattern,
          limit: parsed.limit,
          minScore: parsed.min_score,
        },
        "search_code invoked",
      );

      try {
        const data = await searchCode(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<CodeSearchResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            total: data.total,
            searchType: data.search_type,
            fallback: data.fallback,
          },
          "search_code complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "search_code failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
