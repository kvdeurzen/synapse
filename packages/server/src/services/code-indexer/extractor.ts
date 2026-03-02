/**
 * AST symbol extraction engine for code indexing.
 * Walks tree-sitter parse trees and extracts typed, scoped code chunks.
 *
 * Supports TypeScript/TSX, Python, and Rust.
 */

import type Parser from "tree-sitter";

// Re-export Parser's SyntaxNode type for consumers
type SyntaxNode = Parser.SyntaxNode;

// ============================================================
// Types
// ============================================================

export interface SymbolExtraction {
  symbol_name: string;
  symbol_type: string; // "function", "class", "method", "interface", "type_alias", "enum", "constant", "struct", "trait", "impl", "module"
  scope_chain: string; // dot-notation: "MyClass.save"
  content: string; // raw source text of the symbol (context header prepended by dispatch fn)
  start_line: number; // 1-based
  end_line: number; // 1-based
  is_overview: boolean; // true for class/struct/impl overview chunks (no method bodies)
}

export interface ExtractionResult {
  symbols: SymbolExtraction[];
  imports: string[]; // raw import path strings for relationship extraction
  exports: string[]; // exported symbol names
}

// ============================================================
// Helper: buildContextHeader (CODE-04)
// ============================================================

/**
 * Builds a context header for embedding.
 * Format: "File: {filePath} | {symbolType}: {scopeChain}"
 */
export function buildContextHeader(
  filePath: string,
  symbolType: string,
  scopeChain: string,
): string {
  return `File: ${filePath} | ${symbolType}: ${scopeChain}`;
}

// ============================================================
// Helper: getNodeName
// ============================================================

function getNodeName(node: SyntaxNode): string {
  // Try direct name field
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  // For arrow functions inside lexical_declaration, name comes from parent declarator
  if (node.type === "arrow_function" && node.parent) {
    const parent = node.parent;
    if (parent.type === "variable_declarator") {
      const varName = parent.childForFieldName("name");
      if (varName) return varName.text;
    }
  }

  return "<anonymous>";
}

// ============================================================
// Helper: splitLargeChunk
// ============================================================

/**
 * Splits a large symbol into sequential parts with overlap.
 * If symbol fits within maxLines, returns [symbol] unchanged.
 * Otherwise splits into N parts labeled "name (part i/N)".
 */
export function splitLargeChunk(
  symbol: SymbolExtraction,
  maxLines: number = 200,
): SymbolExtraction[] {
  const totalLines = symbol.end_line - symbol.start_line + 1;
  if (totalLines <= maxLines) {
    return [symbol];
  }

  const OVERLAP = 20; // overlap in lines
  const contentLines = symbol.content.split("\n");

  // Calculate number of parts needed
  const effectiveStep = maxLines - OVERLAP;
  const numParts = Math.ceil((contentLines.length - OVERLAP) / effectiveStep);
  const parts: SymbolExtraction[] = [];

  for (let i = 0; i < numParts; i++) {
    const startIdx = i * effectiveStep;
    const endIdx = Math.min(startIdx + maxLines, contentLines.length);
    const partContent = contentLines.slice(startIdx, endIdx).join("\n");
    const partStartLine = symbol.start_line + startIdx;
    const partEndLine = symbol.start_line + endIdx - 1;

    parts.push({
      symbol_name: `${symbol.symbol_name} (part ${i + 1}/${numParts})`,
      symbol_type: symbol.symbol_type,
      scope_chain: symbol.scope_chain,
      content: partContent,
      start_line: partStartLine,
      end_line: partEndLine,
      is_overview: false,
    });
  }

  return parts;
}

// ============================================================
// TypeScript extractor
// ============================================================

function extractTypeScript(root: SyntaxNode, source: string): ExtractionResult {
  const symbols: SymbolExtraction[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  function processNode(node: SyntaxNode, parentScope: string): void {
    switch (node.type) {
      case "function_declaration": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "function",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "class_declaration": {
        const className = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${className}` : className;

        // Emit overview chunk
        symbols.push({
          symbol_name: className,
          symbol_type: "class",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: true,
        });

        // Walk class body for methods
        const classBody = node.namedChildren.find((c) => c.type === "class_body");
        if (classBody) {
          for (const child of classBody.namedChildren) {
            if (child.type === "method_definition") {
              const methodName = getNodeName(child);
              symbols.push({
                symbol_name: methodName,
                symbol_type: "method",
                scope_chain: `${scopeChain}.${methodName}`,
                content: source.slice(child.startIndex, child.endIndex),
                start_line: child.startPosition.row + 1,
                end_line: child.endPosition.row + 1,
                is_overview: false,
              });
            }
          }
        }
        break;
      }

      case "lexical_declaration": {
        // Check if the declaration has an arrow_function initializer
        for (const declarator of node.namedChildren) {
          if (declarator.type === "variable_declarator") {
            const value = declarator.childForFieldName("value");
            if (value && value.type === "arrow_function") {
              const varNameNode = declarator.childForFieldName("name");
              const name = varNameNode ? varNameNode.text : "<anonymous>";
              const scopeChain = parentScope ? `${parentScope}.${name}` : name;
              symbols.push({
                symbol_name: name,
                symbol_type: "function",
                scope_chain: scopeChain,
                content: source.slice(node.startIndex, node.endIndex),
                start_line: node.startPosition.row + 1,
                end_line: node.endPosition.row + 1,
                is_overview: false,
              });
            } else {
              // It's a constant declaration
              const varNameNode = declarator.childForFieldName("name");
              const name = varNameNode ? varNameNode.text : "<anonymous>";
              const scopeChain = parentScope ? `${parentScope}.${name}` : name;
              symbols.push({
                symbol_name: name,
                symbol_type: "constant",
                scope_chain: scopeChain,
                content: source.slice(node.startIndex, node.endIndex),
                start_line: node.startPosition.row + 1,
                end_line: node.endPosition.row + 1,
                is_overview: false,
              });
            }
          }
        }
        break;
      }

      case "interface_declaration": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "interface",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "type_alias_declaration": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "type_alias",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "enum_declaration": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "enum",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "export_statement": {
        // Extract module path for re-exports: export { x } from './y'
        const sourceStr = node.namedChildren.find((c) => c.type === "string");
        if (sourceStr) {
          // Re-export with source: export { baz } from "./baz"
          imports.push(source.slice(sourceStr.startIndex + 1, sourceStr.endIndex - 1));
        }

        // Check if this is "export default"
        const isDefault = node.children.some(
          (c) => c.type === "default",
        );

        // Unwrap the declaration inside export_statement
        for (const child of node.namedChildren) {
          if (
            child.type === "function_declaration" ||
            child.type === "class_declaration" ||
            child.type === "interface_declaration" ||
            child.type === "type_alias_declaration" ||
            child.type === "enum_declaration" ||
            child.type === "lexical_declaration"
          ) {
            processNode(child, parentScope);
            // Track as export
            const name = getNodeName(child);
            if (name && name !== "<anonymous>") {
              exports.push(isDefault ? "default" : name);
            }
          } else if (child.type === "export_clause") {
            // export { foo, bar }
            for (const specifier of child.namedChildren) {
              if (specifier.type === "export_specifier") {
                const exportedName = specifier.childForFieldName("name")?.text;
                if (exportedName) exports.push(exportedName);
              }
            }
          } else if (child.type === "identifier" && isDefault) {
            // export default someIdentifier;
            exports.push("default");
          }
        }
        break;
      }

      case "import_statement": {
        // Extract module path string
        const sourceStr = node.namedChildren.find((c) => c.type === "string");
        if (sourceStr) {
          imports.push(source.slice(sourceStr.startIndex + 1, sourceStr.endIndex - 1));
        }
        // Do NOT create a symbol chunk for imports
        break;
      }

      default:
        break;
    }
  }

  // Walk top-level children
  for (const node of root.namedChildren) {
    processNode(node, "");
  }

  return { symbols, imports, exports };
}

// ============================================================
// Python extractor
// ============================================================

function extractPython(root: SyntaxNode, source: string): ExtractionResult {
  const symbols: SymbolExtraction[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  function processNode(node: SyntaxNode, parentScope: string): void {
    switch (node.type) {
      case "function_definition": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        const symbolType = parentScope ? "method" : "function";
        symbols.push({
          symbol_name: name,
          symbol_type: symbolType,
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "class_definition": {
        const className = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${className}` : className;

        // Emit overview chunk
        symbols.push({
          symbol_name: className,
          symbol_type: "class",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: true,
        });

        // Walk class body for methods
        const classBody = node.childForFieldName("body");
        if (classBody) {
          for (const child of classBody.namedChildren) {
            if (child.type === "function_definition") {
              processNode(child, scopeChain);
            } else if (child.type === "decorated_definition") {
              // Handle decorated methods inside class
              const innerFunc = child.namedChildren.find(
                (c) => c.type === "function_definition",
              );
              if (innerFunc) {
                const methodName = getNodeName(innerFunc);
                const methodScopeChain = `${scopeChain}.${methodName}`;
                symbols.push({
                  symbol_name: methodName,
                  symbol_type: "method",
                  scope_chain: methodScopeChain,
                  content: source.slice(child.startIndex, child.endIndex),
                  start_line: child.startPosition.row + 1,
                  end_line: child.endPosition.row + 1,
                  is_overview: false,
                });
              }
            }
          }
        }
        break;
      }

      case "decorated_definition": {
        // Unwrap: get the function_definition or class_definition inside
        const inner = node.namedChildren.find(
          (c) =>
            c.type === "function_definition" || c.type === "class_definition",
        );
        if (inner) {
          const name = getNodeName(inner);
          const scopeChain = parentScope ? `${parentScope}.${name}` : name;
          const isClass = inner.type === "class_definition";

          if (isClass) {
            // Overview chunk for decorated class
            symbols.push({
              symbol_name: name,
              symbol_type: "class",
              scope_chain: scopeChain,
              content: source.slice(node.startIndex, node.endIndex), // includes decorator
              start_line: node.startPosition.row + 1,
              end_line: node.endPosition.row + 1,
              is_overview: true,
            });
            // Walk class body for methods
            const classBody = inner.childForFieldName("body");
            if (classBody) {
              for (const child of classBody.namedChildren) {
                if (child.type === "function_definition") {
                  processNode(child, scopeChain);
                }
              }
            }
          } else {
            // Decorated function
            symbols.push({
              symbol_name: name,
              symbol_type: parentScope ? "method" : "function",
              scope_chain: scopeChain,
              content: source.slice(node.startIndex, node.endIndex), // includes decorator
              start_line: node.startPosition.row + 1,
              end_line: node.endPosition.row + 1,
              is_overview: false,
            });
          }
        }
        break;
      }

      case "import_statement": {
        // plain `import foo` or `import foo, bar`
        for (const child of node.namedChildren) {
          if (child.type === "dotted_name" || child.type === "identifier") {
            imports.push(child.text);
          } else if (child.type === "aliased_import") {
            const name = child.namedChildren.find(
              (c) => c.type === "dotted_name" || c.type === "identifier",
            );
            if (name) imports.push(name.text);
          }
        }
        break;
      }

      case "import_from_statement": {
        // from X import Y
        // First named child is the module reference (dotted_name or relative_import)
        const moduleNode = node.namedChildren[0];
        if (moduleNode) {
          if (moduleNode.type === "relative_import") {
            // from . import utils OR from ..models import User
            // Get the dots and the optional module name
            let relPath = "";
            for (const c of moduleNode.children) {
              if (c.type === "import_prefix") {
                relPath += c.text; // e.g., "." or ".."
              } else if (c.type === "dotted_name") {
                relPath += c.text; // e.g., "models"
              }
            }
            if (!relPath) relPath = ".";
            imports.push(relPath);
          } else if (
            moduleNode.type === "dotted_name" ||
            moduleNode.type === "identifier"
          ) {
            imports.push(moduleNode.text);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // Walk top-level children
  for (const node of root.namedChildren) {
    processNode(node, "");
  }

  return { symbols, imports, exports };
}

// ============================================================
// Rust extractor
// ============================================================

function extractRust(root: SyntaxNode, source: string): ExtractionResult {
  const symbols: SymbolExtraction[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  function processNode(node: SyntaxNode, parentScope: string): void {
    switch (node.type) {
      case "function_item": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        const symbolType = parentScope ? "method" : "function";
        symbols.push({
          symbol_name: name,
          symbol_type: symbolType,
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "struct_item": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "struct",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: true,
        });
        break;
      }

      case "enum_item": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "enum",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "trait_item": {
        const traitName = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${traitName}` : traitName;

        // Emit trait overview chunk
        symbols.push({
          symbol_name: traitName,
          symbol_type: "trait",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: true,
        });

        // Walk trait body for function items (method declarations)
        const traitBody = node.namedChildren.find(
          (c) => c.type === "declaration_list",
        );
        if (traitBody) {
          for (const child of traitBody.namedChildren) {
            if (child.type === "function_item") {
              const methodName = getNodeName(child);
              symbols.push({
                symbol_name: methodName,
                symbol_type: "method",
                scope_chain: `${scopeChain}.${methodName}`,
                content: source.slice(child.startIndex, child.endIndex),
                start_line: child.startPosition.row + 1,
                end_line: child.endPosition.row + 1,
                is_overview: false,
              });
            }
          }
        }
        break;
      }

      case "impl_item": {
        // Determine the impl name: "impl X" or "impl Trait for X"
        let implName = "";
        const typeNode = node.childForFieldName("type");
        const traitNode = node.childForFieldName("trait");
        if (traitNode && typeNode) {
          implName = `${typeNode.text} for ${traitNode.text}`;
        } else if (typeNode) {
          implName = typeNode.text;
        } else {
          // Fallback: find type nodes in children
          const firstType = node.namedChildren.find(
            (c) => c.type === "type_identifier" || c.type === "generic_type",
          );
          implName = firstType ? firstType.text : "<impl>";
        }

        // Use the implementing type as the scope for methods
        // For "impl Point for Display" or "impl Point", the scope is "Point"
        const scopeName = typeNode ? typeNode.text : implName;
        const scopeChain = parentScope ? `${parentScope}.${scopeName}` : scopeName;

        // Emit impl overview chunk
        symbols.push({
          symbol_name: implName,
          symbol_type: "impl",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: true,
        });

        // Walk impl body for function items
        const implBody = node.namedChildren.find(
          (c) => c.type === "declaration_list",
        );
        if (implBody) {
          for (const child of implBody.namedChildren) {
            if (child.type === "function_item") {
              const methodName = getNodeName(child);
              symbols.push({
                symbol_name: methodName,
                symbol_type: "method",
                scope_chain: `${scopeChain}.${methodName}`,
                content: source.slice(child.startIndex, child.endIndex),
                start_line: child.startPosition.row + 1,
                end_line: child.endPosition.row + 1,
                is_overview: false,
              });
            }
          }
        }
        break;
      }

      case "type_item": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "type_alias",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "const_item":
      case "static_item": {
        const name = getNodeName(node);
        const scopeChain = parentScope ? `${parentScope}.${name}` : name;
        symbols.push({
          symbol_name: name,
          symbol_type: "constant",
          scope_chain: scopeChain,
          content: source.slice(node.startIndex, node.endIndex),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          is_overview: false,
        });
        break;
      }

      case "use_declaration": {
        // Extract the use path text, strip "use " and trailing ";"
        const text = node.text.replace(/^use\s+/, "").replace(/;$/, "").trim();
        imports.push(text);
        break;
      }

      case "mod_item": {
        const modNameNode = node.childForFieldName("name");
        const modName = modNameNode ? modNameNode.text : "";
        // Check if mod has a body
        const body = node.namedChildren.find(
          (c) => c.type === "declaration_list",
        );
        if (!body) {
          // mod submodule; — file reference, add to imports
          if (modName) imports.push(modName);
        } else {
          // Inline mod with body — recurse as a scope container
          if (modName) {
            const modScope = parentScope
              ? `${parentScope}.${modName}`
              : modName;
            for (const child of body.namedChildren) {
              processNode(child, modScope);
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // Walk top-level children
  for (const node of root.namedChildren) {
    processNode(node, "");
  }

  return { symbols, imports, exports };
}

// ============================================================
// Main dispatch function: extractSymbols
// ============================================================

/**
 * Extracts symbols from a parsed AST.
 * Dispatches to the appropriate language-specific extractor.
 * Applies large chunk splitting and prepends context headers.
 *
 * @param root - The root SyntaxNode from tree-sitter parse
 * @param source - The original source code string
 * @param language - "typescript" | "python" | "rust"
 * @param filePath - Relative file path for context headers
 */
export function extractSymbols(
  root: SyntaxNode,
  source: string,
  language: string,
  filePath: string,
): ExtractionResult {
  let result: ExtractionResult;

  switch (language) {
    case "typescript":
      result = extractTypeScript(root, source);
      break;
    case "python":
      result = extractPython(root, source);
      break;
    case "rust":
      result = extractRust(root, source);
      break;
    default:
      throw new Error(`Unsupported language: ${language}`);
  }

  // Apply large chunk splitting and prepend context headers
  const processedSymbols: SymbolExtraction[] = [];
  for (const sym of result.symbols) {
    // Split if too large
    const parts = splitLargeChunk(sym);
    for (const part of parts) {
      // Prepend context header to content
      const header = buildContextHeader(filePath, part.symbol_type, part.scope_chain);
      processedSymbols.push({
        ...part,
        content: `${header}\n\n${part.content}`,
      });
    }
  }

  return {
    symbols: processedSymbols,
    imports: result.imports,
    exports: result.exports,
  };
}
