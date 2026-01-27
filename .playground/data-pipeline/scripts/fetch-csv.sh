#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Define paths relative to script location
DATA_DIR="${SCRIPT_DIR}/../data"
OUTPUT_DIR="${SCRIPT_DIR}/../output"
CSV_FILE="${DATA_DIR}/sample.csv"
OUTPUT_FILE="${OUTPUT_DIR}/csv-result.json"

# Ensure output directory exists
mkdir -p "${OUTPUT_DIR}"

# Process CSV and calculate average score per department
# Skip header line, then use awk to sum scores and count entries per department
awk -F',' '
BEGIN {
    # Skip header
}
NR > 1 {
    # $3 is department, $4 is score
    dept = $3
    score = $4
    sum[dept] += score
    count[dept]++
}
END {
    # Output JSON format
    printf "{\n"
    first = 1
    for (dept in sum) {
        if (!first) printf ",\n"
        avg = sum[dept] / count[dept]
        printf "  \"%s\": %.2f", dept, avg
        first = 0
    }
    printf "\n}\n"
}
' "${CSV_FILE}" > "${OUTPUT_FILE}"

echo "CSV processing complete. Results saved to ${OUTPUT_FILE}"
