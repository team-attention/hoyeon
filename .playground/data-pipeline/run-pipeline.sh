#!/usr/bin/env bash
set -euo pipefail

# Determine script directory for relative path resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"

echo "=== Data Pipeline Execution ==="
echo "Pipeline root: $SCRIPT_DIR"
echo

# Initialize output directory (clean existing results)
echo "Initializing output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
echo "Output directory cleaned: $OUTPUT_DIR"
echo

# Run fetch scripts in parallel
echo "Starting parallel data fetch..."
"$SCRIPTS_DIR/fetch-csv.sh" &
"$SCRIPTS_DIR/fetch-json.sh" &
"$SCRIPTS_DIR/fetch-api.sh" &

# Wait for all background jobs to complete
echo "Waiting for all fetch operations to complete..."
wait
echo "All fetch operations completed successfully"
echo

# Merge results
echo "Merging results..."
"$SCRIPTS_DIR/merge-report.sh"
echo

# Output final result path
REPORT_PATH="$OUTPUT_DIR/report.json"
if [[ -f "$REPORT_PATH" ]]; then
    echo "=== Pipeline Complete ==="
    echo "Final report: $REPORT_PATH"
    echo
    echo "Summary:"
    jq -r '.summary | "- Generated at: \(.generated_at)\n- CSV result: \(.csv_result_available)\n- JSON result: \(.json_result_available)\n- API result: \(.api_result_available)"' "$REPORT_PATH"
else
    echo "ERROR: Final report not generated at $REPORT_PATH" >&2
    exit 1
fi
