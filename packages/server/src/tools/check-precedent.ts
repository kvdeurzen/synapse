/**
 * check_precedent MCP tool — semantic precedent matching for proposed decisions.
 *
 * Exports:
 * - PrecedentMatch: per-match result shape
 * - CheckPrecedentResult: result type
 * - checkPrecedent: core function (testable without MCP server)
 * - registerCheckPrecedentTool: MCP registration wrapper
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { OllamaUnreachableError } from "../errors.js";
import { createToolLogger } from "../logger.js";
import { embed } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import { TIER_NAMES, VALID_DECISION_TYPES } from "./decision-constants.js";
import { normalizeVectorScore } from "./search-utils.js";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Similarity threshold for reporting a precedent (cosine distance <= 0.15 → similarity >= 0.85) */
const PRECEDENT_SIMILARITY_THRESHOLD = 0.85;
const MAX_PRECEDENT_MATCHES = 5;

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const CheckPrecedentInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  subject: z
    .string()
    .min(1)
    .describe("What is being decided (for context only — used in proposed output)"),
  rationale: z
    .string()
    .min(1)
    .describe("Justification for the proposed choice — embedded for vector comparison"),
  decision_type: z
    .enum(VALID_DECISION_TYPES)
    .describe("Decision type used for pre-filtering before vector search"),
  tier: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe("Informational tier — included in proposed output"),
  include_inactive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include superseded and revoked decisions in precedent search (default: false)"),
});

type CheckPrecedentArgs = z.infer<typeof CheckPrecedentInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface PrecedentMatch {
  decision_id: string;
  subject: string;
  choice: string;
  rationale: string;
  tier: number;
  tier_name: string;
  decision_type: string;
  status: string;
  similarity_score: number;
  created_at: string;
}

export interface CheckPrecedentResult {
  has_precedent: boolean;
  matches: PrecedentMatch[];
  proposed: {
    subject: string;
    decision_type: string;
    tier: number | undefined;
  };
  warning?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function checkPrecedent(
  dbPath: string,
  projectId: string,
  args: Partial<CheckPrecedentArgs> & {
    project_id: string;
    subject: string;
    rationale: string;
    decision_type: string;
  },
  config: SynapseConfig,
): Promise<CheckPrecedentResult> {
  const validated = CheckPrecedentInputSchema.parse(args);

  const proposed = {
    subject: validated.subject,
    decision_type: validated.decision_type,
    tier: validated.tier,
  };

  // ── 1. Connect and check if table has any rows ────────────────────────────
  const db = await connectDb(dbPath);
  const table = await db.openTable("decisions");
  const count = await table.countRows();

  if (count === 0) {
    return { has_precedent: false, matches: [], proposed };
  }

  // ── 2. Embed the proposed rationale ──────────────────────────────────────
  let vector: number[];
  try {
    const vectors = await embed([validated.rationale], projectId, config);
    const embeddedVector = vectors[0];
    if (!embeddedVector || embeddedVector.length !== 768) {
      return { has_precedent: false, matches: [], proposed };
    }
    vector = embeddedVector;
  } catch (err) {
    // Graceful degradation: if Ollama is unreachable, return false with warning
    if (err instanceof OllamaUnreachableError) {
      return {
        has_precedent: false,
        matches: [],
        proposed,
        warning: `Ollama unreachable at ${config.ollamaUrl} -- cannot perform semantic precedent search`,
      };
    }
    // Other errors also gracefully degrade (unexpected embed failure)
    return {
      has_precedent: false,
      matches: [],
      proposed,
      warning: `Embedding failed: ${String(err)} -- cannot perform semantic precedent search`,
    };
  }

  // ── 3. Build WHERE predicate for vector search ────────────────────────────
  const parts: string[] = [
    `project_id = '${projectId}'`,
    `decision_type = '${validated.decision_type}'`,
  ];

  if (!validated.include_inactive) {
    parts.push("status = 'active'");
  }

  const predicate = parts.join(" AND ");

  // ── 4. Execute vector search ──────────────────────────────────────────────
  let rows: Record<string, unknown>[];
  try {
    rows = (await table
      .vectorSearch(vector)
      .where(predicate)
      .limit(MAX_PRECEDENT_MATCHES)
      .toArray()) as Record<string, unknown>[];
  } catch {
    // Vector search failed (e.g., no indexed vectors) — return no precedent
    return { has_precedent: false, matches: [], proposed };
  }

  // ── 5. Convert distance to similarity score and apply threshold ───────────
  const matches: PrecedentMatch[] = [];

  for (const row of rows) {
    const distance = (row._distance as number) ?? 1;
    const similarity_score = normalizeVectorScore(distance);

    if (similarity_score < PRECEDENT_SIMILARITY_THRESHOLD) {
      continue; // Below threshold — skip
    }

    const tier = row.tier as number;
    matches.push({
      decision_id: row.decision_id as string,
      subject: row.subject as string,
      choice: row.choice as string,
      rationale: row.rationale as string,
      tier,
      tier_name: (row.tier_name as string) ?? TIER_NAMES[tier] ?? "execution",
      decision_type: row.decision_type as string,
      status: row.status as string,
      similarity_score,
      created_at: row.created_at as string,
    });
  }

  // ── 6. Sort by similarity descending (vector search already returns ranked, but ensure order) ──
  matches.sort((a, b) => b.similarity_score - a.similarity_score);

  // ── 7. Cap at max 5 matches ───────────────────────────────────────────────
  const topMatches = matches.slice(0, MAX_PRECEDENT_MATCHES);

  return {
    has_precedent: topMatches.length > 0,
    matches: topMatches,
    proposed,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerCheckPrecedentTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "check_precedent",
    {
      description:
        "Check whether a proposed decision has existing precedent in the Synapse knowledge base. " +
        "Embeds the proposed rationale via Ollama and performs a vector similarity search against stored decisions " +
        "of the same decision_type. Uses a fixed 0.85 similarity threshold. Returns has_precedent boolean and " +
        "up to 5 matching decisions ranked by similarity score. Active decisions only by default; " +
        "use include_inactive=true to include superseded and revoked decisions. " +
        "Recommended: call check_precedent BEFORE store_decision to avoid duplicating existing decisions.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        subject: z.string().min(1).describe("What is being decided (used in response context)"),
        rationale: z
          .string()
          .min(1)
          .describe("Justification for the proposed choice — embedded for vector comparison"),
        decision_type: z
          .enum(VALID_DECISION_TYPES)
          .describe(
            "Decision type: architectural, module, pattern, convention, or tooling — used for pre-filtering",
          ),
        tier: z
          .number()
          .int()
          .min(0)
          .max(3)
          .optional()
          .describe(
            "Decision tier: 0=product_strategy, 1=architecture, 2=functional_design, 3=execution (informational)",
          ),
        include_inactive: z
          .boolean()
          .optional()
          .describe("Include superseded and revoked decisions in search (default: false)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("check_precedent");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = CheckPrecedentInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          subject: parsed.subject,
          decisionType: parsed.decision_type,
          tier: parsed.tier,
          includeInactive: parsed.include_inactive,
        },
        "check_precedent invoked",
      );

      try {
        const data = await checkPrecedent(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<CheckPrecedentResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            hasPrecedent: data.has_precedent,
            matchCount: data.matches.length,
          },
          "check_precedent complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "check_precedent failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
