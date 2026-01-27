#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data"
OUTPUT_DIR="$SCRIPT_DIR/../output"

# Process CSV and calculate average score per department
awk -F',' '
BEGIN {
    print "{"
    print "  \"departments\": ["
}
NR > 1 {
    dept = $3
    score = $4
    total[dept] += score
    count[dept]++
}
END {
    first = 1
    for (dept in total) {
        avg = total[dept] / count[dept]
        if (!first) print ","
        printf "    {\"name\": \"%s\", \"avg_score\": %.1f, \"count\": %d}", dept, avg, count[dept]
        first = 0
    }
    print ""
    print "  ]"
    print "}"
}' "$DATA_DIR/sample.csv" > "$OUTPUT_DIR/csv-result.json"
