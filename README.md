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

1. **Spec-driven** — Every action traces back to a spec. No spec, no work. No matter how long or complex the workflow gets, spec.json keeps it consistent and traceable.

2. **Self-improving** — No spec is perfect on day one. Gaps emerge mid-execution — that's expected. Derived tasks patch the plan at runtime, append-only, fully tracked. The spec gets better *because* it ran, not *before* it ran.

3. **Verification-first** — Every step is verified before moving on. The goal: minimize human review by letting agents catch what agents can catch. AC Quality Gate, independent verifiers, multi-model code review — all pushing toward autonomous verification.

4. **Dynamic composition** — No fixed pipeline. Skills and agents assemble on-the-fly based on what you asked. A bug fix routes differently than a feature request. The same worker agent serves different specs in different combinations.

## When Plans Meet Reality

No spec survives execution perfectly. Tests fail. Reviewers find issues. Integration breaks things that unit tests missed.

Most systems either halt on first failure or silently push through. Hoyeon does neither — it **adapts the plan at runtime** while keeping full traceability.

```
/execute
  │
  T1: Worker → Verify → FAIL (billing calc off by 1)
  │                       │
  │                 triage: RETRY
  │                       │
  │                 T1.retry-1 created (derived task)
  │                       │
  │                 Worker fix → re-verify → PASS ✓
  │
  T2: Worker → Verify → PASS ✓
  │
  Code Review → NEEDS_FIXES (unused import)
  │               │
  │         T2.code_review-1 created
  │               │
  │         fix → re-review → SHIP ✓
  │
  Final Verify → PASS ✓
  │
  Report: planned 2, derived 2, drift ratio 1.0
```

Every runtime fix is a **derived task** — tracked in spec.json with full provenance (who found it, why, which task it came from). After execution, `spec drift` shows exactly how much reality diverged from the plan.

Three rules keep it safe: **append-only** (never modify existing tasks), **depth-1** (no chains of derived tasks), **circuit breaker** (max 2 retries per path).

See [docs/derived-task-system.md](docs/derived-task-system.md) for the full architecture.

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

### Installation

```bash
# Add the marketplace first
claude plugin marketplace add team-attention/hoyeon

# Then install the plugin
claude plugin install hoyeon
```

Both methods install the same plugin. After installing, set up the CLI:

```bash
npm install -g @team-attention/hoyeon-cli
```

### First Use

```bash
# Start a spec-driven workflow
/specify "add dark mode toggle to settings page"

# Or jump straight to task planning
/quick-plan "refactor auth module and add rate limiting"

# Fix a bug with root cause analysis
/bugfix "login fails when session expires"
```

Type `/` in Claude Code to see all available skills.

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
