## TODO 1
- Used bash heredoc pattern for creating new data files
- Created directory structure using mkdir -p to ensure parent directories exist

## TODO 2
- awk is effective for CSV processing without external dependencies (csvkit forbidden)
- JSON formatting in awk requires careful printf with proper comma placement and newline handling
- SCRIPT_DIR pattern allows scripts to find files relative to their location regardless of where the script is called from
- mkdir -p for output directory ensures parent directories exist before writing output

## TODO 3
- Used bash heredoc with cat for creating new script files (consistent with project pattern)
- jq --slurpfile reads JSON file and makes it available as variable for processing
- group_by() in jq groups array elements by a field, enabling per-status aggregation

## TODO 4
- Mock API response includes comprehensive server status metrics: hostname, uptime, CPU, memory, disk, network, services, and load average
- Used nested heredoc (cat > file << 'EOF' with JSON_EOF inside) to avoid variable interpolation in JSON content
- Script uses SCRIPT_DIR and PROJECT_ROOT variables for path resolution to work from any working directory

## TODO 5
- jq -n with --slurpfile allows merging multiple JSON files into a single object structure
- Using SCRIPT_DIR pattern with $SCRIPT_DIR/../output provides robust path resolution across different execution contexts
- Explicit file existence checks before processing prevent unclear errors from jq
- date -u +"%Y-%m-%dT%H:%M:%SZ" generates ISO 8601 UTC timestamp for report metadata

## TODO 6
- Parallel script execution in bash uses & to background jobs and wait to synchronize completion
- rm -rf on output directory before mkdir -p ensures clean state for each pipeline run
- SCRIPT_DIR pattern enables path resolution for both scripts/ and output/ directories relative to pipeline root
- Progress echo statements between stages make pipeline execution progress transparent to users
- Backgrounded jobs inherit the parent script's set -euo pipefail, so errors in parallel tasks will still fail the pipeline

## TODO Final
- All 5 script files exist and are executable
- Pipeline successfully executes in parallel (fetch-csv, fetch-json, fetch-api) then merges results
- Output JSON structure contains csv_summary, json_summary, api_summary, and generated_at fields
- Department averages calculated from CSV: Engineering (91.67), Marketing (88.00), HR (84.00), Sales (82.67)
- JSON aggregation produces project counts by status: completed (1), in_progress (3), planned (1)
- API mock data includes comprehensive server metrics without actual network calls
