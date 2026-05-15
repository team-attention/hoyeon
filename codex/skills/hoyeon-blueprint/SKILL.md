---
name: hoyeon-blueprint
description: |
  Hoyeon blueprint workflow for Codex. Use when the user invokes
  "$hoyeon-blueprint" or wants to turn requirements.md into a validated
  plan.json and optional contracts.md. This adapter loads the canonical
  blueprint skill and follows its Codex runtime surface.
---

# hoyeon-blueprint

This is the Codex-facing wrapper for Hoyeon's canonical `blueprint` skill.

Canonical skill:
- Installed root: `__HOYEON_PLUGIN_ROOT__/skills/blueprint/SKILL.md`
- Repo-local fallback: `skills/blueprint/SKILL.md` from the current Hoyeon repo

When this skill is invoked:

1. Read the canonical skill file above before executing the workflow.
2. Follow the `Runtime Surface` -> `Codex` section in that file.
3. Mutate `plan.json` only through `hoyeon-cli plan init|merge|validate`.
4. Prefer temporary JSON files over inline complex JSON.
5. Do not rely on hooks or MCP for Codex v1.
6. Use Hoyeon native-agent adapter names when dispatching subagents:
   `hoyeon-code-explorer`, `hoyeon-worker`, `hoyeon-verifier`, and
   `hoyeon-code-reviewer`.

The output contract remains the canonical Hoyeon contract:
`<spec_dir>/plan.json` and, when useful, `<spec_dir>/contracts.md`.
