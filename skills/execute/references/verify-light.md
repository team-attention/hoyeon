# Verify Light — Build Check + Spec Consistency

Minimal verification for simple changes. No subagent needed — caller executes directly.

**Consumers**: `/execute` (DIRECT mode default), or any skill needing quick sanity check.

---

## Usage

The caller (orchestrator) executes these checks directly. No Agent dispatch needed.

## Checks

### 1. Build/Lint/Typecheck
Run project build commands:
- Detect from package.json scripts, Makefile, or project config
- Run: build, lint, typecheck (whatever exists)
- All must exit 0

### 2. Spec Consistency
Run: `hoyeon-cli spec check {spec_path}`
Must pass.

### 3. Sub-requirement Status
Run: `hoyeon-cli spec requirement --status --json {spec_path}`
Report: pass/fail/pending counts
Warning only (no auto-fix in light mode)

## Output Format

```json
{
  "status": "VERIFIED" | "FAILED",
  "checks": [
    {"name": "build", "status": "PASS" | "FAIL", "detail": "..."},
    {"name": "lint", "status": "PASS" | "FAIL", "detail": "..."},
    {"name": "typecheck", "status": "PASS" | "FAIL", "detail": "..."},
    {"name": "spec_check", "status": "PASS" | "FAIL", "detail": "..."}
  ],
  "sub_requirement_status": {
    "pass": 0, "fail": 0, "pending": 0
  }
}
```

## On Failure

Light mode does NOT auto-fix. Report failures and let user decide.
