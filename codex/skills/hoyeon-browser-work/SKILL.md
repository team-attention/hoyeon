---
name: hoyeon-browser-work
description: |
  Hoyeon browser automation workflow for Codex. Use when the user invokes
  "$hoyeon-browser-work" or asks Codex to perform a browser task through
  recon-first chromux automation. This adapter loads the canonical browser-work
  skill and follows its Codex runtime surface.
---

# hoyeon-browser-work

This is the Codex-facing wrapper for Hoyeon's canonical `browser-work` skill.

Canonical skill:
- Installed root: `__HOYEON_PLUGIN_ROOT__/skills/browser-work/SKILL.md`
- Repo-local fallback: `skills/browser-work/SKILL.md` from the current Hoyeon repo

When this skill is invoked:

1. Read the canonical skill file above before executing the workflow.
2. Follow the `Runtime Surface` -> `Codex` section in that file.
3. Use Bash-first chromux operations for recon and execution.
4. Dispatch `hoyeon-browser-explorer` when native adapters are loaded.
5. If adapters are unavailable, complete the smallest safe browser pass
   directly and report the fallback.

