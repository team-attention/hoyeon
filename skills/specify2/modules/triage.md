# Module: Triage

Mode selection and input parsing.

## Input

- args: User's command arguments (e.g., "add-auth --quick --autopilot")

## Output

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- feature_name: kebab-case name (e.g., "add-auth")

## Logic

### 1. Parse Flags

```
depth =
  "--quick" in args → "quick"
  "--thorough" in args → "thorough"
  else → "standard"

interaction =
  "--autopilot" in args → "autopilot"
  "--interactive" in args → "interactive"
  else → null (apply default later)
```

### 2. Extract Feature Name

Remove flags, convert to kebab-case:
- "Add user authentication --quick" → "add-user-authentication"
- "fix typo in README" → "fix-typo-in-readme"

### 3. Auto-detect Depth (if not explicit)

| Keywords | Detected Depth |
|----------|----------------|
| fix, typo, rename, bump, update, remove | `quick` |
| add, implement, new, create | `standard` |
| architecture, migrate, refactor, security, auth | `thorough` |

### 4. Apply Interaction Default

```
if interaction is null:
    interaction = "autopilot" if depth == "quick" else "interactive"
```

### 5. Validate & Output

```markdown
## Triage Result

- **Feature:** {feature_name}
- **Depth:** {depth}
- **Interaction:** {interaction}

Proceeding with {depth} depth, {interaction} mode.
```

## Behavior by Depth

| Depth | Additional Checks |
|-------|-------------------|
| quick | Warn if feature_name suggests complexity |
| standard | None |
| thorough | None |

## Behavior by Interaction

| Interaction | Behavior |
|-------------|----------|
| interactive | Output triage result, wait for implicit confirmation |
| autopilot | Output triage result, proceed immediately |
