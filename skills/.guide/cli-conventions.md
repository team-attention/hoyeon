# CLI Conventions for hoyeon-cli

## Single Source of Truth

`hoyeon-cli spec guide <section>` is the authoritative source for JSON field names, types, and structures.
SKILL.md files must NOT hardcode JSON body examples — they drift when the CLI schema changes.

## Merge Pattern

Every `spec merge` call follows this 3-step pattern:

1. **Read guide** — `hoyeon-cli spec guide <section>` to check field names and types
2. **Construct JSON** — build merge payload matching the guide schema
3. **Merge** — `hoyeon-cli spec merge <spec-path> [--append|--patch] --json "$(cat /tmp/spec-merge.json)"`

### File-based JSON passing (required)

Always pass merge JSON via file to avoid zsh shell escaping issues:

```bash
cat > /tmp/spec-merge.json << 'EOF'
{ ... }
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

### Merge flags

| Flag | When to use |
|------|-------------|
| (none) | First-time write — replaces section entirely (deep-merge) |
| `--append` | Add items to existing arrays (decisions, assumptions) |
| `--patch` | Update existing items by ID without duplicating (task re-runs) |

Run `hoyeon-cli spec guide merge` to verify flag semantics.

## Validation Pattern

After every merge, the CLI auto-validates. On failure:

1. Run `hoyeon-cli spec guide <failed-section>` to check expected schema
2. Fix JSON to match
3. Retry merge (max 2 blind retries, then escalate)

## Available guide sections

```
meta, context, tasks, requirements, constraints, history,
verification, external, scenario, verify, merge, acceptance-criteria
```

Run `hoyeon-cli spec guide` to see the full list (may change over time).

## SKILL.md Writing Rules

When writing merge instructions in SKILL.md:

- **DO**: Write numbered steps referencing `spec guide <section>`
- **DO**: Mention which top-level keys to merge (e.g., `context.decisions[]`)
- **DO**: Mention which merge flag to use (`--append`, `--patch`, or default)
- **DO NOT**: Include JSON body examples with field values
- **DO NOT**: Hardcode verify schema (type/run/expect structure)
- **DO NOT**: Hardcode scenario field names

### Example (good)

```markdown
1. Run `hoyeon-cli spec guide context` to check `decisions` field structure
2. Construct JSON with `context.decisions[]` (id, decision, rationale, alternatives_rejected)
3. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)"`
```

### Example (bad — will break when schema changes)

```markdown
\```bash
cat > /tmp/spec-merge.json << 'EOF'
{ "context": { "decisions": [{"id": "D1", "decision": "...", ...}] } }
EOF
hoyeon-cli spec merge ...
\```
```

## Other CLI Commands (non-merge)

These commands have stable interfaces and can be referenced directly:

| Command | Purpose | Safe to inline? |
|---------|---------|-----------------|
| `spec init` | Create initial spec.json | Yes — flags are stable |
| `spec validate` | Full schema validation | Yes |
| `spec check` | Source.ref integrity + orphan check | Yes |
| `spec coverage --layer <layer>` | Per-layer completeness | Yes |
| `spec plan` | DAG visualization | Yes |
| `spec sandbox-tasks` | Auto-generate sandbox tasks | Yes |
| `session set --sid` | Set session state | Yes |
| `session get --sid` | Get session state | Yes |
| `settings validate` | Validate hook paths | Yes |
