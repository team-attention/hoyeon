#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"

# Check that all required input files exist
CSV_FILE="$OUTPUT_DIR/csv-result.json"
JSON_FILE="$OUTPUT_DIR/json-result.json"
API_FILE="$OUTPUT_DIR/api-result.json"

if [ ! -f "$CSV_FILE" ]; then
  echo "Error: $CSV_FILE not found" >&2
  exit 1
fi

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: $JSON_FILE not found" >&2
  exit 1
fi

if [ ! -f "$API_FILE" ]; then
  echo "Error: $API_FILE not found" >&2
  exit 1
fi

# Generate timestamp in ISO 8601 format
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Merge all 3 JSON files into one report
jq -n \
  --slurpfile csv "$CSV_FILE" \
  --slurpfile json "$JSON_FILE" \
  --slurpfile api "$API_FILE" \
  --arg timestamp "$TIMESTAMP" \
  '{
    csv_summary: $csv[0],
    json_summary: $json[0],
    api_summary: $api[0],
    generated_at: $timestamp
  }' > "$OUTPUT_DIR/report.json"

echo "Report generated: $OUTPUT_DIR/report.json"
