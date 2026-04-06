# Sandbox Detection Reference

Detect what verification environments are available, then recommend missing tools
that would unlock better QA coverage. Detection runs in three tiers — each tier
catches capabilities the previous one missed.

---

## Detection Tiers

Run all three tiers sequentially. Each tier adds to the `tools[]` array.
A tool category is only checked once — if Tier 1 finds "browser", Tiers 2-3 skip browser checks.

### Tier 1: Project-level (config files in repo)

These are the most reliable signals — the project explicitly uses these tools.

```
tools = []
missing = {browser: [], terminal: [], desktop: [], cli: []}

# Browser testing frameworks (root-level only — exclude vendored/reference dirs)
IF Glob("playwright.config.*", path=".") OR Glob("playwright.config.{ts,js,mjs}", path="."):
  tools.push("browser")
  browser_source = "playwright (project config)"
ELIF Glob("cypress.config.*", path=".") OR Glob("cypress.json", path="."):
  tools.push("browser")
  browser_source = "cypress (project config)"

# Container runtime (root-level only)
IF Glob("docker-compose.*", path=".") OR Glob("Dockerfile", path=".") OR Glob("compose.yaml", path="."):
  tools.push("terminal")
  terminal_source = "docker (project config)"

# Desktop testing (rare at project level)
IF Glob(".puppeteerrc.*", path=".") AND Glob("**/desktop-test*"):
  tools.push("desktop")
  desktop_source = "desktop testing (project config)"
```

### Tier 2: System-level (installed CLI tools)

Check for tools available on the machine, even if the project doesn't use them yet.
These enable ad-hoc QA without project configuration.

```
# --- Browser ---
IF "browser" not in tools:
  # Priority order: chromux (best for Claude Code) → playwright CLI → npx fallback
  chromux_ok = Bash("command -v chromux >/dev/null 2>&1 && chromux ps 2>/dev/null; echo $?").trim() == "0"
  IF chromux_ok:
    tools.push("browser")
    browser_source = "chromux (system)"
  ELSE:
    playwright_ok = Bash("command -v playwright >/dev/null 2>&1; echo $?").trim() == "0"
    IF playwright_ok:
      tools.push("browser")
      browser_source = "playwright (system CLI)"

# --- Terminal (container) ---
IF "terminal" not in tools:
  docker_ok = Bash("command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; echo $?").trim() == "0"
  IF docker_ok:
    tools.push("terminal")
    terminal_source = "docker (system)"
  ELSE:
    podman_ok = Bash("command -v podman >/dev/null 2>&1; echo $?").trim() == "0"
    IF podman_ok:
      tools.push("terminal")
      terminal_source = "podman (system)"

# --- CLI (interactive terminal testing via tmux) ---
IF "cli" not in tools:
  tmux_ok = Bash("command -v tmux >/dev/null 2>&1; echo $?").trim() == "0"
  IF tmux_ok:
    tools.push("cli")
    cli_source = "tmux (system)"
```

> **When is `cli` useful?** The Bash tool covers simple command → output → assert flows.
> `cli` sandbox adds value for **interactive** scenarios:
> - TUI apps (curses, blessed, ink) that need keystroke sequences + screen capture
> - REPL sessions requiring multi-turn input (node, python, psql)
> - Long-running processes that need background monitoring (dev servers, watchers)
> - CLI tools that prompt for stdin interactively (e.g., `npm init`, `git rebase -i`)
>
> tmux enables: `send-keys` for input, `capture-pane` for screen state, `wait-for` for sync.

### Tier 3: MCP-level (runtime tool probing)

MCP servers provide capabilities that don't appear in config files or PATH.
This tier catches things like Anthropic's computer-use MCP, chrome MCP, etc.

**This tier is critical — skipping it was the root cause of sandbox detection misses.**

```
# --- Desktop (computer-use MCP) ---
IF "desktop" not in tools:
  computer_results = ToolSearch("computer-use", max_results=30)
  IF any result.name starts with "mcp__computer-use__":
    tools.push("desktop")
    desktop_source = "computer-use MCP"

# --- Browser (chrome MCP) ---
IF "browser" not in tools:
  chrome_results = ToolSearch("claude-in-chrome", max_results=10)
  IF any result.name starts with "mcp__claude-in-chrome__":
    tools.push("browser")
    browser_source = "claude-in-chrome MCP"
```

---

## Detection Report

After all tiers complete, print a structured summary:

```
═══ SANDBOX DETECTION ═══

  browser:  ✓ {browser_source}          | ✗ not found
  terminal: ✓ {terminal_source}          | ✗ not found
  desktop:  ✓ {desktop_source}           | ✗ not found
  cli:      ✓ {cli_source}              | ✗ not found
```

---

## Install Recommendations

When tools are missing AND the spec has sub-requirements that would benefit from
sandbox verification, recommend installation. The goal is to help users unlock
better QA coverage — not to nag about every missing tool.

**When to recommend**: At least one missing tool category AND `verify == "thorough"`.
Light/standard verify modes don't use sandbox, so recommendations are noise there.

**How to recommend**: Print a brief recommendation block after the detection report.
Don't auto-install — just inform and let the user decide.

```
IF len(tools) < 4 AND verify == "thorough":
  print("")
  print("═══ INSTALL RECOMMENDATIONS ═══")
  print("These tools unlock sandbox verification in thorough mode:")
  print("")

  IF "browser" not in tools:
    print("  browser — enables real browser QA (click, type, assert DOM)")
    print("    Option A: chromux        → npm i -g chromux")
    print("      Best for Claude Code. Headless Chrome via CDP, tmux-managed.")
    print("    Option B: playwright     → npm i -g playwright && npx playwright install")
    print("      Industry standard. Heavier install, broader browser coverage.")
    print("")

  IF "terminal" not in tools:
    print("  terminal — enables isolated container testing")
    print("    docker → https://docs.docker.com/get-docker/")
    print("")

  IF "desktop" not in tools:
    print("  desktop — enables native app QA (screenshot + click)")
    print("    computer-use MCP → built-in to Claude Code, needs permission grant")
    print("    (Call mcp__computer-use__request_access to enable)")
    print("")

  AskUserQuestion(
    question: "Install any of these now? (I can run the install command for you)",
    options: [
      { label: "Skip", description: "Continue without installing — sandbox tests will be skipped" },
      { label: "Install browser", description: "Install chromux (recommended) or playwright" },
      { label: "Enable desktop", description: "Request computer-use MCP access" }
    ]
  )

  IF answer == "Install browser":
    AskUserQuestion(
      question: "Which browser tool?",
      options: [
        { label: "chromux (Recommended)", description: "Lightweight, tmux-managed headless Chrome" },
        { label: "playwright", description: "Full browser testing framework" }
      ]
    )
    IF choice == "chromux":
      Bash("npm i -g chromux")
      # Re-check
      chromux_ok = Bash("chromux ps 2>/dev/null; echo $?").trim() == "0"
      IF chromux_ok: tools.push("browser")

    ELIF choice == "playwright":
      Bash("npm i -g playwright && npx playwright install chromium")
      tools.push("browser")

  ELIF answer == "Enable desktop":
    ToolSearch("select:mcp__computer-use__request_access", max_results=1)
    # Call request_access for needed apps
    tools.push("desktop")
```

---

## Merge to Spec

After detection + optional installs, merge results to spec.json:

```
IF len(tools) > 0:
  sandbox_capability = {
    tools: tools,
    scaffold_required: false,
    sources: {browser: browser_source, terminal: terminal_source, desktop: desktop_source}
  }
  Bash("hoyeon-cli spec merge {spec_path} --stdin << 'EOF'
  {\"context\": {\"sandbox_capability\": {\"tools\": [...], \"scaffold_required\": false}}}
  EOF")
  print("Sandbox capability merged: {tools}")
ELSE:
  print("No sandbox capability detected (sandbox verification will be skipped)")
```

---

## Checklist

- [ ] Tier 1 ran (project config files)
- [ ] Tier 2 ran (system CLI tools)
- [ ] Tier 3 ran (MCP tool probing) — **do not skip**
- [ ] Detection report printed
- [ ] Install recommendations shown (if verify == thorough AND tools missing)
- [ ] sandbox_capability merged to spec.json (if tools found)
