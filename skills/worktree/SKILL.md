---
name: worktree
description: |
  "/worktree", "git worktree", "worktree create", "worktree spawn", "worktree status", "worktree attach", "worktree cleanup"
  Git worktree management skill - create, spawn agent sessions, check status, attach to sessions, and cleanup completed worktrees
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
validate_prompt: |
  Must contain all 5 subcommands: create, spawn, status, attach, cleanup.
  Each subcommand must have: Purpose, Syntax, Workflow, Example, Error Handling.
  Output should use git worktree commands (NOT wt CLI).
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

**Defaults** (when `.dev/config.yml` doesn't exist): `base_dir: "../{repo}.{name}"`, `copy_files: []`

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

1. **Read config** (if exists):
   ```bash
   # Check if .dev/config.yml exists
   if [ -f .dev/config.yml ]; then
     # Parse base_dir and copy_files from .dev/config.yml
     # Default: base_dir="../", copy_files=[]
   fi
   ```

2. **Resolve worktree path** (from `base_dir` template):
   ```bash
   REPO_NAME=$(basename $(git rev-parse --show-toplevel))
   # Replace {repo} and {name} in base_dir template
   # Default template: "../{repo}.{name}"
   WORKTREE_PATH=$(echo "$BASE_DIR" | sed "s/{repo}/$REPO_NAME/g; s/{name}/$NAME/g")

   git worktree add "$WORKTREE_PATH" -b "feat/${NAME}"
   ```

3. **Copy config files**:
   ```bash
   for file in "${COPY_FILES[@]}"; do
     if [ -f "$file" ]; then
       cp "$file" "$WORKTREE_PATH/$file"
     fi
   done
   ```

4. **Create spec directory structure** (if doesn't exist):
   ```bash
   mkdir -p "$WORKTREE_PATH/.dev/specs/${NAME}"
   ```

**Example**:
```
User: /worktree create user-auth

Output:
✅ Worktree created: ../oh-my-claude-code.user-auth
   Branch: feat/user-auth
   Files copied: .dev/config.yml, .env.local
   Spec directory: .dev/specs/user-auth/
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

1. **Verify tmux installation**:
   ```bash
   if ! command -v tmux &> /dev/null; then
     echo "tmux가 필요합니다. 'brew install tmux'로 설치하세요."
     exit 1
   fi
   ```

2. **Resolve worktree path** (from `base_dir` template):
   ```bash
   REPO_NAME=$(basename $(git rev-parse --show-toplevel))
   WORKTREE_PATH=$(echo "$BASE_DIR" | sed "s/{repo}/$REPO_NAME/g; s/{name}/$NAME/g")

   if [ ! -d "$WORKTREE_PATH" ]; then
     echo "워크트리 '{name}'가 존재하지 않습니다."
     exit 1
   fi
   ```

3. **Check/create tmux session**:
   ```bash
   if ! tmux has-session -t wt 2>/dev/null; then
     # Create new session 'wt' with window named '<name>'
     tmux new-session -d -s wt -n "$NAME"
   else
     # Add new window to existing session
     tmux new-window -t wt -n "$NAME"
   fi
   ```

4. **Spawn agent**:
   - **Interactive mode** (default):
     ```bash
     tmux send-keys -t wt:"$NAME" "cd $WORKTREE_PATH && claude" Enter
     ```

   - **Headless mode** (`--headless` flag):
     ```bash
     # Write prompt to temp file to avoid shell injection (quotes, backticks, etc.)
     PROMPT_FILE="/tmp/wt-prompt-${NAME}"
     cat > "$PROMPT_FILE" << 'PROMPT_EOF'
     ${PROMPT}
     PROMPT_EOF
     tmux send-keys -t wt:"$NAME" "cd $WORKTREE_PATH && claude -p \"\$(cat $PROMPT_FILE)\"" Enter
     ```

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

1. **Get all worktrees**:
   ```bash
   git worktree list --porcelain
   ```

2. **Get tmux window status** (if session exists):
   ```bash
   if tmux has-session -t wt 2>/dev/null; then
     tmux list-windows -t wt -F "#{window_name} #{pane_current_command}"
   fi
   ```

3. **For each worktree**, collect:
   - **PLAN progress**: Count checked/unchecked TODOs in `.dev/specs/{name}/PLAN.md`
     ```bash
     TOTAL=$(grep -c "^### \[.\] TODO" "$WORKTREE_PATH/.dev/specs/$NAME/PLAN.md" 2>/dev/null || echo "0")
     DONE=$(grep -c "^### \[x\] TODO" "$WORKTREE_PATH/.dev/specs/$NAME/PLAN.md" 2>/dev/null || echo "0")
     ```

   - **Changes count**:
     ```bash
     CHANGES=$(git -C "$WORKTREE_PATH" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
     ```

   - **Agent status**: Match tmux window name with worktree name

   - **Drift from main** (commits behind):
     ```bash
     BEHIND=$(git -C "$WORKTREE_PATH" rev-list --count HEAD..main 2>/dev/null || echo "0")
     ```

   - **PR status** (if `gh` CLI available):
     ```bash
     PR_STATE=$(gh pr list --head "feat/${NAME}" --json state --jq '.[0].state' 2>/dev/null || echo "-")
     # Values: OPEN, MERGED, CLOSED, DRAFT, or - (no PR)
     ```

4. **Output table**: See `${baseDir}/references/status-table.md` for table format and data collection commands.

   Additional columns beyond base table:
   - **Behind**: commits behind main (`0` = up-to-date, `5` = 5 commits behind)
   - **PR**: PR status (`-` | `draft` | `open` | `merged`)

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

1. **Verify tmux session/window exists**:
   ```bash
   if ! tmux has-session -t wt 2>/dev/null; then
     echo "tmux 세션 'wt'가 없습니다."
     exit 1
   fi

   if ! tmux list-windows -t wt -F "#{window_name}" | grep -q "^${NAME}$"; then
     echo "tmux 윈도우 '{name}'가 없습니다."
     exit 1
   fi
   ```

2. **Attach or select window**:
   ```bash
   # If already in tmux, select window
   if [ -n "$TMUX" ]; then
     tmux select-window -t wt:"$NAME"
   else
     # If not in tmux, attach and select window
     tmux attach-session -t wt \; select-window -t "$NAME"
   fi
   ```

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

**1. If `<name>` provided**:
   - Cleanup that specific worktree

**2. If `<name>` NOT provided**:
   - Query completed worktrees (PLAN 100% done OR no uncommitted changes)
   - Use `AskUserQuestion` to let user select which to cleanup

   ```bash
   # Find completed worktrees
   for worktree in $(git worktree list --porcelain | grep "^worktree" | cut -d' ' -f2); do
     # Check if PLAN complete or no changes
     # Present list to user
   done
   ```

**3. Cleanup flow** (for selected worktree):

   a. **Check for uncommitted changes**:
      ```bash
      CHANGES=$(git -C "$WORKTREE_PATH" status --porcelain | wc -l | tr -d ' ')
      if [ "$CHANGES" -gt 0 ]; then
        echo "⚠️  워크트리에 커밋되지 않은 변경사항이 ${CHANGES}개 있습니다."
        # Use AskUserQuestion: "정말 삭제하시겠습니까? 변경사항이 손실됩니다."
      fi
      ```

   b. **Kill tmux window** (if exists):
      ```bash
      if tmux has-session -t wt 2>/dev/null; then
        if tmux list-windows -t wt -F "#{window_name}" | grep -q "^${NAME}$"; then
          tmux kill-window -t wt:"$NAME"
        fi
      fi
      ```

   c. **Remove worktree**:
      ```bash
      git worktree remove "$WORKTREE_PATH"
      ```

   d. **Ask about branch deletion**:
      ```bash
      # Use AskUserQuestion: "브랜치 'feat/{name}'도 삭제하시겠습니까?"
      if user_confirms; then
        git branch -D "feat/${NAME}"
      fi
      ```

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

1. **Worktree naming convention**: `{repo-name}.{feature-name}`
   - Example: `oh-my-claude-code.user-auth`

2. **Branch naming convention**: `feat/{feature-name}`
   - Example: `feat/user-auth`

3. **Spec location**: `.dev/specs/{feature-name}/PLAN.md`
   - Same name as worktree feature name

4. **tmux session structure**:
   - Session name: `wt` (fixed)
   - Window names: feature names (e.g., `user-auth`, `payment`)
   - One agent per window

5. **Native git worktree** - do NOT use `wt` CLI:
   - Create: `git worktree add <path> -b <branch>`
   - List: `git worktree list`
   - Remove: `git worktree remove <path>`

6. **Config file handling**:
   - Read `.dev/config.yml` if exists
   - Use defaults if not: `base_dir: "../{repo}.{name}"`, `copy_files: []`
   - Do NOT create config file if it doesn't exist

7. **Cleanup merged worktrees**:
   - `cleanup` checks PR status via `gh pr list --head feat/{name}`
   - If PR is merged, skip uncommitted changes warning (branch is already integrated)
   - If PR is not merged and has changes, warn before deleting
