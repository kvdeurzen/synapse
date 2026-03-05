/**
 * get_index_status MCP tool — reports indexing status for a project.
 *
 * Returns facts-only status: total files indexed, total chunks, last index time,
 * per-language breakdown, and stale file count (when project_root provided).
 *
 * Exports:
 * - getIndexStatus: core function (testable without MCP server)
 * - registerGetIndexStatusTool: MCP tool registration wrapper
 * - IndexStatusResult: result type
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { connectDb } from "../db/connection.js";
import { createToolLogger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const GetIndexStatusInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  project_root: z
    .string()
    .optional()
    .describe(
      "Absolute path to the project root directory. When provided, stale files are detected by comparing stored file hashes to current disk content.",
    ),
});

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface IndexStatusResult {
  project_id: string;
  total_files: number;
  total_chunks: number;
  last_index_at: string | null;
  languages: Array<{ language: string; file_count: number; chunk_count: number }>;
  stale_files: number | null; // null when project_root not provided
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function getIndexStatus(
  dbPath: string,
  projectId: string,
  projectRoot?: string,
): Promise<IndexStatusResult> {
  const db = await connectDb(dbPath);

  // ── 1. Query project_meta for last_index_at ───────────────────────────────
  const metaTable = await db.openTable("project_meta");
  const metaRows = await metaTable.query().where(`project_id = '${projectId}'`).limit(1).toArray();
  const lastIndexAt: string | null =
    metaRows.length > 0 ? ((metaRows[0].last_index_at as string | null) ?? null) : null;

  // ── 2. Query all code_chunks for this project ─────────────────────────────
  const codeChunksTable = await db.openTable("code_chunks");
  const allRows = await codeChunksTable
    .query()
    .where(`project_id = '${projectId}'`)
    .select(["file_path", "language", "file_hash", "chunk_id"])
    .toArray();

  // ── 3. Build per-language breakdown ───────────────────────────────────────
  const langMap = new Map<string, { files: Set<string>; chunks: number }>();
  for (const row of allRows) {
    const lang = (row.language as string | null) ?? "unknown";
    if (!langMap.has(lang)) {
      langMap.set(lang, { files: new Set(), chunks: 0 });
    }
    const entry = langMap.get(lang);
    if (!entry) throw new Error(`Expected lang entry for: ${lang}`);
    entry.files.add(row.file_path as string);
    entry.chunks++;
  }

  // ── 4. Calculate total_files (distinct) and total_chunks ─────────────────
  const allFiles = new Set(allRows.map((r) => r.file_path as string));
  const totalFiles = allFiles.size;
  const totalChunks = allRows.length;

  // ── 5. Build languages array ───────────────────────────────────────────────
  const languages: Array<{ language: string; file_count: number; chunk_count: number }> =
    Array.from(langMap.entries()).map(([language, entry]) => ({
      language,
      file_count: entry.files.size,
      chunk_count: entry.chunks,
    }));

  // ── 6. Staleness check (only if projectRoot provided) ────────────────────
  // CRITICAL: When project_root is NOT provided, stale_files must be null (not 0).
  // Returning 0 would be misleading — it implies no files are stale, but we
  // simply haven't checked.
  let staleFiles: number | null = null;

  if (projectRoot) {
    staleFiles = 0;

    // Build map of file_path -> stored file_hash (use first hash per file_path)
    const fileHashMap = new Map<string, string>();
    for (const row of allRows) {
      const filePath = row.file_path as string;
      const fileHash = row.file_hash as string | null;
      if (!fileHashMap.has(filePath) && fileHash != null) {
        fileHashMap.set(filePath, fileHash);
      } else if (!fileHashMap.has(filePath)) {
        // No hash stored — treat as stale (file cannot be verified)
        fileHashMap.set(filePath, "");
      }
    }

    for (const [filePath, storedHash] of fileHashMap) {
      try {
        const absPath = join(projectRoot, filePath);
        const content = await Bun.file(absPath).text();
        const currentHash = createHash("sha256").update(content).digest("hex");
        if (currentHash !== storedHash) {
          staleFiles++;
        }
      } catch {
        // File deleted or unreadable = stale
        staleFiles++;
      }
    }
  }

  return {
    project_id: projectId,
    total_files: totalFiles,
    total_chunks: totalChunks,
    last_index_at: lastIndexAt,
    languages,
    stale_files: staleFiles,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerGetIndexStatusTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "get_index_status",
    {
      description:
        "Returns facts-only status of the code indexing for a project: " +
        "total files indexed, total chunks, last index time, per-language breakdown " +
        "(file count and chunk count per language), and stale file count. " +
        "stale_files is null when project_root is not provided (checking requires reading disk). " +
        "When project_root is provided, stale_files counts files whose current content hash " +
        "differs from the stored hash (including deleted files). " +
        "Returns no recommendations — facts only.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        project_root: z
          .string()
          .optional()
          .describe(
            "Absolute path to the project root. Required to detect stale files via hash comparison. " +
              "When omitted, stale_files is null.",
          ),
      }),
    },
    async (args) => {
      const log = createToolLogger("get_index_status");
      const start = Date.now();
      const dbPath = config.db;

      const parsed = GetIndexStatusInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          projectRoot: parsed.project_root,
        },
        "get_index_status invoked",
      );

      try {
        const data = await getIndexStatus(dbPath, parsed.project_id, parsed.project_root);
        const result: ToolResult<IndexStatusResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            totalFiles: data.total_files,
            totalChunks: data.total_chunks,
            staleFiles: data.stale_files,
          },
          "get_index_status complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error(
          { error: String(err), durationMs: Date.now() - start },
          "get_index_status failed",
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
