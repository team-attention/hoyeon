---
name: hoyeon-discuss
description: |
  Hoyeon Socratic discussion workflow for Codex. Use when the user invokes
  "$hoyeon-discuss", "/discuss", asks to think through an idea, challenge
  assumptions, clarify requirements before planning, run a deep/scored
  discussion, or says Korean phrases like "같이 생각해보자", "문제 정의",
  "이거 어떻게 생각해?", "요구사항이 불명확", or "아이디어 구체화".
---

# hoyeon-discuss

This is the Codex-facing wrapper for Hoyeon's canonical `discuss` skill.

Canonical skill:
- Installed root: `__HOYEON_PLUGIN_ROOT__/skills/discuss/SKILL.md`
- Repo-local fallback: `skills/discuss/SKILL.md` from the current Hoyeon repo

When this skill is invoked:

1. Read the canonical skill file above before executing the workflow.
2. Follow its DIAGNOSE -> PROBE -> SYNTHESIZE flow.
3. Stay in discussion mode: challenge assumptions, surface blind spots, and
   help the user clarify the idea before implementation planning.
4. Do not generate `PLAN.md`, mutate `plan.json`, run implementation, or
   prescribe a solution as the main output.
5. For `--deep`, dispatch `hoyeon-code-explorer` for codebase context when
   native adapters are loaded. If unavailable, do the smallest read-only
   local exploration directly and report the fallback.
6. For `/specify` handoff, point the user to `$hoyeon-specify` and pass along
   the generated `.hoyeon/discuss/<topic-slug>/insights.md` context when saved.
7. Use Codex-native user interaction. If a structured question tool is not
   available in the current mode, ask the same decision question in concise
   plain text and continue from the user's answer.

The output contract remains the canonical Hoyeon contract:
discussion insights in conversation, optionally saved to
`.hoyeon/discuss/<topic-slug>/insights.md`, with a handoff suggestion to
`$hoyeon-specify` only after synthesis.
