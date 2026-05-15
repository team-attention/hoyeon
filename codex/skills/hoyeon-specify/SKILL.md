---
name: hoyeon-specify
description: |
  Hoyeon requirements workflow for Codex. Use when the user invokes
  "$hoyeon-specify" or wants to turn an unclear goal into structured
  requirements.md for Hoyeon. This adapter loads the canonical specify skill
  and follows its Codex runtime surface.
---

# hoyeon-specify

This is the Codex-facing wrapper for Hoyeon's canonical `specify` skill.

Canonical skill:
- Installed root: `__HOYEON_PLUGIN_ROOT__/skills/specify/SKILL.md`
- Repo-local fallback: `skills/specify/SKILL.md` from the current Hoyeon repo

When this skill is invoked:

1. Read the canonical skill file above before executing the workflow.
2. Follow the `Runtime Surface` -> `Codex` section in that file.
3. Keep durable state changes Bash-first through `hoyeon-cli`.
4. Do not rely on hooks or MCP for Codex v1.
5. Use Hoyeon native-agent adapter names when dispatching subagents:
   `hoyeon-code-explorer`, `hoyeon-worker`, `hoyeon-verifier`, and
   `hoyeon-code-reviewer`.

## Interview obligation (Codex)

The canonical skill is written around the `AskUserQuestion` tool, which Codex
does not have. **Lack of `AskUserQuestion` is NOT a license to skip the
interview.** You must still elicit user intent before writing
`requirements.md`.

Rules:

- Ask **one concise plain-text question at a time**. Wait for the user's
  reply before continuing. Do not batch multiple questions into one turn
  unless they are trivially orthogonal yes/no items.
- Phase 0.1 Mirror is **mandatory** — present your understanding (goal,
  non-goal, ambiguous) and ask the user to approve or revise before
  proceeding.
- Phase 0.2 WHERE inference is **mandatory** — infer `PROJECT_TYPE`,
  `SITUATION`, `AMBITION`, `RISK factors` from the repo, present the
  "Inferred Context" block with evidence and confidence, and ask the user
  to confirm or override.
- Any dimension marked **low confidence** (typically `AMBITION` on a truly
  new project) MUST be asked explicitly. Do not silently default.
- Phase 1 axis interviews still apply. Convert each `AskUserQuestion`
  prompt in the canonical skill into a plain-text question that lists the
  same options inline (e.g., "Who is the primary user? (a) Senior
  developers, (b) Junior developers, (c) Both — or describe your own.").
- Phase 4 Confirmation is **mandatory** — show the requirements preview
  and get explicit user approval before overwriting `requirements.md`.

If the user repeatedly answers "you decide" or "whatever works", follow the
canonical "I don't know" protocol (tentative judgment + Open Decision
entry), not silent inference.

The output contract remains the canonical Hoyeon contract:
`<spec_dir>/requirements.md`.
