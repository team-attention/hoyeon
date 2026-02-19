---
name: bugfix
description: |
  Root cause 기반 원샷 버그픽스. debugger 진단 → worker 수정 → verify → commit.
  /bugfix "에러 설명"
  Adaptive mode: debugger의 Severity 판정(SIMPLE/COMPLEX)에 따라 자동 분기.
allowed_tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Edit
  - Write
  - AskUserQuestion
validate_prompt: |
  Must complete with one of:
  1. Fix committed (git-master output with COMMIT SUMMARY)
  2. Circuit breaker triggered (3 failed attempts documented)
  3. Escalated to /specify (with bugfix-attempts.md saved)
  Must NOT: skip root cause analysis, apply multiple fixes simultaneously.
---

# /bugfix Skill

Root cause 기반 원샷 버그픽스. 진단 → 수정 → 검증 → 커밋을 최소 에이전트 호출로 완료한다.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
증거 없는 완료 선언 금지
3회 실패 시 반드시 멈춤
```

## Architecture

```
/bugfix "에러 설명"

Phase 1: DIAGNOSE ─────────────────────────────────
  debugger + verification-planner (항상 병렬)
  + gap-analyzer (COMPLEX일 때만)
  → User 확인

Phase 2: FIX (max 3 attempts) ─────────────────────
  worker (최소 수정) → Bash 검증 (A-items 실행)
  → Pass: Phase 3
  → Fail + attempt < 3: 재시도
  → Fail + attempt >= 3: CIRCUIT BREAKER

Phase 3: REVIEW & COMMIT ──────────────────────────
  code-reviewer (COMPLEX일 때만) → git-master
```

## Adaptive Mode

모드 선택을 사용자에게 묻지 않는다. debugger의 **Severity** 판정에 따라 자동 분기:

| Severity | Phase 1 | Phase 2 | Phase 3 |
|----------|---------|---------|---------|
| **SIMPLE** | debugger + verification-planner | worker → Bash verify | git-master |
| **COMPLEX** | debugger + verification-planner + gap-analyzer | worker → Bash verify | code-reviewer → git-master |

에이전트 호출 횟수:
- SIMPLE: 4회 (debugger, verification-planner, worker, git-master)
- COMPLEX: 6회 (debugger, verification-planner, gap-analyzer, worker, code-reviewer, git-master)

---

## Phase 1: DIAGNOSE

### Step 1.1: Parse Input

사용자 입력에서 추출:
- **Bug description**: 에러 메시지, 증상, 재현 스텝
- **Error output**: 스택 트레이스, 테스트 실패 로그 (있으면)
- **Context**: 관련 파일, 최근 변경사항 (있으면)

### Step 1.2: Parallel Investigation

**항상 2개 에이전트 병렬 실행:**

```
Task(debugger):
  "Bug Description: {사용자 입력}
   Error Output: {에러 로그, 있으면}
   Context: {관련 파일/최근 변경, 있으면}

   Investigate this bug following your Investigation Protocol.
   Classify Bug Type, trace backward to root cause, assess Severity."

Task(verification-planner):
  "User's Goal: Fix the bug described below
   Current Understanding: {사용자 입력}
   Work Breakdown:
   - Reproduce bug with test
   - Apply minimal fix at root cause
   - Verify fix resolves the issue

   Focus on A-items only (what commands prove the fix works).
   Keep it minimal — this is a bug fix, not a feature.

   Note: /bugfix는 Tier 1-3 (A-items)만 사용합니다. TESTING.md는 인라인하지 않습니다.
   Tier 4 (S-items)는 생성하지 않아도 됩니다. S-items 섹션에 'bugfix 모드 — Tier 1-3만 사용' 명시."
```

### Step 1.3: Evaluate Severity & Conditional Gap Analysis

debugger 결과에서 **Severity** 확인:

- **SIMPLE** → Step 1.4로 바로 진행
- **COMPLEX** → gap-analyzer 추가 실행 후 Step 1.4:

```
Task(gap-analyzer):
  "User's Goal: Fix the bug below
   Current Understanding: {debugger의 Bug Analysis Report 전문}
   Intent Type: Bug Fix

   Focus on:
   - Root cause vs symptom 구분이 맞는지
   - 제안된 수정이 다른 곳을 깨뜨릴 가능성
   - 같은 패턴의 유사 버그가 더 있는지"
```

### Step 1.4: User Confirmation

debugger 결과를 요약하여 사용자에게 확인:

```
AskUserQuestion:
  header: "Root Cause"
  question: "debugger가 분석한 Root Cause가 맞습니까?"

  표시할 정보:
  - Bug Type: [분류]
  - Root Cause: [file:line + 1줄 설명]
  - Proposed Fix: [변경 내용 1줄]
  - Severity: [SIMPLE/COMPLEX]
  - Verification: [검증 커맨드]
  - Assumptions: [debugger의 Assumptions 섹션 — 불확실한 사항]
  [COMPLEX일 때] Gap Analysis 핵심 경고사항

  options:
  - "맞다, 진행해" → Phase 2
  - "원인이 다르다" → 사용자 추가 정보와 함께 Step 1.2 재실행
  - "잘 모르겠다" → "/discuss로 먼저 탐색하세요" 안내 후 종료
```

---

## Phase 2: FIX

### State: Attempt Counter

```
attempt = 0
MAX_ATTEMPTS = 3
```

### Step 2.1: Worker Execution

debugger의 분석 결과 + verification-planner의 A-items를 worker에게 전달:

```
Task(worker):
  "## Task: Fix Bug

   ## Root Cause (from debugger)
   {debugger의 Root Cause 섹션}

   ## Proposed Fix (from debugger)
   {debugger의 Proposed Fix 섹션}

   ## MUST DO
   - Write a regression test FIRST that reproduces the bug (RED)
   - Implement the MINIMAL fix described above (GREEN)
   - Fix at the ROOT CAUSE location, not at the symptom location
   - Verify the test passes after the fix

   ## MUST NOT DO
   - Change more than necessary (<5% of affected file)
   - Refactor surrounding code ("while I'm here")
   - Add features not related to the bug
   - Bundle multiple fixes
   - Fix at the symptom location if root cause is elsewhere

   ## Verification Commands (from verification-planner)
   {verification-planner A-items: 커맨드 목록}

   ## Defense in Depth (optional)
   If the fix involves data validation, consider adding validation at:
   - Entry point (where data first enters)
   - Business logic (where data is processed)
   But ONLY if it's a natural fit. Don't over-engineer.

   ## Assumptions (from debugger)
   {debugger의 Assumptions 섹션 — 불확실한 사항}

   ## Similar Issues (from debugger)
   {debugger의 Similar Issues — 같은 패턴이 있으면 함께 수정}

   {attempt > 0일 때:}
   ## Previous Attempt Failed
   Attempt {attempt}: {이전 실패 정보}
   Do NOT repeat the same approach. Try a different angle.

   ## Output Format (MANDATORY)
   Your response MUST be a JSON code block matching the worker output schema:
   ```json
   {
     "outputs": { ... },
     "acceptance_criteria": [
       {"id": "...", "category": "functional|static|runtime", "description": "...", "command": "...", "status": "PASS|FAIL|SKIP"}
     ],
     "learnings": [],
     "issues": [],
     "decisions": []
   }
   ```
   Do NOT output prose. The verification step depends on acceptance_criteria[].command."
```

### Step 2.2: Verify (Bash 직접 실행)

Worker의 acceptance_criteria에서 커맨드를 추출하고, verification-planner의 A-items 커맨드도 함께 실행:

```
For each A-item command:
  Bash(command) → capture exit code + output

결과 집계:
- ALL pass → Step 2.3 (success)
- ANY fail → Step 2.3 (failure)
```

**검증 규칙:**
- Worker가 "PASS"라고 주장해도 반드시 독립적으로 재실행
- `exit code 0`만 신뢰. "should pass" 같은 주장은 무시
- 실패 시 실제 output을 기록 (다음 attempt에 전달)

### Step 2.3: Result Judgment

```
if all_pass:
  → Phase 3

if any_fail AND attempt < MAX_ATTEMPTS:
  attempt += 1
  실패 정보 기록:
    - 어떤 커맨드가 실패했는지
    - 실패 output
    - Worker가 보고한 issues
  → Step 2.1 재실행 (실패 정보 포함)

if any_fail AND attempt >= MAX_ATTEMPTS:
  → CIRCUIT BREAKER (Step 2.4)
```

### Step 2.4: CIRCUIT BREAKER

3회 실패 = 단순 버그가 아닐 가능성. 사용자에게 선택지 제공:

**먼저, 시도 기록을 저장:**

```
Bash: mkdir -p .dev

Write to .dev/bugfix-attempts.md:
  # Bugfix Attempts for: {bug description}
  Date: {timestamp}

  ## Debugger Analysis
  {debugger의 Bug Analysis Report 전문}

  ## Attempt 1
  - Approach: {worker가 시도한 방법}
  - Result: FAIL
  - Failed verification: {실패한 커맨드와 output}

  ## Attempt 2
  ...

  ## Attempt 3
  ...

  ## Assessment
  3회 실패. 아키텍처 수준의 문제일 가능성이 있음.
```

```
AskUserQuestion:
  header: "Circuit Breaker"
  question: "3회 수정 시도가 모두 실패했습니다. 아키텍처 수준의 문제일 수 있습니다."
  options:
  - "/specify로 전환 (정식 계획 수립)"
    → .dev/bugfix-attempts.md를 컨텍스트로 전달하여 /specify 실행 안내
  - "한번 더 시도 (attempt 리셋 없이, attempt=4로 진행)"
  - "중단"
```

---

## Phase 3: REVIEW & COMMIT

### State: Review Attempt Counter

```
review_attempt = 0
MAX_REVIEW_ATTEMPTS = 2
```

### Step 3.1: Code Review (COMPLEX only)

debugger가 COMPLEX로 판정한 경우에만 실행:

**먼저, 실제 diff를 캡처:**

```
Bash: git diff HEAD
→ diff_output에 저장 (실제 unified diff)
```

```
Task(code-reviewer):
  "Review the bug fix changes.

   ## Context
   Bug: {bug description}
   Root Cause: {debugger root cause}

   ## Diff
   {diff_output — git diff HEAD의 실제 출력}

   ## Review Focus
   - Fix addresses root cause, not symptom
   - No unintended side effects
   - Regression test covers the bug
   - No scope creep (only bug-related changes)"
```

**결과 처리:**
- **SHIP** → Step 3.2
- **NEEDS_FIXES** + review_attempt < MAX_REVIEW_ATTEMPTS:
  - review_attempt += 1
  - Phase 2로 복귀 (code-reviewer의 findings를 worker에게 전달)
- **NEEDS_FIXES** + review_attempt >= MAX_REVIEW_ATTEMPTS:
  - CIRCUIT BREAKER (Step 2.4와 동일 경로)
  - "code-reviewer가 2회 연속 NEEDS_FIXES 판정" 기록

### Step 3.2: Commit

```
Task(git-master):
  "Commit the bug fix changes.
   Bug: {bug description}
   Root Cause: {1줄 요약}
   Files changed: {변경 파일 목록}"
```

### Step 3.3: Cleanup & Report

```
최종 리포트:
  ## Bugfix Complete

  **Bug**: {description}
  **Root Cause**: {file:line — 1줄 설명}
  **Fix**: {변경 내용 요약}
  **Verification**: {통과한 커맨드 목록}
  **Commit**: {commit hash}
  **Attempts**: {attempt 횟수}

  {Similar Issues가 있었다면:}
  **Similar Issues Fixed**: {목록}
```

---

## Escalation Path

```
/bugfix (빠른 원샷)
   ↓ circuit breaker (3회 실패)
   ↓ .dev/bugfix-attempts.md 저장
/specify (정식 계획 수립, 시도 기록 참조)
   ↓
/execute (계획 기반 실행)
```

/bugfix에서 /specify로 전환할 때, bugfix-attempts.md가 컨텍스트로 전달되므로 specify는 "이미 시도한 것"을 알고 다른 접근을 계획할 수 있다.

---

## Agent Summary

| Phase | Agent | 기존/신규 | 조건 | 역할 |
|-------|-------|-----------|------|------|
| 1 | **debugger** | **신규** | 항상 | Root cause 분석, Bug Type 분류, Severity 판정 |
| 1 | **verification-planner** | 기존 | 항상 | "뭘 검증할지" A-items 목록 생성 |
| 1 | **gap-analyzer** | 기존 | COMPLEX만 | 놓친 요소, 위험 요소 체크 |
| 2 | **worker** | 기존 | 항상 | 최소 수정 구현 + 리그레션 테스트 |
| 3 | **code-reviewer** | 기존 | COMPLEX만 | 멀티모델 코드 리뷰 |
| 3 | **git-master** | 기존 | 항상 | Atomic commit |

---

## Design Principles

이 스킬은 3개의 검증된 오픈소스 프로젝트의 핵심 패턴을 결합:

| 원칙 | 출처 | 적용 |
|------|------|------|
| Root cause before fix | superpowers (systematic-debugging) | Phase 1 전체 |
| Backward call stack tracing | superpowers (root-cause-tracing) | debugger의 Step 3 |
| Defense-in-depth after fix | superpowers (defense-in-depth) | worker MUST DO 옵션 |
| Anti-pattern rationalizations | superpowers (common rationalizations) | debugger의 체크리스트 |
| Bug Type → Tool routing | oh-my-opencode (Metis intent classification) | debugger의 도구 테이블 |
| Adaptive severity | oh-my-opencode (Momus "80% is good enough") | SIMPLE/COMPLEX 자동 분기 |
| Minimal diff (<5%) | oh-my-claudecode (executor/build-fixer) | worker MUST NOT DO |
| Circuit breaker (3 attempts) | oh-my-claudecode (debugger) + superpowers | Phase 2 Step 2.4 |
| Fresh evidence verification | oh-my-claudecode (verifier) | Phase 2 Step 2.2 |
| Similar issues check | oh-my-claudecode (debugger output) | debugger + worker |
