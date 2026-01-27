#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/../output"

# Ensure output directory exists
mkdir -p "${OUTPUT_DIR}"

# Simulate network delay
sleep 1

# Generate mock API response
cat > "${OUTPUT_DIR}/api-result.json" <<'EOF'
{
  "status": "ok",
  "timestamp": "2026-01-28T00:00:00Z",
  "server": {
    "hostname": "api-server-01",
    "uptime": "15d 6h 32m",
    "cpu_usage": 42.5,
    "memory_usage": 68.3,
    "disk_usage": 55.7,
    "load_average": [1.2, 1.5, 1.8],
    "active_connections": 147
  },
  "metrics": {
    "requests_per_second": 523,
    "avg_response_time_ms": 125,
    "error_rate": 0.02
  }
}
EOF

echo "API data fetched successfully to ${OUTPUT_DIR}/api-result.json"
