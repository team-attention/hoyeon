---
name: init
description: |
  Initialize .dev/config.yml for worktree management.
  Use when user says "/init", "init", "initialize config", "setup worktree config".
  Scans project for common dev files and interactively creates worktree configuration.
allowed-tools:
  - Glob
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
validate_prompt: |
  Must contain:
  1. Evidence of project scanning (Glob calls for file patterns)
  2. AskUserQuestion with multiSelect for file selection
  3. .dev/config.yml creation with valid YAML (worktree.copy_files + worktree.base_dir)
  4. .gitignore update for .worktrees/
  5. Summary of what was created
---

# /init — Initialize Worktree Configuration

Create `.dev/config.yml` with project-specific worktree settings by scanning the project and letting the user choose which files to copy to new worktrees.

## Step 1: Check Existing Config

Check if `.dev/config.yml` already exists.

**If it exists:**

```
AskUserQuestion(
  question: ".dev/config.yml이 이미 존재합니다. 어떻게 할까요?",
  header: "Config 존재",
  options: [
    { label: "Merge", description: "기존 설정에 새로 발견된 파일 추가" },
    { label: "Overwrite", description: "기존 설정을 새로 덮어쓰기" },
    { label: "Skip", description: "아무것도 하지 않고 종료" }
  ]
)
```

- **Skip** → 결과 출력 후 종료
- **Merge** → 기존 copy_files를 읽어서 중복 제거 후 새 파일만 추가 후보로 표시
- **Overwrite** → 기존 무시하고 새로 생성

**If it doesn't exist:** → Step 2로 진행

## Step 2: Scan Project

Glob으로 아래 패턴을 탐지. **실제 존재하는 파일만** 후보 목록에 포함.

### Scan Patterns

| Category | Glob Pattern | Description |
|----------|-------------|-------------|
| Environment | `.env` | Base environment variables |
| Environment | `.env.*` | Environment variants (local, development, test, staging) |
| Editor | `.vscode/settings.json` | VS Code settings |
| Editor | `.idea/workspace.xml` | IntelliJ/WebStorm workspace |
| Editor | `.editorconfig` | Editor standards |
| Package | `.npmrc` | NPM registry config |
| Package | `.yarnrc.yml` | Yarn config |
| Formatting | `.prettierrc*` | Prettier config (any extension) |
| Linting | `.eslintrc*` | ESLint config (any extension) |
| TypeScript | `tsconfig.json` | TypeScript config |
| Docker | `docker-compose.override.yml` | Local docker overrides |

**Scan execution:**

```
# Run Glob for each pattern, collect existing files
found_files = []
for each pattern in scan_patterns:
    results = Glob(pattern)
    found_files.append(results)
```

**If no files found:** 출력 "스캔 결과 복사할 파일이 없습니다. 기본 config만 생성합니다." → Step 4로 (빈 copy_files)

**If merge mode:** 기존 copy_files에 이미 있는 파일은 후보에서 제외

## Step 3: Interactive File Selection

발견된 파일을 AskUserQuestion multiSelect로 표시.

```
AskUserQuestion(
  question: "새 worktree에 복사할 파일을 선택하세요.",
  header: "Copy files",
  options: [
    { label: ".env.local", description: "로컬 환경 변수" },
    { label: ".vscode/settings.json", description: "에디터 설정" },
    ...found files with descriptions
  ],
  multiSelect: true
)
```

**If user selects nothing:** 빈 copy_files로 진행 (기본값)

## Step 4: Validate

생성할 config를 검증:

- **copy_files**: 모든 경로가 상대경로 (leading `/` 없음, `..` 없음)
- **base_dir**: `{name}` 변수 포함 확인
- **YAML 구조**: `worktree.copy_files` (array), `worktree.base_dir` (string)

검증 실패 시 사용자에게 알리고 재선택 유도.

## Step 5: Write Config

```bash
mkdir -p .dev
```

`.dev/config.yml` 생성:

```yaml
worktree:
  copy_files:
    - {selected_file_1}
    - {selected_file_2}
  base_dir: ".worktrees/{name}"
```

**Merge mode:** 기존 copy_files + 새로 선택한 파일 (중복 제거) 합쳐서 작성. 기존 base_dir 유지.

## Step 6: Update .gitignore

`.gitignore`에 `.worktrees/` 항목이 없으면 추가.

```bash
# Check and append if missing
grep -qxF '.worktrees/' .gitignore 2>/dev/null || echo '.worktrees/' >> .gitignore
```

- `.gitignore` 파일이 없으면 생성
- 이미 `.worktrees/` 있으면 skip (idempotent)

## Step 6.5: Install twig CLI

`twig` CLI가 설치되어 있지 않으면 설치 제안.

```bash
# Check if twig is available
if ! command -v twig &> /dev/null; then
  # twig not installed
fi
```

**If twig not installed:**

```
AskUserQuestion(
  question: "twig CLI를 설치하시겠습니까? 터미널에서 직접 worktree 관리가 가능합니다.",
  header: "twig CLI",
  options: [
    { label: "Install", description: "~/.local/bin/twig에 설치" },
    { label: "Skip", description: "나중에 수동으로 설치" }
  ]
)
```

**If Install:**

```bash
# Get plugin root (where this skill is located)
PLUGIN_ROOT="${baseDir}/../.."

# Run install script
bash "$PLUGIN_ROOT/scripts/install-twig.sh"
```

**If Skip:** 설치 방법만 안내하고 진행

```
twig CLI를 나중에 설치하려면:
  ~/.claude/plugins/.../hoyeon/scripts/install-twig.sh
```

## Step 7: Summary

생성 결과 출력:

```
Config created: .dev/config.yml

  copy_files ({N}):
    - .env.local
    - .vscode/settings.json

  base_dir: .worktrees/{name}

  .gitignore: .worktrees/ added

  twig CLI: {installed | not installed}

To edit: open .dev/config.yml
To use: /worktree create <name>
Terminal: twig status
```

## References

- Config schema: `skills/worktree/references/config-schema.md`
- Worktree skill: `skills/worktree/SKILL.md`
