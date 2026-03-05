import { describe, expect, test } from "bun:test";
import { escapeSQL } from "../../src/db/sql-helpers.js";

describe("escapeSQL", () => {
  test("escapes a single quote in a string", () => {
    expect(escapeSQL("it's a test")).toBe("it''s a test");
  });

  test("returns a string with no quotes unchanged", () => {
    expect(escapeSQL("no quotes")).toBe("no quotes");
  });

  test("preserves double-escaping (existing double quotes)", () => {
    expect(escapeSQL("a''b")).toBe("a''''b");
  });

  test("handles empty string", () => {
    expect(escapeSQL("")).toBe("");
  });

  test("handles multiple single quotes", () => {
    expect(escapeSQL("it's a user's input")).toBe("it''s a user''s input");
  });
});
