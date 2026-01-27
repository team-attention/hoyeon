#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Simulate network delay
sleep 1

# Generate mock API response
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${SCRIPT_DIR}/../output/api-result.json" <<EOF
{
  "server_status": {
    "hostname": "mock-server-01.example.com",
    "uptime_hours": 168,
    "cpu_usage_pct": 42,
    "memory_usage_pct": 65,
    "disk_usage_pct": 38,
    "active_connections": 127
  },
  "fetched_at": "${TIMESTAMP}"
}
EOF
