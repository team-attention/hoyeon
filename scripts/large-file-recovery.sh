#!/bin/bash
# PostToolUseFailure hook: detect Read failures on large files and suggest alternatives
# Registered for: Read matcher under PostToolUseFailure
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

if [[ "$TOOL_NAME" != "Read" ]]; then
  exit 0
fi

ERROR=$(echo "$INPUT" | jq -r '.error // empty')
if [[ -z "$ERROR" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
GUIDANCE=""

if echo "$ERROR" | grep -qi "too large\|too big\|size limit\|exceeds.*limit\|maximum.*size\|file is too long\|content too large"; then
  GUIDANCE="LARGE FILE RECOVERY: '${FILE_PATH}' is too large to read directly. Spawn a code-explorer subagent to handle it — it has built-in large file handling (chunked reads, size guards, context budget).
Example: Agent(subagent_type=\"code-explorer\", prompt=\"Analyze ${FILE_PATH}: [your question]\")"

elif echo "$ERROR" | grep -qi "binary\|not a text\|encoding"; then
  GUIDANCE="BINARY FILE: '${FILE_PATH}' appears to be a binary file. Use Bash(file \"${FILE_PATH}\") to check the file type, or Bash(xxd \"${FILE_PATH}\" | head) for hex dump."
fi

if [[ -n "$GUIDANCE" ]]; then
  jq -n --arg ctx "$GUIDANCE" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: $ctx
    }
  }'
fi
