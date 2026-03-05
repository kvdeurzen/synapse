import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadAgentsConfig, loadTrustConfig } from "../../src/config";

const ROOT = resolve(import.meta.dir, "../..");
const AGENTS_DIR = join(ROOT, "agents");
const SKILLS_DIR = join(ROOT, "skills");
const AGENTS_TOML = join(ROOT, "config/agents.toml");
const TRUST_TOML = join(ROOT, "config/trust.toml");

/** Parse YAML frontmatter from an agent markdown file. Returns key-value map. */
function parseFrontmatter(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

/** Parse a tools line (comma-separated) into sorted array. */
function parseToolsList(toolsStr: string): string[] {
  return toolsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .sort();
}

/** Parse a skills frontmatter value like "[typescript, bun]" into sorted array. */
function parseSkillsList(skillsStr: string): string[] {
  const inner = skillsStr.replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

// Load configs once for all tests
const agentsConfig = loadAgentsConfig(AGENTS_TOML);
const trustConfig = loadTrustConfig(TRUST_TOML);

// List agent markdown files (excluding synapse-orchestrator)
const agentMdFiles = readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith(".md") && f !== "synapse-orchestrator.md")
  .map((f) => f.replace(".md", ""));

// Agent names from agents.toml
const agentNames = Object.keys(agentsConfig.agents);

describe("agents-integration anti-drift", () => {
  test("1. every agent in agents.toml has a markdown file", () => {
    for (const name of agentNames) {
      const mdPath = join(AGENTS_DIR, `${name}.md`);
      expect(existsSync(mdPath)).toBe(true);
    }
  });

  test("2. every agent markdown (except orchestrator) has an agents.toml entry", () => {
    for (const name of agentMdFiles) {
      expect(agentsConfig.agents[name]).toBeDefined();
    }
  });

  test("3. tools frontmatter matches allowed_tools in agents.toml", () => {
    for (const name of agentNames) {
      const fm = parseFrontmatter(join(AGENTS_DIR, `${name}.md`));
      expect(fm.tools).toBeDefined();

      const mdTools = parseToolsList(fm.tools);
      const tomlTools = [...agentsConfig.agents[name].allowed_tools].sort();

      expect(mdTools).toEqual(tomlTools);
    }
  });

  test("4. every skill referenced in agents.toml exists on disk", () => {
    for (const name of agentNames) {
      const skills = agentsConfig.agents[name].skills ?? [];
      for (const skill of skills) {
        const skillPath = join(SKILLS_DIR, skill, "SKILL.md");
        expect(existsSync(skillPath)).toBe(true);
      }
    }
  });

  test("5. every agent in trust.toml tier_authority exists in agents.toml", () => {
    const tierAgents = Object.keys(trustConfig.tier_authority ?? {});
    for (const name of tierAgents) {
      expect(agentsConfig.agents[name]).toBeDefined();
    }
  });

  test("6. tier authority is consistent with store_decision access", () => {
    const tierAuthority = trustConfig.tier_authority ?? {};
    for (const name of agentNames) {
      const tiers = tierAuthority[name] ?? [];
      const hasStoreDecision = agentsConfig.agents[name].allowed_tools.includes(
        "mcp__synapse__store_decision",
      );

      if (tiers.length === 0) {
        // Read-only agents should NOT have store_decision
        expect(hasStoreDecision).toBe(false);
      } else {
        // Agents with tier authority SHOULD have store_decision
        expect(hasStoreDecision).toBe(true);
      }
    }
  });

  test("7. researcher has no state-modifying Synapse tools", () => {
    const researcherTools = agentsConfig.agents.researcher.allowed_tools;
    expect(researcherTools).not.toContain("mcp__synapse__store_decision");
    expect(researcherTools).not.toContain("mcp__synapse__create_task");
    expect(researcherTools).not.toContain("mcp__synapse__update_task");
  });

  test("8. debugger and codebase-analyst have no Write/Edit tools", () => {
    for (const name of ["debugger", "codebase-analyst"]) {
      const tools = agentsConfig.agents[name].allowed_tools;
      expect(tools).not.toContain("Write");
      expect(tools).not.toContain("Edit");
    }
  });

  test("9. executor skill count does not exceed budget limit (SKILL-05: max 3)", () => {
    const executorSkills = agentsConfig.agents.executor.skills ?? [];
    expect(executorSkills.length).toBeLessThanOrEqual(3);
  });

  test("10. agent markdown skills: frontmatter matches agents.toml skills array", () => {
    for (const name of agentNames) {
      const tomlSkills = [...(agentsConfig.agents[name].skills ?? [])].sort();
      const fm = parseFrontmatter(join(AGENTS_DIR, `${name}.md`));

      if (tomlSkills.length === 0) {
        // Agents with no skills must NOT have a skills: field in frontmatter
        expect(fm.skills).toBeUndefined();
      } else {
        // Agents with skills must have matching skills: field
        expect(fm.skills).toBeDefined();
        const mdSkills = parseSkillsList(fm.skills);
        expect(mdSkills).toEqual(tomlSkills);
      }
    }
  });
});
