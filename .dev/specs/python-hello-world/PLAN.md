# Plan: Python Hello World Script

> Create a simple Python hello world script at the project root.

## Context

### Original Request
User requested a simple Python "Hello, World!" script.

### Interview Summary
**Key Discussions**:
- Scope: Single-file Python script, no complexity
- Location: Project root (`hello.py`)

**Research Findings**:
- No existing Python files in the project
- Project is a Claude Code plugin project (no Python infrastructure)

## Work Objectives

### Core Objective
Create a single `hello.py` file that prints "Hello, World!" when executed.

### Concrete Deliverables
- `hello.py` - Python hello world script at project root

### Definition of Done
- [ ] `python3 hello.py` prints "Hello, World!"
- [ ] Script runs without errors

### Must NOT Do (Guardrails)
- Do not add external dependencies
- Do not create complex project structure (no packages, no tests, no config)
- Do not modify any existing project files
- Do not use Python 2 syntax

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
| - | - | Sequential only (single work TODO) |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat: add python hello world script` | `hello.py` | always |

> **Note**: No commit after Final (Verification is read-only).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `code_error` | Syntax error, runtime error | `/SyntaxError\|NameError/i` |
| `env_error` | Python not installed | `/command not found\|No such file/i` |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → Fix or halt |
| verification fails | Analyze immediately → Fix Task or halt |

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Not needed |
| Package Install | Denied |
| File Access | Repository only |
| Max Execution Time | 1 minute per TODO |
| Git Operations | Denied (Orchestrator handles) |

## TODOs

### [ ] TODO 1: Create hello.py script

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `script_path` (file): `./hello.py` - Python hello world script

**Steps**:
- [ ] Create `hello.py` at project root
- [ ] Add `print("Hello, World!")` as the script content

**Must NOT do**:
- Do not add unnecessary imports or boilerplate
- Do not create additional files
- Do not run git commands

**References**:
- (none - standalone script)

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `./hello.py`
- [ ] `python3 hello.py` outputs "Hello, World!"

*Static:*
- [ ] `python3 -c "import ast; ast.parse(open('hello.py').read())"` → exit 0 (valid Python syntax)

*Runtime:*
- [ ] `python3 hello.py` → exit 0

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `python3`

**Inputs**:
- `script_path` (file): `${todo-1.outputs.script_path}` - The hello world script

**Outputs**: (none)

**Steps**:
- [ ] Verify script file exists
- [ ] Run script and check output
- [ ] Verify no syntax errors

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `./hello.py`
- [ ] `python3 hello.py` outputs exactly "Hello, World!"

*Static:*
- [ ] `python3 -c "import ast; ast.parse(open('hello.py').read())"` → exit 0

*Runtime:*
- [ ] `python3 hello.py` → exit 0
