# hoyeon

[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md) | 日本語

**All you need is requirements.**
あなたの意図から要件を導出し、すべての導出を検証し、トレーサビリティのあるコードを生成する Claude Code プラグインです。計画を書く必要はありません。

[![npm](https://img.shields.io/npm/v/@team-attention/hoyeon-cli)](https://www.npmjs.com/package/@team-attention/hoyeon-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[クイックスタート](#クイックスタート) · [思想](#要件は書くものではない) · [導出チェーン](#導出チェーン) · [コマンド](#コマンド) · [エージェント](#21の思考)

---

> *AIは何でも作れる。難しいのは、何を作るべきかを正確に知ることだ。*

AI コーディングの失敗の多くは、出力ではなく**入力**にあります。ボトルネックは AI の能力ではなく、人間の明確さです。「ダークモードを追加して」と言えば、その三語の裏には百もの判断が隠れています。

多くのツールは、それらを事前にすべて列挙させるか、完全に無視するかのどちらかです。Hoyeon はどちらでもありません。それらを**導出**します。レイヤーごとに。ゲートごとに。意図から検証済みコードまで。

---

## 要件は書くものではない

> *正しい質問をされるまで、自分が何を望んでいるかは分からない。*

要件はコーディング前に作成する成果物ではありません。それは**発見**です — 意図に対する構造化された問いかけを通じて表面化するものです。すべての「機能を追加して」には、語られていない前提が潜んでいます。すべての「バグを直して」には、まだ名付けられていない根本原因が隠れています。

Hoyeon の仕事は、あなたがまだ言っていないことを見つけ出すことです。

```
  You say:     "add dark mode toggle"
                    │
  Hoyeon asks: "System preference or manual?"     ← assumption exposed
               "Which components need variants?"   ← scope clarified
               "Persist where? How?"               ← decision forced
                    │
  Result:      3 requirements, 8 sub-requirements, 4 tasks — all linked
```

これは単なるプロセスではありません。AI コーディングがどうあるべきかについての三つの信念に基づいています。

### 1. タスクよりも要件

> *要件が正しければ、コードは自ずと書ける。要件が間違っていれば、どれだけコードを書いても修正できない。*

ほとんどの AI ツールはタスクに直行します — 「ファイル X を作成、関数 Y を編集」。しかしタスクは派生物です。要件が変われば、タスクも変わります。タスクから始めるのは、砂上の楼閣を建てるようなものです。

Hoyeon は**ゴール**から始め、レイヤーチェーンを通じて下方に導出します：

```
Goal → Decisions → Requirements → Sub-requirements → Tasks
```

一行のコードも書かれる前に、要件は複数の角度から精緻化されます。インタビュアーが前提を問い、ギャップアナライザーが欠落を発見し、UX レビュアーがユーザーへの影響を確認し、トレードオフアナライザーが代替案を比較検討します。それぞれの視点が要件を研ぎ澄まし、検証可能なサブ要件を生成できるほど正確なものにします。

チェーンには方向性があります：**要件がタスクを生み出すのであり、その逆ではありません。** 要件が変更されれば、サブ要件とタスクは再導出されます。これが、Hoyeon が実行中のブロッカーから回復できる理由です — 要件は依然として有効であり、調整が必要なのはタスクだけだからです。

### 2. 設計による決定論

> *LLM は非決定論的である。しかし、それを取り巻くシステムまでそうである必要はない。*

同じプロンプトを二度与えても、LLM は異なるコードを生成する可能性があります。これが AI 支援開発の根本的な課題です。Hoyeon の答え：非決定性が伝播しないように、**プログラム的な制御で LLM を制約する**こと。

三つのメカニズムがこれを実現します：

- **`spec.json` を唯一の信頼源とする** — すべてのエージェントが同じ構造化された仕様から読み書きします。独自のコンテキストを発明するエージェントはいません。会話の中だけに存在する情報はありません。仕様は、コンテキストウィンドウ、コンパクション、エージェントの引き継ぎを超えて生き残る共有メモリです。

- **CLI による構造の強制** — `hoyeon-cli` は `spec.json` へのすべてのマージをバリデーションします。フィールド名、型、必要な関連性 — すべてが LLM がデータを見る前にプログラム的にチェックされます。CLI は構造を提案するのではなく、無効な構造を**拒否**します。

- **契約としての導出チェーン** — Goal → Decisions → Requirements → Sub-requirements → Tasks はリンクされています。各レイヤーはその上のレイヤーを参照します。サブ要件は要件にトレースされます。タスクは `fulfills` を通じて要件にトレースされます。チェーンが切れれば、ゲートがブロックします。つまり：**有効な要件があれば、システムは結果を生み出します** — LLM の個々の出力が変動しても、決定論的にルーティングされます。

LLM は創造的な仕事を担います。システムはそれをレールの上に留めます。

### 3. デフォルトで機械検証可能

> *人間が確認しなければならないなら、システムは自動化に失敗したということだ。*

`spec.json` のすべてのサブ要件はテスト可能な動作仕様です：

```json
{
  "id": "R1.1",
  "behavior": "Clicking dark mode toggle switches theme to dark"
}
```

サブ要件が受け入れ基準として機能します。ワーカーはサブ要件の振る舞いに対して自身の実装を検証します（`--tdd` でテストファースト・ワークフローも可能）。マルチモデルコードレビュー（Codex + Gemini + Claude）が独立して実行され、合意された判定を合成します。

人間のレビューは、機械が真に判断できないものに限定されます — UX の感触、ビジネスロジックの正確性、命名の決定。それ以外はすべて、毎回自動的に実行されます。

### 4. 知識は積み重なる

> *ほとんどのAIツールは毎セッションをゼロから始める。Hoyeonは記憶する。*

すべての実行は構造化された学習を生成する——ログやチャット履歴ではなく、**型付けされた知識**：何が問題だったか、なぜか、次回防ぐためのルール。

```
  /execute 実行 → Worker がエッジケースを発見
       │
  Worker が記録:
    { problem: "localStorage のクォータが 5MB で超過",
      cause:   "書き込み前のサイズチェックなし",
      rule:    "localStorage.setItem の前に常に残りクォータを確認すること" }
       │
  次の /specify → BM25 で過去の学習を検索
       │
  結果: "発見: todo-app スペックの localStorage クォータ問題。
         → R5: クォータガード要件を自動追加"
```

これが**クロススペック・コンパウンディング**だ。あるプロジェクトで学んだ教訓が、次のプロジェクトの要件として浮上する。システムは単にミスを繰り返さないだけでなく——過去の実行からの証拠で未来のスペックを積極的に強化する。

3つのメカニズムがこれを可能にする：

- **`spec learning`** — Worker が実行中に構造化された学習を記録し、それを生成した要件とタスクに自動マッピング
- **`spec search`** — 全スペックを横断する BM25 検索：要件、サブ要件、制約、学習。プロジェクト A で学んだことがプロジェクト B での質問に反映される
- **コンパウンディング・ループ** — 毎回の /specify セッションが過去の学習検索から始まる。より多くのプロジェクト → より豊富な検索結果 → より完全な要件 → 実行中のサプライズ減少 → より良い学習 → サイクル継続

結果：**Hoyeon で実行する10番目のプロジェクトは、最初のものより明らかに優れている**——LLM が改善されたからではなく、ナレッジベースが成長したからだ。

---

これらは理想論ではありません。アーキテクチャによって強制されています — CLI は無効な仕様を拒否し、ゲートは未検証のレイヤーをブロックし、フックは書き込みを保護し、エージェントは隔離された環境で検証します。**正しいことをすることが最も抵抗の少ない道になる**ようにシステムは設計されています、そして学習はプロジェクトをまたいで積み重なります。

---

## 実際の動作

```
You:  /specify "add dark mode toggle to settings page"

  Hoyeon interviews you (decision-based):
  ├─ "User opens the app at night — should it auto-detect OS dark mode or require a manual toggle?"
  ├─ "User switches to dark mode mid-session — should charts/images also invert?"
  └─ derives implications: CSS variables needed, localStorage for persistence, prefers-color-scheme media query

  Agents research your codebase in parallel:
  ├─ code-explorer scans component structure
  ├─ docs-researcher checks design system conventions
  └─ ux-reviewer flags potential regression

  → spec.json generated:
    3 requirements, 8 sub-requirements, 4 tasks — all linked

You:  /execute

  Hoyeon orchestrates:
  ├─ Worker agents implement each task in parallel (--tdd: tests first)
  ├─ Code review: Codex + Gemini + Claude (multi-model consensus)
  └─ Final Verify: goal + constraints + sub-requirements — holistic check

  → Done. Every file change traced to a requirement.
```

<details>
<summary><strong>何が起きたのか？</strong></summary>

```
/specify → Interview exposed hidden assumptions
           → Agents researched codebase in parallel
           → Layer-by-layer derivation: L0→L1→L2→L3→L4
           → Each layer gated by CLI validation + agent review

/execute → Orchestrator read spec.json, dispatched parallel workers
           → Workers self-verify against sub-requirement behaviors (--tdd: test-first)
           → Multi-model code review synthesized verdict
```

意図から証明まで、チェーンが走り抜けました。すべての導出が検証済みです。

</details>

---

## 導出チェーン

6つのレイヤー。各レイヤーは前のレイヤーから導出されます。各レイヤーは次に進む前にゲートで検証されます。

```
  L0: Goal           "add dark mode toggle"
   ↓  ◇ gate         is the goal clear?
  L1: Context        codebase analysis, UX review, docs research
   ↓  ◇ gate         is the context sufficient?
  L2: Decisions      decision interview → implications derivation (L2.5)
   ↓  ◇ gate         are decisions justified?
  L3: Requirements   R1: "Toggle switches theme" → sub-requirements
   ↓  ◇ gate         are requirements complete?
  L4: Tasks          T1: "Add toggle component" → fulfills, depends_on
   ↓  ◇ gate         do tasks cover all requirements?
  Plan Approval      summary + user confirmation → /execute
```

各ゲートには二つのチェックがあります：
- **マージチェックポイント** — CLI が構造と完全性をバリデーション
- **ゲートキーパー** — エージェントチームがスコープドリフト、盲点、不必要な複雑さをレビュー

両方を通過しなければ先に進めません。チェーンは最も弱いリンクと同じ強さしかありません — だからこそ、すべてのリンクが検証されます。

### 仕様契約

`spec.json` は唯一の信頼源です。すべてがここから読み、すべてがここに書き込みます。

```json
{
  "meta": { "goal": "...", "mode": { "depth": "standard" } },
  "context": { "research": {}, "decisions": [{ "implications": [] }], "assumptions": [] },
  "requirements": [{
    "id": "R1",
    "behavior": "Toggle switches between light and dark theme",
    "sub": [{
      "id": "R1.1",
      "behavior": "Clicking toggle in settings page switches to dark mode"
    }]
  }],
  "tasks": [{ "id": "T1", "action": "...", "fulfills": ["R1"] }]
}
```

エビデンスの連鎖：**requirement → sub-requirement → task (fulfills) → done**。意図から証明まで。

---

## 実行エンジン

オーケストレーターが `spec.json` を読み、並列ワーカーエージェントをディスパッチします：

```
  ┌─────────────────────────────────────────────────────┐
  │  /execute                                           │
  │                                                     │
  │  Worker T1 ──→ Verifier T1 ──→ Commit T1             │
  │  Worker T2 ──→ Verifier T2 ──→ Commit T2  (parallel)│
  │  Worker T3 ──→ Verifier T3 ──→ Commit T3             │
  │       │                                             │
  │       ▼                                             │
  │  Code Review (Codex + Gemini + Claude)              │
  │       │  independent reviews → synthesized verdict  │
  │       ▼                                             │
  │  Final Verify                                       │
  │    ✓ goal alignment                                 │
  │    ✓ constraint compliance                          │
  │    ✓ acceptance criteria                            │
  │    ✓ requirement coverage                           │
  │       │                                             │
  │       ▼                                             │
  │  Report                                             │
  └─────────────────────────────────────────────────────┘
```

ワーカーが実装し、独立した Verifier エージェントがタスクごとにサブ要件をチェックします — 判断なし、バイパスなし。

### 仕様は生きている

> *適応できない仕様は、やがて放棄される仕様である。*

`spec.json` は計画時に凍結される静的なドキュメントではありません。実行中に進化する**生きた契約**です — 厳密で決定論的な範囲内で。

ワーカーが実際のコードベースが計画の前提と一致しないことを発見した場合、仕様は適応します：

```
  spec.json at plan time:
    tasks: [T1, T2, T3]           ← 3 planned tasks

  Worker T2 hits a blocker:
    "T2 requires a util function that doesn't exist"
       │
       ▼
  System derives T2-fix:
    tasks: [T1, T2, T3, T2-fix]   ← spec grows, append-only
       │
       ▼
  T2-fix executes → T2 retries → passes
    tasks: [T1 ✓, T2 ✓, T3 ✓, T2-fix ✓]
```

これは**制限付き適応**です — 仕様は成長しますが、変異しません。三つのルールが決定論を保ちます：

- **追記のみ** — 既存のタスクは変更されず、新しいタスクのみが追加されます。元の計画は監査証跡としてそのまま残ります。
- **深さ1** — 派生タスクがさらにタスクを派生させることはできません。適応は一段階のみで、連鎖的な拡大はありません。これにより、仕様が際限なく複雑化することを防ぎます。
- **サーキットブレーカー** — パスごとの最大リトライ回数を超えるとユーザーにエスカレーションされます。システムは、試行を止めて助けを求めるべき時を知っています。

重要な洞察：**実行中に変わるのは要件ではなく、タスクだけです。** 導出チェーンを通じて検証されたゴール、判断、要件は安定したままです。タスクは最下層に過ぎず、再導出のコストが最も低い層です。これがレイヤー階層が重要な理由です：レイヤーが高いほど、安定性も高くなります。

```
  Stable during execution:
    L0: Goal           ← locked
    L1: Context        ← locked
    L2: Decisions      ← locked
    L3: Requirements   ← locked
    L3: Sub-reqs       ← locked (behavioral acceptance criteria)

  Adaptable during execution:
    L4: Tasks          ← can grow (append-only, depth-1)
```

仕様は未来を予測しない。未来を生き延びるのだ — どの部分を堅持し、どの部分を柔軟にするかを知ることによって。

---

## 21の思考

21のエージェント、それぞれが異なる思考モードを持っています。直接やり取りすることはありません — スキルが裏側でそれらをオーケストレーションします。

| エージェント | 役割 | 核心的な問い |
|-------|------|---------------|
| **Interviewer** | 質問のみ。決して作らない。 | *「まだ言っていないことは？」* |
| **Gap Analyzer** | 問題になる前に欠落を見つける | *「何がうまくいかない可能性がある？」* |
| **UX Reviewer** | ユーザー体験を守る | *「人間はこれを楽しめるか？」* |
| **Tradeoff Analyzer** | あらゆる選択肢のコストを比較検討する | *「何を諦めることになる？」* |
| **Debugger** | 症状ではなく根本原因を追跡する | *「これは原因か、それとも症状か？」* |
| **Code Reviewer** | マルチモデル合意（Codex + Gemini + Claude） | *「3人の専門家はこれを出荷するか？」* |
| **Worker** | 仕様に忠実に実装する | *「これは要件と一致しているか？」* |
| **Verifier** | タスクごとの独立シナリオ検証 | *「コードはすべてのシナリオと一致しているか？」* |
| **Ralph Verifier** | 独立した、コンテキスト隔離された DoD チェック | *「本当に完了しているか？」* |
| **Gate-Keeper** | レイヤー遷移のドリフト、ギャップ、コンフリクトを検証する | *「このレイヤーは進行可能か？」* |
| **External Researcher** | ライブラリとベストプラクティスを調査する | *「実際にどんなエビデンスがあるか？」* |

<details>
<summary><strong>全21エージェント</strong></summary>

| エージェント | 役割 |
|-------|------|
| Interviewer | ソクラテス式の質問 — 質問のみ、コードなし |
| Gap Analyzer | 不足している要件と落とし穴の検出 |
| UX Reviewer | ユーザー体験の保護とリグレッション防止 |
| Tradeoff Analyzer | リスク評価とよりシンプルな代替案の提案 |
| Debugger | バグ分類による根本原因分析 |
| Code Reviewer | マルチモデルレビュー：Codex + Gemini + Claude → SHIP/NEEDS_FIXES |
| Worker | 仕様駆動の自己検証によるタスク実装 |
| Verifier | 独立サブ要件検証（機械的、バイパス不可） |
| Ralph Verifier | 隔離されたコンテキストでの独立した DoD 検証 |
| External Researcher | Web 経由のライブラリ調査とベストプラクティス研究 |
| Docs Researcher | 内部ドキュメントとアーキテクチャ決定の検索 |
| Code Explorer | 高速な読み取り専用のコードベース検索とパターン発見 |
| Git Master | プロジェクトスタイル検出によるアトミックコミットの強制 |
| Phase2 Stepback | 計画前のスコープドリフトと盲点の検出 |
| Verification Planner | テスト戦略の設計（Auto/Agent/Manual 分類） |
| Value Assessor | ポジティブな影響とゴール整合性の評価 |
| Risk Analyst | 脆弱性、障害モード、エッジケースの検出 |
| Feasibility Checker | 実現可能性の評価 |
| Codex Strategist | クロスレポートの戦略的統合と盲点の検出 |

</details>

---

## コマンド

24のスキル — Claude Code 内で呼び出すスラッシュコマンドです。

| カテゴリ | 目的 | スキル |
|----------|------------------|--------|
| **理解** | 要件の導出、仕様の生成 | `/specify` `/quick-plan` `/discuss` `/deep-interview` `/mirror` |
| **調査** | コードベースの分析、リファレンスの検索、コミュニティのスキャン | `/deep-research` `/dev-scan` `/reference-seek` `/google-search` `/browser-work` |
| **判断** | トレードオフの評価、多角的レビュー | `/council` `/tribunal` `/tech-decision` `/stepback` |
| **構築** | 仕様の実行、バグ修正、反復 | `/execute` `/ralph` `/rulph` `/bugfix` `/ultrawork` |
| **振り返り** | 変更の検証、学びの抽出 | `/check` `/compound` `/scope` `/issue` |

<details>
<summary><strong>主要コマンドの詳細</strong></summary>

| コマンド | 説明 |
|---------|--------------|
| `/specify` | レイヤーベースのインタビュー → spec.json の導出（L0→L4）、ゲートキーパー付き |
| `/execute` | 仕様駆動の並列エージェントディスパッチ + マルチモデルレビュー + Final Verify |
| `/ultrawork` | フルパイプライン：specify → execute を一つのコマンドで |
| `/bugfix` | 根本原因の診断 → 自動生成された仕様 → execute（適応的ルーティング） |
| `/ralph` | DoD ベースの反復ループ — 独立検証されるまで続行 |
| `/council` | 多角的な審議：tribunal + 外部 LLM + コミュニティスキャン |
| `/tribunal` | 3エージェントの対抗的レビュー：Risk + Value + Feasibility → 統合された判定 |
| `/scope` | 高速並列インパクト分析 — 5つ以上のエージェントが影響範囲をスキャン |
| `/check` | プロジェクトルールチェックリストに対するプッシュ前検証 |
| `/rulph` | ルーブリックベースのマルチモデル評価と自律的自己改善 |

</details>

---

## 内部構造

**24スキル · 21エージェント · 18フック**

```
.claude/
├── skills/
│   ├── specify/       Layer-based spec derivation (L0→L4)
│   ├── execute/       Spec-driven parallel orchestration
│   ├── bugfix/        Root cause → spec → execute pipeline
│   ├── council/       Multi-perspective deliberation
│   ├── tribunal/      3-agent adversarial review
│   └── ...            19 more skills
├── agents/
│   ├── interviewer    Socratic questioning
│   ├── debugger       Root cause analysis
│   ├── worker         Task implementation
│   ├── code-reviewer  Multi-model consensus
│   └── ...            17 more agents
├── scripts/           18 hook scripts
│   ├── session        Lifecycle management
│   ├── guards         Write protection, plan enforcement
│   ├── validation     Output quality, failure recovery
│   └── pipeline       Ultrawork transitions, DoD loops
└── cli/               spec.json validation & state management
```

**主要な内部機構：**

- **導出チェーン** — L0→L4、各遷移にマージチェックポイント + ゲートキーパーチーム
- **マルチモデルレビュー** — Codex + Gemini + Claude が独立してレビューを実行し、SHIP/NEEDS_FIXES の判定を合成
- **フックシステム** — 18のフックがパイプライン遷移の自動化、書き込みの保護、ゲートの強制、障害からの回復を担当
- **検証パイプライン** — 専用 Verifier エージェントがタスクごとにサブ要件を独立チェック
- **自己改善** — スコープブロッカー → ランタイムでの派生修正タスク（追記のみ、深さ1、サーキットブレーカー）
- **Ralph ループ** — DoD ベースの反復、Stop フックによる再注入 + 独立したコンテキスト隔離検証

詳細は [docs/architecture.md](docs/architecture.md) のパイプライン図を参照してください。

---

## クイックスタート

```bash
# プラグインのインストール
claude plugin add team-attention/hoyeon
npm install -g @team-attention/hoyeon-cli

# 開始 — 要件を導出して実行
/specify "add dark mode toggle to settings page"
/execute

# またはフルパイプラインを一つのコマンドで実行
/ultrawork "refactor auth module"

# 根本原因分析でバグを修正
/bugfix "login fails when session expires"
```

Claude Code で `/` を入力すると、利用可能なすべてのスキルが表示されます。

## CLI

`hoyeon-cli` は spec.json のバリデーションとセッション状態を管理します：

```bash
hoyeon-cli spec init "project-name"        # Create new spec
hoyeon-cli spec merge spec.json --json ...  # Validated merge
hoyeon-cli spec check spec.json             # Verify completeness
hoyeon-cli spec guide <section>             # Show field structure
```

完全なコマンドリファレンスは [docs/cli.md](docs/cli.md) を参照してください。

---

## コントリビューション

コントリビューションを歓迎します。ガイドラインは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

---

*「仕様は未来を予測しない。未来を生き延びるのだ。」*

**要件は書くものではない — 導出するものである。**

`MIT License`
