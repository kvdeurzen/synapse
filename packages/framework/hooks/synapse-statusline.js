#!/usr/bin/env node
// Claude Code Statusline — Synapse Edition
// Shows: Synapse project: {name} | RPEV progress | model | directory | context usage

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

    // RPEV progress section from statusline state file
    let rpevSection = "";
    if (projectTomlPath) {
      try {
        // Project root is two levels up from .synapse/config/project.toml
        const projectRoot = path.dirname(path.dirname(projectTomlPath));
        const statePath = path.join(projectRoot, ".synapse", "state", "statusline.json");
        const raw = fs.readFileSync(statePath, "utf8");
        const state = JSON.parse(raw);

        // Read proactive_notifications from trust.toml
        let proactiveNotifications = false;
        try {
          const trustTomlPath = resolveConfig("trust.toml");
          if (trustTomlPath) {
            const trust = parseToml(fs.readFileSync(trustTomlPath, "utf8"));
            proactiveNotifications = trust.rpev?.proactive_notifications === true;
          }
        } catch {}

        // Build blocked counter string
        const buildBlockedStr = (approval, failed) => {
          const parts = [];
          if (approval > 0) parts.push(`${approval}\x1b[33m\u26a0\x1b[0m`);
          if (failed > 0) parts.push(`${failed}\x1b[31m\u2718\x1b[0m`);
          if (parts.length === 0) return "";
          const inner = `(${parts.join(" ")})`;
          if (proactiveNotifications) {
            return `\x1b[5;31m${inner}\x1b[0m`;
          }
          return `\x1b[2m${inner}\x1b[0m`;
        };

        const approval = state.blocked?.approval ?? 0;
        const failed = state.blocked?.failed ?? 0;
        const hasBlocked = approval > 0 || failed > 0;

        if (state.top_epic) {
          // Active RPEV state — show epic progress
          const { title, done_count, total_count } = state.top_epic;
          const parts = [`\x1b[36m${title}\x1b[0m ${done_count}/${total_count}`];

          // Pool status (if active)
          if (state.pool && state.pool.active > 0) {
            parts.push(`\x1b[2m│\x1b[0m \x1b[32mPool ${state.pool.active}/${state.pool.total}\x1b[0m`);
          }

          // Blocked counter
          if (hasBlocked) {
            const blockedStr = buildBlockedStr(approval, failed);
            parts.push(blockedStr);
          }

          rpevSection = ` \x1b[2m│\x1b[0m ` + parts.join(" ");
        } else if (hasBlocked) {
          // Idle state with blocked items — show only blocked counter
          const blockedStr = buildBlockedStr(approval, failed);
          rpevSection = ` \x1b[2m│\x1b[0m ` + blockedStr;
        }
        // Idle state with no blocked items: rpevSection stays empty
      } catch {
        // Silent fail — missing or corrupt state file falls back to current behavior
      }
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
    process.stdout.write(`${synapse}${rpevSection ? rpevSection + " \x1b[2m│\x1b[0m " : ""}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${ctx}`);
  } catch {
    // Silent fail — don't break statusline
  }
});
