# Web Verification Recipe

Use this recipe when `subject: web` — verifying browser/UI behavior in a sandbox environment.

## Step 1: Detect Available Browser Tool

Run the following check to determine which tool is available:

```bash
which chromux 2>/dev/null && echo "TOOL=chromux" || which playwright 2>/dev/null && echo "TOOL=playwright" || echo "TOOL=none"
```

- If `chromux` is found: use chromux commands below
- If `playwright` is found but not chromux: use playwright CLI commands below
- If neither is found: FAIL with reason "No browser automation tool available"

## Step 2: Launch Browser and Navigate

**Using chromux:**
```bash
chromux open "<TARGET_URL>"
```

**Using playwright (via npx):**
```bash
npx playwright open "<TARGET_URL>" --browser chromium
```

Replace `<TARGET_URL>` with the URL from the scenario's `then` clause or the task's `verify.run` field.

If the target app must be started first, check Step 2a.

## Step 2a: Start Local App If Required

If the scenario targets `localhost`, verify the app is running first:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>/ 2>&1
```

- If response is `000` (connection refused): the app is not running. FAIL with reason "App not reachable at localhost:<PORT>. Start the server before verifying."
- If response is `200` or `30x`: proceed.

## Step 3: Interact With the UI

For each interaction described in the scenario's `when` clause, execute the corresponding action:

**Click an element:**
```bash
chromux click "<CSS_SELECTOR>"
# or
npx playwright eval "document.querySelector('<CSS_SELECTOR>').click()"
```

**Fill a form field:**
```bash
chromux fill "<CSS_SELECTOR>" "<VALUE>"
```

**Submit a form:**
```bash
chromux click "<SUBMIT_BUTTON_SELECTOR>"
```

**Navigate to a path:**
```bash
chromux open "<BASE_URL>/<PATH>"
```

Derive selectors from the scenario description. Use semantic selectors in this priority order:
1. `[data-testid="..."]`
2. `[aria-label="..."]`
3. `button:has-text("...")` / `a:has-text("...")`
4. CSS class or tag fallback

## Step 4: Take a Screenshot

```bash
chromux screenshot --output /tmp/verify-web-screenshot.png
```

Review the screenshot output for visual confirmation.

## Step 5: Assert the Expected State

For each assertion in the scenario's `then` clause:

**Assert element exists on page:**
```bash
chromux eval "document.querySelector('<SELECTOR>') !== null" | grep -i "true"
```
Exit code 0 = element found. Non-zero or "false" = FAIL.

**Assert element text content:**
```bash
chromux eval "document.querySelector('<SELECTOR>').textContent.trim()" | grep -F "<EXPECTED_TEXT>"
```
Exit code 0 = text matches. Non-zero = FAIL.

**Assert URL after navigation:**
```bash
chromux eval "window.location.href" | grep -F "<EXPECTED_URL_FRAGMENT>"
```

**Assert element is visible (not hidden):**
```bash
chromux eval "getComputedStyle(document.querySelector('<SELECTOR>')).display !== 'none'"
```

## Step 6: Record Result

- If all assertions pass: status = PASS
- If any assertion fails: status = FAIL. Include which assertion failed, the actual value observed, and the screenshot path.

## Failure Template

```
FAIL: <assertion description>
Actual: <what was observed>
Expected: <what was required>
Screenshot: /tmp/verify-web-screenshot.png
```
