#!/usr/bin/env bash
set -euo pipefail

# install-hy.sh - Install hy CLI to user's PATH
#
# Usage:
#   ./scripts/install-hy.sh           # Install to ~/.local/bin/hy
#   ./scripts/install-hy.sh /usr/local/bin  # Install to custom location

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HY_SOURCE="$SCRIPT_DIR/hy"

# Default install location
INSTALL_DIR="${1:-$HOME/.local/bin}"
INSTALL_PATH="$INSTALL_DIR/hy"

# Check if hy source exists
if [ ! -f "$HY_SOURCE" ]; then
  echo "Error: hy script not found at $HY_SOURCE"
  exit 1
fi

# Create install directory if needed
if [ ! -d "$INSTALL_DIR" ]; then
  echo "Creating directory: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
fi

# Remove existing symlink or file
if [ -L "$INSTALL_PATH" ] || [ -f "$INSTALL_PATH" ]; then
  echo "Removing existing: $INSTALL_PATH"
  rm "$INSTALL_PATH"
fi

# Create symlink
ln -s "$HY_SOURCE" "$INSTALL_PATH"
echo "Installed: $INSTALL_PATH -> $HY_SOURCE"

# Check if install dir is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo ""
  echo "Warning: $INSTALL_DIR is not in your PATH."
  echo ""
  echo "Add this to your ~/.zshrc or ~/.bashrc:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "Then run: source ~/.zshrc"
fi

echo ""
echo "Done! Try: hy help"
