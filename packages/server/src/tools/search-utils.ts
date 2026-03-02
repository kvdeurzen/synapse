/**
 * Shared search utility functions used by all search tools and get_smart_context.
 *
 * Exports:
 * - SearchResultItem: Common result shape per CONTEXT.md locked decisions
 * - buildSearchPredicate: Builds WHERE clause for doc_chunks queries with metadata pre-filter
 * - extractSnippet: Extract ~100-200 token window centered on query terms
 * - normalizeVectorScore: Cosine distance [0,2] → relevance [0,1]
 * - normalizeFtsScore: BM25 score → [0,1] via sigmoid
 * - fetchDocMetadata: Batch fetch doc metadata by doc_ids
 */

import { countTokens } from "gpt-tokenizer";
import { connectDb } from "../db/connection.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Common result shape for all search tools per CONTEXT.md locked decisions.
 */
export interface SearchResultItem {
  doc_id: string;
  chunk_id: string;
  title: string;
  category: string;
  status: string;
  relevance_score: number; // 0.0-1.0 normalized
  snippet: string; // ~100-200 token content snippet
  source: "document" | "code"; // table attribution
}

/**
 * Document metadata fetched from the documents table.
 */
export interface DocMeta {
  title: string;
  category: string;
  status: string;
  phase: string | null;
  tags: string;
  priority: number | null;
}

/**
 * Result from buildSearchPredicate.
 */
export interface SearchPredicateResult {
  predicate: string;
  docMap: Map<string, DocMeta>;
  postFilterRequired?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// normalizeVectorScore
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert cosine distance [0,2] to relevance score [0,1].
 *
 * Formula: 1.0 - (distance / 2)
 * - distance 0 (identical) → 1.0
 * - distance 1 (orthogonal) → 0.5
 * - distance 2 (opposite) → 0.0
 * Clamped to [0,1] for safety against out-of-range values.
 */
export function normalizeVectorScore(distance: number): number {
  return Math.max(0, Math.min(1, 1.0 - distance / 2));
}

// ────────────────────────────────────────────────────────────────────────────
// normalizeFtsScore
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert BM25 score (positive float) to [0,1] via sigmoid normalization.
 *
 * Formula: score / (score + 1)
 * - score 0 → 0
 * - score 1 → 0.5
 * - score 9 → 0.9
 * - score → ∞: approaches 1.0 but never reaches it
 * Returns 0 for score <= 0 (negative scores treated as no relevance).
 */
export function normalizeFtsScore(score: number): number {
  if (score <= 0) return 0;
  return score / (score + 1);
}

// ────────────────────────────────────────────────────────────────────────────
// extractSnippet
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract the most relevant ~maxTokens window from chunk content.
 *
 * Strategy:
 * 1. If content is already <= maxTokens, return as-is
 * 2. Find the first occurrence of any query word (case-insensitive)
 * 3. Extract a character window centered on that position (~4 chars/token)
 * 4. Trim to exact token budget using countTokens loop
 * 5. Add "..." prefix/suffix as needed
 */
export function extractSnippet(content: string, query: string, maxTokens = 150): string {
  // Short-circuit: content already fits within token budget
  if (countTokens(content) <= maxTokens) {
    return content;
  }

  // Find first occurrence of any query word (case-insensitive)
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const lower = content.toLowerCase();
  let bestPos = 0;
  for (const word of words) {
    const pos = lower.indexOf(word);
    if (pos !== -1) {
      bestPos = pos;
      break;
    }
  }

  // Extract a character window centered on bestPos (~4 chars per token)
  const CHARS_PER_TOKEN = 4;
  const windowChars = maxTokens * CHARS_PER_TOKEN;
  const start = Math.max(0, bestPos - Math.floor(windowChars / 2));
  let snippet = content.slice(start, start + windowChars);

  // Trim to exact token budget (remove 10 chars at a time from end)
  while (countTokens(snippet) > maxTokens && snippet.length > 0) {
    snippet = snippet.slice(0, -10);
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = start + windowChars < content.length ? "..." : "";
  return prefix + snippet.trimEnd() + suffix;
}

// ────────────────────────────────────────────────────────────────────────────
// fetchDocMetadata
// ────────────────────────────────────────────────────────────────────────────

/**
 * Batch fetch document metadata from the documents table for the given doc_ids.
 *
 * Returns a Map<doc_id, DocMeta> with title, category, status, phase, tags, priority.
 * Used by all search tools to enrich chunk results with document-level metadata.
 */
export async function fetchDocMetadata(
  dbPath: string,
  projectId: string,
  docIds: string[],
): Promise<Map<string, DocMeta>> {
  if (docIds.length === 0) {
    return new Map();
  }

  const db = await connectDb(dbPath);
  const docsTable = await db.openTable("documents");

  const idList = docIds.map((id) => `'${id}'`).join(",");
  const predicate = `project_id = '${projectId}' AND doc_id IN (${idList})`;

  const rows = await docsTable.query().where(predicate).toArray();

  const docMap = new Map<string, DocMeta>();
  for (const row of rows) {
    docMap.set(row.doc_id as string, {
      title: row.title as string,
      category: row.category as string,
      status: row.status as string,
      phase: (row.phase as string | null) ?? null,
      tags: row.tags as string,
      priority: (row.priority as number | null) ?? null,
    });
  }

  return docMap;
}

// ────────────────────────────────────────────────────────────────────────────
// buildSearchPredicate
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a WHERE clause predicate for doc_chunks queries with metadata pre-filter.
 *
 * Always includes:
 * - project_id = '{projectId}'
 * - status = 'active' (unless includeSuperseded is true)
 *
 * If metadata filters (category, phase, tags, status, priority) are provided:
 * - Pre-fetches matching doc_ids from documents table
 * - Adds doc_id IN (...) clause to the predicate
 * - Caps pre-filter at 200 doc_ids (RESEARCH.md pitfall 4)
 * - If more than 200 match, sets postFilterRequired=true and skips IN clause
 *
 * Tag validation: rejects tags not matching /^[a-zA-Z0-9_-]+$/ (same as query-documents.ts)
 */
export async function buildSearchPredicate(
  projectId: string,
  filters: {
    category?: string;
    phase?: string;
    tags?: string;
    status?: string;
    priority?: number;
  },
  opts?: { includeSuperseded?: boolean; dbPath: string },
): Promise<SearchPredicateResult> {
  const MAX_DOC_IDS = 200;
  const { includeSuperseded = false, dbPath } = opts ?? {};

  // Validate tag input to prevent SQL injection
  if (filters.tags !== undefined && filters.tags !== null) {
    if (!/^[a-zA-Z0-9_-]+$/.test(filters.tags)) {
      throw new Error(
        "INVALID_TAG: Tag must contain only letters, numbers, hyphens, and underscores",
      );
    }
  }

  // Build base chunk predicate parts
  const chunkParts: string[] = [`project_id = '${projectId}'`];
  if (!includeSuperseded) {
    chunkParts.push("status = 'active'");
  }

  const hasMetadataFilters =
    filters.category !== undefined ||
    filters.phase !== undefined ||
    filters.tags !== undefined ||
    filters.status !== undefined ||
    filters.priority !== undefined;

  let docMap = new Map<string, DocMeta>();
  let postFilterRequired = false;

  if (hasMetadataFilters && dbPath) {
    // Pre-fetch matching doc_ids from documents table
    const db = await connectDb(dbPath);
    const docsTable = await db.openTable("documents");

    // Build document-level predicate
    const docParts: string[] = [`project_id = '${projectId}'`];

    if (filters.category) {
      docParts.push(`category = '${filters.category}'`);
    }

    // Document status filter: if not provided, exclude superseded by default
    if (filters.status) {
      docParts.push(`status = '${filters.status}'`);
    } else if (!includeSuperseded) {
      docParts.push(`status != 'superseded'`);
    }

    if (filters.phase) {
      docParts.push(`phase = '${filters.phase}'`);
    }

    if (filters.tags) {
      // Pipe-delimited exact tag match (consistent with query-documents.ts pattern)
      docParts.push(`tags LIKE '%|${filters.tags}|%'`);
    }

    if (filters.priority !== undefined) {
      docParts.push(`priority >= ${filters.priority}`);
    }

    const docPredicate = docParts.join(" AND ");
    // Fetch enough to detect if we exceed cap
    const matchingDocs = await docsTable
      .query()
      .where(docPredicate)
      .limit(MAX_DOC_IDS + 1)
      .toArray();

    if (matchingDocs.length > MAX_DOC_IDS) {
      // Too many matches — skip pre-filter, require post-filter join
      postFilterRequired = true;
    } else if (matchingDocs.length > 0) {
      // Build doc_id IN clause
      const docIds = matchingDocs.map((r) => r.doc_id as string);

      // Populate docMap
      for (const row of matchingDocs) {
        docMap.set(row.doc_id as string, {
          title: row.title as string,
          category: row.category as string,
          status: row.status as string,
          phase: (row.phase as string | null) ?? null,
          tags: row.tags as string,
          priority: (row.priority as number | null) ?? null,
        });
      }

      const idList = docIds.map((id) => `'${id}'`).join(",");
      chunkParts.push(`doc_id IN (${idList})`);
    } else {
      // No matching docs — add impossible IN clause to return zero results
      chunkParts.push("doc_id IN ('')");
    }
  }

  const predicate = chunkParts.join(" AND ");

  return { predicate, docMap, postFilterRequired };
}
