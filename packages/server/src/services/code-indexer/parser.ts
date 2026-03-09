import { extname } from "node:path";

// tree-sitter is an optional dependency (native compilation may fail on some platforms).
// Lazy-load to allow the server to start even when tree-sitter is unavailable.
let Parser: typeof import("tree-sitter").default | null = null;
let TypeScriptLang: typeof import("tree-sitter-typescript") | null = null;
let PythonLang: any = null;
let RustLang: any = null;

try {
  Parser = (await import("tree-sitter")).default;
  TypeScriptLang = await import("tree-sitter-typescript");
  PythonLang = (await import("tree-sitter-python")).default;
  RustLang = (await import("tree-sitter-rust")).default;
} catch {
  // tree-sitter not available — code indexing will be disabled
}

// Re-export SUPPORTED_EXTENSIONS from scanner for convenience
export { SUPPORTED_EXTENSIONS } from "./scanner.js";

/** Returns true if tree-sitter is available for code parsing. */
export function isTreeSitterAvailable(): boolean {
  return Parser !== null;
}

function ensureTreeSitter(): asserts Parser is NonNullable<typeof Parser> {
  if (!Parser) {
    throw new Error(
      "tree-sitter is not installed. Code indexing requires tree-sitter native binaries. " +
      "Run: cd .claude/server && bun install"
    );
  }
}

// Grammar packages expose `language: unknown` in their type definitions,
// which is incompatible with tree-sitter's `language: Language` recursive type.
// Cast via `unknown` to bridge the type mismatch — runtime behavior is correct.
type AnyLanguage = any;
function asLang(lang: unknown): AnyLanguage {
  return lang as AnyLanguage;
}

// ---------------------------------------------------------------------------
// Module-level lazy parser cache (one parser per language variant)
// ---------------------------------------------------------------------------

let _tsParser: any = null;
let _tsxParser: any = null;
let _pyParser: any = null;
let _rsParser: any = null;

function getTsParser(): any {
  ensureTreeSitter();
  if (!_tsParser) {
    _tsParser = new Parser!();
    _tsParser.setLanguage(asLang(TypeScriptLang!.typescript));
  }
  return _tsParser;
}

function getTsxParser(): any {
  ensureTreeSitter();
  if (!_tsxParser) {
    _tsxParser = new Parser!();
    _tsxParser.setLanguage(asLang(TypeScriptLang!.tsx));
  }
  return _tsxParser;
}

function getPyParser(): any {
  ensureTreeSitter();
  if (!_pyParser) {
    _pyParser = new Parser!();
    _pyParser.setLanguage(asLang(PythonLang));
  }
  return _pyParser;
}

function getRsParser(): any {
  ensureTreeSitter();
  if (!_rsParser) {
    _rsParser = new Parser!();
    _rsParser.setLanguage(asLang(RustLang));
  }
  return _rsParser;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a pre-configured tree-sitter Parser for the given file path.
 *
 * Dispatch rules:
 *   .ts  → TypeScript parser
 *   .tsx → TSX parser (separate grammar from TypeScript)
 *   .py  → Python parser
 *   .rs  → Rust parser
 *   other → throws Error
 */
export function getParserForFile(filePath: string): any {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".ts":
      return getTsParser();
    case ".tsx":
      return getTsxParser();
    case ".py":
      return getPyParser();
    case ".rs":
      return getRsParser();
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
}

/**
 * Parses source code for the given file path.
 *
 * @param filePath - Used to determine which language parser to use
 * @param source   - Source code string to parse
 * @returns The parsed tree
 * @throws if the parser fails to produce a tree or the extension is unsupported
 */
export function parseSource(filePath: string, source: string): any {
  const parser = getParserForFile(filePath);
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`tree-sitter returned null tree for file: ${filePath}`);
  }
  return tree;
}
