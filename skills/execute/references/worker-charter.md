# Worker Charter Recipe

Canonical recipe for every worker dispatched by execute (direct / agent / team).
This file is the single source of truth for:

1. What the charter (orchestrator → worker) MUST contain — and what it MUST NOT.
2. What every worker completion message (worker → orchestrator) MUST produce.
3. What the worker process looks like end-to-end, including round > 1 context read
   and post-completion learnings / issues append.

All three dispatch recipes (`direct.md`, `agent.md`, `team.md`) import this file by
reference and MUST NOT duplicate charter / output contracts locally. Any divergence
between a dispatch recipe and this file is a bug in the dispatch recipe.

Related contracts: see `contracts.md` — `WorkerCharter`, `WorkerOutput`, INV-2, INV-5.

---

## 1. Charter Shape (orchestrator → worker)

*fulfills R-F6.1, R-N15.1*

A charter is a small JSON object containing **only paths and IDs**. The charter
carries no spec prose. The worker is responsible for reading the authoritative
source files itself.

### 1.1 Required fields

| field                   | type              | meaning                                                        |
| ----------------------- | ----------------- | -------------------------------------------------------------- |
| `task_id`               | string            | plan.json task identifier (e.g. `T7`)                          |
| `plan_path`             | string            | absolute path to `<spec_dir>/plan.json`                        |
| `contracts_path`        | string \| null    | absolute path to `<spec_dir>/contracts.md` (null if missing)   |
| `sub_req_ids`           | string[]          | the sub-requirement IDs this task must fulfill                 |
| `round`                 | number            | dispatch round, 1-indexed                                      |
| `prior_failure_context` | string \| null    | short failure summary injected on round > 1 only; else null    |

### 1.2 Canonical charter example

```json
{
  "task_id": "T7",
  "plan_path": "/abs/path/.hoyeon/specs/execute/plan.json",
  "contracts_path": "/abs/path/.hoyeon/specs/execute/contracts.md",
  "sub_req_ids": ["R-F6.1", "R-F6.2", "R-F6.3", "R-F6.4", "R-N15.1", "R-N17.1"],
  "round": 1,
  "prior_failure_context": null
}
```

### 1.3 What MUST NOT appear in a charter

*fulfills R-N15.1, INV-2*

The charter is a **pointer**, never a payload. The following are hard bans:

- **No inlined GWT text** — no `given` / `when` / `then` strings copied from
  requirements.md or plan.json sub-requirements.
- **No inlined requirements prose** — no `behavior` descriptions, no user-facing
  rationale, no requirement body text.
- **No inlined contracts.md content** — no interface definitions, no invariants,
  no data-type schemas copied into the charter.
- **No task.action body** — the worker reads `task.action` from plan.json via
  `hoyeon-cli2 plan get`.
- **No file scope hints beyond IDs** — no "edit file X, line Y" directives; the
  worker derives scope from the task action + sub_req GWT it reads itself.

If a dispatch recipe ever embeds any of the above in a worker prompt, it violates
INV-2 and must be rewritten to reference `sub_req_ids` + paths only.

---

## 2. Worker Output Shape (worker → orchestrator)

*fulfills R-F6.2, contracts.md `WorkerOutput`*

Every worker, regardless of dispatch mode, returns a JSON payload with this shape
as the last message. The orchestrator parses this shape to build the coverage
matrix and drive the verify pipeline.

### 2.1 Required fields

| field                    | type                                    | meaning                                                     |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------- |
| `status`                 | `"done" \| "failed" \| "blocked"`       | terminal state                                              |
| `summary`                | string                                  | one-line human summary                                      |
| `files_modified`         | string[]                                | absolute or repo-relative paths touched                     |
| `fulfills`               | `{sub_req_id, file_path, line}[]`       | **required** citation per sub_req in charter `sub_req_ids`  |
| `contract_mismatch`      | string \| null                          | free-text contract mismatch signal (null when none)         |
| `blocked_reason`         | string                                  | **required** when `status == "blocked"`; else omitted       |

### 2.2 fulfills citation rule

*fulfills R-F6.2*

`fulfills` MUST contain exactly one entry per sub_req ID in the
charter's `sub_req_ids`. Each entry cites a concrete `file_path:line` that satisfies
the sub_req's GWT. Missing entries cause the coverage matrix to mark the sub_req
as GAP per R-F10.2 and trigger a re-dispatch per R-F10.3.

### 2.3 Canonical output example

```json
{
  "status": "done",
  "summary": "Implemented worker charter recipe with self-read + attribution + round>1 context read",
  "files_modified": [
    "/abs/path/.claude/skills/execute/references/worker-charter.md"
  ],
  "fulfills": [
    {"sub_req_id": "R-F6.1", "file_path": ".claude/skills/execute/references/worker-charter.md", "line": "1.2"},
    {"sub_req_id": "R-F6.2", "file_path": ".claude/skills/execute/references/worker-charter.md", "line": "2.2"},
    {"sub_req_id": "R-F6.3", "file_path": ".claude/skills/execute/references/worker-charter.md", "line": "3.2"},
    {"sub_req_id": "R-F6.4", "file_path": ".claude/skills/execute/references/worker-charter.md", "line": "3.5"},
    {"sub_req_id": "R-N15.1", "file_path": ".claude/skills/execute/references/worker-charter.md", "line": "1.3"},
    {"sub_req_id": "R-N17.1", "file_path": ".claude/skills/execute/references/worker-charter.md", "line": "4"}
  ],
  "contract_mismatch": null
}
```

### 2.4 Blocked / failed output examples

```json
{
  "status": "blocked",
  "summary": "Cannot proceed — depends_on task T3 produces output that is missing",
  "files_modified": [],
  "fulfills": [],
  "contract_mismatch": null,
  "blocked_reason": "T3 did not emit expected interface FooAPI; see issues.json"
}
```

```json
{
  "status": "failed",
  "summary": "Typecheck fails after change — could not reconcile with contract FooAPI",
  "files_modified": ["src/foo.ts"],
  "fulfills": [
    {"sub_req_id": "R-X.1", "file_path": "src/foo.ts", "line": "42"}
  ],
  "contract_mismatch": "FooAPI.call signature diverges from contracts.md line 88"
}
```

---

## 3. Worker Process (step-by-step)

The canonical sequence every worker runs, regardless of dispatch mode.

### 3.1 Step 1 — Self-read (ALWAYS)

*fulfills R-F6.1*

The worker receives only the charter. It MUST read the authoritative sources itself:

```bash
# fetch task.action and task.fulfills[] — charter does not carry these
hoyeon-cli2 plan get <plan_path>    # or: ... --path tasks --filter id=<task_id>

# 1b. Read the sub-requirements named in sub_req_ids
#     The worker reads requirements.md with the Read tool for each sub_req's GWT
Read <spec_dir>/requirements.md

# 1c. Read contracts.md if contracts_path is not null
IF charter.contracts_path != null:
  Read <charter.contracts_path>
```

The worker NEVER trusts the charter to carry GWT or spec prose — it always reads
from requirements.md / contracts.md directly. This keeps charters tiny and makes
spec drift impossible to smuggle into worker prompts.

### 3.2 Step 2 — Round > 1 context read (CONDITIONAL)

*fulfills R-F6.3*

Before writing any code on round 2+, the worker reads prior-round context:

```bash
IF charter.round > 1:
  Read <spec_dir>/learnings.json       # structured successes from prior workers
  Read <spec_dir>/issues.json          # structured failures / avoidance notes
  # charter.prior_failure_context is already injected inline — re-read as a check
```

The worker uses these to avoid repeating past mistakes. This read happens
**before** any Edit / Write call — not during implementation.

### 3.3 Step 3 — Implement

The worker implements `task.action`, satisfying every sub_req in
`charter.sub_req_ids` per its GWT. It may use Read / Edit / Write / Bash freely.
It MUST NOT run git commands (commits are handled by the orchestrator per C2).

### 3.4 Step 4 — Self-verify (Tier 1)

Before reporting `done`, the worker:

1. Confirms every sub_req GWT is satisfied by concrete code lines.
2. Runs project build / lint / typecheck.
3. **Runs existing test suite** — if a test runner is detected (e.g., `npm test`,
   `pytest`, `cargo test`), execute it. Existing test failures after code changes
   are regression bugs and MUST be fixed before reporting done. If no test runner
   is detected, skip this step (greenfield projects may not have tests yet).
4. Builds the `fulfills` array by locating the exact `file_path:line` for
   each sub_req.

### 3.5 Step 5 — Append learning or issue

*fulfills R-F6.4, R-N17.1*

**Post-completion classification**:

- `status == "done"` → append a structured learning to
  `<spec_dir>/learnings.json` using Read + Write (NOT cli2 — see §4).
- `status == "failed"` or `status == "blocked"` → append a structured issue to
  `<spec_dir>/issues.json` using Read + Write (NOT cli2 — see §4).

Learning entry shape:

```json
{
  "task": "T7",
  "round": 1,
  "problem": "...",
  "cause": "...",
  "rule": "...",
  "tags": ["charter", "self-read"]
}
```

Issue entry shape:

```json
{
  "task": "T7",
  "round": 1,
  "type": "blocker | failed_approach | out_of_scope",
  "description": "...",
  "suggested_fix": "..."
}
```

These files are append-only JSON arrays. The worker reads the current contents,
pushes the new entry, and writes back — all via Read / Write (never cli2).

**Sequencing constraint**: Step 6 MUST NOT begin until Step 5 write
(learnings/issues.json) is confirmed durable. Steps are strictly sequential,
not concurrent. The worker MUST observe the Read-then-Write cycle complete (and
the resulting file on disk) before issuing the `plan task --status` call in §3.6.

### 3.6 Step 6 — Mark task status via cli2, then return WorkerOutput

*fulfills R-N17.1, INV-5*

Step 6 runs only after Step 5's learnings/issues.json write has flushed to disk;
these two steps are strictly sequential, never concurrent.

```bash
hoyeon-cli2 plan task <plan_path> --status <task_id>=<done|failed|blocked>
```

Then emit the WorkerOutput JSON (§2) as the worker's last message.

---

## 4. Tool Boundary: cli2 vs Read/Write/Edit

*fulfills R-N17.1, INV-5*

The worker and orchestrator both obey a strict tool boundary:

| Artifact           | Read via        | Mutate via                                    |
| ------------------ | --------------- | --------------------------------------------- |
| `plan.json`        | `cli2 plan get` | `cli2 plan task --status` (only)              |
| `contracts.md`     | `Read` tool     | `Edit` / `Write` tool — **orchestrator only** |
| `requirements.md`  | `Read` tool     | (not mutated by execute)                     |
| `learnings.json`   | `Read` tool     | `Read + Write` tool                           |
| `issues.json`      | `Read` tool     | `Read + Write` tool                           |
| `audit.md`         | `Read` tool     | `Edit` / `Write` tool                         |

**Worker exclusion for contracts.md**: Workers MUST NOT Edit/Write
`contracts.md` directly. A worker that detects a contract mismatch signals it
via the `contract_mismatch` field in WorkerOutput (§2.1) and stops — it does
not attempt to patch the contract itself. Only the orchestrator, via the
`contracts-patch.md` recipe, may mutate `contracts.md`. Any edit to
`contracts.md` that does not originate from `contracts-patch.md` is a bug.

Rule, restated: **cli2 is the ONLY mutation surface for plan.json, and cli2 is
NEVER used for any other file.** Never call `cli2 plan merge` to write learnings
or issues — those are flat JSON arrays maintained by Read + Write.

---

## 5. Anti-Patterns (what a charter MUST NOT contain)

*fulfills R-N15.1, INV-2*

The following patterns have appeared in older dispatch recipes and are banned.
Any dispatch recipe exhibiting one of these must be refactored to reference this
file instead.

### 5.1 Inlined GWT text

**BANNED**:
```
charter.sub_requirements = [
  {"id": "R-F6.1", "given": "worker dispatch", "when": "charter created",
   "then": "charter is task ID + plan path + contracts path + sub_req IDs only"}
]
```

**Correct**: charter carries `sub_req_ids: ["R-F6.1"]` only. The worker reads
the GWT from requirements.md itself.

### 5.2 Inlined requirements prose

**BANNED**:
```
charter.prompt = "Implement task T7: charter must contain no spec body..."
```

**Correct**: charter references `task_id: "T7"`. The worker runs
`hoyeon-cli2 plan get` to fetch `task.action`.

### 5.3 Inlined contracts.md content

**BANNED**:
```
charter.contracts_excerpt = "WorkerCharter { task_id: string, plan_path: string, ... }"
```

**Correct**: charter carries `contracts_path` only. The worker reads
contracts.md itself (or skips the read if `contracts_path` is null).

### 5.4 Inlined task.action body or file-scope directives

**BANNED**:
```
charter.action = "Write the worker charter recipe at .claude/skills/execute/..."
charter.edit_targets = ["references/worker-charter.md:1-400"]
```

**Correct**: charter carries `task_id` only. The worker reads `task.action`
from plan.json and derives scope from sub_req GWT.

### 5.5 Anything beyond the six fields in §1.1

If a field is not listed in §1.1, it does not belong in the charter. No
"helpful context", no "inline hints", no "pre-read summaries". Paths and IDs
only.

---

## 6. Interaction with dispatch recipes

- `direct.md` — orchestrator IS the worker; the "charter" collapses to the
  orchestrator's own execution plan, but the self-read + fulfills attribution +
  learnings/issues append rules still apply.
- `agent.md` — each subagent receives one charter per task (or grouped
  charter-per-task-list). The subagent prompt template must quote §1 / §2 / §3
  of this file and inline only the charter JSON — not requirements / GWT.
- `team.md` — persistent workers pull charters from a queue and run the §3
  process on each claim. Round > 1 context read applies when the same task
  re-enters the queue.

Any dispatch recipe that wants to add a field or behavior to charters or worker
output must update this file first, then the dispatch recipes may reference the
new field.
