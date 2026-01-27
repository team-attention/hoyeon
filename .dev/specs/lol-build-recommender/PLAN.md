# LoL Mid Build Recommender

> 미드 5챔피언의 아이템 빌드 추천 + VS matchup 카운터 빌드를 보여주는 React SPA (.playground/lol-build/)

## Context

### Original Request
LoL 챔피언 선택하면 빌드가 쫘르르 나오고, VS 누구랑 했을 때 카운터 빌드가 뚜루룩 나오는 웹 앱을 .playground에 만들기.

### Interview Summary
**Key Discussions**:
- 기술 스택: React + Vite
- 데이터 소스: Data Dragon CDN (이미지) + 하드코딩 JSON (빌드)
- 범위: 핵심만 - 챔피언 선택 → 빌드, VS → 카운터 빌드
- 챔피언: 미드 5챔 (Ahri, Zed, Yasuo, Lux, Syndra)
- 빌드 내용: 아이템 6개 + matchup 팁 + 난이도 (승률/스킬순서 제외)

**Research Findings**:
- .playground/ 디렉토리는 .gitignore에 포함, 실험용
- 기존 웹 앱 패턴 없음 (greenfield)
- Data Dragon CDN: `https://ddragon.leagueoflegends.com/cdn/{version}/img/` 경로로 이미지 제공
- Gap Analysis: 이미지 로드 실패 시 fallback 필요, matchup은 "내 챔피언 선택 → 상대 선택" 플로우

## Work Objectives

### Core Objective
미드 5챔피언을 선택하면 추천 빌드를 표시하고, 상대 챔피언을 추가 선택하면 matchup별 카운터 빌드 + 팁을 표시하는 React SPA.

### Concrete Deliverables
- `.playground/lol-build/` - Vite + React 프로젝트
- `src/data/builds.json` - 미드 5챔 빌드 데이터 (기본 + matchup별)
- `src/api/ddragon.js` - Data Dragon 이미지 URL 헬퍼
- `src/components/ChampionSelect.jsx` - 챔피언 선택 그리드
- `src/components/BuildDisplay.jsx` - 아이템 빌드 표시
- `src/components/MatchupSelect.jsx` - VS 상대 선택 + 카운터 빌드
- `src/App.jsx` - 메인 앱 (라우팅 없음, 상태 기반)
- `src/App.css` - 스타일링

### Definition of Done
- [ ] 미드 5챔 선택 가능하고 Data Dragon 이미지가 표시됨
- [ ] 챔피언 선택 시 기본 빌드 (아이템 6개) 표시
- [ ] 상대 챔피언 선택 시 matchup 빌드 + 난이도 + 팁 표시
- [ ] `npm run dev`로 브라우저에서 정상 동작
- [ ] `npm run build` 에러 없음

### Must NOT Do (Guardrails)
- 프로젝트 루트의 기존 파일 수정 금지
- 룬, 스킬 순서, 승률 추가 금지
- 외부 빌드 API (op.gg 등) 크롤링 금지
- Riot League API 호출 금지 (Data Dragon CDN만 사용)
- 백엔드/DB 구축 금지 (순수 프론트엔드 SPA)
- 과도한 설계 금지 (5챔 고정, 확장성 불필요)

---

## Task Flow

```
TODO-1 (scaffold) → TODO-2 (data) → TODO-3 (components + app) → TODO-Final (verify)
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `project_root` (file) | work |
| 2 | `todo-1.project_root` | `builds_json` (file), `ddragon_util` (file) | work |
| 3 | `todo-2.builds_json`, `todo-2.ddragon_util` | `app_entry` (file) | work |
| Final | all outputs | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | 순차적 의존성, 병렬화 불가 |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `chore(lol-build): scaffold vite + react project` | `.playground/lol-build/*` | always |
| 2 | `feat(lol-build): add build data and ddragon util` | `src/data/*, src/api/*` | always |
| 3 | `feat(lol-build): add champion select, build display, matchup UI` | `src/components/*, src/App.*` | always |

> **Note**: No commit after Final (read-only verification).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | npm not found, network timeout | `/ENOENT\|ECONNREFUSED\|timeout/i` |
| `code_error` | JSX syntax error, import missing | `/SyntaxError\|Module not found\|Cannot find/i` |
| `unknown` | Unclassifiable | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → Fix Task or halt |
| verification fails | Analyze immediately (no retry) → Fix Task or halt |
| Worker times out | Halt and report |
| Missing Input | Skip dependent TODOs, halt |

### Fix Task Rules
- Fix Task type is always `work`
- Fix Task failure → Halt
- Max depth = 1

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | `.playground/lol-build/` |
| Network Access | Allowed (npm install, Data Dragon CDN) |
| Package Install | Allowed (greenfield project, npm install needed) |
| File Access | `.playground/lol-build/` only |
| Max Execution Time | 5 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [ ] TODO 1: Scaffold Vite + React Project

**Type**: work

**Required Tools**: `npm`

**Inputs**: (none - first task)

**Outputs**:
- `project_root` (file): `.playground/lol-build/` - Vite React project root

**Steps**:
- [ ] Create `.playground/lol-build/` directory
- [ ] Run `npm create vite@latest . -- --template react` inside the directory
- [ ] Run `npm install`
- [ ] Clean up default boilerplate (remove default App content, keep structure)
- [ ] Verify `npm run dev` starts without error (start and immediately kill)

**Must NOT do**:
- Do not install additional npm packages beyond Vite template defaults
- Do not modify files outside `.playground/lol-build/`
- Do not run git commands
- All file paths below are relative to `.playground/lol-build/`

**References**:
- Vite React template: `npm create vite@latest`

**Acceptance Criteria**:

*Functional:*
- [ ] Directory `.playground/lol-build/` exists
- [ ] `package.json` contains `react` and `vite` dependencies
- [ ] `src/App.jsx` exists

*Static:*
- [ ] `cd .playground/lol-build && npm run build` → exit 0

*Runtime:*
- [ ] (no tests for scaffold)

---

### [ ] TODO 2: Create Build Data and Data Dragon Utility

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `project_root` (file): `${todo-1.outputs.project_root}` - Vite React project root

**Outputs**:
- `builds_json` (file): `.playground/lol-build/src/data/builds.json` - Champion build data
- `ddragon_util` (file): `.playground/lol-build/src/api/ddragon.js` - Data Dragon helper

**Steps**:
- [ ] Create `src/data/builds.json` with 미드 5챔 데이터:
  - 각 챔피언: `id` (Data Dragon ID), `name`, `role: "mid"`
  - `defaultBuild`: `label`, `items` (배열, 각 item은 `id`와 `name`)
  - `matchups`: 나머지 4챔 각각에 대해 `difficulty` ("easy"/"medium"/"hard"), `build` (label + items), `tip`
  - 아이템은 실제 LoL 아이템 이름과 Data Dragon item ID 사용
  - **빌드 레퍼런스** (Worker는 아래 빌드를 기준으로 작성):
    - Ahri: Luden's Companion(6655), Shadowflame(4645), Rabadon's Deathcap(3089), Zhonya's Hourglass(3157), Void Staff(3135), Sorcerer's Shoes(3020)
    - Zed: Voltaic Cyclosword(6676), Edge of Night(3814), Serylda's Grudge(6694), Black Cleaver(3071), Guardian Angel(3026), Ionian Boots of Lucidity(3158)
    - Yasuo: Immortal Shieldbow(6673), Infinity Edge(3031), Death's Dance(6333), Wit's End(3091), Guardian Angel(3026), Berserker's Greaves(3006)
    - Lux: Luden's Companion(6655), Shadowflame(4645), Rabadon's Deathcap(3089), Horizon Focus(4628), Zhonya's Hourglass(3157), Sorcerer's Shoes(3020)
    - Syndra: Luden's Companion(6655), Shadowflame(4645), Rabadon's Deathcap(3089), Banshee's Veil(3102), Void Staff(3135), Sorcerer's Shoes(3020)
  - **팁 작성 가이드**: 1~2문장 전술 조언. 예: "6렙 전 올인 회피", "존야 타이밍이 핵심"
  - 난이도 기준: easy=유리한 매치업, medium=스킬 매치업, hard=불리한 매치업
  - **Matchup 빌드 상세** (기본 빌드에서 1~2개 아이템 교체):
    - Ahri vs Zed: hard, Zhonya's 2번째로 올림, "W-E로 거리 유지, 6렙 후 궁으로 올인 회피. 존야 필수"
    - Ahri vs Yasuo: hard, Zhonya's + Morellonomicon(3165), "바람벽 유도 후 스킬 사용, 궁으로 올인 회피"
    - Ahri vs Lux: easy, 기본 빌드 유지, "사거리 비슷, 매력으로 선제 교전 유리"
    - Ahri vs Syndra: medium, Banshee's Veil(3102) 추가, "구슬 피하며 단거리 교전 노리기"
    - Zed vs Ahri: medium, 기본 빌드 유지, "매력 피한 후 궁 올인, 궁 타이밍 중요"
    - Zed vs Yasuo: medium, 기본 빌드 유지, "레벨 3 교전 강함, 바람벽 신경 안 써도 됨"
    - Zed vs Lux: easy, 기본 빌드 유지, "6렙 궁으로 쉽게 킬, 바인딩만 피하기"
    - Zed vs Syndra: medium, Edge of Night 우선, "E로 스턴 차단, 궁 올인 노리기"
    - Yasuo vs Ahri: medium, Wit's End 우선, "바람벽으로 매력 차단, 근접 교전 유리"
    - Yasuo vs Zed: medium, Death's Dance 우선, "그림자 위치 파악, 궁 타이밍 맞추기"
    - Yasuo vs Lux: easy, 기본 빌드 유지, "바람벽으로 스킬 차단, 근접 붙이면 승리"
    - Yasuo vs Syndra: hard, Wit's End + Hexdrinker→Maw of Malmortius(3156), "구슬 피하며 접근, 바람벽 아껴두기"
    - Lux vs Ahri: medium, 기본 빌드 유지, "매력 사거리 밖에서 Q-E 견제"
    - Lux vs Zed: hard, Zhonya's 2번째, "궁 올인 시 존야, 거리 유지 필수"
    - Lux vs Yasuo: hard, Zhonya's + Liandry's Anguish(6653), "바람벽 유도 후 스킬, 근접 붙이면 위험"
    - Lux vs Syndra: medium, Banshee's Veil 추가, "사거리 비슷, 궁 타이밍 주의"
    - Syndra vs Ahri: medium, 기본 빌드 유지, "거리 유지하며 구슬 쌓기, 매력 사거리 주의"
    - Syndra vs Zed: hard, Zhonya's Hourglass(3157) 교체 추가, "궁 올인 시 존야, E로 밀어내기"
    - Syndra vs Yasuo: medium, Rylai's Crystal Scepter(3116) 추가, "바람벽 유도 후 궁, E 스턴 중요"
    - Syndra vs Lux: easy, 기본 빌드 유지, "사거리 우위, 구슬로 견제 후 궁 마무리"
  - **JSON 구조 예시**:
    ```json
    {
      "champions": [
        {
          "id": "Ahri",
          "name": "아리",
          "role": "mid",
          "defaultBuild": {
            "label": "AP 버스트",
            "items": [
              { "id": "6655", "name": "Luden's Companion" },
              { "id": "4645", "name": "Shadowflame" },
              { "id": "3089", "name": "Rabadon's Deathcap" },
              { "id": "3157", "name": "Zhonya's Hourglass" },
              { "id": "3135", "name": "Void Staff" },
              { "id": "3020", "name": "Sorcerer's Shoes" }
            ]
          },
          "matchups": {
            "Zed": {
              "difficulty": "hard",
              "build": {
                "label": "생존 우선",
                "items": [
                  { "id": "6655", "name": "Luden's Companion" },
                  { "id": "3157", "name": "Zhonya's Hourglass" },
                  ...
                ]
              },
              "tip": "W-E로 거리 유지, 6렙 후 궁으로 올인 회피. 존야 필수"
            }
          }
        }
      ]
    }
    ```
- [ ] Create `src/api/ddragon.js`:
  - `getChampionImageUrl(championId)` - 챔피언 아이콘 URL 반환 (primary URL만, fallback 없음)
  - `getItemImageUrl(itemId)` - 아이템 아이콘 URL 반환 (primary URL만, fallback 없음)
  - `getLatestVersion()` - Data Dragon 최신 버전 fetch 후 모듈 레벨 변수에 캐시 (한 번 fetch 후 재사용, refetch 없음)
  - **Fallback 책임은 컴포넌트에 있음**: `<img onError>` 핸들러로 텍스트 fallback 표시. ddragon.js는 URL만 제공

**Must NOT do**:
- Do not hardcode Data Dragon version (fetch latest dynamically)
- Do not include runes, skill order, or win rates in builds.json
- Do not use Riot API (Data Dragon CDN only)
- Do not run git commands

**References**:
- Data Dragon API: `https://ddragon.leagueoflegends.com/api/versions.json`
- Champion images: `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{id}.png`
- Item images: `https://ddragon.leagueoflegends.com/cdn/{version}/img/item/{id}.png`

**Acceptance Criteria**:

*Functional:*
- [ ] `src/data/builds.json` exists and contains 5 champions
- [ ] Each champion has `defaultBuild` with 6 items
- [ ] Each champion has 4 matchups with difficulty, build, and tip
- [ ] `src/api/ddragon.js` exports `getChampionImageUrl` and `getItemImageUrl`

*Static:*
- [ ] `cd .playground/lol-build && npm run build` → exit 0

*Runtime:*
- [ ] (no tests)

---

### [ ] TODO 3: Build UI Components and App

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `builds_json` (file): `${todo-2.outputs.builds_json}` - Build data JSON
- `ddragon_util` (file): `${todo-2.outputs.ddragon_util}` - Data Dragon helper

**Outputs**:
- `app_entry` (file): `.playground/lol-build/src/App.jsx` - Complete app

**Steps**:
- [ ] Create `src/components/ChampionSelect.jsx`:
  - 5챔피언 아이콘 그리드 (Data Dragon 이미지)
  - 클릭 시 챔피언 선택 콜백
  - 선택된 챔피언 하이라이트
  - 이미지 로드 실패 시: `<img>` 숨기고 챔피언 이름 텍스트 표시 (color: #cdbea7, font-size: 12px, 그리드 셀 크기 유지)
- [ ] Create `src/components/BuildDisplay.jsx`:
  - 아이템 6개 가로 나열 (이미지 + 이름)
  - 빌드 라벨 표시
  - 이미지 로드 실패 시: `<img>` 숨기고 아이템 이름 텍스트 표시 (동일 셀 크기 유지)
- [ ] Create `src/components/MatchupSelect.jsx`:
  - 선택된 챔피언을 **제외한** 나머지 4챔피언 아이콘 (VS 상대 선택)
  - 선택 시 카운터 빌드 + 난이도 배지 + 팁 표시
  - 난이도 색상: easy=`#28a745`, medium=`#ffc107`, hard=`#dc3545`
- [ ] Update `src/App.jsx`:
  - State: `selectedChampion` (null 초기값), `selectedMatchup` (null 초기값)
  - 초기 상태: "Select a champion to get started" 메시지 표시
  - 플로우: 챔피언 선택 → 기본 빌드 표시 + matchup 선택 영역 → 상대 선택 시 카운터 빌드
  - `onSelectChampion` 콜백: `setSelectedChampion(champ)` AND `setSelectedMatchup(null)` (matchup 초기화)
  - 헤더: "LoL Mid Build Recommender"
- [ ] 모든 컴포넌트 스타일은 `src/App.css` 한 파일에 작성 (컴포넌트별 CSS 파일 생성하지 않음)
- [ ] Update `src/App.css`:
  - 다크 테마: 배경 `#0a1428`, 텍스트 `#cdbea7`, 강조 `#c89b3c` (LoL 골드)
  - 챔피언 그리드 레이아웃
  - 아이템 가로 나열
  - 난이도 색상 배지
  - 반응형 기본 지원

**Must NOT do**:
- Do not add React Router or other dependencies
- Do not add runes, skill order, or win rates UI
- Do not create a backend or API layer
- Do not modify files outside `.playground/lol-build/`
- Do not run git commands

**References**:
- builds.json 구조: `${todo-2.outputs.builds_json}`
- ddragon.js API: `${todo-2.outputs.ddragon_util}`

**Acceptance Criteria**:

*Functional:*
- [ ] `src/components/ChampionSelect.jsx` exists and renders 5 champions
- [ ] `src/components/BuildDisplay.jsx` exists and renders 6 items
- [ ] `src/components/MatchupSelect.jsx` exists and renders matchup options
- [ ] `src/App.jsx` integrates all components with state management
- [ ] 챔피언 클릭 → 빌드 표시 동작 (builds.json에서 selectedChampion.defaultBuild 렌더링)
- [ ] 상대 클릭 → 카운터 빌드 + 난이도 배지 + 팁 표시 동작
- [ ] 이미지 로드 실패 시 fallback 텍스트(챔피언/아이템 이름) 정상 표시, 레이아웃 깨지지 않음

*Static:*
- [ ] `cd .playground/lol-build && npm run build` → exit 0

*Runtime:*
- [ ] (no automated tests)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npm`

**Inputs**:
- `project_root` (file): `${todo-1.outputs.project_root}`
- `builds_json` (file): `${todo-2.outputs.builds_json}`
- `ddragon_util` (file): `${todo-2.outputs.ddragon_util}`
- `app_entry` (file): `${todo-3.outputs.app_entry}`

**Outputs**: (none)

**Steps**:
- [ ] Verify all deliverable files exist
- [ ] Run production build
- [ ] Verify builds.json has correct structure (5 champions, each with defaultBuild + 4 matchups)
- [ ] Verify ddragon.js exports required functions
- [ ] Verify all components exist and import correctly

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] All deliverable files from Work Objectives exist
- [ ] `builds.json` contains exactly 5 champions with correct structure
- [ ] Each champion has `defaultBuild` (6 items) and 4 `matchups` (each with difficulty, build, tip)
- [ ] `ddragon.js` exports `getChampionImageUrl` and `getItemImageUrl`
- [ ] App.jsx imports and renders ChampionSelect, BuildDisplay, MatchupSelect
- [ ] `<img>` tags have `onError` fallback handlers (grep for `onError` in components)
- [ ] All file paths are within `.playground/lol-build/` (no files created outside)

*Static:*
- [ ] `cd .playground/lol-build && npm run build` → exit 0

*Runtime:*
- [ ] Dev server starts without error: `cd .playground/lol-build && timeout 10 npm run dev || true` (exit by timeout is OK)
