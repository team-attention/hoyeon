---
name: test-basedir
description: |
  Test skill to verify ${baseDir} resolution and TESTING.md accessibility.
  Use: "/test-basedir" or "test basedir"
allowed-tools:
  - Read
  - Bash
  - Task
---

# Test: ${baseDir} Resolution

This skill verifies that `${baseDir}` resolves correctly and plugin files are accessible from subagents.

## Step 1: Report ${baseDir} value

Print the following information:

```
=== baseDir Resolution Test ===
baseDir value: ${baseDir}
TESTING.md path: ${baseDir}/../../../TESTING.md
```

## Step 2: Read TESTING.md from this context

Read the file at `${baseDir}/../../../TESTING.md` and report:
- Whether the file exists and is readable
- The first 5 lines of content

## Step 3: Spawn subagent and test from there

Launch a subagent to verify the path is accessible:

```
Task(subagent_type="Explore",
     prompt="""
Read the file at this exact path: ${baseDir}/../../../TESTING.md

Report:
1. Whether you can read it
2. The first 3 lines of content
3. The total number of lines

If you cannot read it, try echo $CLAUDE_PLUGIN_ROOT in Bash and report the result.
""")
```

## Step 4: Report results

Print a summary:

```
=== Test Results ===
1. baseDir resolved to: [path]
2. TESTING.md readable from skill context: YES/NO
3. TESTING.md readable from subagent: YES/NO
4. CLAUDE_PLUGIN_ROOT in subagent Bash: [value or empty]
```
