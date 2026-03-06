#!/usr/bin/env bun
/**
 * Synapse MCP Smoke Test
 *
 * Standalone Bun script that validates the installed Synapse MCP server works
 * end-to-end. Called by install.sh and also by `install.sh --smoke-test`.
 *
 * Usage:
 *   bun run scripts/smoke-test.mjs [--server-path PATH] [--db PATH] [--help]
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

// ============================================================
// Argument parsing
// ============================================================

const { values: args } = parseArgs({
  options: {
    "server-path": { type: "string", default: ".claude/server/src/index.ts" },
    "db": { type: "string", default: "" },
    "help": { type: "boolean", default: false, short: "h" },
  },
  strict: false,
  allowPositionals: false,
});

if (args.help) {
  console.log(`Synapse MCP Smoke Test

Usage: bun run scripts/smoke-test.mjs [options]

Options:
  --server-path PATH   Path to server entry point (default: .claude/server/src/index.ts)
  --db PATH            Path to LanceDB directory (default: creates temp dir)
  --help, -h           Print this usage message

Exit codes:
  0  All checks passed
  1  One or more checks failed
`);
  process.exit(0);
}

const serverPath = args["server-path"];
const userDbPath = args["db"];

// ============================================================
// Cleanup setup
// ============================================================

let tmpDbDir = "";
let ownsTmpDir = false;
let serverProc = null;

function cleanup() {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {
      // Process may already be dead
    }
    serverProc = null;
  }
  if (ownsTmpDir && tmpDbDir) {
    try {
      rmSync(tmpDbDir, { recursive: true, force: true });
    } catch {
      // Directory may already be removed
    }
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });
process.on("SIGTERM", () => { cleanup(); process.exit(1); });

// ============================================================
// JSON-RPC communication helpers
// ============================================================

/** @typedef {{ jsonrpc: string; id?: number | string; result?: unknown; error?: { code: number; message: string } }} JsonRpcResponse */

/**
 * Create a JSON-RPC client over stdio transport.
 * Returns sendRequest and sendNotification helpers.
 *
 * @param {import("bun").Subprocess} proc
 */
function createJsonRpcClient(proc) {
  const decoder = new TextDecoder();
  let stdoutBuffer = "";
  let requestId = 0;

  /** @type {Map<number | string, (response: JsonRpcResponse) => void>} */
  const pending = new Map();

  let readerActive = false;

  async function startReader() {
    if (readerActive) return;
    readerActive = true;

    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stdoutBuffer += decoder.decode(value);

        // Parse complete newline-delimited JSON-RPC lines
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines[lines.length - 1] ?? "";

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]?.trim();
          if (!line) continue;
          try {
            const response = /** @type {JsonRpcResponse} */ (JSON.parse(line));
            if (response.id !== undefined) {
              const resolve = pending.get(response.id);
              if (resolve) {
                pending.delete(response.id);
                resolve(response);
              }
            }
            // Ignore notifications (no id field)
          } catch {
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Start background reader
  startReader().catch(() => {
    // Reader failure expected when server closes
  });

  /**
   * Send a JSON-RPC request and wait for the response.
   * @param {string} method
   * @param {Record<string, unknown>} params
   * @returns {Promise<JsonRpcResponse>}
   */
  async function sendRequest(method, params = {}) {
    const id = ++requestId;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

    const responsePromise = new Promise((resolve) => {
      pending.set(id, resolve);
    });

    proc.stdin.write(msg);
    await proc.stdin.flush();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout waiting for response to ${method} (id=${id})`)),
        30_000,
      ),
    );

    return Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   * @param {string} method
   * @param {Record<string, unknown>} params
   */
  function sendNotification(method, params = {}) {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    proc.stdin.write(msg);
    proc.stdin.flush();
  }

  return { sendRequest, sendNotification };
}

// ============================================================
// Smoke test runner
// ============================================================

/**
 * Parse a tool call response and extract the inner JSON result.
 * @param {JsonRpcResponse} response
 * @returns {{ success: boolean; error?: string; results?: unknown[] }}
 */
function parseToolResult(response) {
  if (response.error) {
    return { success: false, error: `JSON-RPC error: ${response.error.message}` };
  }

  let content;
  try {
    const result = /** @type {any} */ (response.result);
    const text = result?.content?.[0]?.text;
    if (!text) {
      return { success: false, error: "Empty content in response" };
    }
    content = JSON.parse(text);
  } catch (err) {
    return { success: false, error: `Failed to parse response JSON: ${err}` };
  }

  return content;
}

async function runSmokeTest() {
  // Set up DB path
  if (userDbPath) {
    tmpDbDir = userDbPath;
    ownsTmpDir = false;
  } else {
    tmpDbDir = mkdtempSync(join(tmpdir(), "synapse-smoke-"));
    ownsTmpDir = true;
  }

  // Generate a unique project ID for this smoke test run
  const projectId = `smoke-test-${Date.now()}`;

  // ──────────────────────────────────────────
  // Step 1: Spawn server
  // ──────────────────────────────────────────
  serverProc = Bun.spawn(["bun", "run", serverPath, "--db", tmpDbDir], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      OLLAMA_URL: "http://localhost:11434",
      EMBED_MODEL: "nomic-embed-text",
    },
  });

  const client = createJsonRpcClient(serverProc);

  // ──────────────────────────────────────────
  // Step 2: MCP handshake
  // ──────────────────────────────────────────
  let initResponse;
  try {
    initResponse = await client.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "synapse-install-smoke", version: "1.0" },
    });
  } catch (err) {
    console.error(`  Smoke: MCP handshake... FAILED`);
    console.error(`  Error: ${err}`);
    return false;
  }

  if (initResponse.error) {
    console.error(`  Smoke: MCP handshake... FAILED`);
    console.error(`  Error: ${initResponse.error.message}`);
    return false;
  }

  // Send initialized notification (required before tool calls)
  client.sendNotification("notifications/initialized");
  console.log(`  Smoke: MCP handshake... OK`);

  // ──────────────────────────────────────────
  // Step 3: init_project
  // ──────────────────────────────────────────
  let initProjectResponse;
  try {
    initProjectResponse = await client.sendRequest("tools/call", {
      name: "init_project",
      arguments: { project_id: projectId },
    });
  } catch (err) {
    console.error(`  Smoke: init_project... FAILED (timeout or error: ${err})`);
    return false;
  }

  const initProjectResult = parseToolResult(initProjectResponse);
  if (!initProjectResult.success) {
    console.error(`  Smoke: init_project... FAILED`);
    console.error(`  Error: ${initProjectResult.error || JSON.stringify(initProjectResult)}`);
    return false;
  }
  console.log(`  Smoke: init_project... OK`);

  // ──────────────────────────────────────────
  // Step 4: store_document
  // ──────────────────────────────────────────
  let storeDocResponse;
  try {
    storeDocResponse = await client.sendRequest("tools/call", {
      name: "store_document",
      arguments: {
        project_id: projectId,
        category: "technical_context",
        title: "Smoke Test",
        content: "This is a smoke test document for Synapse installation verification.",
      },
    });
  } catch (err) {
    console.error(`  Smoke: store_document... FAILED (timeout or error: ${err})`);
    return false;
  }

  const storeDocResult = parseToolResult(storeDocResponse);
  if (!storeDocResult.success) {
    console.error(`  Smoke: store_document... FAILED`);
    console.error(`  Error: ${storeDocResult.error || JSON.stringify(storeDocResult)}`);
    return false;
  }
  console.log(`  Smoke: store_document... OK`);

  // ──────────────────────────────────────────
  // Step 5: semantic_search
  // ──────────────────────────────────────────
  let searchResponse;
  try {
    searchResponse = await client.sendRequest("tools/call", {
      name: "semantic_search",
      arguments: {
        project_id: projectId,
        query: "smoke test",
        limit: 1,
      },
    });
  } catch (err) {
    console.error(`  Smoke: semantic_search... FAILED (timeout or error: ${err})`);
    return false;
  }

  const searchResult = parseToolResult(searchResponse);
  if (!searchResult.success) {
    console.error(`  Smoke: semantic_search... FAILED`);
    console.error(`  Error: ${searchResult.error || JSON.stringify(searchResult)}`);
    return false;
  }

  // Verify results array is non-empty (response shape: { success, data: { results, total, search_type } })
  const data = /** @type {any} */ (searchResult).data;
  const results = data?.results ?? /** @type {any} */ (searchResult).results;
  if (!Array.isArray(results) || results.length === 0) {
    console.error(`  Smoke: semantic_search... FAILED`);
    console.error(`  Error: Expected non-empty results array, got: ${JSON.stringify(results)}`);
    return false;
  }
  console.log(`  Smoke: semantic_search... OK`);

  return true;
}

// ============================================================
// Main
// ============================================================

let success = false;
try {
  success = await runSmokeTest();
} catch (err) {
  console.error(`  Smoke: Unexpected error: ${err}`);
  success = false;
} finally {
  cleanup();
}

if (success) {
  console.log(`  Smoke: All checks passed`);
  process.exit(0);
} else {
  console.error(`  Smoke: FAILED — Synapse installation could not be verified`);
  process.exit(1);
}
