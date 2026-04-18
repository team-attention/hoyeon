# Spec vs Implementation Drift Check

**Platform-agnostic.** Run this ONCE at the end of every qa-verifier run,
regardless of method (browser/cli/desktop/shell).

GWT-based verification only catches bugs in features the spec describes. It
cannot catch:

- UI elements that exist in code but were never specced (e.g. a Restart button
  nobody asked for)
- CLI flags, API endpoints, config options added silently
- Missing features the spec requires but the code omits

This check surfaces both directions of drift.

---

## Step 1: Extract what the implementation actually exposes

Method-specific extraction — pick the one matching the project:

### Web app (browser mode)
After setup, collect observable surface from the running app:

```bash
/path/to/chromux eval qa-XXXX "(() => {
  const buttons = Array.from(document.querySelectorAll('button, [role=button]')).map(b => b.textContent.trim()).filter(Boolean);
  const links   = Array.from(document.querySelectorAll('a[href]')).map(a => ({text: a.textContent.trim(), href: a.getAttribute('href')})).filter(a => a.text);
  const inputs  = Array.from(document.querySelectorAll('input, select, textarea')).map(i => i.name || i.id || i.placeholder || i.type).filter(Boolean);
  const overlays = Array.from(document.querySelectorAll('.overlay, [role=dialog], .modal')).map(el => el.id || el.className);
  return JSON.stringify({buttons, links, inputs, overlays});
})()"
```

Iterate through each state the spec enumerates (start / playing / paused / gameover)
and union the collected surfaces — a button only visible in one state still counts.

### CLI
```bash
<binary> --help 2>&1
<binary> <subcommand> --help 2>&1   # for each documented subcommand
```
Extract flags and subcommands via regex.

### HTTP API
```bash
# If an OpenAPI/route manifest exists, read it directly.
# Otherwise, grep the source for route definitions:
grep -rE "(router\.(get|post|put|delete)|@(Get|Post|Put|Delete)|app\.(get|post))" src/
```

### Desktop app
Menu items, toolbar buttons, keyboard shortcuts listed in the app's help/about.
Use MCP computer-use screenshots of menus.

---

## Step 2: Extract what the spec describes

From `plan.json` (and optionally `requirements.md` for fuller context):

```bash
hoyeon-cli plan get <spec_dir> --path journeys --json
hoyeon-cli plan get <spec_dir> --path tasks --json
```

Collect every noun-phrase the spec mentions as a user-facing surface:

- From `journeys[].given/when/then` — buttons, keys, URLs, flags referenced
- From `tasks[].action` / `fulfills[]`
- From sub-requirements (R-X.Y IDs) in `requirements.md` if accessible
- From `contracts.md` interfaces (e.g. `InputAPI.ArrowLeft`, `RestartAPI`)

This is a fuzzy set — exact regex matching isn't the point. You're building a
lexicon of "what the spec expects to exist."

---

## Step 3: Diff both directions

### A. SPEC_DRIFT — in code, not in spec

For each surface in Step 1, ask: "is this mentioned anywhere in Step 2's
lexicon?" If no → candidate drift.

Report shape:
```
SPEC_DRIFT
  element: "Restart button (#restart-button)"
  location: "index.html:28"
  reason: "No sub-req, journey, or contract mentions a restart button"
  severity: caution | fail
```

Severity rule:
- `fail` if the element is **user-visible and operational** (button, menu,
  command) — means the feature was built without a spec
- `caution` if it's internal (hidden debug panel, feature-flagged) — worth
  flagging but not a FAIL

### B. MISSING — in spec, not in code

For each surface in Step 2, ask: "did Step 1 find it?" If not → MISSING.

Report shape:
```
MISSING
  element: "Level display in HUD (R-U3.2)"
  expected_by: "R-U3.2, contracts.md:RendererAPI.drawHUD"
  reason: "No DOM element or canvas text containing 'LEVEL' at state=playing"
  severity: fail
```

Severity rule:
- `fail` always — the spec required it, the code lacks it

---

## Step 4: Append to QA Verification Report

Add a new top-level section after the sub-req results table:

```markdown
### Spec Drift Check

| Direction | Element | Location / Expected-by | Severity |
|-----------|---------|------------------------|----------|
| SPEC_DRIFT | Restart button | index.html:28 | fail |
| MISSING   | Level display  | R-U3.2                | fail |

Summary: 1 unspecced feature, 1 missing requirement
```

The overall run status rules:
- Any `SPEC_DRIFT` with severity `fail` → run status at least PARTIAL
  (sub-reqs can still be VERIFIED, but the drift is surfaced)
- Any `MISSING` with severity `fail` → run status FAIL, because a required
  feature isn't implemented

---

## Rule: never auto-fix, only report

qa-verifier does not modify code. The orchestrator (execute's verify recipe)
decides whether to:
- Route MISSING items back through the fix loop (Phase 2.3)
- Route SPEC_DRIFT items to the user (humans decide: remove the extra feature,
  or add it to the spec)

Treat SPEC_DRIFT as "conversation material," not a bug to silently delete.

---

## Why this is worth running

Most specs don't enumerate "things that must NOT exist." Drift check is the
only signal you get when a well-meaning implementer adds a Restart button, a
`--debug` flag, or a `/admin` endpoint that the spec never approved. Without
this step, those changes sit silently until they break something else or
become a security issue.
