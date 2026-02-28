import { resolve } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulidx";
import { z } from "zod";
import { insertBatch } from "../db/batch.js";
import { connectDb } from "../db/connection.js";
import { DocumentRowSchema, TABLE_NAMES, TABLE_SCHEMAS } from "../db/schema.js";
import { createToolLogger, logger } from "../logger.js";
import type { SynapseConfig, ToolResult } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

const ProjectIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "project_id must be a lowercase slug (letters, numbers, hyphens, underscores, must start with alphanumeric)",
  );

// ────────────────────────────────────────────────────────────────────────────
// Result type
// ────────────────────────────────────────────────────────────────────────────

export interface InitProjectResult {
  tables_created: number;
  tables_skipped: number;
  database_path: string;
  project_id: string;
  starters_seeded: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Starter document templates (FOUND-04)
// ────────────────────────────────────────────────────────────────────────────

interface StarterTemplate {
  title: string;
  category: string;
  content: string;
}

const DEFAULT_STARTERS = [
  "project_charter",
  "adr_log",
  "implementation_patterns",
  "glossary",
] as const;

const STARTER_TEMPLATES: Record<string, StarterTemplate> = {
  project_charter: {
    title: "Project Charter",
    category: "plan",
    content: `# Project Charter

## Vision
<!-- What is this project? What problem does it solve? -->

## Objectives
<!-- Measurable goals. What does success look like? -->

## Scope
<!-- What is in scope? What is explicitly out of scope? -->

## Key Stakeholders
<!-- Who are the decision-makers and contributors? -->

## Timeline
<!-- Major milestones and target dates -->

## Success Criteria
<!-- How will we know the project is done? List testable/measurable outcomes. -->
`,
  },
  adr_log: {
    title: "Architecture Decision Log",
    category: "architecture_decision",
    content: `# Architecture Decision Log

## Overview
This document tracks architecture decisions for the project. Each decision follows the ADR format.

## Decision Template
<!-- Copy this template for each new decision -->

### ADR-NNN: [Decision Title]
- **Status:** proposed | accepted | deprecated | superseded
- **Date:** YYYY-MM-DD
- **Context:** What is the issue we are deciding on?
- **Decision:** What did we decide?
- **Consequences:** What are the trade-offs?
- **Alternatives considered:** What other options were evaluated?
`,
  },
  implementation_patterns: {
    title: "Implementation Patterns",
    category: "code_pattern",
    content: `# Implementation Patterns

## Overview
Reusable technical decisions and coding conventions for this project.

## Patterns

### [Pattern Name]
- **When to use:** In what situations does this pattern apply?
- **Implementation:** How is it implemented? Include code snippets.
- **Why:** What problem does it solve? Why this approach over alternatives?
- **Examples:** Links to where this pattern is used in the codebase.

## Anti-Patterns
<!-- Things we explicitly decided NOT to do, and why -->
`,
  },
  glossary: {
    title: "Project Glossary",
    category: "glossary",
    content: `# Project Glossary

## Terms

### [Term]
**Definition:** What does this term mean in the context of this project?
**Usage:** How and where is this term used?

<!-- Add terms alphabetically. Include project-specific jargon, abbreviations, and concepts that team members need to understand. -->
`,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Core logic (testable without MCP server)
// ────────────────────────────────────────────────────────────────────────────

export async function initProject(
  dbPath: string,
  projectId: string,
  starterTypes?: string[],
): Promise<InitProjectResult> {
  // Validate project_id format (FOUND-05: project_id must be a safe slug for SQL predicates)
  ProjectIdSchema.parse(projectId);

  const absPath = resolve(dbPath);
  const db = await connectDb(dbPath);
  const existing = new Set(await db.tableNames());

  let tables_created = 0;
  let tables_skipped = 0;

  for (const name of TABLE_NAMES) {
    if (existing.has(name)) {
      tables_skipped++;
      logger.debug({ table: name }, "Table exists, skipping");
    } else {
      const schema = TABLE_SCHEMAS[name];
      if (!schema) {
        throw new Error(`[initProject] No schema registered for table '${name}'`);
      }
      await db.createEmptyTable(name, schema, { existOk: true });

      // Create BTree index on project_id for multi-project scoping (FOUND-05)
      // Pitfall 3: BTree index on empty table may fail in some LanceDB versions
      // Wrap in try/catch — log warning but do not fail the entire init
      const table = await db.openTable(name);
      try {
        await table.createIndex("project_id", { config: lancedb.Index.btree() });
        logger.debug({ table: name }, "BTree index created on project_id");
      } catch (err) {
        logger.warn(
          { table: name, error: String(err) },
          "BTree index creation failed on empty table — index will be available after first insert",
        );
      }

      tables_created++;
    }
  }

  // ── Create FTS index on doc_chunks.content (Phase 5) ────────────────────
  // Only needed for fresh databases. replace: true handles re-init idempotency.
  if (tables_created > 0) {
    const docChunksTable = await db.openTable("doc_chunks");
    try {
      await docChunksTable.createIndex("content", {
        config: lancedb.Index.fts({
          withPosition: true,
          stem: false, // preserve technical terms exactly
          removeStopWords: false,
          lowercase: true,
        }),
        replace: true, // idempotent on re-init
      });
      logger.debug("FTS index created on doc_chunks.content");
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "FTS index creation failed on doc_chunks — will create on first data insert",
      );
    }

    // ── Create FTS index on code_chunks.content (Phase 7 prep) ──────────────
    const codeChunksTable = await db.openTable("code_chunks");
    try {
      await codeChunksTable.createIndex("content", {
        config: lancedb.Index.fts({
          withPosition: true,
          stem: false,        // preserve code identifiers exactly
          removeStopWords: false,
          lowercase: true,
        }),
        replace: true,
      });
      logger.debug("FTS index created on code_chunks.content");
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "FTS index creation failed on code_chunks — will create on first data insert",
      );
    }
  }

  // ── Seed starter documents for fresh projects only ────────────────────────
  // Only seed if at least one table was created (fresh project, not a re-init)
  let starters_seeded = 0;

  if (tables_created > 0) {
    const starters = starterTypes ?? [...DEFAULT_STARTERS];
    const docsTable = await db.openTable("documents");
    const now = new Date().toISOString();

    const starterRows = [];
    for (const starterKey of starters) {
      const template = STARTER_TEMPLATES[starterKey];
      if (!template) {
        logger.warn({ starterKey }, "Unknown starter template, skipping");
        continue;
      }
      starterRows.push({
        doc_id: ulid(),
        project_id: projectId,
        title: template.title,
        content: template.content,
        category: template.category,
        status: "active", // Starters are immediately active
        version: 1,
        created_at: now,
        updated_at: now,
        tags: "",
        phase: null,
        priority: null,
        parent_id: null,
        depth: null,
        decision_type: null,
      });
    }

    if (starterRows.length > 0) {
      await insertBatch(docsTable, starterRows, DocumentRowSchema);
      starters_seeded = starterRows.length;
      logger.info({ projectId, starters_seeded }, "Starter documents seeded");
    }
  }

  return {
    tables_created,
    tables_skipped,
    database_path: absPath,
    project_id: projectId,
    starters_seeded,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MCP tool registration
// ────────────────────────────────────────────────────────────────────────────

export function registerInitProjectTool(server: McpServer, config: SynapseConfig): void {
  server.registerTool(
    "init_project",
    {
      description:
        "Initialize a Synapse project database with all required tables. " +
        "Creates the database directory and 6 LanceDB tables (documents, doc_chunks, code_chunks, " +
        "relationships, project_meta, activity_log). Idempotent — safe to call multiple times.",
      inputSchema: z.object({
        project_id: z
          .string()
          .describe("Project identifier (lowercase slug: letters, numbers, hyphens, underscores)"),
        db_path: z
          .string()
          .optional()
          .describe("Database path override (defaults to server --db config)"),
        starter_types: z
          .array(z.string())
          .optional()
          .describe(
            "Optional list of starter document types to seed (default: project_charter, adr_log, implementation_patterns, glossary)",
          ),
      }),
    },
    async (args) => {
      const log = createToolLogger("init_project");
      const start = Date.now();
      const dbPath = args.db_path ?? config.db;
      log.info({ projectId: args.project_id, dbPath }, "init_project invoked");

      try {
        const data = await initProject(dbPath, args.project_id, args.starter_types);
        const result: ToolResult<InitProjectResult> = { success: true, data };
        log.info({ durationMs: Date.now() - start, ...data }, "init_project complete");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const result: ToolResult = { success: false, error: String(err) };
        log.error({ error: String(err), durationMs: Date.now() - start }, "init_project failed");
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    },
  );
}
