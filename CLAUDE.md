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
| `skill-session-init.sh` | UserPromptSubmit + PreToolUse[Skill] | Initialize session state for specify/execute skills |
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
- Run `hoyeon-cli settings validate` to verify all hook paths are correct after changes
- See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for additional hook behavior gotchas

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

## Recent Changes (v1.2.0)

- feat(cli,execute): add verify_plan pipeline with dedicated verifier agent
  - buildVerifyPlan() maps task AC scenarios to structured verify entries
  - scenario.subject field (web/server/cli/database), required for sandbox env
  - Sandbox verify-recipes inlined into verifier description per subject
  - Verification-type tasks skip .V:Verify (TF dedup guard)
- feat(execute): add independent Verifier agent for scenario-based verification (Worker→Verify→Commit pipeline)
- feat(execute): add Final Verify Tier 2 semantic cross-verification (cross-task compatibility, scenario coverage, constraint audit)
- refactor(specify): replace specify-v2 with specify as primary skill (layer-based L0-L5)
  - 3-agent collaborative L3 workshop (L3-user-advocate, L3-requirement-writer, L3-devil's-advocate)
  - Challenge option for L2/L3 approval gates (breadth/depth axes)
  - Mandatory user approval gates at L2 and L3
  - Sandbox capability extended (simulator, desktop, terminal)
  - Constraints, external_dependencies, infra-aware interview added
  - Breaking Changes section in Plan Approval Summary
  - Mandatory Merge Protocol + Merge Failure Recovery
- feat(cli): add spec learning/search for cross-spec compounding (BM25 search, --stdin for subagents)
- feat(execute): add work mode selection (worktree/branch-commit/no-commit)
- refactor(execute): Worker performs Tier 1 checks only (build/lint), scenario verification moved to Verifier
- refactor(execute): Verifier FAIL triggers fix loop (spec derive + re-verify, max 2 retries)

## Previous Changes (v1.1.0)

- refactor(specify): replace phase-based specify with layer-based derivation chain (L0-L5)
  - L0:Goal → L1:Context → L2:Decisions → L3:Requirements+Scenarios → L4:Tasks → L5:Review
  - Each layer has merge checkpoint (CLI) + gate-keeper (step-back via agent team)
  - Team-mode gate-keepers replace single-agent phase2-stepback
  - Spec coverage CLI gates at each layer transition
- refactor(execute): remove per-task :Verify, simplify to Worker→Commit pipeline
  - Worker self-check + Final Verify replaces triple verification
  - Add Worker BLOCKED status for scope blocker detection
  - Remove reconciliation (triage/retry/adapt) — ~285 lines removed
- feat(README): rewrite around "All you need is requirements" messaging
- chore: remove dead phase2-stepback agent, old specify templates
- chore(hooks): remove skill-awareness-hook from hooks.json, skill-hint-hook from settings.json
- fix(specify): add sandbox_underuse gap check to L3-reviewer checklist

## Previous Changes (v1.0.1)

- feat(specify): add Phase 2 requirements extraction with source tracing and mini-mirror
- feat(specify): add phase2-stepback agent for goal alignment review before planning
- feat(specify): add scenario coverage completeness system (HP/EP/BC/NI/IT categories)
- feat(specify): verification-planner now attaches scenarios to confirmed requirements (not generate)
- feat(cli): add guide hints on spec merge validation errors
- feat(cli): add requirement.source field to v5 schema (traceability)
- feat(quick-plan): add lightweight requirements before task merge
- feat(agents): add phase2-stepback agent, update plan-reviewer with coverage check
- fix(skills): resolve 12 schema/logic issues across specify, bugfix, quick-plan, execute
- fix(execute): remove :Commit from parallel dispatch, add null guard, plain FV partial report

## Previous Changes (v1.0.0)

- feat(cli): wire v5 schema as default validation with v4 backward compatibility
- feat(cli): add `schema_version` field to meta for version routing
- feat(cli): add scenario, requirement, sandbox-tasks, derive, drift, guide commands
- feat(specify): add iterative interview loop with progress visibility
- refactor(plan-reviewer): rewrite for spec.json v5 with 4-layer review
- refactor(execute): simplify final-verify Step 4 to read recorded scenario statuses

## Previous Changes (v0.11.3)

- refactor(verification): replace A-item/H-item/S-item terminology with 2-axis model (Auto/Agent/Manual × host/sandbox)
- refactor(execute): H-ITEMS report section renamed to MANUAL REVIEW in dev.md and plain.md
- refactor(execute): final-verify.md H-ITEM skip markers replaced with MANUAL and verified_by: human
- refactor(execute): report-template.md updated with Auto/Agent/Manual sections + SKIPPED (sandbox unavailable) section
- refactor(bugfix): A-items references updated to Auto items in verification-planner instructions

## Previous Changes (v0.11.2)

- refactor(execute): unify Final Verify across all execute paths (dev/standard, dev/quick, plain)
- refactor(execute): replace Requirements Check with Final Verify in dev/standard finalize
- refactor(execute): extract plain pipeline to references/plain.md with flexible dispatch
- feat(execute): plain tasks can dispatch via Skill, Agent, or direct orchestrator handling

## Previous Changes (v0.11.1)

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

## CLI spec guide Reference

When constructing `spec merge` JSON, **always run `hoyeon-cli spec guide <section>` first** to verify field names, types, and structure. This prevents merge validation failures.

Available guide sections:

| Command | Shows |
|---------|-------|
| `hoyeon-cli spec guide meta` | meta fields (goal, non_goals, mode) |
| `hoyeon-cli spec guide context` | context fields (request, research, assumptions, decisions, confirmed_goal, known_gaps) |
| `hoyeon-cli spec guide constraints` | constraints field structure (id, type, rule, verified_by, verify) |
| `hoyeon-cli spec guide requirements` | requirements fields (id, behavior, priority, source, scenarios) |
| `hoyeon-cli spec guide scenario` | scenario fields (id, given, when, then, verified_by, execution_env, verify) |
| `hoyeon-cli spec guide verify` | verify object structure (`{type, run}` — NOT a string) |
| `hoyeon-cli spec guide tasks` | task fields (id, action, type, status, risk, file_scope, etc.) |
| `hoyeon-cli spec guide acceptance-criteria` | AC fields (scenarios refs + checks) |
| `hoyeon-cli spec guide external` | external_dependencies (pre_work, post_work) |
| `hoyeon-cli spec guide merge` | merge modes (replace vs `--append` vs `--patch`) |

**Key conventions:**
- **File-based JSON passing** — write JSON to `/tmp/spec-merge.json` via heredoc (`<< 'EOF'`), pass via `--json "$(cat /tmp/spec-merge.json)"`. Never pass JSON directly as CLI argument (zsh glob expansion corrupts `[`, `{`, `$`)
- **One merge per section** — call `spec merge` once per top-level key. Never merge multiple sections in parallel
- **`--append` for arrays** — use when adding to existing arrays (decisions, assumptions, known_gaps)
- **`--patch` for nested updates** — use when updating specific items within arrays (e.g., adding scenarios to existing requirements)

## CLI spec learning & search Reference

**Learning** — Workers record structured learnings via CLI (auto-maps task→requirements):
```bash
hoyeon-cli spec learning --task T1 --stdin <spec_path> << 'EOF'
{"problem": "...", "cause": "...", "rule": "...", "tags": [...]}
EOF
# Saves to: context/learnings.json (structured, searchable)
# Also supports: --json '{"problem":"..."}' (but heredoc stdin preferred for subagents)
```

**Search** — BM25 search across all specs (requirements, scenarios, constraints, learnings):
```bash
hoyeon-cli spec search "sqlite fts5"                    # human-readable output
hoyeon-cli spec search "auth redirect" --json --limit 5  # JSON for agents
hoyeon-cli spec search "empty cart" --specs-dir .dev/specs
```

## Testing Strategy

See [VERIFICATION.md](VERIFICATION.md) for the 4-Tier Testing Model (Unit → Integration → E2E → Agent Sandbox). Verification agents use this as their framework.

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook/tool behavior gotchas discovered during development.
