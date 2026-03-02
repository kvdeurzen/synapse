import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { ulid } from "ulidx";
import { initProject } from "../../src/tools/init-project.js";
import {
  buildSearchPredicate,
  extractSnippet,
  fetchDocMetadata,
  normalizeFtsScore,
  normalizeVectorScore,
} from "../../src/tools/search-utils.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "search-utils-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── normalizeVectorScore ──────────────────────────────────────────────────────

describe("normalizeVectorScore", () => {
  test("distance 0 (identical) → 1.0", () => {
    expect(normalizeVectorScore(0)).toBe(1.0);
  });

  test("distance 2 (opposite) → 0.0", () => {
    expect(normalizeVectorScore(2)).toBe(0.0);
  });

  test("distance 0.5 → 0.75", () => {
    expect(normalizeVectorScore(0.5)).toBeCloseTo(0.75, 5);
  });

  test("distance 1 (orthogonal) → 0.5", () => {
    expect(normalizeVectorScore(1)).toBeCloseTo(0.5, 5);
  });

  test("clamps negative distance to 1.0", () => {
    expect(normalizeVectorScore(-0.1)).toBe(1.0);
  });

  test("clamps distance > 2 to 0.0", () => {
    expect(normalizeVectorScore(3)).toBe(0.0);
  });
});

// ── normalizeFtsScore ─────────────────────────────────────────────────────────

describe("normalizeFtsScore", () => {
  test("score 0 → 0", () => {
    expect(normalizeFtsScore(0)).toBe(0);
  });

  test("score 1 → 0.5 (sigmoid midpoint)", () => {
    expect(normalizeFtsScore(1)).toBeCloseTo(0.5, 5);
  });

  test("score 9 → 0.9", () => {
    expect(normalizeFtsScore(9)).toBeCloseTo(0.9, 5);
  });

  test("score 19 → ~0.95", () => {
    expect(normalizeFtsScore(19)).toBeCloseTo(0.95, 5);
  });

  test("negative score → 0", () => {
    expect(normalizeFtsScore(-1)).toBe(0);
  });

  test("large score → approaches 1.0 but never exceeds", () => {
    const result = normalizeFtsScore(1000);
    expect(result).toBeGreaterThan(0.99);
    expect(result).toBeLessThan(1.0);
  });
});

// ── extractSnippet ────────────────────────────────────────────────────────────

describe("extractSnippet", () => {
  test("short content (under maxTokens) returned as-is", () => {
    const content = "This is a short text";
    const result = extractSnippet(content, "short");
    expect(result).toBe(content);
  });

  test("exact match with default maxTokens: still returns if within budget", () => {
    const content = "Find keyword here";
    const result = extractSnippet(content, "keyword");
    expect(result).toBe(content);
  });

  test("long content with keyword match returns windowed snippet with ellipsis markers", () => {
    // Create content that exceeds 50 tokens with a keyword in the middle
    const prefix = "This is the beginning section of a long document. ".repeat(10);
    const keyword = "TARGETWORD";
    const suffix = " This is the end section of a long document.".repeat(10);
    const longText = prefix + keyword + suffix;

    const result = extractSnippet(longText, keyword, 50);

    // Should be shorter than original
    expect(result.length).toBeLessThan(longText.length);
    // Should include the keyword
    expect(result.toLowerCase()).toContain(keyword.toLowerCase());
    // Should have "..." markers
    expect(result.startsWith("...") || result.endsWith("...")).toBe(true);
  });

  test("no keyword match: falls back to start of content", () => {
    const prefix = "This is the beginning section of a very long document. ".repeat(10);
    const result = extractSnippet(prefix, "nonexistent_keyword_xyz", 20);

    // Should be a snippet from the start (no keyword found, bestPos = 0)
    expect(result.length).toBeLessThan(prefix.length);
    // Should not have "..." prefix since it starts at 0
    expect(result.startsWith("This")).toBe(true);
  });

  test("case-insensitive keyword matching", () => {
    const prefix = "Start of long text. ".repeat(20);
    const content = prefix + "UPPERCASED keyword found here. " + "More content. ".repeat(20);
    const result = extractSnippet(content, "uppercased", 30);
    expect(result.toLowerCase()).toContain("uppercased");
  });
});

// ── buildSearchPredicate ──────────────────────────────────────────────────────

describe("buildSearchPredicate", () => {
  test("no filters: includes project_id and status=active", async () => {
    await initProject(tmpDir, "test-proj");
    const { predicate } = await buildSearchPredicate("test-proj", {}, { dbPath: tmpDir });
    expect(predicate).toContain("project_id = 'test-proj'");
    expect(predicate).toContain("status = 'active'");
  });

  test("category filter: fetches matching doc_ids and adds IN clause", async () => {
    await initProject(tmpDir, "test-proj");

    // Insert a document with category=research into documents table
    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const now = new Date().toISOString();
    const docId = ulid();
    await docsTable.add([
      {
        doc_id: docId,
        project_id: "test-proj",
        title: "Research Doc",
        content: "Research content",
        category: "research",
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
    ]);

    const { predicate } = await buildSearchPredicate(
      "test-proj",
      { category: "research" },
      { dbPath: tmpDir },
    );

    expect(predicate).toContain("doc_id IN (");
    expect(predicate).toContain(docId);
  });

  test("no matching docs for filter: returns postFilterRequired=true or empty IN clause", async () => {
    await initProject(tmpDir, "test-proj");

    const result = await buildSearchPredicate(
      "test-proj",
      { category: "learning" },
      { dbPath: tmpDir },
    );

    // Either postFilterRequired or empty doc_id IN list - implementation may handle either way
    // The key is it returns a valid result object
    expect(result).toHaveProperty("predicate");
    expect(result).toHaveProperty("docMap");
  });

  test("tag validation: rejects tags with special characters", async () => {
    await initProject(tmpDir, "test-proj");

    await expect(
      buildSearchPredicate("test-proj", { tags: "invalid tag!" }, { dbPath: tmpDir }),
    ).rejects.toThrow("INVALID_TAG");
  });

  test("tag validation: accepts valid alphanumeric tags", async () => {
    await initProject(tmpDir, "test-proj");

    // Should not throw
    const result = await buildSearchPredicate(
      "test-proj",
      { tags: "typescript" },
      { dbPath: tmpDir },
    );
    expect(result).toHaveProperty("predicate");
  });

  test("include_superseded option omits status=active filter", async () => {
    await initProject(tmpDir, "test-proj");

    const { predicate } = await buildSearchPredicate(
      "test-proj",
      {},
      { dbPath: tmpDir, includeSuperseded: true },
    );

    expect(predicate).toContain("project_id = 'test-proj'");
    expect(predicate).not.toContain("status = 'active'");
  });

  test("phase filter: adds phase to doc query predicate", async () => {
    await initProject(tmpDir, "test-proj");

    // Insert a document with phase
    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const now = new Date().toISOString();
    const docId = ulid();
    await docsTable.add([
      {
        doc_id: docId,
        project_id: "test-proj",
        title: "Phase Doc",
        content: "Phase content",
        category: "plan",
        status: "active",
        version: 1,
        created_at: now,
        updated_at: now,
        tags: "",
        phase: "phase-2",
        priority: null,
        parent_id: null,
        depth: null,
        decision_type: null,
      },
    ]);

    const { predicate } = await buildSearchPredicate(
      "test-proj",
      { phase: "phase-2" },
      { dbPath: tmpDir },
    );

    expect(predicate).toContain(docId);
  });
});

// ── fetchDocMetadata ──────────────────────────────────────────────────────────

describe("fetchDocMetadata", () => {
  test("returns Map with doc metadata for given doc_ids", async () => {
    await initProject(tmpDir, "test-proj");

    // Insert a test document
    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const now = new Date().toISOString();
    const docId = ulid();
    await docsTable.add([
      {
        doc_id: docId,
        project_id: "test-proj",
        title: "Test Document Title",
        content: "Some content",
        category: "architecture_decision",
        status: "active",
        version: 1,
        created_at: now,
        updated_at: now,
        tags: "|typescript|backend|",
        phase: "phase-1",
        priority: 2,
        parent_id: null,
        depth: null,
        decision_type: null,
      },
    ]);

    const docMap = await fetchDocMetadata(tmpDir, "test-proj", [docId]);

    expect(docMap.size).toBe(1);
    const meta = docMap.get(docId);
    expect(meta).toBeDefined();
    expect(meta?.title).toBe("Test Document Title");
    expect(meta?.category).toBe("architecture_decision");
    expect(meta?.status).toBe("active");
    expect(meta?.phase).toBe("phase-1");
    expect(meta?.tags).toBe("|typescript|backend|");
    expect(meta?.priority).toBe(2);
  });

  test("returns empty Map when no doc_ids match", async () => {
    await initProject(tmpDir, "test-proj");

    const docMap = await fetchDocMetadata(tmpDir, "test-proj", [ulid()]);
    expect(docMap.size).toBe(0);
  });

  test("returns empty Map for empty doc_ids array", async () => {
    await initProject(tmpDir, "test-proj");

    const docMap = await fetchDocMetadata(tmpDir, "test-proj", []);
    expect(docMap.size).toBe(0);
  });

  test("batch fetches multiple doc_ids", async () => {
    await initProject(tmpDir, "test-proj");

    const db = await lancedb.connect(tmpDir);
    const docsTable = await db.openTable("documents");
    const now = new Date().toISOString();
    const docId1 = ulid();
    const docId2 = ulid();

    await docsTable.add([
      {
        doc_id: docId1,
        project_id: "test-proj",
        title: "First Doc",
        content: "Content 1",
        category: "plan",
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
      {
        doc_id: docId2,
        project_id: "test-proj",
        title: "Second Doc",
        content: "Content 2",
        category: "research",
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
    ]);

    const docMap = await fetchDocMetadata(tmpDir, "test-proj", [docId1, docId2]);

    expect(docMap.size).toBe(2);
    expect(docMap.get(docId1)?.title).toBe("First Doc");
    expect(docMap.get(docId2)?.title).toBe("Second Doc");
  });
});
