---
name: tech-decision
description: This skill should be used when the user asks about "technical decision", "what to use", "A vs B", "comparison analysis", "library selection", "architecture decision", "which one to use", "tradeoffs", "tech selection", "implementation approach", or needs deep analysis for technical decisions. Provides systematic multi-source research and synthesized recommendations.
version: 0.1.0
---

# Tech Decision - Deep Technical Decision Analysis

Skill for systematically analyzing technical decisions and deriving comprehensive conclusions.

## Core Principle

**Conclusion First**: All reports present conclusion first, then provide evidence.

## Use Cases

- Library/framework selection (React vs Vue, Prisma vs TypeORM)
- Architecture pattern decisions (Monolith vs Microservices, REST vs GraphQL)
- Implementation approach selection (Server-side vs Client-side, Polling vs WebSocket)
- Tech stack decisions (language, database, infrastructure, etc.)

## Decision Workflow

### Phase 1: Problem Definition

Clarify decision topic and context:

1. **Identify Topic**: What needs to be decided?
2. **Identify Options**: What are the choices to compare?
3. **Establish Criteria**: What criteria to evaluate by?
   - Performance, learning curve, ecosystem, maintainability, cost, etc.
   - Set priority based on project characteristics
   - See **`references/evaluation-criteria.md`** for detailed criteria

### Phase 2: Parallel Information Gathering

Gather information from multiple sources simultaneously. **Must run in parallel**:

```
┌─────────────────────────────────────────────────────────────┐
│  Run simultaneously (parallel with Task tool)               │
├─────────────────────────────────────────────────────────────┤
│  1. codebase-explorer agent                                 │
│     → Analyze existing codebase, identify patterns/constraints│
│                                                             │
│  2. docs-researcher agent                                   │
│     → Research official docs, guides, best practices        │
│                                                             │
│  3. Skill: dev-scan                                         │
│     → Gather community opinions (Reddit, HN, Dev.to, etc.)  │
│                                                             │
│  4. Skill: agent-council                                    │
│     → Gather various AI expert perspectives                 │
│                                                             │
│  5. [Optional] Context7 MCP                                 │
│     → Query latest docs per library                         │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Synthesis Analysis

Run tradeoff-analyzer agent with gathered information:

- Organize pros/cons per option
- Score by evaluation criteria
- Organize conflicting opinions
- Evaluate reliability (source-based)

### Phase 4: Final Report Generation

Generate conclusion-first comprehensive report with decision-synthesizer agent (detailed template: **`references/report-template.md`**):

```markdown
# Technical Decision Report: [Topic]

## Conclusion (Executive Summary)
**Recommendation: [Option X]**
[1-2 sentence key reason]

## Evaluation Criteria and Weights
| Criteria | Weight | Description |
|------|--------|------|
| Performance | 30% | ... |
| Learning Curve | 20% | ... |

## Option Analysis

### Option A: [Name]
**Pros:**
- [Pro 1] (Source: official docs)
- [Pro 2] (Source: Reddit r/webdev)

**Cons:**
- [Con 1] (Source: HN discussion)

**Good fit for:** [Scenario]

## Comprehensive Comparison
| Criteria | Option A | Option B | Option C |
|------|----------|----------|----------|
| Performance | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Total** | **X pts** | **Y pts** | **Z pts** |

## Recommendation Rationale
1. [Key reason 1 with source]
2. [Key reason 2 with source]

## Risks and Considerations
- [Consideration 1]
- [Consideration 2]
```

## Resources Used

### Agents (this plugin)

| Agent | Role |
|-------|------|
| `codebase-explorer` | Analyze existing codebase, identify patterns/constraints |
| `docs-researcher` | Research official docs, guides, best practices |
| `tradeoff-analyzer` | Organize pros/cons, comparative analysis |
| `decision-synthesizer` | Generate conclusion-first final report |

### Existing Skills (call via Skill tool)

| Skill | Purpose | How to Call |
|-------|------|-----------|
| `dev-scan` | Community opinions from Reddit, HN, Dev.to | `Skill: dev-scan` |
| `agent-council` | Gather various AI expert perspectives | `Skill: agent-council` |

## Quick Execution Guide

### 1. Simple Comparison (A vs B)

```
User: "React vs Vue which is better?"

Execute:
1. Task docs-researcher + Task codebase-explorer (parallel)
2. Skill: dev-scan
3. Task tradeoff-analyzer
4. Task decision-synthesizer
```

### 2. Deep Analysis (complex decision)

```
User: "Thinking about which state management library to use"

Execute:
1. Task codebase-explorer (analyze current state)
2. Parallel:
   - Task docs-researcher (Redux, Zustand, Jotai, Recoil, etc.)
   - Skill: dev-scan
   - Skill: agent-council
3. Task tradeoff-analyzer
4. Task decision-synthesizer
```

## Notes

1. **Provide Context**: More accurate analysis with project characteristics, team size, existing tech stack
2. **Confirm Criteria**: First confirm what criteria matter to user
3. **Show Reliability**: Mark unclear or outdated sources
4. **Conclusion First**: Always present conclusion first
