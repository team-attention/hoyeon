# Server Verification Recipe

Use this recipe when `subject: server` — verifying API/HTTP server behavior in a sandbox environment.

## Step 1: Detect How to Start the Server

Check for a startup command in the following priority order:

```bash
# Check for package.json start script
cat package.json 2>/dev/null | grep '"start"'

# Check for Makefile
ls Makefile 2>/dev/null && grep -E "^(start|run|serve):" Makefile

# Check for common entry points
ls index.js server.js app.js main.py app.py main.go 2>/dev/null
```

Determine the startup command from the above output:
- `package.json` has `"start"`: use `npm start`
- `Makefile` has `start:` target: use `make start`
- Python file found: use `python <file>` or `uvicorn <module>:app`
- Go file found: use `go run .`
- Otherwise: use whatever `verify.run` specifies in the scenario

## Step 2: Check If Server Is Already Running

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>/ 2>&1
```

- If `200`, `301`, `302`, `404`, or any valid HTTP code: server is already running. Skip to Step 4.
- If `000` (connection refused): server is not running. Proceed to Step 3.

Replace `<PORT>` with the port from the scenario description or the default for the tech stack (3000, 8000, 8080, 5000 are common).

## Step 3: Start the Server

```bash
<STARTUP_COMMAND> &
SERVER_PID=$!
echo "Started server PID=$SERVER_PID"
sleep 3
```

Verify it started:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>/ 2>&1
```

If still `000` after 3 seconds: FAIL with reason "Server failed to start. Command: `<STARTUP_COMMAND>`"

## Step 4: Send the Verification Request

Use `curl` for all HTTP assertions. Format:

```bash
curl -s -w "\n---HTTP_STATUS:%{http_code}---\n" \
  -X <METHOD> \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '<REQUEST_BODY_JSON>' \
  "http://localhost:<PORT><PATH>"
```

Derive `<METHOD>`, `<PATH>`, and `<REQUEST_BODY_JSON>` from the scenario's `when` clause.

**GET request (no body):**
```bash
curl -s -w "\n---HTTP_STATUS:%{http_code}---\n" \
  "http://localhost:<PORT><PATH>"
```

**POST with JSON body:**
```bash
curl -s -w "\n---HTTP_STATUS:%{http_code}---\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}' \
  "http://localhost:<PORT><PATH>"
```

**With Authorization header:**
```bash
curl -s -w "\n---HTTP_STATUS:%{http_code}---\n" \
  -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:<PORT><PATH>"
```

Save full output to a variable:
```bash
RESPONSE=$(curl -s -w "\n---HTTP_STATUS:%{http_code}---\n" ...)
echo "$RESPONSE"
```

## Step 5: Assert Response Status

Extract status code:
```bash
echo "$RESPONSE" | grep "---HTTP_STATUS:" | sed 's/---HTTP_STATUS:\([0-9]*\)---/\1/'
```

Compare against expected status from the scenario's `then` clause. If mismatch: FAIL.

## Step 6: Assert Response Body

**Assert JSON field value:**
```bash
echo "$RESPONSE" | grep -v "---HTTP_STATUS" | python3 -c "
import json, sys
body = json.load(sys.stdin)
assert body['<FIELD>'] == '<EXPECTED_VALUE>', f\"Expected '<EXPECTED_VALUE>', got {body['<FIELD>']!r}\"
print('PASS')
"
```

If `python3` is not available, use `jq`:
```bash
echo "$RESPONSE" | grep -v "---HTTP_STATUS" | jq -e '.<FIELD> == "<EXPECTED_VALUE>"'
```

Exit code 0 = assertion passes. Non-zero = FAIL.

**Assert JSON field exists:**
```bash
echo "$RESPONSE" | grep -v "---HTTP_STATUS" | jq 'has("<FIELD>")'
```

**Assert response contains substring:**
```bash
echo "$RESPONSE" | grep -F "<EXPECTED_SUBSTRING>"
```
Exit code 0 = found. Non-zero = FAIL.

## Step 7: Assert Response Headers (If Required)

```bash
curl -s -I "http://localhost:<PORT><PATH>" | grep -i "<HEADER_NAME>: <EXPECTED_VALUE>"
```

Exit code 0 = header present with expected value. Non-zero = FAIL.

## Step 8: Stop Server (If Started in Step 3)

```bash
kill $SERVER_PID 2>/dev/null || true
```

## Step 9: Record Result

- If all assertions pass: status = PASS
- If any assertion fails: status = FAIL. Include which assertion failed, actual response, and expected value.

## Failure Template

```
FAIL: <assertion description>
Endpoint: <METHOD> <PATH>
Actual status: <actual_http_code>
Expected status: <expected_http_code>
Actual body: <response_body_snippet>
Expected: <expected_value>
```
