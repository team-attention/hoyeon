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
