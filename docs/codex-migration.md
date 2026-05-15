# Codex Migration Plan

## Decision

Migrate Hoyeon to Codex with a Bash-first adapter while keeping the Claude Code
plugin contract intact. The shared source of truth stays in the existing
`skills/`, `agents/`, and `cli/` directories. Codex-specific files provide a
thin runtime adapter only.

## Scope

In scope for the first migration slice:

- Add a Codex plugin manifest that exposes prefixed Codex skill wrappers.
- Keep `hoyeon-cli` as the only writer for `plan.json` state.
- Add Codex native-agent adapters for the Hoyeon logical subagents.
- Add a fixture and smoke script that prove the Bash-first CLI path works.
- Document the Claude/Codex runtime boundary so future work can resume safely.

Out of scope for the first migration slice:

- MCP server implementation.
- Hook parity for session guards, stop hooks, or automatic ultrawork
  transitions.
- Rewriting existing Claude Code skills or agents.
- Full multi-worker `/execute` parity.

## Runtime Model

Hoyeon has four layers:

| Layer | Shared? | Claude Code surface | Codex surface |
| --- | --- | --- | --- |
| CLI | Yes | `hoyeon-cli` via Bash | `hoyeon-cli` via Bash |
| Skills | Yes, canonical markdown | `/skill-name` plugin commands | `$hoyeon-*` skill wrappers |
| Agents | Yes, canonical markdown | `Agent(subagent_type=...)` | native agent adapter TOML |
| Hooks | No, later | Claude hooks | excluded from v1 |

The compatibility rule is: skills and agents express the Hoyeon protocol once,
then each runtime chooses the appropriate execution surface.

## Bash-First Rule

Codex v1 does not use MCP. Every state mutation goes through `hoyeon-cli`:

```bash
hoyeon-cli req init <spec_dir> --type <type> --goal "<goal>"
hoyeon-cli plan init <spec_dir> --type <type>
hoyeon-cli plan merge <spec_dir> --patch --json "$(cat payload.json)"
hoyeon-cli plan task <spec_dir> --status T1=done --summary "..."
hoyeon-cli plan validate <spec_dir>
```

Agents and skills must not edit `plan.json` directly. Temporary JSON payload
files are preferred over inline string construction when payloads are non-trivial.

## Subagent Compatibility

Keep existing logical subagent names in the Hoyeon protocol. Codex adapter names
may be prefixed to avoid collisions with built-in roles.

| Logical agent | Claude Code | Codex adapter |
| --- | --- | --- |
| `code-explorer` | `Agent(subagent_type="code-explorer")` | `hoyeon-code-explorer` |
| `worker` | `Agent(subagent_type="worker")` | `hoyeon-worker` |
| `verifier` | `Agent(subagent_type="verifier")` | `hoyeon-verifier` |
| `code-reviewer` | `Agent(subagent_type="code-reviewer")` | `hoyeon-code-reviewer` |
| `browser-explorer` | `Agent(subagent_type="hoyeon:browser-explorer")` | `hoyeon-browser-explorer` |
| `docs-researcher` | `Agent(subagent_type="docs-researcher")` | `hoyeon-docs-researcher` |
| `external-researcher` | `Agent(subagent_type="external-researcher")` | `hoyeon-external-researcher` |

The canonical prompt remains in `agents/*.md`. Codex TOML files are adapters
that point back to those prompts and define Codex model/posture metadata.

## Migration Phases

### Phase 1: Plugin shell

- Add `.codex-plugin/plugin.json`.
- Expose `skills: "./codex/skills/"` so Codex sees prefixed wrappers instead
  of collision-prone generic names such as `execute`.
- Do not declare `mcpServers` yet.
- Keep `.claude-plugin/plugin.json` unchanged.

Validation:

- JSON parses.
- Manifest points at existing `codex/skills/`.

### Phase 2: Agent adapters

- Add Codex adapter TOMLs under `codex/agents/`.
- Start with `hoyeon-code-explorer`, `hoyeon-worker`, `hoyeon-verifier`, and
  `hoyeon-code-reviewer`.
- Preserve the canonical markdown prompts under `agents/`.

Validation:

- TOML files are syntactically parseable.
- Each adapter references an existing canonical prompt path.

### Phase 3: Bash-first CLI smoke

- Add a fixture under `fixtures/codex-migration/todo-toggle/`.
- Add `scripts/codex-blueprint-smoke.sh`.
- The script copies the fixture to a temp directory, initializes `plan.json`,
  merges a payload, validates it, mutates a task, and validates again.

Validation:

- `scripts/codex-blueprint-smoke.sh` exits 0.
- `hoyeon-cli plan validate` passes after init/merge and after task mutation.

### Phase 4: Skill runtime annotations

- Add a `Runtime Surface` section to `skills/blueprint/SKILL.md`.
- Then repeat for `skills/execute/SKILL.md` and `skills/specify/SKILL.md`.
- Do not remove Claude Code instructions; classify them by runtime.

Validation:

- Existing Claude instructions remain available.
- Codex instructions state Bash-first and no-hook assumptions.

### Phase 5: Execute parity

- Start with single-worker execution.
- Use `hoyeon-worker` for one task and `hoyeon-verifier` for final checks.
- Add parallel execution only after single-worker task state transitions are
  stable.

Validation:

- Pending/running/done/blocked state changes happen only through `hoyeon-cli`.
- A failed worker leaves a recoverable `failed` or `blocked` task status.
- `scripts/codex-execute-smoke.sh` exits 0 and validates the plan after task
  completion.

### Phase 6: Native adapter install

- Install `codex/agents/*.toml` into `${CODEX_HOME:-~/.codex}/agents/` only
  through `scripts/install-codex-agent-adapters.sh`.
- Restart Codex before assuming the new adapter names are available in the
  current session.

Validation:

- The install script reports all copied adapter files.
- A new Codex session exposes the `hoyeon-*` adapter names before `/execute`
  dispatch depends on them.

### Phase 7: Skill adapter install

- Add prefixed Codex skill wrappers under `codex/skills/hoyeon-*`.
- Keep the canonical workflow bodies in `skills/specify`, `skills/blueprint`,
  and `skills/execute`.
- Install wrappers into `${CODEX_HOME:-~/.codex}/skills/` through
  `scripts/install-codex-skill-adapters.sh`.
- Use prefixed names to avoid collisions with generic skills:
  `$hoyeon-specify`, `$hoyeon-blueprint`, and `$hoyeon-execute`.

Validation:

- Installed wrappers contain resolved absolute canonical skill paths.
- A new Codex session exposes `$hoyeon-*` in skill discovery.

### Phase 8: Research/browser adapters

- Add prefixed Codex wrappers for research/browser skills:
  `$hoyeon-dev-scan`, `$hoyeon-browser-work`, `$hoyeon-deep-research`,
  `$hoyeon-google-search`, and `$hoyeon-reference-seek`.
- Add native-agent adapters for `browser-explorer`, `docs-researcher`, and
  `external-researcher`.
- Keep chromux, Gemini, `gh`, and vendor scripts as Bash-first channels.
- Treat optional sources such as ProductHunt and Gemini as degradable when
  credentials or binaries are missing.

Validation:

- `scripts/codex-research-smoke.sh` exits 0.
- Installed wrappers contain resolved absolute canonical skill paths.
- A new Codex session exposes the `$hoyeon-*` research skill names and
  `hoyeon-*` research agent names.

## Resume Checklist

When resuming this migration:

1. Run `git status --short`.
2. Run `scripts/codex-blueprint-smoke.sh`.
3. Run `scripts/codex-execute-smoke.sh`.
4. Run `scripts/codex-research-smoke.sh`.
5. Confirm `.codex-plugin/plugin.json` still exposes `skills`.
6. Confirm `codex/agents/*.toml` still point to existing `agents/*.md` files.
7. Run `scripts/install-codex-agent-adapters.sh`.
8. Run `scripts/install-codex-skill-adapters.sh`.
9. Continue with true native-adapter dispatch after restarting Codex.

## MCP Reconsideration Gate

Do not add MCP until at least one of these is repeatedly observed:

- CLI JSON quoting failures.
- Race conditions around multi-agent task status updates.
- Shell output parsing becomes a recurring source of bugs.
- Codex App/CLI surfaces need a non-shell state API.

If MCP becomes necessary, start with only:

- `hoyeon_plan_get`
- `hoyeon_plan_validate`
- `hoyeon_task_status`
- `hoyeon_task_claim`
