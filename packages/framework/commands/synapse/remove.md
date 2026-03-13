---
name: synapse:remove
description: Remove Synapse from this project — surgically cleans all config files and deletes Synapse artifacts.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
---

## Objective

Completely remove Synapse from the project while preserving non-Synapse configuration. This command surgically strips Synapse entries from shared config files (.mcp.json, .claude/settings.json, CLAUDE.md), deletes all Synapse-owned directories, and cleans .gitignore entries. The user has explicit control over LanceDB database deletion. This command deletes itself as the very last step.

## Process

1. **Inventory Synapse artifacts:** Use Glob and Bash to build a complete list of what will be deleted:

   - `.claude/agents/` — list all agent `.md` files
   - `.claude/hooks/synapse-*.js` and `.claude/hooks/lib/` — list Synapse hook files
   - `.claude/commands/synapse/` — list all command files
   - `.claude/skills/` — list all skill directories
   - `.claude/server/` — list server source files
   - `.synapse/config/` — list config files
   - `.synapse/state/` — list state files
   - `.synapse/data/` — check if LanceDB database exists; report size if so
   - The `synapse` key in `.mcp.json` (if file exists)
   - Synapse hooks in `.claude/settings.json` (hooks matching synapseSignatures)
   - The `## Synapse Gateway Protocol` section in `CLAUDE.md` (if present)

   Use Bash to gather counts and sizes:

   ```bash
   # Count agents
   find .claude/agents -name "*.md" 2>/dev/null | wc -l

   # Count hooks
   find .claude/hooks -name "synapse-*.js" 2>/dev/null | wc -l

   # Count commands
   find .claude/commands/synapse -name "*.md" 2>/dev/null | wc -l

   # Count skills
   find .claude/skills -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l

   # Check LanceDB database size
   du -sh .synapse/data/ 2>/dev/null || echo "not found"
   ```

2. **Display removal summary:** Present the full inventory to the user in a structured format. Use the actual counts gathered in step 1:

   ```
   Synapse removal plan for this project:

   Files to remove:
     .claude/agents/           — {N} agent files
     .claude/hooks/synapse-*   — {N} hook files
     .claude/hooks/lib/        — hook utilities
     .claude/commands/synapse/ — {N} command files (including this one)
     .claude/skills/           — {N} skill directories
     .claude/server/           — MCP server source
     .synapse/config/          — project configuration
     .synapse/state/           — state files

   Config entries to strip:
     .mcp.json                 — remove "synapse" server entry
     .claude/settings.json     — remove Synapse hooks and statusline
     CLAUDE.md                 — remove Gateway Protocol section

   Data:
     .synapse/data/            — LanceDB database ({size})
   ```

   If a directory does not exist or is empty, note "(not found)" rather than showing a count of 0.

3. **Prompt for data deletion:** Ask the user specifically about the LanceDB database:

   > "Do you want to delete the Synapse database (.synapse/data/)? This contains your project's document embeddings and indexed code. Choose:
   > - **delete** — Remove everything including the database
   > - **keep** — Remove Synapse tools but preserve the database for potential re-install"

   Wait for the user's response. Accept "delete" or "keep" (case-insensitive). If the response is unclear, ask again.

4. **Require explicit confirmation:** After showing the summary and receiving the data choice, require the user to type "yes" to proceed:

   > "This will remove all Synapse files listed above. Type 'yes' to confirm."

   Do NOT proceed without explicit "yes". If the user types anything other than "yes" (case-insensitive), abort and display:
   > "Removal cancelled. No changes made."

5. **Strip .mcp.json:** Read `.mcp.json` if it exists. Use Bash with `bun -e` inline script to remove the `synapse` key from `mcpServers`, preserving all other entries:

   ```bash
   if [ -f .mcp.json ]; then
     EXISTING_MCP=$(cat .mcp.json)
     bun -e "
       const existing = $EXISTING_MCP;
       const result = { ...existing };
       result.mcpServers = { ...(existing.mcpServers || {}) };
       delete result.mcpServers.synapse;
       if (Object.keys(result.mcpServers).length === 0) delete result.mcpServers;
       process.stdout.write(JSON.stringify(result, null, 2) + '\n');
     " > .mcp.json.tmp && mv .mcp.json.tmp .mcp.json
     echo "Stripped synapse from .mcp.json"
   else
     echo ".mcp.json not found — skipping"
   fi
   ```

   After stripping, if `.mcp.json` is now `{}` or contains only empty objects, delete it entirely:

   ```bash
   if [ -f .mcp.json ]; then
     CONTENT=$(cat .mcp.json | tr -d ' \n\t')
     if [ "$CONTENT" = "{}" ]; then
       rm .mcp.json
       echo "Removed empty .mcp.json"
     fi
   fi
   ```

6. **Strip .claude/settings.json:** Read the file if it exists. Use Bash with `bun -e` inline script to remove Synapse hooks and statusline using the `synapseSignatures` pattern (inverse of install.sh hook registration):

   ```bash
   SETTINGS_FILE=".claude/settings.json"
   if [ -f "$SETTINGS_FILE" ]; then
     EXISTING_CONTENT=$(cat "$SETTINGS_FILE")
     bun -e "
       const existing = $EXISTING_CONTENT;
       const synapseSignatures = [
         'synapse-startup.js', 'tier-gate.js', 'precedent-gate.js',
         'tool-allowlist.js', 'audit-log.js', 'synapse-statusline.js',
         'conventional-commit.js', 'output-contract-gate.js',
       ];
       function isSynapseHook(hook) {
         return typeof hook.command === 'string' &&
           synapseSignatures.some(sig => hook.command.includes(sig));
       }
       function isSynapseHookGroup(group) {
         return group?.hooks?.some(isSynapseHook) ?? false;
       }
       const result = { ...existing };
       result.hooks = { ...(existing.hooks || {}) };
       for (const event of ['SessionStart', 'PreToolUse', 'PostToolUse']) {
         result.hooks[event] = (existing.hooks?.[event] || [])
           .filter(g => !isSynapseHookGroup(g));
         if (result.hooks[event].length === 0) delete result.hooks[event];
       }
       if (existing.statusLine?.command &&
           synapseSignatures.some(s => existing.statusLine.command.includes(s))) {
         delete result.statusLine;
       }
       if (Object.keys(result.hooks).length === 0) delete result.hooks;
       process.stdout.write(JSON.stringify(result, null, 2) + '\n');
     " > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
     echo "Stripped Synapse hooks from settings.json"
   else
     echo ".claude/settings.json not found — skipping"
   fi
   ```

   If settings.json is now `{}` (only empty braces remain), leave it — it is harmless and Claude Code may expect the file.

7. **Strip CLAUDE.md Gateway Protocol section:** Use Bash with `bun -e` inline script to remove the Gateway Protocol section using regex. The script detects the section boundary at the next `## ` heading or end of file:

   ```bash
   if [ -f CLAUDE.md ]; then
     bun -e "
       const fs = require('fs');
       const content = fs.readFileSync('CLAUDE.md', 'utf8');
       // Remove from '## Synapse Gateway Protocol' to the next '## ' heading or EOF
       const stripped = content.replace(
         /\n## Synapse Gateway Protocol\n[\s\S]*?(?=\n## |\s*$)/,
         ''
       );
       fs.writeFileSync('CLAUDE.md', stripped.trimEnd() + '\n');
     "
     echo "Stripped Gateway Protocol section from CLAUDE.md"
   else
     echo "CLAUDE.md not found — skipping"
   fi
   ```

   If CLAUDE.md does not contain the `## Synapse Gateway Protocol` section, the replace is a no-op — no error is thrown.

8. **Delete Synapse directories:** Execute via Bash in this exact order. Config stripping (steps 5-7) MUST complete before this step:

   ```bash
   rm -rf .claude/agents/
   echo "Removed .claude/agents/"

   # Remove Synapse hooks but not the entire hooks directory (other hooks may exist)
   rm -rf .claude/hooks/synapse-*.js .claude/hooks/lib/
   echo "Removed Synapse hooks"

   rm -rf .claude/skills/
   echo "Removed .claude/skills/"

   rm -rf .claude/server/
   echo "Removed .claude/server/"

   rm -rf .synapse/config/ .synapse/state/
   echo "Removed .synapse/config/ and .synapse/state/"
   ```

   If user chose to delete data (step 3 answer was "delete"):
   ```bash
   rm -rf .synapse/data/
   echo "Removed .synapse/data/"
   ```

   After data decision, clean up .synapse/ if now empty:
   ```bash
   rmdir .synapse/ 2>/dev/null && echo "Removed empty .synapse/" || true
   ```

9. **Remove .gitignore entries:** Strip Synapse-specific entries from `.gitignore` if the file exists:

   ```bash
   if [ -f .gitignore ]; then
     sed -i '/\.synapse-audit\.log/d' .gitignore
     sed -i '/\.synapse\/config\/local\.toml/d' .gitignore
     sed -i '/\.synapse\/data\//d' .gitignore
     echo "Cleaned .gitignore"
   fi
   ```

10. **Self-deletion (LAST STEP):** Delete the commands directory as the absolute final step. The agent has already loaded this command file into context, so deleting the file mid-execution does not affect the running session:

    ```bash
    rm -rf .claude/commands/synapse/
    echo "Removed .claude/commands/synapse/"
    ```

    After removing the commands directory, clean up `.claude/` if now empty (no other tools installed):
    ```bash
    rmdir .claude/ 2>/dev/null && echo "Removed empty .claude/" || true
    ```

11. **Confirm removal:** Display final confirmation to the user:

    > "Synapse has been removed from this project.
    > - Framework files: deleted
    > - Config entries: cleaned (.mcp.json, .claude/settings.json)
    > - CLAUDE.md: Gateway Protocol section removed
    > - Database: {deleted | preserved at .synapse/data/}
    >
    > To reinstall: `curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh | bash`"

## Anti-Patterns

- Do NOT proceed past step 4 without explicit "yes" confirmation
- Do NOT delete `.mcp.json` unless it is completely empty after Synapse removal
- Do NOT delete `.claude/settings.json` even if empty — leave it as `{}`
- Do NOT run config stripping (steps 5-7) after directory deletion (step 8) — Bun must be available
- Do NOT make step 10 (self-deletion) anything other than the absolute last file operation
- Do NOT use `&&` chaining between the directory deletion steps — a failure in one must not prevent the others

## Attribution

No Synapse MCP tool calls are made during removal — the MCP server is being uninstalled. No actor attribution is required.
