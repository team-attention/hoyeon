---
name: specify
description: |
  This skill should be used when the user says "/specify", "plan this", or "make a plan".
  Interview-driven planning workflow with mode support (quick/standard × interactive/autopilot).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - AskUserQuestion
---
# /specify - CLI-Orchestrated Planning
## Rules
- Subagents: Write full results to designated file path. Return only 1-2 line summary.
- Subagent output format: Markdown with YAML frontmatter (agent, timestamp, summary).
## Flow
1. `node dev-cli/bin/dev-cli.js init {name} [--quick] [--autopilot]`
2. Loop: call `node dev-cli/bin/dev-cli.js next {name}` → follow the returned instruction
3. Until CLI returns `{ "done": true }`
## On Context Compaction
Call `node dev-cli/bin/dev-cli.js manifest {name}` to recover full state.
