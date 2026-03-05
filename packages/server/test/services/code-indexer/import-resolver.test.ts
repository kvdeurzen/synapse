/**
 * Tests for import-resolver.ts
 * Covers TypeScript, Python, and Rust import path resolution.
 */

import { describe, expect, it } from "bun:test";
import { resolveImports } from "../../../src/services/code-indexer/import-resolver";

// ============================================================
// TypeScript import resolution
// ============================================================

describe("resolveImports — TypeScript", () => {
  const fileSet = new Set([
    "src/utils.ts",
    "src/config.ts",
    "src/lib/bar.tsx",
    "src/components/index.ts",
    "src/types.ts",
    "test/helper.ts",
  ]);

  it("Test 1: resolves relative import without extension to .ts file", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/server.ts",
      imports: ["./utils"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/server.ts", to: "src/utils.ts", symbols: [] });
  });

  it("Test 2: resolves parent directory import (../config)", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/tools/store.ts",
      imports: ["../config"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/tools/store.ts", to: "src/config.ts", symbols: [] });
  });

  it("Test 3: resolves index file (./components → ./components/index.ts)", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/app.ts",
      imports: ["./components"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/app.ts", to: "src/components/index.ts", symbols: [] });
  });

  it("Test 4: resolves TSX extension (./lib/bar → ./lib/bar.tsx)", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/app.ts",
      imports: ["./lib/bar"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/app.ts", to: "src/lib/bar.tsx", symbols: [] });
  });

  it("Test 5: skips external package imports (non-relative)", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/server.ts",
      imports: ["@lancedb/lancedb"],
    });
    expect(edges).toHaveLength(0);
  });

  it("Test 6: skips non-existent local imports", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/server.ts",
      imports: ["./nonexistent"],
    });
    expect(edges).toHaveLength(0);
  });

  it("Test 7: re-export creates edge (export { foo } from './utils')", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/index.ts",
      imports: ["./utils"], // re-export paths are already in imports from extractor
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/index.ts", to: "src/utils.ts", symbols: [] });
  });

  it("deduplicates edges with same (from, to), merging symbols", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/server.ts",
      imports: ["./utils", "./utils"],
    });
    expect(edges).toHaveLength(1);
  });

  it("skips node package imports (no leading dot)", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/server.ts",
      imports: ["express", "lodash", "fs"],
    });
    expect(edges).toHaveLength(0);
  });

  it("handles multiple imports, filtering external packages", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/app.ts",
      imports: ["./utils", "express", "./config", "@types/node"],
    });
    expect(edges).toHaveLength(2);
    const tos = edges.map((e) => e.to).sort();
    expect(tos).toEqual(["src/config.ts", "src/utils.ts"]);
  });

  it("resolves file already in fileSet as-is (with extension)", () => {
    const edges = resolveImports({
      fileSet,
      language: "typescript",
      filePath: "src/app.ts",
      imports: ["./types.ts"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe("src/types.ts");
  });
});

// ============================================================
// Python import resolution
// ============================================================

describe("resolveImports — Python", () => {
  const fileSet = new Set([
    "mypackage/__init__.py",
    "mypackage/utils.py",
    "mypackage/models/user.py",
    "mypackage/models/__init__.py",
    "tests/test_main.py",
  ]);

  it("Test 1: relative import from same package (.utils → mypackage/utils.py)", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "mypackage/main.py",
      imports: [".utils"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "mypackage/main.py", to: "mypackage/utils.py", symbols: [] });
  });

  it("Test 2: relative parent import (..utils from models/user.py → mypackage/utils.py)", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "mypackage/models/user.py",
      imports: ["..utils"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      from: "mypackage/models/user.py",
      to: "mypackage/utils.py",
      symbols: [],
    });
  });

  it("Test 3: absolute import matching local package (mypackage.utils)", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "tests/test_main.py",
      imports: ["mypackage.utils"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "tests/test_main.py", to: "mypackage/utils.py", symbols: [] });
  });

  it("Test 4: external import — os is skipped", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "mypackage/main.py",
      imports: ["os"],
    });
    expect(edges).toHaveLength(0);
  });

  it("Test 4b: external import — typing is skipped", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "mypackage/main.py",
      imports: ["typing"],
    });
    expect(edges).toHaveLength(0);
  });

  it("Test 5: __init__.py resolution (.models → mypackage/models/__init__.py)", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "mypackage/main.py",
      imports: [".models"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      from: "mypackage/main.py",
      to: "mypackage/models/__init__.py",
      symbols: [],
    });
  });

  it("single dot (.) refers to current package __init__.py", () => {
    const edges = resolveImports({
      fileSet,
      language: "python",
      filePath: "mypackage/main.py",
      imports: ["."],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe("mypackage/__init__.py");
  });
});

// ============================================================
// Rust import resolution
// ============================================================

describe("resolveImports — Rust", () => {
  const fileSet = new Set([
    "src/main.rs",
    "src/lib.rs",
    "src/models.rs",
    "src/db/connection.rs",
    "src/db/mod.rs",
    "src/utils.rs",
  ]);

  it("Test 1: crate:: import resolves to src/models.rs", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/main.rs",
      imports: ["crate::models::User"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/main.rs", to: "src/models.rs", symbols: [] });
  });

  it("Test 2: crate:: with nested module (crate::db::connection → src/db/connection.rs)", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/main.rs",
      imports: ["crate::db::connection"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/main.rs", to: "src/db/connection.rs", symbols: [] });
  });

  it("Test 3: mod declaration (mod utils from src/lib.rs → src/utils.rs)", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/lib.rs",
      imports: ["utils"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/lib.rs", to: "src/utils.rs", symbols: [] });
  });

  it("Test 4: self:: import (self::connection from src/db/mod.rs → src/db/connection.rs)", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/db/mod.rs",
      imports: ["self::connection"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/db/mod.rs", to: "src/db/connection.rs", symbols: [] });
  });

  it("Test 5: external crate (std::io) — skipped", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/main.rs",
      imports: ["std::io"],
    });
    expect(edges).toHaveLength(0);
  });

  it("Test 5b: external crate (serde::Deserialize) — skipped", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/main.rs",
      imports: ["serde::Deserialize"],
    });
    expect(edges).toHaveLength(0);
  });

  it("Test 6: super:: from src/db/connection.rs resolves to src/models.rs", () => {
    // In Rust, super:: from src/db/connection.rs goes up to the parent module (src/ level).
    // super::models → src/models.rs which exists in fileSet → creates an edge.
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/db/connection.rs",
      imports: ["super::models"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/db/connection.rs", to: "src/models.rs", symbols: [] });
  });

  it("super:: import with truly non-existent target — no edge", () => {
    // super::nonexistent → src/nonexistent.rs — not in fileSet → no edge
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/db/connection.rs",
      imports: ["super::nonexistent"],
    });
    expect(edges).toHaveLength(0);
  });

  it("crate:: resolves to mod.rs fallback (crate::db → src/db/mod.rs)", () => {
    const edges = resolveImports({
      fileSet,
      language: "rust",
      filePath: "src/main.rs",
      imports: ["crate::db"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/main.rs", to: "src/db/mod.rs", symbols: [] });
  });

  it("mod declaration from subdirectory resolves to sibling mod.rs", () => {
    // From src/main.rs, mod db → src/db.rs or src/db/mod.rs
    const fileSetWithDb = new Set(["src/main.rs", "src/db/mod.rs"]);
    const edges = resolveImports({
      fileSet: fileSetWithDb,
      language: "rust",
      filePath: "src/main.rs",
      imports: ["db"],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/main.rs", to: "src/db/mod.rs", symbols: [] });
  });
});
