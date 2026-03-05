#!/usr/bin/env node
// Claude Code Statusline — Synapse Edition
// Shows: Synapse project: {name} | model | directory | context usage

import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { resolveConfig } from "./lib/resolve-config.js";

const stdinTimeout = setTimeout(() => process.exit(0), 3000);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || "Claude";
    const dir = data.workspace?.current_dir || process.cwd();
    const remaining = data.context_window?.remaining_percentage;

    // Synapse project name from project.toml
    let synapse = "";
    const projectTomlPath = resolveConfig("project.toml");
    if (projectTomlPath) {
      try {
        const toml = parseToml(fs.readFileSync(projectTomlPath, "utf8"));
        const name = toml.project?.name;
        if (name) {
          synapse = `\x1b[36mSynapse: ${name}\x1b[0m │ `;
        }
      } catch {}
    }

    // Context window usage
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctx = "";
    if (remaining != null) {
      const usableRemaining = Math.max(
        0,
        ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100,
      );
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
      const filled = Math.floor(used / 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);

      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m${bar} ${used}%\x1b[0m`;
      }
    }

    const dirname = path.basename(dir);
    process.stdout.write(`${synapse}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}`);
  } catch {
    // Silent fail — don't break statusline
  }
});
