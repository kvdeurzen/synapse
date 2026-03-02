import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { countTokens } from "gpt-tokenizer";

// Re-export countTokens for convenience (cl100k_base BPE encoding)
export { countTokens };

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ChunkResult {
  content: string; // Context-prefixed chunk text
  header: string; // Section header extracted or document title
  tokenCount: number; // BPE token count via gpt-tokenizer
  chunkIndex: number; // 0-based position in document
}

export type ChunkStrategy = "semantic_section" | "paragraph" | "fixed_size";

// ────────────────────────────────────────────────────────────────────────────
// Category-to-strategy mapping (hardcoded per user decision)
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_STRATEGY_MAP: Record<string, ChunkStrategy> = {
  // semantic_section — markdown-structured with headers
  plan: "semantic_section",
  task_spec: "semantic_section",
  requirement: "semantic_section",
  technical_context: "semantic_section",
  architecture_decision: "semantic_section",
  design_pattern: "semantic_section",
  research: "semantic_section",
  // paragraph — prose-heavy, paragraph boundaries are natural units
  learning: "paragraph",
  change_record: "paragraph",
  glossary: "paragraph",
  // fixed_size — short entries, no natural boundaries
  code_pattern: "fixed_size",
  dependency: "fixed_size",
};

export function getCategoryStrategy(category: string): ChunkStrategy {
  return CATEGORY_STRATEGY_MAP[category] ?? "semantic_section";
}

// ────────────────────────────────────────────────────────────────────────────
// Private helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract the first markdown header from a chunk of text.
 * Returns null if no header is found.
 */
function extractSectionHeader(text: string): string | null {
  const match = text.match(/^#{1,6}\s+(.+)$/m);
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Split content by paragraph boundaries (double newlines) with overlap.
 */
function splitByParagraph(content: string, maxChars: number, overlap: number): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep the last `overlap` characters of current chunk
      const overlapText = current.slice(-overlap);
      current = `${overlapText}\n\n${para}`;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }
  return chunks;
}

/**
 * Split content at fixed character count boundaries with overlap.
 */
function splitFixedSize(content: string, maxChars: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(start + maxChars, content.length);
    chunks.push(content.slice(start, end));
    if (end >= content.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────

/**
 * Chunk a document into overlapping, context-prefixed segments.
 *
 * Strategy is selected based on category:
 * - semantic_section: uses RecursiveCharacterTextSplitter for markdown
 * - paragraph: splits on double-newline boundaries
 * - fixed_size: splits at character count boundaries
 *
 * Every chunk is prefixed with: "Document: {title} | Section: {header}"
 */
export async function chunkDocument(
  title: string,
  content: string,
  category: string,
): Promise<ChunkResult[]> {
  const strategy = getCategoryStrategy(category);

  let rawChunks: string[];

  if (strategy === "semantic_section") {
    const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
      chunkSize: 2000,
      chunkOverlap: 200,
    });
    const docs = await splitter.createDocuments([content]);
    rawChunks = docs.map((d) => d.pageContent);
  } else if (strategy === "paragraph") {
    rawChunks = splitByParagraph(content, 2000, 200);
  } else {
    rawChunks = splitFixedSize(content, 2000, 200);
  }

  // If content is too short to chunk, return it as a single chunk
  if (rawChunks.length === 0) {
    rawChunks = [content];
  }

  return rawChunks.map((chunk, index) => {
    const header = extractSectionHeader(chunk) ?? title;
    const contextPrefix = `Document: ${title} | Section: ${header}`;
    const prefixed = `${contextPrefix}\n\n${chunk}`;
    return {
      content: prefixed,
      header,
      tokenCount: countTokens(prefixed),
      chunkIndex: index,
    };
  });
}
