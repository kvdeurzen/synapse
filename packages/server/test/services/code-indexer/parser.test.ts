import { describe, expect, test } from "bun:test";
import Parser from "tree-sitter";
import PythonLang from "tree-sitter-python";
import RustLang from "tree-sitter-rust";
import TypeScriptLang from "tree-sitter-typescript";
import { getParserForFile, parseSource } from "../../../src/services/code-indexer/parser";

describe("tree-sitter smoke tests", () => {
  test("TypeScript parser parses a function", () => {
    const parser = new Parser();
    parser.setLanguage(TypeScriptLang.typescript);
    const tree = parser.parse("function hello() { return 1; }");
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.namedChildren.length).toBeGreaterThan(0);
  });

  test("TSX parser parses JSX", () => {
    const parser = new Parser();
    parser.setLanguage(TypeScriptLang.tsx);
    const tree = parser.parse("const App = () => <div>hello</div>;");
    expect(tree.rootNode.type).toBe("program");
  });

  test("Python parser parses a function", () => {
    const parser = new Parser();
    parser.setLanguage(PythonLang);
    const tree = parser.parse("def hello():\n    return 1\n");
    expect(tree.rootNode.type).toBe("module");
  });

  test("Rust parser parses a function", () => {
    const parser = new Parser();
    parser.setLanguage(RustLang);
    const tree = parser.parse("fn hello() -> i32 { 1 }");
    expect(tree.rootNode.type).toBe("source_file");
  });
});

describe("getParserForFile", () => {
  test("returns a parser for .ts files", () => {
    const parser = getParserForFile("src/main.ts");
    expect(parser).toBeInstanceOf(Parser);
  });

  test("returns a different parser for .tsx files", () => {
    const tsParser = getParserForFile("src/main.ts");
    const tsxParser = getParserForFile("src/App.tsx");
    // Both are Parser instances, but they use different grammars
    expect(tsxParser).toBeInstanceOf(Parser);
    expect(tsParser).not.toBe(tsxParser);
  });

  test("returns a parser for .py files", () => {
    const parser = getParserForFile("script.py");
    expect(parser).toBeInstanceOf(Parser);
  });

  test("returns a parser for .rs files", () => {
    const parser = getParserForFile("lib.rs");
    expect(parser).toBeInstanceOf(Parser);
  });

  test("throws for unsupported extension", () => {
    expect(() => getParserForFile("main.go")).toThrow("Unsupported file extension");
  });

  test("returns cached parser instances (lazy singleton per language)", () => {
    const p1 = getParserForFile("a.ts");
    const p2 = getParserForFile("b.ts");
    // Same cached instance
    expect(p1).toBe(p2);
  });
});

describe("parseSource", () => {
  test("parses TypeScript source and returns a tree with rootNode", () => {
    const tree = parseSource("test.ts", "const x = 1;");
    expect(tree).toBeDefined();
    expect(tree.rootNode).toBeDefined();
    expect(tree.rootNode.type).toBe("program");
  });

  test("parses Python source correctly", () => {
    const tree = parseSource("script.py", "def hello():\n    pass\n");
    expect(tree.rootNode.type).toBe("module");
  });

  test("parses Rust source correctly", () => {
    const tree = parseSource("lib.rs", 'fn greet() -> &\'static str { "hi" }');
    expect(tree.rootNode.type).toBe("source_file");
  });

  test("throws for unsupported extension", () => {
    expect(() => parseSource("main.go", "package main")).toThrow("Unsupported file extension");
  });
});
