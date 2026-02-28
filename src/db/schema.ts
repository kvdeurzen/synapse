// Arrow types come from apache-arrow (installed as lancedb transitive dep — no explicit install needed)
import { Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from "apache-arrow";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Arrow Schemas
// ────────────────────────────────────────────────────────────────────────────

/**
 * Documents table — 15 fields.
 * Includes v2 forward-compatibility fields: parent_id, depth, decision_type.
 */
export const DOCUMENTS_SCHEMA = new Schema([
  new Field("doc_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("title", new Utf8(), false),
  new Field("content", new Utf8(), false),
  new Field("category", new Utf8(), false),
  new Field("status", new Utf8(), false),
  new Field("version", new Int32(), false),
  new Field("created_at", new Utf8(), false),
  new Field("updated_at", new Utf8(), false),
  new Field("tags", new Utf8(), false),
  new Field("phase", new Utf8(), true),
  new Field("priority", new Int32(), true),
  new Field("parent_id", new Utf8(), true),
  new Field("depth", new Int32(), true),
  new Field("decision_type", new Utf8(), true),
]);

/**
 * Code chunks table — 16 fields (includes 768-dim float32 vector).
 */
export const CODE_CHUNKS_SCHEMA = new Schema([
  new Field("chunk_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("doc_id", new Utf8(), false),
  new Field("file_path", new Utf8(), false),
  new Field("symbol_name", new Utf8(), true),
  new Field("symbol_type", new Utf8(), true),
  new Field("scope_chain", new Utf8(), true),
  new Field("content", new Utf8(), false),
  new Field("language", new Utf8(), true),
  new Field("imports", new Utf8(), false),
  new Field("exports", new Utf8(), false),
  new Field("start_line", new Int32(), true),
  new Field("end_line", new Int32(), true),
  new Field("created_at", new Utf8(), false),
  new Field("file_hash", new Utf8(), true),
  new Field("vector", new FixedSizeList(768, new Field("item", new Float32(), true)), false),
]);

/**
 * Relationships table — 8 fields.
 */
export const RELATIONSHIPS_SCHEMA = new Schema([
  new Field("relationship_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("from_id", new Utf8(), false),
  new Field("to_id", new Utf8(), false),
  new Field("type", new Utf8(), false),
  new Field("source", new Utf8(), false),
  new Field("created_at", new Utf8(), false),
  new Field("metadata", new Utf8(), true),
]);

/**
 * Project metadata table — 7 fields.
 */
export const PROJECT_META_SCHEMA = new Schema([
  new Field("project_id", new Utf8(), false),
  new Field("name", new Utf8(), false),
  new Field("created_at", new Utf8(), false),
  new Field("updated_at", new Utf8(), false),
  new Field("description", new Utf8(), true),
  new Field("last_index_at", new Utf8(), true),
  new Field("settings", new Utf8(), true),
]);

/**
 * Activity log table — 8 fields.
 */
export const ACTIVITY_LOG_SCHEMA = new Schema([
  new Field("log_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("actor", new Utf8(), false),
  new Field("action", new Utf8(), false),
  new Field("target_id", new Utf8(), true),
  new Field("target_type", new Utf8(), true),
  new Field("metadata", new Utf8(), true),
  new Field("created_at", new Utf8(), false),
]);

/**
 * Doc chunks table — 11 fields.
 * Stores embedded document chunks separately from the documents table.
 * vector is nullable to support starter documents without embeddings.
 */
export const DOC_CHUNKS_SCHEMA = new Schema([
  new Field("chunk_id", new Utf8(), false),
  new Field("project_id", new Utf8(), false),
  new Field("doc_id", new Utf8(), false),
  new Field("chunk_index", new Int32(), false),
  new Field("content", new Utf8(), false),
  new Field("vector", new FixedSizeList(768, new Field("item", new Float32(), true)), true),
  new Field("header", new Utf8(), false),
  new Field("version", new Int32(), false),
  new Field("status", new Utf8(), false),
  new Field("token_count", new Int32(), false),
  new Field("created_at", new Utf8(), false),
]);

// ────────────────────────────────────────────────────────────────────────────
// Zod Schemas (single source of truth for row validation)
// ────────────────────────────────────────────────────────────────────────────

export const DocumentRowSchema = z.object({
  doc_id: z.string().min(1),
  project_id: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  category: z.string().min(1),
  status: z.string().min(1),
  version: z.number().int().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  tags: z.string(),
  phase: z.string().nullable(),
  priority: z.number().int().nullable(),
  parent_id: z.string().nullable(),
  depth: z.number().int().nullable(),
  decision_type: z.string().nullable(),
});

export const CodeChunkRowSchema = z.object({
  chunk_id: z.string().min(1),
  project_id: z.string().min(1),
  doc_id: z.string().min(1),
  file_path: z.string().min(1),
  symbol_name: z.string().nullable(),
  symbol_type: z.string().nullable(),
  scope_chain: z.string().nullable(),
  content: z.string(),
  language: z.string().nullable(),
  imports: z.string(),
  exports: z.string(),
  start_line: z.number().int().nullable(),
  end_line: z.number().int().nullable(),
  created_at: z.string().datetime(),
  file_hash: z.string().nullable(),
  vector: z.array(z.number()).length(768),
});

export const RelationshipRowSchema = z.object({
  relationship_id: z.string().min(1),
  project_id: z.string().min(1),
  from_id: z.string().min(1),
  to_id: z.string().min(1),
  type: z.string().min(1),
  source: z.string().min(1),
  created_at: z.string().datetime(),
  metadata: z.string().nullable(),
});

export const ProjectMetaRowSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  description: z.string().nullable(),
  last_index_at: z.string().nullable(),
  settings: z.string().nullable(),
});

export const ActivityLogRowSchema = z.object({
  log_id: z.string().min(1),
  project_id: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  target_id: z.string().nullable(),
  target_type: z.string().nullable(),
  metadata: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const DocChunkRowSchema = z.object({
  chunk_id: z.string().min(1),
  project_id: z.string().min(1),
  doc_id: z.string().min(1),
  chunk_index: z.number().int().min(0),
  content: z.string(),
  vector: z.array(z.number()).length(768).nullable(),
  header: z.string(),
  version: z.number().int().min(1),
  status: z.string().min(1),
  token_count: z.number().int().min(0),
  created_at: z.string().datetime(),
});

// ────────────────────────────────────────────────────────────────────────────
// Table Registry
// ────────────────────────────────────────────────────────────────────────────

export const TABLE_NAMES = [
  "documents",
  "doc_chunks",
  "code_chunks",
  "relationships",
  "project_meta",
  "activity_log",
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export const TABLE_SCHEMAS: Record<string, Schema> = {
  documents: DOCUMENTS_SCHEMA,
  doc_chunks: DOC_CHUNKS_SCHEMA,
  code_chunks: CODE_CHUNKS_SCHEMA,
  relationships: RELATIONSHIPS_SCHEMA,
  project_meta: PROJECT_META_SCHEMA,
  activity_log: ACTIVITY_LOG_SCHEMA,
};
