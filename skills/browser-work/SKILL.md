---
name: browser-work
description: |
  Recon-first browser automation. Orchestrator explores the site first via chromux,
  saves a guide file with insights, then delegates execution to browser-explorer agent.
  Use when: "/browser-work", "브라우저 작업", "사이트에서 해줘", "웹에서 해줘",
  "LinkedIn에서", "크롬으로", "browser task", "automate this site".
version: 1.0.0
---

# Browser Work

Recon-first browser automation: explore → document → delegate.

## Purpose

To reliably execute browser tasks on the user's behalf, the orchestrator first scouts the site directly,
creates a pitfall-prevention guide, then delegates execution to the browser-explorer agent.

## Why Recon First?

When an agent sees a site for the first time, there's a lot of trial and error (snapshot vs. screenshot confusion, clicking wrong elements, unfamiliar site structure).
If the orchestrator walks through one cycle first and builds a "map," the agent can execute accurately.

## Execution

### Step 0: Setup

#### 0-1. Session Init

```bash
SESSION_ID="[CLAUDE_SESSION_ID from UserPromptSubmit hook]"
WORK_DIR="$HOME/.hoyeon/$SESSION_ID"
mkdir -p "$WORK_DIR"
echo "WORK_DIR=$WORK_DIR"
```

#### 0-2. Chromux Check

Resolve chromux path. **Remember the output literally** — you'll inline it in every command.

```bash
CX=$(command -v chromux 2>/dev/null || echo "") && [ -n "$CX" ] && echo "CHROMUX=$CX" || (npx @team-attention/chromux help >/dev/null 2>&1 && echo "CHROMUX=npx @team-attention/chromux" || echo "MISSING")
```

If `MISSING`, report error and stop.

Launch Chrome (head mode by default):

```bash
/path/to/chromux launch default 2>/dev/null || true
```

#### 0-3. Generate Session ID

```bash
openssl rand -hex 2
```

Remember the output (e.g., `ab12`) → your chromux session ID is `exp-ab12`. Inline it literally in every command.

### Step 1: Assess Complexity

Before doing recon, assess whether the task needs it:

| Complexity | Criteria | Action |
|------------|----------|--------|
| **Simple** | Single page, 1-2 clicks, well-known site (Google, GitHub) | Skip recon → go directly to Step 4 (Delegate) |
| **Medium** | Multi-step workflow, unfamiliar site, 3+ interactions | Do recon (Step 2-3) |
| **Complex** | Dynamic content, auth flows, pagination, bot-sensitive site | Do thorough recon (Step 2-3) + extra caution notes |

If skipping recon, still create a minimal guide file with the task description and URL.

### Step 2: Recon (Orchestrator explores directly)

**You (the orchestrator) use chromux directly.** Follow the chromux guide in `references/chromux-guide.md`.

#### 2-1. Navigate & Snapshot

```bash
/path/to/chromux open exp-ab12 "<target-url>" && sleep 2 && /path/to/chromux snapshot exp-ab12
```

#### 2-2. Walk Through the Workflow

Execute the **entire workflow once** — the same steps the agent will need to do:

1. **Snapshot** the page → identify key elements and their @ref numbers
2. **Click/interact** as needed → observe what changes
3. **Snapshot again** after each action → note how @ref numbers shift
4. **Note obstacles**: popups, modals, login walls, infinite scroll, dynamic loading
5. **Note patterns**: does "load more" change @ref numbers? Are there confirmation dialogs?

**Bot detection caution**:
- Add `wait 2000` between actions (don't click rapidly)
- Don't repeat the same action more than 3 times quickly
- If you see a CAPTCHA or rate limit warning, stop and note it in the guide

#### 2-3. Close Recon Session

```bash
/path/to/chromux close exp-ab12
```

### Step 3: Write Guide File

Save recon findings to `$WORK_DIR/guide.md`. This is the "map" the agent will follow.

```bash
cat > "$WORK_DIR/guide.md" << 'GUIDE_EOF'
# Browser Work Guide

## Task
[What the user wants done — 1-2 sentences]

## Target URL
[Starting URL]

## Site Characteristics
- [Login required? Already logged in?]
- [Single page or multi-page workflow?]
- [Dynamic content loading? (infinite scroll, AJAX)]
- [Known bot detection? Rate limits?]

## Workflow Steps
1. [Step description] — [which element to look for in snapshot]
2. [Step description] — [expected @ref pattern or text to search for]
3. ...

## Pitfalls & Insights
- [Things that could trip up the agent]
- [e.g., "Sort dropdown is NOT the first artdeco-dropdown — look for text 'Most Relevant'"]
- [e.g., "'Load more' button changes @ref every time — always re-snapshot"]
- [e.g., "Confirmation modal appears after clicking Connect — look for 'Send without a note'"]

## Bot Detection Notes
- [Recommended delay between actions]
- [Any rate limits observed]
- [Pages to avoid rapid-fire clicking on]
GUIDE_EOF
```

**Fill in the template** with actual findings from your recon. Be specific — the agent will read this literally.

### Step 4: Delegate to Browser-Explorer Agent

Launch the browser-explorer agent with the guide file content included in the prompt.

```
Agent(
  subagent_type: "hoyeon:browser-explorer",
  mode: "dontAsk",
  prompt: """
[Task description from user]

## Recon Guide

[Paste full contents of $WORK_DIR/guide.md here]

## Execution Rules

1. Follow the Workflow Steps in the guide above
2. Be conservative — add `wait 2000` between actions to avoid bot detection
3. If something doesn't match the guide (unexpected popup, different layout), snapshot and adapt
4. If you hit a CAPTCHA or rate limit, STOP and report back
5. Close your session when done
"""
)
```

**If the task requires multiple independent sub-tasks** (e.g., "send connection requests to 5 people"), you can launch multiple browser-explorer agents in parallel — each gets its own tab.

### Step 5: Report Results

After the agent completes:
1. Summarize what was accomplished
2. Note any failures or partial completions
3. If the agent hit issues not covered by the guide, update `$WORK_DIR/guide.md` with new insights for future runs

## Error Handling

| Situation | Response |
|-----------|----------|
| chromux not found | Report error, suggest `npm i -g @team-attention/chromux` |
| Site requires login | Check if chromux profile has saved login. If not, tell user to log in manually first |
| CAPTCHA during recon | Stop recon, note in guide, delegate with extra caution |
| Agent fails despite guide | Resume agent with corrections, or re-do recon with more detail |
| Task too complex for single agent | Split into sub-tasks, delegate each to separate agent |

## Cleanup

Guide files persist in `~/.hoyeon/{sid}/` for reference. No auto-cleanup — user can review or reuse.
