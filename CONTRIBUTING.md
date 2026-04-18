# Contributing

## Getting Started

Install the plugin in Claude Code:

```bash
claude plugin add team-attention/hoyeon
```

This registers all skills, agents, and hooks defined by the plugin.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/team-attention/hoyeon.git
   cd hoyeon
   git checkout develop
   ```

2. Install the CLI globally:
   ```bash
   npm install -g @team-attention/hoyeon-cli
   ```

3. Verify installation:
   ```bash
   hoyeon-cli --version
   ```

### Directory Structure

```
hoyeon/
  .claude/
    skills/       # Skill definitions (SKILL.md per skill)
    agents/       # Agent definitions (.md files)
    scripts/      # Hook scripts (must be chmod +x)
    settings.json # Hook registrations and plugin config
  .claude-plugin/
    plugin.json       # Plugin metadata + version
    marketplace.json  # Marketplace listing + version
  cli/
    package.json  # CLI package + version
  docs/           # Documentation and learnings
  .playground/    # Experiments (git-ignored)
```

## Plugin Structure

- **Skills** live in `.claude/skills/<skill-name>/SKILL.md`. Each skill has YAML frontmatter (name, description, optional `validate_prompt`) and a markdown body defining its behavior.
- **Agents** live in `.claude/agents/<agent-name>.md` with the same frontmatter convention.
- **Hooks** are shell scripts in `.claude/scripts/`. A hook script must be both executable and registered in `.claude/settings.json` under `hooks.<EventType>.matchers[]` to fire. Creating the file alone is not enough.

## Git Workflow

| Branch | Purpose |
|--------|---------|
| `main` | Release only. Never commit directly. |
| `develop` | Integration branch. All feature branches merge here. |
| `feat/<name>` | Feature branches. Created from `develop`. |

### Rules

- Create feature branches from `develop`:
  ```bash
  git checkout develop && git checkout -b feat/my-feature
  ```
- Merge back to `develop` with `--no-ff`:
  ```bash
  git checkout develop && git merge feat/my-feature --no-ff
  ```
- Release merges go from `develop` into `main` (also `--no-ff`).

## Versioning

Three files must be bumped together in a single commit on `develop`:

1. `.claude-plugin/plugin.json`
2. `.claude-plugin/marketplace.json`
3. `cli/package.json`

The CLI package (`@team-attention/hoyeon-cli`) version is always kept in sync with the plugin version.

## Testing

This project uses a 4-Tier Testing Model:

1. **Unit** -- individual function/module tests
2. **Integration** -- cross-module interaction tests
3. **E2E** -- full workflow tests
4. **Agent Sandbox** -- agent-level behavioral tests

See [VERIFICATION.md](VERIFICATION.md) for full details and conventions.

## Submitting Changes

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop && git checkout -b feat/descriptive-name
   ```
2. Make your changes. Use `.playground/` for any experimentation.
3. Ensure hook scripts are executable (`chmod +x .claude/scripts/*.sh`).
4. If you added a new hook, register it in `.claude/settings.json`.
5. Open a pull request targeting `develop`.
6. In the PR description, summarize what changed and why.
