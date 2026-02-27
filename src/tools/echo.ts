import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createToolLogger } from "../logger.js";
import type { ToolResult } from "../types.js";

interface EchoData {
  message: string;
}

/**
 * Register the echo tool on the given MCP server.
 * Validates Zod input and returns the message back as a round-trip test.
 */
export function registerEchoTool(server: McpServer): void {
  server.registerTool(
    "echo",
    {
      description: "Returns the input message back — useful for testing the MCP connection",
      inputSchema: z.object({
        message: z.string().describe("Message to echo back"),
      }),
    },
    async (args) => {
      const log = createToolLogger("echo");
      const start = Date.now();
      log.info({ message: args.message }, "echo tool invoked");

      const result: ToolResult<EchoData> = {
        success: true,
        data: { message: args.message },
      };

      log.info({ durationMs: Date.now() - start }, "echo tool complete");

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );
}
