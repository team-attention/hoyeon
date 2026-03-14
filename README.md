# hoyeon

Without structure, your agent:
- Guesses what to build — builds the wrong thing
- Skips verification — ships broken code
- Forgets what it decided 3 turns ago — starts over

**Don't teach your agent new tricks. Harness the ones it already has.**

Hoyeon is a Claude Code plugin that takes the tools, agents, and workflows your agent already has — and makes sure they fire at the right moment, in the right order, with verification at every step.

[![npm](https://img.shields.io/npm/v/@team-attention/hoyeon-cli)](https://www.npmjs.com/package/@team-attention/hoyeon-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Principles

1. **Spec-based** — every action traces back to a spec. `hoyeon-cli` validates and enforces spec.json deterministically — no ambiguity, no drift.
2. **Dynamic task composition** — your request is decomposed into tasks, matched to the right skills and agents, and assembled on the fly.
3. **Adaptation flow** — execution is predictable, but when things break, verification-first triage re-routes the plan instead of failing silently.

## See It In Action

```
You:  /specify "add dark mode toggle to settings page"

  Hoyeon interviews you:
  ├─ "Should it follow system preference or be manual?"
  ├─ "Which components need dark variants?"
  └─ "Any accessibility requirements?"

  → spec.json generated (requirements, acceptance criteria, tasks)

You:  /execute

  Hoyeon orchestrates:
  ├─ Research agents analyze codebase in parallel
  ├─ Worker agents implement each task
  ├─ Quality gates auto-validate before each write
  └─ Verification confirms acceptance criteria

  → Done. Every file change traced back to a spec.
```

## Quick Start

```bash
claude plugin add team-attention/hoyeon
```

Then type `/specify` in Claude Code to start your first spec-driven workflow.

## How It Works

```
/specify (interview) ──→ spec.json ──→ /execute (orchestrate) ──→ verified result
   auto-validates ↗      guards writes ↗      verifies before exit ↗
```

You describe what you want. Hoyeon interviews you to clarify intent, generates a structured spec, then executes it with parallel agents — auto-validating at every step. No work happens without a spec. No code ships without verification.

## What Makes Hoyeon Different

| Approach | How it works | Tradeoff |
|----------|-------------|----------|
| Rigid specs | Write a full plan upfront, then execute | Breaks when requirements are ambiguous |
| Vibes coding | Just ask the AI and hope for the best | No verification, no traceability |
| **Dynamic assembly** | Skills assemble specs on-demand, quality gates enforce at every step | Claude Code only (for now) |

## Skills at a Glance

| Category | What you're doing | Skills |
|----------|------------------|--------|
| **Understand** | Gather requirements, generate specs | `/specify` `/quick-plan` `/discuss` `/deep-interview` `/mirror` |
| **Research** | Analyze codebase, find references, scan communities | `/deep-research` `/dev-scan` `/reference-seek` `/google-search` `/browser-work` |
| **Decide** | Evaluate tradeoffs, get multi-perspective analysis | `/council` `/tribunal` `/tech-decision` `/stepback` |
| **Build** | Execute specs, fix bugs, iterate on tasks | `/execute` `/ralph` `/rulph` `/bugfix` |
| **Reflect** | Verify changes, extract learnings, create issues | `/check` `/compound` `/scope` `/issue` `/skill-session-analyzer` |

24 skills backed by 20 specialized agents that you never interact with directly.

## CLI

`hoyeon-cli` manages spec.json validation and session state. Install globally:

```bash
npm install -g @team-attention/hoyeon-cli
```

See [docs/cli.md](docs/cli.md) for the full command reference.

## Architecture

The plugin runs on a specify-execute pipeline with hook-driven automation:

- **24 skills** — slash commands you invoke directly
- **20 agents** — specialized workers (researcher, reviewer, debugger, verifier) orchestrated behind the scenes
- **18 hooks** — scripts that automate pipeline transitions, guard writes, enforce quality gates, and manage session lifecycle

See [docs/architecture.md](docs/architecture.md) for the full pipeline diagram, agent patterns, and hook lifecycle.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
