---
name: synapse:init
description: Initialize a Synapse project — creates project.toml, registers with Synapse DB, and configures RPEV preferences.
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__synapse__init_project
  - mcp__synapse__index_codebase
---

## Objective

Set up this project for Synapse: detect the project name, create config files, configure per-layer involvement preferences (RPEV), register with the Synapse database, and optionally amend CLAUDE.md.

## Process

1. **Check for existing project:** Read `.synapse/config/project.toml`. If it exists, display the existing `project_id`, `name`, and `created_at`. Warn the user:

   > "This project is already initialized (created: DATE). Re-running init will not affect existing data."

   Offer two options:
   - **Continue** — update the config files with any new choices
   - **Abort** — exit without making changes

   If the user chooses abort, stop here.

2. **Detect project name:** Use Bash to detect the project name in order:
   - (a) Read `package.json` and extract the `.name` field
   - (b) Fall back to `basename $PWD`

   Slugify the result: lowercase, replace spaces and special characters with hyphens, strip leading non-alphanumeric characters. Validate the result against `/^[a-z0-9][a-z0-9_-]*$/`.

   Display the detected `project_id` to the user and allow them to confirm or provide a different name before proceeding. Do NOT proceed until confirmed.

3. **Create config directory:** Use Bash to run `mkdir -p .synapse/config`. **Wait for this to complete before writing any files.**

4. **Write project.toml:** Use the Write tool to create `.synapse/config/project.toml`:

   ```toml
   [project]
   project_id = "{{confirmed_project_id}}"
   name = "{{project_name}}"
   skills = []
   gateway_mode = "always-on"
   created_at = "{{current ISO timestamp}}"
   ```

   Replace all `{{...}}` placeholders with the actual values. The `created_at` should be the current UTC timestamp in ISO 8601 format.

   `gateway_mode` controls Synapse intake behavior: `always-on` (default) automatically routes non-trivial work through the pipeline. `explicit` requires manual `/synapse:refine` invocation.

5. **Interactive RPEV configuration:** Walk the user through their involvement preferences for the recursive RPEV loop (Refine → Plan → Execute → Validate at each level). The involvement matrix has 16 entries (4 levels x 4 stages). Present the defaults and let the user adjust:

   **Involvement modes:** drives | co-pilot | reviews | monitors | autopilot

   | Level | Refine | Plan | Execute | Validate |
   |-------|--------|------|---------|----------|
   | Project | drives | co-pilot | monitors | monitors |
   | Epic | co-pilot | reviews | autopilot | monitors |
   | Feature | reviews | autopilot | autopilot | autopilot |
   | Work Package | autopilot | autopilot | autopilot | autopilot |

   Also present:
   - **Explicit gate levels** (default: `["project", "epic"]`) — levels where the user must explicitly signal "this foundation is solid" before Plan auto-triggers
   - **Proactive notifications** (default: `false`) — whether blocked items are pushed proactively or surfaced on-demand via `/synapse:status`
   - **Max pool slots** (default: `3`) — maximum concurrent agent slots in the pool
   - **Max retries** — task: 3, feature: 2, epic: 1

   Explain: "At drives and co-pilot levels you actively guide the stage. At reviews level you approve output. At monitors level you are notified but the agent proceeds. At autopilot the agent operates fully autonomously."

6. **Write trust.toml RPEV section:**
   - If `.synapse/config/trust.toml` already exists, read it and preserve all existing sections
   - If no trust.toml exists, copy the template from `packages/framework/config/trust.toml` as the base
   - Append (or replace if already present) the `[rpev.involvement]`, `[rpev.domain_overrides]`, and `[rpev]` sections with the user's choices. The involvement matrix has 16 entries (4 levels x 4 stages). Present the defaults below; substitute any values the user changed in step 5:

   ```toml
   [rpev.involvement]
   project_refine   = "drives"
   project_plan     = "co-pilot"
   project_execute  = "monitors"
   project_validate = "monitors"

   epic_refine   = "co-pilot"
   epic_plan     = "reviews"
   epic_execute  = "autopilot"
   epic_validate = "monitors"

   feature_refine   = "reviews"
   feature_plan     = "autopilot"
   feature_execute  = "autopilot"
   feature_validate = "autopilot"

   work_package_refine   = "autopilot"
   work_package_plan     = "autopilot"
   work_package_execute  = "autopilot"
   work_package_validate = "autopilot"

   [rpev.domain_overrides]
   # Override involvement for specific domains regardless of level
   # Format: {domain}_{stage} = "mode"

   [rpev]
   explicit_gate_levels = ["project", "epic"]
   proactive_notifications = false
   max_pool_slots = 3
   max_retries_task = 3
   max_retries_feature = 2
   max_retries_epic = 1
   ```

   Use the Write tool to write the final trust.toml to `.synapse/config/trust.toml`.

   **IMPORTANT:** Wait for the Write to complete successfully before proceeding to step 6b. The DB registration depends on the config files existing.

6b. **Write gateway-protocol.md:** Copy the gateway protocol template to the project config:

    Use the Read tool to read `packages/framework/config/gateway-protocol.md`, then use the Write tool to write it to `.synapse/config/gateway-protocol.md`.

    This file defines how the main session routes user requests through the Synapse pipeline.

7. **Register with Synapse DB:** Call `mcp__synapse__init_project` with:
   - `project_id`: the confirmed project_id
   - `actor`: "synapse-orchestrator"

   Report the result to the user. Example:

   > "Synapse DB initialized: 5 tables created, 3 starter documents seeded."

   If tables already existed (tables_skipped > 0), note that data was preserved.

   NOTE: This step does NOT require Ollama — it creates LanceDB tables only. Do not check for Ollama here.

7b. **Index codebase (conditional):** After init_project succeeds, silently check if Ollama is available with the required model:

    ```bash
    curl -sf http://localhost:11434/api/tags | grep -q "nomic-embed-text" && echo "ready" || echo "unavailable"
    ```

    If `ready`:
    - Inform user: "Indexing your codebase... (this may take a minute)"
    - Call `mcp__synapse__index_codebase` with:
      - `project_id`: the confirmed project_id
      - `project_root`: absolute path to the project root (derived from `.synapse/config/project.toml` location)
      - `actor`: "synapse-orchestrator"
    - On success: report "Codebase indexed: {files_indexed} files."
    - On failure: warn "Codebase indexing skipped — run /synapse:map when Ollama is available." (non-fatal — continue init)

    If `unavailable`:
    - Skip silently. The step 11 summary will note: "Codebase: not indexed — run /synapse:map to enable semantic search."

8. **Offer CLAUDE.md amendment:** Check if `CLAUDE.md` exists in the project root. If it already contains a `## Synapse` section, skip this step silently.

   Otherwise, offer to append the following block:

   ```markdown
   ## Synapse
   This project uses Synapse for AI agent coordination.
   Run `/synapse:status` to check project state, `/synapse:refine` to start work.
   ```

   Only append if the user explicitly agrees. Never modify CLAUDE.md silently. If the user declines, note it and continue.

9. **Detect skills (auto-suggestion):** Use Bash to check `.claude/skills/` for subdirectories containing `SKILL.md` files:

   ```bash
   find .claude/skills -name "SKILL.md" -maxdepth 2 2>/dev/null | xargs -I{} dirname {}
   ```

   If any skills are found, list them and offer to add their names to the `skills` array in `project.toml`. Only update `project.toml` if the user agrees.

10. **Commit scaffolding:** After all files are created and configured, commit the Synapse scaffolding to version control:

    ```bash
    git add .synapse/ .claude/
    git commit -m "chore: initialize Synapse project configuration"
    ```

    If the git add or commit fails (e.g., not a git repo, or user has uncommitted changes that conflict), warn the user but do not treat it as a fatal error:
    > "Note: Could not auto-commit Synapse scaffolding. You may want to commit .synapse/ and .claude/ manually."

11. **Summary:** Display a confirmation of everything created or configured:

    ```
    Synapse initialized for "{{project_name}}" ({{project_id}})

    Created:
    - .synapse/config/project.toml
    - .synapse/config/trust.toml (RPEV involvement: 16-entry matrix, project=drives/co-pilot/monitors, epic=co-pilot/reviews/autopilot/monitors, feature/wp=autopilot)
    - .synapse/config/gateway-protocol.md (gateway intake and routing rules)

    Synapse DB: {{tables_created}} tables ready, {{starters_seeded}} starter documents seeded

    CLAUDE.md: {{amended | not modified}}
    Skills: {{list or "none detected"}}
    Codebase: {{N files indexed | not indexed — run /synapse:map to enable semantic search}}

    Next step: {{Run /synapse:refine to start planning work. | Run /synapse:map to index your codebase for semantic search.}}
    ```

    If indexing succeeded in step 7b, set "Next step" to "Run /synapse:refine to start planning work." and omit the /synapse:map suggestion.
    If indexing was skipped (Ollama unavailable or failed), set "Next step" to "Run /synapse:map to index your codebase for semantic search (requires Ollama with nomic-embed-text)."

    **Important:** Synapse's multi-agent workflow works best when Claude Code runs
    without permission prompts. Start sessions with:

        claude --dangerously-skip-permissions

    For convenience, add an alias to your shell config (~/.bashrc or ~/.zshrc):

        alias cs='claude --dangerously-skip-permissions'

## Anti-Patterns

- Do NOT check for Ollama during the core init flow (steps 1-7) — only the optional indexing step (7b) checks Ollama, and it is non-blocking
- Do NOT modify CLAUDE.md without explicit user consent
- Do NOT hardcode `project_id` — always use the detected and confirmed value
- Do NOT proceed past step 2 without user confirmation of the project_id

## Attribution

All Synapse tool calls MUST include `actor: "synapse-orchestrator"` for audit trail.
