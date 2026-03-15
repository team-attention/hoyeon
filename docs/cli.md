# hoyeon-cli Reference

Developer workflow CLI for managing spec, state, session, and feedback files.

## Installation

```bash
npm install -g @team-attention/hoyeon-cli
```

Verify installation:

```bash
hoyeon-cli --version
```

## Global Options

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help message |
| `--version` | Show version (injected at build time via esbuild) |

---

## Commands

### spec

Manage spec.json files (create, validate, query, and update).

```
hoyeon-cli spec <subcommand> [options]
```

---

#### spec init

Create a new minimal spec.json file.

```
hoyeon-cli spec init <name> --goal "..." <path> [--type <type>] [--depth <depth>] [--interaction <interaction>]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<name>` | Yes | Spec name (used in `meta.name`) |
| `--goal "..."` | Yes | Goal description (used in `meta.goal`) |
| `<path>` | Yes | Output file path for the new spec.json |
| `--type <type>` | No | Spec type. Valid values: `dev`, `plain` |
| `--depth <depth>` | No | Sets `meta.mode.depth` |
| `--interaction <interaction>` | No | Sets `meta.mode.interaction` |

The created spec contains a single placeholder task `T1` with status `pending` and a `spec_created` history entry.

Fails if the file already exists (use `spec merge` to update an existing spec).

**Example:**

```bash
hoyeon-cli spec init api-auth --goal "Add JWT auth" .dev/specs/api-auth/spec.json
hoyeon-cli spec init my-feature --goal "Build X" --type dev ./spec.json
```

---

#### spec merge

Deep-merge a JSON fragment into an existing spec.json.

```
hoyeon-cli spec merge <path> --json '{...}' [--append]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<path>` | Yes | Path to existing spec.json |
| `--json '{...}'` | Yes | JSON object fragment to merge |
| `--append` | No | When set, arrays are concatenated instead of replaced |

Automatically adds a `spec_updated` history entry and updates `meta.updated_at`. The result is validated against the spec schema before writing.

**Example:**

```bash
hoyeon-cli spec merge ./spec.json --json '{"context":{"request":"Add auth"}}'
hoyeon-cli spec merge ./spec.json --json '{"tasks":[{"id":"T2","action":"test","type":"work","status":"pending"}]}' --append
```

---

#### spec validate

Validate a spec.json file against the dev-spec v5 JSON schema (falls back to v4 if `meta.schema_version` is `"v4"`).

```
hoyeon-cli spec validate <path>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Path to spec.json to validate |

Outputs JSON to stdout: `{"valid": true, "errors": []}` on success, or `{"valid": false, "errors": [...]}` on failure. Exits with code 0 on valid, 1 on invalid.

**Example:**

```bash
hoyeon-cli spec validate ./spec.json
```

---

#### spec plan

Show the execution plan with parallel groups, computed via topological sort (Kahn's algorithm).

```
hoyeon-cli spec plan <path> [--format text|mermaid|json|slim]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<path>` | Yes | Path to spec.json (also accepted via `--spec <path>`) |
| `--format <fmt>` | No | Output format. Default: `text`. Options: `text`, `mermaid`, `json`, `slim` |

**Output formats:**

- **text** -- Human-readable rounds with critical path marked by `*`. Shows task counts, round info, requirement coverage.
- **mermaid** -- Mermaid `graph LR` diagram. Critical path nodes styled with red stroke; verification tasks with dashed green stroke.
- **json** -- Full JSON with rounds, tasks (including `steps`, `file_scope`, `risk`), and critical path.
- **slim** -- Compact JSON with rounds and tasks (only `id`, `action`, `type`, `status`, `depends_on`, and optional `tool`/`args`).

Detects circular dependencies and exits with an error if found.

**Example:**

```bash
hoyeon-cli spec plan ./spec.json
hoyeon-cli spec plan ./spec.json --format mermaid
hoyeon-cli spec plan ./spec.json --format slim
```

---

#### spec task

Update a task's status or retrieve task details from a spec.json.

**Update mode:**

```
hoyeon-cli spec task <task-id> --status <status> [--summary "..."] <path>
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<task-id>` | Yes | Task ID (e.g., `T1`) |
| `--status <status>` | Yes* | New status. Valid values: `pending`, `in_progress`, `done` |
| `--done` | No | Shorthand for `--status done` |
| `--in-progress` | No | Shorthand for `--status in_progress` |
| `--summary "..."` | No | Summary text (recorded when status is `done`) |
| `<path>` | Yes | Path to spec.json |

*One of `--status`, `--done`, or `--in-progress` is required.

Automatically sets `started_at` (on `in_progress`) or `completed_at` (on `done`). Appends a history entry (`task_start` or `task_done`). Validates the spec after update.

**Get mode:**

```
hoyeon-cli spec task <task-id> --get <path>
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<task-id>` | Yes | Task ID to retrieve |
| `--get <path>` | Yes | Path to spec.json (read-only retrieval) |

Outputs the full task object as JSON.

**Example:**

```bash
hoyeon-cli spec task T1 --status done --summary "implemented JWT middleware" ./spec.json
hoyeon-cli spec task T1 --done ./spec.json
hoyeon-cli spec task T2 --in-progress ./spec.json
hoyeon-cli spec task T1 --get ./spec.json
```

---

#### spec status

Show task completion status for a spec.

```
hoyeon-cli spec status <path>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Path to spec.json |

Outputs JSON with fields: `name`, `done`, `in_progress`, `pending`, `total`, `complete` (boolean), `remaining` (array of incomplete tasks).

Exit code: 0 if all tasks are done, 1 if any tasks remain.

**Example:**

```bash
hoyeon-cli spec status ./spec.json
```

---

#### spec meta

Show spec metadata.

```
hoyeon-cli spec meta <path>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Path to spec.json |

Outputs the `meta` object as formatted JSON (name, goal, non_goals, mode, created_at, updated_at, etc.).

**Example:**

```bash
hoyeon-cli spec meta ./spec.json
```

---

#### spec check

Check internal consistency of a spec.json.

```
hoyeon-cli spec check <path>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Path to spec.json |

Checks performed:
- Duplicate task IDs
- `depends_on` references pointing to nonexistent tasks
- `done` tasks missing `completed_at`
- `in_progress` or `done` tasks whose dependencies are not yet `done`
- `acceptance_criteria.scenarios[]` referencing scenario IDs that do not exist in `requirements[].scenarios[].id` (referential integrity)
- `file_scope` overlap across tasks (reported as warnings, not errors)

Exit code: 0 on pass, 1 on failure.

**Example:**

```bash
hoyeon-cli spec check ./spec.json
```

---

#### spec amend

Amend a spec.json based on a feedback file.

```
hoyeon-cli spec amend --reason <feedback-id> --spec <path>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--reason <feedback-id>` | Yes | Feedback ID (e.g., `fb-001`). The feedback file is resolved from `<spec-dir>/feedback/<feedback-id>.json` |
| `--spec <path>` | Yes | Path to spec.json |

Displays the feedback message, updates `meta.updated_at`, and writes the spec. Full amendment logic is a placeholder for future phases.

**Example:**

```bash
hoyeon-cli spec amend --reason fb-001 --spec ./spec.json
```

---

#### spec scenario

Look up a scenario by ID across all `requirements[].scenarios[]` (legacy read-only).

```
hoyeon-cli spec scenario <scenario-id> --get <path>
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<scenario-id>` | Yes | Scenario ID to look up (e.g., `R1-S1`) |
| `--get <path>` | Yes | Path to spec.json (read-only) |

Outputs the matching scenario object as JSON. Exits with code 1 if no scenario with that ID is found.

Note: `spec requirement <id> --get <path>` provides the same functionality and is preferred.

**Example:**

```bash
hoyeon-cli spec scenario R1-S1 --get ./spec.json
```

---

#### spec requirement

Show, retrieve, or update scenario verification status within `requirements[].scenarios[]`.

This subcommand has three modes:

**Status overview mode:**

```
hoyeon-cli spec requirement --status <path> [--json]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `--status` | Yes | Trigger status overview (no scenario ID) |
| `<path>` | Yes | Path to spec.json |
| `--json` | No | Output as JSON instead of text |

Shows all requirements with their scenario verification status. Text format groups output by requirement; each scenario displays `verified_by`, `execution_env`, `status`, and associated task. With `--json`, returns an object with a `requirements` array and a `summary` with `pass`, `fail`, and `pending` counts.

**Get mode:**

```
hoyeon-cli spec requirement <id> --get <path>
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<id>` | Yes | Scenario ID (e.g., `R1-S1`) |
| `--get <path>` | Yes | Path to spec.json (read-only) |

Returns the individual scenario object as JSON. Equivalent to `spec scenario <id> --get <path>`.

**Update mode:**

```
hoyeon-cli spec requirement <id> --status pass|fail|skipped --task <task_id> [--reason <msg>] <path>
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<id>` | Yes | Scenario ID to update (e.g., `R1-S1`) |
| `--status pass\|fail\|skipped` | Yes | Verification result |
| `--task <task_id>` | Yes | ID of the task that performed verification |
| `--reason <msg>` | No | Optional reason or notes for the status |
| `<path>` | Yes | Path to spec.json |

Updates the scenario's `status` and `verified_by_task` fields in spec.json. Used by worker agents after verifying each scenario.

**Example:**

```bash
hoyeon-cli spec requirement --status ./spec.json
hoyeon-cli spec requirement --status ./spec.json --json
hoyeon-cli spec requirement R1-S1 --get ./spec.json
hoyeon-cli spec requirement R1-S1 --status pass --task T3 ./spec.json
hoyeon-cli spec requirement R1-S1 --status fail --task T3 --reason "assertion failed on line 42" ./spec.json
```

---

#### spec sandbox-tasks

Auto-generate sandbox verification tasks from `requirements[].scenarios[]` where `execution_env` is `"sandbox"`.

```
hoyeon-cli spec sandbox-tasks <path> [--json]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<path>` | Yes | Path to spec.json |
| `--json` | No | Output result as JSON |

Scans all scenarios with `execution_env: "sandbox"` and creates:
- `T_SANDBOX` — infra preparation task (created only if it does not already exist)
- `T_SV1` through `T_SVN` — one verification task per sandbox scenario

`depends_on` fields are auto-calculated for each `T_SV` task. With `--json`, returns an object with `sandbox_scenarios` and `created_tasks` arrays.

**Example:**

```bash
hoyeon-cli spec sandbox-tasks ./spec.json
hoyeon-cli spec sandbox-tasks ./spec.json --json
```

---

#### spec derive

Create a derived task in spec.json (for retries, adaptations, or code review fixes).

```
hoyeon-cli spec derive --parent <id> --source <src> --trigger <t> --action <a> --reason <r> <path>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--parent <id>` | Yes | Parent task ID (e.g., `T1`) |
| `--source <src>` | Yes | Source of the derivation (e.g., `worker`, `verifier`) |
| `--trigger <t>` | Yes | What triggered the derived task (e.g., `test_failure`, `review_comment`) |
| `--action <a>` | Yes | Action description for the derived task |
| `--reason <r>` | Yes | Human-readable reason for creating the derived task |
| `<path>` | Yes | Path to spec.json |

Auto-generates an ID (e.g., `T1.retry-1`, `T2.adapt-1`) based on the parent ID and trigger. Sets `origin: "derived"` and `derived_from: <parent>`, then appends the new task to the `tasks` array.

Outputs JSON: `{"created": "T1.retry-1"}`.

**Example:**

```bash
hoyeon-cli spec derive --parent T1 --source verifier --trigger test_failure --action "Fix broken assertion" --reason "Unit test failed in T1" ./spec.json
```

---

#### spec drift

Show the drift ratio between derived and planned tasks.

```
hoyeon-cli spec drift <path>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Path to spec.json |

Outputs the drift ratio: derived tasks divided by planned (non-derived) tasks. A high drift ratio indicates that the execution deviated significantly from the original plan.

**Example:**

```bash
hoyeon-cli spec drift ./spec.json
```

---

#### spec guide

Show schema documentation for spec.json sections.

```
hoyeon-cli spec guide [section]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `[section]` | No | Section name to display. Omit to show general usage. |

Available sections:

| Section | Description |
|---------|-------------|
| `list` | List all available guide sections |
| `task` | Show task schema fields |
| `acceptance-criteria` | Show v5 AC structure (scenarios + checks) |
| `merge` | Show merge modes (`replace`, `--append`, `--patch`) |

**Example:**

```bash
hoyeon-cli spec guide list
hoyeon-cli spec guide task
hoyeon-cli spec guide acceptance-criteria
hoyeon-cli spec guide merge
```

---

### state

Read or update workflow state (state.json), which tracks task execution progress separately from the spec.

```
hoyeon-cli state <subcommand> [options]
```

---

#### state init

Initialize a state.json from a spec.json file.

```
hoyeon-cli state init --spec <path> [--output <path>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--spec <path>` | Yes | Path to source spec.json |
| `--output <path>` | No | Output path for state.json. Default: `state.json` in the same directory as the spec |

Creates a state.json containing:
- `spec_ref` -- relative path from state.json to spec.json
- `spec_hash` -- SHA-256 hash of the spec file
- `tasks` -- map of task IDs to `{status: "pending"}`
- `verifications`, `assumptions` -- empty objects
- `history` -- empty array

Validates against the dev-state-v1 schema. Fails on duplicate task IDs or missing `id` fields.

**Example:**

```bash
hoyeon-cli state init --spec ./spec.json
hoyeon-cli state init --spec ./spec.json --output ./run/state.json
```

---

#### state update

Update a task's status in state.json.

```
hoyeon-cli state update <task-id> --status <status> [--state <path>]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `<task-id>` | Yes | Task ID to update |
| `--status <status>` | Yes* | New status. Valid values: `pending`, `in_progress`, `done`, `blocked_by` |
| `--done` | No | Shorthand for `--status done` |
| `--in-progress` | No | Shorthand for `--status in_progress` |
| `--blocked-by <task-id>` | Conditional | Required when status is `blocked_by`. Specifies the blocking task |
| `--state <path>` | No | Path to state.json. Default: `./state.json` |

*One of `--status`, `--done`, or `--in-progress` is required.

Automatically sets `started_at` (on `in_progress`) and `completed_at` (on `done`). Appends a history entry. Removes `blocked_by` field when transitioning away from `blocked_by` status.

**Example:**

```bash
hoyeon-cli state update T1 --done --state ./state.json
hoyeon-cli state update T1 --status in_progress --state ./state.json
hoyeon-cli state update T1 --status blocked_by --blocked-by T2 --state ./state.json
```

---

#### state check

Check consistency between spec.json and state.json.

```
hoyeon-cli state check --spec <path> --state <path>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--spec <path>` | Yes | Path to spec.json |
| `--state <path>` | Yes | Path to state.json |

Checks performed:
- `spec_hash` in state matches current SHA-256 hash of spec file
- No orphan tasks in state (tasks present in state but not in spec)

Exit code: 0 on pass, 1 on failure.

**Example:**

```bash
hoyeon-cli state check --spec ./spec.json --state ./state.json
```

---

#### state sync

Sync state.json after spec.json changes (tasks added or removed).

```
hoyeon-cli state sync --spec <path> --state <path>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--spec <path>` | Yes | Path to spec.json |
| `--state <path>` | Yes | Path to state.json |

Actions:
- Adds new tasks from spec (set to `pending`)
- Removes tasks from state that no longer exist in spec
- Updates `spec_hash` to current value
- Appends a `sync` history entry

**Example:**

```bash
hoyeon-cli state sync --spec ./spec.json --state ./state.json
```

---

### session

Manage session state stored at `~/.hoyeon/{session-id}/state.json`.

```
hoyeon-cli session <subcommand> [options]
```

---

#### session set

Update session state.

```
hoyeon-cli session set --sid <session-id> [--spec <path>] [--key <k> --value <v>] [--json '{...}']
```

| Flag | Required | Description |
|------|----------|-------------|
| `--sid <id>` | Yes | Session ID |
| `--spec <path>` | No | Set the `spec` key in session state |
| `--key <k>` | No | Arbitrary key to set (requires `--value`) |
| `--value <v>` | Conditional | Value for `--key` (required when `--key` is used) |
| `--json '{...}'` | No | JSON object to deep-merge into session state |

Multiple update modes can be combined in a single call. Creates the session directory and state file if they do not exist.

**Example:**

```bash
hoyeon-cli session set --sid abc123 --spec .dev/specs/foo/spec.json
hoyeon-cli session set --sid abc123 --key tmp_dir --value /tmp/run-1
hoyeon-cli session set --sid abc123 --json '{"rulph": {"round": 0}}'
```

---

#### session get

Read session state.

```
hoyeon-cli session get --sid <session-id>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--sid <id>` | Yes | Session ID |

Outputs the full session state as formatted JSON. Exits with code 1 if no state exists for the given session.

**Example:**

```bash
hoyeon-cli session get --sid abc123
```

---

### feedback

Manage feedback files.

```
hoyeon-cli feedback <subcommand> [options]
```

---

#### feedback create

Create a new feedback file with an auto-incrementing ID.

```
hoyeon-cli feedback create "<message>" [--dir <path>]
```

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `"<message>"` | Yes | Feedback message text |
| `--dir <path>` | No | Directory to write feedback files. Default: `./feedback` |

Creates a JSON file named `fb-NNN.json` (e.g., `fb-001.json`, `fb-002.json`) in the target directory. The file contains:

```json
{
  "id": "fb-001",
  "message": "...",
  "created_at": "2024-01-01T00:00:00.000Z",
  "status": "open"
}
```

The ID is auto-incremented based on existing files in the directory.

**Example:**

```bash
hoyeon-cli feedback create "Missing acceptance criteria for T3"
hoyeon-cli feedback create "Scope is too broad" --dir ./project/feedback
```

---

## File Write Behavior

All write operations (spec, state, session) use an atomic write pattern via `state-io.js`:

1. Write to a `.tmp` file
2. Rename `.tmp` to the target path
3. Keep the last 3 timestamped backups (`*.backup-<timestamp>`)

This prevents corruption from interrupted writes.
