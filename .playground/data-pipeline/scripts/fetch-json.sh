#!/usr/bin/env bash
# fetch-json.sh - JSON data aggregation script
#
# Purpose: Read sample.json and aggregate projects by status
# Outputs: json-result.json with status counts and total budgets

set -euo pipefail

# Get script directory for relative path resolution
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Input and output paths
INPUT_FILE="$PROJECT_ROOT/data/sample.json"
OUTPUT_DIR="$PROJECT_ROOT/output"
OUTPUT_FILE="$OUTPUT_DIR/json-result.json"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Check if input file exists
if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed" >&2
  exit 1
fi

# Aggregate data by status using jq
jq -n --slurpfile data "$INPUT_FILE" '
  $data[0] | group_by(.status) | map({
    status: .[0].status,
    project_count: length,
    total_budget: map(.budget) | add
  }) | {
    summary: .,
    timestamp: now | strftime("%Y-%m-%d %H:%M:%S")
  }
' > "$OUTPUT_FILE"

echo "JSON aggregation complete: $OUTPUT_FILE"
