---
name: clarify
description: |
  "/clarify", "clarify this", "keep asking until clear", "remove ambiguity",
  "clarify requirements", "clarify design", "clarify the plan",
  "질문 계속해", "모호한 게 없게", "명확해질 때까지", "계속 물어봐",
  "Q&A로 정리", "질문답변 기록", "요구사항 명확화", "설계 명확화".
  Relentless ambiguity-resolution interview that records Q&A under
  .hoyeon/clarify/<topic>/ and hands off to specify/blueprint/docs when clear.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - Edit
  - AskUserQuestion
validate_prompt: |
  Must ask one question at a time, provide a recommended answer, record Q&A,
  and continue until the auditor finds no material ambiguity or the user stops.
  Must not implement code or write final requirements/plan files.
---

# /clarify — Ambiguity Resolution Interview

`clarify` is a pre-spec interview loop. It is closer to `grill-me` than
`specify`: ask one precise question at a time, recommend an answer, record the
answer, and keep going until material ambiguity is gone.

Do not implement, plan execution, or generate final requirements. The output is
traceable context for the next workflow.

## Runtime Surface

### Claude Code

- Use `AskUserQuestion` for mode selection and branching decisions.
- Use `Task(subagent_type="clarity-auditor")` at audit boundaries.
- Use `Task(subagent_type="code-explorer")` when a question can be answered
  from the codebase instead of asking the user.

### Codex

- Use Codex-native structured input when available; otherwise ask one concise
  plain-text question at a time.
- Use `hoyeon-clarity-auditor` when native adapters are loaded.
- Use `hoyeon-code-explorer` when codebase exploration can answer the question.
- If native adapters are unavailable, perform the smallest direct read-only
  pass and record that fallback in `qa-log.md`.

## Artifacts

Create a topic directory:

```text
.hoyeon/clarify/<topic-slug>/
├── qa-log.md
└── clarity-summary.md
```

Read templates when writing artifacts:
- `templates/qa-log.md`
- `templates/clarity-summary.md`

Use a short kebab-case topic slug. If the current repo already has a Hoyeon
spec directory for the same work, mention it in frontmatter as `related_spec`.

## Modes

Infer the mode from the user's request. If uncertain, ask first.

| Mode | Use For | Main Question Lens | Clear Enough When |
|------|---------|--------------------|-------------------|
| `requirements` | Product/feature intent before `/specify` | users, goal, non-goals, success, scope, flows, edge cases, constraints | `$hoyeon-specify --context clarity-summary.md` can start without guessing |
| `design` | Architecture or implementation direction before planning | alternatives, boundaries, interfaces, data flow, trade-offs, risks, reversibility, verification | chosen direction, rejected alternatives, risks, and validation are explicit |
| `domain` | Terms, concepts, and domain model | canonical terms, definitions, relationships, edge cases, conflicts with docs/code | key terms have stable definitions and unresolved terms are listed |
| `plan` | Work sequencing before blueprint/execution | dependencies, acceptance criteria, blocking decisions, validation, rollback, ownership | no blocking execution decision remains |

Frontmatter fields:

```yaml
mode: requirements | design | domain | plan
status: active | complete | paused
target_handoff: hoyeon-specify | hoyeon-blueprint | docs | none
```

Default mode is `requirements`.

## Core Loop

1. **Mirror** — State the current understanding in 2-4 bullets.
2. **Map ambiguity branches** — List the active ambiguity branches in memory:
   vague terms, hidden assumptions, unresolved forks, missing criteria,
   external facts/code facts to verify.
3. **Ask one question** — Ask exactly one question. Include:
   - why this question matters
   - your recommended answer
   - the trade-off behind the recommendation
4. **Explore instead of asking** — If the answer is discoverable from the
   codebase or existing docs, explore first and ask only if evidence conflicts.
5. **Record immediately** — Append to `qa-log.md` after every exchange.
6. **Classify** — Mark the branch as `resolved`, `ambiguous`, `assumption`, or
   `deferred`.
7. **Audit** — After 3-5 Q&A turns, after each major branch, and before
   summary, call the clarity auditor with the full `qa-log.md`.
8. **Continue or summarize** — If auditor returns `CONTINUE`, ask the next
   suggested question. If `SUFFICIENT`, write `clarity-summary.md`.

## Question Rules

- Ask one question at a time.
- Always provide a recommended answer unless the question is purely factual and
  must be discovered.
- Prefer concrete options over open-ended prompts, but allow "Other".
- Do not ask the user for facts that code/docs can answer.
- Do not repeat a question. If the user does not know, choose a tentative
  default, mark it `assumption` or `deferred`, and move on.
- Keep pressure on vague words: "fast", "simple", "good", "production-ready",
  "secure", "later", "nice UX", "admin", "sync", "done".

## Mode-Specific Checks

### requirements

Required branches:
- primary user or actor
- problem and desired outcome
- explicit non-goals
- success criteria
- core happy path
- important edge/failure states
- constraints and risk modifiers

### design

Required branches:
- candidate approaches
- chosen direction and why
- rejected alternatives and why
- boundaries and interfaces
- state/data flow
- failure modes
- reversibility and migration
- verification strategy

### domain

Required branches:
- canonical terms
- term definitions
- relationships between terms
- overloaded or conflicting terms
- boundary scenarios
- code/doc contradictions, if a repo exists
- doc target: `CONTEXT.md`, ADR, glossary, or no docs

Do not update `CONTEXT.md` or ADRs unless the user explicitly asks for
docs-mode updates. By default, write candidates into `clarity-summary.md`.

### plan

Required branches:
- acceptance criteria
- task dependencies
- blocking decisions
- validation evidence
- rollback/recovery
- ownership or handoff
- out-of-scope work

## Q&A Log Format

Append entries under `## Q&A`:

```markdown
### Q<N>: <short branch title>
- mode: <mode>
- branch: <branch id or name>
- status: resolved | ambiguous | assumption | deferred
- asked: <question>
- recommended: <recommended answer>
- answer: <user answer or discovered evidence>
- rationale: <why this resolves or does not resolve ambiguity>
```

Maintain `## Open Ambiguities` as the current queue. Remove resolved items.

## Auditor Contract

Send the auditor:
- full `qa-log.md`
- mode
- current branch, if any
- question count since last audit

Auditor returns:
- `CONTINUE` with material ambiguities and suggested next question, or
- `SUFFICIENT` with remaining non-blocking assumptions.

Only stop as complete when the auditor says `SUFFICIENT` or the user explicitly
stops. If the user stops early, set status to `paused`.

## Handoff

After `SUFFICIENT`, write `clarity-summary.md` and present one next action:

| Mode | Default Handoff |
|------|-----------------|
| `requirements` | `$hoyeon-specify --context .hoyeon/clarify/<topic>/clarity-summary.md "<topic>"` |
| `design` | `$hoyeon-blueprint --context .hoyeon/clarify/<topic>/clarity-summary.md` or ADR candidate |
| `domain` | docs/glossary update, if requested |
| `plan` | `$hoyeon-blueprint` or direct execution planning |

Do not run the handoff workflow unless the user asks.

## Hard Rules

1. No implementation.
2. No final `requirements.md`, `plan.json`, or ADR unless explicitly requested.
3. One question at a time.
4. Recommended answer required for each user-facing question.
5. Record each exchange before asking the next question.
6. Continue until `SUFFICIENT`, `paused`, or explicit user stop.
