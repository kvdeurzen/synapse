/**
 * Import path resolver for code indexing.
 * Converts raw import strings from extractor.ts into concrete file-to-file dependency edges.
 *
 * Supports TypeScript/TSX, Python, and Rust.
 *
 * Only resolves project-local files — external packages produce no edges.
 */

import * as nodePath from "node:path";

// ============================================================
// Types
// ============================================================

export interface ImportEdge {
  from: string; // relative path of importing file (e.g., "src/server.ts")
  to: string; // relative path of imported file (e.g., "src/utils.ts")
  symbols: string[]; // imported symbol names (may be empty for `import * as X`)
}

export interface ResolveOptions {
  fileSet: Set<string>; // all known relative file paths in the project
  language: "typescript" | "python" | "rust";
  filePath: string; // relative path of the file being resolved
  imports: string[]; // raw import strings from extractor
}

// ============================================================
// Utility: normalize path separators to forward slashes
// ============================================================

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

// ============================================================
// TypeScript import resolver
// ============================================================

/**
 * Resolves a single TypeScript/TSX import path to a project-local file.
 * Returns null if not resolvable (external package or not in fileSet).
 */
export function resolveTsImport(
  importPath: string,
  filePath: string,
  fileSet: Set<string>,
): string | null {
  // Skip non-relative imports (external packages, node built-ins, @scoped)
  if (!importPath.startsWith(".")) {
    return null;
  }

  // Resolve relative to the importing file's directory
  const dir = nodePath.dirname(filePath);
  const resolved = normalizePath(nodePath.join(dir, importPath));

  // Try extensions in order
  const candidates = [
    resolved, // as-is (already has extension)
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
  ];

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ============================================================
// Python import resolver
// ============================================================

/**
 * Resolves a single Python import path to a project-local file.
 * Returns null if not resolvable (external package or not in fileSet).
 */
export function resolvePyImport(
  importPath: string,
  filePath: string,
  fileSet: Set<string>,
): string | null {
  const dir = nodePath.dirname(filePath);

  if (importPath.startsWith(".")) {
    // Relative import: count leading dots
    let dotCount = 0;
    let i = 0;
    while (i < importPath.length && importPath[i] === ".") {
      dotCount++;
      i++;
    }
    const rest = importPath.slice(dotCount); // module path after the dots

    // Base directory: current dir, then go up (dotCount - 1) levels
    let baseDir = dir;
    for (let up = 0; up < dotCount - 1; up++) {
      baseDir = nodePath.dirname(baseDir);
    }

    if (!rest) {
      // e.g., "." — refers to current package __init__.py
      const candidate = normalizePath(nodePath.join(baseDir, "__init__.py"));
      return fileSet.has(candidate) ? candidate : null;
    }

    // Replace dots in the module path with slashes
    const modulePath = rest.replace(/\./g, "/");
    const resolvedBase = normalizePath(nodePath.join(baseDir, modulePath));

    // Try .py and /__init__.py
    const candidates = [
      `${resolvedBase}.py`,
      `${resolvedBase}/__init__.py`,
    ];

    for (const candidate of candidates) {
      if (fileSet.has(candidate)) {
        return candidate;
      }
    }

    return null;
  } else {
    // Absolute import — check if it matches a local package
    const modulePath = importPath.replace(/\./g, "/");
    const candidates = [
      `${modulePath}.py`,
      `${modulePath}/__init__.py`,
    ];

    for (const candidate of candidates) {
      if (fileSet.has(candidate)) {
        return candidate;
      }
    }

    // Not found in fileSet — treat as external
    return null;
  }
}

// ============================================================
// Rust import resolver
// ============================================================

/**
 * Resolves a single Rust use declaration or mod path to a project-local file.
 * Returns null if not resolvable (external crate or not in fileSet).
 */
export function resolveRustImport(
  importPath: string,
  filePath: string,
  fileSet: Set<string>,
): string | null {
  const dir = nodePath.dirname(filePath);

  if (importPath.startsWith("crate::")) {
    // Strip "crate::" prefix
    const rest = importPath.slice("crate::".length);
    // Take only the first two segments to resolve to a file (module path)
    // e.g., "models::User" → try "src/models.rs"
    // e.g., "db::connection" → try "src/db/connection.rs"
    const segments = rest.split("::");
    // Try progressively longer path segments to find deepest match
    for (let len = segments.length; len >= 1; len--) {
      const pathPart = segments.slice(0, len).join("/");
      const resolvedBase = normalizePath(nodePath.join("src", pathPart));
      const candidates = [
        `${resolvedBase}.rs`,
        `${resolvedBase}/mod.rs`,
      ];
      for (const candidate of candidates) {
        if (fileSet.has(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  if (importPath.startsWith("self::")) {
    // Strip "self::" prefix, resolve relative to current file's directory
    const rest = importPath.slice("self::".length);
    const segments = rest.split("::");
    for (let len = segments.length; len >= 1; len--) {
      const pathPart = segments.slice(0, len).join("/");
      const resolvedBase = normalizePath(nodePath.join(dir, pathPart));
      const candidates = [
        `${resolvedBase}.rs`,
        `${resolvedBase}/mod.rs`,
      ];
      for (const candidate of candidates) {
        if (fileSet.has(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  if (importPath.startsWith("super::")) {
    // super:: in Rust refers to the parent module.
    // For a file like src/db/connection.rs, super refers to the src/db module.
    // Each super:: goes up one directory from the current file's directory.
    // Note: super from src/db/connection.rs → parent dir is src/db (the module boundary).
    let rest = importPath;
    let currentDir = dir;
    while (rest.startsWith("super::")) {
      rest = rest.slice("super::".length);
      // Each super goes up one level from currentDir
      currentDir = nodePath.dirname(currentDir);
    }

    // rest is now the path after all super:: prefixes
    // Resolve within currentDir — but don't match files in parent directories
    const segments = rest.split("::");
    for (let len = segments.length; len >= 1; len--) {
      const pathPart = segments.slice(0, len).join("/");
      const resolvedBase = normalizePath(nodePath.join(currentDir, pathPart));
      const candidates = [
        `${resolvedBase}.rs`,
        `${resolvedBase}/mod.rs`,
      ];
      for (const candidate of candidates) {
        if (fileSet.has(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  // Check if it's a simple mod name (no "::" separators, no known external prefix)
  // External crates typically have "::" in them (std::io) or are well-known names
  if (!importPath.includes("::")) {
    // Simple identifier — treat as a mod declaration resolving to sibling file
    const resolvedBase = normalizePath(nodePath.join(dir, importPath));
    const candidates = [
      `${resolvedBase}.rs`,
      `${resolvedBase}/mod.rs`,
    ];
    for (const candidate of candidates) {
      if (fileSet.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // Everything else (e.g., "std::io", "serde::Deserialize") — external
  return null;
}

// ============================================================
// Main export: resolveImports
// ============================================================

/**
 * Resolves raw import strings into file-to-file dependency edges.
 * Dispatches to the appropriate language-specific resolver.
 * Filters edges to only include files present in the project's fileSet.
 * Deduplicates edges by (from, to), merging symbols.
 */
export function resolveImports(opts: ResolveOptions): ImportEdge[] {
  const { fileSet, language, filePath, imports } = opts;

  // Map from "from|to" key → merged edge
  const edgeMap = new Map<string, ImportEdge>();

  for (const importPath of imports) {
    let resolved: string | null = null;

    switch (language) {
      case "typescript":
        resolved = resolveTsImport(importPath, filePath, fileSet);
        break;
      case "python":
        resolved = resolvePyImport(importPath, filePath, fileSet);
        break;
      case "rust":
        resolved = resolveRustImport(importPath, filePath, fileSet);
        break;
    }

    if (resolved === null) continue;
    // Double-check: only include if in fileSet
    if (!fileSet.has(resolved)) continue;

    const key = `${filePath}|${resolved}`;
    const existing = edgeMap.get(key);
    if (existing) {
      // Merge symbols (no duplicates since we don't have symbol info at this stage)
      // In future, symbols would be extracted from named imports
    } else {
      edgeMap.set(key, {
        from: filePath,
        to: resolved,
        symbols: [],
      });
    }
  }

  return Array.from(edgeMap.values());
}
