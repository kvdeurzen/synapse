import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { _setFetchImpl } from "../../src/services/embedder.js";
import { initProject } from "../../src/tools/init-project.js";
import { storeDecision } from "../../src/tools/store-decision.js";
import type { SynapseConfig } from "../../src/types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock Ollama /api/embed response returning 768-dim vectors.
 * count = number of texts to embed (one vector per text).
 */
function mockOllamaEmbed(count: number): Response {
  const vectors = Array.from({ length: count }, () =>
    Array.from({ length: 768 }, (_, i) => i * 0.001),
  );
  return new Response(JSON.stringify({ embeddings: vectors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const TEST_CONFIG: SynapseConfig = {
  db: "", // will be set per test
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  logLevel: "error",
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "store-decision-test-"));
  // Mock fetch to avoid needing real Ollama
  _setFetchImpl((_url, _init) => {
    const body = _init?.body;
    let count = 1;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as { input?: string[] };
        count = parsed.input?.length ?? 1;
      } catch {
        count = 1;
      }
    }
    return Promise.resolve(mockOllamaEmbed(count));
  });
});

afterEach(() => {
  // Restore real fetch
  _setFetchImpl((url, init) => fetch(url, init));
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("storeDecision", () => {
  // ── 1. Basic storage ───────────────────────────────────────────────────────

  describe("basic storage", () => {
    test("stores a new decision and returns expected result shape", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use TypeScript",
        choice: "TypeScript over JavaScript",
        context: "Need type safety for a large codebase",
        rationale: "Catches bugs at compile time, better IDE support, self-documenting",
        tier: 3,
        decision_type: "convention",
        tags: "|typescript|",
      }, config);

      expect(typeof result.decision_id).toBe("string");
      expect(result.decision_id.length).toBe(26); // ULID length
      expect(result.tier).toBe(3);
      expect(result.tier_name).toBe("execution");
      expect(result.status).toBe("active");
      expect(typeof result.created_at).toBe("string");
      expect(typeof result.has_precedent).toBe("boolean");
    });

    test("stores decision with correct fields in database", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use LanceDB for vector storage",
        choice: "LanceDB",
        context: "Need a vector database that works with TypeScript",
        rationale: "Native TypeScript support, local-first, no external service needed",
        tier: 1,
        decision_type: "architectural",
        tags: "|database|vector|",
        phase: "phase-1",
      }, config);

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("decisions");
      const rows = await table.query().toArray();
      const decisionRows = rows.filter((r) => r.decision_id === result.decision_id);

      expect(decisionRows.length).toBe(1);
      const row = decisionRows[0];
      expect(row.project_id).toBe("test-proj");
      expect(row.subject).toBe("Use LanceDB for vector storage");
      expect(row.choice).toBe("LanceDB");
      expect(row.context).toBe("Need a vector database that works with TypeScript");
      expect(row.rationale).toBe("Native TypeScript support, local-first, no external service needed");
      expect(row.tier).toBe(1);
      expect(row.tier_name).toBe("architecture");
      expect(row.decision_type).toBe("architectural");
      expect(row.status).toBe("active");
      expect(row.actor).toBe("agent");
      expect(row.phase).toBe("phase-1");
      expect(row.tags).toBe("|database|vector|");
      expect(row.superseded_by).toBeNull();
    });

    test("tier_name is correctly derived from tier number", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const tier0 = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Product vision",
        choice: "B2B SaaS",
        context: "Market analysis",
        rationale: "Better margins and retention",
        tier: 0,
        decision_type: "architectural",
      }, config);
      expect(tier0.tier_name).toBe("product_strategy");

      const tier2 = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Module structure",
        choice: "Feature-first folders",
        context: "Need to organize code by domain",
        rationale: "Easier to navigate, cohesion by feature",
        tier: 2,
        decision_type: "module",
      }, config);
      expect(tier2.tier_name).toBe("functional_design");
    });

    test("has_precedent returns false when no similar decisions exist", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "First decision ever",
        choice: "Something new",
        context: "Brand new project",
        rationale: "No precedent exists yet",
        tier: 3,
        decision_type: "convention",
      }, config);

      expect(result.has_precedent).toBe(false);
    });
  });

  // ── 2. Embedding ───────────────────────────────────────────────────────────

  describe("embedding", () => {
    test("embeds rationale as 768-dim vector", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use Bun runtime",
        choice: "Bun over Node.js",
        context: "Need faster runtime for development",
        rationale: "Faster startup, native TypeScript support, faster test runner",
        tier: 3,
        decision_type: "tooling",
      }, config);

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("decisions");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.decision_id === result.decision_id);

      expect(row).toBeDefined();
      const vector = row?.vector;
      expect(vector !== null && vector !== undefined).toBe(true);
      expect((vector as { length: number }).length).toBe(768);
    });
  });

  // ── 3. Activity logging ────────────────────────────────────────────────────

  describe("activity logging", () => {
    test("logs activity on store", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use Zod for validation",
        choice: "Zod over Joi",
        context: "Need schema validation with TypeScript inference",
        rationale: "Best TypeScript integration, widely adopted, good error messages",
        tier: 3,
        decision_type: "tooling",
      }, config);

      const db = await lancedb.connect(tmpDir);
      const activityTable = await db.openTable("activity_log");
      const logs = await activityTable.query().toArray();

      const storeLogs = logs.filter(
        (l) => l.action === "store_decision" && l.target_id === result.decision_id,
      );
      expect(storeLogs.length).toBe(1);
      expect(storeLogs[0].target_type).toBe("decision");
    });
  });

  // ── 4. Supersession ────────────────────────────────────────────────────────

  describe("supersession", () => {
    test("supersedes existing decision correctly", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      // Store original decision
      const decisionA = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use Jest for testing",
        choice: "Jest",
        context: "Need a test runner",
        rationale: "Most popular, good ecosystem",
        tier: 3,
        decision_type: "tooling",
      }, config);

      expect(decisionA.status).toBe("active");

      // Store superseding decision
      const decisionB = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use Bun test for testing",
        choice: "Bun test over Jest",
        context: "Need a faster test runner with native TypeScript support",
        rationale: "Bun test is faster, has native TypeScript support, and less configuration",
        tier: 3,
        decision_type: "tooling",
        supersedes: decisionA.decision_id,
      }, config);

      expect(decisionB.status).toBe("active");

      // Verify original decision is now superseded
      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("decisions");
      const rows = await table.query().toArray();

      const oldRow = rows.find((r) => r.decision_id === decisionA.decision_id);
      expect(oldRow).toBeDefined();
      expect(oldRow?.status).toBe("superseded");
      expect(oldRow?.superseded_by).toBe(decisionB.decision_id);
    });

    test("new decision referencing supersedes points to active old decision", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const original = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "API versioning strategy",
        choice: "URL versioning",
        context: "Need to version the REST API",
        rationale: "Most visible and widely understood",
        tier: 1,
        decision_type: "architectural",
      }, config);

      const replacement = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "API versioning strategy v2",
        choice: "Header versioning",
        context: "URL versioning pollutes the route namespace",
        rationale: "Cleaner URLs, follows HTTP standards, backend can route appropriately",
        tier: 1,
        decision_type: "architectural",
        supersedes: original.decision_id,
      }, config);

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("decisions");
      const rows = await table.query().toArray();

      const originalRow = rows.find((r) => r.decision_id === original.decision_id);
      const replacementRow = rows.find((r) => r.decision_id === replacement.decision_id);

      expect(originalRow?.status).toBe("superseded");
      expect(originalRow?.superseded_by).toBe(replacement.decision_id);
      expect(replacementRow?.status).toBe("active");
      expect(replacementRow?.superseded_by).toBeNull();
    });
  });

  // ── 5. Validation errors ───────────────────────────────────────────────────

  describe("validation errors", () => {
    test("rejects invalid tier (tier 5)", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDecision(tmpDir, "test-proj", {
          project_id: "test-proj",
          subject: "Test decision",
          choice: "Something",
          context: "Some context",
          rationale: "Some rationale",
          // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
          tier: 5 as any,
          decision_type: "convention",
        }, config),
      ).rejects.toThrow();
    });

    test("rejects invalid tier (negative tier)", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDecision(tmpDir, "test-proj", {
          project_id: "test-proj",
          subject: "Test decision",
          choice: "Something",
          context: "Some context",
          rationale: "Some rationale",
          // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
          tier: -1 as any,
          decision_type: "convention",
        }, config),
      ).rejects.toThrow();
    });

    test("rejects invalid decision_type", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDecision(tmpDir, "test-proj", {
          project_id: "test-proj",
          subject: "Test decision",
          choice: "Something",
          context: "Some context",
          rationale: "Some rationale",
          tier: 3,
          // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value for test
          decision_type: "invalid_type" as any,
        }, config),
      ).rejects.toThrow();
    });

    test("rejects empty subject", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDecision(tmpDir, "test-proj", {
          project_id: "test-proj",
          subject: "",
          choice: "Something",
          context: "Some context",
          rationale: "Some rationale",
          tier: 3,
          decision_type: "convention",
        }, config),
      ).rejects.toThrow();
    });

    test("rejects empty rationale", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      await expect(
        storeDecision(tmpDir, "test-proj", {
          project_id: "test-proj",
          subject: "Some subject",
          choice: "Something",
          context: "Some context",
          rationale: "",
          tier: 3,
          decision_type: "convention",
        }, config),
      ).rejects.toThrow();
    });
  });

  // ── 6. Default values ──────────────────────────────────────────────────────

  describe("default values", () => {
    test("actor defaults to 'agent' when not specified", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use ESLint",
        choice: "ESLint over TSLint",
        context: "Need a linter",
        rationale: "TSLint is deprecated, ESLint has better ecosystem",
        tier: 3,
        decision_type: "tooling",
      }, config);

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("decisions");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.decision_id === result.decision_id);

      expect(row?.actor).toBe("agent");
    });

    test("status defaults to 'active' when not specified", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use Prettier",
        choice: "Prettier for code formatting",
        context: "Need consistent code formatting",
        rationale: "Zero config, widely adopted, reduces code review noise",
        tier: 3,
        decision_type: "tooling",
      }, config);

      expect(result.status).toBe("active");
    });

    test("tags defaults to empty string when not specified", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const result = await storeDecision(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "Use Biome",
        choice: "Biome over ESLint+Prettier",
        context: "Need unified linting and formatting",
        rationale: "Single tool, faster, written in Rust",
        tier: 3,
        decision_type: "tooling",
      }, config);

      const db = await lancedb.connect(tmpDir);
      const table = await db.openTable("decisions");
      const rows = await table.query().toArray();
      const row = rows.find((r) => r.decision_id === result.decision_id);

      expect(row?.tags).toBe("");
    });
  });

  // ── 7. All decision types ──────────────────────────────────────────────────

  describe("decision_type validation", () => {
    test("accepts all valid decision types", async () => {
      await initProject(tmpDir, "test-proj");
      const config = { ...TEST_CONFIG, db: tmpDir };

      const validTypes = ["architectural", "module", "pattern", "convention", "tooling"] as const;

      for (const decision_type of validTypes) {
        const result = await storeDecision(tmpDir, "test-proj", {
          project_id: "test-proj",
          subject: `Decision of type ${decision_type}`,
          choice: "Some choice",
          context: "Some context",
          rationale: `Rationale for ${decision_type} decision`,
          tier: 3,
          decision_type,
        }, config);
        expect(result.status).toBe("active");
      }
    });
  });
});
