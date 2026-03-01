import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { insertBatch } from "../../src/db/batch.js";
import { DecisionRowSchema } from "../../src/db/schema.js";
import { initProject } from "../../src/tools/init-project.js";
import { queryDecisions } from "../../src/tools/query-decisions.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Insert a decision directly into the decisions table (bypassing embed).
 * Allows testing query logic without needing Ollama.
 */
async function insertTestDecision(
  dbPath: string,
  overrides: Partial<{
    decision_id: string;
    project_id: string;
    subject: string;
    context: string;
    rationale: string;
    choice: string;
    tier: number;
    tier_name: string;
    decision_type: string;
    status: string;
    actor: string;
    phase: string | null;
    tags: string;
    superseded_by: string | null;
    created_at: string;
    updated_at: string;
  }>,
): Promise<string> {
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable("decisions");

  const now = new Date().toISOString();
  const decision_id = overrides.decision_id ?? `TEST-${Date.now()}-${Math.random()}`;

  const row = {
    decision_id,
    project_id: overrides.project_id ?? "test-proj",
    subject: overrides.subject ?? "Test decision subject",
    context: overrides.context ?? "Test context",
    rationale: overrides.rationale ?? "Test rationale",
    choice: overrides.choice ?? "Test choice",
    tier: overrides.tier ?? 3,
    tier_name: overrides.tier_name ?? "execution",
    decision_type: overrides.decision_type ?? "convention",
    status: overrides.status ?? "active",
    actor: overrides.actor ?? "agent",
    phase: overrides.phase ?? null,
    tags: overrides.tags ?? "",
    superseded_by: overrides.superseded_by ?? null,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    vector: null,
  };

  await insertBatch(table, [row], DecisionRowSchema);
  return decision_id;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "query-decisions-test-"));
  await initProject(tmpDir, "test-proj");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("queryDecisions", () => {
  // ── 1. Basic query with no filters ─────────────────────────────────────────

  describe("no filter queries", () => {
    test("returns all active decisions with no filters", async () => {
      await insertTestDecision(tmpDir, { subject: "Decision A", status: "active" });
      await insertTestDecision(tmpDir, { subject: "Decision B", status: "active" });
      await insertTestDecision(tmpDir, { subject: "Decision C", status: "superseded" });

      const result = await queryDecisions(tmpDir, "test-proj", { project_id: "test-proj" });

      expect(result.results.length).toBe(2);
      expect(result.total).toBe(2);
      const subjects = result.results.map((r) => r.subject);
      expect(subjects).toContain("Decision A");
      expect(subjects).toContain("Decision B");
    });

    test("excludes superseded and revoked decisions by default", async () => {
      await insertTestDecision(tmpDir, { subject: "Active decision", status: "active" });
      await insertTestDecision(tmpDir, { subject: "Superseded decision", status: "superseded" });
      await insertTestDecision(tmpDir, { subject: "Revoked decision", status: "revoked" });

      const result = await queryDecisions(tmpDir, "test-proj", { project_id: "test-proj" });

      expect(result.results.length).toBe(1);
      expect(result.results[0].subject).toBe("Active decision");
    });

    test("returns empty results when no decisions exist", async () => {
      const result = await queryDecisions(tmpDir, "test-proj", { project_id: "test-proj" });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ── 2. Tier filter ─────────────────────────────────────────────────────────

  describe("tier filter", () => {
    test("filters by tier", async () => {
      await insertTestDecision(tmpDir, { subject: "Tier 0 decision", tier: 0, tier_name: "product_strategy" });
      await insertTestDecision(tmpDir, { subject: "Tier 1 decision", tier: 1, tier_name: "architecture" });
      await insertTestDecision(tmpDir, { subject: "Tier 2 decision", tier: 2, tier_name: "functional_design" });

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        tier: 1,
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].subject).toBe("Tier 1 decision");
      expect(result.results[0].tier).toBe(1);
    });
  });

  // ── 3. Status filter ───────────────────────────────────────────────────────

  describe("status filter", () => {
    test("filters by status", async () => {
      await insertTestDecision(tmpDir, { subject: "Active decision", status: "active" });
      await insertTestDecision(tmpDir, { subject: "Superseded decision", status: "superseded" });
      await insertTestDecision(tmpDir, { subject: "Revoked decision", status: "revoked" });

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        status: "superseded",
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].subject).toBe("Superseded decision");
    });

    test("includes inactive when include_inactive is true", async () => {
      await insertTestDecision(tmpDir, { subject: "Active decision", status: "active" });
      await insertTestDecision(tmpDir, { subject: "Superseded decision", status: "superseded" });
      await insertTestDecision(tmpDir, { subject: "Revoked decision", status: "revoked" });

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        include_inactive: true,
      });

      expect(result.results.length).toBe(3);
    });
  });

  // ── 4. Decision type filter ────────────────────────────────────────────────

  describe("decision_type filter", () => {
    test("filters by decision_type", async () => {
      await insertTestDecision(tmpDir, { subject: "Architectural decision", decision_type: "architectural" });
      await insertTestDecision(tmpDir, { subject: "Convention decision", decision_type: "convention" });
      await insertTestDecision(tmpDir, { subject: "Tooling decision", decision_type: "tooling" });

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        decision_type: "tooling",
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].subject).toBe("Tooling decision");
      expect(result.results[0].decision_type).toBe("tooling");
    });
  });

  // ── 5. Subject filter ──────────────────────────────────────────────────────

  describe("subject filter", () => {
    test("filters by subject substring (case-insensitive)", async () => {
      await insertTestDecision(tmpDir, { subject: "Use TypeScript for type safety" });
      await insertTestDecision(tmpDir, { subject: "Adopt React for the frontend" });
      await insertTestDecision(tmpDir, { subject: "TypeScript strict mode policy" });

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        subject: "typescript",
      });

      expect(result.results.length).toBe(2);
      const subjects = result.results.map((r) => r.subject);
      expect(subjects).toContain("Use TypeScript for type safety");
      expect(subjects).toContain("TypeScript strict mode policy");
    });
  });

  // ── 6. Tags filter ─────────────────────────────────────────────────────────

  describe("tags filter", () => {
    test("filters by tags", async () => {
      await insertTestDecision(tmpDir, { subject: "TS decision", tags: "|typescript|backend|" });
      await insertTestDecision(tmpDir, { subject: "React decision", tags: "|react|frontend|" });
      await insertTestDecision(tmpDir, { subject: "TS Frontend", tags: "|typescript|frontend|" });

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        tags: "typescript",
      });

      expect(result.results.length).toBe(2);
      const subjects = result.results.map((r) => r.subject);
      expect(subjects).toContain("TS decision");
      expect(subjects).toContain("TS Frontend");
    });
  });

  // ── 7. Multiple filters (AND logic) ────────────────────────────────────────

  describe("multiple filters", () => {
    test("applies AND logic when multiple filters provided", async () => {
      await insertTestDecision(tmpDir, {
        subject: "TypeScript architecture",
        tier: 1,
        tier_name: "architecture",
        decision_type: "architectural",
      });
      await insertTestDecision(tmpDir, {
        subject: "TypeScript convention",
        tier: 3,
        tier_name: "execution",
        decision_type: "convention",
      });
      await insertTestDecision(tmpDir, {
        subject: "React architecture",
        tier: 1,
        tier_name: "architecture",
        decision_type: "architectural",
      });

      // Filter by tier=1 AND decision_type=architectural — should return 2 results
      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        tier: 1,
        decision_type: "architectural",
      });

      expect(result.results.length).toBe(2);
      const subjects = result.results.map((r) => r.subject);
      expect(subjects).toContain("TypeScript architecture");
      expect(subjects).toContain("React architecture");
    });
  });

  // ── 8. Pagination ──────────────────────────────────────────────────────────

  describe("pagination", () => {
    test("respects limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await insertTestDecision(tmpDir, { subject: `Decision ${i}` });
      }

      const result = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        limit: 3,
      });

      expect(result.results.length).toBe(3);
      expect(result.total).toBe(3);
    });

    test("respects offset parameter for pagination", async () => {
      // Insert with distinct created_at to ensure stable order
      const base = new Date("2026-01-01T00:00:00Z");
      for (let i = 0; i < 5; i++) {
        const created_at = new Date(base.getTime() + i * 1000).toISOString();
        await insertTestDecision(tmpDir, {
          subject: `Decision ${i}`,
          created_at,
          updated_at: created_at,
        });
      }

      // Default sort is created_at descending, so Decision 4 is first
      const page1 = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        limit: 2,
        offset: 0,
      });
      const page2 = await queryDecisions(tmpDir, "test-proj", {
        project_id: "test-proj",
        limit: 2,
        offset: 2,
      });

      expect(page1.results.length).toBe(2);
      expect(page2.results.length).toBe(2);
      // Ensure no overlap
      const page1Ids = page1.results.map((r) => r.subject);
      const page2Ids = page2.results.map((r) => r.subject);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  // ── 9. Result shape ────────────────────────────────────────────────────────

  describe("result shape", () => {
    test("returns correct result shape with all fields", async () => {
      const id = await insertTestDecision(tmpDir, {
        subject: "Shape test decision",
        context: "Testing the shape",
        rationale: "Need to verify all fields",
        choice: "Test choice",
        tier: 2,
        tier_name: "functional_design",
        decision_type: "pattern",
        status: "active",
        actor: "human",
        phase: "phase-5",
        tags: "|testing|",
        superseded_by: null,
      });

      const result = await queryDecisions(tmpDir, "test-proj", { project_id: "test-proj" });

      expect(result.results.length).toBe(1);
      const decision = result.results[0];

      expect(decision.decision_id).toBe(id);
      expect(decision.subject).toBe("Shape test decision");
      expect(decision.context).toBe("Testing the shape");
      expect(decision.rationale).toBe("Need to verify all fields");
      expect(decision.choice).toBe("Test choice");
      expect(decision.tier).toBe(2);
      expect(decision.tier_name).toBe("functional_design");
      expect(decision.decision_type).toBe("pattern");
      expect(decision.status).toBe("active");
      expect(decision.actor).toBe("human");
      expect(decision.phase).toBe("phase-5");
      expect(decision.tags).toBe("|testing|");
      expect(decision.superseded_by).toBeNull();
      expect(typeof decision.created_at).toBe("string");
      expect(typeof decision.updated_at).toBe("string");
      // vector field should NOT be present
      expect("vector" in decision).toBe(false);
    });
  });

  // ── 10. Project isolation ──────────────────────────────────────────────────

  describe("project isolation", () => {
    test("only returns decisions for the specified project", async () => {
      await initProject(tmpDir, "other-proj");

      // Insert for other project
      const dbConn = await lancedb.connect(tmpDir);
      const table = await dbConn.openTable("decisions");
      const now = new Date().toISOString();
      await insertBatch(
        table,
        [
          {
            decision_id: "other-proj-decision",
            project_id: "other-proj",
            subject: "Other project decision",
            context: "Some context",
            rationale: "Some rationale",
            choice: "Some choice",
            tier: 3,
            tier_name: "execution",
            decision_type: "convention",
            status: "active",
            actor: "agent",
            phase: null,
            tags: "",
            superseded_by: null,
            created_at: now,
            updated_at: now,
            vector: null,
          },
        ],
        DecisionRowSchema,
      );

      // Insert for test-proj
      await insertTestDecision(tmpDir, { subject: "Test proj decision" });

      const result = await queryDecisions(tmpDir, "test-proj", { project_id: "test-proj" });

      expect(result.results.length).toBe(1);
      expect(result.results[0].subject).toBe("Test proj decision");
    });
  });
});
