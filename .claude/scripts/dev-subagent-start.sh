#!/bin/bash
# dev-subagent-start.sh - SubagentStart hook for dev workflow agents
#
# Purpose: Track dev agent invocations (reviewer, gap-analyzer, worker, git-master, librarian)
# Stores agent_id -> agent_type mapping in .dev/state.local.json
#
# Hook Input Fields (SubagentStart):
#   - agent_id: subagent unique ID
#   - agent_type: subagent type (e.g., "reviewer", "worker", "Explore")
#   - session_id: current session
#   - cwd: current working directory

set -euo pipefail

INPUT=$(cat)

# Extract fields
CWD=$(echo "$INPUT" | jq -r '.cwd')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

# Dev workflow agents to track
DEV_AGENTS=("reviewer" "gap-analyzer" "worker" "git-master" "librarian")

# Check if this is a dev workflow agent
IS_DEV_AGENT=false
for agent in "${DEV_AGENTS[@]}"; do
  if [[ "$AGENT_TYPE" == "$agent" ]]; then
    IS_DEV_AGENT=true
    break
  fi
done

if [[ "$IS_DEV_AGENT" != "true" ]]; then
  # Not a dev agent - no tracking needed
  exit 0
fi

# State file path
STATE_FILE="$CWD/.dev/state.local.json"

# Ensure .dev directory exists
mkdir -p "$CWD/.dev"

# Initialize state file if not exists
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

# Add agent to session's agents map (atomic write with temp file)
TEMP_FILE="${STATE_FILE}.tmp.$$"

jq --arg sid "$SESSION_ID" \
   --arg aid "$AGENT_ID" \
   --arg atype "$AGENT_TYPE" \
   '
   # Ensure session exists with agents object
   if .[$sid] then
     .[$sid].agents[$aid] = $atype
   else
     # Session not found - create minimal entry
     .[$sid] = {
       "created_at": (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
       "agents": {($aid): $atype}
     }
   end
   ' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "📋 Dev agent started: $AGENT_TYPE ($AGENT_ID)" >&2

exit 0
