import { extname } from "node:path";
import Parser from "tree-sitter";
import PythonLang from "tree-sitter-python";
import RustLang from "tree-sitter-rust";
import TypeScriptLang from "tree-sitter-typescript";

// Re-export SUPPORTED_EXTENSIONS from scanner for convenience
export { SUPPORTED_EXTENSIONS } from "./scanner.js";

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
    _tsParser = new Parser();
    _tsParser.setLanguage(asLang(TypeScriptLang.typescript));
  }
  return _tsParser;
}

function getTsxParser(): Parser {
  if (!_tsxParser) {
    _tsxParser = new Parser();
    _tsxParser.setLanguage(asLang(TypeScriptLang.tsx));
  }
  return _tsxParser;
}

function getPyParser(): Parser {
  if (!_pyParser) {
    _pyParser = new Parser();
    _pyParser.setLanguage(asLang(PythonLang));
  }
  return _pyParser;
}

function getRsParser(): Parser {
  if (!_rsParser) {
    _rsParser = new Parser();
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
 */
export function parseSource(filePath: string, source: string): Parser.Tree {
  const parser = getParserForFile(filePath);
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`tree-sitter returned null tree for file: ${filePath}`);
  }
  return tree;
}
