import type { Connection } from "@lancedb/lancedb";
import { ulid } from "ulidx";
import { insertBatch } from "../db/batch.js";
import { ActivityLogRowSchema } from "../db/schema.js";
import { logger } from "../logger.js";

/**
 * Log a mutation to the activity_log table.
 *
 * Called AFTER every successful mutation — never before the write succeeds.
 * Uses "agent" as the default actor (MCP SDK does not expose caller identity).
 */
export async function logActivity(
  db: Connection,
  projectId: string,
  action: string,
  targetId: string | null,
  targetType: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const table = await db.openTable("activity_log");
  await insertBatch(
    table,
    [
      {
        log_id: ulid(),
        project_id: projectId,
        actor: "agent",
        action,
        target_id: targetId,
        target_type: targetType,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: new Date().toISOString(),
      },
    ],
    ActivityLogRowSchema,
  );
  logger.debug({ projectId, action, targetId, targetType }, "Activity logged");
}
