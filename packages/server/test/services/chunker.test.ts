import { describe, expect, test } from "bun:test";
import { chunkDocument, countTokens, getCategoryStrategy } from "../../src/services/chunker.js";

// ────────────────────────────────────────────────────────────────────────────
// Category-to-strategy mapping
// ────────────────────────────────────────────────────────────────────────────

describe("getCategoryStrategy", () => {
  test("semantic_section categories", () => {
    expect(getCategoryStrategy("plan")).toBe("semantic_section");
    expect(getCategoryStrategy("task_spec")).toBe("semantic_section");
    expect(getCategoryStrategy("requirement")).toBe("semantic_section");
    expect(getCategoryStrategy("technical_context")).toBe("semantic_section");
    expect(getCategoryStrategy("architecture_decision")).toBe("semantic_section");
    expect(getCategoryStrategy("design_pattern")).toBe("semantic_section");
    expect(getCategoryStrategy("research")).toBe("semantic_section");
  });

  test("paragraph categories", () => {
    expect(getCategoryStrategy("learning")).toBe("paragraph");
    expect(getCategoryStrategy("change_record")).toBe("paragraph");
    expect(getCategoryStrategy("glossary")).toBe("paragraph");
  });

  test("fixed_size categories", () => {
    expect(getCategoryStrategy("code_pattern")).toBe("fixed_size");
    expect(getCategoryStrategy("dependency")).toBe("fixed_size");
  });

  test("unknown category defaults to semantic_section", () => {
    expect(getCategoryStrategy("unknown_category")).toBe("semantic_section");
    expect(getCategoryStrategy("")).toBe("semantic_section");
    expect(getCategoryStrategy("some_new_type")).toBe("semantic_section");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// semantic_section strategy
// ────────────────────────────────────────────────────────────────────────────

describe("chunkDocument — semantic_section strategy", () => {
  test("chunks a markdown document with multiple headers", async () => {
    const content = `# Introduction

This is the introduction section with some text about the project goals.

## Background

Some background information about why we are doing this project.

## Approach

The approach we will take involves several steps and considerations.

## Conclusion

In conclusion, this document outlines the plan.`;

    const chunks = await chunkDocument("Test Plan", content, "plan");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  test("each chunk has context header prefix", async () => {
    const content = "## My Section\n\nSome content here.";
    const chunks = await chunkDocument("My Title", content, "plan");
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/^Document: My Title \| Section: /);
    }
  });

  test("chunks from long document have non-zero tokenCount", async () => {
    const longContent = `# Overview\n\n${"This is a paragraph with some text. ".repeat(100)}\n\n## Details\n\n${"More detailed information here. ".repeat(100)}`;
    const chunks = await chunkDocument("Long Doc", longContent, "plan");
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });

  test("very short content returns exactly 1 chunk", async () => {
    const content = "Short content.";
    const chunks = await chunkDocument("Short Doc", content, "plan");
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  test("chunkIndex is sequential from 0", async () => {
    const longContent = `# Section A\n\n${"Text for section A. ".repeat(60)}\n\n# Section B\n\n${"Text for section B. ".repeat(60)}\n\n# Section C\n\n${"Text for section C. ".repeat(60)}`;
    const chunks = await chunkDocument("Multi Section", longContent, "plan");
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// paragraph strategy
// ────────────────────────────────────────────────────────────────────────────

describe("chunkDocument — paragraph strategy", () => {
  test("splits content with 3 paragraphs separated by double newlines", async () => {
    const content = "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.";
    const chunks = await chunkDocument("Learning Doc", content, "learning");
    // Short content — likely one chunk, but splitting occurred by paragraphs
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("context header is prefixed to each chunk", async () => {
    const content = "First paragraph.\n\nSecond paragraph.";
    const chunks = await chunkDocument("My Learning", content, "learning");
    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/^Document: My Learning \| Section: /);
    }
  });

  test("single paragraph content returns 1 chunk", async () => {
    const content = "Just one paragraph with some text.";
    const chunks = await chunkDocument("Single Para", content, "learning");
    expect(chunks.length).toBe(1);
  });

  test("long multi-paragraph content produces multiple chunks", async () => {
    // Create content with enough paragraphs to exceed the 2000-char limit
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i + 1}: ${"text ".repeat(30)}`,
    );
    const content = paragraphs.join("\n\n");
    const chunks = await chunkDocument("Long Learning", content, "learning");
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// fixed_size strategy
// ────────────────────────────────────────────────────────────────────────────

describe("chunkDocument — fixed_size strategy", () => {
  test("long content with no natural boundaries produces multiple chunks", async () => {
    // 5000 chars of continuous text
    const content = "x".repeat(5000);
    const chunks = await chunkDocument("Code Patterns", content, "code_pattern");
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("context header is prefixed to each chunk", async () => {
    const content = "a".repeat(3000);
    const chunks = await chunkDocument("Dep Doc", content, "dependency");
    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/^Document: Dep Doc \| Section: /);
    }
  });

  test("short content returns 1 chunk", async () => {
    const content = "Short fixed content.";
    const chunks = await chunkDocument("Code Doc", content, "code_pattern");
    expect(chunks.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Context header format (DOC-03)
// ────────────────────────────────────────────────────────────────────────────

describe("context header format", () => {
  test("extracts header from first markdown # line in chunk", async () => {
    const content = "## My Section\n\nSome content.";
    const chunks = await chunkDocument("Doc Title", content, "plan");
    expect(chunks[0].header).toBe("My Section");
    expect(chunks[0].content).toContain("Document: Doc Title | Section: My Section");
  });

  test("uses title as header when no markdown header found in chunk", async () => {
    const content = "Just plain text without any headers.";
    const chunks = await chunkDocument("Fallback Title", content, "plan");
    expect(chunks[0].header).toBe("Fallback Title");
    expect(chunks[0].content).toContain("Document: Fallback Title | Section: Fallback Title");
  });

  test("format is exactly Document: {title} | Section: {header}\\n\\n{content}", async () => {
    const content = "## My Header\n\nSome content here.";
    const chunks = await chunkDocument("My Doc", content, "plan");
    const expected = "Document: My Doc | Section: My Header\n\n";
    expect(chunks[0].content.startsWith(expected)).toBe(true);
  });

  test("detects h1 headers", async () => {
    const content = "# Top Level Header\n\nContent beneath.";
    const chunks = await chunkDocument("Doc", content, "plan");
    expect(chunks[0].header).toBe("Top Level Header");
  });

  test("detects h3 and deeper headers", async () => {
    const content = "### Deep Header\n\nContent beneath.";
    const chunks = await chunkDocument("Doc", content, "plan");
    expect(chunks[0].header).toBe("Deep Header");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Token counting
// ────────────────────────────────────────────────────────────────────────────

describe("token counting", () => {
  test("countTokens returns a positive number for non-empty text", () => {
    const tokens = countTokens("hello world");
    expect(tokens).toBeGreaterThan(0);
  });

  test("tokenCount in ChunkResult matches countTokens on same text", async () => {
    const content = "## Test\n\nThis is test content.";
    const chunks = await chunkDocument("Test Doc", content, "plan");
    for (const chunk of chunks) {
      const expected = countTokens(chunk.content);
      expect(chunk.tokenCount).toBe(expected);
    }
  });

  test("longer text has more tokens than shorter text", () => {
    const short = countTokens("hello");
    const long = countTokens("hello world this is a longer piece of text with many more tokens");
    expect(long).toBeGreaterThan(short);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("empty content returns 1 chunk with context header", async () => {
    const chunks = await chunkDocument("Empty Doc", "", "plan");
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("Document: Empty Doc | Section:");
  });

  test("whitespace-only content returns 1 chunk", async () => {
    const chunks = await chunkDocument("Whitespace Doc", "   \n\n   ", "plan");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  test("very long content (>10000 chars) produces multiple chunks", async () => {
    const content = `# Section\n\n${"This is a long text. ".repeat(500)}`;
    const chunks = await chunkDocument("Long Doc", content, "plan");
    expect(chunks.length).toBeGreaterThan(1);
  });
});
