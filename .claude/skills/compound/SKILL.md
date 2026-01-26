---
name: compound
description: |
  This skill should be used when the user says "/compound", "compound this",
  "document learnings", "save what we learned", or after completing a PR.
  Extracts knowledge from PR context and saves to docs/learnings/.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - AskUserQuestion
---

# Compound Skill

PR 기준으로 동작하여 지식을 `docs/learnings/`에 구조화하여 축적합니다.

## Workflow

### Phase 1: Context 수집

1. **PR 번호/브랜치 확인**
   - 인자로 PR 번호가 주어졌으면 사용
   - 없으면 현재 브랜치에서 PR 찾기: `gh pr view --json number,body,title`
   - **PR이 없으면**: 사용자에게 PR 번호를 직접 입력받거나, PR 없이 진행할지 확인

2. **Plan 경로 추출**
   - PR body에서 Plan 경로 패턴 찾기: `.dev/specs/{name}/PLAN.md`
   - 정규식: `\.dev/specs/[^/]+/PLAN\.md`
   - **Plan 경로가 없으면**: 사용자에게 spec name을 직접 입력받거나 `.dev/specs/` 디렉토리 목록에서 선택

3. **Context 경로 도출**
   - Plan 경로에서 spec name 추출
   - Context 디렉토리: `.dev/specs/{name}/context/`

4. **병렬 수집** (다음 명령들을 동시 실행, 파일이 없으면 skip)
   ```bash
   # Context 파일들 (없으면 빈 값으로 처리)
   cat .dev/specs/{name}/context/learnings.md 2>/dev/null || echo ""
   cat .dev/specs/{name}/context/decisions.md 2>/dev/null || echo ""
   cat .dev/specs/{name}/context/issues.md 2>/dev/null || echo ""

   # PR 코멘트 (PR 번호가 있을 때만)
   gh pr view {pr_number} --comments

   # 리뷰 코멘트 (gh api는 :owner/:repo 자동 치환 지원)
   gh api repos/:owner/:repo/pulls/{pr_number}/reviews
   ```

**에러 핸들링:**
- Context 파일이 하나도 없고 PR 코멘트도 없으면 → 사용자에게 알리고 수동 입력 요청
- 최소 1개 이상의 소스가 있어야 문서 생성 진행

### Phase 2: 지식 추출 및 분류

#### 2.1 PR Comments에서 유용한 피드백 추출

**유용한 피드백 판단 기준:**
- 코드 개선 제안 (suggestion)
- 버그/이슈 지적
- 패턴/best practice 언급
- "이렇게 하면 더 좋다" 류의 조언
- 리뷰어가 approve하면서 남긴 코멘트

**필터링할 것:**
- 단순 질문 ("이거 뭐야?")
- 확인 요청 ("이거 맞아?")
- 승인만 있는 코멘트 ("LGTM", "Approved")
- 봇 코멘트

**추출 키워드:**
- "suggest", "recommend", "better", "instead"
- "pattern", "practice", "convention"
- "issue", "bug", "fix"
- "learned", "TIL", "note"

**추출 정보:**
- author
- body
- file_path (inline comment인 경우)
- created_at

#### 2.2 Context 파일 분석

| 파일 | 용도 |
|------|------|
| learnings.md | 직접 배운 점 |
| decisions.md | 의사결정 이유 |
| issues.md | out of scope 이슈 (미래 참조용) |

#### 2.3 종합 판단

1. 수집된 소스에서 문서화할 가치 판단
2. 중복 확인: `docs/learnings/` 검색
3. 문제 유형 분류 (problem_type) - `.claude/skills/compound/references/problem-types.md` 참조
4. 태그 생성

### Phase 3: 문서 생성

1. **YAML frontmatter 생성**
   ```yaml
   pr_number: {PR_NUMBER}
   date: {YYYY-MM-DD}
   problem_type: {TYPE}
   tags: [{TAGS}]
   plan_path: {PLAN_PATH}
   ```

2. **템플릿 기반 문서 작성**
   - 템플릿 위치: `.claude/skills/compound/templates/LEARNING_TEMPLATE.md`
   - Read 툴로 템플릿 읽어서 placeholders 치환

3. **파일명 결정**
   - 형식: `{YYYY-MM-DD}-{short-title}.md`
   - 예: `2024-01-15-api-error-handling.md`

4. **저장**
   - 경로: `docs/learnings/{filename}.md`

5. **Cross-reference 추가** (관련 문서가 있으면)
   - 기존 문서의 Related 섹션에 새 문서 링크 추가

## 사용 예시

```
# PR 번호 지정
/compound 123

# 현재 브랜치의 PR 사용
/compound
```

## 출력

생성된 문서 경로와 요약을 출력합니다:

```
Created: docs/learnings/2024-01-15-api-error-handling.md

Summary:
- Problem Type: error-handling
- Tags: api, typescript, validation
- Sources: learnings.md, 2 PR comments
```

---

<!-- TODO: 미래 확장 -->
<!-- - [ ] Session ID 기반 user feedback 수집 -->
<!-- - [ ] CLAUDE.md 자동 업데이트 제안 -->
<!-- - [ ] 기존 문서 UPDATE 감지 -->
<!-- - [ ] problem_type별 자동 분류 (docs/solutions/{type}/) -->
