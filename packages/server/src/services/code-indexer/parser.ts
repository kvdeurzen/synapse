import { createRequire } from "node:module";
import { extname } from "node:path";
import type Parser from "tree-sitter";
import { TreeSitterUnavailableError } from "../../errors.js";

// Re-export SUPPORTED_EXTENSIONS from scanner for convenience
export { SUPPORTED_EXTENSIONS } from "./scanner.js";

// Re-export so consumers can catch it without importing errors.ts directly
export { TreeSitterUnavailableError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Lazy-loaded tree-sitter modules (defense-in-depth: server starts even if
// tree-sitter native module failed to build)
// ---------------------------------------------------------------------------

const _require = createRequire(import.meta.url);

// biome-ignore lint: dynamic require returns untyped modules
let _TreeSitter: any = null;
// biome-ignore lint: dynamic require returns untyped modules
let _PythonLang: any = null;
// biome-ignore lint: dynamic require returns untyped modules
let _RustLang: any = null;
// biome-ignore lint: dynamic require returns untyped modules
let _TypeScriptLang: any = null;
let _loadAttempted = false;
let _loadError: unknown = null;

function loadTreeSitter(): void {
  if (_TreeSitter) return;
  if (_loadAttempted) throw new TreeSitterUnavailableError(_loadError);
  _loadAttempted = true;
  try {
    _TreeSitter = _require("tree-sitter");
    _PythonLang = _require("tree-sitter-python");
    _RustLang = _require("tree-sitter-rust");
    _TypeScriptLang = _require("tree-sitter-typescript");
  } catch (err) {
    _loadError = err;
    _TreeSitter = null;
    _PythonLang = null;
    _RustLang = null;
    _TypeScriptLang = null;
    throw new TreeSitterUnavailableError(err);
  }
}

// Grammar packages expose `language: unknown` in their type definitions,
// which is incompatible with tree-sitter's `language: Language` recursive type.
// Cast via `unknown` to bridge the type mismatch — runtime behavior is correct.
type AnyLanguage = Parser.Language;
function asLang(lang: unknown): AnyLanguage {
  return lang as AnyLanguage;
}

// ---------------------------------------------------------------------------
// Module-level lazy parser cache (one parser per language variant)
// ---------------------------------------------------------------------------

let _tsParser: Parser | null = null;
let _tsxParser: Parser | null = null;
let _pyParser: Parser | null = null;
let _rsParser: Parser | null = null;

function getTsParser(): Parser {
  if (!_tsParser) {
    loadTreeSitter();
    _tsParser = new _TreeSitter();
    _tsParser!.setLanguage(asLang(_TypeScriptLang.typescript));
  }
  return _tsParser!;
}

function getTsxParser(): Parser {
  if (!_tsxParser) {
    loadTreeSitter();
    _tsxParser = new _TreeSitter();
    _tsxParser!.setLanguage(asLang(_TypeScriptLang.tsx));
  }
  return _tsxParser!;
}

function getPyParser(): Parser {
  if (!_pyParser) {
    loadTreeSitter();
    _pyParser = new _TreeSitter();
    _pyParser!.setLanguage(asLang(_PythonLang));
  }
  return _pyParser!;
}

function getRsParser(): Parser {
  if (!_rsParser) {
    loadTreeSitter();
    _rsParser = new _TreeSitter();
    _rsParser!.setLanguage(asLang(_RustLang));
  }
  return _rsParser!;
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
 *
 * @throws {TreeSitterUnavailableError} if tree-sitter native module is not installed
 */
export function getParserForFile(filePath: string): Parser {
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
 * @throws {TreeSitterUnavailableError} if tree-sitter native module is not installed
 */
export function parseSource(filePath: string, source: string): Parser.Tree {
  const parser = getParserForFile(filePath);
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`tree-sitter returned null tree for file: ${filePath}`);
  }
  return tree;
}
