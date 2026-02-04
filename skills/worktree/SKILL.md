---
name: worktree
description: |
  "/worktree", "git worktree", "worktree create", "worktree go", "worktree status", "worktree cleanup"
  Git worktree management skill - create worktrees, navigate to them with custom commands, check status with progress tracking, and cleanup
  Natural language triggers: "워크트리 만들어줘", "워크트리 상태", "진행현황 보여줘", "워크트리 정리", "피처 브랜치 상태", "워크트리 가기"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
validate_prompt: |
  Must contain all 3 subcommands: create, status, cleanup.
  Each subcommand must have: Purpose, Syntax, Workflow, Example, Error Handling.
  Output should use hy CLI (internally uses git worktree).
---

# worktree - Git Worktree Management

## Purpose

Manage parallel development workflows using git worktrees and tmux sessions. Each worktree represents a separate feature branch with its own working directory, and can have its own Claude agent session running in a dedicated tmux window.

**Key Benefits**:
- **Parallel development**: Work on multiple features simultaneously without branch switching
- **Agent orchestration**: Spawn isolated Claude sessions per feature in tmux
- **Progress tracking**: Unified status view of worktrees, agents, and PLAN progress
- **Clean isolation**: Each worktree has its own working directory and agent context

**CLI Tool**: This skill wraps `hy` CLI. Install it first:
- Via `/init` skill (recommended)
- Or manually: `~/.claude/plugins/.../hoyeon/scripts/install-hy.sh`

Once installed, `hy` is available globally in terminal.

---

## Input

```
/worktree <action> [arguments]

actions:
  (no args)                   # Interactive: show status + select → go
  go <name>                   # Go to worktree + run post_command
  create <name>               # Create worktree + move spec from main
  status                      # Show all worktrees with PLAN progress
  path <name>                 # Print worktree path (for scripts)
  cleanup [name]              # Cleanup worktree (interactive if no name)
```

---

## Configuration

This skill references `.dev/config.yml` for project-specific settings. See `${baseDir}/references/config-schema.md` for full schema and examples.

```yaml
worktree:
  base_dir: ".worktrees/{name}"    # Worktree location
  copy_files: [.env.local]         # Files to copy from main
  post_command: "claude"           # Command to run after 'go' (or set HY_POST_COMMAND env)
```

**Defaults**: `base_dir: ".worktrees/{name}"`, `copy_files: []`, `post_command: "claude"`

---

## Actions

### (interactive)

**Purpose**: Interactive mode - show status table and select a worktree to open

**Syntax**:
```
/worktree
hy
```

**Workflow**:
1. Show status table with numbered rows
2. Prompt for selection
3. Run `hy go <selected>` to navigate + start Claude

---

### go

**Purpose**: Navigate to worktree and run post_command (default: claude)

**Syntax**:
```
/worktree go <name>
hy go <name>
```

**Workflow**:
1. Resolve worktree path
2. `cd` to worktree
3. Run `post_command` from config (or `HY_POST_COMMAND` env)

**Example**:
```
hy go my-feature
→ cd .worktrees/my-feature
→ claude
```

---

### create

**Purpose**: Create a new git worktree with feature branch and MOVE spec from main

**Syntax**:
```
/worktree create <name>
```

**Preconditions**:
- Current directory must be a git repository
- Worktree `<name>` must not already exist

**Workflow**:

Execute via `hy`:
```bash
hy create <name>
```

The CLI handles:
1. **Read config** from `.dev/config.yml` (or use defaults)
2. **Create worktree** with `git worktree add`
3. **Copy config files** specified in `copy_files`
4. **MOVE spec** from main if exists (`.dev/specs/{name}/` → worktree, then delete from main)
5. **Create metadata** at `.dev/local.json`:
   ```json
   {
     "name": "feature-name",
     "branch": "feat/feature-name",
     "plan": ".dev/specs/feature-name/PLAN.md",
     "created_at": "2026-02-03T...",
     "source": "main"
   }
   ```
   This file is the **source of truth** for worktree identity.
   The `plan` field is used by `hy status` to find progress data.

**Example**:
```
User: /worktree create user-auth

Output:
✅ Worktree created: ../.worktrees/user-auth
   Branch: feat/user-auth
   Files copied: .dev/config.yml, .env.local
   Metadata: .dev/worktree.yml
```

**Error Handling**:
- Worktree exists → "워크트리 '{name}'가 이미 존재합니다. `git worktree list`로 확인하세요."
- Not a git repo → "git 저장소가 아닙니다. git 프로젝트 루트에서 실행하세요."
- Branch exists → "브랜치 'feat/{name}'가 이미 존재합니다. 다른 이름을 사용하세요."

---

### status

**Purpose**: Show unified status of all worktrees with PLAN progress, sessions, and git changes

**Syntax**:
```
/worktree status
```

**Workflow**:

Execute via `hy`:
```bash
hy status
```

The CLI handles:
1. **Enumerate worktrees** via `git worktree list --porcelain`
2. **For each worktree**, collect:
   - **PLAN progress**: Read plan path from `.dev/local.json`, count TODOs
   - **Changes count**: `git status --porcelain`
   - **Active sessions**: From `.dev/state.local.json` (24h TTL filtered)
   - **Behind main**: `git rev-list --count HEAD..main`
   - **PR status**: via `gh pr list` (optional)
3. **Output aligned table** with progress bars

See `${baseDir}/references/status-table.md` for table format details.

**Example**:
```
User: /worktree status

Output:
NAME                 PROGRESS             CHANGES  BEHIND   SESSIONS   PR
----                 --------             -------  ------   --------   --
user-auth            3/5 ███░░            2        0        1          #42
payment              5/5 █████            0        3        0          -
```

**Error Handling**:
- No worktrees → "워크트리가 없습니다. `/worktree create <name>`으로 생성하세요."

---

### cleanup

**Purpose**: Clean up completed worktree - remove worktree and optionally delete branch

**Syntax**:
```
/worktree cleanup [name]
```

**Workflow**:

Execute via `hy`:
```bash
# Specific worktree
hy cleanup <name>

# Skip confirmations
hy cleanup <name> --yes
```

The CLI handles:
1. **Check uncommitted changes** and warn
2. **Kill tmux window** if exists
3. **Remove worktree** via `git worktree remove`
4. **Ask about branch deletion** (or auto-delete with `--yes`)

**Example**:

*With name*:
```
User: /worktree cleanup user-auth

Output:
⚠️  워크트리에 커밋되지 않은 변경사항이 3개 있습니다.
정말 삭제하시겠습니까? 변경사항이 손실됩니다. (y/N): y

✅ 워크트리 제거: ../oh-my-claude-code.user-auth
브랜치 'feat/user-auth'도 삭제하시겠습니까? (y/N): n

완료: 브랜치는 유지됩니다.
```

**Error Handling**:
- Worktree doesn't exist → "워크트리 '{name}'가 존재하지 않습니다."
- Uncommitted changes (without confirmation) → Abort cleanup, show warning
- No completed worktrees (interactive mode) → "완료된 워크트리가 없습니다."

---

## Error Handling

| Action | Error Situation | Message |
|--------|-----------------|---------|
| create | Worktree already exists | "워크트리 '{name}'가 이미 존재합니다. `git worktree list`로 확인하세요." |
| create | Not a git repo | "git 저장소가 아닙니다. git 프로젝트 루트에서 실행하세요." |
| create | Branch already exists | "브랜치 'feat/{name}'가 이미 존재합니다. 다른 이름을 사용하세요." |
| status | No worktrees | "워크트리가 없습니다. `/worktree create <name>`으로 생성하세요." |
| cleanup | Worktree doesn't exist | "워크트리 '{name}'가 존재하지 않습니다." |
| cleanup | Uncommitted changes (no confirm) | "⚠️  워크트리에 커밋되지 않은 변경사항이 {count}개 있습니다." |

---

## Related Commands

| Command | Description |
|---------|-------------|
| `/specify <name>` | Write spec document for new feature |
| `/open <name>` | Create PR based on spec |
| `/execute <PR#>` | Execute implementation in current directory |
| `git worktree list` | List all worktrees (native git command) |

---

## Implementation Notes

1. **CLI tool**: `hy` - standalone bash CLI
   - All actions call this CLI internally for consistent behavior
   - Can also be used directly from terminal
   - Install via `/init` skill or manually: `scripts/install-hy.sh`

2. **Worktree metadata**: `.dev/local.json` (JSON format, gitignored)
   ```json
   {"name":"...", "branch":"feat/...", "plan":".dev/specs/.../PLAN.md", "created_at":"...", "source":"main"}
   ```

3. **Session tracking**: `.dev/state.local.json` (sessions field)
   - Recorded via UserPromptSubmit hook
   - 24h TTL for stale session cleanup

4. **Worktree naming convention**: Resolved from `base_dir` in config
   - Default: `../.worktrees/{name}`

5. **Branch naming convention**: `feat/{feature-name}`

6. **Config file handling**:
   - Read `.dev/config.yml` if exists
   - Use defaults if not
   - Do NOT create config file if it doesn't exist
