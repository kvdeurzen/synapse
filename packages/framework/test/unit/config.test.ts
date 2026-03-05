import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigError,
  loadAgentsConfig,
  loadAllConfig,
  loadSecretsConfig,
  loadSynapseConfig,
  loadTrustConfig,
} from "../../src/config";

// Helper to create a temp directory for isolated tests
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "synapse-config-test-"));
}

describe("loadSynapseConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("succeeds with valid synapse.toml", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "synapse.toml");
    writeFileSync(
      configPath,
      `
[server]
db = "/path/to/synapse.db"
ollama_url = "http://localhost:11434"
embed_model = "nomic-embed-text"

[connection]
transport = "stdio"
command = "bun"
args = ["run", "/path/to/server/src/index.ts"]
`,
    );

    const config = loadSynapseConfig(configPath);
    expect(config.server.db).toBe("/path/to/synapse.db");
    expect(config.server.ollama_url).toBe("http://localhost:11434");
    expect(config.server.embed_model).toBe("nomic-embed-text");
    expect(config.connection.transport).toBe("stdio");
    expect(config.connection.command).toBe("bun");
  });

  test("throws ConfigError when file missing", () => {
    expect(() => loadSynapseConfig("/nonexistent/path/synapse.toml")).toThrow(ConfigError);

    let errorMessage = "";
    try {
      loadSynapseConfig("/nonexistent/path/synapse.toml");
    } catch (err) {
      if (err instanceof ConfigError) errorMessage = err.message;
    }
    expect(errorMessage).toContain("not found");
    expect(errorMessage).toContain("synapse.toml");
  });

  test("throws ConfigError on malformed TOML", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "synapse.toml");
    writeFileSync(configPath, "db = [invalid toml");

    let errorMessage = "";
    try {
      loadSynapseConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) errorMessage = err.message;
    }
    expect(errorMessage).toContain("Malformed");
  });

  test("throws ConfigError on invalid schema (missing required db)", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "synapse.toml");
    writeFileSync(
      configPath,
      `
[server]
ollama_url = "http://localhost:11434"
`,
    );

    let errorMessage = "";
    try {
      loadSynapseConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) errorMessage = err.message;
    }
    expect(errorMessage).toContain("db path is required");
  });
});

describe("loadTrustConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("succeeds with valid trust.toml", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"
implementation = "autopilot"
documentation = "autopilot"

[approval]
decomposition = "strategic"
`,
    );

    const config = loadTrustConfig(configPath);
    expect(config.domains.architecture).toBe("co-pilot");
    expect(config.domains.implementation).toBe("autopilot");
    expect(config.approval.decomposition).toBe("strategic");
  });

  test("throws ConfigError on invalid autonomy level", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "yolo"
`,
    );

    let threwConfigError = false;
    try {
      loadTrustConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) threwConfigError = true;
    }
    expect(threwConfigError).toBe(true);
  });
});

describe("loadAgentsConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("succeeds with valid agents.toml", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "agents.toml");
    writeFileSync(
      configPath,
      `
[agents.executor]
model = "sonnet"
tier = 3
skills = []

[agents.architect]
model = "opus"
tier = 1
skills = ["systems-design"]
`,
    );

    const config = loadAgentsConfig(configPath);
    expect(config.agents.executor?.model).toBe("sonnet");
    expect(config.agents.executor?.tier).toBe(3);
    expect(config.agents.architect?.model).toBe("opus");
    expect(config.agents.architect?.skills).toContain("systems-design");
  });
});

describe("loadSecretsConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty object when file missing (optional)", () => {
    const config = loadSecretsConfig("/nonexistent/secrets.toml");
    expect(config).toEqual({});
  });

  test("loads valid secrets file when present", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "secrets.toml");
    writeFileSync(configPath, `anthropic_api_key = "sk-ant-test123"`);

    const config = loadSecretsConfig(configPath);
    expect(config.anthropic_api_key).toBe("sk-ant-test123");
  });
});

describe("loadAllConfig", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads all four configs from directory", () => {
    tmpDir = makeTmpDir();

    writeFileSync(
      join(tmpDir, "synapse.toml"),
      `
[server]
db = "/tmp/synapse.db"

[connection]
transport = "stdio"
`,
    );

    writeFileSync(
      join(tmpDir, "trust.toml"),
      `
[domains]
implementation = "autopilot"

[approval]
decomposition = "none"
`,
    );

    writeFileSync(
      join(tmpDir, "agents.toml"),
      `
[agents.executor]
model = "sonnet"
skills = []
`,
    );

    // No secrets.toml — should be optional and return {}

    const all = loadAllConfig(tmpDir);
    expect(all.synapse.server.db).toBe("/tmp/synapse.db");
    expect(all.trust.domains.implementation).toBe("autopilot");
    expect(all.agents.agents.executor?.model).toBe("sonnet");
    expect(all.secrets).toEqual({});
  });
});

describe("default config files pass validation", () => {
  // This test catches drift between the actual config files and the Zod schemas
  const repoRoot = new URL("../../", import.meta.url).pathname;

  test("config/synapse.toml is valid", () => {
    const configPath = join(repoRoot, "config/synapse.toml");
    // Should not throw — default config must always be valid
    expect(() => loadSynapseConfig(configPath)).not.toThrow();
  });

  test("config/trust.toml is valid", () => {
    const configPath = join(repoRoot, "config/trust.toml");
    expect(() => loadTrustConfig(configPath)).not.toThrow();
  });

  test("config/agents.toml is valid", () => {
    const configPath = join(repoRoot, "config/agents.toml");
    expect(() => loadAgentsConfig(configPath)).not.toThrow();
  });
});

describe("TrustConfigSchema extensions", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("accepts trust.toml with [tier_authority] section mapping agent names to tier arrays", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[approval]
decomposition = "strategic"

[tier_authority]
product-strategist = [0, 1]
executor = [3]
validator = []
`,
    );

    const config = loadTrustConfig(configPath);
    expect(config.tier_authority["product-strategist"]).toEqual([0, 1]);
    expect(config.tier_authority.executor).toEqual([3]);
    expect(config.tier_authority.validator).toEqual([]);
  });

  test("accepts trust.toml with [agent_overrides] section for per-agent domain overrides", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[approval]
decomposition = "strategic"

[agent_overrides.executor.domains]
architecture = "advisory"
`,
    );

    const config = loadTrustConfig(configPath);
    expect(config.agent_overrides.executor?.domains?.architecture).toBe("advisory");
  });

  test("rejects tier values outside 0-3 range", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[tier_authority]
executor = [4]
`,
    );

    let threwConfigError = false;
    try {
      loadTrustConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) threwConfigError = true;
    }
    expect(threwConfigError).toBe(true);
  });

  test("defaults tier_authority and agent_overrides to empty objects when sections absent (backward-compatible)", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[approval]
decomposition = "strategic"
`,
    );

    const config = loadTrustConfig(configPath);
    expect(config.tier_authority).toEqual({});
    expect(config.agent_overrides).toEqual({});
  });
});

describe("PEV config schema", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("trust.toml with [pev] section parses correctly", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[approval]
decomposition = "strategic"

[pev]
approval_threshold = "feature"
max_parallel_executors = 4
max_retries_task = 2
max_retries_feature = 1
max_retries_epic = 0
`,
    );

    const config = loadTrustConfig(configPath);
    expect(config.pev.approval_threshold).toBe("feature");
    expect(config.pev.max_parallel_executors).toBe(4);
    expect(config.pev.max_retries_task).toBe(2);
    expect(config.pev.max_retries_feature).toBe(1);
    expect(config.pev.max_retries_epic).toBe(0);
  });

  test("trust.toml without [pev] section applies defaults (backward compatible)", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[approval]
decomposition = "strategic"
`,
    );

    const config = loadTrustConfig(configPath);
    expect(config.pev.approval_threshold).toBe("epic");
    expect(config.pev.max_parallel_executors).toBe(3);
    expect(config.pev.max_retries_task).toBe(3);
    expect(config.pev.max_retries_feature).toBe(2);
    expect(config.pev.max_retries_epic).toBe(1);
  });

  test("invalid pev.approval_threshold rejected", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[domains]
architecture = "co-pilot"

[pev]
approval_threshold = "invalid"
`,
    );

    let threwConfigError = false;
    try {
      loadTrustConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) threwConfigError = true;
    }
    expect(threwConfigError).toBe(true);
  });

  test("pev.max_parallel_executors must be positive (min 1)", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "trust.toml");
    writeFileSync(
      configPath,
      `
[pev]
max_parallel_executors = 0
`,
    );

    let threwConfigError = false;
    try {
      loadTrustConfig(configPath);
    } catch (err) {
      if (err instanceof ConfigError) threwConfigError = true;
    }
    expect(threwConfigError).toBe(true);
  });

  test("pev.approval_threshold accepts all valid values", () => {
    const validValues = ["epic", "feature", "task", "none"] as const;
    for (const value of validValues) {
      tmpDir = makeTmpDir();
      const configPath = join(tmpDir, "trust.toml");
      writeFileSync(
        configPath,
        `
[pev]
approval_threshold = "${value}"
`,
      );
      const config = loadTrustConfig(configPath);
      expect(config.pev.approval_threshold).toBe(value);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("AgentsConfigSchema extensions", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("accepts agents.toml with allowed_tools string arrays per agent", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "agents.toml");
    writeFileSync(
      configPath,
      `
[agents.executor]
model = "sonnet"
tier = 3
skills = []
allowed_tools = ["Read", "Write", "Edit", "Bash", "mcp__synapse__update_task"]
`,
    );

    const config = loadAgentsConfig(configPath);
    expect(config.agents.executor?.allowed_tools).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "mcp__synapse__update_task",
    ]);
  });

  test("defaults allowed_tools to empty array when absent (backward-compatible)", () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "agents.toml");
    writeFileSync(
      configPath,
      `
[agents.researcher]
model = "sonnet"
skills = []
`,
    );

    const config = loadAgentsConfig(configPath);
    expect(config.agents.researcher?.allowed_tools).toEqual([]);
  });

  test("anti-drift: actual config/agents.toml passes validation with extended schema", () => {
    const repoRoot = new URL("../../", import.meta.url).pathname;
    const configPath = join(repoRoot, "config/agents.toml");
    const config = loadAgentsConfig(configPath);
    // All 10 agents should have allowed_tools arrays
    const agentNames = Object.keys(config.agents);
    expect(agentNames.length).toBeGreaterThanOrEqual(10);
    for (const name of agentNames) {
      expect(Array.isArray(config.agents[name]?.allowed_tools)).toBe(true);
    }
  });

  test("anti-drift: actual config/trust.toml passes validation with extended schema", () => {
    const repoRoot = new URL("../../", import.meta.url).pathname;
    const configPath = join(repoRoot, "config/trust.toml");
    const config = loadTrustConfig(configPath);
    // tier_authority should have all 10 agent names
    expect(Object.keys(config.tier_authority).length).toBeGreaterThanOrEqual(10);
  });
});
