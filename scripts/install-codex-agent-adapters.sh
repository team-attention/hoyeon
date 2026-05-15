#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
TARGET="$CODEX_HOME/agents"

mkdir -p "$TARGET"

for file in "$ROOT"/codex/agents/*.toml; do
  install -m 0644 "$file" "$TARGET/$(basename "$file")"
  echo "installed $TARGET/$(basename "$file")"
done

echo "Restart Codex before relying on hoyeon-* native agent names."
