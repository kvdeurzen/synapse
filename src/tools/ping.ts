import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createToolLogger } from "../logger.js";
import { getOllamaStatus, type OllamaHealthStatus } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";

interface PingData {
  status: "ok";
  version: string;
  uptime: number;
  dbPath: string;
  ollamaUrl: string;
  ollamaStatus: OllamaHealthStatus; // Live from health check, not hardcoded
  toolCount: number;
  embedModel: string;
}

/**
 * Register the ping tool on the given MCP server.
 * Returns server health and configuration info.
 * toolCount is tracked externally since _registeredTools is private on McpServer.
 */
export function registerPingTool(
  server: McpServer,
  config: SynapseConfig,
  getToolCount: () => number,
): void {
  server.registerTool(
    "ping",
    {
      description: "Returns server health and configuration info",
      inputSchema: z.object({}),
    },
    async () => {
      const log = createToolLogger("ping");
      const start = Date.now();
      log.info("ping tool invoked");

      const result: ToolResult<PingData> = {
        success: true,
        data: {
          status: "ok",
          version: "0.1.0",
          uptime: process.uptime(),
          dbPath: config.db,
          ollamaUrl: config.ollamaUrl,
          ollamaStatus: getOllamaStatus(),
          toolCount: getToolCount(),
          embedModel: config.embedModel,
        },
      };

      log.info({ durationMs: Date.now() - start }, "ping tool complete");

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );
}
