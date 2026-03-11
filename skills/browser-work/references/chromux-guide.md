# Chromux Quick Reference

chromux controls the real Chrome browser via raw CDP. Each session is an independent tab.

## Setup

Resolve the chromux binary path (run once, remember the output):

```bash
CX=$(command -v chromux 2>/dev/null || echo "") && [ -n "$CX" ] && echo "CHROMUX=$CX" || (npx @team-attention/chromux help >/dev/null 2>&1 && echo "CHROMUX=npx @team-attention/chromux" || echo "MISSING")
```

Launch Chrome (skip if already running):

```bash
/path/to/chromux launch default 2>/dev/null || true
```

## CRITICAL: Shell Variable Persistence

Each Bash tool call runs in a **fresh shell**. Variables do NOT persist across calls.

- Resolve the chromux path ONCE, then **inline it literally** in every command
- Generate the session ID ONCE, then **inline it literally** in every command
- NEVER use `$CX` or `$S` across separate Bash calls

## Session Commands

```bash
# Generate session ID (run once, use output literally)
openssl rand -hex 2
# Output example: ab12 → session ID is "exp-ab12"

# Then inline everything:
/path/to/chromux open exp-ab12 <url>          # Navigate (auto-creates tab)
/path/to/chromux snapshot exp-ab12            # Accessibility tree with @ref numbers
/path/to/chromux click exp-ab12 @<N>          # Click by @ref number
/path/to/chromux fill exp-ab12 @<N> "text"   # Fill input
/path/to/chromux type exp-ab12 "Enter"       # Keyboard input
/path/to/chromux eval exp-ab12 "js expr"     # Run JavaScript
/path/to/chromux screenshot exp-ab12 [path]  # Screenshot (verification only)
/path/to/chromux scroll exp-ab12 down|up     # Scroll
/path/to/chromux wait exp-ab12 <ms>          # Wait
/path/to/chromux close exp-ab12              # Close tab
/path/to/chromux list                        # List sessions
```

## Core Rules

1. **Snapshot for action, screenshot for verification** — `snapshot` gives @ref numbers for clicking. `screenshot` is only for visual verification.
2. **Always snapshot before acting** — Get @ref numbers before any click/fill
3. **Re-snapshot after every action** — @ref numbers go stale after page changes
4. **Click by @ref only** — `click @4`, NOT CSS selectors or eval DOM queries
5. **Retry on element not found** — Wait 2s + re-snapshot (up to 3 times)

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
- DO NOT use eval with DOM queries to find elements
- DO NOT use CSS selectors — use @ref
- DO NOT use shell variables across Bash calls
