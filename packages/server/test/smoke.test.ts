import { describe, expect, test } from "bun:test";

// Timeout for each server interaction (ms)
const TIMEOUT_MS = 8000;
const SERVER_PATH = "src/index.ts";

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Spawn the MCP server and exchange JSON-RPC messages.
 * Returns stdout lines as parsed JSON and the raw stderr string.
 */
async function runServerExchange(
  messages: string[],
  timeoutMs = TIMEOUT_MS,
): Promise<{ responses: JsonRpcResponse[]; stderr: string; proc: ReturnType<typeof Bun.spawn> }> {
  const dbPath = `/tmp/smoke-test-${Date.now()}`;

  const proc = Bun.spawn(["bun", SERVER_PATH, "--db", dbPath], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
  });

  // Write all messages to stdin
  const encoder = new TextEncoder();
  for (const msg of messages) {
    proc.stdin.write(encoder.encode(`${msg}\n`));
  }
  await proc.stdin.flush();

  // Collect stdout responses with timeout
  const responses: JsonRpcResponse[] = [];
  const reader = proc.stdout.getReader();
  let buffer = "";

  const deadline = Date.now() + timeoutMs;

  while (responses.length < messages.length && Date.now() < deadline) {
    const timeLeft = deadline - Date.now();
    if (timeLeft <= 0) break;

    const readPromise = reader.read();
    const timeoutPromise = new Promise<{ done: boolean; value: undefined }>((resolve) =>
      setTimeout(() => resolve({ done: true, value: undefined }), timeLeft),
    );

    const { done, value } = await Promise.race([readPromise, timeoutPromise]);
    if (done || value === undefined) break;

    buffer += new TextDecoder().decode(value);

    // Parse complete lines as JSON-RPC responses
    const lines = buffer.split("\n");
    buffer = lines[lines.length - 1] ?? "";

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]?.trim();
      if (line && line.length > 0) {
        responses.push(JSON.parse(line) as JsonRpcResponse);
      }
    }
  }

  reader.releaseLock();

  // Collect stderr (non-blocking — grab what's available)
  let stderr = "";
  try {
    const stderrReader = proc.stderr.getReader();
    // Read available stderr data with a short timeout
    const stderrPromise = (async () => {
      let stderrBuf = "";
      const stderrDeadline = Date.now() + 1000;
      while (Date.now() < stderrDeadline) {
        const timeLeft = stderrDeadline - Date.now();
        if (timeLeft <= 0) break;
        const rp = stderrReader.read();
        const tp = new Promise<{ done: boolean; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), timeLeft),
        );
        const { done, value } = await Promise.race([rp, tp]);
        if (done || value === undefined) break;
        stderrBuf += new TextDecoder().decode(value);
      }
      return stderrBuf;
    })();
    stderr = await stderrPromise;
    stderrReader.releaseLock();
  } catch {
    // ignore
  }

  proc.kill();

  return { responses, stderr, proc };
}

const INITIALIZE_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "test", version: "1.0" },
    capabilities: {},
  },
});

const TOOLS_LIST_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
});

describe("smoke: stdout cleanliness", () => {
  test(
    "server stdout is clean JSON-RPC on initialize",
    async () => {
      const { responses } = await runServerExchange([INITIALIZE_REQUEST]);

      expect(responses.length).toBeGreaterThan(0);

      const response = responses[0];
      // If JSON.parse worked, stdout is clean (no contamination)
      expect(response).toBeDefined();
      expect(response?.jsonrpc).toBe("2.0");
      expect(response?.id).toBe(1);
      // Should have result (not error) for initialize
      expect(response?.result).toBeDefined();
    },
    TIMEOUT_MS + 2000,
  );

  test(
    "server stderr contains log output",
    async () => {
      const { stderr } = await runServerExchange([INITIALIZE_REQUEST]);

      // Stderr should have Pino log output — at minimum the "Synapse starting" message
      expect(stderr.length).toBeGreaterThan(0);
      // Pino JSON logs contain the msg field
      expect(stderr).toContain("Synapse");
    },
    TIMEOUT_MS + 2000,
  );

  test(
    "tools/list returns ping and echo",
    async () => {
      // Send initialize first, then tools/list
      // The initialized notification must come between them for the protocol to work
      const INITIALIZED_NOTIF = JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      const { responses } = await runServerExchange([
        INITIALIZE_REQUEST,
        INITIALIZED_NOTIF,
        TOOLS_LIST_REQUEST,
      ]);

      // We expect responses for request IDs 1 and 2 (notifications don't get responses)
      const initResponse = responses.find((r) => r.id === 1);
      expect(initResponse).toBeDefined();
      expect(initResponse?.jsonrpc).toBe("2.0");

      const toolsResponse = responses.find((r) => r.id === 2);
      expect(toolsResponse).toBeDefined();

      const result = toolsResponse?.result as { tools?: Array<{ name: string }> } | undefined;
      expect(result?.tools).toBeDefined();
      expect(Array.isArray(result?.tools)).toBe(true);

      const toolNames = (result?.tools ?? []).map((t) => t.name);
      expect(toolNames).toContain("ping");
      expect(toolNames).toContain("echo");
    },
    TIMEOUT_MS + 2000,
  );
});
