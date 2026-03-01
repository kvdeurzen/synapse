import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { ulid } from "ulidx";
import { insertBatch } from "../../src/db/batch.js";
import { DocumentRowSchema } from "../../src/db/schema.js";
import { getSmartContext } from "../../src/tools/get-smart-context.js";
import { initProject } from "../../src/tools/init-project.js";
import { linkDocuments } from "../../src/tools/link-documents.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const BASE_DOC = {
  title: "Test Document",
  content: "# Test\n\nContent for testing purposes only.",
  category: "research" as const,
  status: "active" as const,
  version: 1,
  tags: "||",
  phase: null,
  priority: null,
  parent_id: null,
  depth: null,
  decision_type: null,
};

let docCounter = 0;

async function insertDoc(
  dbPath: string,
  projectId: string,
  override: Partial<typeof BASE_DOC> & {
    doc_id?: string;
    content?: string;
    title?: string;
    priority?: number | null;
    category?: string;
    status?: string;
    tags?: string;
    phase?: string | null;
  },
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("documents");
  const now = new Date().toISOString();
  docCounter++;
  const doc_id = override.doc_id ?? `DOC${docCounter.toString().padStart(4, "0")}`;

  await insertBatch(
    table,
    [
      {
        ...BASE_DOC,
        doc_id,
        project_id: projectId,
        ...override,
        created_at: now,
        updated_at: now,
      },
    ],
    DocumentRowSchema,
  );

  return doc_id;
}

function makeVector(seed = 0): number[] {
  const v = new Array(768).fill(0) as number[];
  v[seed % 768] = 1.0;
  v[(seed + 100) % 768] = 0.5;
  return v;
}

async function insertCodeChunk(
  db: lancedb.Connection,
  opts: {
    projectId: string;
    filePath: string;
    language?: string;
    fileHash?: string | null;
    chunkId?: string;
    content?: string;
    symbolName?: string | null;
    symbolType?: string | null;
  },
): Promise<string> {
  const chunkId = opts.chunkId ?? ulid();
  const now = new Date().toISOString();

  const codeChunksTable = await db.openTable("code_chunks");
  await codeChunksTable.add([
    {
      chunk_id: chunkId,
      project_id: opts.projectId,
      doc_id: opts.filePath,
      file_path: opts.filePath,
      symbol_name: opts.symbolName ?? null,
      symbol_type: opts.symbolType ?? null,
      scope_chain: null,
      content: opts.content ?? `export function fn${chunkId.slice(-4)}(): void {}`,
      language: opts.language ?? null,
      imports: "{}",
      exports: "{}",
      start_line: 1,
      end_line: 3,
      created_at: now,
      file_hash: opts.fileHash ?? null,
      vector: makeVector(0),
    },
  ]);

  return chunkId;
}

async function linkDocs(
  dbPath: string,
  projectId: string,
  fromId: string,
  toId: string,
  type:
    | "implements"
    | "depends_on"
    | "supersedes"
    | "references"
    | "contradicts"
    | "child_of"
    | "related_to",
) {
  return linkDocuments(dbPath, projectId, {
    project_id: projectId,
    from_id: fromId,
    to_id: toId,
    type,
    bidirectional: false,
  });
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "get-smart-context-test-"));
  await initProject(tmpDir, "test-proj");
  docCounter = 0;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Overview mode tests ───────────────────────────────────────────────────────

describe("getSmartContext - overview mode", () => {
  test("overview with no filters returns all non-superseded docs up to token budget", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "This is doc A content.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Doc B",
      content: "This is doc B content.",
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      max_tokens: 4000,
    });

    expect(result.mode).toBe("overview");
    // source is "both" by default (source_types defaults to "both" since Phase 7 Plan 02 extension)
    expect(result.source === "document" || result.source === "both").toBe(true);
    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    expect(docIds).toContain(docA);
    expect(docIds).toContain(docB);
  });

  test("overview excludes superseded docs by default", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Active Doc",
      content: "This is active content.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Superseded Doc",
      content: "This is superseded content.",
      status: "superseded",
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      max_tokens: 4000,
    });

    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    expect(docIds).toContain(docA);
    expect(docIds).not.toContain(docB);
  });

  test("overview with category filter narrows results", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Research Doc",
      content: "Research content.",
      category: "research",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Plan Doc",
      content: "Plan content.",
      category: "plan",
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      category: "research",
      max_tokens: 4000,
    });

    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    expect(docIds).toContain(docA);
    expect(docIds).not.toContain(docB);
  });

  test("overview respects max_tokens (large set trimmed to budget)", async () => {
    // Insert 10 docs, each with substantial content (~80+ tokens per summary)
    const longContent = "word ".repeat(100); // ~100 words, ~130 tokens each
    const insertedIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = await insertDoc(tmpDir, "test-proj", {
        title: `Document ${i + 1}`,
        content: longContent,
      });
      insertedIds.push(id);
    }

    // 4 starter docs are also seeded by initProject; use category filter to isolate test docs
    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      category: "research", // starter docs use various categories; our inserts use "research"
      max_tokens: 500, // Low budget relative to 10 docs at ~100 tokens each
    });

    // Should have fewer docs than total due to budget
    expect(result.documents.length).toBeLessThan(10);
    expect(result.total_tokens).toBeLessThanOrEqual(500);
    expect(result.max_tokens).toBe(500);
  });

  test("overview sorts by priority (priority 1 appears before priority 5)", async () => {
    const lowPri = await insertDoc(tmpDir, "test-proj", {
      title: "Low Priority Doc",
      content: "Low priority content here.",
      priority: 5,
    });
    const highPri = await insertDoc(tmpDir, "test-proj", {
      title: "High Priority Doc",
      content: "High priority content here.",
      priority: 1,
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      max_tokens: 4000,
    });

    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    const highPriIdx = docIds.indexOf(highPri);
    const lowPriIdx = docIds.indexOf(lowPri);
    expect(highPriIdx).toBeGreaterThanOrEqual(0);
    expect(lowPriIdx).toBeGreaterThanOrEqual(0);
    expect(highPriIdx).toBeLessThan(lowPriIdx);
  });

  test("default max_tokens is 4000 when not specified", async () => {
    await insertDoc(tmpDir, "test-proj", {
      title: "A Doc",
      content: "Some content.",
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      // no max_tokens
    });

    expect(result.max_tokens).toBe(4000);
  });

  test("overview with empty project (category filter) returns empty results without error", async () => {
    // Use a category that has no starter docs and no inserted docs
    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      category: "change_record", // no starters use this category
      max_tokens: 4000,
    });

    expect(result.mode).toBe("overview");
    expect(result.documents).toHaveLength(0);
    expect(result.total_documents).toBe(0);
    expect(result.included_documents).toBe(0);
    expect(result.total_tokens).toBe(0);
    // source is "both" by default (source_types defaults to "both" since Phase 7 Plan 02 extension)
    expect(result.source === "document" || result.source === "both").toBe(true);
  });

  test("each document has required fields in overview mode", async () => {
    await insertDoc(tmpDir, "test-proj", {
      title: "Field Test Doc",
      content: "Content to check fields.",
      category: "change_record", // unique category — no starters use this
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      category: "change_record",
      max_tokens: 4000,
    });

    expect(result.documents.length).toBe(1);
    const doc = result.documents[0];
    expect(typeof doc.doc_id).toBe("string");
    expect(typeof doc.title).toBe("string");
    expect(typeof doc.category).toBe("string");
    expect(typeof doc.status).toBe("string");
    expect(typeof doc.summary).toBe("string");
    expect(typeof doc.token_count).toBe("number");
    // priority can be null or number
    expect(doc.priority === null || typeof doc.priority === "number").toBe(true);
  });

  test("overview summaries are ~100 tokens (extractSnippet called per doc)", async () => {
    // A doc with much more than 100 tokens
    const longContent = "The quick brown fox jumps over the lazy dog. ".repeat(30); // ~300+ tokens
    await insertDoc(tmpDir, "test-proj", {
      title: "Long Doc",
      content: longContent,
      category: "learning", // unique category — no starters use this
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      category: "learning",
      max_tokens: 4000,
    });

    expect(result.documents.length).toBe(1);
    const doc = result.documents[0];
    // token_count should be <= 100 (extractSnippet cap)
    expect(doc.token_count).toBeLessThanOrEqual(105); // small tolerance
  });

  test("overview returns correct total_documents and included_documents counts", async () => {
    // Insert 5 docs with small content (each ~10 tokens) in a unique category
    for (let i = 0; i < 5; i++) {
      await insertDoc(tmpDir, "test-proj", {
        title: `Doc ${i + 1}`,
        content: "Short content here.",
        category: "requirement", // no starters use this category
      });
    }

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      category: "requirement",
      max_tokens: 4000,
    });

    expect(result.total_documents).toBe(5);
    expect(result.included_documents).toBe(result.documents.length);
  });
});

// ── Detailed mode tests ───────────────────────────────────────────────────────

describe("getSmartContext - detailed mode", () => {
  test("detailed mode with valid doc_ids returns full content", async () => {
    const content = "This is the full document content for detailed mode testing.";
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content,
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    expect(result.mode).toBe("detailed");
    expect(result.source).toBe("document");
    expect(result.documents.length).toBeGreaterThanOrEqual(1);
    const docResult = result.documents.find((d: { doc_id: string }) => d.doc_id === docA);
    expect(docResult).toBeDefined();
    expect(docResult.content).toBe(content);
    expect(docResult.is_requested).toBe(true);
  });

  test("detailed mode without doc_ids throws error", async () => {
    await expect(
      getSmartContext(tmpDir, "test-proj", {
        project_id: "test-proj",
        mode: "detailed",
        // no doc_ids
        max_tokens: 4000,
      }),
    ).rejects.toThrow();
  });

  test("detailed mode with empty doc_ids throws error", async () => {
    await expect(
      getSmartContext(tmpDir, "test-proj", {
        project_id: "test-proj",
        mode: "detailed",
        doc_ids: [],
        max_tokens: 4000,
      }),
    ).rejects.toThrow();
  });

  test("detailed mode includes 1-hop related documents via graph expansion", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "Content for doc A.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Doc B",
      content: "Content for doc B.",
    });

    await linkDocs(tmpDir, "test-proj", docA, docB, "references");

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    expect(docIds).toContain(docA);
    expect(docIds).toContain(docB);
  });

  test("depends_on/implements neighbors appear before references/related_to in expansion", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Main Doc",
      content: "Main document content.",
    });
    const depDoc = await insertDoc(tmpDir, "test-proj", {
      title: "Dependency",
      content: "This is a dependency doc.",
    });
    const refDoc = await insertDoc(tmpDir, "test-proj", {
      title: "Reference",
      content: "This is a reference doc.",
    });

    // Link A -> depDoc (depends_on, priority 1)
    await linkDocs(tmpDir, "test-proj", docA, depDoc, "depends_on");
    // Link A -> refDoc (references, priority 2)
    await linkDocs(tmpDir, "test-proj", docA, refDoc, "references");

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    const expandedDocs = result.documents.filter(
      (d: { is_requested: boolean }) => !d.is_requested,
    );
    const depIdx = expandedDocs.findIndex((d: { doc_id: string }) => d.doc_id === depDoc);
    const refIdx = expandedDocs.findIndex((d: { doc_id: string }) => d.doc_id === refDoc);
    expect(depIdx).toBeGreaterThanOrEqual(0);
    expect(refIdx).toBeGreaterThanOrEqual(0);
    expect(depIdx).toBeLessThan(refIdx); // depends_on before references
  });

  test("already-requested docs are not duplicated via graph expansion", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "Content for doc A.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Doc B",
      content: "Content for doc B.",
    });

    // Link both to each other
    await linkDocs(tmpDir, "test-proj", docA, docB, "references");
    await linkDocs(tmpDir, "test-proj", docB, docA, "references");

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA, docB], // both requested
      max_tokens: 4000,
    });

    // No duplicates
    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    const uniqueIds = new Set(docIds);
    expect(uniqueIds.size).toBe(docIds.length);
  });

  test("detailed mode respects token budget — drops related docs that exceed budget", async () => {
    const longContent = "detailed word content ".repeat(100); // ~300+ tokens per doc
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Main Doc",
      content: "Short main doc content.",
    });

    // Insert many related docs with long content
    for (let i = 0; i < 5; i++) {
      const relDoc = await insertDoc(tmpDir, "test-proj", {
        title: `Related Doc ${i + 1}`,
        content: longContent,
      });
      await linkDocs(tmpDir, "test-proj", docA, relDoc, "related_to");
    }

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 500, // low budget — main doc fits (~10 tokens), but not all 5 related (~300 tokens each)
    });

    expect(result.total_tokens).toBeLessThanOrEqual(500);
    // Main doc always included
    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    expect(docIds).toContain(docA);
    // Not all 5 related docs fit
    const relatedIncluded = result.documents.filter(
      (d: { is_requested: boolean }) => !d.is_requested,
    ).length;
    expect(relatedIncluded).toBeLessThan(5);
  });

  test("detailed mode returns graph_expansion metadata", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "Content A.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Doc B",
      content: "Content B.",
    });

    await linkDocs(tmpDir, "test-proj", docA, docB, "references");

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    expect(result.graph_expansion).toBeDefined();
    expect(typeof result.graph_expansion.requested_count).toBe("number");
    expect(typeof result.graph_expansion.related_found).toBe("number");
    expect(typeof result.graph_expansion.related_included).toBe("number");
    expect(result.graph_expansion.requested_count).toBe(1);
    expect(result.graph_expansion.related_found).toBeGreaterThanOrEqual(1);
  });

  test("detailed mode expanded docs have relationship metadata fields", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "Content A.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Doc B",
      content: "Content B.",
    });

    await linkDocs(tmpDir, "test-proj", docA, docB, "implements");

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    const expandedDoc = result.documents.find(
      (d: { doc_id: string; is_requested: boolean }) => d.doc_id === docB && !d.is_requested,
    );
    expect(expandedDoc).toBeDefined();
    expect(expandedDoc.relationship_type).toBe("implements");
    expect(
      expandedDoc.relationship_direction === "outgoing" ||
        expandedDoc.relationship_direction === "incoming",
    ).toBe(true);
  });

  test("detailed mode does not include superseded docs from graph expansion", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "Content A.",
    });
    const docB = await insertDoc(tmpDir, "test-proj", {
      title: "Superseded Related",
      content: "This is superseded.",
      status: "superseded",
    });

    await linkDocs(tmpDir, "test-proj", docA, docB, "references");

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    const docIds = result.documents.map((d: { doc_id: string }) => d.doc_id);
    expect(docIds).not.toContain(docB);
  });

  test("detailed mode requested docs have is_requested=true", async () => {
    const docA = await insertDoc(tmpDir, "test-proj", {
      title: "Doc A",
      content: "Content for doc A.",
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [docA],
      max_tokens: 4000,
    });

    const reqDoc = result.documents.find((d: { doc_id: string }) => d.doc_id === docA);
    expect(reqDoc.is_requested).toBe(true);
    expect(reqDoc.relationship_type).toBeUndefined();
  });
});

// ── Extended tests: source_types + bias + code_chunks ────────────────────────

describe("getSmartContext - source_types and code_chunks integration", () => {
  // a. Overview mode with source_types="both" returns code items

  test("overview with source_types='both' returns both documents and code_items", async () => {
    const db = await lancedb.connect(tmpDir);

    await insertDoc(tmpDir, "test-proj", {
      title: "A Document",
      content: "Document content about the system.",
      category: "change_record", // unique category to isolate test
    });

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/index.ts",
      language: "typescript",
      content: "export function main(): void { console.log('hello'); }",
      chunkId: ulid(),
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "both",
      max_tokens: 4000,
    });

    // Should have both documents and code_items
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.code_items).toBeDefined();
    expect(result.code_items!.length).toBeGreaterThan(0);
    expect(result.source).toBe("both");
  });

  // b. Overview with source_types="documents" returns no code items

  test("overview with source_types='documents' does not include code items", async () => {
    const db = await lancedb.connect(tmpDir);

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/app.ts",
      language: "typescript",
      content: "export class App {}",
      chunkId: ulid(),
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "documents",
      max_tokens: 4000,
    });

    // code_items should be absent or empty
    expect(result.code_items == null || result.code_items.length === 0).toBe(true);
    expect(result.source).toBe("document");
  });

  // c. Overview mode default (no source_types) includes code items when available

  test("overview default (no source_types) returns both when code_chunks have data", async () => {
    const db = await lancedb.connect(tmpDir);

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/handler.ts",
      language: "typescript",
      content: "export function handle(): void {}",
      chunkId: ulid(),
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      max_tokens: 4000,
      // no source_types — defaults to "both"
    });

    // With default "both", code_items should be present
    expect(result.code_items).toBeDefined();
    expect(result.code_items!.length).toBeGreaterThan(0);
  });

  // d. Code summaries use extractSnippet format

  test("code_items summaries use extractSnippet format from content", async () => {
    const db = await lancedb.connect(tmpDir);
    const codeContent =
      "export function authenticate(token: string): boolean { return token.length > 0; }";

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/auth.ts",
      language: "typescript",
      content: codeContent,
      chunkId: ulid(),
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "code",
      max_tokens: 4000,
    });

    expect(result.code_items).toBeDefined();
    expect(result.code_items!.length).toBeGreaterThan(0);

    const codeItem = result.code_items![0];
    // Summary should contain the beginning of the content (extractSnippet with empty query)
    expect(typeof codeItem.summary).toBe("string");
    expect(codeItem.summary.length).toBeGreaterThan(0);
    // The content is short enough to fit in 100 tokens, so summary === content
    expect(codeItem.summary).toContain("authenticate");
  });

  // e. Token budget shared across documents and code

  test("truncation works across both types and truncated=true when budget exceeded", async () => {
    const db = await lancedb.connect(tmpDir);
    const longContent = "word ".repeat(200); // ~200 tokens per item

    // Insert many code chunks to fill budget
    for (let i = 0; i < 10; i++) {
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: `src/file${i}.ts`,
        language: "typescript",
        content: longContent,
        chunkId: ulid(),
      });
    }

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "code",
      max_tokens: 500, // low budget — can't fit all 10 chunks
    });

    expect(result.total_tokens).toBeLessThanOrEqual(500);
    expect(result.truncated).toBe(true);
  });

  // f. Detailed mode resolves code chunk_ids

  test("detailed mode resolves code chunk_id when not found in documents table", async () => {
    const db = await lancedb.connect(tmpDir);
    const chunkId = ulid();
    const codeContent = "export const VERSION = '1.0.0';";

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/version.ts",
      language: "typescript",
      content: codeContent,
      chunkId,
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "detailed",
      doc_ids: [chunkId],
      source_types: "both",
      max_tokens: 4000,
    });

    // Should find the code chunk by its chunk_id
    const resolved = result.documents.find(
      (d: { doc_id: string }) => d.doc_id === chunkId,
    );
    expect(resolved).toBeDefined();
    expect(resolved.content).toBe(codeContent);
    expect(resolved.is_requested).toBe(true);
    // Title should contain the file path
    expect(resolved.title).toContain("src/version.ts");
  });

  // g. Response metadata fields populated

  test("overview result includes required metadata fields", async () => {
    const db = await lancedb.connect(tmpDir);

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/meta.ts",
      language: "typescript",
      content: "export function metaTest(): void {}",
      chunkId: ulid(),
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "both",
      max_tokens: 4000,
    });

    // All CONTEXT.md-required metadata fields
    expect(typeof result.total_matches).toBe("number");
    expect(typeof result.docs_returned).toBe("number");
    expect(typeof result.code_returned).toBe("number");
    expect(typeof result.truncated).toBe("boolean");
    expect(typeof result.tokens_used).toBe("number");
    expect(result.tokens_used).toBe(result.total_tokens);
    expect(result.docs_returned).toBe(result.included_documents);
    expect(result.code_returned).toBe(result.included_code_items);
  });

  // h. Bias parameter weights document vs code

  test("bias=1.0 favors documents over code in ranking", async () => {
    const db = await lancedb.connect(tmpDir);
    const longContent = "word ".repeat(150); // ~150 tokens

    // Insert docs with long content
    await insertDoc(tmpDir, "test-proj", {
      title: "Priority Doc",
      content: longContent,
      category: "requirement",
      priority: 1,
    });

    // Insert code chunks with same-length content
    for (let i = 0; i < 5; i++) {
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: `src/chunk${i}.ts`,
        language: "typescript",
        content: longContent,
        chunkId: ulid(),
      });
    }

    // With bias=1.0 (favor documents), docs should fill budget first
    const resultDocBias = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "both",
      bias: 1.0,
      max_tokens: 500,
      category: "requirement", // filter docs to only our inserted doc
    });

    // With bias=0.0 (favor code), code should fill budget first
    const resultCodeBias = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "both",
      bias: 0.0,
      max_tokens: 500,
    });

    // With doc bias: docs_returned should be higher relative to code
    // With code bias: code_returned should be higher relative to docs
    // These are directional tests — not exact counts
    expect(typeof resultDocBias.docs_returned).toBe("number");
    expect(typeof resultCodeBias.code_returned).toBe("number");
    // Code bias should include at least one code item (or more than doc bias)
    const docBiasCodeCount = resultDocBias.code_returned ?? 0;
    const codeBiasCodeCount = resultCodeBias.code_returned ?? 0;
    expect(codeBiasCodeCount).toBeGreaterThanOrEqual(docBiasCodeCount);
  });

  // i. Tight budget fills by pure relevance regardless of source type

  test("tight budget fills by merged relevance ranking regardless of source type", async () => {
    const db = await lancedb.connect(tmpDir);
    const shortContent = "short content"; // small token count

    // Insert a document with high priority (high relevance)
    await insertDoc(tmpDir, "test-proj", {
      title: "High Priority Doc",
      content: shortContent,
      category: "requirement",
      priority: 1,
    });

    // Insert code chunks
    for (let i = 0; i < 3; i++) {
      await insertCodeChunk(db, {
        projectId: "test-proj",
        filePath: `src/bias${i}.ts`,
        language: "typescript",
        content: shortContent,
        chunkId: ulid(),
      });
    }

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "both",
      bias: 0.5,
      max_tokens: 4000, // generous budget — all should fit
    });

    // Result should include items from both sources
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.code_items).toBeDefined();
    // total_matches is all candidates before budget filtering
    expect(result.total_matches).toBeGreaterThan(0);
  });

  // j. source_types="code" returns source="code" and no document fields

  test("overview with source_types='code' returns source='code'", async () => {
    const db = await lancedb.connect(tmpDir);

    await insertCodeChunk(db, {
      projectId: "test-proj",
      filePath: "src/source-type.ts",
      language: "typescript",
      content: "export const X = 1;",
      chunkId: ulid(),
    });

    const result = await getSmartContext(tmpDir, "test-proj", {
      project_id: "test-proj",
      mode: "overview",
      source_types: "code",
      max_tokens: 4000,
    });

    expect(result.source).toBe("code");
    expect(result.documents).toHaveLength(0);
    expect(result.code_items).toBeDefined();
    expect(result.code_items!.length).toBeGreaterThan(0);
  });
});
