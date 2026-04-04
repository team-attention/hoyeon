# hoyeon

English | [한국어](README.ko.md) | [中文](README.zh.md) | [日本語](README.ja.md)

**All you need is requirements.**
A Claude Code plugin that derives requirements from your intent, verifies every derivation, and delivers traced code — without you writing a plan.

[![npm](https://img.shields.io/npm/v/@team-attention/hoyeon-cli)](https://www.npmjs.com/package/@team-attention/hoyeon-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Quick Start](#quick-start) · [Philosophy](#requirements-are-not-written) · [The Chain](#the-derivation-chain) · [Commands](#commands) · [Agents](#twenty-one-minds)

---

> *AI can build anything. The hard part is knowing what to build — precisely.*

Most AI coding fails at the **input**, not the output. The bottleneck isn't AI capability. It's human clarity. You say "add dark mode" and there are a hundred decisions hiding behind those three words.

Most tools either force you to enumerate them upfront, or ignore them entirely. Hoyeon does neither — it **derives** them. Layer by layer. Gate by gate. From intent to verified code.

---

## Requirements Are Not Written

> *You don't know what you want until you're asked the right questions.*

Requirements aren't artifacts you produce before coding. They're **discoveries** — surfaced through structured interrogation of your intent. Every "add a feature" conceals unstated assumptions. Every "fix the bug" hides a root cause you haven't named yet.

Hoyeon's job is to find what you haven't said.

```
  You say:     "add dark mode toggle"
                    │
  Hoyeon asks: "System preference or manual?"     ← assumption exposed
               "Which components need variants?"   ← scope clarified
               "Persist where? How?"               ← decision forced
                    │
  Result:      3 requirements, 8 sub-requirements, 4 tasks — all linked
```

This is not just process. It's built on three beliefs about how AI coding should work.

### 1. Requirements over tasks

> *Get the requirements right, and the code writes itself. Get them wrong, and no amount of code fixes it.*

Most AI tools jump straight to tasks — "create file X, edit function Y." But tasks are derivatives. They change when requirements change. If you start from tasks, you're building on sand.

Hoyeon starts from **goals** and derives downward through a layer chain:

```
Goal → Decisions → Requirements → Sub-requirements → Tasks
```

Requirements are refined from multiple angles before a single line of code is written. Interviewers probe assumptions. Gap analyzers find what's missing. UX reviewers check user impact. Tradeoff analyzers weigh alternatives. Each perspective sharpens the requirements until they're precise enough to generate verifiable sub-requirements.

The chain is directional: **requirements produce tasks, never the reverse.** If requirements change, sub-requirements and tasks are re-derived. This is why Hoyeon can recover from mid-execution blockers — the requirements are still valid, only the tasks need adjustment.

### 2. Determinism by design

> *LLMs are non-deterministic. The system around them doesn't have to be.*

An LLM given the same prompt twice may produce different code. This is the fundamental challenge of AI-assisted development. Hoyeon's answer: **constrain the LLM with programmatic control** so that non-determinism doesn't propagate.

Three mechanisms enforce this:

- **`spec.json` as single source of truth** — Every agent reads from and writes to the same structured spec. No agent invents its own context. No information lives only in a conversation. The spec is the shared memory that survives context windows, compaction, and agent handoffs.

- **CLI-enforced structure** — `hoyeon-cli` validates every merge to `spec.json`. Field names, types, required relationships — all checked programmatically before the LLM ever sees the data. The CLI doesn't suggest structure; it **rejects** invalid structure.

- **Derivation chain as contract** — Goal → Decisions → Requirements → Sub-requirements → Tasks are linked. Each layer references the one above it. A sub-requirement traces to a requirement. A task traces to requirements via `fulfills`. If the chain breaks, the gate blocks. This means: **if you have valid requirements, the system will produce a result** — deterministically routed, even if the LLM's individual outputs vary.

The LLM does the creative work. The system ensures it stays on rails.

### 3. Machine-verifiable by default

> *If a human has to check it, the system failed to automate it.*

Every sub-requirement in `spec.json` is a testable behavioral statement:

```json
{
  "id": "R1.1",
  "behavior": "Clicking dark mode toggle switches theme to dark"
}
```

Sub-requirements serve as acceptance criteria. Workers verify their own implementation against sub-requirement behaviors (with optional `--tdd` for test-first workflow). Multi-model code review (Codex + Gemini + Claude) runs independently and synthesizes a consensus verdict.

Human review is reserved for what machines genuinely can't judge — UX feel, business logic correctness, naming decisions. Everything else runs automatically, every time, without asking.

### 4. Knowledge compounds

> *Most AI tools start from zero every session. Hoyeon remembers.*

Every execution generates structured learnings — not logs, not chat history, but **typed knowledge**: what went wrong, why, and the rule to prevent it next time.

```
  /execute runs → Worker hits edge case
       │
  Worker records:
    { problem: "localStorage quota exceeded at 5MB",
      cause:   "No size check before write",
      rule:    "Always check remaining quota before localStorage.setItem" }
       │
  Next /specify → searches past learnings via BM25
       │
  Result: "Found: localStorage quota issue in todo-app spec.
           → Adding R5: quota guard requirement automatically"
```

This is **cross-spec compounding**. A lesson learned in one project surfaces as a requirement in the next. The system doesn't just avoid repeating mistakes — it actively strengthens future specs with evidence from past executions.

Three mechanisms make this work:

- **`spec learning`** — Workers record structured learnings during execution, auto-mapped to the requirements and tasks that produced them
- **`spec search`** — BM25 search across all specs: requirements, sub-requirements, constraints, and learnings. What you learned in project A informs what you ask in project B
- **Compounding loop** — Each /specify session starts by searching past learnings. More projects → richer search results → more complete requirements → fewer surprises during execution → better learnings → the cycle continues

The result: **the tenth project you run through Hoyeon is meaningfully better than the first** — not because the LLM improved, but because the knowledge base did.

---

These aren't aspirations. They're enforced by the architecture — the CLI rejects invalid specs, gates block unverified layers, hooks guard writes, agents verify in isolation, and learnings compound across projects. The system is designed so that **doing the right thing is the path of least resistance.**

---

## See It In Action

```
You:  /specify "add dark mode toggle to settings page"

  Hoyeon interviews you (decision-based):
  ├─ "User opens the app at night — should it auto-detect OS dark mode or require a manual toggle?"
  ├─ "User switches to dark mode mid-session — should charts/images also invert?"
  └─ derives implications: CSS variables needed, localStorage for persistence, prefers-color-scheme media query

  Agents research your codebase in parallel:
  ├─ code-explorer scans component structure
  ├─ docs-researcher checks design system conventions
  └─ ux-reviewer flags potential regression

  → spec.json generated:
    3 requirements, 8 sub-requirements, 4 tasks — all linked

You:  /execute

  Hoyeon orchestrates:
  ├─ Worker agents implement each task in parallel (--tdd: tests first)
  ├─ Code review: Codex + Gemini + Claude (multi-model consensus)
  └─ Final Verify: goal + constraints + sub-requirements — holistic check

  → Done. Every file change traced to a requirement.
```

<details>
<summary><strong>What just happened?</strong></summary>

```
/specify → Interview exposed hidden assumptions
           → Agents researched codebase in parallel
           → Layer-by-layer derivation: L0→L1→L2→L3→L4
           → Each layer gated by CLI validation + agent review

/execute → Orchestrator read spec.json, dispatched parallel workers
           → Workers self-verify against sub-requirement behaviors (--tdd: test-first)
           → Multi-model code review synthesized verdict
           → Final Verify checked goal, constraints, sub-requirements holistically
           → Atomic commits with full traceability
```

The chain ran from intent to proof. Every derivation verified.

</details>

---

## The Derivation Chain

Six layers. Each derived from the one before it. Each gated before the next begins.

```
  L0: Goal           "add dark mode toggle"
   ↓  ◇ gate         is the goal clear?
  L1: Context        codebase analysis, UX review, docs research
   ↓  ◇ gate         is the context sufficient?
  L2: Decisions      decision interview → implications derivation (L2.5)
   ↓  ◇ gate         are decisions justified?
  L3: Requirements   R1: "Toggle switches theme" → sub-requirements
   ↓  ◇ gate         are requirements complete?
  L4: Tasks          T1: "Add toggle component" → fulfills, depends_on
   ↓  ◇ gate         do tasks cover all requirements?
  Plan Approval      summary + user confirmation → /execute
```

Each gate has two checks:
- **Merge checkpoint** — CLI validates structure and completeness
- **Gate-keeper** — agent team reviews for scope drift, blind spots, and unnecessary complexity

Nothing advances without passing both. The chain is only as strong as its weakest link — so every link is verified.

### The Spec Contract

`spec.json` is the single source of truth. Everything reads from it, everything writes to it.

```json
{
  "meta": { "goal": "...", "mode": { "depth": "standard" } },
  "context": { "research": {}, "decisions": [{ "implications": [] }], "assumptions": [] },
  "requirements": [{
    "id": "R1",
    "behavior": "Toggle switches between light and dark theme",
    "sub": [{
      "id": "R1.1",
      "behavior": "Clicking toggle in settings page switches to dark mode"
    }]
  }],
  "tasks": [{ "id": "T1", "action": "...", "fulfills": ["R1"] }]
}
```

The chain of evidence: **requirement → sub-requirement → task (fulfills) → done**. From intent to proof.

---

## The Execution Engine

The orchestrator reads `spec.json` and dispatches parallel worker agents:

```
  ┌─────────────────────────────────────────────────────┐
  │  /execute                                           │
  │                                                     │
  │  Worker T1 ──→ Verifier T1 ──→ Commit T1             │
  │  Worker T2 ──→ Verifier T2 ──→ Commit T2  (parallel)│
  │  Worker T3 ──→ Verifier T3 ──→ Commit T3             │
  │       │                                             │
  │       ▼                                             │
  │  Code Review (Codex + Gemini + Claude)              │
  │       │  independent reviews → synthesized verdict  │
  │       ▼                                             │
  │  Final Verify                                       │
  │    ✓ goal alignment                                 │
  │    ✓ constraint compliance                          │
  │    ✓ acceptance criteria                            │
  │    ✓ requirement coverage                           │
  │       │                                             │
  │       ▼                                             │
  │  Report                                             │
  └─────────────────────────────────────────────────────┘
```

Workers implement, then independent Verifier agents check each task's sub-requirements — no judgment, no bypass.

### The Spec Is Alive

> *A spec that can't adapt is a spec that will be abandoned.*

`spec.json` is not a static document frozen at planning time. It's a **living contract** that evolves during execution — within strict, deterministic bounds.

When a worker discovers that the real codebase doesn't match the plan's assumptions, the spec adapts:

```
  spec.json at plan time:
    tasks: [T1, T2, T3]           ← 3 planned tasks

  Worker T2 hits a blocker:
    "T2 requires a util function that doesn't exist"
       │
       ▼
  System derives T2-fix:
    tasks: [T1, T2, T3, T2-fix]   ← spec grows, append-only
       │
       ▼
  T2-fix executes → T2 retries → passes
    tasks: [T1 ✓, T2 ✓, T3 ✓, T2-fix ✓]
```

This is **bounded adaptation** — the spec grows but never mutates. Three rules keep it deterministic:

- **Append-only** — existing tasks are never modified, only new ones are added. The original plan stays intact as an audit trail.
- **Depth-1** — a derived task cannot derive further tasks. One level of adaptation, no cascading chains. This prevents the spec from spiraling into unbounded complexity.
- **Circuit breaker** — max retries per path before escalating to the user. The system knows when to stop trying and ask for help.

The key insight: **requirements don't change during execution — only tasks do.** The goals, decisions, and requirements that were validated through the derivation chain remain stable. Tasks are just the lowest layer, and they're the cheapest to re-derive. This is why the layer hierarchy matters: the higher the layer, the more stable it is.

```
  Stable during execution:
    L0: Goal           ← locked
    L1: Context        ← locked
    L2: Decisions      ← locked
    L3: Requirements   ← locked
    L3: Sub-reqs       ← locked (behavioral acceptance criteria)

  Adaptable during execution:
    L4: Tasks          ← can grow (append-only, depth-1)
```

The spec doesn't predict the future. It survives it — by knowing which parts to hold firm and which parts to flex.

---

## Twenty-One Minds

Twenty-one agents, each a different mode of thinking. You never interact with them directly — skills orchestrate them behind the scenes.

| Agent | Role | Core Question |
|-------|------|---------------|
| **Interviewer** | Questions-only. Never builds. | *"What haven't you said yet?"* |
| **Gap Analyzer** | Finds what's missing before it matters | *"What could go wrong?"* |
| **UX Reviewer** | Guards the user's experience | *"Would a human enjoy this?"* |
| **Tradeoff Analyzer** | Weighs every option's cost | *"What are you giving up?"* |
| **Debugger** | Traces bugs to root causes, not symptoms | *"Is this the cause, or a symptom?"* |
| **Code Reviewer** | Multi-model consensus (Codex + Gemini + Claude) | *"Would three experts ship this?"* |
| **Worker** | Implements with spec precision | *"Does this match the requirement?"* |
| **Verifier** | Independent sub-requirement verification per task | *"Does the code satisfy every sub-requirement?"* |
| **Ralph Verifier** | Independent, context-isolated DoD check | *"Is it actually done?"* |
| **Gate-Keeper** | Validates layer transitions for drift, gaps, and conflicts | *"Is this layer ready to advance?"* |
| **External Researcher** | Investigates libraries and best practices | *"What evidence do we actually have?"* |

<details>
<summary><strong>All 20 agents</strong></summary>

| Agent | Role |
|-------|------|
| Interviewer | Socratic questioning — questions only, no code |
| Gap Analyzer | Missing requirements and pitfall detection |
| UX Reviewer | User experience protection and regression prevention |
| Tradeoff Analyzer | Risk assessment and simpler alternative suggestions |
| Debugger | Root cause analysis with bug classification |
| Code Reviewer | Multi-model review: Codex + Gemini + Claude → SHIP/NEEDS_FIXES |
| Worker | Task implementation with spec-driven self-verification |
| Verifier | Independent sub-requirement verification (mechanical, no bypass) |
| Ralph Verifier | Independent DoD verification in isolated context |
| External Researcher | Library research and best practice investigation via web |
| Docs Researcher | Internal documentation and architecture decision search |
| Code Explorer | Fast read-only codebase search and pattern finding |
| Git Master | Atomic commit enforcement with project style detection |
| Phase2 Stepback | Scope drift and blind spot detection before planning |
| Verification Planner | Test strategy design (Auto/Agent/Manual classification) |
| Value Assessor | Positive impact and goal alignment evaluation |
| Risk Analyst | Vulnerability, failure mode, and edge case detection |
| Feasibility Checker | Practical achievability assessment |
| Codex Strategist | Cross-report strategic synthesis and blind spot detection |

</details>

---

## Commands

28 skills — slash commands you invoke inside Claude Code.

| Category | What you're doing | Skills |
|----------|------------------|--------|
| **Understand** | Derive requirements, generate specs | `/specify` `/quick-plan` `/discuss` `/deep-interview` `/mirror` |
| **Research** | Analyze codebase, find references, scan communities | `/deep-research` `/dev-scan` `/reference-seek` `/google-search` `/browser-work` |
| **Decide** | Evaluate tradeoffs, multi-perspective review | `/council` `/tribunal` `/tech-decision` `/stepback` |
| **Build** | Execute specs, fix bugs, iterate | `/execute` `/ralph` `/rulph` `/bugfix` `/ultrawork` `/scaffold` |
| **Test** | QA test applications, verify changes | `/qa` `/check` `/scope` |
| **Reflect** | Extract learnings, analyze sessions | `/compound` `/issue` `/skill-session-analyzer` |

<details>
<summary><strong>Key commands explained</strong></summary>

| Command | What It Does |
|---------|--------------|
| `/specify` | Layer-based interview → spec.json derivation (L0→L4) with gate-keepers |
| `/execute` | Spec-driven orchestration with 3-axis config (dispatch: direct/agent/team, verify: light/standard/thorough) |
| `/qa` | Systematic QA testing — browser (chromux/CDP) or computer (MCP computer-use) mode |
| `/ultrawork` | Full pipeline: specify → execute in one command |
| `/bugfix` | Root cause diagnosis → auto-generated spec → execute (adaptive routing) |
| `/ralph` | Iterative loop with DoD — keeps going until independently verified |
| `/council` | Multi-perspective deliberation: tribunal + external LLMs + community scan |
| `/tribunal` | 3-agent adversarial review: Risk + Value + Feasibility → synthesized verdict |
| `/scope` | Fast parallel impact analysis — 5+ agents scan what could break |
| `/check` | Pre-push verification against project rule checklists |
| `/rulph` | Rubric-based multi-model evaluation with autonomous self-improvement |

</details>

---

## Under the Hood

**28 skills · 21 agents · 18 hooks**

```
.claude/
├── skills/
│   ├── specify/       Layer-based spec derivation (L0→L4)
│   ├── execute/       Spec-driven parallel orchestration
│   ├── bugfix/        Root cause → spec → execute pipeline
│   ├── council/       Multi-perspective deliberation
│   ├── tribunal/      3-agent adversarial review
│   ├── qa/            Systematic QA testing (browser + computer)
│   └── ...            22 more skills
├── agents/
│   ├── interviewer    Socratic questioning
│   ├── debugger       Root cause analysis
│   ├── worker         Task implementation
│   ├── code-reviewer  Multi-model consensus
│   └── ...            17 more agents
├── scripts/           18 hook scripts
│   ├── session        Lifecycle management
│   ├── guards         Write protection, plan enforcement
│   ├── validation     Output quality, failure recovery
│   └── pipeline       Ultrawork transitions, DoD loops
└── cli/               spec.json validation & state management
```

**Key internals:**

- **Derivation Chain** — L0→L4 with merge checkpoints + gate-keeper teams at each transition
- **Multi-Model Review** — Codex + Gemini + Claude run independent reviews, synthesize SHIP/NEEDS_FIXES verdict
- **Hook System** — 18 hooks automate pipeline transitions, guard writes, enforce gates, recover from failures
- **Verify Pipeline** — Dedicated Verifier agents check sub-requirements per task independently
- **Self-Improvement** — Scope blockers → derived fix tasks at runtime (append-only, depth-1, circuit breaker)
- **Ralph Loop** — DoD-based iteration with Stop hook re-injection + independent context-isolated verification

See [docs/architecture.md](docs/architecture.md) for the full pipeline diagram.

---

## Quick Start

```bash
# Install the plugin
claude plugin add team-attention/hoyeon
npm install -g @team-attention/hoyeon-cli

# Start — derive requirements and execute
/specify "add dark mode toggle to settings page"
/execute

# Or run the full pipeline in one command
/ultrawork "refactor auth module"

# Fix a bug with root cause analysis
/bugfix "login fails when session expires"
```

Type `/` in Claude Code to see all available skills.

## CLI

`hoyeon-cli` manages spec.json validation and session state:

```bash
hoyeon-cli spec init "project-name"        # Create new spec
hoyeon-cli spec merge spec.json --json ...  # Validated merge
hoyeon-cli spec check spec.json             # Verify completeness
hoyeon-cli spec guide <section>             # Show field structure
```

See [docs/cli.md](docs/cli.md) for the full command reference.

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

*"The spec doesn't predict the future. It survives it."*

**Requirements are not written — they are derived.**

`MIT License`
