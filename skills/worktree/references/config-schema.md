# Worktree Configuration Schema

## Overview

The `.dev/config.yml` file contains project-specific configuration for worktree management. This file is optional and defines default behaviors for worktree creation and setup.

## File Location

```
.dev/config.yml
```

This file should be placed in the project root directory under `.dev/`.

## Schema Definition

### Full Schema

```yaml
worktree:
  # List of files to copy from main worktree to new worktree
  copy_files:
    - string
    - ...

  # Base directory path for worktree creation
  # Supports template variables: {repo}, {name}
  base_dir: string
```

## Fields

### worktree.copy_files

List of files to automatically copy from the main worktree to newly created worktrees.

| Property | Type | Required | Default |
|----------|------|----------|---------|
| `copy_files` | `array<string>` | No | `[]` (empty) |

**Purpose**: Ensure new worktrees have necessary configuration files (e.g., environment variables, local settings) without manual copying.

**Common use cases**:
- Environment files (`.env`, `.env.local`)
- Local configuration (`.vscode/settings.json`)
- Build cache files
- API credentials (ensure these are git-ignored!)

**Example**:

```yaml
worktree:
  copy_files:
    - .env
    - .env.local
    - .vscode/settings.json
```

**Behavior**:
- Files are copied **after** worktree creation
- Copies from main worktree root to new worktree root
- Preserves relative paths (supports nested files)
- Skips silently if source file doesn't exist
- Overwrites destination file if it exists

**Copy command equivalent**:

```bash
# For each file in copy_files
for file in "${copy_files[@]}"; do
  if [ -f "$MAIN_WORKTREE/$file" ]; then
    mkdir -p "$(dirname "$NEW_WORKTREE/$file")"
    cp "$MAIN_WORKTREE/$file" "$NEW_WORKTREE/$file"
  fi
done
```

### worktree.base_dir

Template string defining the directory path where new worktrees will be created.

| Property | Type | Required | Default |
|----------|------|----------|---------|
| `base_dir` | `string` | No | `../.worktrees/{name}` |

**Purpose**: Customize worktree directory structure and location.

**Template variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `{repo}` | Repository name (from git remote or directory) | `oh-my-claude-code` |
| `{name}` | Worktree/spec name | `auth-feature` |

**Example configurations**:

```yaml
# Default: Create worktrees in consolidated directory
worktree:
  base_dir: "../.worktrees/{name}"
# Result: ../.worktrees/auth-feature/

# Custom: Create worktrees in dedicated directory
worktree:
  base_dir: "~/worktrees/{repo}/{name}"
# Result: ~/worktrees/oh-my-claude-code/auth-feature/

# Flat structure: All worktrees in one directory
worktree:
  base_dir: "~/dev/{name}"
# Result: ~/dev/auth-feature/
```

**Behavior**:
- Path is resolved relative to current working directory if not absolute
- Directories are created automatically if they don't exist
- Template variables are replaced during worktree creation
- Invalid paths cause worktree creation to fail with error

## Default Behavior

When `.dev/config.yml` doesn't exist or fields are omitted:

| Field | Default Value | Behavior |
|-------|---------------|----------|
| `copy_files` | `[]` | No files are copied |
| `base_dir` | `../.worktrees/{name}` | Worktrees created in consolidated directory |

## Complete Example

### Minimal Configuration

```yaml
# .dev/config.yml
worktree:
  copy_files:
    - .env
```

### Full Configuration

```yaml
# .dev/config.yml
worktree:
  # Copy environment and local settings
  copy_files:
    - .env
    - .env.local
    - .env.test
    - .vscode/settings.json
    - .idea/workspace.xml

  # Create worktrees in dedicated directory
  base_dir: "~/worktrees/{repo}/{name}"
```

### Production-Ready Configuration

```yaml
# .dev/config.yml
worktree:
  # Copy essential files for development
  copy_files:
    - .env.local          # Local environment variables
    - .env.test           # Test environment config
    - .npmrc              # NPM registry config
    - .vscode/settings.json  # Editor settings

  # Organize worktrees by repo
  base_dir: "../{repo}-worktrees/{name}"
```

## Configuration Loading

The worktree skill loads configuration in the following order:

1. Check if `.dev/config.yml` exists
2. Parse YAML file if found
3. Extract `worktree` section
4. Apply defaults for missing fields
5. Validate values (paths, file existence)

**Loading logic**:

```bash
# Check if config exists
if [ -f ".dev/config.yml" ]; then
  # Parse with yq
  copy_files=$(yq -r '.worktree.copy_files[]' .dev/config.yml 2>/dev/null)
  base_dir=$(yq -r '.worktree.base_dir' .dev/config.yml 2>/dev/null)
fi

# Apply defaults if not set
copy_files=${copy_files:-""}
base_dir=${base_dir:-"../.worktrees/{name}"}
```

## Validation Rules

### copy_files Validation

- Must be array of strings
- Each path should be relative (no leading `/`)
- Files should exist in main worktree (warning if missing)
- Paths should not contain `..` (security risk)

```bash
# Validation example
for file in "${copy_files[@]}"; do
  if [[ "$file" == /* ]]; then
    echo "Error: Absolute paths not allowed: $file"
    exit 1
  fi
  if [[ "$file" == *..* ]]; then
    echo "Error: Parent directory references not allowed: $file"
    exit 1
  fi
done
```

### base_dir Validation

- Must be non-empty string
- Must contain at least `{name}` variable (to ensure unique paths)
- Should not contain shell special characters (`;`, `|`, `&`)

```bash
# Validation example
if [[ ! "$base_dir" =~ \{name\} ]]; then
  echo "Error: base_dir must contain {name} variable"
  exit 1
fi
```

## Use Cases

### Use Case 1: Development with Secrets

When working with API keys or credentials:

```yaml
worktree:
  copy_files:
    - .env.local
    - .secrets/api-keys.json
  base_dir: "../.worktrees/{name}"
```

**Important**: Ensure these files are in `.gitignore`!

### Use Case 2: Multiple Environments

When testing different configurations:

```yaml
worktree:
  copy_files:
    - .env.development
    - .env.staging
    - .env.production
  base_dir: "~/projects/{repo}/environments/{name}"
```

### Use Case 3: Shared Build Cache

When reusing build artifacts:

```yaml
worktree:
  copy_files:
    - node_modules/.cache
    - .next/cache
  base_dir: "../.worktrees/{name}"
```

### Use Case 4: Team Conventions

Standardize worktree location across team:

```yaml
worktree:
  copy_files:
    - .editorconfig
    - .prettierrc
  base_dir: "~/workspace/{repo}/features/{name}"
```

## Migration Guide

### From No Config to Config

If you're currently using default behavior:

```bash
# 1. Create config file
mkdir -p .dev
cat > .dev/config.yml << EOF
worktree:
  copy_files: []
  base_dir: "../.worktrees/{name}"
EOF

# 2. Add files you want to copy
# Edit .dev/config.yml

# 3. Commit config
git add .dev/config.yml
git commit -m "Add worktree configuration"
```

### Changing base_dir

If you need to change worktree location:

```bash
# 1. Update config
yq -i '.worktree.base_dir = "~/worktrees/{repo}/{name}"' .dev/config.yml

# 2. New worktrees will use new path
# 3. Existing worktrees are not affected (manual move required)
```

## CLI Usage

The `twig` CLI reads the same configuration file:

```bash
# Create worktree - reads .dev/config.yml for base_dir and copy_files
twig create my-feature

# Status - shows worktrees with progress
twig status

# Spawn Claude session in tmux
twig spawn my-feature "Start /execute"

# Attach to existing session
twig attach my-feature

# Cleanup completed worktree
twig cleanup my-feature
```

The CLI and `/worktree` skill use identical logic, so behavior is consistent regardless of which interface you use.

## File Structure

After worktree creation, the following files exist:

```
worktree/
├── .dev/
│   ├── local.json          # Worktree identity (JSON, gitignored)
│   └── specs/{name}/       # Copied from main if exists
│       ├── PLAN.md
│       └── ...
└── ... (project files)
```

The `.dev/local.json` file contains worktree metadata:

```json
{
  "name": "my-feature",
  "branch": "feat/my-feature",
  "plan": ".dev/specs/my-feature/PLAN.md",
  "created_at": "2026-02-03T...",
  "source": "main"
}
```

## Related

- [status-table.md](./status-table.md) - Worktree status monitoring
- `/worktree` skill - Worktree management commands
- `twig` - Standalone CLI tool
- Git worktree documentation: `git help worktree`
