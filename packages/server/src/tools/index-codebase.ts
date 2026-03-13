import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import {
  CodeChunkRowSchema,
  DocumentRowSchema,
  ProjectMetaRowSchema,
  RelationshipRowSchema,
} from "../db/schema.js";
import { escapeSQL } from "../db/sql-helpers.js";
import { OllamaUnreachableError, TreeSitterUnavailableError } from "../errors.js";
import { createToolLogger, logger } from "../logger.js";
import { logActivity } from "../services/activity-log.js";
import { extractSymbols } from "../services/code-indexer/extractor.js";
import type { ImportEdge } from "../services/code-indexer/import-resolver.js";
import { resolveImports } from "../services/code-indexer/import-resolver.js";
import { parseSource } from "../services/code-indexer/parser.js";
import { scanFiles } from "../services/code-indexer/scanner.js";
import { embed, getOllamaStatus } from "../services/embedder.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Input schema (Zod)
// ────────────────────────────────────────────────────────────────────────────

const IndexCodebaseInputSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  project_root: z.string().min(1).describe("Absolute path to the project directory to index"),
  exclude_patterns: z
    .array(z.string())
    .optional()
    .describe("Additional gitignore-style patterns to exclude"),
  include_patterns: z
    .array(z.string())
    .optional()
    .describe("If provided, only index files matching these patterns"),
});

type IndexCodebaseArgs = z.infer<typeof IndexCodebaseInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface IndexCodebaseResult {
  files_scanned: number;
  files_indexed: number;
  chunks_created: number;
  skipped_unchanged: number;
  files_deleted: number; // files in DB but not on disk anymore
  edges_created: number;
  errors: string[]; // per-file errors (syntax error warnings)
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a document row for a code file in the documents table.
 * Uses file path as doc_id for direct lookup compatibility with get_related_documents.
 * This makes relationships.from_id/to_id (file paths) resolvable via documents.doc_id (DEBT-03).
 */
async function upsertCodeFileDocument(
  db: import("@lancedb/lancedb").Connection,
  projectId: string,
  filePath: string,
  now: string,
): Promise<void> {
  const docsTable = await db.openTable("documents");

  // Check if a document already exists for this file path
  const existing = await docsTable
    .query()
    .where(`doc_id = '${escapeSQL(filePath)}' AND project_id = '${escapeSQL(projectId)}'`)
    .limit(1)
    .toArray();

  if (existing.length > 0) {
    // Document already exists — no update needed
    return;
  }

  // Insert a new document row for this code file
  await insertBatch(
    docsTable,
    [
      {
        doc_id: filePath, // Use file path as doc_id for direct lookup compatibility
        project_id: projectId,
        title: filePath,
        content: `Code file: ${filePath}`,
        category: "code_file",
        status: "active",
        version: 1,
        created_at: now,
        updated_at: now,
        tags: "",
        phase: null,
        priority: null,
        parent_id: null,
        depth: null,
        decision_type: null,
      },
    ],
    DocumentRowSchema,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function indexCodebase(
  dbPath: string,
  projectId: string,
  args: IndexCodebaseArgs,
  config: SynapseConfig,
): Promise<IndexCodebaseResult> {
  // ── 1. Fail-fast embed check ──────────────────────────────────────────────
  const status = getOllamaStatus();
  if (status !== "ok") {
    throw new OllamaUnreachableError(config.ollamaUrl);
  }

  // ── 2. Scan files ─────────────────────────────────────────────────────────
  const scanOpts: { exclude_patterns?: string[]; include_patterns?: string[] } = {};
  if (args.exclude_patterns !== undefined) {
    scanOpts.exclude_patterns = args.exclude_patterns;
  }
  if (args.include_patterns !== undefined) {
    scanOpts.include_patterns = args.include_patterns;
  }
  const scanResult = await scanFiles(args.project_root, scanOpts);

  // ── 3. Build file set (for import resolver) ───────────────────────────────
  const fileSet = new Set(scanResult.files.map((f) => f.relativePath));

  // ── 4. Get existing file hashes ───────────────────────────────────────────
  const db = await connectDb(dbPath);
  const codeChunksTable = await db.openTable("code_chunks");
  const existingRows = await codeChunksTable
    .query()
    .where(`project_id = '${escapeSQL(projectId)}'`)
    .select(["file_path", "file_hash"])
    .toArray();

  // Build map filePath → hash (deduplicate by taking first hash per file)
  const existingHashes = existingRows.reduce<Map<string, string>>((map, row) => {
    const fp = row.file_path as string;
    if (!map.has(fp)) {
      map.set(fp, row.file_hash as string);
    }
    return map;
  }, new Map());

  // ── 5. Detect deleted files ───────────────────────────────────────────────
  const existingFiles = new Set(existingRows.map((r) => r.file_path as string));
  const deletedFiles = [...existingFiles].filter((f) => !fileSet.has(f));

  const relTable = await db.openTable("relationships");

  let files_deleted = 0;
  for (const f of deletedFiles) {
    await codeChunksTable.delete(
      `file_path = '${escapeSQL(f)}' AND project_id = '${escapeSQL(projectId)}'`,
    );
    await relTable.delete(
      `from_id = '${escapeSQL(f)}' AND source = 'ast_import' AND project_id = '${escapeSQL(projectId)}'`,
    );
    files_deleted++;
  }

  // ── 6. Process each file ──────────────────────────────────────────────────
  let files_indexed = 0;
  let chunks_created = 0;
  let skipped_unchanged = 0;
  const errors: string[] = [];
  const allEdges: ImportEdge[] = [];

  for (const file of scanResult.files) {
    logger.info({ file: file.relativePath }, "Indexing file");
    try {
      // a. Read file content
      const content = await readFile(file.absolutePath, "utf8");

      // Compute SHA-256 hash
      const hash = createHash("sha256").update(content).digest("hex");

      // a2. Large file warning
      const lineCount = content.split("\n").length;
      if (lineCount > 5000) {
        logger.warn(
          { file: file.relativePath, lines: lineCount },
          "Large file: indexing normally but file exceeds 5000 line threshold",
        );
      }

      // b. Compare hash — skip if unchanged
      if (existingHashes.get(file.relativePath) === hash) {
        skipped_unchanged++;
        continue;
      }

      // c. Delete stale chunks for this file (if re-indexing)
      if (existingHashes.has(file.relativePath)) {
        await codeChunksTable.delete(
          `file_path = '${escapeSQL(file.relativePath)}' AND project_id = '${escapeSQL(projectId)}'`,
        );
      }

      // d. Parse with tree-sitter
      const tree = parseSource(file.relativePath, content);

      // e. Extract symbols
      const extraction = extractSymbols(tree.rootNode, content, file.language, file.relativePath);

      // f. Skip if no symbols extracted
      if (extraction.symbols.length === 0) {
        logger.debug({ file: file.relativePath }, "No symbols extracted, skipping");
        continue;
      }

      // g. Embed all chunk contents (batch)
      const texts = extraction.symbols.map((s) => s.content);
      const vectors = await embed(texts, projectId, config);

      // h. Build code_chunk rows
      const now = new Date().toISOString();
      const rows = extraction.symbols.map((sym, i) => ({
        chunk_id: ulid(),
        project_id: projectId,
        doc_id: file.relativePath, // use file path as doc_id
        file_path: file.relativePath,
        symbol_name: sym.symbol_name || null,
        symbol_type: sym.symbol_type || null,
        scope_chain: sym.scope_chain || null,
        content: sym.content,
        language: file.language,
        imports: JSON.stringify(
          file.isTest
            ? { paths: extraction.imports, is_test: true }
            : { paths: extraction.imports },
        ),
        exports: JSON.stringify(extraction.exports),
        start_line: sym.start_line,
        end_line: sym.end_line,
        created_at: now,
        file_hash: hash,
        vector: vectors[i] as number[],
      }));

      // i. Write to code_chunks table
      await insertBatch(codeChunksTable, rows, CodeChunkRowSchema);
      files_indexed++;
      chunks_created += rows.length;

      // i2. Upsert a documents table entry for this code file so that
      // AST import edges (stored with file paths as from_id/to_id) are
      // resolvable by get_related_documents (DEBT-03)
      await upsertCodeFileDocument(db, projectId, file.relativePath, now);

      // j. Collect import edges for this file
      const fileEdges = resolveImports({
        fileSet,
        language: file.language,
        filePath: file.relativePath,
        imports: extraction.imports,
      });
      allEdges.push(...fileEdges);
    } catch (err) {
      // tree-sitter unavailable: abort immediately — all files will fail
      if (err instanceof TreeSitterUnavailableError) {
        throw err;
      }
      // Syntax errors: partial index + warning
      logger.warn({ file: file.relativePath, error: String(err) }, "Error indexing file");
      errors.push(`${file.relativePath}: ${String(err)}`);
    }
  }

  // ── 7. Write relationship edges (batch) ───────────────────────────────────
  // Delete ALL existing ast_import edges for this project
  await relTable.delete(`source = 'ast_import' AND project_id = '${escapeSQL(projectId)}'`);

  // Insert all new edges
  if (allEdges.length > 0) {
    const edgeRows = allEdges.map((edge) => ({
      relationship_id: ulid(),
      project_id: projectId,
      from_id: edge.from,
      to_id: edge.to,
      type: "depends_on",
      source: "ast_import",
      created_at: new Date().toISOString(),
      metadata: edge.symbols.length > 0 ? JSON.stringify({ symbols: edge.symbols }) : null,
    }));
    await insertBatch(relTable, edgeRows, RelationshipRowSchema);
  }

  // ── 8. Log activity ───────────────────────────────────────────────────────
  await logActivity(db, projectId, "index_codebase", null, "codebase", {
    files_scanned: scanResult.files_scanned,
    files_indexed,
    chunks_created,
    skipped_unchanged,
    files_deleted,
    edges_created: allEdges.length,
  });

  // ── 9. Update project_meta last_index_at (upsert via delete+insert) ─────
  try {
    // Open a fresh table reference to avoid stale data (Pitfall 5)
    const projectMetaTable = await db.openTable("project_meta");

    // Read existing created_at before deleting so we can preserve it (DEBT-02)
    const existingMeta = await projectMetaTable
      .query()
      .where(`project_id = '${escapeSQL(projectId)}'`)
      .select(["created_at"])
      .limit(1)
      .toArray();

    const now = new Date().toISOString();
    const originalCreatedAt =
      existingMeta.length > 0 ? (existingMeta[0].created_at as string) : now;

    await projectMetaTable.delete(`project_id = '${escapeSQL(projectId)}'`);
    await insertBatch(
      projectMetaTable,
      [
        {
          project_id: projectId,
          name: projectId,
          created_at: originalCreatedAt,
          updated_at: now,
          description: null,
          last_index_at: now,
          settings: null,
        },
      ],
      ProjectMetaRowSchema,
    );
  } catch {
    // Non-critical: log but don't fail
    logger.warn({ projectId }, "Failed to update project_meta last_index_at");
  }

  // ── 10. Return result ─────────────────────────────────────────────────────
  return {
    files_scanned: scanResult.files_scanned,
    files_indexed,
    chunks_created,
    skipped_unchanged,
    files_deleted,
    edges_created: allEdges.length,
    errors,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerIndexCodebaseTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "index_codebase",
    {
      description:
        "Scan, parse, and index a codebase into the Synapse knowledge base. " +
        "Supports incremental indexing: unchanged files are skipped via SHA-256 hash comparison. " +
        "Extracts symbols (functions, classes, methods, interfaces, types) from TypeScript, Python, and Rust files. " +
        "Creates vector embeddings for semantic search. Tracks file-to-file import relationships. " +
        "Automatically cleans up stale chunks for deleted or modified files.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        project_root: z.string().min(1).describe("Absolute path to the project directory to index"),
        exclude_patterns: z
          .array(z.string())
          .optional()
          .describe("Additional gitignore-style patterns to exclude"),
        include_patterns: z
          .array(z.string())
          .optional()
          .describe("If provided, only index files matching these patterns"),
      }),
    },
    async (args) => {
      const log = createToolLogger("index_codebase");
      const start = Date.now();

      const parsed = IndexCodebaseInputSchema.parse(args);
      log.info(
        {
          projectId: parsed.project_id,
          projectRoot: parsed.project_root,
        },
        "index_codebase invoked",
      );

      try {
        const data = await indexCodebase(config.db, parsed.project_id, parsed, config);
        const result: ToolResult<IndexCodebaseResult> = { success: true, data };
        log.info(
          {
            durationMs: Date.now() - start,
            filesScanned: data.files_scanned,
            filesIndexed: data.files_indexed,
            chunksCreated: data.chunks_created,
            skippedUnchanged: data.skipped_unchanged,
            filesDeleted: data.files_deleted,
            edgesCreated: data.edges_created,
          },
          "index_codebase complete",
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "index_codebase failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
