import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { registerDeleteProjectTool } from "./tools/delete-project.js";
import { registerEchoTool } from "./tools/echo.js";
import { registerInitProjectTool } from "./tools/init-project.js";
import { registerPingTool } from "./tools/ping.js";
import type { SynapseConfig } from "./types.js";

// Track registered tool count manually (McpServer._registeredTools is private)
let toolCount = 0;

/**
 * Create and configure the MCP server with all tools registered.
 * CRITICAL: All tools must be registered BEFORE transport.connect() is called,
 * otherwise they may not appear in tools/list responses.
 */
export function createServer(config: SynapseConfig): McpServer {
  const server = new McpServer({
    name: "synapse",
    version: "0.1.0",
  });

  // Reset tool count for this server instance
  toolCount = 0;

  // Register all tools before connecting transport
  registerPingTool(server, config, () => toolCount);
  toolCount++;

  registerEchoTool(server);
  toolCount++;

  registerInitProjectTool(server, config);
  toolCount++;

  registerDeleteProjectTool(server, config);
  toolCount++;

  return server;
}

/**
 * Start the MCP server by connecting to the stdio transport.
 * Only call after createServer() — all tools must already be registered.
 */
export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Synapse MCP server running on stdio");
}
