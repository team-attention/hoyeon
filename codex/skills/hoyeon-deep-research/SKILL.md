---
name: hoyeon-deep-research
description: |
  Hoyeon deep research workflow for Codex. Use when the user invokes
  "$hoyeon-deep-research" or wants a multi-channel cited research report using
  web search, browser extraction, and optional Gemini. This adapter loads the
  canonical deep-research skill and follows its Codex runtime surface.
---

# hoyeon-deep-research

This is the Codex-facing wrapper for Hoyeon's canonical `deep-research` skill.

Canonical skill:
- Installed root: `__HOYEON_PLUGIN_ROOT__/skills/deep-research/SKILL.md`
- Repo-local fallback: `skills/deep-research/SKILL.md` from the current Hoyeon repo

When this skill is invoked:

1. Read the canonical skill file above before executing the workflow.
2. Follow the `Runtime Surface` -> `Codex` section in that file.
3. Use Codex native subagents when loaded:
   `hoyeon-external-researcher`, `hoyeon-docs-researcher`, and
   `hoyeon-browser-explorer`.
4. Keep Gemini and chromux as Bash-first optional channels.
5. If a channel is unavailable, degrade the channel count and label the gap.

