#!/bin/bash
# PostToolUseFailure hook: detect Edit/Write failures and inject recovery guidance
# Registered for: Edit|Write matcher under PostToolUseFailure
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Only handle Edit and Write failures
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

ERROR=$(echo "$INPUT" | jq -r '.error // empty')
if [[ -z "$ERROR" ]]; then
  exit 0
fi

# Pattern-based recovery guidance
GUIDANCE=""

if echo "$ERROR" | grep -qi "old_string.*not found\|oldString.*not found\|not found in file\|does not contain"; then
  GUIDANCE="EDIT RECOVERY: The old_string was not found in the file. This usually means the file content has changed since you last read it, or there is a whitespace/indentation mismatch. REQUIRED: Use the Read tool to re-read the file NOW, then retry with the exact string from the current file content. Pay close attention to indentation (tabs vs spaces) and line endings."

elif echo "$ERROR" | grep -qi "found multiple\|multiple matches\|not unique\|ambiguous"; then
  GUIDANCE="EDIT RECOVERY: The old_string matched multiple locations in the file. REQUIRED: Include more surrounding context lines in old_string to make it unique — at least 2-3 lines above and below the target change. Alternatively, use the replace_all parameter if you intend to change all occurrences."

elif echo "$ERROR" | grep -qi "old_string and new_string.*same\|must be different\|identical"; then
  GUIDANCE="EDIT RECOVERY: old_string and new_string are identical — no change would be made. Verify that your new_string actually differs from old_string before retrying."

elif echo "$ERROR" | grep -qi "file.*not found\|no such file\|ENOENT"; then
  GUIDANCE="EDIT RECOVERY: The target file does not exist. Use Glob or Bash(ls) to verify the correct file path before retrying."

elif echo "$ERROR" | grep -qi "permission\|EACCES\|read.only"; then
  GUIDANCE="EDIT RECOVERY: Permission denied. The file may be read-only or in a protected directory. Check file permissions with Bash(ls -la)."
fi

if [[ -n "$GUIDANCE" ]]; then
  jq -n --arg ctx "$GUIDANCE" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: $ctx
    }
  }'
fi
