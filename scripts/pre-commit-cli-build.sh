#!/bin/bash
# Pre-commit hook: rebuild cli/dist/cli.js if cli/ source files changed

# Check if any staged files are in cli/src/ or cli/bin/
CHANGED=$(git diff --cached --name-only -- 'cli/src/' 'cli/bin/' 'cli/build.mjs' 'cli/package.json')

if [ -z "$CHANGED" ]; then
  exit 0
fi

echo "[pre-commit] cli/ source changed, rebuilding dist/cli.js..."

# Rebuild
(cd cli && node build.mjs) 2>&1
if [ $? -ne 0 ]; then
  echo "[pre-commit] ERROR: cli build failed. Fix build errors before committing."
  exit 1
fi

# Stage the rebuilt bundle
git add cli/dist/cli.js

echo "[pre-commit] dist/cli.js rebuilt and staged."
