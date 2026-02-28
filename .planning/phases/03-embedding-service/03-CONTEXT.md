# Phase 3: Embedding Service - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the shared Ollama embedding service that all write and read paths depend on. The service embeds text via Ollama's nomic-embed-text model, asserts correct dimensions (768) on every vector, fails fast on write paths when Ollama is unreachable, and allows read paths to degrade gracefully. Document management, code indexing, and search phases all consume this service.

</domain>

<decisions>
## Implementation Decisions

### Error reporting
- Actionable guidance in all error messages — include what went wrong AND how to fix it (e.g., "Ollama unreachable at localhost:11434. Run: ollama serve" or "Model nomic-embed-text not found. Run: ollama pull nomic-embed-text")
- Distinct error types per failure mode: Ollama unreachable, model not found, wrong dimensions, timeout — callers can handle each differently
- Read-path degradation logs a stderr warning ("Ollama unavailable — returning non-semantic results only") so agents know results may be less relevant
- Dimension assertion error includes model name and explanation (e.g., "Dimension mismatch: model nomic-embed-text returned 384 dimensions, expected 768. This usually means the model changed or a different model is loaded.")

### Connection resilience
- Retry with exponential backoff on transient failures (timeouts, connection reset) — 2-3 attempts. Fail fast on definitive errors (model not found, wrong dimensions)
- 30-second per-request timeout — generous enough for first-call model loading on slower hardware
- Auto-chunk large batch requests into groups of ~32 texts to prevent Ollama timeouts or OOM on huge payloads
- Ollama URL configurable via OLLAMA_URL env var (default: http://localhost:11434) — already specified in Phase 1, confirmed it flows through to embedding service

### Embedding caching
- In-memory LRU cache with 10,000 entries (~30MB memory)
- Per-project cache isolation (separate cache per project_id)
- Cache key = hash(model_name + text) — switching models automatically invalidates cache
- Ephemeral only — cache lives in memory, gone on server restart. No disk persistence
- LRU eviction only, no TTL — embeddings are deterministic for same text + model
- Log cache stats periodically to stderr (hit/miss ratio, current size) for debugging and tuning

### Startup validation
- Blocking health check with 5-second timeout — server waits for result before registering tools
- Checks Ollama reachability AND verifies nomic-embed-text model is available (no test embed)
- Results surfaced via stderr log line AND included in ping/echo tool response so agents can programmatically check Ollama status
- Startup only — no periodic re-checks. Ollama going down mid-session surfaces naturally on next embed call

### Claude's Discretion
- HTTP client library choice and connection pooling
- Exact exponential backoff timing and jitter
- Cache implementation details (hash function, data structure)
- Batch chunk size tuning (starting point ~32, can adjust)
- Internal module structure and file organization

</decisions>

<specifics>
## Specific Ideas

- Health check status should be available to agents via the ping/echo tool response — not just logged to stderr
- User chose blocking startup check (with 5s timeout) over non-blocking, to ensure Ollama status is known before first tool call
- Per-project cache was chosen over global cache for isolation, despite lower hit rate
- 10,000 entry cache was chosen over 1,000 to accommodate larger codebases (~30MB is acceptable)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-embedding-service*
*Context gathered: 2026-02-28*
