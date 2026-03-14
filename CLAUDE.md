# Project Guidelines

## Experimentation

Use `.playground/` directory for experiments and testing. This directory is git-ignored.

## Agent/Skill Development

### validate_prompt

To automatically validate agent/skill output, add a `validate_prompt` field to the frontmatter.

**Agent example** (`.claude/agents/my-agent.md`):
```yaml
---
name: my-agent
description: My custom agent
validate_prompt: |
  Must contain X, Y, Z sections.
  Output should be in JSON format.
---
```

**Skill example** (`.claude/skills/my-skill/SKILL.md`):
```yaml
---
name: my-skill
description: My custom skill
validate_prompt: |
  Must produce valid output.
---
```

**How it works:**
1. `PostToolUse` hook detects Task/Skill completion
2. Extracts `subagent_type` or `skill` name from tool input
3. Finds agent/skill file and parses `validate_prompt` from frontmatter
4. Outputs validation reminder to Claude

### Implementation Files

- `.claude/scripts/validate-output.sh` - PostToolUse validation hook
- `.claude/settings.json` - registers PostToolUse hook for Task|Skill

## Hook System

Hooks are registered in `.claude/settings.json` and automate pipeline transitions and quality enforcement.

### Hook Types

| Type | When it fires | Use case |
|------|--------------|----------|
| `SessionStart` | Session begins | Initialize session-level state |
| `UserPromptSubmit` | User submits a prompt | Initialize state, intercept slash commands |
| `PreToolUse` | Before a tool executes | Block or modify tool calls |
| `PostToolUse` | After a tool completes | Validate output, trigger follow-up |
| `Stop` | Session ends | Transition to next pipeline stage |

### Active Hooks

| Script | Type | Purpose |
|--------|------|---------|
| `session-compact-hook.sh` | SessionStart | Unified compact recovery — outputs skill name + state.json path |
| `ultrawork-init-hook.sh` | UserPromptSubmit | Initialize ultrawork pipeline state when `/ultrawork` is typed |
| `skill-session-init.sh` | UserPromptSubmit + PreToolUse[Skill] | Initialize session state for specify/execute skills |
| `rv-detector.sh` | UserPromptSubmit | Detect `!rv` keyword to trigger re-validation loop |
| `rulph-init.sh` | PreToolUse[Skill] | Initialize rulph loop state on skill invocation |
| `skill-session-guard.sh` | PreToolUse[Edit\|Write] | Plan guard (specify) / orchestrator guard (execute) |
| `ralph-dod-guard.sh` | PreToolUse[Edit\|Write] | Enforce DoD before allowing writes in /ralph loop |
| `validate-output.sh` | PostToolUse[Task\|Skill] | Validate agent/skill output against `validate_prompt` frontmatter |
| `ultrawork-stop-hook.sh` | Stop | Advance ultrawork pipeline on session stop |
| `skill-session-stop.sh` | Stop | Block exit if execute has incomplete tasks (circuit breaker: 30 iter) |
| `rv-validator.sh` | Stop | Run re-validation pass on stop |
| `rulph-stop.sh` | Stop | Handle rulph loop termination |
| `ralph-stop.sh` | Stop | Ralph loop DoD verification + prompt re-injection |
| `skill-session-cleanup.sh` | SessionEnd | Clean up session dir (`rm -rf ~/.hoyeon/{session_id}/`) |

### Hook Development Notes

- Hook scripts live in `.claude/scripts/` and must be executable (`chmod +x`)
- Register hooks in `.claude/settings.json` under `hooks.<EventType>.matchers[]`
- A hook script that is not registered in settings will **not fire** — creating the file alone is not enough
- See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for additional hook behavior gotchas

## Git Branching & Release

- **`main`** — release only. Do not commit directly.
- **`develop`** — integration branch. Feature branches merge here.
- **Feature branches** — `feat/xxx` from `develop`, merge back to `develop` via `--no-ff`.

### Release Flow

```
1. All features merged to develop
2. Version bump commit on develop (plugin.json + marketplace.json + cli/package.json)
3. Update CLAUDE.md (Recent Changes) and README.md (if new skills/agents added)
4. cd cli && npm run build && npm publish --access public
5. git checkout main && git merge develop --no-ff -m "Release X.Y.Z"
6. git tag vX.Y.Z && git push origin main --tags && git push origin develop
7. gh release create vX.Y.Z --title "vX.Y.Z" --notes "## What's New in X.Y.Z ..."
```

## Versioning

- Plugin version is in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `cli/package.json`
- **Bump all three files** in a single commit on `develop` before merging to `main`
- CLI version (`@team-attention/hoyeon-cli`) is always synced with plugin version

## Recent Changes (v0.11.1)

- feat(execute): extract Final Verify into reusable holistic verification recipe (goal, constraints, AC, requirements, deliverables)
- docs: rewrite README with council-deliberated structure

## Previous Changes (v0.11.0)

- feat(council): add `/council` skill — multi-perspective decision committee with Team Mode debate
- feat(council): iterative step-back judge loop (debate → CONVERGED/PARTIAL/FULL → re-debate, max 3 cycles)
- refactor(execute): convert to generic engine with meta.type routing
- feat(execute): add fallback dispatch for tasks without tool field
- feat(spec/quick-plan): add `--type` flag and priority-based tool discovery
- fix(skills): align specify and quick-plan with spec.json v4 schema

## Previous Changes (v0.10.0)

- feat(specify): add AC Quality Gate (Phase 5d) with checklist-based AC validation loop
- feat(specify): add H→S conversion suggestions and env detection to AC Quality Gate
- feat(bugfix): add stagnation pattern detection (SPINNING/OSCILLATION/NO_PROGRESS) with pattern-specific retry strategies
- feat(bugfix): add persistent debug-state.md lifecycle (session-scoped working state + project-scoped final report)
- feat(bugfix): add bugfix-compact-hook.sh for compaction recovery
- feat(debugger): add attempt_history output schema and retry context
- feat(skills): add `/issue` skill for structured GitHub issue creation
- fix(web-search): defensive chromux --check with ps fallback

## Previous Changes (v0.9.1)

- feat(ralph): add separate ralph-verifier agent for context-isolated DoD verification

## Previous Changes (v0.9.0)

- feat(skills): add `/ralph` skill (iterative DoD-based task loop with Stop hook re-injection)
- feat(skills): add `/scope` skill (fast parallel change-scope analyzer)
- feat(browser-explorer): default to headless mode on setup
- refactor(hooks): rename rph → ralph (rph-detector → ralph hooks, rph-dod-guard → ralph-dod-guard)
- refactor(quick-plan): defer spec.json generation until user confirms execution
- docs: comprehensive CLAUDE.md and README.md rewrite (all English, spec.json refs, complete skill/agent/hook listings)

## Previous Changes (v0.8.1)

- fix(hooks): remove deleted rph-cleanup.sh from hooks.json SessionEnd
- refactor: replace `node cli/dist/cli.js` with `hoyeon-cli` globally
- chore: sync cli version to 0.8.0 and update release flow

## Testing Strategy

See [TESTING.md](TESTING.md) for the 4-Tier Testing Model (Unit → Integration → E2E → Agent Sandbox). Verification agents use this as their framework.

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook/tool behavior gotchas discovered during development.
