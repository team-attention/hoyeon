# Browser Verification Heuristics

Run these checks **in addition to** the sub-req's GWT assertions when verifying a
web app. `browser-mode.md` tells you HOW to drive chromux; this file tells you
WHAT to be suspicious of.

The sub-req's Given/When/Then only covers the positive path that the author
thought to write down. These heuristics catch the failure modes the author
forgot — CSS overrides, overlay stacking, drift between spec and DOM.

---

## 1. Visibility is not the same as the `hidden` attribute

An element with `hidden="true"` (or the boolean `hidden` attribute) is STILL
visible if CSS overrides its display rule. Common offenders:

- `.overlay { display: flex; }` applied to an element that has `hidden`
- `.modal { display: block; }` on a `<dialog hidden>`
- Any `display: <non-none>` rule that wins specificity over the `[hidden]` UA default

### Check (run for every "hidden" assertion)

For each element the GWT says should be hidden:

```bash
/path/to/chromux eval qa-XXXX "(() => {
  const el = document.querySelector('#start-overlay');
  if (!el) return 'MISSING';
  const s = getComputedStyle(el);
  return JSON.stringify({
    hidden_attr: el.hasAttribute('hidden'),
    display:     s.display,
    visibility:  s.visibility,
    opacity:     s.opacity,
    effective_visible: s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0
  });
})()"
```

Rule: **`effective_visible` is the source of truth**, not `hidden_attr`.

If `hidden_attr == true` but `effective_visible == true` → FAIL with reason
`"CSS overrides [hidden] — display is <value>, not 'none'"`. This is almost
always a CSS specificity bug.

---

## 2. Multiple overlays/modals must not stack

If a spec has N mutually-exclusive states (e.g. `start | playing | paused | gameover`)
and each has its own overlay element, only ONE should be `effective_visible` at
any state.

### Check (run on every state transition the GWT tests)

```bash
/path/to/chromux eval qa-XXXX "(() => {
  const overlays = Array.from(document.querySelectorAll('.overlay, [role=\"dialog\"], .modal'));
  return JSON.stringify(overlays.map(el => {
    const s = getComputedStyle(el);
    const visible = s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
    return { id: el.id || el.className, visible };
  }));
})()"
```

Rule: `overlays.filter(o => o.visible).length <= 1`. If >1 → FAIL with reason
`"N overlays visible simultaneously: <ids>"`. Flag even if the current state's
overlay shows the right text — stacked overlays are a bug regardless.

---

## 3. Canvas text vs DOM text duplication

Games and canvas-heavy apps often draw state text (e.g. "Game Over") on the
canvas AND have a corresponding DOM overlay. If both render at once, the user
sees double.

### Check

- Collect DOM text: `document.body.innerText` (strip whitespace-only lines)
- Intercept canvas `fillText` / `strokeText` for one frame (patch before the
  action, restore after) and collect drawn strings
- If a state label (e.g. "Paused", "Game Over") appears in BOTH sets
  simultaneously → FAIL with reason `"state label '<text>' rendered on both
  canvas and DOM — user sees duplicate"`

This is NOT about text appearing in different states over time. It's about the
SAME frame containing both.

---

## 4. Screenshot mismatch is evidence, not artifact

If a screenshot shows two or more state labels at once
(e.g. `"Game Over"` and `"Paused"` both visible) — **this is a bug signal**.

Do not dismiss with "headless rendering artifact", "DPR=2 compositing issue",
or similar. Those explanations are almost always wrong. Chromium's headless
mode renders the same DOM the user sees.

### Protocol when screenshot looks wrong

1. Re-run the visibility checks above (§1 and §2)
2. If computed-style data contradicts the screenshot → note as tool issue, try a
   fresh session
3. If computed-style data AGREES with the screenshot → FAIL, do not rationalize

Never use "the screenshot looked weird but the state is really correct" as a
pass reason.

---

## 5. Z-index / stacking context

If overlays render on top of canvas/content and the GWT expects "canvas shows
X when state is Y", make sure the canvas assertion samples pixels that are NOT
covered by any visible overlay. An overlay with
`background: rgba(0,0,0,0.85)` will swallow canvas pixels underneath.

Use §2's visibility scan to find covering overlays before trusting any
`getImageData` result.

---

## 6. Focus-dependent behavior

Many apps auto-pause/resume on `blur`/`focus` (INV-11 style). Headless chromium
can be in an unexpected focus state.

### Check

```bash
/path/to/chromux eval qa-XXXX "({hasFocus: document.hasFocus(), visibilityState: document.visibilityState})"
```

For any assertion that depends on focus state (pause overlay, animation pause),
first confirm `document.hasFocus()` matches the GWT's Given.

---

## 7. Console errors during verification

Even when the GWT passes, console errors are red flags.

```bash
/path/to/chromux console qa-XXXX
```

If errors appeared DURING the verification actions (not pre-existing) → demote
verdict to PARTIAL with note `"sub_req appears correct but console error logged
during action: <error>"`. Let the orchestrator decide whether to escalate.

---

## Output adjustment

When any heuristic check above fires, the verdict line in the report must
include which heuristic triggered:

```
verdict: FAIL
reason: "H1 hidden-override: #start-overlay has hidden=true but computed display=flex"
```

This lets future readers (and the orchestrator) know it was NOT a GWT-direct
failure but a peripheral check, so fixes target the right layer (CSS vs logic).
