#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Clean output directory
rm -f "${SCRIPT_DIR}/output"/*.json

# Run fetch scripts in parallel
"${SCRIPT_DIR}/scripts/fetch-csv.sh" &
"${SCRIPT_DIR}/scripts/fetch-json.sh" &
"${SCRIPT_DIR}/scripts/fetch-api.sh" &
wait

# Merge results
"${SCRIPT_DIR}/scripts/merge-report.sh"

# Print final result
echo "Pipeline complete: ${SCRIPT_DIR}/output/report.json"
