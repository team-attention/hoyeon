# Verify Light — Tier 0: Mechanical Gate Only

Minimal verification. No agent dispatch, no sub-requirement FV, no journey verification.
Runs build / lint / typecheck / test only. Zero LLM cost.

**Consumers**: `/execute` (DIRECT mode default), `/check`, or any caller that wants a
fast sanity check without semantic analysis.

---

## Tier 0: Mechanical Checks

The caller (orchestrator) executes these directly. No Agent needed.

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

**CWD rule**: If a command needs `cd` into a subdirectory, wrap in a subshell:
`Bash("(cd subdir && command)")`. Never `cd subdir && command` — it drifts CWD
for subsequent steps.

```
checks = []

# 2a. Build
IF build_command detected:
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
  IF exit == 0:                                       → PASS
  ELIF "no tests"/"no test specified" in output:      → PASS (warning: no tests found)
  ELSE:                                                → FAIL
```

Light mode does **NOT** perform sub-requirement FV and does **NOT** verify journeys.
Use `verify-standard` for those.

## Gate Rule

```
IF ANY check has status == "FAIL":
  status = "FAILED"      # Light mode does NOT auto-fix. Report and let user decide.
ELSE:
  status = "VERIFIED"
```

## Output Format

```json
{
  "status": "VERIFIED" | "FAILED",
  "tier": 0,
  "checks": [
    {"name": "build",     "status": "PASS", "detail": "..."},
    {"name": "lint",      "status": "PASS", "detail": "..."},
    {"name": "typecheck", "status": "PASS", "detail": "..."},
    {"name": "test",      "status": "PASS", "detail": "WARNING: no tests found"}
  ]
}
```
