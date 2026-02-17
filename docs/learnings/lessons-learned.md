# Lessons Learned

## Hook & Tool Behavior

### 1. AskUserQuestion cannot be blocked by PreToolUse

`AskUserQuestion` tool is not interceptable via `PreToolUse` hook. PreToolUse block/deny does not work for this tool.

### 2. Skill invocation via `/skill` loads a prompt, not a tool call

When a skill is invoked via `/skill-name` (slash command), it does **not** trigger a `Skill` tool call. Instead, it loads the skill's prompt directly into the conversation. This means `PreToolUse` hooks will not fire.

**Workaround:** To handle both programmatic skill calls (`Skill` tool) and slash command invocations, use `UserPromptSubmit` hook together with `PreToolUse` hook.

### 3. SubagentStop hook does not return agent_type

The `SubagentStop` hook event does not include `agent_type` in its payload. You cannot determine which agent type triggered the stop event from the hook alone.

**Workaround:** Manage separate state (e.g., a file-based flag) to track which agent is currently running, then read that state in the `SubagentStop` hook.

### 4. validate_prompt frontmatter key typo causes silent validation skip

The PostToolUse hook (`validate-output.sh`) parses `validate_prompt` from agent/skill frontmatter. If the key is misspelled (e.g., `validation_prompt`), the hook silently skips validation — no error, no warning. The agent appears to work fine but output quality is never checked.

**Discovery:** 7 agents had this typo for an extended period. Only caught when `code-reviewer` agent read its own config and flagged the mismatch.

**Prevention:** Always verify the exact key name matches what the hook parses. Consider adding a frontmatter linter.

### 5. Codex CLI `-p` flag is `--profile`, not prompt

`codex exec -p "..."` treats the string as a config profile name, not a prompt. This causes exit code 1 with "config profile not found". The prompt must be passed as a positional argument.

```bash
# WRONG — -p is --profile
codex exec -p "Analyze this code"

# CORRECT — positional argument
codex exec "Analyze this code"
```

**Note:** `codex exec review --base main` is a dedicated subcommand for code review with native git diff support.

### 6. Background Bash (`run_in_background`) doesn't inherit user PATH

Background Bash commands don't source the user's shell profile (`.zshrc`/`.bash_profile`). CLIs installed via pnpm, npm global, or Homebrew in non-standard paths won't be found — exit code 127.

**Solution:** Use foreground parallel execution instead. Multiple Bash tool calls in a single message run in parallel automatically in Claude Code, with full PATH inheritance.

```
# Foreground parallel — two Bash calls in one message (PATH works)
Bash call 1: codex exec "..."
Bash call 2: gemini -p "..."

# Background — avoid for user-installed CLIs
run_in_background: true  # PATH may be incomplete
```
