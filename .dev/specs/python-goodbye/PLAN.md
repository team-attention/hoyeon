# Plan: Python Goodbye Script

> Create a simple Python script that prints "Good bye!" at the project root.

**Schema Version**: 1.1

---

## Context

### Original Request
Create a simple Python script that says goodbye.

### Interview Summary
**Key Discussions**:
- Message content: Simple "Good bye!" (default)
- Script location: Project root (`goodbye.py`)
- No external dependencies or complex logic

**Research Findings**:
- No existing Python files in the project (this is the first)
- `.dev/specs/python-hello-world/PLAN.md` - Similar simple script spec exists as separate feature
- Project is primarily Node.js/npm based (web/ directory)
- Verification: `python3 goodbye.py`

---

## Work Objectives

### Core Objective
Create a standalone Python script `goodbye.py` at the project root that prints "Good bye!" when executed.

### Concrete Deliverables
- `goodbye.py` - Python script that prints "Good bye!"

### Definition of Done
- [ ] `python3 goodbye.py` outputs "Good bye!"
- [ ] No errors on execution

### Must NOT Do (Guardrails)
- Do not add external dependencies or imports
- Do not add argparse, shebang, or other extras beyond a simple print
- Do not modify any existing files
- Do not create additional files (tests, configs, etc.)

---

## Task Flow

```
TODO-1 → TODO-Final
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `script_path` (file) | work |
| Final | `todo-1.script_path` | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Sequential (only 1 work TODO) |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(python-goodbye): add goodbye script` | `goodbye.py` | always |

> **Note**: No commit after Final (Verification is read-only).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `code_error` | Syntax error, runtime error | `/SyntaxError\|NameError\|IndentationError/i` |
| `env_error` | Python not installed | `/command not found\|No such file/i` |
| `unknown` | Unclassifiable errors | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → Fix or halt |
| verification fails | Analyze immediately (no retry) → Fix or halt |

### After Analyze

| Category | Action |
|----------|--------|
| `env_error` | Halt + log to `issues.md` |
| `code_error` | Create Fix Task (depth=1 limit) |
| `unknown` | Halt + log to `issues.md` |

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Not needed |
| Package Install | Denied |
| File Access | Repository only |
| Max Execution Time | 1 minute per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [ ] TODO 1: Create goodbye.py script

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `script_path` (file): `./goodbye.py` - Python goodbye script

**Steps**:
- [ ] Create `goodbye.py` at project root with `print("Good bye!")`

**Must NOT do**:
- Do not add imports, shebang, or argparse
- Do not create additional files
- Do not modify existing files
- Do not run git commands

**References**:
- No existing Python patterns (first Python file in project)

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `./goodbye.py`
- [ ] `python3 goodbye.py` outputs "Good bye!"

*Static:*
- [ ] `python3 -c "import ast; ast.parse(open('./goodbye.py').read())"` → exit 0 (valid syntax)

*Runtime:*
- [ ] `python3 goodbye.py` → exit 0 (no runtime errors)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `python3`

**Inputs**:
- `script_path` (file): `${todo-1.outputs.script_path}` - The goodbye script

**Outputs**: (none)

**Steps**:
- [ ] Verify script file exists
- [ ] Run script and check output
- [ ] Verify valid Python syntax

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `./goodbye.py`
- [ ] `python3 goodbye.py` outputs exactly "Good bye!"

*Static:*
- [ ] `python3 -c "import ast; ast.parse(open('./goodbye.py').read())"` → exit 0

*Runtime:*
- [ ] `python3 goodbye.py` → exit 0
