# Chromux Quick Reference (browser-work specific)

The full chromux command surface lives in the canonical `chromux` skill
(`~/team-attention/chromux/SKILL.md`, loaded into global agent context). Run
`chromux help` for current syntax. **Don't re-teach the command table here** —
this file only documents browser-work-specific decisions on top.

## Resolve & launch

```bash
CX=$(command -v chromux 2>/dev/null || echo "") && [ -n "$CX" ] && echo "CHROMUX=$CX" || (npx @team-attention/chromux help >/dev/null 2>&1 && echo "CHROMUX=npx @team-attention/chromux" || echo "MISSING")
```

For background recon, explicitly launch headless so no window pops up:

```bash
/path/to/chromux launch default --headless 2>/dev/null || true
```

> Note: bare `chromux launch` defaults to **headed** (visible Chrome). Use
> `--headless` (offscreen, no window) or `--hidden` (offscreen headed) when the
> user shouldn't see a window. Auto-launch via `chromux open` defaults to
> headless (override with `CHROMUX_LAUNCH_MODE`).

If the user wants to watch a live tab without restarting, use `show` to open
DevTools in their browser:

```bash
/path/to/chromux show exp-ab12
```

## Shell variable persistence

Each Bash tool call runs in a **fresh shell**. Variables do NOT persist across
calls.

- Resolve the chromux path ONCE, then **inline it literally** in every command
- Generate the session ID ONCE (e.g. `openssl rand -hex 2` → `exp-ab12`), then
  **inline it literally** in every command
- NEVER use `$CX` or `$S` across separate Bash calls

## Day-to-day surface (canonical aliases)

For action: `open`, `snapshot`, `click @<ref>`, `fill @<ref>`, `type`,
`screenshot`, `close`. For multi-step JS or precise CDP: prefer `run` (with
`cdp`/`js`/`sleep`/`waitLoad` helpers) and `cdp` over the legacy `eval`,
`scroll`, `wait`, `scroll-until` aliases. For diagnostics: `watch console` and
`watch network` (with `--all` / `--off`).

For infinite-scroll / load-more loops, use the bundled snippet instead of the
deprecated `scroll-until`:

```bash
/path/to/chromux run exp-ab12 --file /path/to/chromux/snippets/_builtin/scroll-until.js
```

## Core Rules (browser-work uses these literally)

1. **Snapshot for action, screenshot for verification** — `snapshot` gives
   `@ref` numbers for clicking. `screenshot` is only for visual verification.
2. **Always snapshot before acting** — Get `@ref` numbers before any click/fill.
3. **Re-snapshot after every action** — `@ref` numbers go stale after page
   changes.
4. **Click by @ref only** — `click @4`, NOT CSS selectors or `eval` DOM queries.
5. **Retry on element not found** — Wait 2s + re-snapshot (up to 3 times).

## Snapshot Format

```
# Page Title
# https://example.com/page

navigation
  @1 link "Home" -> /
  @2 link "About" -> /about
main
  heading "Welcome"
  @3 textbox "Search..." [text]
  @4 button "Submit"
```

## Anti-patterns

- DO NOT use screenshot to find clickable elements
- DO NOT use `eval` (or `run`/`js`) with DOM queries to *find* elements —
  `snapshot @ref` is the source of truth
- DO NOT use CSS selectors when an @ref exists
- DO NOT use shell variables across Bash calls
