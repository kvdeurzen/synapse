import { randomUUID } from "node:crypto";
import pino from "pino";

// Create the logger with pino.destination(2) to ensure ALL output goes to stderr (fd 2).
// This is critical for MCP stdio transport — stdout must only carry JSON-RPC messages.
const _logger = pino(
  {
    level: "info",
  },
  pino.destination(2),
);

export const logger = _logger;

/**
 * Update the root logger's log level. Call this after config loads with the resolved level.
 */
export function setLogLevel(level: string): void {
  _logger.level = level;
}

/**
 * Create a child logger for a specific tool invocation.
 * Binds correlationId (random UUID) and tool name to every log line for tracing.
 */
export function createToolLogger(toolName: string): pino.Logger {
  return _logger.child({
    correlationId: randomUUID(),
    tool: toolName,
  });
}
