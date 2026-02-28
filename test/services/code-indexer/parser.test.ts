import { describe, expect, test } from "bun:test";
import Parser from "tree-sitter";
import TypeScriptLang from "tree-sitter-typescript";
import PythonLang from "tree-sitter-python";
import RustLang from "tree-sitter-rust";

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
