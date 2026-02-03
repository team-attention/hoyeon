# Status Table Format

## Overview

The worktree status table provides a real-time overview of all active worktrees, their associated branches, development progress, agent status, active sessions, and uncommitted changes.

## CLI Usage

```bash
# From terminal
scripts/twig status

# From Claude skill
/worktree status
```

Both produce identical output.

## Table Structure

### Column Definitions

| Column | Description | Format | Data Source |
|--------|-------------|--------|-------------|
| **Worktree** | Worktree directory name | `{name}` | Derived from worktree path |
| **Branch** | Git branch name | `feat/{spec-name}` | Git branch tracking |
| **PLAN** | Progress in PLAN.md | `{done}/{total} {bar}` | TODO completion count |
| **Agent** | Current agent status | `running` \| `completed` \| `idle` \| `-` | tmux session state |
| **Sessions** | Active Claude sessions | `{count}` | `.dev/state.local.json` (24h TTL) |
| **Changes** | Uncommitted changes | `+{added} ~{modified}` | Git status |

### Column Details

#### 1. Worktree

The directory name of the worktree.

```bash
# Extract from git worktree list
git worktree list --porcelain | grep "^worktree" | awk '{print $2}' | xargs basename
```

Example: `oh-my-claude-code.auth-feature`

#### 2. Branch

The git branch associated with the worktree.

```bash
# Extract from git worktree list
git worktree list --porcelain | grep "^branch" | sed 's/^branch refs\/heads\///'
```

Example: `feat/auth-feature`

#### 3. PLAN

Progress indicator showing completed vs total TODO items with a visual progress bar.

Format: `{done}/{total} {progress_bar}`

```bash
# Count completed TODOs (marked with [x])
done=$(grep -c '### \[x\] TODO' .dev/specs/{name}/PLAN.md 2>/dev/null || echo "0")

# Count total TODOs (any marker: [x], [ ], [>], [-])
total=$(grep -c '### \[.\] TODO' .dev/specs/{name}/PLAN.md 2>/dev/null || echo "0")

# Calculate progress percentage and generate bar
# Progress bar uses: █ (100%), ▓ (75%), ▒ (50%), ░ (25%)
```

Example values:
- `3/5 ██▓░░` - 60% complete (3 out of 5 tasks)
- `0/8 ░░░░░░░░` - 0% complete
- `5/5 █████` - 100% complete
- `-` - No PLAN.md found

#### 4. Agent

Current agent execution status based on tmux session state.

| Status | Meaning | Condition |
|--------|---------|-----------|
| `running` | Agent actively executing | tmux window exists with active claude process |
| `completed` | Agent finished execution | tmux window exists, claude process completed |
| `idle` | Worktree exists but no agent | tmux window not found |
| `-` | No worktree or session | Worktree not set up for agent execution |

```bash
# Get agent status from tmux
# List all windows in 'wt' session with window name and current command
tmux list-windows -t wt -F "#{window_name} #{pane_current_command}" 2>/dev/null

# Parse to determine status:
# - If pane_current_command contains "claude" or "node" → running
# - If window exists but command is "bash" or "zsh" → completed
# - If window not found → idle
```

#### 5. Sessions

Count of active Claude sessions in this worktree (tracked via UserPromptSubmit hook).

```bash
# Read from .dev/state.local.json
# Sessions are filtered by 24h TTL
jq '[.sessions // {} | to_entries[] | select(.value.worktree == "{name}")] | length' .dev/state.local.json
```

Session data is recorded when Claude starts (via `scripts/twig-session-hook.sh`) and cleaned up after 24 hours.

Example values:
- `2` - Two active sessions in this worktree
- `0` - No active sessions
- `-` - No session data available

#### 6. Changes

Summary of uncommitted changes in the worktree.

Format: `+{added} ~{modified}`

```bash
# Get git status in worktree
cd {worktree_path}

# Count added files (new, untracked)
added=$(git status --porcelain | grep -c "^??")

# Count modified files (staged or unstaged)
modified=$(git status --porcelain | grep -c "^ M\|^M \|^MM")

# Alternative: use git diff --shortstat
git diff --stat --shortstat
```

Example values:
- `+3 ~2` - 3 new files, 2 modified files
- `+0 ~5` - 0 new files, 5 modified files
- `-` - No changes (clean worktree)

## Example Table

```
┌─────────────────────────────┬──────────────────┬────────────┬───────────┬──────────┬──────────┐
│ Worktree                    │ Branch           │ PLAN       │ Agent     │ Sessions │ Changes  │
├─────────────────────────────┼──────────────────┼────────────┼───────────┼──────────┼──────────┤
│ oh-my-claude-code.auth      │ feat/auth        │ 3/5 ██▓░░  │ running   │ 2        │ +2 ~1    │
│ oh-my-claude-code.payment   │ feat/payment     │ 5/5 █████  │ completed │ 1        │ +0 ~3    │
│ oh-my-claude-code.ui-fixes  │ feat/ui-fixes    │ 1/8 ░░░░░░ │ running   │ 1        │ +5 ~0    │
│ oh-my-claude-code.refactor  │ feat/refactor    │ -          │ idle      │ 0        │ -        │
└─────────────────────────────┴──────────────────┴────────────┴───────────┴──────────┴──────────┘
```

## Data Collection Commands

### Complete Status Collection Script

```bash
#!/bin/bash

# Get all worktrees
git worktree list --porcelain | awk '
  /^worktree/ { path=$2 }
  /^branch/ {
    branch=$2
    gsub("refs/heads/", "", branch)
    print path "|" branch
  }
'

# For each worktree, collect:
# 1. Worktree name (basename of path)
# 2. Branch name
# 3. PLAN progress (from .dev/specs/{name}/PLAN.md)
# 4. Agent status (from tmux)
# 5. Changes count (from git status)
```

### Individual Data Source Commands

```bash
# 1. List all worktrees with paths
git worktree list --porcelain

# 2. Get branch for specific worktree
git -C {worktree_path} branch --show-current

# 3. Get worktree metadata (from .dev/local.json)
jq -r '.name, .plan' {worktree_path}/.dev/local.json

# 4. Count PLAN TODOs (using plan path from local.json)
PLAN_PATH=$(jq -r '.plan' {worktree_path}/.dev/local.json)
grep '### \[x\] TODO' "{worktree_path}/$PLAN_PATH" | wc -l  # done
grep '### \[.\] TODO' "{worktree_path}/$PLAN_PATH" | wc -l  # total

# 5. Get tmux agent status
tmux list-windows -t wt -F "#{window_name} #{pane_current_command}"

# 6. Get active sessions count (from state.local.json, 24h TTL)
jq '[.sessions // {} | to_entries[] | select(.value.worktree == "{name}")] | length' .dev/state.local.json

# 7. Get git changes count
git -C {worktree_path} status --porcelain | wc -l
git -C {worktree_path} diff --shortstat
```

## Progress Bar Generation

The progress bar uses Unicode block characters to represent completion percentage:

| Character | Represents | Usage |
|-----------|------------|-------|
| `█` | 100% filled | Completed segments |
| `▓` | 75% filled | Partial progress (3/4) |
| `▒` | 50% filled | Partial progress (1/2) |
| `░` | 25% filled | Minimal progress (1/4) |

### Bar Generation Algorithm

```bash
# Calculate percentage
done=3
total=5
percent=$((done * 100 / total))

# Bar length (typically 5 characters for 5 segments)
bar_length=$total

# Fill bar based on done count
bar=""
for i in $(seq 1 $total); do
  if [ $i -le $done ]; then
    bar="${bar}█"
  else
    bar="${bar}░"
  fi
done

echo "$done/$total $bar"
# Output: 3/5 ███░░
```

## Use Cases

1. **Quick status check**: See all active worktrees at a glance
2. **Progress monitoring**: Track which features are near completion
3. **Agent monitoring**: Identify which agents are running or stuck
4. **Change tracking**: Spot worktrees with uncommitted changes
5. **Resource management**: Identify idle worktrees that can be cleaned up

## Related

- [config-schema.md](./config-schema.md) - Worktree configuration options
- `/worktree` skill - Worktree management commands
- `scripts/twig` - Standalone CLI tool
- `.dev/local.json` - Worktree metadata (JSON format)
- `.dev/state.local.json` - Session tracking data
