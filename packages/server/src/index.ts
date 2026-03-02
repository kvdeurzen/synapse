import { loadConfig } from "./config.js";
import { logger, setLogLevel } from "./logger.js";
import { createServer, startServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig(); // may call process.exit(1) on failure

  setLogLevel(config.logLevel);

  logger.info(
    { db: config.db, ollamaUrl: config.ollamaUrl, embedModel: config.embedModel },
    "Synapse starting",
  );

  const server = createServer(config);
  await startServer(server, config);

  logger.info("Synapse MCP server ready");
}

main().catch((err: unknown) => {
  console.error("[synapse] Fatal error:", err);
  process.exit(1);
});
