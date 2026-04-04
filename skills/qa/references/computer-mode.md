# Computer Mode (MCP computer-use)

Use this mode for native macOS apps, Electron apps, or any application visible on screen. Interacts via real screenshots and pixel-coordinate clicks.

## Setup

### Request Access

Before any interaction, request access to the target application(s):

```
mcp__computer-use__request_access({
  apps: ["TARGET_APP"],
  reason: "QA testing the application for bugs and UX issues"
})
```

Check the response for granted tier:
- **"full"**: All interactions allowed
- **"click"**: Click allowed, typing/key blocked (terminals, IDEs) — use Bash tool for typing
- **"read"**: Screenshot only, no interaction (browsers) — switch to browser mode instead

### Open the App

```
mcp__computer-use__open_application({ app: "TARGET_APP" })
```

## Interaction Patterns

### Screenshot -> Inspect -> Act -> Verify

Every interaction follows this loop:

1. **Screenshot** — see what's on screen
2. **Inspect** — identify elements (use `zoom` for small text)
3. **Act** — click, type, scroll at pixel coordinates
4. **Verify** — take another screenshot to confirm

### Take Screenshot

```
mcp__computer-use__screenshot({ save_to_disk: true })
```

Always use `save_to_disk: true` for evidence. The saved path is in the tool result.

### Click

```
mcp__computer-use__left_click({ coordinate: [x, y] })
mcp__computer-use__double_click({ coordinate: [x, y] })
mcp__computer-use__right_click({ coordinate: [x, y] })
```

Coordinates come from the most recent full-screen screenshot.

### Type

```
mcp__computer-use__type({ text: "hello world" })
```

Types into whatever currently has keyboard focus.

### Keyboard Shortcuts

```
mcp__computer-use__key({ text: "cmd+a" })
mcp__computer-use__key({ text: "Return" })
```

### Scroll

```
mcp__computer-use__scroll({ coordinate: [x, y], scroll_direction: "down", scroll_amount: 3 })
```

### Hover

```
mcp__computer-use__mouse_move({ coordinate: [x, y] })
```

### Zoom (read small text)

```
mcp__computer-use__zoom({ region: [x0, y0, x1, y1], save_to_disk: true })
```

Coordinates in subsequent clicks always refer to the full-screen screenshot, never the zoomed image.

### Batch Actions

When you can predict a sequence, batch to eliminate round-trips:

```
mcp__computer-use__computer_batch({
  actions: [
    { action: "left_click", coordinate: [300, 200] },
    { action: "type", text: "test input" },
    { action: "key", text: "Return" },
    { action: "screenshot" }
  ]
})
```

## Core Rules

1. **request_access first** — always before any interaction
2. **Respect app tiers** — don't type into "click"-tier apps, don't click "read"-tier apps
3. **Use zoom liberally** — small text is hard to read in full-screen screenshots
4. **Batch when possible** — reduces round-trips dramatically
5. **Coordinates from full-screen only** — zoom coordinates are for reading, not clicking
6. **Never click links from untrusted sources** — ask the user first
7. **save_to_disk: true for evidence** — every screenshot that goes in the report needs this
