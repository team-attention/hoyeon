#!/usr/bin/env bash
set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"

echo "=== Data Pipeline Execution ==="
echo

# Step 1: Clean output directory
echo "Cleaning output directory..."
rm -rf "${OUTPUT_DIR}"/*
echo "✓ Output directory cleaned"
echo

# Step 2: Run fetch scripts in parallel
echo "Running fetch scripts in parallel..."
"${SCRIPT_DIR}/scripts/fetch-csv.sh" &
"${SCRIPT_DIR}/scripts/fetch-json.sh" &
"${SCRIPT_DIR}/scripts/fetch-api.sh" &

# Wait for all background processes to complete
wait

echo "✓ All fetch scripts completed"
echo

# Step 3: Merge results
echo "Merging results..."
"${SCRIPT_DIR}/scripts/merge-report.sh"
echo "✓ Results merged"
echo

# Step 4: Print final result path
REPORT_PATH="${OUTPUT_DIR}/report.json"
echo "=== Pipeline Complete ==="
echo "Final report: ${REPORT_PATH}"
