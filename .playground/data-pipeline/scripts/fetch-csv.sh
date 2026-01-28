#!/usr/bin/env bash
set -euo pipefail

# Determine script directory for relative path resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Input and output paths
CSV_FILE="$PROJECT_ROOT/data/sample.csv"
OUTPUT_FILE="$PROJECT_ROOT/output/csv-result.json"

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Process CSV and calculate average scores per department
# Skip header (NR > 1), then use associative arrays to sum scores and count entries
awk -F',' 'NR > 1 {
    dept = $3
    score = $4
    sum[dept] += score
    count[dept]++
}
END {
    printf "{\n"
    printf "  \"department_averages\": {\n"
    first = 1
    for (dept in sum) {
        if (!first) printf ",\n"
        avg = sum[dept] / count[dept]
        printf "    \"%s\": %.2f", dept, avg
        first = 0
    }
    printf "\n  }\n"
    printf "}\n"
}' "$CSV_FILE" > "$OUTPUT_FILE"

echo "CSV processing complete. Results saved to: $OUTPUT_FILE"
