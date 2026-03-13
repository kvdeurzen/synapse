---
name: synapse:upgrade
description: Upgrade Synapse to the latest version — shows changelog, applies update, and commits changes.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

## Objective

Detect current and latest Synapse versions, show the user what changed, apply the upgrade via install.sh, and auto-commit the result. If hooks or settings changed, inform the user to restart their Claude Code session.

## Process

1. **Detect current version:** Read `.synapse/config/project.toml` using the Read tool and extract the `synapse_version` field.

   - If the field exists, store it as `CURRENT_VERSION`.
   - If the file does not exist, inform the user:
     > "project.toml not found. Is Synapse initialized? Run /synapse:init first."
     Then stop.
   - If the file exists but has no `synapse_version` field, inform the user:
     > "No version recorded — this was likely installed before version tracking was added. The upgrade will proceed and record the new version."
     Set `CURRENT_VERSION` to `"unknown"`.

2. **Detect latest version:** Run via Bash:

   ```bash
   LATEST_TAG=$(curl -sf "https://api.github.com/repos/kvdeurzen/synapse/releases/latest" \
     2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' || echo "")
   if [ -z "$LATEST_TAG" ]; then
     LATEST_TAG=$(curl -sf "https://api.github.com/repos/kvdeurzen/synapse/tags?per_page=1" \
       2>/dev/null | grep '"name"' | head -1 | sed 's/.*"name": *"\([^"]*\)".*/\1/' || echo "")
   fi
   echo "$LATEST_TAG"
   ```

   - If no tag is found, inform the user:
     > "Could not determine the latest version from GitHub. Check your network connection and try again."
     Then stop.
   - Store result as `LATEST_VERSION`.

3. **Compare versions:** If `CURRENT_VERSION` equals `LATEST_VERSION`, inform the user:

   > "Already on the latest version ({CURRENT_VERSION}). Nothing to do."

   Then stop. If `CURRENT_VERSION` is `"unknown"` or differs from `LATEST_VERSION`, continue.

4. **Show changelog diff:** Attempt to display what changed between `CURRENT_VERSION` and `LATEST_VERSION`:

   - **If git is available and the Synapse repo is local** (detected by `test -f packages/server/src/index.ts`), run:
     ```bash
     git log --oneline {CURRENT_VERSION}..{LATEST_VERSION} -- packages/framework/ packages/server/ install.sh 2>/dev/null || true
     ```
   - **Otherwise**, show the GitHub compare URL:
     ```
     https://github.com/kvdeurzen/synapse/compare/{CURRENT_VERSION}...{LATEST_VERSION}
     ```

   Display the result to the user as "What changed in this upgrade."

5. **Confirm with user:** Present the version change clearly:

   > Upgrade Synapse from **{CURRENT_VERSION}** to **{LATEST_VERSION}**?
   > [changelog or compare URL shown above]
   >
   > Proceed with upgrade? (yes/no)

   **Do NOT proceed without explicit confirmation.** If the user declines, stop here:
   > "Upgrade cancelled. Your current version ({CURRENT_VERSION}) remains unchanged."

6. **Record pre-upgrade state:** Before running install.sh, capture the current state so we can detect what changed:

   ```bash
   PRE_UPGRADE_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
   PRE_UPGRADE_HOOKS=$(ls -la .claude/hooks/synapse-*.js .claude/settings.json 2>/dev/null | awk '{print $5, $9}' || echo "")
   ```

   Store these as `PRE_UPGRADE_COMMIT` and `PRE_UPGRADE_HOOKS`.

7. **Run install.sh:** Execute via Bash:

   ```bash
   bash install.sh --quiet --version {LATEST_VERSION}
   ```

   - If `install.sh` is not found at the project root, inform the user:
     > "install.sh not found in the project root. Download it with:"
     > `curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh -o install.sh`
     Then stop.
   - Check the exit code. If non-zero, report the error output and stop:
     > "Upgrade failed. install.sh exited with code {N}. Review the output above and fix the issue before retrying."

8. **Auto-commit changes:** Stage all framework files that install.sh would have modified, then commit:

   ```bash
   git add .claude/agents/ .claude/hooks/ .claude/commands/synapse/ .claude/skills/ .claude/server/ .synapse/config/ .mcp.json
   git diff --cached --quiet || git commit -m "chore(synapse): upgrade to {LATEST_VERSION}"
   ```

   - If `git diff --cached --quiet` exits 0 (nothing staged), inform the user:
     > "No files changed — already up to date."
   - If the commit succeeds, display the commit hash.

9. **Hot-reload detection:** Compare hook and settings files before and after the upgrade:

   ```bash
   POST_UPGRADE_HOOKS=$(ls -la .claude/hooks/synapse-*.js .claude/settings.json 2>/dev/null | awk '{print $5, $9}' || echo "")
   ```

   Compare `PRE_UPGRADE_HOOKS` with `POST_UPGRADE_HOOKS`.

   - **If any `.js` files in `.claude/hooks/` changed, or if `.claude/settings.json` changed**, display:
     > **Critical files updated (hooks/settings). Please restart Claude Code to apply the new hooks.** Agent and command files are already active without restart.

   - **If only `.md` files changed** (agents, commands, skills), display:
     > Upgrade complete. All changes are active immediately — no restart needed.

10. **Summary:** Display the upgrade result:

    ```
    Synapse Upgrade Summary
    -----------------------
    From:    {CURRENT_VERSION}
    To:      {LATEST_VERSION}
    Commit:  {commit hash or "no changes committed"}
    Restart: {required | not needed}
    ```

## Anti-Patterns

- Do NOT proceed with install.sh without explicit user confirmation in step 5
- Do NOT hardcode version strings — always detect dynamically
- Do NOT skip the hot-reload detection — hook changes require a session restart to take effect
- Do NOT modify project data or Synapse DB during upgrade — install.sh only updates framework files

## Attribution

All Synapse tool calls MUST include `actor: "synapse-gateway"` for audit trail.
