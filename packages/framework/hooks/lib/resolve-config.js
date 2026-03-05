/**
 * resolveConfig(filename) — shared walk-up config resolution utility
 *
 * Search order:
 * 1. Walk up from CLAUDE_PROJECT_DIR (or cwd) checking .synapse/config/{filename} at each level
 * 2. If walk-up fails, try monorepo dev fallback: packages/framework/config/{filename}
 * 3. Return null if not found anywhere
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a config filename by walking up from CLAUDE_PROJECT_DIR (or cwd),
 * checking .synapse/config/{filename} at each directory level.
 * Falls back to the monorepo packages/framework/config/ directory.
 *
 * @param {string} filename - Config filename to resolve (e.g. 'project.toml')
 * @returns {string|null} Absolute path to the config file, or null if not found
 */
export function resolveConfig(filename) {
  const startDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Walk up directories checking for .synapse/config/{filename}
  let current = startDir;
  while (true) {
    const candidate = path.join(current, ".synapse", "config", filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    // Stop at filesystem root (path.dirname('/') === '/')
    if (parent === current) {
      break;
    }
    current = parent;
  }

  // Monorepo dev fallback: packages/framework/config/{filename}
  // __dirname is packages/framework/hooks/lib/, so go up two levels to packages/framework/
  const fallback = path.join(__dirname, "..", "..", "config", filename);
  if (fs.existsSync(fallback)) {
    return fallback;
  }

  return null;
}
