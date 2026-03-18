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
  GUIDANCE="LARGE FILE RECOVERY: The file '${FILE_PATH}' is too large to read at once. Choose one of these strategies:

1. CHUNKED READ (preferred for code files):
   Use Read with offset and limit parameters to read in chunks.
   Example: Read(file_path=\"${FILE_PATH}\", offset=1, limit=500) then Read(..., offset=501, limit=500)

2. AGENT DELEGATION (preferred for analysis/search tasks):
   Spawn a subagent to handle the large file — it gets its own context window.
   Example: Agent(subagent_type=\"code-explorer\", prompt=\"Read and analyze ${FILE_PATH}: [your question]\")

3. TARGETED SEARCH (preferred when looking for specific content):
   Use Grep to find the relevant section first, then Read only that range.
   Example: Grep(pattern=\"your_keyword\", path=\"${FILE_PATH}\") → then Read with offset/limit around the match."

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
