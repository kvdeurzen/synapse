import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { logger } from "../logger.js";

export async function connectDb(dbPath: string): Promise<lancedb.Connection> {
  const absPath = resolve(dbPath);
  mkdirSync(absPath, { recursive: true });
  const db = await lancedb.connect(absPath);
  logger.debug({ dbPath: absPath }, "Connected to LanceDB");
  return db;
}
