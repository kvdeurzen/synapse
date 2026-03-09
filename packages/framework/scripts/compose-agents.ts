#!/usr/bin/env bun
/**
 * compose-agents.ts — Resolve {{include: ...}} markers in agent .md files.
 *
 * Usage: bun packages/framework/scripts/compose-agents.ts [output-dir]
 *
 * Reads all .md files from packages/framework/agents/ (skips _-prefixed partials),
 * inlines any {{include: filename}} markers from the same directory, and writes
 * composed files to the output directory.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const AGENTS_DIR = resolve(dirname(import.meta.dir), "agents");
const outputDir = process.argv[2] || join(AGENTS_DIR, ".build");

// Ensure output directory exists
mkdirSync(outputDir, { recursive: true });

const includePattern = /\{\{include:\s*(.+?)\s*\}\}/g;

function resolveIncludes(content: string, dir: string): string {
  return content.replace(includePattern, (_match, filename) => {
    const includePath = join(dir, filename.trim());
    if (!existsSync(includePath)) {
      console.error(`  ERROR: include not found: ${includePath}`);
      process.exit(1);
    }
    return readFileSync(includePath, "utf-8").trimEnd();
  });
}

const files = readdirSync(AGENTS_DIR).filter(
  (f) => f.endsWith(".md") && !f.startsWith("_")
);

let composed = 0;
for (const file of files) {
  const raw = readFileSync(join(AGENTS_DIR, file), "utf-8");
  const result = resolveIncludes(raw, AGENTS_DIR);

  // Verify no unresolved markers remain
  if (includePattern.test(result)) {
    // Reset lastIndex since regex is global
    includePattern.lastIndex = 0;
    console.error(`  ERROR: unresolved include markers remain in ${file}`);
    process.exit(1);
  }
  includePattern.lastIndex = 0;

  writeFileSync(join(outputDir, file), result);
  composed++;
}

console.log(`Composed ${composed} agent files → ${outputDir}`);
