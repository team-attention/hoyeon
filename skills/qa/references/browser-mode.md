# Browser Mode (chromux/CDP)

Use this mode for web applications. Chromux gives DOM-level access via CDP protocol — faster and more precise than pixel-based interaction.

## Setup

Resolve chromux path (run once, remember the output literally):

```bash
CX=$(command -v chromux 2>/dev/null || echo "") && [ -n "$CX" ] && echo "CHROMUX=$CX" || (npx @team-attention/chromux help >/dev/null 2>&1 && echo "CHROMUX=npx @team-attention/chromux" || echo "MISSING")
```

If `MISSING`, fall back to computer mode or report error.

Launch Chrome in headless mode:

```bash
/path/to/chromux launch headless 2>/dev/null || true
```

Generate session ID:

```bash
openssl rand -hex 2
```

Session ID format: `qa-XXXX`. **Inline chromux path and session ID literally in every command** — shell variables do NOT persist across Bash calls.

## Interaction Patterns

### Navigate
```bash
/path/to/chromux open qa-XXXX <url>
```

### Get Element References (for clicking)
```bash
/path/to/chromux snapshot qa-XXXX
```
Returns accessibility tree with `@ref` numbers. Always snapshot before acting.

### Click, Fill, Type
```bash
/path/to/chromux click qa-XXXX @<N>
/path/to/chromux fill qa-XXXX @<N> "text"
/path/to/chromux type qa-XXXX "Enter"
```

### Screenshot (evidence)
```bash
/path/to/chromux screenshot qa-XXXX .qa-reports/screenshots/name.png
```
After every screenshot, use Read on the file so the user can see it inline.

### JavaScript Evaluation
```bash
/path/to/chromux eval qa-XXXX "document.title"
/path/to/chromux eval qa-XXXX "JSON.stringify(performance.getEntriesByType('navigation')[0])"
```

### Console Errors
```bash
/path/to/chromux eval qa-XXXX "JSON.stringify(window.__consoleErrors || [])"
```

### Scroll
```bash
/path/to/chromux scroll qa-XXXX down
/path/to/chromux scroll qa-XXXX up
```

### Close
```bash
/path/to/chromux close qa-XXXX
```

## Core Rules

1. **Snapshot for action, screenshot for evidence** — `snapshot` gives @ref numbers, `screenshot` saves visual proof
2. **Always snapshot before acting** — get @ref numbers first
3. **Re-snapshot after every action** — @ref numbers go stale after page changes
4. **Click by @ref only** — never use CSS selectors or eval DOM queries
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
