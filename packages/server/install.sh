#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Synapse Install Script
# Wires Synapse into any Claude Code project.
# Usage: bash install.sh [--quiet] [--smoke-test] [--local] [--global]
#        [--version TAG] [--help]
# ---------------------------------------------------------------------------

# ============================================================
# Section 1: Color and logging setup
# ============================================================

# Detect TTY for colored output
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  COLOR_GREEN="\033[0;32m"
  COLOR_YELLOW="\033[1;33m"
  COLOR_RED="\033[0;31m"
  COLOR_RESET="\033[0m"
  COLOR_BOLD="\033[1m"
else
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RED=""
  COLOR_RESET=""
  COLOR_BOLD=""
fi

QUIET=false

log_step() {
  if [ "$QUIET" = false ]; then
    echo -e "${COLOR_GREEN}✓${COLOR_RESET} $*"
  fi
}

log_warn() {
  if [ "$QUIET" = false ]; then
    echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} $*"
  fi
}

log_error() {
  echo -e "${COLOR_RED}✗${COLOR_RESET} $*" >&2
}

log_info() {
  if [ "$QUIET" = false ]; then
    echo -e "  $*"
  fi
}

log_header() {
  if [ "$QUIET" = false ]; then
    echo ""
    echo -e "${COLOR_BOLD}$*${COLOR_RESET}"
  fi
}

# ============================================================
# Section 2: Argument parsing
# ============================================================

SMOKE_TEST_ONLY=false
INSTALL_MODE="local"
VERSION="latest"
HELP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet|-q)
      QUIET=true
      shift
      ;;
    --smoke-test)
      SMOKE_TEST_ONLY=true
      shift
      ;;
    --local)
      INSTALL_MODE="local"
      shift
      ;;
    --global)
      INSTALL_MODE="global"
      shift
      ;;
    --version)
      if [[ -z "${2:-}" ]]; then
        log_error "--version requires a TAG argument"
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --help|-h)
      HELP=true
      shift
      ;;
    *)
      log_error "Unknown argument: $1"
      echo "Run 'bash install.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

if [ "$HELP" = true ]; then
  cat <<'EOF'
Synapse Install Script

Usage: bash install.sh [options]

Options:
  --quiet, -q       Suppress step-by-step output; only errors and final pass/fail
  --smoke-test      Run only the smoke test (skip install), for post-install verification
  --local           Install directly into current project only (default)
  --global          Install to ~/.synapse/ as shared source, then wire into current project
  --version TAG     Specify release tag to download (default: latest)
  --help, -h        Print this usage message

Examples:
  bash install.sh                           # Local install, latest version
  bash install.sh --global                  # Global install to ~/.synapse/
  bash install.sh --version v3.0            # Install specific version
  bash install.sh --smoke-test              # Test already-installed Synapse
  curl -fsSL https://raw.githubusercontent.com/kvdeurzen/synapse/main/install.sh | bash
EOF
  exit 0
fi

# ============================================================
# Section 3: Target directory and cleanup trap
# ============================================================

# CRITICAL: Capture working directory at script start — curl | bash changes CWD
TARGET_DIR="${TARGET_DIR:-$PWD}"

# Temp directory for tarball extraction
TEMP_DIR=""

cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

# ============================================================
# Section 3b: Smoke-test-only mode
# ============================================================

if [ "$SMOKE_TEST_ONLY" = true ]; then
  SMOKE_SCRIPT="$TARGET_DIR/scripts/smoke-test.mjs"
  SERVER_PATH="$TARGET_DIR/.claude/server/src/index.ts"

  if [ ! -f "$SMOKE_SCRIPT" ]; then
    log_error "scripts/smoke-test.mjs not found. Is Synapse installed?"
    exit 1
  fi
  if [ ! -f "$SERVER_PATH" ]; then
    log_error ".claude/server/src/index.ts not found. Is Synapse installed?"
    exit 1
  fi

  log_header "Running Synapse smoke test..."
  bun run "$SMOKE_SCRIPT" --server-path "$SERVER_PATH"
  exit $?
fi

# ============================================================
# Section 3c: Already-installed detection
# ============================================================

if [ -d "$TARGET_DIR/.synapse" ]; then
  if [ "$QUIET" = true ]; then
    log_info "Synapse already installed — updating to latest..."
  else
    echo ""
    echo -e "${COLOR_YELLOW}Synapse is already installed.${COLOR_RESET}"
    printf "Update to latest? [y/N] "
    read -r REPLY < /dev/tty
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      echo "Skipping update. Run 'bash install.sh --smoke-test' to verify your installation."
      exit 0
    fi
    echo ""
  fi
fi

# ============================================================
# Section 4: Prerequisite checks
# ============================================================

log_header "Checking prerequisites..."

OLLAMA_RUNNING=false

# Check Bun (HARD FAIL)
if ! command -v bun &> /dev/null; then
  log_error "Bun is not installed or not on PATH."
  log_error "Install Bun from: https://bun.sh"
  log_error "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
BUN_VERSION=$(bun --version 2>/dev/null || echo "unknown")
log_step "Bun $BUN_VERSION"

# Check Ollama (SOFT WARN)
if ! command -v ollama &> /dev/null; then
  log_warn "Ollama is not installed."
  log_info "Ollama is needed for /synapse:map and the smoke test."
  log_info "Install from: https://ollama.ai"
else
  OLLAMA_VERSION=$(ollama --version 2>/dev/null | head -1 || echo "unknown")
  log_step "Ollama found ($OLLAMA_VERSION)"

  # Check if Ollama is running
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    OLLAMA_RUNNING=true
    log_step "Ollama is running"

    # Check for nomic-embed-text model
    TAGS_JSON=$(curl -sf http://localhost:11434/api/tags 2>/dev/null || echo '{"models":[]}')
    if echo "$TAGS_JSON" | grep -q "nomic-embed-text"; then
      log_step "nomic-embed-text model found"
    else
      log_warn "nomic-embed-text model not found."
      log_info "Pull it with: ollama pull nomic-embed-text"
    fi
  else
    log_warn "Ollama is installed but not running."
    log_info "Start Ollama before using /synapse:map or running the smoke test."
    log_info "After starting Ollama, you can run: bash install.sh --smoke-test"
  fi
fi

# ============================================================
# Section 5: Download and extract (or use local files)
# ============================================================

log_header "Locating Synapse source files..."

SYNAPSE_SOURCE=""

# Development mode: if run from the synapse repo itself, use local files
if [ -f "$TARGET_DIR/packages/server/src/index.ts" ]; then
  log_info "Running from Synapse repo — using local files (development mode)"
  SYNAPSE_SOURCE="$TARGET_DIR"
else
  # Determine the version to download
  if [ "$VERSION" = "latest" ]; then
    log_info "Fetching latest release tag from GitHub..."
    # Try /releases/latest first (stable releases only)
    LATEST_TAG=$(curl -sf "https://api.github.com/repos/kvdeurzen/synapse/releases/latest" \
      2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' || echo "")
    # Fall back to first release (includes prereleases) if /latest returns nothing
    if [ -z "$LATEST_TAG" ]; then
      LATEST_TAG=$(curl -sf "https://api.github.com/repos/kvdeurzen/synapse/releases?per_page=1" \
        2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' || echo "")
    fi
    if [ -z "$LATEST_TAG" ]; then
      log_error "Could not fetch any release tag from GitHub."
      log_error "Use --version TAG to specify a version manually."
      exit 1
    fi
    VERSION="$LATEST_TAG"
  fi

  log_info "Installing Synapse $VERSION..."

  TARBALL_URL="https://github.com/kvdeurzen/synapse/archive/refs/tags/${VERSION}.tar.gz"
  TEMP_DIR=$(mktemp -d)
  TARBALL_PATH="$TEMP_DIR/synapse.tar.gz"

  log_info "Downloading $TARBALL_URL ..."
  if ! curl -fsSL "$TARBALL_URL" -o "$TARBALL_PATH"; then
    log_error "Failed to download release tarball from $TARBALL_URL"
    exit 1
  fi

  log_info "Extracting tarball..."
  tar -xzf "$TARBALL_PATH" -C "$TEMP_DIR"

  # GitHub extracts to synapse-TAG/ (strips leading 'v' from tag name)
  EXTRACTED_TAG="${VERSION#v}"
  EXTRACTED_DIR="$TEMP_DIR/synapse-${EXTRACTED_TAG}"

  if [ ! -d "$EXTRACTED_DIR" ]; then
    # Try the full tag name (e.g. synapse-v3.0)
    EXTRACTED_DIR_V="$TEMP_DIR/synapse-${VERSION}"
    if [ -d "$EXTRACTED_DIR_V" ]; then
      EXTRACTED_DIR="$EXTRACTED_DIR_V"
    else
      # Fall back to the first directory found
      EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d ! -path "$TEMP_DIR" | head -1)
      if [ -z "$EXTRACTED_DIR" ]; then
        log_error "Could not find extracted tarball directory in $TEMP_DIR"
        exit 1
      fi
    fi
  fi

  SYNAPSE_SOURCE="$EXTRACTED_DIR"
  log_step "Downloaded Synapse $VERSION"
fi

# Validate source has expected structure
if [ ! -d "$SYNAPSE_SOURCE/packages/framework" ] || [ ! -d "$SYNAPSE_SOURCE/packages/server" ]; then
  log_error "Unexpected source structure at $SYNAPSE_SOURCE"
  log_error "Expected: packages/framework/ and packages/server/"
  exit 1
fi

log_step "Source ready: $SYNAPSE_SOURCE"

# ============================================================
# Section 6: File copy
# ============================================================

log_header "Installing Synapse files..."

# Create target directories
mkdir -p \
  "$TARGET_DIR/.claude/agents" \
  "$TARGET_DIR/.claude/hooks/lib" \
  "$TARGET_DIR/.claude/commands/synapse" \
  "$TARGET_DIR/.claude/skills" \
  "$TARGET_DIR/.claude/server" \
  "$TARGET_DIR/.synapse/config"

# Copy framework agents (11 .md files)
AGENT_COUNT=0
for f in "$SYNAPSE_SOURCE/packages/framework/agents/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$TARGET_DIR/.claude/agents/"
  AGENT_COUNT=$((AGENT_COUNT + 1))
done
log_step "Agents: $AGENT_COUNT files"

# Copy hook JS files (not lib/)
HOOK_COUNT=0
for f in "$SYNAPSE_SOURCE/packages/framework/hooks/"*.js; do
  [ -f "$f" ] || continue
  cp "$f" "$TARGET_DIR/.claude/hooks/"
  HOOK_COUNT=$((HOOK_COUNT + 1))
done
# Copy hooks lib/ directory
if [ -d "$SYNAPSE_SOURCE/packages/framework/hooks/lib" ]; then
  cp -r "$SYNAPSE_SOURCE/packages/framework/hooks/lib/." "$TARGET_DIR/.claude/hooks/lib/"
fi
log_step "Hooks: $HOOK_COUNT files + lib/"

# Copy commands (5 .md files)
CMD_COUNT=0
for f in "$SYNAPSE_SOURCE/packages/framework/commands/synapse/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$TARGET_DIR/.claude/commands/synapse/"
  CMD_COUNT=$((CMD_COUNT + 1))
done
log_step "Commands: $CMD_COUNT files"

# Copy skills (18 directories)
SKILL_COUNT=0
for d in "$SYNAPSE_SOURCE/packages/framework/skills/"/*/; do
  [ -d "$d" ] || continue
  SKILL_NAME=$(basename "$d")
  cp -r "$d" "$TARGET_DIR/.claude/skills/$SKILL_NAME"
  SKILL_COUNT=$((SKILL_COUNT + 1))
done
log_step "Skills: $SKILL_COUNT directories"

# Copy server (entire packages/server/)
cp -r "$SYNAPSE_SOURCE/packages/server/." "$TARGET_DIR/.claude/server/"
log_step "Server: copied to .claude/server/"

# Install server dependencies (native tree-sitter binaries require bun install)
# Node.js 24 headers require C++20; tree-sitter's binding.gyp defaults to C++17
log_info "Installing server dependencies (native binaries)..."
if ! (cd "$TARGET_DIR/.claude/server" && CXXFLAGS="-std=c++20" bun install --production 2>&1 | tail -5); then
  log_warn "bun install had errors — attempting to continue."
  log_info "If tree-sitter failed to build, /synapse:map (code indexing) may not work."
  log_info "Fix: cd $TARGET_DIR/.claude/server && CXXFLAGS=-std=c++20 bun install"
fi
log_step "Server dependencies installed"

# Copy config templates (only if not already present — preserve user customizations)
for config_file in trust.toml agents.toml synapse.toml; do
  src="$SYNAPSE_SOURCE/packages/framework/config/$config_file"
  dst="$TARGET_DIR/.synapse/config/$config_file"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    log_info "Created .synapse/config/$config_file"
  elif [ -f "$dst" ]; then
    log_info "Preserved .synapse/config/$config_file (user customization)"
  fi
done
log_step "Config skeleton ready"

# ============================================================
# Section 7: Generate/merge settings.json
# ============================================================

log_header "Configuring Claude Code settings..."

SETTINGS_FILE="$TARGET_DIR/.claude/settings.json"

# Define the Synapse hooks JSON structure with CLAUDE_PROJECT_DIR-prefixed paths
SYNAPSE_HOOKS_JSON='{
  "SessionStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/synapse-startup.js"
        }
      ]
    }
  ],
  "PreToolUse": [
    {
      "matcher": "mcp__synapse__store_decision",
      "hooks": [
        {
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/tier-gate.js"
        },
        {
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/precedent-gate.js"
        }
      ]
    },
    {
      "matcher": "mcp__synapse__.*",
      "hooks": [
        {
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/tool-allowlist.js"
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "bun $CLAUDE_PROJECT_DIR/.claude/hooks/audit-log.js"
        }
      ]
    }
  ]
}'

SYNAPSE_STATUSLINE='{"type":"command","command":"bun $CLAUDE_PROJECT_DIR/.claude/hooks/synapse-statusline.js"}'

if [ ! -f "$SETTINGS_FILE" ]; then
  # Write fresh settings.json
  bun -e "
    const synapseHooks = $SYNAPSE_HOOKS_JSON;
    const statusLine = $SYNAPSE_STATUSLINE;
    const settings = {
      hooks: synapseHooks,
      statusLine: statusLine
    };
    process.stdout.write(JSON.stringify(settings, null, 2) + '\n');
  " > "$SETTINGS_FILE"
  log_step "Created .claude/settings.json"
else
  # Merge Synapse hooks into existing settings.json
  # Strategy: remove existing Synapse hooks (by command string), then append new ones
  EXISTING_CONTENT=$(cat "$SETTINGS_FILE")
  bun -e "
    const existing = $EXISTING_CONTENT;
    const synapseHooks = $SYNAPSE_HOOKS_JSON;
    const statusLine = $SYNAPSE_STATUSLINE;

    // Synapse hook command signatures (used to detect & deduplicate)
    const synapseSignatures = [
      'synapse-startup.js',
      'tier-gate.js',
      'precedent-gate.js',
      'tool-allowlist.js',
      'audit-log.js',
      'synapse-statusline.js',
    ];

    function isSynapseHook(hook) {
      return typeof hook.command === 'string' &&
        synapseSignatures.some(sig => hook.command.includes(sig));
    }

    function isSynapseHookGroup(group) {
      if (!group || !Array.isArray(group.hooks)) return false;
      return group.hooks.some(isSynapseHook);
    }

    // Deep merge hooks: remove existing Synapse entries, then append new ones
    const merged = { ...existing };
    merged.hooks = { ...(existing.hooks || {}) };

    for (const event of ['SessionStart', 'PreToolUse', 'PostToolUse']) {
      const existingEntries = (existing.hooks || {})[event] || [];
      const newEntries = synapseHooks[event] || [];
      // Filter out existing Synapse hook groups
      const preserved = existingEntries.filter(group => !isSynapseHookGroup(group));
      // Append new Synapse hook groups
      merged.hooks[event] = [...preserved, ...newEntries];
    }

    // Merge statusLine: set if not present or if it is a Synapse statusline
    const existingStatus = existing.statusLine;
    if (!existingStatus ||
        (existingStatus.command && synapseSignatures.some(sig => existingStatus.command.includes(sig)))) {
      merged.statusLine = statusLine;
    }

    process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
  " > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
  log_step "Merged Synapse hooks into existing .claude/settings.json"
fi

# ============================================================
# Section 8: Generate/merge .mcp.json
# ============================================================

MCP_FILE="$TARGET_DIR/.mcp.json"

SYNAPSE_MCP_JSON='{
  "command": "bun",
  "args": ["run", ".claude/server/src/index.ts", "--db", ".synapse/data/synapse.db"],
  "env": {
    "OLLAMA_URL": "http://localhost:11434",
    "EMBED_MODEL": "nomic-embed-text"
  }
}'

if [ ! -f "$MCP_FILE" ]; then
  bun -e "
    const synapseMcp = $SYNAPSE_MCP_JSON;
    const mcp = {
      mcpServers: {
        synapse: synapseMcp
      }
    };
    process.stdout.write(JSON.stringify(mcp, null, 2) + '\n');
  " > "$MCP_FILE"
  log_step "Created .mcp.json"
else
  EXISTING_MCP=$(cat "$MCP_FILE")
  bun -e "
    const existing = $EXISTING_MCP;
    const synapseMcp = $SYNAPSE_MCP_JSON;
    const merged = {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers || {}),
        synapse: synapseMcp
      }
    };
    process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
  " > "${MCP_FILE}.tmp" && mv "${MCP_FILE}.tmp" "$MCP_FILE"
  log_step "Merged Synapse into existing .mcp.json"
fi

# ============================================================
# Section 9: Update .gitignore
# ============================================================

GITIGNORE_FILE="$TARGET_DIR/.gitignore"

# Create .gitignore if it doesn't exist
[ -f "$GITIGNORE_FILE" ] || touch "$GITIGNORE_FILE"

GITIGNORE_ENTRIES=(
  ".synapse-audit.log"
  ".synapse/config/local.toml"
  ".synapse/data/"
)

GITIGNORE_UPDATED=false
for entry in "${GITIGNORE_ENTRIES[@]}"; do
  if ! grep -qF "$entry" "$GITIGNORE_FILE"; then
    echo "$entry" >> "$GITIGNORE_FILE"
    GITIGNORE_UPDATED=true
  fi
done

if [ "$GITIGNORE_UPDATED" = true ]; then
  log_step ".gitignore updated with Synapse entries"
else
  log_step ".gitignore already has Synapse entries"
fi

# ============================================================
# Section 10: Smoke test invocation
# ============================================================

SMOKE_SCRIPT_PATH="$TARGET_DIR/scripts/smoke-test.mjs"
SERVER_ENTRY="$TARGET_DIR/.claude/server/src/index.ts"

if [ "$OLLAMA_RUNNING" = true ] && [ -f "$SMOKE_SCRIPT_PATH" ]; then
  log_header "Running smoke test..."
  if bun run "$SMOKE_SCRIPT_PATH" --server-path "$SERVER_ENTRY"; then
    log_step "Smoke test passed"
  else
    log_warn "Smoke test failed — installation completed but verification failed."
    log_info "Diagnose with: bash install.sh --smoke-test"
    log_info "Ensure Ollama is running and 'ollama pull nomic-embed-text' completed."
  fi
elif [ ! -f "$SMOKE_SCRIPT_PATH" ]; then
  log_warn "scripts/smoke-test.mjs not found — skipping smoke test."
else
  log_warn "Ollama is not running — skipping smoke test."
  log_info "Start Ollama, then verify with: bash install.sh --smoke-test"
fi

# ============================================================
# Section 11: Success summary
# ============================================================

echo ""
echo -e "${COLOR_BOLD}${COLOR_GREEN}Synapse installed successfully!${COLOR_RESET}"
echo ""
echo "What was installed:"
log_info "Agents:   $AGENT_COUNT files  → .claude/agents/"
log_info "Hooks:    $HOOK_COUNT files   → .claude/hooks/"
log_info "Commands: $CMD_COUNT files    → .claude/commands/synapse/"
log_info "Skills:   $SKILL_COUNT dirs   → .claude/skills/"
log_info "Server:              → .claude/server/"
log_info "Config:              → .synapse/config/"
log_info "Settings:            → .claude/settings.json  (merged)"
log_info "MCP:                 → .mcp.json  (merged)"
echo ""
echo -e "${COLOR_YELLOW}Note:${COLOR_RESET} .claude/settings.json is not committed to git."
echo "      Each developer runs install.sh to set up their environment."
echo ""
echo -e "${COLOR_RED}IMPORTANT:${COLOR_RESET} ${COLOR_BOLD}Restart Claude Code before running /synapse:init.${COLOR_RESET}"
echo "      MCP servers are loaded at session start. The Synapse MCP server"
echo "      defined in .mcp.json will not be available until you start a new session."
echo "      Exit Claude Code (Ctrl+C or /exit), then reopen it in this directory."
echo ""
echo -e "${COLOR_BOLD}Next steps:${COLOR_RESET}"
echo "  1. Exit this Claude Code session"
echo -e "  2. Reopen Claude Code in this directory: ${COLOR_GREEN}claude${COLOR_RESET}"
echo -e "  3. Run ${COLOR_GREEN}/synapse:init${COLOR_RESET} to initialize this project"
echo ""
