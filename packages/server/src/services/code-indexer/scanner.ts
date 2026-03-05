import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import Ignore from "ignore";
import { logger } from "../../logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_EXCLUSIONS: string[] = [
  "node_modules/",
  "__pycache__/",
  "target/",
  "dist/",
  "build/",
  ".git/",
  ".next/",
  ".nuxt/",
  "coverage/",
  ".cache/",
  "vendor/",
];

export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".py", ".rs"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanOptions {
  exclude_patterns?: string[];
  include_patterns?: string[];
}

export interface FileEntry {
  /** Forward-slash separated, relative to projectRoot */
  relativePath: string;
  absolutePath: string;
  language: "typescript" | "python" | "rust";
  isTest: boolean;
}

export interface ScanResult {
  files: FileEntry[];
  files_scanned: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_FILE_PATTERNS = [
  /\.test\.[^.]+$/, // *.test.*
  /\.spec\.[^.]+$/, // *.spec.*
  /^test_/, // test_*
  /_test\.[^.]+$/, // *_test.*
];

/**
 * Returns true if the file's basename matches any test-file naming pattern.
 * Only the basename is checked — a directory named "test" does NOT count.
 */
export function isTestFile(relPath: string): boolean {
  const name = basename(relPath);
  return TEST_FILE_PATTERNS.some((re) => re.test(name));
}

function extToLanguage(ext: string): FileEntry["language"] | null {
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".rs") return "rust";
  return null;
}

// ---------------------------------------------------------------------------
// scanFiles
// ---------------------------------------------------------------------------

/**
 * Recursively scans `projectRoot` for TypeScript, TSX, Python, and Rust files.
 *
 * Filtering rules (applied in order):
 * 1. `.gitignore` at projectRoot (if present)
 * 2. DEFAULT_EXCLUSIONS
 * 3. opts.exclude_patterns (if provided)
 * 4. opts.include_patterns: if provided, only files matching at least one pattern are included
 */
export async function scanFiles(projectRoot: string, opts?: ScanOptions): Promise<ScanResult> {
  // Build ignore filter
  const ig = Ignore();

  const gitignorePath = join(projectRoot, ".gitignore");
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, "utf8"));
  }

  ig.add(DEFAULT_EXCLUSIONS);

  if (opts?.exclude_patterns && opts.exclude_patterns.length > 0) {
    ig.add(opts.exclude_patterns);
  }

  // Build include glob matchers (if provided)
  let includeGlobs: InstanceType<typeof Bun.Glob>[] | null = null;
  if (opts?.include_patterns && opts.include_patterns.length > 0) {
    includeGlobs = opts.include_patterns.map((p) => new Bun.Glob(p));
  }

  const files: FileEntry[] = [];

  // Scan all supported extensions
  const glob = new Bun.Glob("**/*.{ts,tsx,py,rs}");

  for await (const relRaw of glob.scan({ cwd: projectRoot, absolute: false })) {
    // Normalize to forward slashes (defensive for future Windows compat)
    const relPath = relRaw.replace(/\\/g, "/");

    // Apply ignore filter
    if (ig.ignores(relPath)) {
      continue;
    }

    // Apply include_patterns filter
    if (includeGlobs !== null) {
      const matchesInclude = includeGlobs.some((g) => g.match(relPath));
      if (!matchesInclude) {
        continue;
      }
    }

    // Determine language from extension
    const extPart = relPath.split(".").pop();
    if (!extPart) continue; // No extension — skip
    const ext = `.${extPart}`;
    const language = extToLanguage(ext);
    if (!language) continue; // Should not happen given the glob, but guard defensively

    const absolutePath = join(projectRoot, relPath);

    logger.debug({ file: relPath }, "Scanning file");

    files.push({
      relativePath: relPath,
      absolutePath,
      language,
      isTest: isTestFile(relPath),
    });
  }

  return {
    files,
    files_scanned: files.length,
  };
}
