import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TOKEN_WARN_THRESHOLD = 2000;

export interface SkillContent {
  name: string;
  content: string;
  tokenEstimate: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function loadSkill(skillName: string, skillsDir = "skills"): SkillContent {
  const skillPath = join(skillsDir, skillName, "SKILL.md");
  let raw: string;
  try {
    raw = readFileSync(skillPath, "utf-8");
  } catch {
    throw new Error(`Skill "${skillName}" not found at ${skillPath}`);
  }
  const tokens = estimateTokens(raw);
  if (tokens > TOKEN_WARN_THRESHOLD) {
    process.stderr.write(
      `[synapse-framework] Warning: skill "${skillName}" is ~${tokens} tokens (threshold: ${TOKEN_WARN_THRESHOLD}). Loading full content.\n`,
    );
  }
  return { name: skillName, content: raw, tokenEstimate: tokens };
}

export function loadAgentSkills(skillNames: string[], skillsDir = "skills"): SkillContent[] {
  return skillNames.map((name) => loadSkill(name, skillsDir));
}

export function warnUnreferencedSkills(allAgentSkills: string[][], skillsDir = "skills"): string[] {
  // Flatten all referenced skills into a Set
  const referenced = new Set(allAgentSkills.flat());
  // List skill directories on disk
  const unreferenced: string[] = [];
  try {
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      if (entry === "project" || entry === ".gitkeep") continue;
      const fullPath = join(skillsDir, entry);
      try {
        if (statSync(fullPath).isDirectory() && !referenced.has(entry)) {
          unreferenced.push(entry);
          process.stderr.write(
            `[synapse-framework] Warning: skill directory "${entry}" is not referenced in any agent's skills list\n`,
          );
        }
      } catch {
        /* stat failure — skip */
      }
    }
  } catch {
    /* skills dir missing — no unreferenced skills */
  }
  return unreferenced;
}
