---
name: quick-plan
description: |
  "/quick-plan", "quick plan", "태스크 플래닝", "작업 계획", "세션 플래닝",
  "plan tasks", "what should we do", "작업 정리", "DAG 짜줘",
  "병렬로 돌리자", "팀 모드로 하자", "에이전트 배치"
allowed_tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - AskUserQuestion
  - Skill
  - Agent
  - TaskCreate
  - TaskUpdate
  - TaskList
validate_prompt: |
  Must contain all of these sections:
  1. "## Task Breakdown" with numbered tasks and touch zones
  2. "## Dependency DAG" showing task relationships
  3. "## Overlap Matrix" if any touch zone overlaps exist
  4. "## Coordination Mode" with mode (agent-spawn or team) and rationale
  5. "## Agent Mapping" table with columns: #, Task, Tool, Type, Source, Rationale
  6. "## Execution Plan" with parallel rounds and context sharing notes
  Must end with AskUserQuestion offering next actions (Execute / Revise plan / Discuss further).
  Must NOT generate spec.json until user explicitly chooses "Execute".
  Must NOT: create teams or spawn agents during planning.
  spec.json must include requirements (one per task) with sub-requirements before tasks are merged.
  spec.json must include context.known_gaps (at least one assumption/gap about the plan).
  If any task has type: dev, spec.json must include context.research with commands and structure.
---

# /quick-plan — Session Task Planner

Take user's session goals and produce an optimized execution plan that maximizes parallelism.

## Workflow

### Phase 1: Gather Context

1. Read CLAUDE.md and recent git log to understand project state
2. If user's goals are vague, ask up to 2 clarifying questions via AskUserQuestion
3. If goals are clear, skip straight to Phase 2

### Phase 1.5: Quick Discovery (conditional)

Run a lightweight codebase scan to improve touch zone accuracy and discover verification commands.

```
IF user's goals involve code changes (likely type: dev tasks):
  Agent(subagent_type="code-explorer",
        prompt="Find: project structure, key directories, test/lint/build commands (package.json scripts, Makefile, etc.), and files related to [user's goal areas]. Report as file:line format.")

  → Store results for Phase 5 (tool discovery) and Phase 9 (context.research merge)

IF goals are purely non-code (research, analysis, documentation):
  → Skip discovery entirely
```

**Cost**: ~10-15 seconds for 1 agent. **Benefit**: touch zones reference real files, verification commands auto-discovered.

### Phase 2: Task Decomposition

Break goals into atomic tasks. Each task must be:
- **Single-responsibility**: one clear deliverable
- **Verifiable**: has a clear done condition
- **Assignable**: can be given to one agent

Sweet spot: 3-8 tasks per session. Prefer fewer larger tasks over many tiny ones.

### Phase 3: Dependency Analysis

For each task determine:
- **blockedBy**: what must complete first?
- **blocks**: what does this unblock?
- **parallel?**: can it run alongside other tasks?

Build a DAG. Minimize sequential depth — maximize parallel width.

### Phase 3.5: Overlap Analysis

For each task, identify its **touch zone** — the files and modules it will modify.

1. **List touch zones**: For each task, enumerate target files/directories
2. **Detect overlaps**: If two tasks modify the same file or tightly-coupled module:
   - **Merge**: Combine into one task if small enough
   - **Serialize**: Make one block the other if merging is too large
   - **Never**: Let overlapping tasks run in parallel (guaranteed merge conflicts)
3. **No overlap** → mark as parallel-safe

Output an overlap matrix in Phase 7 if any overlaps were found.

### Phase 3.7: Context Sharing Strategy

Even when tasks are orthogonal in code, agents benefit from shared context.

For each task, determine:
- **Needs to know**: What context from other tasks improves this agent's decisions?
- **Produces**: What results/decisions should be shared with downstream agents?

Patterns:
- **Summary injection**: Give each agent a 1-line summary of what sibling agents are doing
- **Result forwarding**: Pass prior round outputs as read-only context to next round agents
- **Shared decisions doc**: If multiple agents need the same architectural decision, resolve it in Round 0

Rule: **Code changes = orthogonal, Information = shared.**

### Phase 4: Coordination Mode Decision

Decide between two modes:

| | **Agent spawn** (default) | **Team mode** |
|---|---|---|
| Pattern | Fan-out/fan-in | Persistent agents |
| Communication | Orchestrator relays results | Agents message each other directly |
| Task discovery | Static (all known upfront) | Dynamic (new tasks found during execution) |
| Agent lifecycle | Spawn → result → done | Spawn → work → idle → pick up next task |

**Rule**: Orchestrator relay sufficient → `agent-spawn`. Agents need direct communication → `team`.

### Phase 5: Tool Discovery

For each task, perform priority-based tool discovery by scanning skill and agent directories in order:

**Scan order (highest priority first):**

1. **Plugin scope**: `${baseDir}/.claude/skills/` and `${baseDir}/.claude/agents/`
   - Read each SKILL.md / agent.md description field
2. **Project scope**: `{project_root}/.claude/skills/` and `{project_root}/.claude/agents/`
   - `{project_root}` = directory containing the project's CLAUDE.md
3. **User scope**: `~/.claude/skills/` and `~/.claude/agents/`
4. **Default fallback**: Agent tool's subagent_type list → `general-purpose`

**Matching logic per task:**

- Match the task description against skill/agent description fields (semantic similarity)
- First match wins (plugin scope takes priority over project, project over user, user over default)
- Record both the matched tool and where it was found (source)

**Assignment rules:**

| Match result | task.tool | task.type |
|---|---|---|
| Skill found | `/skill-name` (e.g., `/bugfix`) | `plain` (unless skill does code changes → `dev`) |
| Agent found | `agent-subtype` (e.g., `worker`) | `dev` if code changes, else `plain` |
| Code changes needed, no match | `worker` | `dev` |
| No code changes, no match | `general-purpose` | `plain` |

**type inference heuristics:**
- `dev`: task modifies source files, writes code, runs tests → requires dev pipeline
- `plain`: task reads, analyzes, documents, or invokes a skill that handles its own execution

### Phase 6: Execution Plan

Group tasks into parallel rounds:
- Round 1: All tasks with no dependencies (launch simultaneously)
- Round 2: Tasks unblocked by Round 1
- Round N: Continue until all scheduled

For each round specify:
- Which agents launch in parallel
- What context/results they need from prior rounds
- Whether they need `isolation: "worktree"` (code changes that might conflict)

### Phase 7: Present Plan

Output the complete plan in this format:

```
## Task Breakdown

1. **{task-name}**: {description} → Done when: {condition} | Touch: `{files/dirs}`
2. ...

## Dependency DAG

{ASCII diagram}

## Overlap Matrix (if any)

| Task A | Task B | Shared files | Resolution |
|--------|--------|-------------|------------|
| 1 | 3 | types.ts | Serialize (1→3) |

## Context Sharing

| Round | Agent | Receives context from |
|-------|-------|----------------------|
| 2 | C | A's output summary |

## Coordination Mode

mode: agent-spawn | team
rationale: {one-line reason}

## Agent Mapping

| # | Task | Tool | Type | Source | Rationale |
|---|------|------|------|--------|-----------|
| 1 | ... | worker | dev | default | ... |

## Execution Plan

### Round 1 (Parallel)
- Agent A: {task} — no dependencies | context: sibling summary
- Agent B: {task} — no dependencies | context: sibling summary

### Round 2 (After Round 1)
- Agent C: {task} — needs results from A | context: A's output + sibling summary

## Estimated Parallelism

- Total tasks: N
- Sequential depth: M rounds
- Max parallel width: K agents
```

After presenting the plan, proceed immediately to Phase 8 (do NOT wait for approval).

### Phase 8: Next Action

Ask user via AskUserQuestion:

```
The plan is ready. What would you like to do?

1. Execute — generate spec.json and run /execute immediately
2. Revise plan — let me know what you'd like to change
3. Discuss further — let me know if anything needs more review
```

- If user chooses **1 (Execute)**: proceed to Phase 9
- If user chooses **2 or 3**: handle feedback, revise plan, then re-ask Phase 8

### Phase 9: Generate spec.json & Execute

Only runs when user explicitly chooses to execute.

#### 9.1 Session Directory

```bash
SESSION_ID="[session ID from UserPromptSubmit hook]"
SESSION_DIR="$HOME/.hoyeon/$SESSION_ID"
SPEC_PATH="$SESSION_DIR/spec.json"
```

#### 9.2 Initialize spec.json

Determine the plan type based on task composition from Phase 5:
- If **any task has `type: dev`** → use `--type dev` (dev pipeline with worktree isolation)
- If **all tasks have `type: plain`** → use `--type plain` (lightweight skill-only pipeline)

```bash
hoyeon-cli spec init {plan-name} --goal "{user's goal}" --type dev|plain --schema v1 ${SPEC_PATH}
```

`{plan-name}`: derive from user's goal (kebab-case, max 30 chars).

#### 9.2.5 Merge lightweight requirements

Before merging tasks, generate **lightweight requirements** from the task breakdown.
Each task's "Done when" condition becomes a requirement with one sub-requirement.

Rules:
- One requirement per task (R1 maps to T1, R2 to T2, etc.)
- Each requirement has exactly one sub-requirement with id and behavior
- When the done-when condition has clear precondition/action/outcome structure, add optional GWT fields (given, when, then)
  - Example: `{ "id": "R1.1", "behavior": "Config file validates on load", "given": "Config file exists with valid YAML", "when": "Application starts", "then": "Config is parsed without errors" }`
- Keep it minimal — no gap analysis, no multi-sub-requirement requirements

> **⚠️ Merge Convention**: All `spec merge --json '...'` examples below show JSON inline for readability. In practice:
> 1. **Always run `hoyeon-cli spec guide <section>` before constructing merge JSON** to verify field names and types
> 2. **Always use file-based passing**: write JSON to `/tmp/spec-merge.json` via `<< 'EOF'` heredoc, then pass via `--json "$(cat /tmp/spec-merge.json)"`, then `rm /tmp/spec-merge.json`
> 3. **On merge failure**: run `spec guide <failed-section>`, fix JSON to match schema, retry once

```bash
# 1. Check field structure
hoyeon-cli spec guide requirements

# 2. Construct JSON with requirements.id, requirements.behavior, requirements.sub[]
#    Each sub-requirement needs: id, behavior
#    Optional GWT fields: given (precondition), when (action), then (expected outcome)
#    Example sub: { "id": "R1.1", "behavior": "Login rejects invalid credentials",
#                   "given": "User is on login page", "when": "User submits wrong password", "then": "Error message shown and login denied" }

# 3. Merge via file-based passing
cat > /tmp/spec-merge.json << 'EOF'
{ "requirements": [ ... ] }
EOF
hoyeon-cli spec merge ${SPEC_PATH} --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

This ensures:
- `fulfills[]` in tasks reference real requirement IDs for behavior verification
- Final Verify in /execute can check requirement sub-requirements via fulfills → req.sub[]

#### 9.2.7 Merge context

Merge the context gathered during planning. Content is **type-aware**:

```bash
# 1. Check field structure
hoyeon-cli spec guide context

# 2. Construct JSON with context fields:
#    - confirmed_goal: user's confirmed goal statement
#    - decisions: key planning decisions (id, decision, rationale)
#    - known_gaps: assumptions and unknowns as string array
#    IF any task has type: dev → also include context.research (string array of key findings)

# 3. Merge via file-based passing
cat > /tmp/spec-merge.json << 'EOF'
{ "context": { "confirmed_goal": "...", "decisions": [...], "known_gaps": [...], "research": [...] } }
EOF
hoyeon-cli spec merge ${SPEC_PATH} --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

**known_gaps to always capture** (at minimum):
- Task independence / overlap assumptions (e.g., "Assumes T1 and T2 have no file overlap")
- Tool/skill availability assumptions (e.g., "Assumes existing test infra can be reused")
- Scope assumptions (e.g., "Assumes no database migration needed")

These known_gaps give /execute triage context when things go wrong.

#### 9.3 Merge tasks

Merge **all tasks in a single call** — this replaces the placeholder T1 from `spec init`.
Do NOT call merge per task (without `--append`, each call overwrites the previous tasks array).

```bash
# 1. Check field structure
hoyeon-cli spec guide tasks

# 2. Construct JSON with all tasks in a single array
#    Each task needs: id, action, type, status, depends_on, fulfills
#    Optional: tool (dispatch hint for plain mode — skill name like /bugfix or agent subtype like worker)
#    Acceptance criteria = sub-req behaviors (+ GWT fields when available) from fulfills[] (Worker reads requirements directly)

# 3. Merge ALL tasks in one call via file-based passing
cat > /tmp/spec-merge.json << 'EOF'
{ "tasks": [ { "id": "T1", ... }, { "id": "T2", ... } ] }
EOF
hoyeon-cli spec merge ${SPEC_PATH} --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

Map from plan:
- Task Breakdown → `action` (include implementation steps inline in the action description)
- Done condition → `fulfills[]` (requirement IDs) → sub-req behaviors (+ GWT fields when available) as acceptance criteria
- Dependency DAG → `depends_on`
- Agent Mapping → `tool` (from Phase 5 discovery, optional — used for plain mode dispatch)

#### 9.3.5 Auto-generate sandbox tasks

After all tasks are merged, check for sandbox sub-requirements and generate infra + verification tasks:

```bash
# Auto-generates T_SANDBOX (infra prep) + T_SV1~N (per-sub-requirement verification) tasks
# No-ops if no execution_env: sandbox sub-requirements exist
hoyeon-cli spec sandbox-tasks ${SPEC_PATH}
```

This command scans all sub-requirements for `execution_env: "sandbox"` and automatically creates the required infra and per-sub-requirement verification tasks with correct `depends_on` wiring.

#### 9.4 Update state.json

Update the session state to point to the generated spec:

```bash
hoyeon-cli session set --sid $SESSION_ID --spec "$SPEC_PATH"
```

#### 9.5 Validate

```bash
hoyeon-cli spec validate ${SPEC_PATH}
```

If validation fails, fix and retry once.

#### 9.6 Hand off to /execute

Output: `spec.json generated: ${SPEC_PATH}`

Then invoke the `/execute` skill to begin execution.

## Constraints

- Do NOT directly execute tasks — delegate to `/execute` skill after spec.json generation
- Do NOT create teams or spawn agents — only propose the structure
- Do NOT modify project files — only write to ~/.hoyeon/{session}/
- If a task is ambiguous, flag it and suggest clarification
