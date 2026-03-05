import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { DecisionRowSchema } from "../../src/db/schema.js";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { checkPrecedent } from "../../src/tools/check-precedent.js";
import { initProject } from "../../src/tools/init-project.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a 768-dim vector with all values set to a given base value.
 * Two vectors with the same base will have cosine distance = 0 (identical).
 * Two vectors with very different bases will have high cosine distance.
 */
function makeVector(base: number): number[] {
  return Array.from({ length: 768 }, () => base);
}

/**
 * Normalize a vector to unit length (for cosine similarity).
 */
function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

/**
 * Create a mock Ollama /api/embed response that returns a specific vector.
 */
function mockOllamaWithVector(
  vector: number[],
): (url: string, init?: RequestInit) => Promise<Response> {
  return (_url: string, _init?: RequestInit) => {
    return Promise.resolve(
      new Response(JSON.stringify({ embeddings: [vector] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
}

/**
 * Insert a decision directly into the decisions table with a specific vector.
 */
async function insertDecisionWithVector(
  dbPath: string,
  opts: {
    decision_id?: string;
    project_id?: string;
    subject: string;
    decision_type: string;
    status?: string;
    vector: number[] | null;
    tier?: number;
    tier_name?: string;
  },
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("decisions");

  const now = new Date().toISOString();
  const decision_id = opts.decision_id ?? `TEST-${Date.now()}-${Math.random()}`;

  const row = {
    decision_id,
    project_id: opts.project_id ?? "test-proj",
    subject: opts.subject,
    context: "Test context",
    rationale: "Test rationale",
    choice: "Test choice",
    tier: opts.tier ?? 1,
    tier_name: opts.tier_name ?? "architecture",
    decision_type: opts.decision_type,
    status: opts.status ?? "active",
    actor: "agent",
    phase: null,
    tags: "",
    superseded_by: null,
    created_at: now,
    updated_at: now,
    vector: opts.vector,
  };

  await insertBatch(table, [row], DecisionRowSchema);
  return decision_id;
}

const TEST_CONFIG: SynapseConfig = {
  db: "", // will be set per test
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "check-precedent-test-"));
  await initProject(tmpDir, "test-proj");
});

afterEach(() => {
  // Restore real fetch
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("checkPrecedent", () => {
  // ── 1. Empty table ─────────────────────────────────────────────────────────

  describe("empty table behavior", () => {
    test("returns has_precedent false when table is empty", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      _setFetchImpl(mockOllamaWithVector(normalizeVector(makeVector(0.5))));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "Use TypeScript",
          rationale: "TypeScript provides compile-time type safety",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(false);
      expect(result.matches).toEqual([]);
      expect(result.proposed.subject).toBe("Use TypeScript");
      expect(result.proposed.decision_type).toBe("convention");
    });
  });

  // ── 2. No matching decision_type ──────────────────────────────────────────

  describe("decision_type pre-filtering", () => {
    test("returns has_precedent false when no decisions match decision_type", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      // Insert a decision with type "tooling" — search will use type "convention"
      const vector = normalizeVector(makeVector(0.5));
      await insertDecisionWithVector(tmpDir, {
        subject: "Use Biome for linting",
        decision_type: "tooling",
        vector,
      });

      // Mock embed to return same vector (would be a match if types aligned)
      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "Use Prettier for formatting",
          rationale: "Prettier provides automatic code formatting",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(false);
      expect(result.matches).toEqual([]);
    });

    test("pre-filters by decision_type before vector search", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      const vector = normalizeVector(makeVector(0.5));

      // Insert one of the correct type, one of wrong type
      const correctId = await insertDecisionWithVector(tmpDir, {
        subject: "Use TypeScript strict mode",
        decision_type: "convention",
        vector,
      });
      await insertDecisionWithVector(tmpDir, {
        subject: "Use ESLint for linting",
        decision_type: "tooling",
        vector, // same vector but wrong type
      });

      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "Adopt TypeScript conventions",
          rationale: "TypeScript conventions help with consistency",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].decision_id).toBe(correctId);
    });
  });

  // ── 3. Similarity matching ────────────────────────────────────────────────

  describe("similarity matching", () => {
    test("returns has_precedent true with matching decisions above 0.85 threshold", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      // Use identical normalized vectors — cosine distance = 0, similarity = 1.0
      const vector = normalizeVector(makeVector(0.7));

      const storedId = await insertDecisionWithVector(tmpDir, {
        subject: "Use TypeScript for the project",
        decision_type: "convention",
        vector,
      });

      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "Adopt TypeScript across the codebase",
          rationale: "TypeScript provides compile-time type safety and better tooling",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].decision_id).toBe(storedId);
      expect(result.matches[0].similarity_score).toBeGreaterThanOrEqual(0.85);
    });

    test("returns at most 5 matches", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      const vector = normalizeVector(makeVector(0.3));

      // Insert 8 matching decisions
      for (let i = 0; i < 8; i++) {
        await insertDecisionWithVector(tmpDir, {
          subject: `Convention decision ${i}`,
          decision_type: "convention",
          vector,
        });
      }

      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "New convention decision",
          rationale: "Establishing consistent conventions across the codebase",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(true);
      expect(result.matches.length).toBeLessThanOrEqual(5);
    });
  });

  // ── 4. Inactive decision handling ─────────────────────────────────────────

  describe("inactive decision handling", () => {
    test("excludes superseded decisions by default", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      const vector = normalizeVector(makeVector(0.5));

      // Insert a superseded decision
      await insertDecisionWithVector(tmpDir, {
        subject: "Old convention",
        decision_type: "convention",
        status: "superseded",
        vector,
      });

      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "New convention",
          rationale: "New convention rationale",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(false);
      expect(result.matches).toEqual([]);
    });

    test("includes inactive decisions when include_inactive is true", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      const vector = normalizeVector(makeVector(0.5));

      const supersededId = await insertDecisionWithVector(tmpDir, {
        subject: "Old superseded convention",
        decision_type: "convention",
        status: "superseded",
        vector,
      });

      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "New convention",
          rationale: "New convention rationale",
          decision_type: "convention",
          include_inactive: true,
        },
        config,
      );

      expect(result.has_precedent).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      const matchIds = result.matches.map((m) => m.decision_id);
      expect(matchIds).toContain(supersededId);
    });
  });

  // ── 5. Result shape ────────────────────────────────────────────────────────

  describe("result shape", () => {
    test("result shape includes similarity_score, decision_id, subject, choice", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };
      const vector = normalizeVector(makeVector(0.5));

      const storedId = await insertDecisionWithVector(tmpDir, {
        subject: "Use LanceDB for vector storage",
        decision_type: "architectural",
        vector,
        tier: 1,
        tier_name: "architecture",
      });

      _setFetchImpl(mockOllamaWithVector(vector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "Choose a vector database",
          rationale: "Need a vector database for semantic search",
          decision_type: "architectural",
          tier: 1,
        },
        config,
      );

      expect(result.has_precedent).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);

      const match = result.matches[0];
      expect(match.decision_id).toBe(storedId);
      expect(typeof match.subject).toBe("string");
      expect(typeof match.choice).toBe("string");
      expect(typeof match.rationale).toBe("string");
      expect(typeof match.tier).toBe("number");
      expect(typeof match.tier_name).toBe("string");
      expect(typeof match.decision_type).toBe("string");
      expect(typeof match.status).toBe("string");
      expect(typeof match.similarity_score).toBe("number");
      expect(match.similarity_score).toBeGreaterThanOrEqual(0);
      expect(match.similarity_score).toBeLessThanOrEqual(1);
      expect(typeof match.created_at).toBe("string");

      // Check proposed shape
      expect(result.proposed.subject).toBe("Choose a vector database");
      expect(result.proposed.decision_type).toBe("architectural");
      expect(result.proposed.tier).toBe(1);
    });
  });

  // ── 6. Ranking ────────────────────────────────────────────────────────────

  describe("ranking", () => {
    test("results ranked by similarity_score descending", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };

      // Create two vectors with different similarity to the query
      // query vector: all 0.7
      // stored1: all 0.7 (identical, perfect match)
      // stored2: all 0.3 (different but still above threshold when normalized)
      const queryVector = normalizeVector(makeVector(0.7));
      const vec1 = normalizeVector(makeVector(0.7)); // identical to query = similarity 1.0
      const vec2 = normalizeVector(makeVector(0.699)); // very close but slightly different

      await insertDecisionWithVector(tmpDir, {
        subject: "Very similar convention",
        decision_type: "convention",
        vector: vec2,
      });

      // Insert vec1 last so it's not first by insertion order
      await insertDecisionWithVector(tmpDir, {
        subject: "Identical convention",
        decision_type: "convention",
        vector: vec1,
      });

      _setFetchImpl(mockOllamaWithVector(queryVector));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "New convention",
          rationale: "New convention rationale",
          decision_type: "convention",
        },
        config,
      );

      expect(result.has_precedent).toBe(true);
      expect(result.matches.length).toBeGreaterThan(1);

      // Verify descending sort
      for (let i = 1; i < result.matches.length; i++) {
        expect(result.matches[i - 1].similarity_score).toBeGreaterThanOrEqual(
          result.matches[i].similarity_score,
        );
      }
    });
  });

  // ── 7. Ollama unreachable (graceful degradation) ───────────────────────────

  describe("error handling", () => {
    test("returns graceful degradation warning when Ollama is unreachable", async () => {
      const config = { ...TEST_CONFIG, db: tmpDir };

      // Insert some decisions so the table is not empty
      const vector = normalizeVector(makeVector(0.5));
      await insertDecisionWithVector(tmpDir, {
        subject: "Existing convention",
        decision_type: "convention",
        vector,
      });

      // Mock fetch to simulate Ollama being unreachable
      _setFetchImpl(() => Promise.reject(new TypeError("fetch failed: ECONNREFUSED")));

      const result = await checkPrecedent(
        tmpDir,
        "test-proj",
        {
          project_id: "test-proj",
          subject: "New convention",
          rationale: "Rationale for new convention",
          decision_type: "convention",
        },
        config,
      );

      // Should gracefully degrade
      expect(result.has_precedent).toBe(false);
      expect(result.matches).toEqual([]);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("unreachable");
    });
  });
});
