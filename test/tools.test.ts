import { describe, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEchoTool } from "../src/tools/echo.js";
import { registerPingTool } from "../src/tools/ping.js";
import type { SynapseConfig, ToolResult } from "../src/types.js";

const TEST_CONFIG: SynapseConfig = {
  db: "/tmp/test-tools.db",
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error", // suppress logs during unit tests
};

// Internal structure: _registeredTools is a plain object keyed by tool name
type InternalTool = { handler: (args: unknown, extra: unknown) => Promise<unknown> };
type InternalServer = { _registeredTools: Record<string, InternalTool> };

/**
 * Helper: invoke a registered tool by name on an McpServer instance.
 * Uses the internal _registeredTools plain object via type assertion.
 */
async function invokeTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as InternalServer)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool '${toolName}' not registered`);

  const result = await tool.handler(args, {});
  return result as { content: Array<{ type: string; text: string }> };
}

describe("ping tool", () => {
  test("returns ToolResult envelope with success:true", async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerPingTool(server, TEST_CONFIG, () => 2);

    const response = await invokeTool(server, "ping");

    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);

    const parsed = JSON.parse(response.content[0]?.text ?? "{}") as ToolResult<
      Record<string, unknown>
    >;
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
  });

  test("returns version, uptime, dbPath, ollamaUrl, embedModel", async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerPingTool(server, TEST_CONFIG, () => 2);

    const response = await invokeTool(server, "ping");
    const parsed = JSON.parse(response.content[0]?.text ?? "{}") as ToolResult<{
      version: string;
      uptime: number;
      dbPath: string;
      ollamaUrl: string;
      embedModel: string;
      ollamaStatus: string;
      toolCount: number;
    }>;

    expect(parsed.data?.version).toBe("0.1.0");
    expect(typeof parsed.data?.uptime).toBe("number");
    expect(parsed.data?.uptime).toBeGreaterThanOrEqual(0);
    expect(parsed.data?.dbPath).toBe("/tmp/test-tools.db");
    expect(parsed.data?.ollamaUrl).toBe("http://localhost:11434");
    expect(parsed.data?.embedModel).toBe("nomic-embed-text");
    expect(parsed.data?.ollamaStatus).toBe("unknown");
    expect(parsed.data?.toolCount).toBe(2);
  });

  test("result wraps data in ToolResult { success, data } shape", async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerPingTool(server, TEST_CONFIG, () => 1);

    const response = await invokeTool(server, "ping");
    const parsed = JSON.parse(response.content[0]?.text ?? "{}") as ToolResult<unknown>;

    // Must have success field
    expect("success" in parsed).toBe(true);
    // Must have data field (no error for successful ping)
    expect("data" in parsed).toBe(true);
    expect("error" in parsed).toBe(false);
  });
});

describe("echo tool", () => {
  test("returns ToolResult envelope with success:true and echoed message", async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerEchoTool(server);

    const response = await invokeTool(server, "echo", { message: "hello" });

    const parsed = JSON.parse(response.content[0]?.text ?? "{}") as ToolResult<{ message: string }>;
    expect(parsed.success).toBe(true);
    expect(parsed.data?.message).toBe("hello");
  });

  test("round-trips any string input unchanged", async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerEchoTool(server);

    const inputs = ["", "hello world", "unicode: 你好", "special: !@#$%^&*()"];
    for (const input of inputs) {
      const response = await invokeTool(server, "echo", { message: input });
      const parsed = JSON.parse(response.content[0]?.text ?? "{}") as ToolResult<{
        message: string;
      }>;
      expect(parsed.data?.message).toBe(input);
    }
  });

  test("content is a text content item", async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerEchoTool(server);

    const response = await invokeTool(server, "echo", { message: "test" });

    expect(response.content[0]?.type).toBe("text");
    expect(typeof response.content[0]?.text).toBe("string");
  });
});
