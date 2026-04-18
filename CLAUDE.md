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
| `PostToolUseFailure` | After a tool fails | Error recovery, failure tracking |
| `Stop` | Session ends | Transition to next pipeline stage |

### Active Hooks

| Script | Type | Purpose |
|--------|------|---------|
| `cli-version-sync.sh` | SessionStart | Auto-sync hoyeon-cli npm version with plugin version |
| `session-compact-hook.sh` | SessionStart | Unified compact recovery — outputs skill name + state.json path |
| `ultrawork-init-hook.sh` | UserPromptSubmit | Initialize ultrawork pipeline state when `/ultrawork` is typed |
| `skill-session-init.sh` | UserPromptSubmit + PreToolUse[Skill] | Initialize session state for specify/execute/blueprint skills |
| `rv-detector.sh` | UserPromptSubmit | Detect `!rv` keyword to trigger re-validation loop |
| `rulph-init.sh` | PreToolUse[Skill] | Initialize rulph loop state on skill invocation |
| `skill-session-guard.sh` | PreToolUse[Edit\|Write] | Plan guard (specify) / orchestrator guard (execute) |
| `ralph-dod-guard.sh` | PreToolUse[Edit\|Write] | Enforce DoD before allowing writes in /ralph loop |
| `validate-output.sh` | PostToolUse[Task\|Skill] | Validate agent/skill output against `validate_prompt` frontmatter |
| `tool-output-truncator.sh` | PostToolUse[Grep\|Glob\|WebFetch\|Bash] | Truncate oversized tool output (50K/10K limits, stderr preserved) |
| `edit-error-recovery.sh` | PostToolUseFailure[Edit\|Write] | Detect Edit failures and inject recovery guidance (5 error patterns) |
| `large-file-recovery.sh` | PostToolUseFailure[Read] | Detect large/binary file Read failures, suggest chunked read, agent delegation, or Grep |
| `tool-failure-tracker.sh` | PostToolUseFailure[*] | Track repeated failures per tool, escalate at 3/5 failures in 60s window |
| `ultrawork-stop-hook.sh` | Stop | Advance ultrawork pipeline on session stop |
| `skill-session-stop.sh` | Stop | Block exit if execute has incomplete tasks (circuit breaker: 30 iter) |
| `rv-validator.sh` | Stop | Run re-validation pass on stop |
| `rulph-stop.sh` | Stop | Handle rulph loop termination |
| `ralph-stop.sh` | Stop | Ralph loop DoD verification + prompt re-injection |
| `skill-session-cleanup.sh` | SessionEnd | Clean up session dir (`rm -rf ~/.hoyeon/{session_id}/`) |

### Hook Development Notes

- Hook scripts live in `.claude/scripts/` (symlink to `scripts/`) and must be executable (`chmod +x`)
- **When adding a new hook script, you MUST update all three:**
  1. `hooks/hooks.json` — plugin-level registration (uses `${CLAUDE_PLUGIN_ROOT}/scripts/...`)
  2. `.claude/settings.json` — project-level registration (uses `.claude/scripts/...`)
  3. `CLAUDE.md` — add entry to the Active Hooks table above
- A hook script that is not registered in settings will **not fire** — creating the file alone is not enough
- Run `hoyeon-cli session get --sid <id>` to verify session state after changes
- Hook behavior gotchas are documented in commit history and session learnings

## Git Branching & Release

- **`main`** — release only. Do not commit directly.
- **`develop`** — integration branch. Feature branches merge here.
- **Feature branches** — `feat/xxx` from `develop`, merge back to `develop` via `--no-ff`.

### Pre-Release Checklist

- [ ] All content must be written in English (SKILL.md, agent .md, CLAUDE.md, README.md, commit messages, comments)
- [ ] When `README.md` is updated, sync all translations: `README.ko.md`, `README.zh.md`, `README.ja.md`

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

## Recent Changes (v1.6.0)

### CLI Rename (hoyeon-cli2 → hoyeon-cli)
- **BREAKING**: npm package renamed `@team-attention/hoyeon-cli2` → `@team-attention/hoyeon-cli` (v1 slot reclaimed now that v1 CLI is retired)
- Directory: `cli2/` → `cli/`, binary: `hoyeon-cli2` → `hoyeon-cli`
- Users must `npm uninstall -g @team-attention/hoyeon-cli2 && npm install -g @team-attention/hoyeon-cli` (or rely on SessionStart `cli-version-sync.sh`)
- Fixed long-standing broken refs in `.github/workflows/ci.yml`, `publish.yml`, and `scripts/pre-commit-cli-build.sh` that pointed at `cli/` while directory was `cli2/`
- Fixed `hoyeon-cli plan status` stale command references in agents and docs → correct form is `hoyeon-cli plan task <spec_dir> --status <id>=<state>`

### Pipeline v2 Migration
- **BREAKING**: Removed old specify (v1), execute (v1), quick-plan skills and hoyeon-cli (v1)
- **Renamed**: specify2 → specify, execute2 → execute (clean names)
- New pipeline: `/specify` (requirements.md) → `/blueprint` (plan.json + contracts.md) → `/execute` (dispatch workers)
- New CLI: `hoyeon-cli` with groups: req, plan, learning, issue, session
- Rewired `/bugfix` from spec.json → requirements.md pipeline
- Updated all hooks, agents, and downstream skills for v2
- Codebase reconnaissance added to `/blueprint` (Phase 0.5, non-greenfield)
- Preview gates added to `/specify` (requirements preview) and `/blueprint` (task graph + verify plan)
- Inline planning fallback in `/execute` when no blueprint exists

### Execute (plan-driven orchestrator)
- 3-axis config: dispatch (direct/agent/team) × work (worktree/branch/no-commit) × verify (light/standard/thorough)
- 6 dispatch/verify reference recipes: direct.md, agent.md, team.md, worker-charter.md, verify.md, contracts-patch.md
- Pre-work gate, inline planning fallback, resume behavior with idempotent done-skip

### CLI (`hoyeon-cli`)
- `req init` — requirements.md scaffolding
- `plan init/merge/get/list/task/validate` — plan.json operations
- `learning` — structured learnings to context/learnings.json
- `issue` — structured issues to context/issues.json
- `session set/get` — session state management

## CLI Reference (hoyeon-cli)

| Group | Command | Description |
|-------|---------|-------------|
| `req` | `hoyeon-cli req init <spec_dir> --type <type> [--goal "..."]` | Create spec_dir + requirements.md template |
| `plan` | `hoyeon-cli plan init <spec_dir> --type <type>` | Create empty plan.json stub |
| `plan` | `hoyeon-cli plan merge <spec_dir> --json '<payload>' [--patch\|--append]` | Merge payload into plan.json |
| `plan` | `hoyeon-cli plan get <spec_dir> --path <dotted.path>` | Read field by dot notation |
| `plan` | `hoyeon-cli plan list <spec_dir> [--status <state>] [--json]` | List tasks with optional filter |
| `plan` | `hoyeon-cli plan task <spec_dir> --status <id>=<state>` | Update task status (monotonic done-lock) |
| `plan` | `hoyeon-cli plan validate <spec_dir>` | Schema + cross-ref integrity check |
| `learning` | `hoyeon-cli learning --task <id> --json '{...}' <spec_dir>` | Add learning to context/learnings.json |
| `issue` | `hoyeon-cli issue --task <id> --json '{...}' <spec_dir>` | Add issue to context/issues.json |
| `session` | `hoyeon-cli session set --sid <id> [--key k --value v] [--json '{...}']` | Update session state |
| `session` | `hoyeon-cli session get --sid <id>` | Read session state |

**Key conventions:**
- **File-based JSON passing** — write JSON to `/tmp/spec-merge.json` via heredoc (`<< 'EOF'`), pass via `--json "$(cat /tmp/spec-merge.json)"`. Never pass JSON directly as CLI argument (zsh glob expansion corrupts `[`, `{`, `$`)
- **One merge per section** — call `plan merge` once per top-level key
- **`--append` for arrays** — use when adding to existing arrays
- **`--patch` for nested updates** — use when updating specific items within arrays
- **`--stdin` for subagents** — learning and issue commands support `--stdin` to read JSON from stdin

**Learning & Issue examples:**
```bash
hoyeon-cli learning --task T1 --stdin <spec_dir> << 'EOF'
{"problem": "...", "cause": "...", "rule": "...", "tags": [...]}
EOF

hoyeon-cli issue --task T1 --stdin <spec_dir> << 'EOF'
{"type": "failed_approach|out_of_scope|blocker", "description": "..."}
EOF
```

## Testing Strategy

See [VERIFICATION.md](VERIFICATION.md) for the 4-Tier Testing Model (Unit → Integration → E2E → Agent Sandbox). Verification agents use this as their framework.

## Lessons Learned

Hook/tool behavior gotchas are documented in commit history and session learnings.
