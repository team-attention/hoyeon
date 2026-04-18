---
name: analyze-oss
description: |
  Analyze an open-source project from What/Why perspective (not how-it's-implemented).
  Use when the user says "/analyze-oss", "분석해줘 이 오픈소스", "이 레포 뭐하는거야",
  "analyze this repo", "what does X do", "이거 왜 쓰는거야", "이 라이브러리 분석",
  provides a GitHub URL and wants understanding, or asks to deeply understand
  an OSS project's purpose, value, target users, and usage flow.
  Clones the repo to ~/opensource-analysis/<repo-name>/ (git pull if already exists),
  dispatches parallel subagents per analysis lens, then synthesizes a What/Why-focused
  report in chat. Supports optional user-specific follow-up questions.
validate_prompt: |
  Output must contain these sections:
  - What (one-line definition + core capabilities)
  - Why (problem solved, alternatives, differentiator)
  - Who / When (target users, use cases)
  - How it's used (user-perspective flow, not implementation)
  - (If user provided custom questions) Custom Q&A section
  Output must start with "## Analyze OSS:" header.
---

# Analyze OSS — What/Why-focused open source analyzer

Clone an open-source repo locally, analyze it through multiple lenses in parallel
via subagents, and deliver a **What/Why-focused** report in chat.

The goal is **not** to produce an implementation deep-dive. The goal is to help
the user quickly decide "is this what I need, and why would I use it?" and then
answer any custom questions they have about the repo.

## When to use

- User gives a GitHub URL and wants to understand what it is / why it exists
- User asks "what does this repo do?", "이거 뭐하는거야?", "이거 왜 쓰는거야?"
- User is evaluating whether to adopt a library
- User wants a quick intellectual onboarding to an OSS project

## Input

Accept any of:
- GitHub URL: `https://github.com/owner/repo` (or `git@github.com:...`)
- `owner/repo` shorthand
- Optional custom questions appended: `analyze-oss owner/repo "X 대비 어떤지, Y 유스케이스 맞는지"`

If the URL is ambiguous, ask the user to confirm before cloning.

## Execution

### Phase 1 — Fetch repo

Target directory: `~/opensource-analysis/<repo-name>/`

```bash
BASE=~/opensource-analysis
REPO_NAME=<derived from URL>
TARGET=$BASE/$REPO_NAME
mkdir -p $BASE
if [ -d "$TARGET/.git" ]; then
  cd "$TARGET" && git pull --ff-only
else
  git clone --depth 50 <repo-url> "$TARGET"
fi
```

Notes:
- `--depth 50` keeps clone fast; enough for recent commit signals.
- If `git pull` fails (local changes, diverged), warn the user — don't force.
- Capture the absolute path of `$TARGET`; all subagents must use this absolute path.

### Phase 2 — Quick recon (main agent, before dispatch)

Read these in parallel to build dispatch context (don't deep-read, just skim):
- `README*` (pick the most prominent)
- `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` (whichever exist)
- Top-level directory listing
- `docs/` top-level listing if present
- Recent 10 commits: `git log --oneline -10`

Extract: repo name, elevator pitch (if README has one), primary language, rough size.

This recon is **only** to brief subagents well — do not write the report yet.

### Phase 3 — Parallel subagent dispatch

Spawn the following subagents in **one message, in parallel**. Each gets:
- Absolute path to the cloned repo
- The recon summary from Phase 2
- Instructions to read only what they need (not the whole repo)
- Instruction to return a structured markdown block

**Subagents (4 default lenses):**

1. **what-lens** — "What is this?"
   - Read: README, top-level docs, package descriptions
   - Produce: one-line definition (≤25 words), 3–5 core capabilities (one sentence each), the repo's own self-description verbatim if useful
   - Avoid implementation detail. Stay at the "capabilities the user gets" layer.

2. **why-lens** — "Why does this exist?"
   - Read: README motivation/intro sections, CHANGELOG for origin context, any `MOTIVATION.md` / `docs/why*`
   - Produce: the problem it solves (in plain language), what you'd have to do without it, 2–3 named alternatives and how this differs, the distinct value proposition
   - If motivation is not explicit, infer from the examples and features — but mark inferences as "[inferred]".

3. **who-when-lens** — "Who uses this, and when?"
   - Read: README use-cases/examples, `examples/`, showcase/users sections, issues labeled "question" or similar for real-world usage signals
   - Produce: target user personas (2–4), concrete use cases (with short scenarios), situations where you'd *not* use this / known limitations

4. **how-used-lens** — "How does a user actually use this?" (user-perspective, not implementation)
   - Read: Quickstart in README, `examples/`, minimal usage snippets
   - Produce: install step, minimal "hello world", typical usage flow from zero → first success (as a narrative, not code walkthrough), main interaction touchpoints (CLI? API? config file? SDK?)
   - Explicitly exclude internal architecture, source-level design, class diagrams.

**If the user provided custom questions**, spawn one more subagent per distinct question:

5. **custom-Q{n}-lens** — answer one specific user question
   - Brief it with the full question verbatim and the recon summary
   - Tell it to read whatever files it needs (grep liberally) to answer, and to cite file paths in its answer
   - If it cannot answer from the repo alone, say so — don't fabricate

### Phase 4 — Synthesize

Main agent takes all subagent outputs and composes the final report in chat.

**Output template** (strict):

```markdown
## Analyze OSS: <repo-name>

**Repo:** <url>  ·  **Language:** <lang>  ·  **Cloned at:** <abs path>

### What
<one-line definition>

**Core capabilities:**
- …
- …

### Why
**Problem:** <plain language>
**Without it:** <what you'd do otherwise>
**Alternatives & differentiator:** <named alternatives, 1 line each, then what makes this different>

### Who / When
**Target users:** …
**Use cases:** …
**Not a good fit when:** …

### How it's used (user perspective)
**Install:** `…`
**Minimal example:** <short snippet or description — keep brief>
**Typical flow:** <zero-to-first-success narrative, 3–6 steps>
**Interaction surface:** <CLI / HTTP API / SDK / config / etc.>

### Custom Q&A   ← only if user provided questions
**Q: <question>**
A: <answer with file path citations>

### Notes
- [inferred] markers if any
- Anything surprising / red flags / caveats worth surfacing
```

### Phase 5 — Offer follow-ups

After delivering the report, ask:
> "Anything you want me to dig into further? (e.g. compare with X, how auth works, licensing details, etc.)"

For follow-ups, dispatch additional subagents with the same pattern — one question, one subagent — and extend the Custom Q&A section.

## Principles

- **What/Why over How.** The user does not want an architecture lecture. Unless they explicitly ask "how is X implemented", stay at the user-facing layer.
- **Parallel by default.** All independent lenses go in one message. Sequential dispatch wastes wall-clock time.
- **Cite file paths** when claiming something about the repo. "README says X" is better than just "X".
- **Mark inferences.** If something isn't stated in the repo, say `[inferred]`.
- **Don't overclaim popularity or quality.** You have shallow clone + local info; avoid "this is widely used" unless README/shields show it.
- **Chat output only.** Do not write a report file unless the user explicitly asks.

## Edge cases

- **Private or 404 repo:** git clone will fail — surface the error and ask the user.
- **Huge repo (>500MB):** `--depth 50` already helps; if still slow, warn the user and proceed.
- **Monorepo:** if the repo contains multiple packages, ask the user which sub-package to focus on before dispatching subagents (or offer an overview of all packages).
- **Non-code repos (awesome-lists, docs):** adapt — the "how it's used" lens becomes "how do you navigate/consume this".
- **Stale clone with local changes:** don't overwrite. Report to user, ask whether to re-clone fresh into a sibling directory.
