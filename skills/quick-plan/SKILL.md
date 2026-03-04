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
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
validate_prompt: |
  Must contain all of these sections:
  1. "## Task Breakdown" with numbered tasks
  2. "## Dependency DAG" showing task relationships
  3. "## Coordination Mode" with mode (agent-spawn or team) and rationale
  4. "## Agent Mapping" table with columns: Task, Agent, Model, Rationale
  5. "## Execution Plan" with parallel rounds
  Must NOT: execute any tasks, create teams, or spawn agents.
---

# /quick-plan — Session Task Planner

Take user's session goals and produce an optimized execution plan that maximizes parallelism.

## Workflow

### Phase 1: Gather Context

1. Read CLAUDE.md and recent git log to understand project state
2. If user's goals are vague, ask up to 2 clarifying questions via AskUserQuestion
3. If goals are clear, skip straight to Phase 2

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

### Phase 4: Coordination Mode Decision

Decide between two modes:

| | **Agent spawn** (default) | **Team mode** |
|---|---|---|
| Pattern | Fan-out/fan-in | Persistent agents |
| Communication | Orchestrator relays results | Agents message each other directly |
| Task discovery | Static (all known upfront) | Dynamic (new tasks found during execution) |
| Agent lifecycle | Spawn → result → done | Spawn → work → idle → pick up next task |

**Rule**: Orchestrator relay sufficient → `agent-spawn`. Agents need direct communication → `team`.

### Phase 5: Agent Matching

For each task, check the currently available agents (from the Agent tool's subagent_type list) and pick the best fit.
- **Existing agent fits** → use it as `subagent_type`
- **No existing agent fits** → use `general-purpose`

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

Output the complete plan in this format, then ask user for approval:

```
## Task Breakdown

1. **{task-name}**: {description} → Done when: {condition}
2. ...

## Dependency DAG

{ASCII diagram}

## Coordination Mode

mode: agent-spawn | team
rationale: {one-line reason}

## Agent Mapping

| # | Task | Agent (subagent_type) | Model | Rationale |
|---|------|-----------------------|-------|-----------|
| 1 | ... | worker | sonnet | ... |

## Execution Plan

### Round 1 (Parallel)
- Agent A: {task} — no dependencies
- Agent B: {task} — no dependencies

### Round 2 (After Round 1)
- Agent C: {task} — needs results from A

## Estimated Parallelism

- Total tasks: N
- Sequential depth: M rounds
- Max parallel width: K agents
```

After presenting, ask user: "이 계획대로 진행할까요? 수정할 부분이 있으면 말씀해주세요."

## Constraints

- Do NOT execute tasks — only plan them
- Do NOT create teams or spawn agents — only propose the structure
- Do NOT modify any files (read-only planning)
- If a task is ambiguous, flag it and suggest clarification
