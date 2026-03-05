import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import { DecisionRowSchema } from "../db/schema.js";
import { createToolLogger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import { embed } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";
import {
  TIER_NAMES,
  VALID_DECISION_STATUSES,
  VALID_DECISION_TYPES,
  VALID_TIERS,
} from "./decision-constants.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const StoreDecisionInputSchema = z.object({
  project_id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
    ),
  subject: z.string().min(1).describe("What is being decided"),
  choice: z.string().min(1).describe("What was chosen"),
  context: z
    .string()
    .min(1)
    .describe("Problem statement, constraints, and alternatives considered"),
  rationale: z.string().min(1).describe("Justification for the choice"),
  tier: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe(
      "Decision tier (0=product_strategy, 1=architecture, 2=functional_design, 3=execution)",
    ),
  decision_type: z.enum(VALID_DECISION_TYPES),
  tags: z
    .string()
    .optional()
    .default("")
    .describe("Pipe-separated tags, e.g. '|typescript|backend|'"),
  phase: z.string().optional().describe("Project phase or milestone this decision belongs to"),
  actor: z
    .string()
    .optional()
    .default("agent")
    .describe("Who made this decision (defaults to 'agent')"),
  supersedes: z
    .string()
    .optional()
    .describe("decision_id of the decision being superseded by this new decision"),
  status: z
    .enum(VALID_DECISION_STATUSES)
    .optional()
    .default("active")
    .describe("Decision lifecycle status (default: active)"),
});

type StoreDecisionArgs = z.infer<typeof StoreDecisionInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface StoreDecisionResult {
  decision_id: string;
  tier: number;
  tier_name: string;
  status: string;
  created_at: string;
  has_precedent: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function storeDecision(
  dbPath: string,
  projectId: string,
  args: StoreDecisionArgs,
  config: SynapseConfig,
): Promise<StoreDecisionResult> {
  // Validate input
  const validated = StoreDecisionInputSchema.parse(args);
  const db = await connectDb(dbPath);

  // Generate decision ID
  const decisionId = ulid();
  const now = new Date().toISOString();
  const tierName = TIER_NAMES[validated.tier] ?? "execution";

  // ── 1. Handle supersession ────────────────────────────────────────────────
  if (validated.supersedes) {
    const decisionsTable = await db.openTable("decisions");
    const existing = await decisionsTable
      .query()
      .where(`decision_id = '${validated.supersedes}' AND project_id = '${projectId}'`)
      .limit(1)
      .toArray();

    if (existing.length === 0) {
      throw new Error(
        `DECISION_NOT_FOUND: No decision found with decision_id '${validated.supersedes}' in project '${projectId}'`,
      );
    }

    // Mark old decision as superseded and record the new decision_id
    await decisionsTable.update({
      where: `decision_id = '${validated.supersedes}' AND project_id = '${projectId}'`,
      values: { status: "superseded", superseded_by: decisionId, updated_at: now },
    });
  }

  // ── 2. Embed the rationale text ───────────────────────────────────────────
  // Fail fast if Ollama is down — same pattern as store_document
  let vector: number[];
  const vectors = await embed([validated.rationale], projectId, config);
  vector = vectors[0] ?? [];

  // ── 3. Quick precedent check ──────────────────────────────────────────────
  // Check if any similar decisions exist (similarity >= 0.85, same decision_type)
  // If table is empty or search fails, has_precedent = false
  let has_precedent = false;
  try {
    const decisionsTable = await db.openTable("decisions");
    const count = await decisionsTable.countRows();
    if (count > 0 && vector.length === 768) {
      // Do a vector search for similar decisions of the same type
      const similar = await decisionsTable
        .vectorSearch(vector)
        .where(
          `project_id = '${projectId}' AND decision_type = '${validated.decision_type}' AND status = 'active'`,
        )
        .limit(1)
        .toArray();

      if (similar.length > 0) {
        // Check if the similarity score is above threshold
        // LanceDB returns _distance (lower = more similar for cosine distance)
        // For cosine, distance 0.15 or less corresponds to similarity >= 0.85
        const distance = similar[0]?._distance as number | undefined;
        if (distance !== undefined && distance <= 0.15) {
          has_precedent = true;
        }
      }
    }
  } catch {
    // Precedent check failure is non-fatal — continue without it
    has_precedent = false;
  }

  // ── 4. Insert decision row ────────────────────────────────────────────────
  const decisionsTable = await db.openTable("decisions");
  await insertBatch(
    decisionsTable,
    [
      {
        decision_id: decisionId,
        project_id: projectId,
        subject: validated.subject,
        context: validated.context,
        rationale: validated.rationale,
        choice: validated.choice,
        tier: validated.tier,
        tier_name: tierName,
        decision_type: validated.decision_type,
        status: validated.status ?? "active",
        actor: validated.actor ?? "agent",
        phase: validated.phase ?? null,
        tags: validated.tags ?? "",
        superseded_by: null,
        created_at: now,
        updated_at: now,
        vector: vector.length === 768 ? vector : null,
      },
    ],
    DecisionRowSchema,
  );

  // ── 5. Log activity ───────────────────────────────────────────────────────
  await logActivity(db, projectId, "store_decision", decisionId, "decision", {
    tier: validated.tier,
    decision_type: validated.decision_type,
  });

  // ── 6. Return result ──────────────────────────────────────────────────────
  return {
    decision_id: decisionId,
    tier: validated.tier,
    tier_name: tierName,
    status: validated.status ?? "active",
    created_at: now,
    has_precedent,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerStoreDecisionTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "store_decision",
    {
      description:
        "Store a decision in the Synapse knowledge base. Validates input, embeds rationale for semantic " +
        "precedent search, supports lifecycle management (active/superseded/revoked), and logs activity. " +
        "Returns decision_id, tier, tier_name, status, created_at, and has_precedent flag.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        subject: z.string().min(1).describe("What is being decided"),
        choice: z.string().min(1).describe("What was chosen"),
        context: z
          .string()
          .min(1)
          .describe("Problem statement, constraints, and alternatives considered"),
        rationale: z.string().min(1).describe("Justification for the choice"),
        tier: z
          .number()
          .int()
          .min(0)
          .max(3)
          .describe(
            "Decision tier: 0=product_strategy, 1=architecture, 2=functional_design, 3=execution",
          ),
        decision_type: z
          .enum(VALID_DECISION_TYPES)
          .describe("Decision type: architectural, module, pattern, convention, or tooling"),
        tags: z.string().optional().describe("Pipe-separated tags, e.g. '|typescript|backend|'"),
        phase: z
          .string()
          .optional()
          .describe("Project phase or milestone this decision belongs to"),
        actor: z.string().optional().describe("Who made this decision (defaults to 'agent')"),
        supersedes: z
          .string()
          .optional()
          .describe(
            "decision_id of the decision being superseded. The old decision will be marked as superseded.",
          ),
        status: z
          .enum(VALID_DECISION_STATUSES)
          .optional()
          .describe("Decision lifecycle status (default: active)"),
      }),
    },
    async (args) => {
      const log = createToolLogger("store_decision");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = StoreDecisionInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          subject: parsed.subject,
          tier: parsed.tier,
          decisionType: parsed.decision_type,
        },
        "store_decision invoked",
      );

      try {
        const data = await storeDecision(dbPath, parsed.project_id, parsed, config);
        const result: ToolResult<StoreDecisionResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            decisionId: data.decision_id,
            tier: data.tier,
            hasPrecedent: data.has_precedent,
          },
          "store_decision complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "store_decision failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}

// Export constants for callers that need them alongside this module
export { VALID_TIERS, TIER_NAMES, VALID_DECISION_TYPES, VALID_DECISION_STATUSES };
