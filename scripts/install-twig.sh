#!/usr/bin/env bash
set -euo pipefail

# install-twig.sh - Install twig CLI to user's PATH
#
# Usage:
#   ./scripts/install-twig.sh           # Install to ~/.local/bin/twig
#   ./scripts/install-twig.sh /usr/local/bin  # Install to custom location

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TWIG_SOURCE="$SCRIPT_DIR/twig"

# Default install location
INSTALL_DIR="${1:-$HOME/.local/bin}"
INSTALL_PATH="$INSTALL_DIR/twig"

# Check if twig source exists
if [ ! -f "$TWIG_SOURCE" ]; then
  echo "Error: twig script not found at $TWIG_SOURCE"
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
ln -s "$TWIG_SOURCE" "$INSTALL_PATH"
echo "Installed: $INSTALL_PATH -> $TWIG_SOURCE"

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
echo "Done! Try: twig help"
