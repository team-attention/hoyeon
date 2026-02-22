---
name: specify
description: |
  This skill should be used when the user says "/specify", "plan this", or "make a plan".
  Interview-driven planning workflow with mode support (quick/standard × interactive/autopilot).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - AskUserQuestion
  - Bash
---
# /specify - CLI-Orchestrated Planning

## Layer 1: Execution Flow (CLI-driven)

### Rules
- Subagents: Write full results to the `outputPath` provided by CLI using the Write tool. Return only 1-2 line summary.
- Subagent output format: Markdown with YAML frontmatter (agent, timestamp, summary).
- When CLI returns `onComplete` field, execute that command AFTER all subagents finish, BEFORE calling `step complete`.
- When CLI returns `fileInstruction`, follow it exactly.
- Early exit: if the task is clearly unnecessary, call `node dev-cli/bin/dev-cli.js abort {name} --reason "..."` instead of silently stopping.

### Flow
1. `node dev-cli/bin/dev-cli.js init {name} [--quick] [--autopilot]`
2. Loop: call `node dev-cli/bin/dev-cli.js next {name}` → follow the returned instruction
3. Until CLI returns `{ "done": true }`

### Draft Update
Use flags: `node dev-cli/bin/dev-cli.js draft {name} update --section <id> --data '<json>'`
Or stdin: `echo '{"section":"<id>","data":<value>}' | node dev-cli/bin/dev-cli.js draft {name} update`

### On Context Compaction
Call `node dev-cli/bin/dev-cli.js manifest {name}` to recover full state.

---

## Layer 2: Judgment Rules & Knowledge

### Mode Selection

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | depth = quick | depth = standard |
| `--autopilot` | interaction = autopilot | depends on depth |
| `--interactive` | interaction = interactive | depends on depth |

**Auto-Detect Depth** (no flag given):

| Keywords | Auto-Depth |
|----------|------------|
| "fix", "typo", "rename", "bump", "update version" | quick |
| Everything else | standard |

**Interaction Defaults**: quick → autopilot, standard → interactive

**Autopilot Decision Rules**:

| Decision Point | Rule |
|----------------|------|
| Tech choices | Use existing stack; prefer codebase patterns |
| Trade-off questions | Choose lower-risk, simpler option |
| Ambiguous scope | Interpret narrowly (minimum viable scope) |
| HIGH risk items | HALT and ask user (override autopilot) |
| Missing info | Assume standard/conventional; log in Assumptions |

### Intent Classification

Classify each task into one of 7 categories, then apply the corresponding strategy:

| Intent | Keywords | Strategy |
|--------|----------|----------|
| **Refactoring** | "refactoring", "cleanup", "migrate" | Safety first, regression prevention |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "design", "structure" | Trade-off analysis, oracle consultation |
| **Research** | "investigate", "analyze" | Investigation only, NO implementation |
| **Migration** | "migration", "upgrade" | Phased approach, rollback plan |
| **Performance** | "optimize", "slow" | Measure first, profile → optimize |

### Interview Principles (Interactive Mode)

**ASK** (user knows, agent doesn't):
- Boundaries: "Any restrictions on what not to do?"
- Trade-offs: Only when multiple valid options exist
- Success Criteria: "When is this considered complete?"

**DISCOVER** (agent finds via exploration):
- Existing patterns (file:line format)
- Project commands (lint/test/build)
- Internal docs (ADRs, conventions)
- UX impact (current flow analysis)

**PROPOSE** (research first, then suggest):
- After each answer, propose a concrete decision or assumption
- Offer trade-off options (simple-now vs flexible-later)
- Summarize agreed decisions at end of each exchange
- Minimize questions; prefer proposals backed by research

### Plan Transition (Interactive Mode)

**Conditions** (all must be met):
- Critical Open Questions all resolved
- User Decisions recorded
- Success Criteria agreed
- User explicitly says "make it a plan" / "generate the plan"

**DO NOT** generate a plan just because you have enough information.

### Mode Gates by Step

| Step | Quick | Standard |
|------|-------|----------|
| Exploration | 2 agents (Explore ×2) | 4 agents (+docs-researcher, +ux-reviewer) |
| Interview | Skip → auto-assume | Full interview loop |
| Analysis | tradeoff-lite only (1 agent) | 4 agents (gap, tradeoff, verify, external) |
| Codex synthesis | Skip | Required (Step 2.5) |
| Plan review | 1 round | Up to 3 rounds |

### plan-content.json Schema Reference

The `generate-plan` step must produce JSON matching this exact schema (validated by `plan-content.schema.js`):

```
Top-level required fields:
  context:         { originalRequest, interviewSummary, researchFindings, assumptions? }
  objectives:      { core, deliverables[], dod[], mustNotDo[] }
  todos[]:         { id, title, type("work"|"verification"),
                     inputs[{name,type,ref}], outputs[{name,type,value,description}],
                     steps[], mustNotDo[], references[],
                     acceptanceCriteria: { functional[], static[], runtime[], cleanup[]? },
                     risk("LOW"|"MEDIUM"|"HIGH") }
  taskFlow:        string (execution order description)
  dependencyGraph: [{ todo, requires[], produces[] }]
  commitStrategy:  [{ afterTodo, message, files[], condition }]
  verificationSummary: { aItems[], hItems[], sItems[], gaps[] }
```

**TODO types**: `work` (implementation) or `verification` (testing/validation)
**Risk values**: `LOW`, `MEDIUM`, `HIGH`
**Acceptance Criteria categories**: functional (behavior), static (lint/type), runtime (test execution), cleanup (optional post-work)

### Checklist Before Stopping

**Quick mode**: Verify DRAFT has intent + assumptions populated, PLAN.md generated and reviewed once.
**Standard mode**: Verify DRAFT fully populated (all sections), analysis agents ran, plan-reviewer approved (OKAY), summary generated.

**Always verify**:
- [ ] `dev-cli next` returned `{ "done": true }` (or `abort` was called)
- [ ] No pending `onComplete` commands left unexecuted
- [ ] All subagent `outputPath` files written
