import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  EmbedDimensionError,
  OllamaError,
  OllamaModelNotFoundError,
  OllamaTimeoutError,
  OllamaUnreachableError,
} from "../../src/errors.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function make768Vector(seed = 1): number[] {
  return Array.from({ length: 768 }, (_, i) => (i + seed) * 0.001);
}

function make384Vector(): number[] {
  return Array.from({ length: 384 }, (_, i) => i * 0.001);
}

function make769Vector(): number[] {
  return Array.from({ length: 769 }, (_, i) => i * 0.001);
}

function mockOllamaResponse(vectors: number[][]): Response {
  return new Response(JSON.stringify({ embeddings: vectors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockHttpError(status: number, body = "error"): Response {
  return new Response(body, { status });
}

// ─── 1. Error class tests ──────────────────────────────────────────────────────

describe("Error class hierarchy", () => {
  test("OllamaError is instanceof Error", () => {
    const err = new OllamaError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.name).toBe("OllamaError");
  });

  test("OllamaUnreachableError is instanceof OllamaError", () => {
    const err = new OllamaUnreachableError("http://localhost:11434");
    expect(err).toBeInstanceOf(OllamaError);
    expect(err).toBeInstanceOf(OllamaUnreachableError);
    expect(err.name).toBe("OllamaUnreachableError");
  });

  test("OllamaUnreachableError message includes URL and actionable guidance", () => {
    const err = new OllamaUnreachableError("http://localhost:11434");
    expect(err.message).toContain("http://localhost:11434");
    expect(err.message).toContain("Run: ollama serve");
  });

  test("OllamaModelNotFoundError is instanceof OllamaError", () => {
    const err = new OllamaModelNotFoundError("nomic-embed-text");
    expect(err).toBeInstanceOf(OllamaError);
    expect(err).toBeInstanceOf(OllamaModelNotFoundError);
    expect(err.name).toBe("OllamaModelNotFoundError");
  });

  test("OllamaModelNotFoundError message includes model name and pull command", () => {
    const err = new OllamaModelNotFoundError("nomic-embed-text");
    expect(err.message).toContain("nomic-embed-text");
    expect(err.message).toContain("Run: ollama pull nomic-embed-text");
  });

  test("OllamaTimeoutError is instanceof OllamaError", () => {
    const err = new OllamaTimeoutError("http://localhost:11434", 30000);
    expect(err).toBeInstanceOf(OllamaError);
    expect(err).toBeInstanceOf(OllamaTimeoutError);
    expect(err.name).toBe("OllamaTimeoutError");
  });

  test("OllamaTimeoutError message includes timeout duration and actionable guidance", () => {
    const err = new OllamaTimeoutError("http://localhost:11434", 30000);
    expect(err.message).toContain("30000ms");
    expect(err.message).toContain("Run: ollama serve");
  });

  test("EmbedDimensionError is instanceof OllamaError", () => {
    const err = new EmbedDimensionError("nomic-embed-text", 384, 768);
    expect(err).toBeInstanceOf(OllamaError);
    expect(err).toBeInstanceOf(EmbedDimensionError);
    expect(err.name).toBe("EmbedDimensionError");
  });

  test("EmbedDimensionError message includes got/expected dimensions and explanation", () => {
    const err = new EmbedDimensionError("nomic-embed-text", 384, 768);
    expect(err.message).toContain("384");
    expect(err.message).toContain("768");
    expect(err.message).toContain("nomic-embed-text");
    expect(err.message).toContain("model changed");
  });
});

// ─── Import embedder after error classes (will fail until embedder.ts exists) ──

// Lazy import for tests that require embedder.ts implementation
let embedModule: typeof import("../../src/services/embedder.js") | null = null;

async function getEmbedder() {
  if (!embedModule) {
    embedModule = await import("../../src/services/embedder.js");
  }
  return embedModule;
}

// ─── 2. embed() single text tests ─────────────────────────────────────────────

describe("embed() single text", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("embed() with a single text returns one vector of 768 dimensions", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const vec = make768Vector(1);
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse([vec])));
    _setFetchImpl(mockFetch);

    const result = await embed(["hello"], "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(768);
    expect(result[0]).toEqual(vec);
  });

  test("embed() vector values match what the mock Ollama returns", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const vec = make768Vector(42);
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse([vec])));
    _setFetchImpl(mockFetch);

    const result = await embed(["world"], "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text",
    });

    expect(result[0]).toEqual(vec);
  });
});

// ─── 3. embed() batch tests ────────────────────────────────────────────────────

describe("embed() batch inputs", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("embed() with 3 texts returns 3 vectors", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const vecs = [make768Vector(1), make768Vector(2), make768Vector(3)];
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse(vecs)));
    _setFetchImpl(mockFetch);

    const result = await embed(["a", "b", "c"], "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text",
    });

    expect(result).toHaveLength(3);
    for (const v of result) {
      expect(v).toHaveLength(768);
    }
  });

  test("large batch (50 texts) is chunked — fetch called multiple times with ≤32 texts each", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const callLog: number[] = [];

    const mockFetch = mock((_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      callLog.push(body.input.length);
      const vecs = body.input.map((_: string, i: number) => make768Vector(i + 1));
      return Promise.resolve(mockOllamaResponse(vecs));
    });
    _setFetchImpl(mockFetch);

    const texts = Array.from({ length: 50 }, (_, i) => `text-${i}`);
    const result = await embed(texts, "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text",
    });

    expect(result).toHaveLength(50);
    // Should have been called at least twice (50 texts / 32 batch size = 2 chunks)
    expect(callLog.length).toBeGreaterThanOrEqual(2);
    // Each individual call should have ≤32 texts
    for (const len of callLog) {
      expect(len).toBeLessThanOrEqual(32);
    }
  });
});

// ─── 4. Dimension assertion tests ─────────────────────────────────────────────

describe("embed() dimension assertion", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("throws EmbedDimensionError when Ollama returns 384-dim vector", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse([make384Vector()])));
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(EmbedDimensionError);
  });

  test("throws EmbedDimensionError when Ollama returns 769-dim vector", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse([make769Vector()])));
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(EmbedDimensionError);
  });

  test("EmbedDimensionError message includes model name and dimensions", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse([make384Vector()])));
    _setFetchImpl(mockFetch);

    let caughtError: unknown;
    try {
      await embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(EmbedDimensionError);
    const err = caughtError as EmbedDimensionError;
    expect(err.message).toContain("nomic-embed-text");
    expect(err.message).toContain("384");
    expect(err.message).toContain("768");
  });
});

// ─── 5. Error classification tests ────────────────────────────────────────────

describe("embed() error classification", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("TypeError from fetch (ECONNREFUSED) throws OllamaUnreachableError", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed")));
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaUnreachableError);
  });

  test("DOMException AbortError from fetch throws OllamaTimeoutError", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() =>
      Promise.reject(new DOMException("The operation was aborted", "AbortError")),
    );
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaTimeoutError);
  });

  test("DOMException TimeoutError from fetch throws OllamaTimeoutError", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() =>
      Promise.reject(new DOMException("The operation timed out", "TimeoutError")),
    );
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaTimeoutError);
  });

  test("HTTP 404 throws OllamaModelNotFoundError", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockHttpError(404, "model not found")));
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaModelNotFoundError);
  });

  test("HTTP 500 throws OllamaError (generic)", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockHttpError(500, "internal server error")));
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaError);
  });
});

// ─── 6. Retry tests ───────────────────────────────────────────────────────────

describe("embed() retry logic", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("transient failure on attempt 1, success on attempt 2 returns vectors (fetch called twice)", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    let callCount = 0;
    const vec = make768Vector(1);
    const mockFetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new TypeError("fetch failed"));
      }
      return Promise.resolve(mockOllamaResponse([vec]));
    });
    _setFetchImpl(mockFetch);

    const result = await embed(["hello"], "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text",
    });

    expect(result).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  test("definitive failure (OllamaModelNotFoundError) throws immediately, no retry", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    let callCount = 0;
    const mockFetch = mock(() => {
      callCount++;
      return Promise.resolve(mockHttpError(404, "model not found"));
    });
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaModelNotFoundError);

    expect(callCount).toBe(1);
  });

  test("3 consecutive transient failures throws OllamaUnreachableError after all retries exhausted", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    let callCount = 0;
    const mockFetch = mock(() => {
      callCount++;
      return Promise.reject(new TypeError("fetch failed"));
    });
    _setFetchImpl(mockFetch);

    await expect(
      embed(["hello"], "proj-1", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      }),
    ).rejects.toBeInstanceOf(OllamaUnreachableError);

    expect(callCount).toBe(3);
  });
});

// ─── 7. Cache tests ───────────────────────────────────────────────────────────

describe("embed() caching", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("same text twice with same projectId → second call does NOT invoke fetch (cache hit)", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    let callCount = 0;
    const vec = make768Vector(1);
    const mockFetch = mock(() => {
      callCount++;
      return Promise.resolve(mockOllamaResponse([vec]));
    });
    _setFetchImpl(mockFetch);

    const config = { ollamaUrl: "http://localhost:11434", embedModel: "nomic-embed-text" };
    await embed(["hello"], "proj-1", config);
    await embed(["hello"], "proj-1", config);

    expect(callCount).toBe(1);
  });

  test("same text with different projectId → both invoke fetch (per-project isolation)", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    let callCount = 0;
    const vec = make768Vector(1);
    const mockFetch = mock(() => {
      callCount++;
      return Promise.resolve(mockOllamaResponse([vec]));
    });
    _setFetchImpl(mockFetch);

    const config = { ollamaUrl: "http://localhost:11434", embedModel: "nomic-embed-text" };
    await embed(["hello"], "proj-1", config);
    await embed(["hello"], "proj-2", config);

    expect(callCount).toBe(2);
  });

  test("same text with different model name → both invoke fetch (model in cache key)", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    let callCount = 0;
    const vec = make768Vector(1);
    const mockFetch = mock(() => {
      callCount++;
      return Promise.resolve(mockOllamaResponse([vec]));
    });
    _setFetchImpl(mockFetch);

    await embed(["hello"], "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text",
    });
    await embed(["hello"], "proj-1", {
      ollamaUrl: "http://localhost:11434",
      embedModel: "nomic-embed-text-v2",
    });

    expect(callCount).toBe(2);
  });

  test("getCacheStats(projectId) returns { size, hits, misses }", async () => {
    const { embed, _setFetchImpl, getCacheStats } = await getEmbedder();
    const vec = make768Vector(1);
    const mockFetch = mock(() => Promise.resolve(mockOllamaResponse([vec])));
    _setFetchImpl(mockFetch);

    const config = { ollamaUrl: "http://localhost:11434", embedModel: "nomic-embed-text" };
    await embed(["hello"], "proj-1", config);
    await embed(["hello"], "proj-1", config); // cache hit

    const stats = getCacheStats("proj-1");
    expect(stats).toHaveProperty("size");
    expect(stats).toHaveProperty("hits");
    expect(stats).toHaveProperty("misses");
    expect(stats.size).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  test("clearAllCaches() empties all project caches", async () => {
    const { embed, _setFetchImpl, getCacheStats, clearAllCaches } = await getEmbedder();
    let callCount = 0;
    const vec = make768Vector(1);
    const mockFetch = mock(() => {
      callCount++;
      return Promise.resolve(mockOllamaResponse([vec]));
    });
    _setFetchImpl(mockFetch);

    const config = { ollamaUrl: "http://localhost:11434", embedModel: "nomic-embed-text" };
    await embed(["hello"], "proj-1", config);
    expect(getCacheStats("proj-1").size).toBe(1);

    clearAllCaches();

    // After clearing, same text should hit fetch again
    await embed(["hello"], "proj-1", config);
    expect(callCount).toBe(2);
  });
});
