# Project Guidelines

## Experimentation

Use `.playground/` directory for experiments and testing. This directory is git-ignored.

## Agent Development

### validation_prompt

Agent의 출력을 자동으로 검증하려면 frontmatter에 `validation_prompt` 필드를 추가합니다.

```yaml
---
name: my-agent
description: My custom agent
validation_prompt: |
  Must contain X, Y, Z sections.
  Output should be in JSON format.
---
```

**동작 방식:**
1. `SubagentStop` hook이 agent 종료 감지
2. `.claude/agents/{agent_type}.md`에서 `validation_prompt` 파싱
3. Agent의 마지막 출력을 추출
4. `claude -p --model haiku`로 검증 기준 충족 여부 확인
5. 미충족시 agent를 block하여 재작업 유도

**검증 결과:**
```
✅ reviewer validation passed
⚠️ worker validation failed: Missing verification section
```

### 예시: 각 Agent의 validation_prompt

| Agent | 검증 기준 |
|-------|----------|
| reviewer | OKAY/REJECT verdict + justification |
| gap-analyzer | 4개 섹션 (Missing Req, AI Pitfalls, Must NOT, Questions) |
| worker | JSON output (outputs, verification, learnings) |
| git-master | STYLE DETECTION + COMMIT PLAN + COMMIT SUMMARY |
| librarian | Research Report (Summary, Findings, Sources, Recommendations) |

### 구현 파일

- `.claude/scripts/dev-subagent-start.sh` - agent 시작 추적
- `.claude/scripts/dev-subagent-stop.sh` - 통합 검증 실행
- `.claude/settings.local.json` - SubagentStart/SubagentStop hook 등록
