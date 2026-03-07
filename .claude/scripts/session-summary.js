#!/usr/bin/env node
// Session summary: aggregate .synapse-audit.log into per-agent token counts and cost estimates.
// Called by orchestrator via Bash at RPEV cycle completion.
// Usage: bun packages/framework/scripts/session-summary.js [path-to-audit-log]
// Output: JSON to stdout (orchestrator then calls store_document with the result)

import fs from "node:fs";

const logPath = process.argv[2] || ".synapse-audit.log";

if (!fs.existsSync(logPath)) {
  console.error(`Audit log not found: ${logPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
const entries = [];

for (const line of lines) {
  try {
    entries.push(JSON.parse(line));
  } catch {
    // Skip malformed lines
  }
}

// Filter to Synapse MCP calls only
const synapseEntries = entries.filter(e => e.tool?.startsWith("mcp__synapse__"));

const byAgent = {};
for (const e of synapseEntries) {
  const agent = e.agent || "unknown";
  if (!byAgent[agent]) byAgent[agent] = { calls: 0, input_tokens: 0, output_tokens: 0 };
  byAgent[agent].calls++;
  byAgent[agent].input_tokens += e.input_tokens || 0;
  byAgent[agent].output_tokens += e.output_tokens || 0;
}

const totalCalls = synapseEntries.length;
const allToolCalls = entries.length;
const totalInputTokens = Object.values(byAgent).reduce((s, a) => s + a.input_tokens, 0);
const totalOutputTokens = Object.values(byAgent).reduce((s, a) => s + a.output_tokens, 0);
const totalTokens = totalInputTokens + totalOutputTokens;

// Cost estimate: $3/1M input + $15/1M output (Claude Sonnet approximate)
const costEstimate = (totalInputTokens * 3 / 1_000_000) + (totalOutputTokens * 15 / 1_000_000);

// Attribution quality
const unknownCount = byAgent["unknown"]?.calls || 0;
const knownCount = totalCalls - unknownCount;
const attributionPct = totalCalls > 0 ? Math.round((knownCount / totalCalls) * 100) : 100;

const summary = {
  by_agent: byAgent,
  synapse_tool_calls: totalCalls,
  all_tool_calls: allToolCalls,
  total_tokens: totalTokens,
  input_tokens: totalInputTokens,
  output_tokens: totalOutputTokens,
  cost_estimate_usd: costEstimate.toFixed(4),
  attribution_pct: attributionPct,
  generated_at: new Date().toISOString(),
};

process.stdout.write(JSON.stringify(summary, null, 2));
