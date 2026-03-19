#!/bin/bash
# cli-version-sync.sh - SessionStart hook
#
# Purpose: Check if installed hoyeon-cli version matches plugin version.
#          If mismatched, auto-install the correct version.
# Activation: SessionStart (no matcher — runs every session)

set -euo pipefail

PLUGIN_VER=$(jq -r .version "$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null || echo "")
[[ -z "$PLUGIN_VER" ]] && exit 0

CLI_VER=$(hoyeon-cli --version 2>/dev/null || echo "0.0.0")

if [[ "$PLUGIN_VER" != "$CLI_VER" ]]; then
  npm install -g "@team-attention/hoyeon-cli@$PLUGIN_VER" --silent 2>/dev/null && \
    echo "[cli-sync] Updated hoyeon-cli: $CLI_VER → $PLUGIN_VER" || \
    echo "[cli-sync] Warning: Failed to update hoyeon-cli to $PLUGIN_VER (current: $CLI_VER)"
fi
