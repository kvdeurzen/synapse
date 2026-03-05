/**
 * query_decisions MCP tool — filter and browse stored decisions.
 *
 * Exports:
 * - QueryDecisionsResult: result type
 * - DecisionSummary: per-decision result shape
 * - queryDecisions: core function (testable without MCP server)
 * - registerQueryDecisionsTool: MCP registration wrapper
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { TIER_NAMES, VALID_DECISION_STATUSES, VALID_DECISION_TYPES } from "./decision-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const QueryDecisionsInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  tier: z.number().int().min(0).max(3).optional(),
  status: z.enum(VALID_DECISION_STATUSES).optional(),
  decision_type: z.enum(VALID_DECISION_TYPES).optional(),
  subject: z.string().optional().describe("Substring match on subject field (case-insensitive)"),
  tags: z.string().optional().describe("Tag to filter by (matches pipe-separated tag substring)"),
  phase: z.string().optional(),
  include_inactive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include superseded and revoked decisions (default: false)"),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

type QueryDecisionsArgs = z.infer<typeof QueryDecisionsInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

/**
 * A single decision result — all fields except vector.
 */
export interface DecisionSummary {
  decision_id: string;
  subject: string;
  choice: string;
  context: string;
  rationale: string;
  tier: number;
  tier_name: string;
  decision_type: string;
  status: string;
  actor: string;
  phase: string | null;
  tags: string;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueryDecisionsResult {
  results: DecisionSummary[];
  total: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function queryDecisions(
  dbPath: string,
  projectId: string,
  args: Partial<QueryDecisionsArgs> & { project_id: string },
): Promise<QueryDecisionsResult> {
  const validated = QueryDecisionsInputSchema.parse(args);
  const limit = validated.limit ?? 20;
  const offset = validated.offset ?? 0;

  const db = await connectDb(dbPath);
  const table = await db.openTable("decisions");

  // Build WHERE predicate — use SQL for indexed fields
  const parts: string[] = [`project_id = '${projectId}'`];

  // Status logic:
  // - If explicit status filter provided: use that status (overrides include_inactive)
  // - If include_inactive: return all statuses
  // - Otherwise: filter to active only
  if (validated.status) {
    parts.push(`status = '${validated.status}'`);
  } else if (!validated.include_inactive) {
    parts.push("status = 'active'");
  }

  // Indexed field filters — handled in SQL
  if (validated.tier !== undefined && validated.tier !== null) {
    parts.push(`tier = ${validated.tier}`);
  }

  if (validated.decision_type) {
    parts.push(`decision_type = '${validated.decision_type}'`);
  }

  if (validated.phase) {
    parts.push(`phase = '${validated.phase}'`);
  }

  const predicate = parts.join(" AND ");

  // Fetch broader result set for JS-based post-filtering (subject/tags)
  // IMPORTANT: LanceDB SQL WHERE has limited LIKE support, so we do substring matching in JS
  const fetchLimit = limit + offset;
  const rows = await table
    .query()
    .where(predicate)
    .limit(fetchLimit * 10)
    .toArray();

  // Post-filter in JS: subject substring match (case-insensitive) and tags match
  let filtered = rows;

  if (validated.subject) {
    const subjectLower = validated.subject.toLowerCase();
    filtered = filtered.filter((row) =>
      (row.subject as string).toLowerCase().includes(subjectLower),
    );
  }

  if (validated.tags) {
    const tagPattern = validated.tags;
    filtered = filtered.filter((row) => {
      const tags = row.tags as string;
      // Match if the tag appears as a pipe-delimited segment
      return (
        tags.includes(`|${tagPattern}|`) ||
        tags.includes(`|${tagPattern}`) ||
        tags.includes(`${tagPattern}|`) ||
        tags === tagPattern
      );
    });
  }

  // Sort by created_at descending
  filtered.sort((a, b) => {
    const dateA = (a.created_at as string) ?? "";
    const dateB = (b.created_at as string) ?? "";
    return dateB.localeCompare(dateA);
  });

  // Apply offset/limit in JS
  const paginated = filtered.slice(offset, offset + limit);

  // Map to DecisionSummary (strip vector field)
  const results: DecisionSummary[] = paginated.map((row) => ({
    decision_id: row.decision_id as string,
    subject: row.subject as string,
    choice: row.choice as string,
    context: row.context as string,
    rationale: row.rationale as string,
    tier: row.tier as number,
    tier_name: (row.tier_name as string) ?? TIER_NAMES[row.tier as number] ?? "execution",
    decision_type: row.decision_type as string,
    status: row.status as string,
    actor: row.actor as string,
    phase: (row.phase as string | null) ?? null,
    tags: row.tags as string,
    superseded_by: (row.superseded_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));

  return { results, total: results.length };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerQueryDecisionsTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "query_decisions",
    {
      description:
        "Browse and filter stored decisions by tier, status, decision_type, subject, tags, and phase. " +
        "Returns decision metadata and full content. Active decisions are returned by default; " +
        "use include_inactive=true to include superseded and revoked decisions. " +
        "Supports pagination via limit and offset. No embedding calls — pure metadata filtering.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        tier: z
          .number()
          .int()
          .min(0)
          .max(3)
          .optional()
          .describe(
            "Filter by decision tier: 0=product_strategy, 1=architecture, 2=functional_design, 3=execution",
          ),
        status: z
          .enum(VALID_DECISION_STATUSES)
          .optional()
          .describe("Filter by lifecycle status. Overrides include_inactive when set."),
        decision_type: z
          .enum(VALID_DECISION_TYPES)
          .optional()
          .describe(
            "Filter by decision type: architectural, module, pattern, convention, or tooling",
          ),
        subject: z
          .string()
          .optional()
          .describe("Case-insensitive substring match on the subject field"),
        tags: z
          .string()
          .optional()
          .describe(
            "Filter by tag (matches pipe-delimited tag, e.g. 'typescript' matches '|typescript|backend|')",
          ),
        phase: z.string().optional().describe("Filter by project phase or milestone"),
        include_inactive: z
          .boolean()
          .optional()
          .describe("Include superseded and revoked decisions (default: false)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum results to return (default: 20, max: 100)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of results to skip for pagination (default: 0)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("query_decisions");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = QueryDecisionsInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          tier: parsed.tier,
          status: parsed.status,
          decisionType: parsed.decision_type,
          subject: parsed.subject,
          tags: parsed.tags,
          phase: parsed.phase,
          includeInactive: parsed.include_inactive,
          limit: parsed.limit,
          offset: parsed.offset,
        },
        "query_decisions invoked",
      );

      try {
        const data = await queryDecisions(dbPath, parsed.project_id, parsed);
        const result: ToolResult<QueryDecisionsResult> = { success: true, data };
        log.info({ durationMs: Date.now() - start, total: data.total }, "query_decisions complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "query_decisions failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
