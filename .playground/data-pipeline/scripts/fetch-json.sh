#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Define paths relative to script directory
DATA_FILE="$SCRIPT_DIR/../data/sample.json"
OUTPUT_FILE="$SCRIPT_DIR/../output/json-result.json"

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Read JSON, aggregate by status, and create final output
jq '
  # Group by status and aggregate
  group_by(.status) |
  map({
    status: .[0].status,
    count: length,
    total_budget: map(.budget) | add
  }) as $by_status |

  # Calculate totals
  {
    by_status: $by_status,
    total_projects: ($by_status | map(.count) | add),
    total_budget: ($by_status | map(.total_budget) | add)
  }
' "$DATA_FILE" > "$OUTPUT_FILE"

echo "JSON aggregation complete. Output saved to: $OUTPUT_FILE"
