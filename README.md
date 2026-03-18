# hoyeon

Without structure, your agent:
- Guesses what to build — builds the wrong thing
- Skips verification — ships broken code
- Forgets what it decided 3 turns ago — starts over

**All you need is requirements. Agents handle everything else.**

Hoyeon is a Claude Code plugin that derives requirements from your intent, generates verification scenarios, plans tasks, and executes them with parallel agents — all through a single `spec.json` contract.

[![npm](https://img.shields.io/npm/v/@team-attention/hoyeon-cli)](https://www.npmjs.com/package/@team-attention/hoyeon-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Principles

> Four ideas that shape every decision in the system.

**Spec-driven** — Every action traces back to a spec. No spec, no work. No matter how long or complex the workflow gets, `spec.json` keeps it consistent and traceable.

**Self-improving** — No spec is perfect on day one. Gaps emerge mid-execution — that's expected. The spec gets better *because* it ran, not *before* it ran. Blockers are detected, fix tasks are derived at runtime, append-only, fully tracked.

**Verification-first** — Every step is verified before moving on. AC Quality Gate, independent verifiers, multi-model code review — all pushing toward minimizing human review by letting agents catch what agents can catch.

**Dynamic composition** — No fixed pipeline. Skills and agents assemble on-the-fly based on what you asked. A bug fix routes differently than a feature request. The same worker agent serves different specs in different combinations.

---

## See It In Action

```
You:  /specify "add dark mode toggle to settings page"

  Hoyeon interviews you:
  ├─ "Should it follow system preference or be manual?"
  ├─ "Which components need dark variants?"
  └─ "Any accessibility requirements?"

  → spec.json generated (requirements, scenarios, verify commands, tasks)

You:  /execute

  Hoyeon orchestrates:
  ├─ Worker agents implement each task in parallel
  ├─ Quality gates auto-validate before each commit
  ├─ Multi-model code review (Codex + Gemini + Claude)
  └─ Final Verify checks goal + constraints + AC holistically

  → Done. Every file change traced back to a requirement.
```

## How It Works

### 1. Requirements Derivation (`/specify`)

A layer-based derivation chain turns your intent into a structured spec:

```
L0: Goal          "add dark mode toggle"
 ↓
L1: Context       codebase analysis, UX review, docs research
 ↓
L2: Decisions     "manual toggle, CSS variables, persist in localStorage"
 ↓
L3: Requirements  R1: "Toggle switches theme" → scenarios with verify commands
 ↓
L4: Tasks         T1: "Add toggle component" → file_scope, AC, steps
 ↓
L5: Review        AC quality gate, plan approval
```

Each layer has a **merge checkpoint** (validated by CLI) and a **gate-keeper** (step-back review via agent team). Nothing advances without passing both.

### 2. Agent Execution (`/execute`)

The orchestrator reads `spec.json` and dispatches parallel worker agents:

```
Worker T1 ──→ Commit T1
Worker T2 ──→ Commit T2    (parallel if disjoint files)
Worker T3 ──→ Commit T3
         ↓
    Code Review (multi-model: Codex + Gemini + Claude)
         ↓
    Final Verify (holistic: goal + constraints + AC + requirements)
         ↓
    Report
```

Workers self-read their task spec, run verification commands, and report results. If a scope blocker is hit, the system derives a fix task and re-runs — append-only, fully tracked.

### 3. The Spec Contract

`spec.json` is the single source of truth. Everything reads from it, everything writes to it.

```json
{
  "meta": { "goal": "...", "mode": { "depth": "standard" } },
  "context": { "research": {}, "decisions": [], "assumptions": [] },
  "constraints": [{ "rule": "...", "verified_by": "machine" }],
  "requirements": [{
    "behavior": "Toggle switches between light and dark theme",
    "scenarios": [{
      "given": "user is on settings page",
      "when": "user clicks dark mode toggle",
      "then": "theme switches to dark mode",
      "verified_by": "machine",
      "verify": { "type": "command", "run": "npm test -- --grep 'dark mode'" }
    }]
  }],
  "tasks": [{ "id": "T1", "action": "...", "acceptance_criteria": {} }]
}
```

The chain: **requirement → scenario → verify command → pass/fail**. Full traceability from intent to committed code.

## Quick Start

```bash
# Install the plugin
claude plugin add team-attention/hoyeon
npm install -g @team-attention/hoyeon-cli

# Start
/specify "add dark mode toggle to settings page"
/execute
```

## Skills at a Glance

| Category | What you're doing | Skills |
|----------|------------------|--------|
| **Understand** | Gather requirements, generate specs | `/specify` `/quick-plan` `/discuss` `/deep-interview` `/mirror` |
| **Research** | Analyze codebase, find references, scan communities | `/deep-research` `/dev-scan` `/reference-seek` `/google-search` `/browser-work` |
| **Decide** | Evaluate tradeoffs, multi-perspective review | `/council` `/tribunal` `/tech-decision` `/stepback` |
| **Build** | Execute specs, fix bugs, iterate | `/execute` `/ralph` `/rulph` `/bugfix` |
| **Reflect** | Verify changes, extract learnings | `/check` `/compound` `/scope` `/issue` |

24 skills. 20 specialized agents. You interact with skills — agents work behind the scenes.

## Architecture

```
/specify (derive)  ──→  spec.json  ──→  /execute (orchestrate)  ──→  verified result
  L0→L1→L2→L3→L4→L5      │              Worker → Commit (×N)         │
  gate-keeper at each     │              Code Review                   │
  layer transition        │              Final Verify                  │
                          │                                            │
                    requirements +                              traceability:
                    scenarios +                                 every file change
                    verify commands                             → task → requirement
```

- **24 skills** — slash commands you invoke
- **20 agents** — workers, reviewers, debuggers, verifiers orchestrated behind the scenes
- **18 hooks** — automate pipeline transitions, guard writes, enforce quality gates

See [docs/architecture.md](docs/architecture.md) for the full pipeline diagram.

## CLI

`hoyeon-cli` manages spec.json validation and session state:

```bash
hoyeon-cli spec init "project-name"        # Create new spec
hoyeon-cli spec merge spec.json --json ...  # Validated merge
hoyeon-cli spec check spec.json             # Verify completeness
hoyeon-cli spec guide <section>             # Show field structure
```

See [docs/cli.md](docs/cli.md) for the full command reference.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
