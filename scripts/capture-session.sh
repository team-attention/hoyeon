#!/bin/bash
# UserPromptSubmit hook: capture Claude Code session ID to a known file
# git-master agent reads /tmp/claude-session-id for commit trailers

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -n "$SESSION_ID" ]; then
  echo "$SESSION_ID" > /tmp/claude-session-id
fi
