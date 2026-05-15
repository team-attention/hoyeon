#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$ROOT/skills/google-search/vendor/web-search.mjs" --check >/tmp/hoyeon-google-search-check.json
node "$ROOT/skills/dev-scan/vendor/chromux-search/web-search.mjs" --check >/tmp/hoyeon-dev-scan-web-check.json
python3 "$ROOT/skills/dev-scan/vendor/hn-search/hn-search.py" --check >/tmp/hoyeon-hn-check.json

# ProductHunt is credential-gated. Its check may fail when PRODUCT_HUNT_TOKEN is
# absent, but the dev-scan skill treats that source as optional.
python3 "$ROOT/skills/dev-scan/vendor/ph-search/ph-search.py" --check >/tmp/hoyeon-ph-check.json || true

python3 - "$ROOT" <<'PY'
from pathlib import Path
import json
import sys
import tomllib

root = Path(sys.argv[1])

skills = {
    "hoyeon-dev-scan": "skills/dev-scan/SKILL.md",
    "hoyeon-browser-work": "skills/browser-work/SKILL.md",
    "hoyeon-deep-research": "skills/deep-research/SKILL.md",
    "hoyeon-google-search": "skills/google-search/SKILL.md",
    "hoyeon-reference-seek": "skills/reference-seek/SKILL.md",
}

agents = {
    "hoyeon-browser-explorer": "agents/browser-explorer.md",
    "hoyeon-docs-researcher": "agents/docs-researcher.md",
    "hoyeon-external-researcher": "agents/external-researcher.md",
}

for name, canonical in skills.items():
    wrapper = root / "codex" / "skills" / name / "SKILL.md"
    text = wrapper.read_text()
    if f"name: {name}" not in text:
        raise SystemExit(f"{wrapper}: missing name")
    if canonical not in text:
        raise SystemExit(f"{wrapper}: missing canonical reference {canonical}")
    if "Runtime Surface" not in (root / canonical).read_text():
        raise SystemExit(f"{canonical}: missing Runtime Surface")

for name, canonical in agents.items():
    adapter = root / "codex" / "agents" / f"{name}.toml"
    data = tomllib.loads(adapter.read_text())
    if data["name"] != name:
        raise SystemExit(f"{adapter}: name mismatch")
    if canonical not in data["developer_instructions"]:
        raise SystemExit(f"{adapter}: missing canonical prompt {canonical}")
    if not (root / canonical).exists():
        raise SystemExit(f"{canonical}: missing canonical prompt")

for path in [
    Path("/tmp/hoyeon-google-search-check.json"),
    Path("/tmp/hoyeon-dev-scan-web-check.json"),
    Path("/tmp/hoyeon-hn-check.json"),
]:
    data = json.loads(path.read_text())
    if not data.get("available"):
        raise SystemExit(f"{path}: expected available true, got {data}")

print("codex research smoke passed")
PY
