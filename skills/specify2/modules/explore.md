# Module: Explore

Codebase exploration and Intent classification.

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- feature_name: from Triage

## Output

- exploration_results: { patterns, structure, commands, documentation, ux_review }
- intent_type: one of 7 types
- intent_strategy: corresponding strategy

## Behavior by Depth

| Depth | Agents | Intent Classification |
|-------|--------|----------------------|
| quick | 2 (Explore×2) | Basic |
| standard | 4 (Explore×2, docs-researcher, ux-reviewer) | Full |
| thorough | 6 (above + gap-analyzer, external-researcher) | Deep |

## Logic

### 1. Launch Parallel Exploration

> **IMPORTANT: Do NOT use `run_in_background: true`.** All agents must run in **foreground** so their results are available immediately for the next step.

#### Quick (2 agents)

```
Task(subagent_type="Explore",
     prompt="Find: existing patterns for [feature]. Report as file:line format.")

Task(subagent_type="Explore",
     prompt="Find: project structure, package.json scripts for lint/test/build commands")
```

#### Standard (4 agents)

```
# Above 2 plus:

Task(subagent_type="docs-researcher",
     prompt="Find internal documentation relevant to [feature]. Search docs/, ADRs, READMEs, config files for conventions, architecture decisions, and constraints.")

Task(subagent_type="ux-reviewer",
     prompt="""
User's Goal: [user's stated goal]
Current Understanding: [brief description of what's being proposed]
Intent Type: [classified intent from exploration]
Affected Area: [which part of the product the change touches]

Evaluate how this change affects existing user experience.
Focus on: current UX flow, simplicity impact, and better alternatives.""")
```

#### Thorough (6 agents)

```
# Above 4 plus:

Task(subagent_type="gap-analyzer",
     prompt="Pre-analyze potential gaps and pitfalls for [feature]. Identify missing requirements, constraints, and 'must NOT do' items.")

Task(subagent_type="external-researcher",
     prompt="Research best practices and official docs for [relevant tech]. Focus on migration guides, common pitfalls, and recommended patterns.")
```

### 2. Intent Classification

Based on exploration results, classify intent:

| Intent Type | Detection Signals | Strategy |
|-------------|-------------------|----------|
| **Refactoring** | Duplicate code, complexity metrics | Safety first, regression prevention |
| **New Feature** | No existing pattern, new file needed | Pattern exploration, integration points |
| **Bug Fix** | Error logs, failing tests | Reproduce → Root cause → Fix |
| **Architecture** | System-wide impact, multiple services | Trade-off analysis |
| **Research** | No code changes expected | Investigation only, NO implementation |
| **Migration** | Version upgrade, library change | Phased approach, rollback plan |
| **Performance** | Slow queries, profiler data | Measure first, profile → optimize |

### 3. Present Exploration Summary

```markdown
"코드베이스 탐색 결과:
 - 구조: [주요 디렉토리 요약]
 - 관련 패턴: [발견된 패턴 2-3개]
 - 내부 문서: [관련 ADR/컨벤션]
 - 프로젝트 명령어: lint/test/build
 - UX 리뷰: [현재 UX 흐름 + 우려사항] (standard/thorough only)
 - Intent: [분류된 Intent] → [전략]

이 맥락이 맞는지 확인 후 진행하겠습니다."
```

## Behavior by Interaction

| Interaction | Summary Presentation |
|-------------|---------------------|
| interactive | Present summary, wait for user confirmation |
| autopilot | Present summary, proceed immediately |

## Intent-Specific Actions

After classification, note required actions for Interview/Analysis:

| Intent | Required Before Plan |
|--------|---------------------|
| Refactoring | Identify existing tests |
| Bug Fix | Get reproduction steps |
| Architecture | Consider agent-council |
| Migration | External docs critical |
| Performance | Baseline measurement |
