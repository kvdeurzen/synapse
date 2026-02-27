// Response envelope for all tools — per user decision
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Config shape — matches Zod schema in config.ts
export interface SynapseConfig {
  db: string;
  ollamaUrl: string;
  embedModel: string;
  logLevel: "error" | "warn" | "info" | "debug";
}
