/**
 * Escape a string for use in LanceDB SQL WHERE predicates.
 * LanceDB SQL uses standard SQL single-quote escaping.
 * Replaces single quotes with doubled single quotes.
 */
export function escapeSQL(val: string): string {
  return val.replace(/'/g, "''");
}
