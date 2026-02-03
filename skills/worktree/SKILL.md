---
name: worktree
description: |
  "/worktree", "git worktree", "worktree create", "worktree spawn", "worktree status", "worktree attach", "worktree cleanup"
  Git worktree management skill - create, spawn agent sessions, check status, attach to sessions, and cleanup completed worktrees
  Natural language triggers: "워크트리 만들어줘", "워크트리 상태", "진행현황 보여줘", "워크트리 정리", "에이전트 실행", "피처 브랜치 상태"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
validate_prompt: |
  Must contain all 5 subcommands: create, spawn, status, attach, cleanup.
  Each subcommand must have: Purpose, Syntax, Workflow, Example, Error Handling.
  Output should use twig CLI (internally uses git worktree).
  tmux session name must be 'wt', window names must be worktree names.
---

# worktree - Git Worktree Management

## Purpose

Manage parallel development workflows using git worktrees and tmux sessions. Each worktree represents a separate feature branch with its own working directory, and can have its own Claude agent session running in a dedicated tmux window.

**Key Benefits**:
- **Parallel development**: Work on multiple features simultaneously without branch switching
- **Agent orchestration**: Spawn isolated Claude sessions per feature in tmux
- **Progress tracking**: Unified status view of worktrees, agents, and PLAN progress
- **Clean isolation**: Each worktree has its own working directory and agent context

**CLI Tool**: This skill wraps `twig` CLI. Install it first:
- Via `/init` skill (recommended)
- Or manually: `~/.claude/plugins/.../hoyeon/scripts/install-twig.sh`

Once installed, `twig` is available globally in terminal.

---

## Input

```
/worktree <action> [arguments]

actions:
  create <name>               # Create new worktree and copy config files
  spawn <name> "<prompt>"     # Spawn Claude agent session in tmux
  status                      # Show all worktrees, agent status, PLAN progress
  attach <name>               # Attach to existing tmux session
  cleanup [name]              # Cleanup worktree (interactive if no name)
```

---

## Configuration

This skill references `.dev/config.yml` for project-specific settings. See `${baseDir}/references/config-schema.md` for full schema and examples.

**Defaults** (when `.dev/config.yml` doesn't exist): `base_dir: "../.worktrees/{name}"`, `copy_files: []`

---

## Actions

### create

**Purpose**: Create a new git worktree with feature branch and copy necessary config files

**Syntax**:
```
/worktree create <name>
```

**Preconditions**:
- Current directory must be a git repository
- Worktree `<name>` must not already exist

**Workflow**:

Execute via `twig`:
```bash
twig create <name>
```

The CLI handles:
1. **Read config** from `.dev/config.yml` (or use defaults)
2. **Create worktree** with `git worktree add`
3. **Copy config files** specified in `copy_files`
4. **Copy spec** from main if exists (`.dev/specs/{name}/`)
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
   The `plan` field is used by `twig status` to find progress data.

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

### spawn

**Purpose**: Spawn a Claude agent session in tmux for the specified worktree

**Syntax**:
```
/worktree spawn <name> "<prompt>"
/worktree spawn <name> "<prompt>" --headless
```

**Preconditions**:
- tmux must be installed (`which tmux`)
- Worktree `<name>` must exist

**Workflow**:

Execute via `twig`:
```bash
# Interactive mode (no prompt)
twig spawn <name>

# With prompt
twig spawn <name> "Your prompt here"
```

The CLI handles:
1. **Verify tmux** installation
2. **Resolve worktree path** and verify it exists
3. **Create/reuse tmux session** `wt` with window named `<name>`
4. **Launch Claude** in the worktree directory (with optional prompt via temp file)

**Example**:

*Interactive mode*:
```
User: /worktree spawn user-auth "Implement authentication middleware"

Output:
✅ Agent spawned in tmux session 'wt:user-auth'
   Mode: interactive
   Path: ../oh-my-claude-code.user-auth

   To attach: /worktree attach user-auth
   To view all sessions: tmux list-windows -t wt
```

*Headless mode*:
```
User: /worktree spawn user-auth "Review PLAN.md and start execution" --headless

Output:
✅ Agent spawned in tmux session 'wt:user-auth'
   Mode: headless
   Prompt: "Review PLAN.md and start execution"
   Path: ../oh-my-claude-code.user-auth
```

**Error Handling**:
- tmux not installed → "tmux가 필요합니다. `brew install tmux`로 설치하세요."
- Worktree doesn't exist → "워크트리 '{name}'가 존재하지 않습니다. `/worktree create {name}`으로 생성하세요."
- Window already exists → "tmux 윈도우 '{name}'가 이미 존재합니다. `/worktree attach {name}`으로 연결하세요."

---

### status

**Purpose**: Show unified status of all worktrees, agent sessions, PLAN progress, and uncommitted changes

**Syntax**:
```
/worktree status
```

**Workflow**:

Execute via `twig`:
```bash
twig status
```

The CLI handles:
1. **Enumerate worktrees** via `git worktree list --porcelain`
2. **Get tmux window status** for session `wt`
3. **For each worktree**, collect:
   - **PLAN progress**: Read plan path from `.dev/local.json`, count TODOs
   - **Changes count**: `git status --porcelain`
   - **Agent status**: Match tmux window name
   - **Active sessions**: From `.dev/state.local.json` (24h TTL filtered)
   - **Behind main**: `git rev-list --count HEAD..main`
   - **PR status**: via `gh pr list` (optional)

4. **Output aligned table** with progress bars

See `${baseDir}/references/status-table.md` for table format details.

**Example**:
```
User: /worktree status

Output: (table as shown above)
```

**Error Handling**:
- No worktrees → "워크트리가 없습니다. `/worktree create <name>`으로 생성하세요."
- tmux not running → Show worktrees without agent status (AGENT column shows "-")

---

### attach

**Purpose**: Attach to an existing tmux session for the specified worktree

**Syntax**:
```
/worktree attach <name>
```

**Preconditions**:
- tmux session `wt` must exist
- Window `<name>` must exist in session `wt`

**Workflow**:

Execute via `twig`:
```bash
twig attach <name>
```

The CLI handles:
1. **Verify tmux session/window** exists
2. **Context-aware attach**:
   - If already in tmux: `tmux select-window -t wt:<name>`
   - If not in tmux: `tmux attach-session -t wt \; select-window -t <name>`

**Example**:
```
User: /worktree attach user-auth

Output:
✅ Attaching to tmux session 'wt:user-auth'...

(Terminal switches to tmux session)
```

**Error Handling**:
- Session doesn't exist → "tmux 세션 'wt'가 없습니다. 실행 중인 워크트리가 없습니다."
- Window doesn't exist → "tmux 윈도우 '{name}'가 없습니다. `/worktree spawn {name}`로 생성하세요."

---

### cleanup

**Purpose**: Clean up completed worktree - kill tmux window, remove worktree, optionally delete branch

**Syntax**:
```
/worktree cleanup [name]
```

**Workflow**:

Execute via `twig`:
```bash
# Specific worktree
twig cleanup <name>

# Skip confirmations
twig cleanup <name> --yes
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

✅ tmux 윈도우 'wt:user-auth' 종료
✅ 워크트리 제거: ../oh-my-claude-code.user-auth
브랜치 'feat/user-auth'도 삭제하시겠습니까? (y/N): n

완료: 브랜치는 유지됩니다.
```

*Without name (interactive)*:
```
User: /worktree cleanup

Output:
완료된 워크트리:
  1. payment (PLAN: 3/3 ✓, changes: 0)
  2. email-tmpl (PLAN: -, changes: 0)

진행 중인 워크트리:
  3. user-auth (PLAN: 2/5, changes: 12)

삭제할 워크트리를 선택하세요 (번호 또는 이름): 1

✅ tmux 윈도우 'wt:payment' 종료
✅ 워크트리 제거: ../oh-my-claude-code.payment
브랜치 'feat/payment'도 삭제하시겠습니까? (y/N): y
✅ 브랜치 'feat/payment' 삭제
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
| spawn | tmux not installed | "tmux가 필요합니다. `brew install tmux`로 설치하세요." |
| spawn | Worktree doesn't exist | "워크트리 '{name}'가 존재하지 않습니다. `/worktree create {name}`으로 생성하세요." |
| spawn | Window already exists | "tmux 윈도우 '{name}'가 이미 존재합니다. `/worktree attach {name}`으로 연결하세요." |
| status | No worktrees | "워크트리가 없습니다. `/worktree create <name>`으로 생성하세요." |
| attach | Session doesn't exist | "tmux 세션 'wt'가 없습니다. 실행 중인 워크트리가 없습니다." |
| attach | Window doesn't exist | "tmux 윈도우 '{name}'가 없습니다. `/worktree spawn {name}`로 생성하세요." |
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
| `tmux list-windows -t wt` | List all tmux windows in 'wt' session |

---

## Implementation Notes

1. **CLI tool**: `twig` - standalone bash CLI
   - All actions call this CLI internally for consistent behavior
   - Can also be used directly from terminal

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

6. **tmux session structure**:
   - Session name: `wt` (fixed)
   - Window names: feature names
   - One agent per window

7. **Config file handling**:
   - Read `.dev/config.yml` if exists
   - Use defaults if not
   - Do NOT create config file if it doesn't exist
