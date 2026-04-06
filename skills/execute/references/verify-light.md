# Verify Light — Tier 0: Mechanical Gate

Minimal verification. No agent needed — caller executes directly.
Runs build/lint/test and spec consistency checks. Zero LLM cost.

**Consumers**: `/execute` (DIRECT mode default), or any skill needing quick sanity check.

---

## Tier 0: Mechanical Checks

The caller (orchestrator) executes these checks directly. No Agent dispatch needed.

### Step 1: Detect project toolchain

```
Detect by marker file (first match wins):
  uv.lock          → python-uv
  Cargo.toml       → rust
  go.mod           → go
  bun.lock         → node-bun
  pnpm-lock.yaml   → node-pnpm
  yarn.lock        → node-yarn
  package-lock.json→ node-npm
  pyproject.toml   → python
  Makefile         → make
```

### Step 2: Run checks (all must exit 0)

**CWD rule**: If a build/lint/test command requires `cd` into a subdirectory,
wrap in a subshell to prevent CWD drift: `Bash("(cd subdir && command)")`.
Never use bare `cd subdir && command` — it shifts CWD for all subsequent steps.

```
checks = []

# 2a. Build
IF build_command detected:
  # If command needs cd: use subshell → Bash("(cd {dir} && {build_command})")
  result = Bash("{build_command}")
  checks.append({"name": "build", "status": "PASS" if exit==0 else "FAIL", "detail": stderr})

# 2b. Lint
IF lint_command detected:
  result = Bash("{lint_command}")
  checks.append({"name": "lint", "status": "PASS" if exit==0 else "FAIL", "detail": stderr})

# 2c. Typecheck
IF typecheck_command detected:
  result = Bash("{typecheck_command}")
  checks.append({"name": "typecheck", "status": "PASS" if exit==0 else "FAIL", "detail": stderr})

# 2d. Test suite
IF test_command detected:
  result = Bash("{test_command}")
  IF exit == 0:
    checks.append({"name": "test", "status": "PASS", "detail": "..."})
  ELIF "no tests" or "no test specified" in output:
    checks.append({"name": "test", "status": "PASS", "detail": "WARNING: no tests found"})
  ELSE:
    checks.append({"name": "test", "status": "FAIL", "detail": stderr})
```

### Step 3: Spec consistency

```
result = Bash("hoyeon-cli spec check {spec_path}")
checks.append({"name": "spec_check", "status": "PASS" if exit==0 else "FAIL", "detail": stderr})
```

### Step 4: Sub-requirement status (required)

This step MUST run — it provides the sub_requirement_status counts in the output.

```
result = Bash("hoyeon-cli spec requirement --status --json {spec_path}")
# Report counts only — no auto-fix in light mode
```

## Gate Rule

```
IF ANY check has status == "FAIL":
  status = "FAILED"
  # Light mode does NOT auto-fix. Report and let user decide.
ELSE:
  status = "VERIFIED"
```

## Output Format

```json
{
  "status": "VERIFIED" | "FAILED",
  "tier": 0,
  "checks": [
    {"name": "build", "status": "PASS", "detail": "..."},
    {"name": "lint", "status": "PASS", "detail": "..."},
    {"name": "typecheck", "status": "PASS", "detail": "..."},
    {"name": "test", "status": "PASS", "detail": "WARNING: no tests found"},
    {"name": "spec_check", "status": "PASS", "detail": "..."}
  ],
  "sub_requirement_status": {
    "pass": 0, "fail": 0, "pending": 0
  }
}
```
