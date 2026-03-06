---
name: synapse:map
description: Index the project codebase for semantic search — checks Ollama health, runs index_codebase, and reports results.
allowed-tools:
  - Bash
  - mcp__synapse__index_codebase
  - mcp__synapse__project_overview
---

## Objective

Index the project codebase into Synapse so agents can find relevant code and documentation using semantic search.

This is the ONLY Synapse command that requires Ollama — it generates vector embeddings for every source file.

## Process

1. **Verify project is initialized:** Check that a `project_id` is available in the current session context (injected by the Synapse startup hook from `.synapse/config/project.toml`). If no project context is present:

   > "No Synapse project found in this session. Run /synapse:init first to initialize the project."

   Stop here if the project is not initialized.

2. **Check Ollama health:** Use Bash to verify Ollama is running and the embedding model is available:

   ```bash
   curl -sf http://localhost:11434/api/tags
   ```

   **If Ollama is not reachable** (curl fails or returns an error):
   > "Ollama is not running. Synapse needs Ollama for code embeddings.
   >
   > Start Ollama with: `ollama serve` (run in a separate terminal, then retry this command)"

   Stop here. Do NOT proceed with indexing if Ollama is unreachable.

   **If Ollama is running**, also check for the embedding model:

   ```bash
   curl -sf http://localhost:11434/api/tags | grep -q "nomic-embed-text"
   ```

   If the model is missing:
   > "The nomic-embed-text embedding model is not installed.
   >
   > Pull it with: `ollama pull nomic-embed-text` (this downloads ~274MB, run in a separate terminal)"

   Stop here if the model is missing.

   If both checks pass, confirm to the user: "Ollama is running with nomic-embed-text. Starting indexing..."

3. **Report indexing start:** Tell the user what to expect before calling the tool:

   > "Indexing codebase at [project_root]...
   >
   > This may take a few minutes depending on project size. Synapse will parse source files, extract AST structures, and generate embeddings for semantic search. You will see a result summary when complete."

   The user should never see a silent wait.

4. **Run index_codebase:** Call `mcp__synapse__index_codebase` with:
   - `project_id`: from session context
   - `project_root`: absolute path to the project root (derive from the location of `.synapse/config/project.toml`, or use `$CLAUDE_PROJECT_DIR` if available)
   - `actor`: "synapse-orchestrator"

   If the tool call returns an error:
   - **OllamaUnreachableError**: Ollama stopped mid-index. Ask user to restart `ollama serve` and retry.
   - **Any other error**: Display the error message and suggest running `/synapse:map` again. If it persists, note the error output for debugging.

5. **Report results:** Call `mcp__synapse__project_overview` to get the updated project state, then display a summary:

   ```
   Codebase indexed successfully.

   Files processed: {{files_indexed}}
   Code symbols extracted: {{symbols_count}}
   Documents in knowledge base: {{document_count}}

   Your codebase is now searchable. Agents can find relevant code and
   documentation using semantic search.
   ```

   Adapt the summary to whatever counts `project_overview` returns. If counts are unavailable, confirm success without numbers.

6. **Suggest next step:**

   > "Run /synapse:refine to start defining your first epic, or /synapse:status to see the project overview."

## Key Design Notes

- This is the ONLY command that requires Ollama — all other commands work without it
- The Ollama check happens before any indexing call — never silently attempt indexing with a broken Ollama
- Progress feedback before calling `index_codebase` is required — the user must not face a blank wait
- If `project_root` cannot be determined, ask the user to provide the absolute path rather than guessing

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
