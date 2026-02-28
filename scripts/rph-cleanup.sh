#!/bin/bash
# rph-cleanup.sh - SessionEnd hook for loop cleanup
# Delegates to dev-cli loop-complete and loop-gc

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    session_id="unknown"
fi

# Force-complete any active loop for this session
node dev-cli/bin/dev-cli.js loop-complete --session "$session_id" --force >/dev/null 2>&1 || true

# Garbage collect old loops (>1 hour)
node dev-cli/bin/dev-cli.js loop-gc --max-age 1 >/dev/null 2>&1 || true

exit 0
