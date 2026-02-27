import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import type { SynapseConfig } from "./types.js";

const ConfigSchema = z.object({
  db: z
    .string({
      error: "Database path is required (--db, SYNAPSE_DB_PATH, or synapse.toml db)",
    })
    .min(1, "Database path is required (--db, SYNAPSE_DB_PATH, or synapse.toml db)"),
  ollamaUrl: z.string().url().default("http://localhost:11434"),
  embedModel: z.string().default("nomic-embed-text"),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

type TomlConfig = {
  db?: unknown;
  ollama_url?: unknown;
  embed_model?: unknown;
  log_level?: unknown;
};

/**
 * Load configuration with 4-level precedence: CLI args > env vars > synapse.toml > defaults.
 * Reports ALL validation errors at once and exits with code 1 on failure.
 * NEVER writes to stdout — uses console.error for pre-logger startup errors.
 */
export function loadConfig(): SynapseConfig {
  // 1. Parse CLI args
  const { values: cliArgs } = parseArgs({
    args: process.argv.slice(2),
    options: {
      db: { type: "string" },
      "log-level": { type: "string" },
      quiet: { type: "boolean", short: "q" },
    },
    strict: false,
    allowPositionals: false,
  });

  // 2. Read env vars — treat empty string as unset
  const envDb = process.env.SYNAPSE_DB_PATH || undefined;
  const envOllamaUrl = process.env.OLLAMA_URL || undefined;
  const envEmbedModel = process.env.EMBED_MODEL || undefined;

  // 3. Read synapse.toml from CWD (optional — silently skip if missing)
  let tomlConfig: TomlConfig = {};
  try {
    const raw = readFileSync("synapse.toml", "utf-8");
    const parsed = parseToml(raw);
    // Validate it's an object
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      tomlConfig = parsed as TomlConfig;
    }
  } catch (err: unknown) {
    // ENOENT = file not found, silently ignore
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Surface parse errors (not missing file)
      console.error("[synapse] Error parsing synapse.toml:", err.message);
    }
  }

  // 4. Merge with precedence: CLI > env > toml > defaults
  const tomlDb = typeof tomlConfig.db === "string" ? tomlConfig.db : undefined;
  const tomlOllamaUrl =
    typeof tomlConfig.ollama_url === "string" ? tomlConfig.ollama_url : undefined;
  const tomlEmbedModel =
    typeof tomlConfig.embed_model === "string" ? tomlConfig.embed_model : undefined;
  const tomlLogLevel = typeof tomlConfig.log_level === "string" ? tomlConfig.log_level : undefined;

  // Determine logLevel: --log-level > --quiet > env (none) > toml > default
  // --quiet sets 'warn' but is overridden by explicit --log-level
  const cliLogLevel = typeof cliArgs["log-level"] === "string" ? cliArgs["log-level"] : undefined;

  let resolvedLogLevel: string | undefined;
  if (cliLogLevel !== undefined) {
    resolvedLogLevel = cliLogLevel;
  } else if (cliArgs.quiet === true) {
    resolvedLogLevel = "warn";
  } else if (tomlLogLevel !== undefined) {
    resolvedLogLevel = tomlLogLevel;
  }

  // Treat empty CLI string as unset
  const cliDb = cliArgs.db || undefined;

  const merged: Record<string, unknown> = {
    db: cliDb ?? envDb ?? tomlDb,
    ollamaUrl: envOllamaUrl ?? tomlOllamaUrl,
    embedModel: envEmbedModel ?? tomlEmbedModel,
    logLevel: resolvedLogLevel,
  };

  // Remove undefined values so Zod defaults can apply
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }

  // 5. Validate via Zod — collect ALL errors
  const result = ConfigSchema.safeParse(merged);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => `  - ${issue.message}`).join("\n");
    console.error(`[synapse] Configuration error(s):\n${errors}`);
    process.exit(1);
  }

  return result.data as SynapseConfig;
}
