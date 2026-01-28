## TODO 1
- Used bash cat with heredoc instead of Write tool since these are new files (Write tool requires reading existing files first)
- Created realistic sample data: 10 users across 4 departments, 5 projects with varying budgets and statuses

## TODO 2
- Used awk for CSV processing to avoid external dependencies (csvkit, python-csv forbidden per MUST NOT DO)
- Output format uses 'department_averages' wrapper object for clarity and future extensibility
- Scores formatted to 2 decimal places (%.2f) for readability
- Script echoes completion message to stdout while JSON output goes to file

## TODO 3
- Added timestamp field to output for tracking when aggregation was performed
- Included error handling for missing input file and missing jq command
- Used SCRIPT_DIR pattern for robust relative path resolution across different execution contexts

## TODO 4
- Included sleep 1 at the beginning to simulate network latency before generating response
- Used nested heredoc pattern to preserve literal JSON content without bash variable expansion
- Added mkdir -p for output directory to ensure it exists before writing results

## TODO 5
- Used jq --slurpfile for each input file to load JSON content as variables for merging
- Added generated_at timestamp using ISO 8601 UTC format for tracking report generation time
- Individual file existence checks provide clear error messages for each missing input
- Output directory path resolved relative to SCRIPT_DIR for location-independent execution

## TODO 6
- Added progress echo statements between each major stage for user feedback during execution
- Used rm -rf followed by mkdir -p to ensure output directory is clean on each run
- Added final report existence check before declaring success to catch merge-report.sh failures
- Included jq-based summary display in output for quick validation of pipeline results
