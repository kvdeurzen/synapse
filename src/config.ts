import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

/**
 * ConfigError — thrown by all config loaders on failure.
 * Extends Error so tests can catch it specifically.
 * Top-level CLI entry points should convert ConfigError to process.exit(1).
 */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const SynapseFrameworkConfigSchema = z.object({
	server: z.object({
		db: z
			.string({ error: "db path is required" })
			.min(1, "db path is required"),
		ollama_url: z.string().url().default("http://localhost:11434"),
		embed_model: z.string().default("nomic-embed-text"),
	}),
	connection: z
		.object({
			transport: z.enum(["stdio"]).default("stdio"),
			command: z.string().default("bun"),
			args: z.array(z.string()).default([]),
		})
		.default({}),
});

export type SynapseFrameworkConfig = z.infer<typeof SynapseFrameworkConfigSchema>;

const autonomyLevel = z.enum(["autopilot", "co-pilot", "advisory"]);

export const TrustConfigSchema = z.object({
	domains: z.record(z.string(), autonomyLevel).default({}),
	approval: z
		.object({
			decomposition: z
				.enum(["always", "strategic", "none"])
				.default("strategic"),
		})
		.default({}),
	tier_authority: z
		.record(z.string(), z.array(z.number().int().min(0).max(3)))
		.default({}),
	agent_overrides: z
		.record(
			z.string(),
			z.object({
				domains: z.record(z.string(), autonomyLevel).optional(),
			}),
		)
		.default({}),
});

export type TrustConfig = z.infer<typeof TrustConfigSchema>;

export const AgentsConfigSchema = z.object({
	agents: z
		.record(
			z.string(),
			z.object({
				model: z.enum(["opus", "sonnet"]).default("sonnet"),
				tier: z.number().int().min(0).max(3).optional(),
				skills: z.array(z.string()).default([]),
				allowed_tools: z.array(z.string()).default([]),
			}),
		)
		.default({}),
});

export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

export const SecretsConfigSchema = z
	.object({
		anthropic_api_key: z.string().optional(),
	})
	.passthrough(); // Allow arbitrary keys for future secrets

export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;

// ---------------------------------------------------------------------------
// Shared loader
// ---------------------------------------------------------------------------

interface LoadOptions {
	/** When true, return schema default if file is missing (for secrets.toml) */
	optional?: boolean;
}

function loadAndValidate<T>(
	filePath: string,
	schema: z.ZodType<T>,
	options: LoadOptions = {},
): T {
	let raw: string;

	// 1. Read file
	try {
		raw = readFileSync(filePath, "utf-8");
	} catch (err: unknown) {
		const isEnoent =
			err instanceof Error &&
			"code" in err &&
			(err as NodeJS.ErrnoException).code === "ENOENT";

		if (isEnoent && options.optional) {
			// Optional file — return schema default (empty/default object)
			const result = schema.safeParse({});
			if (result.success) return result.data;
			return {} as T;
		}

		throw new ConfigError(
			`[synapse-framework] ${filePath} not found. Create it from ${filePath}.template or run setup.`,
		);
	}

	// 2. Parse TOML
	let parsed: unknown;
	try {
		parsed = parseToml(raw);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		throw new ConfigError(
			`[synapse-framework] Malformed ${filePath}: ${message}`,
		);
	}

	// 3. Validate with Zod — collect ALL errors
	const result = schema.safeParse(parsed);
	if (!result.success) {
		const errors = result.error.issues
			.map((issue) => `  - ${issue.path.join(".") ? `${issue.path.join(".")}: ` : ""}${issue.message}`)
			.join("\n");
		throw new ConfigError(
			`[synapse-framework] Configuration error(s) in ${filePath}:\n${errors}`,
		);
	}

	return result.data;
}

// ---------------------------------------------------------------------------
// Public loaders
// ---------------------------------------------------------------------------

/**
 * Load and validate config/synapse.toml — Synapse MCP server connection config.
 * Throws ConfigError on missing file, malformed TOML, or invalid schema.
 */
export function loadSynapseConfig(
	configPath = "config/synapse.toml",
): SynapseFrameworkConfig {
	return loadAndValidate(configPath, SynapseFrameworkConfigSchema);
}

/**
 * Load and validate config/trust.toml — per-domain autonomy levels and approval tiers.
 * Throws ConfigError on missing file, malformed TOML, or invalid schema.
 */
export function loadTrustConfig(configPath = "config/trust.toml"): TrustConfig {
	return loadAndValidate(configPath, TrustConfigSchema);
}

/**
 * Load and validate config/agents.toml — agent registry with model assignments.
 * Throws ConfigError on missing file, malformed TOML, or invalid schema.
 */
export function loadAgentsConfig(
	configPath = "config/agents.toml",
): AgentsConfig {
	return loadAndValidate(configPath, AgentsConfigSchema);
}

/**
 * Load and validate config/secrets.toml — API keys and secrets.
 * Optional: returns {} if file missing (secrets are not required for development).
 */
export function loadSecretsConfig(
	configPath = "config/secrets.toml",
): SecretsConfig {
	return loadAndValidate(configPath, SecretsConfigSchema, { optional: true });
}

/**
 * Convenience function: load all four config files from a directory.
 * Uses default file names (synapse.toml, trust.toml, agents.toml, secrets.toml).
 */
export function loadAllConfig(configDir = "config"): {
	synapse: SynapseFrameworkConfig;
	trust: TrustConfig;
	agents: AgentsConfig;
	secrets: SecretsConfig;
} {
	return {
		synapse: loadSynapseConfig(join(configDir, "synapse.toml")),
		trust: loadTrustConfig(join(configDir, "trust.toml")),
		agents: loadAgentsConfig(join(configDir, "agents.toml")),
		secrets: loadSecretsConfig(join(configDir, "secrets.toml")),
	};
}
