#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$ROOT/fixtures/codex-migration/todo-toggle"
CLI="$ROOT/cli/dist/cli.js"

if [[ ! -f "$CLI" ]]; then
  npm --prefix "$ROOT/cli" run build >/dev/null
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/hoyeon-codex-smoke.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

SPEC_DIR="$WORKDIR/todo-toggle"
mkdir -p "$SPEC_DIR"
cp "$FIXTURE/requirements.md" "$SPEC_DIR/requirements.md"

node "$CLI" plan init "$SPEC_DIR" --type feature >/dev/null
node "$CLI" plan merge "$SPEC_DIR" --patch --json "$(cat "$FIXTURE/plan.patch.json")" >/dev/null
node "$CLI" plan validate "$SPEC_DIR"
node "$CLI" plan list "$SPEC_DIR" --json >/dev/null
node "$CLI" plan task "$SPEC_DIR" --status T1=running --summary "codex smoke claim" >/dev/null
node "$CLI" plan task "$SPEC_DIR" --status T1=done --summary "codex smoke complete" >/dev/null
node "$CLI" plan validate "$SPEC_DIR"

echo "codex blueprint smoke passed: $SPEC_DIR"
