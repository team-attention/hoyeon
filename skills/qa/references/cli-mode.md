# CLI Mode (tmux)

Use this mode for CLI tools, REPL interfaces, and interactive terminal applications.
tmux enables send-keys for input and capture-pane for screen state — essential for
testing interactive flows that Bash piped input can't handle.

## Setup

Verify tmux is available:

```bash
command -v tmux >/dev/null 2>&1 && echo "OK" || echo "MISSING"
```

If `MISSING`, fall back to Bash piped input for non-interactive commands, or report error for interactive tests.

Create a dedicated session:

```bash
tmux new-session -d -s qa-cli -x 120 -y 40
```

Session name: `qa-cli`. Window size 120x40 gives enough room for most CLI output.

## Interaction Patterns

### Run a command
```bash
tmux send-keys -t qa-cli "node todo.js add Buy milk" Enter
```

### Wait for output to settle
```bash
sleep 0.5
```
Short sleep after send-keys — tmux is async, capture-pane might read before output arrives.

### Capture screen state (evidence)
```bash
tmux capture-pane -t qa-cli -p > .qa-reports/screenshots/cli-step-N.txt
```
This is the CLI equivalent of a screenshot. Save after every significant action.

### Assert output contains expected text
```bash
tmux capture-pane -t qa-cli -p | grep -q "Added: Buy milk" && echo "PASS" || echo "FAIL"
```

### Interactive REPL testing
```bash
# Start the interactive app
tmux send-keys -t qa-cli "node todo.js" Enter
sleep 0.5

# Verify prompt appeared
tmux capture-pane -t qa-cli -p | grep -q ">" && echo "PROMPT_OK" || echo "NO_PROMPT"

# Send interactive commands
tmux send-keys -t qa-cli "add Buy milk" Enter
sleep 0.3
tmux capture-pane -t qa-cli -p | grep -q "Added" && echo "PASS" || echo "FAIL"

# Exit the REPL
tmux send-keys -t qa-cli "quit" Enter
```

### Send special keys
```bash
tmux send-keys -t qa-cli C-c        # Ctrl+C
tmux send-keys -t qa-cli C-d        # Ctrl+D (EOF)
tmux send-keys -t qa-cli Up Enter   # Arrow up + Enter (history recall)
tmux send-keys -t qa-cli Tab        # Tab completion
```

### Clear screen between tests
```bash
tmux send-keys -t qa-cli "clear" Enter
sleep 0.2
```

### Cleanup
```bash
tmux kill-session -t qa-cli 2>/dev/null || true
```

## Core Rules

1. **capture-pane for evidence, grep for assertions** — capture-pane is the CLI equivalent of screenshot
2. **Always sleep after send-keys** — 0.3-0.5s is usually enough; increase for slow startup
3. **Save every capture** — `.qa-reports/screenshots/cli-step-N.txt` for audit trail
4. **Kill session on cleanup** — always, even on failure
5. **One session per QA run** — don't reuse sessions across tests (state leaks)

## When to Use CLI vs Bash

| Scenario | Tool | Why |
|----------|------|-----|
| `node script.js --flag` → stdout → exit | Bash | Non-interactive, single command |
| REPL with `>` prompt, multi-turn input | tmux | Needs send-keys for each turn |
| TUI app (curses, blessed, ink) | tmux | Needs keystroke sequences + screen capture |
| Long-running server for testing | tmux | Background process with output monitoring |
| `git rebase -i` style interactive | tmux | Needs editor simulation |
