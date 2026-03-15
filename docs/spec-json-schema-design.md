# spec.json Schema Design

> Date: 2026-03-05
> Status: v5 — scenario-based AC + v4 backward compatibility (Document v3, supersedes v4 design)

## Background

A design for converting the existing PLAN.md (free-text markdown) based spec into a JSON-structured format.
The goal is a format where the Observer in a Worker/Observer/Coordinator 3-agent loop can programmatically parse, validate, and update.

### References
- `.references/OpenSpec/` — Fission AI's spec framework (behavior contract, delta specs, RFC 2119)
- `.references/spec-kit/` — GitHub's spec-driven development toolkit (user stories, tasks template)
- Existing `/specify` skill output: DRAFT.md → PLAN.md flow

### Design Principles

1. **No ambiguity** — Every field allows only one interpretation
2. **Must be verifiable/reproducible** — Distinguish human/agent/machine
3. **Work units must be atomic** — One task = one action (3 steps or fewer)
4. **Constraints must be explicit** — Distinguish prohibition/preservation by type
5. **Separate contract from status** — spec.json is an immutable contract, state.json is runtime status

---

## Architecture: spec.json + state.json Separation

### Why Separate

Up through v3, **runtime state** like `status` and `verified` was mixed inside spec.json.
This caused:
- Blurred boundary between contract (spec) and status (state)
- Spec changes and state changes happening in the same file → diff pollution
- Risk of Workers needing to directly modify the spec

### Separation Structure

```
spec.json  (immutable after approval — the contract)
├── meta, context, requirements, tasks, constraints
├── No status fields
└── Changes = Coordinator only (when reflecting Observer feedback)

state.json  (mutable — progress status)
├── spec_ref: "spec.json"
├── spec_hash: "sha256:..."           ← spec change detection
├── tasks: { "T1": { status, owner, started_at, completed_at } }
├── verifications: { "R1.S1": { passed, evidence, at } }
├── assumptions: { "A1": { verified, verified_at } }
└── history: [ { action, by, at, detail } ]
```

### Ownership Model

| File | Nature | Read | Write | When Changed |
|------|--------|------|-------|--------------|
| spec.json | Contract | All agents | Coordinator only | When reflecting feedback (rarely) |
| state.json | Progress log | All agents | Worker, Observer (via cli) | On every task completion |
| feedback/*.json | Observer opinion | Coordinator | Observer | After verification |

### Drift Prevention Rules

| Rule | Description | Enforcement |
|------|-------------|-------------|
| **Hash lock** | Warning/halt when `spec_hash` in state.json mismatches current spec.json hash | cli validates on every operation |
| **Key consistency** | Task/requirement IDs in state.json must exist in spec.json | cli rejects orphan keys |
| **Single entry point** | Direct spec/state modification prohibited, must go through cli | pre-commit hook blocks raw edits |

### Spec Change Flow (Observer feedback → Coordinator amend)

```
1. Observer: cli feedback create "R1.S2 scenario missing"
   → feedback/fb-001.json created

2. Coordinator: cli spec amend --reason "fb-001"
   → spec.json modified (requirement added, etc.)
   → spec_hash changed

3. cli state sync
   → tasks deleted from spec → archived in state
   → tasks added to spec → added as pending in state
   → hash updated, existing completion status preserved
```

### File Layout

```
.dev/specs/{spec-name}/
├── spec.json              ← Contract (Coordinator-owned)
├── state.json             ← Status (Worker/Observer, via cli)
├── feedback/
│   ├── fb-001.json        ← Observer feedback
│   └── fb-002.json
└── (git manages spec.json history)
```

---

## Schema Structure (5 sections)

```
spec.json
├── meta          — What is this? (identity + provenance + strategic scope)
│   ├── goal        — What is being achieved (strategy)
│   └── non_goals   — What is not being achieved (strategic scope exclusions)
├── context       — Why, on what premise? (background + rationale)
├── requirements  — What behaviors must exist? (behavior contract)
├── tasks         — What work must be done? (atomic work units)
└── constraints   — What boundaries must not be crossed? (boundary guards)
```

### Orthogonality Verification

| Section | Question | Time Axis | Owning Agent |
|---------|----------|-----------|--------------|
| meta | What is this? + What is not done? | — | Creator |
| context | Why, on what premise? | Past → Present | All read, Coordinator modifies |
| requirements | What behaviors must exist? | Present → Future | Observer verifies |
| tasks | What work must be done? | Present | Worker executes |
| constraints | What boundaries must not be crossed? | Past protection + Future prohibition | Observer monitors |

---

## Mapping from Existing PLAN.md

| Old PLAN.md Section | New spec.json | Notes |
|---------------------|---------------|-------|
| Context.Original Request | `context.request` | Separated |
| Context.Interview Summary | `context.interview[]` | **v4** array + structured |
| Context.Research Findings | `context.research` | New in v3 |
| Context.Assumptions | `context.assumptions[]` | Structured (belief + if_wrong + impact) |
| Work Objectives.Goal | `meta.goal` | 1 sentence |
| Work Objectives.Deliverables | `meta.deliverables[]` | **v4** objectified {path, description} |
| Work Objectives.DoD | `requirements[].scenarios` | DoD = set of scenarios |
| Non-goals | `meta.non_goals[]` | Strategic scope exclusions |
| Must NOT Do (global) | `constraints[]` (typed) | must_not_do/preserve |
| Must NOT Do (per-TODO) | `tasks[].task_constraints[]` | **v4** typed object |
| TODOs.Steps | `tasks[].steps[]` | 3 or fewer recommended |
| TODOs.Inputs/Outputs | `tasks[].inputs[]` / `tasks[].outputs[]` | artifact flow |
| TODOs.References | `tasks[].references[]` | **v4** objectified {path, start_line, end_line} |
| TODOs.Type (Work/Verification) | `tasks[].type` | work/verification explicitly defined |
| TODOs.Risk | `tasks[].risk` | **v4** judgment criteria defined |
| TODOs.Acceptance Criteria | `requirements.scenarios` (via fulfills) | AC deduplication |
| Verification (A-items, H-items) | `requirements.scenarios[].verified_by` | Built-in |
| Verification Gaps | `context.known_gaps[]` | **v4** objectified {gap, severity, mitigation} |
| Dependency Graph | `tasks[].depends_on` + `tasks[].outputs` | Built-in + artifact flow |
| Commit Strategy | `tasks[].checkpoint{}` | **v4** condition enumerated |
| Key Decisions | `context.decisions[]` | **v4** alternatives_rejected objectified |
| Plan Approval Summary | `meta.approved_by/at` (optional) | Lightweight |
| **Progress Status** | **→ Separated to state.json** | **v4 core change** |

### Key Improvement: Triple Redundancy Elimination (resolved in v3, maintained in v4)

```
OLD:  success_criteria + acceptance_criteria + a_items  (verification duplicated in 3 places)
NEW:  requirements.scenarios (sole source of verification)
```

---

## verify Field Type System

`verified_by` and `verify.type` map 1:1 (enforced by JSON Schema if/then):

| verified_by | verify.type | verify content | Judgment method |
|-------------|-------------|----------------|-----------------|
| `machine` | `command` | `run` + `expect` | exit code + optional regex |
| `agent` | `assertion` | `checks[]` | Observer traverses checklist |
| `human` | `instruction` | `ask` | Human confirmation |

### expect field (v4 expansion)

v3's `"exit_0"` string → objectified in v4:

```json
"expect": {
  "exit_code": 0,
  "stdout_contains": "dispatched",
  "stderr_empty": true
}
```

All sub-fields are optional. At minimum, `exit_code` is required.

### assertion checks[] (new in v4)

v3's `"check": "free text"` → checklist in v4:

```json
"verify": {
  "type": "assertion",
  "checks": [
    "Verify that unknown type falls through to default in the case statement",
    "Verify that exit 0 is explicitly called",
    "Verify that a warning message is output to stderr"
  ]
}
```

---

## Constraint Types

| Type | Meaning | Example |
|------|---------|---------|
| `must_not_do` | Prohibit new behavior | "Do not change block reason text" |
| `preserve` | Protect existing behavior (regression guard) | "Maintain execute hook behavior" |

> **Note:** `scope_boundary` was removed in v4.1. Strategic scope exclusions go in `meta.non_goals[]`, physical file scope goes in `tasks[].file_scope[]`. If global file access restriction is needed, use `must_not_do` + `verify` command as a substitute.

### Global vs Task-local Constraint Rules

- `constraints[]` = **Global** (applies to all tasks)
- `tasks[].task_constraints[]` = **Task-local** (applies only to that task)
- If same constraint is needed for 2+ tasks → promote to `constraints[]`
- cli outputs a warning when `tasks[].file_scope[]` overlaps (cross-validation)

### task_constraints Structure (v4)

v3's free text → typed object in v4:

```json
"task_constraints": [
  { "type": "no_modify", "target": "loop-state.js" },
  { "type": "no_modify", "target": "chain-state.js" },
  { "type": "preserve_string", "target": "blockReason values" }
]
```

---

## Ambiguity Resolution List (v3→v4)

### Critical (resolved in v4)

| # | Field | v3 Problem | v4 Solution |
|---|-------|-----------|-------------|
| 1 | `behavior` + `strength` | Same information double-encoded | **`strength` removed**. RFC2119 keywords (SHALL/MUST/SHOULD) in behavior are the sole source |
| 2 | `checkpoint.condition` | Free text ("all acceptance criteria pass") | enum: `"always"` \| `"on_fulfill"` \| `"manual"` |
| 3 | `expect` | String `"exit_0"` | Object: `{exit_code, stdout_contains?, stderr_empty?}` |
| 4 | `references[]` | String `"file:40-75"` format undefined | Object: `{path, start_line?, end_line?}` |
| 5 | `task_constraints[]` | Free text | typed: `{type, target}` |

### Medium (resolved in v4)

| # | Field | v3 Problem | v4 Solution |
|---|-------|-----------|-------------|
| 6 | `status` (tasks/requirements) | Runtime state mixed in spec | **Moved to state.json**. Removed from spec |
| 7 | `risk` | No judgment criteria | Defined: low=single file+reversible, medium=multiple files or side-effects, high=deletion/external integration/irreversible |
| 8 | `type` | Unclear if "writing test code" is work or verification | Defined: work=creates/changes artifacts, verification=read-only validation only (no file creation/modification) |
| 9 | `priority` | Number range/direction undefined | Defined: 1=highest, 5=lowest (integer). Equal priority allowed |
| 10 | `inputs[].artifact` | Implicit that artifact ID must exist in outputs | lint rule: all `inputs[].artifact` must exist in the `outputs[].id` of the referenced `from_task` |
| 11 | `scenarios given/when/then` | Whether Gherkin is required was unclear | Rule: Gherkin format required. One sentence per field |
| 12 | `context.interview` | Multiple decisions compressed into a single string | Converted to array: `[{topic, decision}]` |

### Minor (resolved in v4)

| # | Field | v3 Problem | v4 Solution |
|---|-------|-----------|-------------|
| 13 | `meta.source` | Unclear meaning | Field renamed: `derived_from` |
| 14 | `meta.deliverables[]` | Mixed path + description string | Object: `{path, description}` |
| 15 | `constraints[].verify.check` | Different execution by each agent | Decomposed into `checks[]` checklist |
| 16 | `known_gaps[]` | String, no severity | Object: `{gap, severity, mitigation}` |
| 17 | `decisions[].alternatives_rejected` | No rejection reason | Object: `[{option, reason}]` |
| 18 | `meta.workflow_notes` | Only defined, purpose unclear | Removed. Include in `context.research` if needed |
| 19 | `assumptions[].if_wrong` | Impact unclear | Added `impact` field: `"minor"` \| `"major"` \| `"critical"` |

---

## Field Definitions (new in v4)

Exact definitions for all enums/types:

### task.type

| Value | Definition | Allowed Actions |
|-------|-----------|-----------------|
| `work` | Work that creates or modifies artifacts | File creation, modification, deletion |
| `verification` | Performs read-only verification only | File reading, command execution. **Edit/Write prohibited** |

### task.risk

| Value | Criteria | Example |
|-------|----------|---------|
| `low` | Single file, reversible, no side-effects | Adding one function |
| `medium` | Multiple files, or has side-effects | Simultaneously modifying settings.json + script |
| `high` | File deletion, external integration, irreversible change | Deleting existing hook, changing API endpoint |

### checkpoint.condition

| Value | Meaning |
|-------|---------|
| `always` | Commit immediately on task completion |
| `on_fulfill` | Commit when all requirements specified in fulfills have passed |
| `manual` | Commit when Coordinator/human explicitly instructs |

### requirement.priority

1=highest, 5=lowest. Equal priority allowed. Workers process from lowest number first.

### task_constraints.type

| Value | Definition | target example |
|-------|-----------|----------------|
| `no_modify` | Prohibit modification of the file/module | `"loop-state.js"` |
| `no_delete` | Prohibit deletion of the file/symbol | `"chain-stop-hook.sh"` |
| `preserve_string` | Prohibit changing specific string values | `"blockReason values"` |
| `read_only` | Allow reading only (for verification tasks) | `"all files"` |

When extending, add to this table and update JSON Schema as well.

---

## Final Schema (v4)

```json
{
  "$schema": "dev-spec/v4",

  "meta": {
    "name": "stop-router",
    "goal": "Consolidate chain/rv/rph 3 Stop hooks into a single stop-router",
    "non_goals": [
      "execute hook consolidation (keep separate)",
      "Build hook test automation framework"
    ],
    "deliverables": [
      { "path": "scripts/stop-router.sh", "description": "Single Stop hook entry point" },
      { "path": "cli/src/handlers/stop-evaluate.js", "description": "Unified evaluation handler" },
      { "path": ".claude/settings.json", "description": "Stop hook registration update" }
    ],
    "derived_from": ".dev/specs/stop-router/PLAN.md",
    "created_at": "2026-03-04T10:00:00Z",
    "updated_at": "2026-03-05T00:00:00Z"
  },

  "context": {
    "request": "Consolidate 4 Stop hooks into a single stop-router.sh + dev-cli stop-evaluate",
    "interview": [
      { "topic": "crash safety", "decision": "accept risk" },
      { "topic": "execute hook", "decision": "exclude (keep separate)" },
      { "topic": "priority", "decision": "execute > chain > rv > rph" },
      { "topic": "old scripts", "decision": "delete chain/rv/rph" }
    ],
    "research": "3 hooks (chain/rv/rph) are already thin dev-cli wrappers (34-75 lines). Only execute hook is 155 lines of direct shell. Single dispatcher already proposed in ARCHITECTURE_REVIEW.md.",
    "assumptions": [
      {
        "id": "A1",
        "belief": "Existing Stop hooks determine success/failure by exit code",
        "if_wrong": "Handler interface redesign required",
        "impact": "major"
      },
      {
        "id": "A2",
        "belief": "Multiple hooks can be registered in settings.json Stop block",
        "if_wrong": "Single dispatcher required",
        "impact": "minor"
      }
    ],
    "decisions": [
      {
        "id": "D1",
        "decision": "case-statement based dispatcher",
        "rationale": "Adding a handler requires 1 line, high readability",
        "alternatives_rejected": [
          { "option": "if-else chain", "reason": "Readability degrades as handler count increases" },
          { "option": "JSON lookup table", "reason": "Over-abstraction, difficult to debug" }
        ]
      }
    ],
    "known_gaps": [
      {
        "gap": "No automated integration tests",
        "severity": "medium",
        "mitigation": "hooks tested via manual Claude session. Future sandbox automation under consideration"
      }
    ]
  },

  "requirements": [
    {
      "id": "R1",
      "behavior": "stop-router SHALL dispatch to correct handler based on hook type",
      "priority": 1,
      "scenarios": [
        {
          "id": "R1.S1",
          "given": "hook type is 'chain'",
          "when": "stop-router.sh is invoked",
          "then": "chain handler executes and returns its exit code",
          "verified_by": "machine",
          "verify": {
            "type": "command",
            "run": "bash stop-router.sh chain",
            "expect": { "exit_code": 0 }
          }
        },
        {
          "id": "R1.S2",
          "given": "hook type is unknown (e.g. 'foo')",
          "when": "stop-router.sh is invoked",
          "then": "exits 0 without error, logs warning to stderr",
          "verified_by": "agent",
          "verify": {
            "type": "assertion",
            "checks": [
              "Verify that unknown type falls through to default/*) in the case statement",
              "Verify that exit 0 is explicitly called",
              "Verify that a warning message is output to stderr"
            ]
          }
        }
      ]
    },
    {
      "id": "R2",
      "behavior": "Each handler MUST be independently testable as a standalone script",
      "priority": 2,
      "scenarios": [
        {
          "id": "R2.S1",
          "given": "chain-handler.sh exists",
          "when": "bash -n is run against it",
          "then": "syntax check passes (exit 0)",
          "verified_by": "machine",
          "verify": {
            "type": "command",
            "run": "bash -n scripts/handlers/chain-handler.sh",
            "expect": { "exit_code": 0 }
          }
        }
      ]
    }
  ],

  "tasks": [
    {
      "id": "T1",
      "action": "Create stop-evaluate handler in dev-cli",
      "type": "work",
      "risk": "low",
      "file_scope": [
        "cli/src/handlers/stop-evaluate.js",
        "cli/dist/cli.js"
      ],
      "fulfills": ["R1"],
      "depends_on": [],
      "steps": [
        "Read existing chain-stop-hook.sh, rv-validator.sh, rph-loop.sh to extract exact logic",
        "Create stop-evaluate.js with evaluateChain/evaluateRv/evaluateRph functions",
        "Register 'stop-evaluate' in SUBCOMMANDS in dev-cli.js"
      ],
      "references": [
        { "path": "scripts/chain-stop-hook.sh", "start_line": 40, "end_line": 75 },
        { "path": "scripts/rv-validator.sh", "start_line": 23, "end_line": 36 },
        { "path": "scripts/rph-loop.sh", "start_line": 23, "end_line": 33 },
        { "path": "cli/src/handlers/chain-status.js" },
        { "path": "cli/dist/cli.js", "start_line": 7, "end_line": 33 }
      ],
      "inputs": [],
      "outputs": [
        { "id": "handler_path", "path": "cli/src/handlers/stop-evaluate.js" }
      ],
      "task_constraints": [
        { "type": "preserve_string", "target": "blockReason values in existing hooks" },
        { "type": "no_modify", "target": "loop-state.js" },
        { "type": "no_modify", "target": "chain-state.js" }
      ],
      "checkpoint": {
        "enabled": true,
        "message": "feat(dev-cli): add stop-evaluate handler for unified stop hook evaluation",
        "condition": "on_fulfill"
      }
    },
    {
      "id": "T2",
      "action": "Create stop-router.sh",
      "type": "work",
      "risk": "low",
      "file_scope": [
        "scripts/stop-router.sh"
      ],
      "fulfills": ["R1", "R2"],
      "depends_on": ["T1"],
      "steps": [
        "Create scripts/stop-router.sh: read stdin JSON, extract session_id + cwd",
        "Call dev-cli stop-evaluate with extracted params",
        "Make executable (chmod +x)"
      ],
      "references": [
        { "path": "scripts/rph-loop.sh" }
      ],
      "inputs": [
        { "from_task": "T1", "artifact": "handler_path" }
      ],
      "outputs": [
        { "id": "router_path", "path": "scripts/stop-router.sh" }
      ],
      "task_constraints": [
        { "type": "no_modify", "target": "dev-execute-stop-hook.sh" }
      ],
      "checkpoint": null
    },
    {
      "id": "T3",
      "action": "Update settings.json and remove old scripts",
      "type": "work",
      "risk": "medium",
      "file_scope": [
        ".claude/settings.json"
      ],
      "fulfills": [],
      "depends_on": ["T2"],
      "steps": [
        "Update .claude/settings.json: keep execute hook 1st, add stop-router.sh 2nd",
        "Remove chain-stop-hook.sh, rv-validator.sh, rph-loop.sh from settings and disk"
      ],
      "references": [
        { "path": ".claude/settings.json", "start_line": 100, "end_line": 121 }
      ],
      "inputs": [
        { "from_task": "T2", "artifact": "router_path" }
      ],
      "outputs": [],
      "task_constraints": [
        { "type": "no_modify", "target": "dev-execute-stop-hook.sh" }
      ],
      "checkpoint": {
        "enabled": true,
        "message": "refactor(hooks): consolidate chain/rv/rph stop hooks into single stop-router",
        "condition": "always"
      }
    },
    {
      "id": "T4",
      "action": "Verify R1 scenarios",
      "type": "verification",
      "risk": "low",
      "file_scope": [],
      "fulfills": ["R1"],
      "depends_on": ["T2", "T3"],
      "steps": [
        "Run R1.S1 machine verification",
        "Run R1.S2 agent assertion checks"
      ],
      "references": [],
      "inputs": [
        { "from_task": "T1", "artifact": "handler_path" },
        { "from_task": "T2", "artifact": "router_path" }
      ],
      "outputs": [],
      "task_constraints": [
        { "type": "read_only", "target": "all files" }
      ],
      "checkpoint": null
    },
    {
      "id": "T5",
      "action": "Verify R2 scenarios and constraints",
      "type": "verification",
      "risk": "low",
      "file_scope": [],
      "fulfills": ["R2"],
      "depends_on": ["T3"],
      "steps": [
        "Run R2.S1 machine verification",
        "Verify all constraints (C1, C2, C3)"
      ],
      "references": [],
      "inputs": [],
      "outputs": [],
      "task_constraints": [
        { "type": "read_only", "target": "all files" }
      ],
      "checkpoint": null
    }
  ],

  "constraints": [
    {
      "id": "C1",
      "type": "must_not_do",
      "rule": "Do not change block reason text",
      "verified_by": "agent",
      "verify": {
        "type": "assertion",
        "checks": [
          "Verify that blockReason strings have not changed in git diff",
          "Verify that blockReason in new handler is byte-for-byte identical to original"
        ]
      }
    },
    {
      "id": "C2",
      "type": "preserve",
      "rule": "Existing execute hook behavior must be preserved",
      "verified_by": "machine",
      "verify": {
        "type": "command",
        "run": "bash scripts/dev-execute-init-hook.sh",
        "expect": { "exit_code": 0 }
      }
    },
    {
      "id": "C3",
      "type": "must_not_do",
      "rule": "Prohibit file modification outside allowed paths (only scripts/, .claude/settings.json, cli/ permitted)",
      "verified_by": "machine",
      "verify": {
        "type": "command",
        "run": "git diff --name-only | grep -vcE '^(scripts/|.claude/settings.json|cli/)' || true",
        "expect": { "exit_code": 0, "stdout_contains": "0" }
      }
    }
  ]
}
```

### state.json Example (Separate File)

```json
{
  "$schema": "dev-state/v1",
  "spec_ref": "spec.json",
  "spec_hash": "sha256:a1b2c3d4e5f6...",

  "tasks": {
    "T1": { "status": "done", "owner": "worker-1", "started_at": "...", "completed_at": "..." },
    "T2": { "status": "done", "owner": "worker-1", "started_at": "...", "completed_at": "..." },
    "T3": { "status": "in_progress", "owner": "worker-1", "started_at": "..." },
    "T4": { "status": "pending" },
    "T5": { "status": "blocked_by", "blocked_by": ["T3"] }
  },

  "verifications": {
    "R1.S1": { "passed": null },
    "R1.S2": { "passed": null },
    "R2.S1": { "passed": null }
  },

  "assumptions": {
    "A1": { "verified": false },
    "A2": { "verified": true, "verified_at": "2026-03-04T10:30:00Z" }
  },

  "history": [
    { "action": "task_started", "task": "T1", "by": "worker-1", "at": "2026-03-04T10:05:00Z" },
    { "action": "task_completed", "task": "T1", "by": "worker-1", "at": "2026-03-04T10:30:00Z" }
  ]
}
```

### state.json task.status State Machine

```
pending → in_progress → done
                      → blocked_by (when depends_on not complete)
```

- `pending`: Not yet started
- `in_progress`: Worker is working on it
- `done`: Complete
- `blocked_by`: A task specified in depends_on is not yet done (+ `blocked_by` field contains task ID list)

---

## v3→v4 Change Summary

| Item | v3 | v4 | Reason |
|------|----|----|--------|
| `strength` field | `"must"` | **Removed** | RFC2119 keywords in behavior are the sole source |
| `status` (in spec) | `"pending"` | **Moved to state.json** | Contract/status separation |
| `verified` (assumptions) | boolean in spec | **Moved to state.json** | Runtime state |
| `checkpoint.condition` | Free text | enum: `always\|on_fulfill\|manual` | Parseable |
| `expect` | `"exit_0"` string | Object: `{exit_code, stdout_contains?, ...}` | Expanded expressiveness |
| `references[]` | String | Object: `{path, start_line?, end_line?}` | Format clarification |
| `task_constraints[]` | Free text | typed: `{type, target}` | Machine-checkable |
| `deliverables[]` | String | Object: `{path, description}` | Structured |
| `interview` | Single string | Array: `[{topic, decision}]` | Per-item separation |
| `known_gaps[]` | String | Object: `{gap, severity, mitigation}` | Includes severity+response |
| `alternatives_rejected` | String array | Object: `[{option, reason}]` | Includes rejection reason |
| `assumptions[].impact` | None | `minor\|major\|critical` | Impact explicitly stated |
| `meta.source` | Unclear meaning | Changed to `derived_from` | Clarification |
| `meta.workflow_notes` | Purpose unclear | **Removed** | Unnecessary |
| `verify.check` (assertion) | Single string | `checks[]` checklist | Reduced judgment variance |
| T2 (1 task) | 3 actions bundled | Split into T2+T3 | Stronger atomicity |
| T3 (1 verification) | 6 verifications bundled | Split into T4+T5 | Failure point tracking |
| scope_boundary | Separate type | **Removed** → `meta.non_goals` + `tasks[].file_scope` | Improved orthogonality |

---

## Agent Council Review History

### Schema v1 Review (24/30 → APPROVE)

Members: Codex(OpenAI), Chairman(Claude). Gemini 429 failure.

| Rubric | Codex | Claude | Consensus |
|--------|-------|--------|-----------|
| R1 Ambiguity removal | 4 | 4 | 4 |
| R2 Verification/reproducibility | 4 | 4 | 4 |
| R3 Task atomicity | 4 | 4 | 4 |
| R4 Constraint clarity | 4 | 4 | 4 |
| R5 Redundancy elimination | 5 | 5 | 5 |
| R6 Missing content | **3** | **3** | **3** |
| TOTAL | 24 | 24 | 24/30 |

**v1 Key weaknesses:** Missing context/assumptions/decisions, verify was plain string

### v1→v2 Changes (Schema internal version)

1. `context` section added (summary, assumptions[], decisions[])
2. `verify` string → typed object ({type, run/check/ask, expect})
3. `tasks[].checkpoint: boolean` added

### Schema v2 Review (25.5/30 → APPROVE, +1.5)

| Rubric | Codex | Claude | Consensus | v1→v2 |
|--------|-------|--------|-----------|-------|
| R1 Ambiguity removal | 4 | 4 | 4 | = |
| R2 Verification/reproducibility | **5** | **5** | **5** | **+1** |
| R3 Task atomicity | 4 | 4 | 4 | = |
| R4 Constraint clarity | 4 | 4.5 | 4 | = |
| R5 Redundancy elimination | 4 | 5 | 4.5 | -0.5 |
| R6 Missing content | **4** | **4.5** | **4** | **+1** |
| TOTAL | 25 | 27 | 25.5/30 | +1.5 |

### Schema v3 Review (21/30 — Stricter criteria applied)

Members: Codex(GPT-5.3), Chairman(Claude Opus 4.6). Gemini 429 failure.

**Note:** The reason for lower scores than v2 is that evaluation criteria changed. Through v2, only "schema design itself" was evaluated; from v3 onward, "real-world 3-agent system operability" is also included.

| Rubric | Codex | Claude | Consensus |
|--------|-------|--------|-----------|
| R1 Ambiguity removal | 3 | 3.5 | 3 |
| R2 Verification/reproducibility | 4 | 4 | 4 |
| R3 Task atomicity | 3 | 3 | 3 |
| R4 Constraint clarity | 3 | 3.5 | 3 |
| R5 Redundancy elimination | 4 | 3.5 | 4 |
| R6 Missing content | 4 | 4.5 | 4 |
| TOTAL | 21 | 22 | 21/30 |

**v3 Key weaknesses (resolved in v4):**
- behavior vs strength duplication → strength removed
- status/verified mixed in spec → state.json separation
- checkpoint.condition free text → enum
- references/task_constraints unstructured → objectified
- T2 atomicity insufficient → T2/T3 separated
- T3 verification bundle → T4/T5 separated
- scope_boundary vs file_scope conflict → scope_boundary removed, replaced with non_goals + file_scope

### v3→v4 Core Change Rationale

| Problem Category | v3 Issue Count | v4 Resolved Count |
|-----------------|----------------|-------------------|
| Critical ambiguity | 5 | 5 (all resolved) |
| Medium ambiguity | 7 | 7 (all resolved) |
| Minor ambiguity | 7 | 7 (all resolved) |
| Structural issues | 1 (spec/state mixed) | 1 (separated) |

---

## Advantages and Disadvantages vs PLAN.md

### Advantages
1. **Programmatic parsing** — Observer can immediately verify with `jq` (PLAN.md requires regex parsing)
2. **Explicit boundaries** — requirements/tasks/constraints separation prevents concern mixing
3. **Diff tracking** — JSON structure changes are clear in git diff
4. **Automated verification pipeline** — `verify.type: command` → direct CI/Observer integration
5. **Triple redundancy resolved** — scenarios are the sole verification source
6. **Contract/status separation** — spec is immutable, state can change freely

### Disadvantages
1. **Authoring cost** — Practical only if specify skill auto-generates
2. **Reduced exploratory thinking** — Free-form writing compressed into structured fields
3. **Raw readability** — PLAN.md is easier for humans to read directly
4. **Schema enforcement required** — Without JSON Schema, it's just "structured markdown"

---

## Next Steps

### Phase 1: Schema + cli (DONE)

- [x] JSON Schema validation file written (dev-spec-v4.schema.json, dev-state-v1.schema.json)
- [x] spec/state manipulation commands implemented in cli
  - `cli spec validate` — validate spec.json against schema
  - `cli state init` — generate initial state.json from spec.json
  - `cli state update T1 --done` — update state.json
  - `cli state check` — spec_hash consistency + orphan key validation
  - `cli state sync` — sync state after spec change
  - `cli feedback create "message"` — create feedback file
  - `cli spec amend --reason fb-001` — modify spec (placeholder)

### Phase 2: /specify Integration + Observer/Coordinator

- [ ] Implement spec.json v4 + state.json generation flow in /specify skill
- [ ] Prototype Observer agent reading spec.json + state.json and writing feedback.json
- [ ] Implement Coordinator feedback → spec amend flow
- [ ] pre-commit hook: block direct spec/state modification (cli only)
- [ ] lint rule: inputs[].artifact ↔ outputs[].id cross-validation
- [ ] lint rule: tasks[].file_scope overlap warning (implemented in cli spec check)
