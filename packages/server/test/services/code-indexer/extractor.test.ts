import { describe, expect, test } from "bun:test";
import Parser from "tree-sitter";
import PythonLang from "tree-sitter-python";
import RustLang from "tree-sitter-rust";
import TypeScriptLang from "tree-sitter-typescript";
import {
  buildContextHeader,
  extractSymbols,
  type SymbolExtraction,
  splitLargeChunk,
} from "../../../src/services/code-indexer/extractor";

// Helper: parse TypeScript source
function parseTS(src: string): Parser.SyntaxNode {
  const parser = new Parser();
  parser.setLanguage(TypeScriptLang.typescript);
  return parser.parse(src).rootNode;
}

// Helper: parse Python source
function parsePY(src: string): Parser.SyntaxNode {
  const parser = new Parser();
  parser.setLanguage(PythonLang);
  return parser.parse(src).rootNode;
}

// Helper: parse Rust source
function parseRS(src: string): Parser.SyntaxNode {
  const parser = new Parser();
  parser.setLanguage(RustLang);
  return parser.parse(src).rootNode;
}

// ============================================================
// Task 1: buildContextHeader
// ============================================================

describe("buildContextHeader", () => {
  test("produces correct format", () => {
    expect(buildContextHeader("src/utils.ts", "function", "greet")).toBe(
      "File: src/utils.ts | function: greet",
    );
  });

  test("handles nested scope chain", () => {
    expect(buildContextHeader("src/repo.ts", "method", "UserRepo.save")).toBe(
      "File: src/repo.ts | method: UserRepo.save",
    );
  });
});

// ============================================================
// Task 1: splitLargeChunk
// ============================================================

describe("splitLargeChunk", () => {
  test("returns symbol unchanged when within limit", () => {
    const sym: SymbolExtraction = {
      symbol_name: "small",
      symbol_type: "function",
      scope_chain: "small",
      content: "function small() {}\n".repeat(10),
      start_line: 1,
      end_line: 10,
      is_overview: false,
    };
    const result = splitLargeChunk(sym, 200);
    expect(result).toHaveLength(1);
    expect(result[0].symbol_name).toBe("small");
  });

  test("splits large symbol into parts with correct labels", () => {
    // Create a symbol with 250 lines
    const lines = Array.from({ length: 250 }, (_, i) => `  line${i + 1}();`);
    const content = `function bigFunc() {\n${lines.join("\n")}\n}`;
    const sym: SymbolExtraction = {
      symbol_name: "bigFunc",
      symbol_type: "function",
      scope_chain: "bigFunc",
      content,
      start_line: 1,
      end_line: 252,
      is_overview: false,
    };
    const result = splitLargeChunk(sym, 200);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].symbol_name).toBe("bigFunc (part 1/2)");
    expect(result[1].symbol_name).toBe("bigFunc (part 2/2)");
    // Parts have overlap (end of part 1 should overlap with start of part 2)
    expect(result[0].end_line).toBeGreaterThan(result[1].start_line - 5);
    // Preserve metadata
    expect(result[0].symbol_type).toBe("function");
    expect(result[0].scope_chain).toBe("bigFunc");
    expect(result[0].is_overview).toBe(false);
  });
});

// ============================================================
// Task 1: TypeScript extraction
// ============================================================

describe("TypeScript extractor", () => {
  test("Test 1: simple exported function", () => {
    const src = `export function greet(name: string): string { return "Hello " + name; }`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/utils.ts");
    expect(result.symbols).toHaveLength(1);
    const sym = result.symbols[0];
    expect(sym.symbol_type).toBe("function");
    expect(sym.symbol_name).toBe("greet");
    expect(sym.scope_chain).toBe("greet");
    expect(sym.start_line).toBe(1);
  });

  test("Test 2: class with methods produces overview + method chunks", () => {
    const src = `class UserRepo {
  async save(user: User): Promise<void> {
    // save logic
  }
  find(id: string): User | null {
    return null;
  }
}`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/repo.ts");
    // 1 class overview + 2 methods = 3 symbols
    expect(result.symbols).toHaveLength(3);
    const classOverview = result.symbols.find((s) => s.symbol_type === "class");
    expect(classOverview).toBeDefined();
    expect(classOverview?.symbol_name).toBe("UserRepo");
    expect(classOverview?.is_overview).toBe(true);

    const methods = result.symbols.filter((s) => s.symbol_type === "method");
    expect(methods).toHaveLength(2);
    const saveMethod = methods.find((s) => s.symbol_name === "save");
    expect(saveMethod).toBeDefined();
    expect(saveMethod?.scope_chain).toBe("UserRepo.save");
    const findMethod = methods.find((s) => s.symbol_name === "find");
    expect(findMethod).toBeDefined();
    expect(findMethod?.scope_chain).toBe("UserRepo.find");
  });

  test("Test 3: arrow function const", () => {
    const src = `const handler = async (req: Request): Promise<Response> => { return new Response("ok"); };`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/handler.ts");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("function");
    expect(result.symbols[0].symbol_name).toBe("handler");
  });

  test("Test 4: interface + type alias + enum", () => {
    const src = `interface Config { db: string; }
type Status = "active" | "inactive";
enum Color { Red, Green, Blue }
`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/types.ts");
    expect(result.symbols).toHaveLength(3);
    const iface = result.symbols.find((s) => s.symbol_type === "interface");
    expect(iface).toBeDefined();
    expect(iface?.symbol_name).toBe("Config");
    const typeAlias = result.symbols.find((s) => s.symbol_type === "type_alias");
    expect(typeAlias).toBeDefined();
    expect(typeAlias?.symbol_name).toBe("Status");
    const enumSym = result.symbols.find((s) => s.symbol_type === "enum");
    expect(enumSym).toBeDefined();
    expect(enumSym?.symbol_name).toBe("Color");
  });

  test("Test 5: import extraction", () => {
    const src = `import { foo } from "./utils";
import bar from "../lib/bar";
export { baz } from "./baz";
`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/main.ts");
    // imports should include all three module paths
    expect(result.imports).toContain("./utils");
    expect(result.imports).toContain("../lib/bar");
    expect(result.imports).toContain("./baz");
    // No symbol chunks for import statements
    expect(result.symbols.filter((s) => s.symbol_type === "import")).toHaveLength(0);
  });

  test("Test 6: private constant", () => {
    const src = `const MAX_RETRIES = 3;`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/config.ts");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("constant");
    expect(result.symbols[0].symbol_name).toBe("MAX_RETRIES");
  });

  test("Test 7: context header format in content", () => {
    const src = `function greet() {}`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/utils.ts");
    expect(result.symbols).toHaveLength(1);
    // Content should be prepended with context header
    expect(result.symbols[0].content).toContain("File: src/utils.ts | function: greet");
  });

  test("export_statement unwrapping", () => {
    const src = `export function myFunc() { return 42; }`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/lib.ts");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("function");
    expect(result.symbols[0].symbol_name).toBe("myFunc");
    expect(result.exports).toContain("myFunc");
  });

  test("export default function", () => {
    const src = `export default function handler() { return "ok"; }`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/handler.ts");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("function");
  });
});

// ============================================================
// Task 2: Python extraction
// ============================================================

describe("Python extractor", () => {
  test("function + class with methods", () => {
    const src = `
def greet(name):
    """Say hello."""
    return f"Hello {name}"

class UserService:
    """User management service."""
    def create(self, data):
        pass
    def delete(self, user_id):
        pass
`;
    const root = parsePY(src);
    const result = extractSymbols(root, src, "python", "src/service.py");
    // 1 function + 1 class overview + 2 methods = 4 symbols
    expect(result.symbols).toHaveLength(4);

    const fn = result.symbols.find((s) => s.symbol_name === "greet");
    expect(fn).toBeDefined();
    expect(fn?.symbol_type).toBe("function");
    expect(fn?.scope_chain).toBe("greet");

    const cls = result.symbols.find((s) => s.symbol_type === "class");
    expect(cls).toBeDefined();
    expect(cls?.symbol_name).toBe("UserService");
    expect(cls?.is_overview).toBe(true);

    const methods = result.symbols.filter((s) => s.symbol_type === "method");
    expect(methods).toHaveLength(2);
    const createMethod = methods.find((s) => s.symbol_name === "create");
    expect(createMethod).toBeDefined();
    expect(createMethod?.scope_chain).toBe("UserService.create");
    const deleteMethod = methods.find((s) => s.symbol_name === "delete");
    expect(deleteMethod).toBeDefined();
    expect(deleteMethod?.scope_chain).toBe("UserService.delete");
  });

  test("decorated function", () => {
    const src = `
@app.route("/api/users")
def list_users():
    pass
`;
    const root = parsePY(src);
    const result = extractSymbols(root, src, "python", "src/routes.py");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_name).toBe("list_users");
    expect(result.symbols[0].content).toContain("@app.route");
  });

  test("import extraction", () => {
    const src = `
from . import utils
from ..models import User
import os
from typing import List
`;
    const root = parsePY(src);
    const result = extractSymbols(root, src, "python", "src/module.py");
    // Should include relative imports and external imports
    expect(result.imports).toContain("os");
    expect(result.imports).toContain("typing");
    // Relative imports
    const hasRelUtilsOrDot = result.imports.some(
      (i) => i.includes("utils") || i === "." || i.startsWith("."),
    );
    expect(hasRelUtilsOrDot).toBe(true);
    const hasModels = result.imports.some((i) => i.includes("models") || i.startsWith(".."));
    expect(hasModels).toBe(true);
  });

  test("context header prepended to content", () => {
    const src = `def hello(): pass`;
    const root = parsePY(src);
    const result = extractSymbols(root, src, "python", "src/hello.py");
    expect(result.symbols[0].content).toContain("File: src/hello.py | function: hello");
  });
});

// ============================================================
// Task 2: Rust extraction
// ============================================================

describe("Rust extractor", () => {
  test("struct + impl with methods", () => {
    const src = `struct Point { x: f64, y: f64 }

impl Point {
    fn new(x: f64, y: f64) -> Self {
        Point { x, y }
    }
    fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}
`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/point.rs");
    // 1 struct overview + 1 impl overview + 2 methods = 4 symbols
    expect(result.symbols).toHaveLength(4);

    const structSym = result.symbols.find((s) => s.symbol_type === "struct");
    expect(structSym).toBeDefined();
    expect(structSym?.symbol_name).toBe("Point");
    expect(structSym?.is_overview).toBe(true);

    const implSym = result.symbols.find((s) => s.symbol_type === "impl");
    expect(implSym).toBeDefined();
    expect(implSym?.is_overview).toBe(true);

    const methods = result.symbols.filter((s) => s.symbol_type === "method");
    expect(methods).toHaveLength(2);
    const newMethod = methods.find((s) => s.symbol_name === "new");
    expect(newMethod).toBeDefined();
    expect(newMethod?.scope_chain).toBe("Point.new");
    const distanceMethod = methods.find((s) => s.symbol_name === "distance");
    expect(distanceMethod).toBeDefined();
    expect(distanceMethod?.scope_chain).toBe("Point.distance");
  });

  test("use declarations + mod", () => {
    const src = `use std::io;
use crate::models::User;
mod submodule;
`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/main.rs");
    // imports should contain use paths and mod references
    expect(result.imports).toContain("std::io");
    expect(result.imports).toContain("crate::models::User");
    expect(result.imports).toContain("submodule");
  });

  test("function item extraction", () => {
    const src = `fn hello() -> i32 { 1 }`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/lib.rs");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("function");
    expect(result.symbols[0].symbol_name).toBe("hello");
  });

  test("enum item extraction", () => {
    const src = `enum Status { Active, Inactive, Pending }`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/types.rs");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("enum");
    expect(result.symbols[0].symbol_name).toBe("Status");
  });

  test("const item extraction", () => {
    const src = `const MAX_RETRIES: u32 = 3;`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/config.rs");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("constant");
    expect(result.symbols[0].symbol_name).toBe("MAX_RETRIES");
  });

  test("trait item with methods", () => {
    const src = `trait Animal {
    fn name(&self) -> &str;
    fn sound(&self) -> &str;
}`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/traits.rs");
    // 1 trait overview + 2 method declarations
    expect(result.symbols.length).toBeGreaterThanOrEqual(1);
    const traitSym = result.symbols.find((s) => s.symbol_type === "trait");
    expect(traitSym).toBeDefined();
    expect(traitSym?.symbol_name).toBe("Animal");
  });

  test("type alias extraction", () => {
    const src = `type Result<T> = std::result::Result<T, MyError>;`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/types.rs");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbol_type).toBe("type_alias");
  });

  test("context header prepended to content", () => {
    const src = `fn hello() -> i32 { 1 }`;
    const root = parseRS(src);
    const result = extractSymbols(root, src, "rust", "src/lib.rs");
    expect(result.symbols[0].content).toContain("File: src/lib.rs | function: hello");
  });
});

// ============================================================
// Task 2: Large chunk splitting via extractSymbols
// ============================================================

describe("Large chunk splitting", () => {
  test("large function body is split into parts", () => {
    // Create 252-line function (exceeds 200 line limit)
    const lines = Array.from({ length: 250 }, (_, i) => `  const x${i} = ${i};`);
    const src = `function bigFunc() {\n${lines.join("\n")}\n}`;
    const root = parseTS(src);
    const result = extractSymbols(root, src, "typescript", "src/big.ts");
    // Should be split into at least 2 parts
    const bigFuncParts = result.symbols.filter((s) => s.symbol_name.startsWith("bigFunc"));
    expect(bigFuncParts.length).toBeGreaterThanOrEqual(2);
    expect(bigFuncParts[0].symbol_name).toMatch(/bigFunc \(part 1\/\d+\)/);
    expect(bigFuncParts[1].symbol_name).toMatch(/bigFunc \(part 2\/\d+\)/);
  });
});

// ============================================================
// Dispatch function: unsupported language
// ============================================================

describe("extractSymbols dispatch", () => {
  test("throws for unsupported language", () => {
    const parser = new Parser();
    parser.setLanguage(TypeScriptLang.typescript);
    const root = parser.parse("const x = 1;").rootNode;
    expect(() => extractSymbols(root, "const x = 1;", "go", "src/main.go")).toThrow();
  });
});
