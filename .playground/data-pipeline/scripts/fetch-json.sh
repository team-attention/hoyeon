#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

INPUT_FILE="${PROJECT_ROOT}/data/sample.json"
OUTPUT_FILE="${PROJECT_ROOT}/output/json-result.json"

# Aggregate project count and total budget by status
jq 'group_by(.status) | map({
  status: .[0].status,
  project_count: length,
  total_budget: map(.budget) | add
}) | {results: .}' "${INPUT_FILE}" > "${OUTPUT_FILE}"
