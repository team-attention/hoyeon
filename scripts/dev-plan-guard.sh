#!/bin/bash
# dev-plan-guard.sh - PreToolUse[Edit|Write] hook for /dev.specify skill
#
# Purpose: Block file modifications outside .dev/ directory during planning
# Activation (dual-source):
#   Primary:  .dev/active-spec → .dev/specs/{name}/session.ref → .dev/.sessions/{sessionId}/state.json
#             (2-hop resolution for session-based state)
#             Fallback: .dev/specs/{name}/state.json (legacy path when no session.ref)
#   Fallback: .dev/state.local.json session-based check (backward compat)
#
# Hook Input Fields (PreToolUse):
#   - tool_name: string (Edit, Write, etc.)
#   - tool_input: object (file_path, content, etc.)
#   - session_id: current session
#   - cwd: string (current working directory)

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields
CWD=$(echo "$INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

SPECIFY_ACTIVE=false

# ── Primary source: .dev/active-spec → state.json (2-hop via session.ref) ──
ACTIVE_SPEC_FILE="$CWD/.dev/active-spec"
if [[ -f "$ACTIVE_SPEC_FILE" ]]; then
  SPEC_NAME=$(cat "$ACTIVE_SPEC_FILE")
  SESSION_REF="$CWD/.dev/specs/$SPEC_NAME/session.ref"
  if [[ -f "$SESSION_REF" ]]; then
    # 2-hop: read sessionId from session.ref → resolve state.json in session dir
    SESSION_ID_REF=$(cat "$SESSION_REF" | tr -d '[:space:]')
    if [[ -n "$SESSION_ID_REF" ]]; then
      STATE_FILE="$CWD/.dev/.sessions/$SESSION_ID_REF/state.json"
    else
      STATE_FILE=""
    fi
  else
    # Legacy fallback: state.json in spec dir
    STATE_FILE="$CWD/.dev/specs/$SPEC_NAME/state.json"
  fi
  if [[ -n "$STATE_FILE" ]] && [[ -f "$STATE_FILE" ]]; then
    SKILL=$(jq -r '.skill // "none"' "$STATE_FILE" 2>/dev/null || echo "none")
    if [[ "$SKILL" == "specify" ]]; then
      SPECIFY_ACTIVE=true
    fi
  fi
fi

# ── Fallback source: state.local.json session check ─────────────────────────
if [[ "$SPECIFY_ACTIVE" == "false" ]]; then
  LOCAL_STATE_FILE="$CWD/.dev/state.local.json"
  if [[ -f "$LOCAL_STATE_FILE" ]]; then
    SESSION_DATA=$(jq -r --arg sid "$SESSION_ID" '.[$sid] // empty' "$LOCAL_STATE_FILE")
    if [[ -n "$SESSION_DATA" ]] && [[ "$SESSION_DATA" != "null" ]]; then
      HAS_EXECUTE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute // empty' "$LOCAL_STATE_FILE")
      if [[ -z "$HAS_EXECUTE" ]] || [[ "$HAS_EXECUTE" == "null" ]]; then
        # Session exists without execute field → specify mode
        SPECIFY_ACTIVE=true
      fi
    fi
  fi
fi

# ── Guard decision ───────────────────────────────────────────────────────────
if [[ "$SPECIFY_ACTIVE" == "false" ]]; then
  # Neither source confirms specify mode - allow all operations
  exit 0
fi

# Specify mode active - enforce path restrictions
if [[ "$FILE_PATH" == *".dev/"* ]]; then
  # Allow modifications inside .dev/ (drafts/, specs/, .sessions/, etc.)
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
EOF
else
  # Block modifications outside .dev/
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny"
  },
  "systemMessage": "PLAN MODE: Code modification not allowed! During /dev.specify phase, you cannot write implementation code. Allowed paths: .dev/specs/. Implementation should be delegated after plan approval."
}
EOF
fi
