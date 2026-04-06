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

## Recent Changes (v1.5.3)

- feat(execute): restructure verify pipeline to 4-tier progressive gate (Tier 0→1→2→3)
  - verify-light: Tier 0 with toolchain auto-detection, CWD subshell rule
  - verify-standard: Tier 0 + Tier 1 with 3-state (PASS/FAIL/UNCERTAIN), VERIFIED_WITH_GAPS at >30%
  - verify-thorough: Tier 0+1+2+3 with qa-verifier dispatch for runtime verification
- feat(qa): add qa-verifier agent — universal QA verification (browser/cli/desktop/shell)
- fix(execute): VERIFIED_WITH_GAPS handled as soft pass in dev.md, team.md, plain.md (CR-002)
- fix(execute): chromux --check → chromux ps in sandbox-detection (command didn't exist)

## Previous Changes (v1.5.2)

- feat(execute): add verify-ralph mode — spec-based verification + persistent DoD loop until all sub-requirements pass
- feat(execute): skip session stop blocking for team dispatch mode (workers run in background)
- feat(execute): add round context propagation and bounded worker retry
- feat(specify): add steelman counterargument to L2-reviewer checklist
- feat(specify,execute): add rejected alternatives guidance to L2 decision rationale
- feat(execute): add anti-slop checks to workers and code-reviewer
- refactor(code-reviewer): simplify to Claude-only review, remove multi-model orchestration

## Previous Changes (v1.5.1)

- refactor(bugfix): remove SIMPLE/COMPLEX branching — always run full investigation pipeline
  - Always dispatch: debugger + verification-planner + gap-analyzer (all parallel)
  - Always use agent dispatch + standard verify (no more direct/light for simple bugs)
  - Unified retry: max 3 attempts for all bugs (remove COMPLEX instant-escalate)
- feat(bugfix): add Phase 5.3 QA suggestion — offer /qa handoff after successful fix

## Previous Changes (v1.5.0)

- feat(execute): add 3-axis configuration model (dispatch/work/verify) with AskUserQuestion
  - dispatch: direct (orchestrator-direct) | agent (worker subagents with grouping) | team (TeamCreate persistent workers)
  - work: worktree | branch | no-commit (unchanged from v1.4.0)
  - verify: light (build check) | standard (spec-based FV) | thorough (CR + cross-task + sandbox)
- feat(execute): add DIRECT dispatch mode — orchestrator executes tasks directly without subagents
- feat(execute): add TEAM dispatch mode — TeamCreate with claim-based persistent workers, verify/fix stage loop
- refactor(execute): AGENT mode (dev.md) — add task grouping by module, round-level commit (replaces per-task commit)
- refactor(execute): split Final Verify into 3 verify recipes (verify-light.md, verify-standard.md, verify-thorough.md)
- feat(execute): add sandbox auto-detection in Phase 0.4 (moved from specify)
- feat(execute): add plan analysis in Phase 0.3 (parallelism, groupable tasks, solo candidates)
- refactor(execute): replace meta.mode.depth with meta.mode.dispatch + meta.mode.verify
- feat(cli): add dispatch, work, verify fields to meta.mode schema

## Previous Changes (v1.4.0)

- refactor(schema): rename dev-spec-v7 → dev-spec-v1, reset schema versioning
- feat(schema): add optional `research` field to context (L1 investigation findings)
- refactor(schema): slim — remove acceptance_criteria, file_scope, priority, verify from spec schema
  - requirements: removed `priority`, `source` (only id, behavior, sub)
  - sub-requirements: removed `verify`, `status`, `verified_by_task` (only id, behavior)
- feat(schema): add optional given/when/then (GWT) fields to sub-requirements for structured acceptance criteria
  - tasks: simplified to id, action, type, status, depends_on, fulfills (removed file_scope, acceptance_criteria, risk, origin, steps, inputs, outputs, etc.)
- refactor(specify): delete legacy specify (v5), promote specify-v2 to specify
  - Simplified layer chain: L0:Goal → L1:Context → L2:Decisions → L3:Requirements → L4:Tasks
  - No reviewer agents, no verify fields. Evidence-based clarity scoring at L2
  - User approves at L2, L3, L4
- refactor(specify): replace TeamCreate gate-keeper with per-layer Task(reviewer)
- refactor(execute,bugfix,quick-plan): v1 schema compatibility
- fix(execute): remove remaining acceptance_criteria and file_scope references
- feat(execute): TDD is opt-in for dev workers (`--tdd` to enable), outside-in strategy (E2E first)
- refactor(execute): remove dead per-task verify pipeline (should_spawn_verifier, VERIFIER_DESCRIPTION, .V:Verify)
  - DAG simplified: Worker → Commit (2-step, no per-task verify)
  - Final Verify retained (holistic spec verification)
  - verifier.md agent and verify-recipes/ kept for future use

## Previous Changes (v1.3.1)

- refactor(specify): replace 3-agent L3 workshop with Task-based derive+review pipeline
  - Remove L3-user-advocate, L3-requirement-writer, L3-devil's-advocate from TeamCreate
  - L3 now uses Task(L3-deriver) + Task(L3-reviewer) with max 3 reviewer cycles
  - Remove --workshop/--no-workshop flags (single path for all decision counts)
  - Rename L3-workshop.md → L3-requirements.md

## Previous Changes (v1.3.0)

- feat(schema): v6 schema — replace scenarios with sub-requirements (id, behavior, optional verify)
- refactor(specify): single mode (no quick/standard), --workshop flag for optional 3-agent L3
- refactor(execute): risk-based should_spawn_verifier (remove empty verify_plan gate)
- refactor(agents): verifier single mode with verify/no-verify paths, simplified ac-quality-gate
- refactor(cli): v6 validation routing, sub-requirement coverage/check/search support

## Previous Changes (v1.2.2)

- feat(execute): add Verify Auto-Pass gate (`should_spawn_verifier()`) to skip per-task `.V:Verify` for simple specs
  - Empty verify_plan (specify --quick) → skip verify entirely
  - Machine-only + low/medium risk → skip (Worker Tier 1 + Final Verify sufficient)
  - Agent/sandbox scenarios or high risk → full independent Verifier (unchanged)
  - Override: `meta.force_verify: true` forces full verify for all tasks
  - Follows Code Review auto-pass pattern (dev.md Phase 0.5 conditional gate)
- refactor(verifier): remove Dynamic Verification mode (empty verify_plan → skip instead of generate)
- refactor(execute): simplify DAG dependency logic with null-coalescing (`v ?? worker` pattern)

## Previous Changes (v1.2.1)

- feat(cli): add `spec issue` subcommand — structured issues to context/issues.json (mirrors spec learning pattern)
- refactor(cli): extract spec.json history[] to context/history.json via appendHistory() helper
- refactor(skills): replace issues.md with issues.json (CLI-driven), remove learnings.md legacy references
- fix(schema): add missing `detected` field to sandbox_capability in v5 schema

## Previous Changes (v1.2.0)

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
  - Each layer has merge checkpoint (CLI) + per-layer Task(reviewer)
  - Per-layer Task(reviewer) replaces single-agent phase2-stepback
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
| `hoyeon-cli spec guide context` | context fields (confirmed_goal, research, decisions, known_gaps) |
| `hoyeon-cli spec guide constraints` | constraints field structure (id, rule) |
| `hoyeon-cli spec guide requirements` | requirements fields (id, behavior, sub[]) |
| `hoyeon-cli spec guide sub` | Sub-requirement fields (id, behavior, given, when, then) |
| `hoyeon-cli spec guide tasks` | task fields (id, action, type, status, depends_on, fulfills) |
| `hoyeon-cli spec guide external` | external_dependencies (pre_work, post_work) |
| `hoyeon-cli spec guide merge` | merge modes (replace vs `--append` vs `--patch`) |

**Key conventions:**
- **File-based JSON passing** — write JSON to `/tmp/spec-merge.json` via heredoc (`<< 'EOF'`), pass via `--json "$(cat /tmp/spec-merge.json)"`. Never pass JSON directly as CLI argument (zsh glob expansion corrupts `[`, `{`, `$`)
- **One merge per section** — call `spec merge` once per top-level key. Never merge multiple sections in parallel
- **`--append` for arrays** — use when adding to existing arrays (decisions, assumptions, known_gaps)
- **`--patch` for nested updates** — use when updating specific items within arrays (e.g., adding sub-requirements to existing requirements)

## CLI spec learning, issue & search Reference

**Learning** — Workers record structured learnings via CLI (auto-maps task→requirements):
```bash
hoyeon-cli spec learning --task T1 --stdin <spec_path> << 'EOF'
{"problem": "...", "cause": "...", "rule": "...", "tags": [...]}
EOF
# Saves to: context/learnings.json (structured, searchable)
# Also supports: --json '{"problem":"..."}' (but heredoc stdin preferred for subagents)
```

**Issue** — Workers record structured issues via CLI:
```bash
hoyeon-cli spec issue --task T1 --stdin <spec_path> << 'EOF'
{"type": "failed_approach|out_of_scope|blocker", "description": "..."}
EOF
# Saves to: context/issues.json (structured)
# Also supports: --json '{"type":"blocker","description":"..."}'
```

**Search** — BM25 search across all specs (requirements, sub-requirements, constraints, learnings):
```bash
hoyeon-cli spec search "sqlite fts5"                    # human-readable output
hoyeon-cli spec search "auth redirect" --json --limit 5  # JSON for agents
hoyeon-cli spec search "empty cart" --specs-dir .dev/specs
```

**History** — Spec mutation history is automatically written to `context/history.json` (not in spec.json).
All `spec merge`, `spec task`, `spec derive`, `spec sub`, and `spec sandbox-tasks` commands append entries automatically.

## Testing Strategy

See [VERIFICATION.md](VERIFICATION.md) for the 4-Tier Testing Model (Unit → Integration → E2E → Agent Sandbox). Verification agents use this as their framework.

## Lessons Learned

Hook/tool behavior gotchas are documented in commit history and session learnings.
