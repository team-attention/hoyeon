# Project Guidelines

## Experimentation

Use `.playground/` directory for experiments and testing. This directory is git-ignored.

## Agent Development

### validation_prompt

To automatically validate agent output, add a `validation_prompt` field to the frontmatter.

```yaml
---
name: my-agent
description: My custom agent
validation_prompt: |
  Must contain X, Y, Z sections.
  Output should be in JSON format.
---
```

**How it works:**
1. `SubagentStop` hook detects agent termination
2. Parses `validation_prompt` from `.claude/agents/{agent_type}.md`
3. Extracts the agent's last output
4. Verifies criteria compliance using `claude -p --model haiku`
5. Blocks agent for rework if criteria not met

**Validation results:**
```
✅ reviewer validation passed
⚠️ worker validation failed: Missing verification section
```

### Example: validation_prompt for each Agent

| Agent | Validation Criteria |
|-------|---------------------|
| reviewer | OKAY/REJECT verdict + justification |
| gap-analyzer | 4 sections (Missing Req, AI Pitfalls, Must NOT, Questions) |
| worker | JSON output (outputs, verification, learnings) |
| git-master | STYLE DETECTION + COMMIT PLAN + COMMIT SUMMARY |
| librarian | Research Report (Summary, Findings, Sources, Recommendations) |

### Implementation Files

- `.claude/scripts/dev-subagent-start.sh` - tracks agent start
- `.claude/scripts/dev-subagent-stop.sh` - runs integrated validation
- `.claude/settings.local.json` - registers SubagentStart/SubagentStop hooks
