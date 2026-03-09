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
- `.claude/settings.local.json` - registers PostToolUse hook for Task|Skill

## Hook System

Hooks are registered in `.claude/settings.local.json` and automate pipeline transitions and quality enforcement.

### Hook Types

| Type | When it fires | Use case |
|------|--------------|----------|
| `UserPromptSubmit` | User submits a prompt | Initialize state, intercept slash commands |
| `PreToolUse` | Before a tool executes | Block or modify tool calls |
| `PostToolUse` | After a tool completes | Validate output, trigger follow-up |
| `Stop` | Session ends | Transition to next pipeline stage |
| `SubagentStop` | Subagent finishes | Post-agent cleanup |

### Active Hooks

| Script | Type | Purpose |
|--------|------|---------|
| `skill-session-init.sh` | UserPromptSubmit + PreToolUse[Skill] | Initialize session state for specify/execute skills |
| `skill-session-guard.sh` | PreToolUse[Edit\|Write] | Plan guard (specify) / orchestrator guard (execute) |
| `skill-session-stop.sh` | Stop | Block exit if execute has incomplete tasks (circuit breaker: 30 iter) |
| `skill-session-cleanup.sh` | SessionEnd | Clean up session dir (`rm -rf ~/.hoyeon/{session_id}/`) |
| `ultrawork-init-hook.sh` | UserPromptSubmit | Initialize ultrawork pipeline state when `/ultrawork` is typed |
| `validate-output.sh` | PostToolUse | Validate agent/skill output against `validate_prompt` frontmatter |

### Hook Development Notes

- Hook scripts live in `.claude/scripts/` and must be executable (`chmod +x`)
- Register hooks in `.claude/settings.local.json` under `hooks.<EventType>.matchers[]`
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

## Recent Changes (v0.8.1)

- fix(hooks): remove deleted rph-cleanup.sh from hooks.json SessionEnd
- refactor: replace `node cli/dist/cli.js` with `hoyeon-cli` globally
- chore: sync cli version to 0.8.0 and update release flow

## Previous Changes (v0.8.0)

- refactor(cli): rename `dev-cli/` to `cli/`, bundle with esbuild into single `dist/cli.js` (all deps inlined, no node_modules needed)
- feat(cli): prepare npm publish as `@team-attention/hoyeon-cli` (package.json, bin entry, publishConfig)
- refactor(cli): rename user-facing strings from `dev-cli` to `hoyeon-cli` in all help/error output
- refactor(hooks,skills,docs): update all references from `dev-cli/bin/dev-cli.js` to `cli/dist/cli.js`
- feat(hooks): add pre-commit hook to auto-rebuild `cli/dist/cli.js` on source changes (`scripts/pre-commit-cli-build.sh`)

## Previous Changes (v0.7.1)

- refactor(hooks): migrate session state from `~/.claude/.hook-state/` to `~/.hoyeon/{session_id}/` directory structure
- refactor(hooks): unify rulph/rph/rv state into single `state.json` with namespaced fields (`.rulph`, `.rph`, `.rv`)
- refactor(hooks): simplify SessionEnd cleanup to `rm -rf` session dir (replaces cleanup[] array pattern)
- refactor(hooks): delete `rph-cleanup.sh` and `rulph-cleanup.sh` (redundant with unified cleanup)
- chore(skills): remove 7 unused skills (simple-execute, simple-specify, state, worktree, publish, open, init)
- chore(scripts): remove dead scripts (hy, capture-session)

## Previous Changes (v0.7.0)

- refactor(hooks): consolidate 7 hooks into 4 unified skill-session hooks (`skill-session-init`, `skill-session-guard`, `skill-session-stop`, `skill-session-cleanup`) with per-session state in `~/.hoyeon/{session_id}/state.json`
- feat(skills): replace v1 specify/execute with v2 (spec.json-native, cli driven, no PLAN.md dependency)
- feat(cli): add `spec status` subcommand for hook-based task completion checking
- feat(agents): update browser-explorer to chromux-based architecture (raw CDP, isolated Chrome profile)

## Previous Changes (v0.6.6)

- feat(bugfix): add `/bugfix` skill and `debugger` agent for root cause-based one-shot bug fixing (DIAGNOSE → FIX → REVIEW & COMMIT, adaptive SIMPLE/COMPLEX mode, circuit breaker with `/specify` escalation)
- feat(persist): add `!rph` (Ralph Loop) and `!rv` (Re-validate) magic keyword hooks with DoD guard, zombie cleanup, orphan GC

## Previous Changes (v0.6.5)

- feat(verify): add S-items 3-way classification to verification-planner (A/H/S separate sections, pattern detection for BDD features, UI screenshot verification)
- feat(reference-seek): upgrade to v2.0.0 with GitHub API, context7, and code deep dive
- feat(hooks): add session ID capture and Claude-Session trailer support
- fix(agents): remove dead ${CLAUDE_PLUGIN_ROOT} refs and add sandbox verification checks

## Previous Changes (v0.6.4)

- feat(specify): add Plan Approval Summary to plan finalization (TODO overview, verification A/H/S, pre/post-work, key decisions, assumptions)
- feat(dev-scan): add ProductHunt as 6th data source

## Previous Changes (v0.6.3)

- fix(verify): replace ambiguous read-only constraint with Edit/Write forbidden + Bash file mutation guard
- fix(specify): make codex-strategist Step 2.5 required in Standard mode
- feat(execute): add sandbox lifecycle to verification flow (capture output, teardown, report to `context/sandbox-report.md`)


## Previous Changes (v0.6.2)

- Discuss skill: Socratic discussion partner for pre-planning exploration (DIAGNOSE → PROBE → SYNTHESIZE)
- Dev-scan v1.5: vendored bird-search.mjs for X/Twitter search with cookie auth
- Dev-scan v1.5: browser enrichment pipeline (enrich-browser.py) for Dev.to/Lobsters full content extraction
- Dev-scan v1.5: Twitter query optimization with `since:` date filter and `min_faves:5`

## Previous Changes (v0.6.1)

- TESTING.md: Sandbox Bootstrapping Patterns (Web App, API Server, CLI Tool, Monorepo) + Security Checklist
- TESTING.md: Sandbox Drift Prevention section with detection checklist
- Agents: fixed `validate_prompt` frontmatter key in 7 agents (PostToolUse validation now active)
- Agents: fixed `codex exec -p` → `codex exec` (positional arg, not --profile flag)
- code-reviewer: switched to foreground parallel execution (fixes background PATH issue)
- verification-planner: added Sandbox Drift Detection step (1.6) and bootstrapping pattern recommendations
- tradeoff-analyzer: added Reversible Alternative column to Risk Assessment
- specify skill: Risk Summary table format updated with reversibility info

## Testing Strategy

See [TESTING.md](TESTING.md) for the 4-Tier Testing Model (Unit → Integration → E2E → Agent Sandbox). Verification agents use this as their framework.

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook/tool behavior gotchas discovered during development.
