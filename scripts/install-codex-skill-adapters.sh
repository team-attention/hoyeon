#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SOURCE="$ROOT/codex/skills"
TARGET="$CODEX_HOME/skills"

mkdir -p "$TARGET"

for dir in "$SOURCE"/hoyeon-*; do
  [[ -d "$dir" ]] || continue

  name="$(basename "$dir")"
  dest="$TARGET/$name"

  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$dir"/. "$dest"/

  python3 - "$dest/SKILL.md" "$ROOT" "$name" <<'PY'
from pathlib import Path
import sys

skill_path = Path(sys.argv[1])
root = sys.argv[2]
name = sys.argv[3]

text = skill_path.read_text()
text = text.replace("__HOYEON_PLUGIN_ROOT__", root)

if f"name: {name}" not in text:
    raise SystemExit(f"{skill_path}: missing expected name: {name}")

if "__HOYEON_PLUGIN_ROOT__" in text:
    raise SystemExit(f"{skill_path}: unresolved root placeholder")

skill_path.write_text(text)
PY

  echo "installed $dest"
done

echo "Restart Codex before relying on \$hoyeon-* skill discovery."
