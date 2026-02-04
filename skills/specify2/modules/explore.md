# Module: Explore

Codebase exploration and Intent classification.

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- feature_name: from Triage
- user_request: from Triage (original user message for agent prompts)

## Output

- exploration_results: { patterns, structure, commands, documentation, ux_review }
- intent_type: one of 7 types
- intent_strategy: corresponding strategy

## Variable Convention

> **IMPORTANT**: When invoking Task, replace all `{variable}` placeholders with actual values:
> - `{feature_name}` → from Input
> - `{user_request}` → from Input
> - `{intent_type}` → from Intent Classification result (Section 2)
> - `(summarize: X)` → Claude generates this from context/exploration results

## Behavior by Depth

| Depth | Agents | Intent Classification |
|-------|--------|----------------------|
| quick | 2 (Explore×2) | Basic |
| standard | 4 (Explore×2, docs-researcher, ux-reviewer) | Full |
| thorough | 4 (same agents, deeper prompts) | Deep |

> **Thorough의 gap-analyzer, external-researcher는 Analysis 모듈에서 실행됩니다.**

## Logic

### 1. Launch Parallel Exploration

> **IMPORTANT: Do NOT use `run_in_background: true`.** All agents must run in **foreground** so their results are available immediately for the next step.

#### Quick (2 agents)

```
Task(subagent_type="Explore",
     prompt="Find: existing patterns for {feature_name}. Report as file:line format.")

Task(subagent_type="Explore",
     prompt="Find: project structure, package.json scripts for lint/test/build commands")
```

#### Standard (4 agents)

```
# Above 2 plus:

Task(subagent_type="docs-researcher",
     prompt="Find internal documentation relevant to {feature_name}. Search docs/, ADRs, READMEs, config files for conventions, architecture decisions, and constraints.")

Task(subagent_type="ux-reviewer",
     prompt="""
User's Goal: {user_request}
Current Understanding: (summarize: what feature/change is being proposed based on user_request)
Intent Type: {intent_type}
Affected Area: (summarize: which part of the product this change touches, from exploration results)

Evaluate how this change affects existing user experience.
Focus on: current UX flow, simplicity impact, and better alternatives.""")
```

#### Thorough (4 agents, deeper prompts)

```
# Same 4 agents as Standard, but with enhanced prompts:

Task(subagent_type="Explore",
     prompt="Deep dive: existing patterns for {feature_name}. Include edge cases, error handling patterns. Report as file:line format.")

Task(subagent_type="Explore",
     prompt="Full audit: project structure, all package.json scripts, CI/CD config, test infrastructure")

Task(subagent_type="docs-researcher",
     prompt="Comprehensive search: ALL documentation relevant to {feature_name}. Include docs/, ADRs, READMEs, config files, inline comments with TODO/FIXME.")

Task(subagent_type="ux-reviewer",
     prompt="""
User's Goal: {user_request}
Current Understanding: (summarize: detailed description of proposed changes)
Intent Type: {intent_type}
Affected Area: (summarize: full scope of areas impacted by this change)

Deep UX evaluation:
- Full user journey mapping
- Edge case UX scenarios
- Accessibility considerations
- Existing UX patterns to preserve""")
```

> **Note:** gap-analyzer와 external-researcher는 Analysis 모듈에서 실행됩니다.
> Explore는 탐색에 집중하고, Analysis는 분석에 집중합니다.

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
 - 구조: {summary of directory structure}
 - 관련 패턴: {2-3 discovered patterns}
 - 내부 문서: {relevant ADRs/conventions}
 - 프로젝트 명령어: lint/test/build
 - UX 리뷰: {UX flow + concerns} (standard/thorough only)
 - Intent: {intent_type} → {intent_strategy}

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
