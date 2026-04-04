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

## Step 2b: Page Health Check

After the page loads, run these diagnostics before any interaction:

```bash
# Check for broken images (images that failed to load)
chromux eval "[...document.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src)"

# Check page is not blank
chromux eval "document.body.innerText.trim().length"
```

- If broken images are found: record as WARNING
- If page body is empty (length 0): FAIL with reason "Page loaded but body is empty"

## Step 3: Interactability Pre-check

Before interacting with UI elements from the scenario's `when` clause, verify each target element is actually reachable:

```bash
chromux eval "(() => { const el = document.querySelector('<SELECTOR>'); if (!el) return 'NOT_FOUND'; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return 'HIDDEN_BY_CSS'; if (r.width === 0 || r.height === 0) return 'ZERO_SIZE'; if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return 'OFFSCREEN'; return 'CLICKABLE' })()"
```

| Result | Action |
|--------|--------|
| `CLICKABLE` | Proceed with interaction |
| `NOT_FOUND` | FAIL — element does not exist in DOM |
| `HIDDEN_BY_CSS` | FAIL — element exists but hidden (display:none, visibility:hidden, or opacity:0) |
| `ZERO_SIZE` | FAIL — element has no dimensions (likely collapsed or improperly styled) |
| `OFFSCREEN` | WARNING — element exists but outside viewport. Try scrolling to it first |

If `OFFSCREEN`, attempt to scroll the element into view before failing:
```bash
chromux eval "document.querySelector('<SELECTOR>').scrollIntoView({ block: 'center' })"
```
Then re-run the interactability check.

## Step 4: Interact With the UI

For each interaction described in the scenario's `when` clause, execute the corresponding action:

**Click an element:**
```bash
chromux click "<CSS_SELECTOR>"
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

## Step 5: Take a Screenshot

```bash
chromux screenshot --output /tmp/verify-web-screenshot.png
```

Review the screenshot output for visual confirmation.

## Step 5a: Visual UX Review

After taking the screenshot, visually review it for UX issues. Check each category:

1. **Layout integrity**: Are elements overlapping? Is content cut off or overflowing?
2. **Interactive element visibility**: Are buttons/links clearly visible, labeled, and distinguishable from background?
3. **Empty states**: Are there blank areas where content should be? Missing placeholder text?
4. **Error indicators**: Are there unexpected error messages, broken image placeholders, or loading spinners stuck?
5. **Typography/readability**: Is text readable (not too small, not clipped, sufficient contrast)?
6. **Responsive layout**: Does the layout look reasonable for the viewport size?

Record each issue found as a WARNING with impact level:

```
WARNING: [UX issue description]
Screenshot: /tmp/verify-web-screenshot.png
Impact: blocking | degraded | cosmetic
```

| Impact | Meaning |
|--------|---------|
| `blocking` | User cannot complete the scenario action (e.g., button invisible, form unreachable) |
| `degraded` | User can complete the action but experience is poor (e.g., overlapping text, broken layout) |
| `cosmetic` | Minor visual issue that doesn't affect functionality (e.g., alignment, spacing) |

`blocking` UX warnings should cause scenario FAIL. `degraded` and `cosmetic` are reported but do not fail the scenario.

## Step 6: Assert the Expected State

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

## Step 7: Record Result

- If all assertions pass and no `blocking` UX warnings: status = PASS
- If any assertion fails or a `blocking` UX warning exists: status = FAIL
- Include all UX warnings (degraded/cosmetic) in the evidence field regardless of pass/fail

## Failure Template

```
FAIL: <assertion description>
Actual: <what was observed>
Expected: <what was required>
Screenshot: /tmp/verify-web-screenshot.png
UX Warnings: <list of warnings if any>
```
