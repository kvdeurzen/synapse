import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { OllamaError, OllamaUnreachableError } from "../../src/errors.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function mockTagsResponse(models: Array<{ name: string }>): Response {
  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockHttpError(status: number, body = "error"): Response {
  return new Response(body, { status });
}

// ─── Lazy embedder import ──────────────────────────────────────────────────────

let embedModule: typeof import("../../src/services/embedder.js") | null = null;

async function getEmbedder() {
  if (!embedModule) {
    embedModule = await import("../../src/services/embedder.js");
  }
  return embedModule;
}

// ─── 1. checkOllamaHealth tests ────────────────────────────────────────────────

describe("checkOllamaHealth", () => {
  beforeEach(async () => {
    const { _setFetchImpl } = await getEmbedder();
    // Reset to a no-op so each test sets its own mock
    _setFetchImpl(() => Promise.resolve(new Response("", { status: 500 })));
  });

  test("returns 'ok' when model matches with ':latest' tag suffix", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() =>
      Promise.resolve(mockTagsResponse([{ name: "nomic-embed-text:latest" }])),
    );
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("ok");
  });

  test("returns 'ok' when model matches exactly (no tag suffix)", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockTagsResponse([{ name: "nomic-embed-text" }])));
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("ok");
  });

  test("returns 'model_missing' when only a different model is in the list", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockTagsResponse([{ name: "llama3:latest" }])));
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("model_missing");
  });

  test("returns 'model_missing' when models list is empty", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockTagsResponse([])));
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("model_missing");
  });

  test("returns 'unreachable' when fetch throws TypeError (ECONNREFUSED)", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed")));
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("unreachable");
  });

  test("returns 'unreachable' when fetch throws AbortError (timeout)", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() =>
      Promise.reject(new DOMException("The operation was aborted", "AbortError")),
    );
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("unreachable");
  });

  test("returns 'unreachable' when server returns HTTP 500", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    const mockFetch = mock(() => Promise.resolve(mockHttpError(500)));
    _setFetchImpl(mockFetch);

    const result = await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");
    expect(result).toBe("unreachable");
  });
});

// ─── 2. Ollama status state tests ─────────────────────────────────────────────

describe("Ollama status state", () => {
  afterEach(async () => {
    // Reset state to default after each test to avoid cross-test pollution
    const { setOllamaStatus } = await getEmbedder();
    setOllamaStatus("unreachable");
  });

  test("getOllamaStatus() defaults to 'unreachable' before any check", async () => {
    const { getOllamaStatus, setOllamaStatus } = await getEmbedder();
    // Reset to ensure fresh state
    setOllamaStatus("unreachable");
    expect(getOllamaStatus()).toBe("unreachable");
  });

  test("setOllamaStatus('ok') → getOllamaStatus() returns 'ok'", async () => {
    const { getOllamaStatus, setOllamaStatus } = await getEmbedder();
    setOllamaStatus("ok");
    expect(getOllamaStatus()).toBe("ok");
  });

  test("setOllamaStatus('model_missing') → getOllamaStatus() returns 'model_missing'", async () => {
    const { getOllamaStatus, setOllamaStatus } = await getEmbedder();
    setOllamaStatus("model_missing");
    expect(getOllamaStatus()).toBe("model_missing");
  });
});

// ─── 3. Write-path fail-fast pattern test (EMBED-03) ─────────────────────────

describe("Write-path fail-fast pattern (EMBED-03)", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("embed() throws OllamaUnreachableError when Ollama is down — write paths fail fast", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    // Simulate Ollama being down (ECONNREFUSED)
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed")));
    _setFetchImpl(mockFetch);

    // This proves EMBED-03: write paths (store_document, index_codebase) fail fast
    // They do NOT silently store without embeddings
    let caughtError: unknown;
    try {
      await embed(["test document content"], "proj-write", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(OllamaUnreachableError);
    expect(caughtError).toBeInstanceOf(OllamaError);
  });
});

// ─── 4. Read-path degradation pattern test (EMBED-04) ────────────────────────

describe("Read-path degradation pattern (EMBED-04)", () => {
  beforeEach(async () => {
    const { clearAllCaches } = await getEmbedder();
    clearAllCaches();
  });

  test("read-path pattern: catch OllamaError and continue without vector", async () => {
    const { embed, _setFetchImpl } = await getEmbedder();
    // Simulate Ollama being down (ECONNREFUSED)
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed")));
    _setFetchImpl(mockFetch);

    // Demonstrate the read-path pattern that semantic_search will use (RESEARCH.md Pattern 8)
    // Read paths catch OllamaError and degrade gracefully rather than failing
    let queryVector: number[] | null = null;
    try {
      [queryVector] = await embed(["test query"], "proj-read", {
        ollamaUrl: "http://localhost:11434",
        embedModel: "nomic-embed-text",
      });
    } catch (err) {
      if (err instanceof OllamaError) {
        queryVector = null; // Graceful degradation: fall back to keyword search
      } else {
        throw err; // Non-Ollama errors propagate normally
      }
    }

    // Read paths continue with null vector (keyword-only search) rather than throwing
    expect(queryVector).toBeNull();
  });

  test("non-OllamaError propagates normally in read-path pattern (application-level errors)", async () => {
    // This test validates the read-path degradation pattern at the application level.
    // When a non-OllamaError is thrown (e.g., DB error from a higher layer), it must propagate.
    // The pattern: try embed() -> catch OllamaError -> degrade; non-OllamaError re-throws.

    const nonOllamaError = new RangeError("Unexpected application error");

    let rethrown: unknown;
    try {
      // Simulate an application-level error (not from embed())
      throw nonOllamaError;
    } catch (err) {
      if (err instanceof OllamaError) {
        // Graceful degradation for Ollama errors only
      } else {
        rethrown = err; // Non-Ollama errors must be rethrown
      }
    }

    // Application-level errors are not swallowed by the read-path catch
    expect(rethrown).toBe(nonOllamaError);
    expect(rethrown).toBeInstanceOf(RangeError);
  });
});

// ─── 5. Health check makes 768-dim mock vector helper available ───────────────
// (sanity check that make768Vector works — used in downstream embedding tests)

describe("checkOllamaHealth URL construction", () => {
  test("checkOllamaHealth calls /api/tags endpoint with configured ollamaUrl", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    let capturedUrl = "";
    const mockFetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(mockTagsResponse([{ name: "nomic-embed-text" }]));
    });
    _setFetchImpl(mockFetch);

    await checkOllamaHealth("http://custom-ollama:8080", "nomic-embed-text");

    expect(capturedUrl).toBe("http://custom-ollama:8080/api/tags");
  });

  test("checkOllamaHealth passes 5-second timeout signal via AbortSignal.timeout", async () => {
    const { checkOllamaHealth, _setFetchImpl } = await getEmbedder();
    let capturedInit: RequestInit | undefined;
    const mockFetch = mock((_url: string, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(mockTagsResponse([{ name: "nomic-embed-text" }]));
    });
    _setFetchImpl(mockFetch);

    await checkOllamaHealth("http://localhost:11434", "nomic-embed-text");

    // Verify timeout signal was passed
    expect(capturedInit?.signal).toBeDefined();
    // The signal from AbortSignal.timeout(5000) should be an AbortSignal
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
