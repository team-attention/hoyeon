#!/usr/bin/env bash
# fetch-api.sh - Mock API fetch script for pipeline demonstration
#
# Purpose: Simulates fetching server status data from an API endpoint
# Output: output/api-result.json

set -euo pipefail

# Get script directory for relative path operations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure output directory exists
mkdir -p "$PROJECT_ROOT/output"

# Simulate network delay
sleep 1

# Generate mock API response with server status data
cat > "$PROJECT_ROOT/output/api-result.json" << 'JSON_EOF'
{
  "status": "success",
  "timestamp": "2024-01-28T10:30:00Z",
  "data": {
    "hostname": "api-server-01.example.com",
    "uptime": "15 days, 3 hours, 42 minutes",
    "uptime_seconds": 1321320,
    "cpu_usage": 45.3,
    "memory_usage": 68.7,
    "memory_total_mb": 16384,
    "memory_used_mb": 11256,
    "disk_usage": 72.1,
    "disk_total_gb": 500,
    "disk_used_gb": 360,
    "network": {
      "interface": "eth0",
      "rx_bytes": 1048576000,
      "tx_bytes": 524288000,
      "errors": 0
    },
    "services": [
      {
        "name": "nginx",
        "status": "running",
        "uptime": "15 days"
      },
      {
        "name": "postgresql",
        "status": "running",
        "uptime": "15 days"
      },
      {
        "name": "redis",
        "status": "running",
        "uptime": "15 days"
      }
    ],
    "load_average": [1.24, 1.18, 1.09],
    "active_connections": 142
  }
}
JSON_EOF

echo "✓ API data fetched successfully: $PROJECT_ROOT/output/api-result.json"
