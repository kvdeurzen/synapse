import type { Table } from "@lancedb/lancedb";
import type { ZodTypeAny, z } from "zod";

export async function insertBatch<S extends ZodTypeAny>(
  table: Table,
  rows: z.infer<S>[],
  zodSchema: S,
): Promise<void> {
  if (rows.length === 0) {
    return; // Nothing to insert
  }
  // Validate every row BEFORE touching the DB — fail fast per user decision
  for (let i = 0; i < rows.length; i++) {
    const result = zodSchema.safeParse(rows[i]);
    if (!result.success) {
      const msgs = result.error.issues
        .map((e) => `${e.path.map(String).join(".")}: ${e.message}`)
        .join("; ");
      throw new Error(`[insertBatch] Row ${i} invalid for table '${table.name}': ${msgs}`);
    }
  }
  // Single atomic add — all-or-nothing per user decision
  await table.add(rows as Record<string, unknown>[]);
}
