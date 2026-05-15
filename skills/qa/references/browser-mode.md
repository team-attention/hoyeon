# Browser Mode (chromux/CDP)

Use this mode for web applications. Chromux gives DOM-level access via CDP —
faster and more precise than pixel-based interaction. The full chromux command
surface lives in the canonical `chromux` skill (run `chromux help` for current
syntax). **This file only documents QA-specific decisions on top.**

## Setup

Resolve chromux path (run once, remember the output literally):

```bash
CX=$(command -v chromux 2>/dev/null || echo "") && [ -n "$CX" ] && echo "CHROMUX=$CX" || (npx @team-attention/chromux help >/dev/null 2>&1 && echo "CHROMUX=npx @team-attention/chromux" || echo "MISSING")
```

If `MISSING`, fall back to computer mode or report error.

Launch Chrome **headless** (bare `chromux launch` is headed by default — always
pass `--headless` for QA work unless the user explicitly wants to watch):

```bash
/path/to/chromux launch default --headless 2>/dev/null || true
```

To watch live without restarting, use `chromux show qa-XXXX` (opens DevTools in
the user's browser).

Generate session ID:

```bash
openssl rand -hex 2
```

Session ID format: `qa-XXXX`. **Inline chromux path and session ID literally in every command** — shell variables do NOT persist across Bash calls.

## Interaction Patterns (QA-specific)

For commands and exact syntax, see the canonical `chromux` skill. Below are the
patterns QA leans on:

### Navigate + read structure
```bash
/path/to/chromux open qa-XXXX <url>
/path/to/chromux snapshot qa-XXXX        # Always snapshot before acting
```

### Click / fill / type by @ref
```bash
/path/to/chromux click qa-XXXX @<N>
/path/to/chromux fill qa-XXXX @<N> "text"
/path/to/chromux type qa-XXXX "Enter"
```

### Screenshot (QA evidence — save under `.qa-reports/`)
```bash
/path/to/chromux screenshot qa-XXXX .qa-reports/screenshots/name.png
```
After every screenshot, use `Read` on the file so the user can see it inline.

### JavaScript / CDP evaluation

Prefer `run` (multi-step async with `cdp`/`js`/`sleep`/`waitLoad` helpers) or a
single `cdp` call. Legacy `eval` still works but is hidden:

```bash
/path/to/chromux run qa-XXXX - <<'JS'
return await js('document.title');
JS

/path/to/chromux cdp qa-XXXX Runtime.evaluate '{"expression":"location.href","returnByValue":true}'
```

See `browser-verify.md` for the canonical patterns QA uses for computed-style
visibility and overlay-stacking checks.

### Console & Network Diagnostics (on-demand)
```bash
/path/to/chromux watch qa-XXXX console              # Enable + read console logs
/path/to/chromux watch qa-XXXX network              # Failed requests only (4xx/5xx)
/path/to/chromux watch qa-XXXX network --all        # All requests with status + duration
```

First call enables capture; subsequent calls return new entries. Disable when
done: `watch qa-XXXX console --off` / `watch qa-XXXX network --off`.

### Close
```bash
/path/to/chromux close qa-XXXX
```

## Core Rules

1. **Snapshot for action, screenshot for evidence** — `snapshot` gives @ref
   numbers, `screenshot` saves visual proof
2. **Always snapshot before acting** — get @ref numbers first
3. **Re-snapshot after every action** — @ref numbers go stale after page
   changes
4. **Click by @ref only** — never use CSS selectors or `run`/`js`/`eval` DOM
   queries to *find* elements
5. **Inline everything** — shell vars don't persist across Bash calls

## Diff-Aware Mode (feature branch, no URL)

1. Analyze branch diff: `git diff main...HEAD --name-only`
2. Identify affected pages/routes from changed files
3. Detect running app on common ports (3000, 4000, 8080)
4. Test each affected page with screenshot evidence
5. Report findings scoped to branch changes

## Framework Detection

- `__next` in HTML or `_next/data` -> Next.js
- `csrf-token` meta tag -> Rails
- `wp-content` in URLs -> WordPress
- Client-side routing -> SPA
