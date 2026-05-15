---
name: hoyeon-dev-scan
description: |
  Hoyeon developer community scan workflow for Codex. Use when the user invokes
  "$hoyeon-dev-scan" or asks for developer reactions, community opinions, or
  cross-community sentiment on technical topics. This adapter loads the
  canonical dev-scan skill and follows its Codex runtime surface.
---

# hoyeon-dev-scan

This is the Codex-facing wrapper for Hoyeon's canonical `dev-scan` skill.

Canonical skill:
- Installed root: `__HOYEON_PLUGIN_ROOT__/skills/dev-scan/SKILL.md`
- Repo-local fallback: `skills/dev-scan/SKILL.md` from the current Hoyeon repo

When this skill is invoked:

1. Read the canonical skill file above before executing the workflow.
2. Follow the `Runtime Surface` -> `Codex` section in that file.
3. Use Bash-first vendor scripts for chromux, Hacker News, and ProductHunt.
4. Treat ProductHunt as optional when `PRODUCT_HUNT_TOKEN` is missing.
5. Use Codex web search fallback only when a vendor source is unavailable.

