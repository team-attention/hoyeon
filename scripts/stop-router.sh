#!/bin/bash
# Stop Router - delegates to dev-cli stop-evaluate
# Thin wrapper: pass session_id and cwd, output its decision

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    exit 0
fi

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
if [ -z "$cwd" ]; then
    cwd="$(pwd)"
fi

result=$(node dev-cli/bin/dev-cli.js stop-evaluate --session "$session_id" --cwd "$cwd" 2>/dev/null)
exit_code=$?

if [ $exit_code -ne 0 ]; then
    printf '{"decision":"allow"}'
    exit 0
fi

printf '%s' "$result"
