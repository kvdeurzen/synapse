import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateTokens,
  loadAgentSkills,
  loadSkill,
  warnUnreferencedSkills,
} from "../../src/skills";

// Helper to create a temp directory for isolated tests
function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "synapse-skills-test-"));
}

// Helper to create a skill directory with SKILL.md
function createSkill(skillsDir: string, skillName: string, content: string): void {
  const skillDir = join(skillsDir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content);
}

const SAMPLE_SKILL_CONTENT = `---
name: typescript
description: TypeScript conventions and patterns
disable-model-invocation: true
user-invocable: false
---

## Conventions
Use type for unions, interface for objects.

## Quality Criteria
No any types.

## Vocabulary
- discriminated union: a union type with a common literal field

## Anti-patterns
- Using as any
`;

describe("estimateTokens", () => {
  test("returns ~250 for 1000 chars of text (~4 chars per token)", () => {
    const text = "a".repeat(1000);
    const estimate = estimateTokens(text);
    expect(estimate).toBe(250);
  });

  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("rounds up for non-multiples of 4", () => {
    // 5 chars / 4 = 1.25 => ceil => 2
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("loadSkill", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns { name, content, tokenEstimate } when SKILL.md exists", () => {
    tmpDir = makeTmpDir();
    createSkill(tmpDir, "typescript", SAMPLE_SKILL_CONTENT);

    const skill = loadSkill("typescript", tmpDir);

    expect(skill.name).toBe("typescript");
    expect(skill.content).toBe(SAMPLE_SKILL_CONTENT);
    expect(typeof skill.tokenEstimate).toBe("number");
    expect(skill.tokenEstimate).toBeGreaterThan(0);
  });

  test("throws Error with 'not found' when skill directory is missing", () => {
    tmpDir = makeTmpDir();

    expect(() => loadSkill("nonexistent", tmpDir)).toThrow(/not found/);
  });

  test("throws Error with 'not found' when SKILL.md is missing (dir exists but no file)", () => {
    tmpDir = makeTmpDir();
    mkdirSync(join(tmpDir, "empty-skill"));

    expect(() => loadSkill("empty-skill", tmpDir)).toThrow(/not found/);
  });

  test("warns to stderr when skill exceeds 2K token estimate", () => {
    tmpDir = makeTmpDir();
    // 2000 tokens * 4 chars/token = 8000 chars — use 8001+ to exceed threshold
    const largeContent = "x".repeat(8100);
    createSkill(tmpDir, "large-skill", largeContent);

    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      loadSkill("large-skill", tmpDir);
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const written = stderrSpy.mock.calls[0]?.[0] as string;
      expect(written).toContain("large-skill");
      expect(written).toContain("2000");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("does NOT throw when skill exceeds 2K tokens — full content is returned", () => {
    tmpDir = makeTmpDir();
    const largeContent = "x".repeat(8100);
    createSkill(tmpDir, "large-skill", largeContent);

    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const skill = loadSkill("large-skill", tmpDir);
      expect(skill.content).toBe(largeContent);
      expect(skill.tokenEstimate).toBeGreaterThan(2000);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe("loadAgentSkills", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns array of SkillContent for each named skill", () => {
    tmpDir = makeTmpDir();
    createSkill(tmpDir, "typescript", SAMPLE_SKILL_CONTENT);
    createSkill(tmpDir, "react", "# React skill content");

    const skills = loadAgentSkills(["typescript", "react"], tmpDir);

    expect(skills).toHaveLength(2);
    expect(skills[0]?.name).toBe("typescript");
    expect(skills[1]?.name).toBe("react");
  });

  test("returns empty array for empty skills list", () => {
    tmpDir = makeTmpDir();
    const skills = loadAgentSkills([], tmpDir);
    expect(skills).toHaveLength(0);
  });

  test("throws when a referenced skill is missing (fail-fast)", () => {
    tmpDir = makeTmpDir();
    createSkill(tmpDir, "typescript", SAMPLE_SKILL_CONTENT);

    expect(() => loadAgentSkills(["typescript", "nonexistent"], tmpDir)).toThrow(/not found/);
  });
});

describe("warnUnreferencedSkills", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("detects skill directories not in any agent's skills list", () => {
    tmpDir = makeTmpDir();
    createSkill(tmpDir, "typescript", SAMPLE_SKILL_CONTENT);
    createSkill(tmpDir, "react", "# React");
    createSkill(tmpDir, "python", "# Python");

    // Only typescript is referenced by agents
    const unreferenced = warnUnreferencedSkills([["typescript"]], tmpDir);

    expect(unreferenced).toContain("react");
    expect(unreferenced).toContain("python");
    expect(unreferenced).not.toContain("typescript");
  });

  test("returns empty array when all skills are referenced", () => {
    tmpDir = makeTmpDir();
    createSkill(tmpDir, "typescript", SAMPLE_SKILL_CONTENT);
    createSkill(tmpDir, "react", "# React");

    const unreferenced = warnUnreferencedSkills([["typescript"], ["react"]], tmpDir);

    expect(unreferenced).toHaveLength(0);
  });

  test("ignores the 'project' directory (reserved for user skills)", () => {
    tmpDir = makeTmpDir();
    // Create project dir (reserved) and typescript (referenced)
    mkdirSync(join(tmpDir, "project"), { recursive: true });
    writeFileSync(join(tmpDir, "project", ".gitkeep"), "");
    createSkill(tmpDir, "typescript", SAMPLE_SKILL_CONTENT);

    const unreferenced = warnUnreferencedSkills([["typescript"]], tmpDir);

    expect(unreferenced).not.toContain("project");
  });

  test("returns empty array when skills directory does not exist", () => {
    const nonexistentDir = join(tmpdir(), `does-not-exist-${Date.now()}`);
    const unreferenced = warnUnreferencedSkills([[]], nonexistentDir);
    expect(unreferenced).toHaveLength(0);
  });

  test("warns to stderr for each unreferenced skill", () => {
    tmpDir = makeTmpDir();
    createSkill(tmpDir, "react", "# React");

    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      warnUnreferencedSkills([[]], tmpDir);
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const written = stderrSpy.mock.calls[0]?.[0] as string;
      expect(written).toContain("react");
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
