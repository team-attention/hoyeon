#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"

# Check existence of required input files
CSV_RESULT="$OUTPUT_DIR/csv-result.json"
JSON_RESULT="$OUTPUT_DIR/json-result.json"
API_RESULT="$OUTPUT_DIR/api-result.json"

if [[ ! -f "$CSV_RESULT" ]]; then
  echo "Error: $CSV_RESULT not found" >&2
  exit 1
fi

if [[ ! -f "$JSON_RESULT" ]]; then
  echo "Error: $JSON_RESULT not found" >&2
  exit 1
fi

if [[ ! -f "$API_RESULT" ]]; then
  echo "Error: $API_RESULT not found" >&2
  exit 1
fi

# Merge results using jq
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --slurpfile csv "$CSV_RESULT" \
  --slurpfile json "$JSON_RESULT" \
  --slurpfile api "$API_RESULT" \
  --arg timestamp "$TIMESTAMP" \
  '{
    csv_summary: $csv[0],
    json_summary: $json[0],
    api_summary: $api[0],
    generated_at: $timestamp
  }' > "$OUTPUT_DIR/report.json"

echo "Report generated: $OUTPUT_DIR/report.json"
