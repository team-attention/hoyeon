# CLI Verification Recipe

Use this recipe when `subject: cli` — verifying command-line tool behavior in a sandbox environment.

## Step 1: Locate the CLI Binary

Determine the command to invoke from the scenario description. Check in this order:

```bash
# Check if the command is in PATH
which <COMMAND_NAME> 2>/dev/null

# Check for local binary
ls ./bin/<COMMAND_NAME> 2>/dev/null

# Check for npx-runnable package
ls package.json 2>/dev/null && cat package.json | grep '"bin"'

# Check for script entry point
ls <COMMAND_NAME>.sh <COMMAND_NAME>.py <COMMAND_NAME> 2>/dev/null
```

Set `CLI_CMD` to the resolved path or command name before proceeding.

If the binary is not found: FAIL with reason "CLI binary `<COMMAND_NAME>` not found. Build or install it before verifying."

## Step 2: Build If Required

If the binary is absent and a build step is known:

```bash
# For npm-based CLIs
npm run build 2>&1
ls dist/ bin/ 2>/dev/null

# For Go CLIs
go build -o <COMMAND_NAME> . 2>&1

# For compiled artifacts in general
make build 2>&1
```

After building, re-check Step 1.

## Step 3: Run the Command With Test Arguments

Derive the exact command invocation from the scenario's `when` clause.

**Happy path invocation:**
```bash
<CLI_CMD> <ARGS> > /tmp/cli-verify-stdout.txt 2>/tmp/cli-verify-stderr.txt
CLI_EXIT=$?
echo "Exit code: $CLI_EXIT"
cat /tmp/cli-verify-stdout.txt
cat /tmp/cli-verify-stderr.txt
```

**With environment variables:**
```bash
ENV_VAR=<VALUE> <CLI_CMD> <ARGS> > /tmp/cli-verify-stdout.txt 2>/tmp/cli-verify-stderr.txt
CLI_EXIT=$?
```

**With stdin input:**
```bash
echo "<INPUT>" | <CLI_CMD> <ARGS> > /tmp/cli-verify-stdout.txt 2>/tmp/cli-verify-stderr.txt
CLI_EXIT=$?
```

## Step 4: Assert Exit Code

```bash
echo "Exit code was: $CLI_EXIT"
```

Compare `$CLI_EXIT` against the expected exit code from the scenario's `then` clause:
- Expected `0`: any non-zero exit is FAIL
- Expected non-zero (e.g., `1`): zero exit or wrong non-zero value is FAIL

## Step 5: Assert Stdout Content

**Assert stdout contains expected text:**
```bash
grep -F "<EXPECTED_TEXT>" /tmp/cli-verify-stdout.txt
```
Exit code 0 = found. Non-zero = FAIL.

**Assert stdout matches a pattern:**
```bash
grep -E "<REGEX_PATTERN>" /tmp/cli-verify-stdout.txt
```

**Assert stdout does NOT contain forbidden text:**
```bash
grep -F "<FORBIDDEN_TEXT>" /tmp/cli-verify-stdout.txt
# This should return non-zero (not found). If exit 0: FAIL.
```

**Assert stdout is exactly equal to expected:**
```bash
EXPECTED="<EXPECTED_OUTPUT>"
ACTUAL=$(cat /tmp/cli-verify-stdout.txt)
[ "$ACTUAL" = "$EXPECTED" ] && echo "PASS" || echo "FAIL: got '$ACTUAL'"
```

## Step 6: Assert Stderr Content

**Assert stderr is empty (no errors):**
```bash
[ -s /tmp/cli-verify-stderr.txt ] && echo "FAIL: stderr not empty" && cat /tmp/cli-verify-stderr.txt || echo "PASS: stderr empty"
```

**Assert stderr contains expected error message:**
```bash
grep -F "<EXPECTED_ERROR>" /tmp/cli-verify-stderr.txt
```
Exit code 0 = found. Non-zero = FAIL.

## Step 7: Test Error Cases

If the scenario requires verifying error handling, run the command with invalid arguments:

```bash
<CLI_CMD> <INVALID_ARGS> > /tmp/cli-verify-err-stdout.txt 2>/tmp/cli-verify-err-stderr.txt
CLI_ERROR_EXIT=$?
echo "Error-case exit code: $CLI_ERROR_EXIT"
cat /tmp/cli-verify-err-stdout.txt
cat /tmp/cli-verify-err-stderr.txt
```

Assert that:
- Exit code is non-zero (failure is signaled)
- Stderr or stdout contains a human-readable error message (not a stack trace)

```bash
[ $CLI_ERROR_EXIT -ne 0 ] && echo "PASS: non-zero exit" || echo "FAIL: expected non-zero exit"
grep -iE "(error|invalid|not found|failed)" /tmp/cli-verify-err-stderr.txt /tmp/cli-verify-err-stdout.txt
```

## Step 8: Assert File System Side Effects (If Required)

If the command is expected to create, modify, or delete files:

**Assert file was created:**
```bash
[ -f "<EXPECTED_FILE_PATH>" ] && echo "PASS: file exists" || echo "FAIL: file not created"
```

**Assert file content:**
```bash
grep -F "<EXPECTED_CONTENT>" "<EXPECTED_FILE_PATH>"
```

**Assert file was deleted:**
```bash
[ ! -f "<FILE_PATH>" ] && echo "PASS: file removed" || echo "FAIL: file still exists"
```

## Step 9: Record Result

- If all assertions pass: status = PASS
- If any assertion fails: status = FAIL. Include the command run, exit code, stdout/stderr content, and which assertion failed.

## Failure Template

```
FAIL: <assertion description>
Command: <CLI_CMD> <ARGS>
Exit code: <actual_exit_code> (expected: <expected_exit_code>)
Stdout: <relevant lines from /tmp/cli-verify-stdout.txt>
Stderr: <relevant lines from /tmp/cli-verify-stderr.txt>
```
