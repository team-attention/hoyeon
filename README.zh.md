# hoyeon

[English](README.md) | [한국어](README.ko.md) | 中文 | [日本語](README.ja.md)

**All you need is requirements.**
一个 Claude Code 插件，从你的意图中推导需求，验证每一步推导过程，并交付可追溯的代码——无需你编写计划。

[![npm](https://img.shields.io/npm/v/@team-attention/hoyeon-cli)](https://www.npmjs.com/package/@team-attention/hoyeon-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[快速开始](#快速开始) · [理念](#需求不是写出来的) · [推导链](#推导链) · [命令](#命令) · [智能体](#二十一个思维)

---

> *AI 能构建一切。难的是精确地知道该构建什么。*

大多数 AI 编程失败在**输入**，而非输出。瓶颈不在 AI 的能力，而在人类表达的清晰度。你说"加个深色模式"，这三个字背后隐藏着上百个决策。

大多数工具要么逼你提前列举所有细节，要么完全忽略它们。Hoyeon 两者都不做——它**推导**。逐层推进，逐关验证。从意图到已验证的代码。

---

## 需求不是写出来的

> *在被问到正确的问题之前，你不知道自己想要什么。*

需求不是你在编码之前产出的文档，而是**发现**——通过对意图的结构化追问而浮现。每一个"加个功能"都隐含着未说明的假设。每一个"修复 bug"都暗藏着你尚未命名的根因。

Hoyeon 的工作就是找到你没说出来的东西。

```
  你说:       "加个深色模式开关"
                    │
  Hoyeon 追问: "跟随系统偏好还是手动切换?"     ← 暴露假设
               "哪些组件需要主题变体?"           ← 明确范围
               "持久化存储在哪里? 怎么存?"        ← 迫使决策
                    │
  结果:        3 条需求, 8 个子需求, 4 个任务 — 全部关联
```

这不仅仅是流程，而是基于三个关于 AI 编程应如何运作的信念。

### 1. 需求优先于任务

> *需求对了，代码自然成型。需求错了，再多代码也无法挽回。*

大多数 AI 工具直接跳到任务——"创建文件 X，编辑函数 Y。"但任务是衍生物。需求一变，任务就得跟着变。从任务出发，就是在沙地上建楼。

Hoyeon 从**目标**开始，沿着层级链向下推导:

```
Goal → Decisions → Requirements → Sub-requirements → Tasks
```

在写下任何一行代码之前，需求会从多个角度被反复打磨。访谈者追问假设，差距分析器发现遗漏，UX 审查员检查用户影响，权衡分析器评估替代方案。每个视角都在磨砺需求，直到它们足够精确，能够生成可验证的子需求。

推导链具有方向性: **需求产出任务，绝不反向。**如果需求变更，子需求和任务会被重新推导。这就是 Hoyeon 能从执行中途的阻塞中恢复的原因——需求依然有效，只有任务需要调整。

### 2. 确定性设计

> *LLM 是非确定性的。围绕它的系统不必如此。*

同一个提示词给 LLM 两次，可能产出不同的代码。这是 AI 辅助开发的根本挑战。Hoyeon 的答案: **用程序化控制约束 LLM**，使非确定性不会蔓延。

三种机制确保这一点:

- **`spec.json` 作为唯一事实来源** — 所有智能体从同一个结构化规格中读写。没有任何智能体自行编造上下文。没有信息仅存在于对话中。规格是跨越上下文窗口、压缩和智能体切换后依然存续的共享记忆。

- **CLI 强制结构** — `hoyeon-cli` 验证每次对 `spec.json` 的合并。字段名、类型、必需关系——全部在 LLM 看到数据之前由程序检查。CLI 不是建议结构，而是**拒绝**无效结构。

- **推导链即契约** — Goal → Decisions → Requirements → Sub-requirements → Tasks 相互关联。每一层引用其上一层。子需求追溯到需求。任务通过 `fulfills` 追溯到需求。链条断裂，关卡阻拦。这意味着: **只要你拥有有效的需求，系统就会产出结果**——确定性地路由，即使 LLM 的单次输出有所不同。

LLM 负责创造性工作。系统确保它不偏离轨道。

### 3. 默认机器可验证

> *如果需要人来检查，说明系统未能完成自动化。*

`spec.json` 中的每个子需求都是可测试的行为声明:

```json
{
  "id": "R1.1",
  "behavior": "Clicking dark mode toggle switches theme to dark"
}
```

子需求充当验收标准。Worker 根据子需求行为自行验证实现（可选 `--tdd` 启用测试先行工作流）。多模型代码审查 (Codex + Gemini + Claude) 独立运行并综合出共识裁定。

人工审查仅保留给机器确实无法判断的事项——UX 体验、业务逻辑正确性、命名决策。其他一切自动运行，每次都如此，无需询问。

### 4. 知识会积累

> *大多数 AI 工具每次会话都从零开始。Hoyeon 会记住。*

每次执行都会生成结构化的学习记录——不是日志，不是聊天历史，而是**类型化的知识**：出了什么问题、为什么、以及下次如何防止。

```
  /execute 运行 → Worker 遇到边缘情况
       │
  Worker 记录:
    { problem: "localStorage 配额在 5MB 时超限",
      cause:   "写入前没有检查大小",
      rule:    "在 localStorage.setItem 前始终检查剩余配额" }
       │
  下一次 /specify → 通过 BM25 搜索历史学习记录
       │
  结果: "发现: todo-app 规格中的 localStorage 配额问题。
         → 自动添加 R5: 配额守卫需求"
```

这就是**跨规格复合**。一个项目中学到的教训会在下一个项目中作为需求浮现。系统不仅仅是避免重复错误——它积极地用过去执行的证据来强化未来的规格。

三个机制使这一切成为可能：

- **`spec learning`** — Worker 在执行过程中记录结构化学习，自动映射到产生它们的需求和任务
- **`spec search`** — 跨所有规格的 BM25 搜索：需求、子需求、约束和学习记录。在项目 A 中学到的东西会影响项目 B 中提出的问题
- **复合循环** — 每次 /specify 会话都从搜索过去的学习记录开始。更多项目 → 更丰富的搜索结果 → 更完整的需求 → 执行中更少的意外 → 更好的学习 → 循环继续

结果：**通过 Hoyeon 运行的第十个项目明显优于第一个**——不是因为 LLM 改进了，而是因为知识库增长了。

---

这些不是愿景，而是架构强制执行的——CLI 拒绝无效规格，关卡阻止未验证的层级，钩子守护写入，智能体在隔离中验证。系统的设计使得**做正确的事就是阻力最小的路径**，学习在项目间积累。

---

## 实际效果

```
你:  /specify "add dark mode toggle to settings page"

  Hoyeon 对你进行访谈 (基于决策):
  ├─ "用户在夜间打开应用——应该自动检测系统深色模式，还是需要手动切换?"
  ├─ "用户在使用中切换到深色模式——图表/图片也应该反转吗?"
  └─ 推导出隐含要求: 需要 CSS 变量, localStorage 持久化, prefers-color-scheme 媒体查询

  智能体并行研究你的代码库:
  ├─ code-explorer 扫描组件结构
  ├─ docs-researcher 检查设计系统规范
  └─ ux-reviewer 标记潜在回归

  → 生成 spec.json:
    3 条需求, 8 个子需求, 4 个任务 — 全部关联

你:  /execute

  Hoyeon 编排执行:
  ├─ Worker 智能体并行实现每个任务 (--tdd: 测试先行)
  ├─ 代码审查: Codex + Gemini + Claude (多模型共识)
  └─ Final Verify: 目标 + 约束 + 子需求 — 整体检查

  → 完成。每个文件变更都可追溯到需求。
```

<details>
<summary><strong>刚才发生了什么?</strong></summary>

```
/specify → 访谈暴露了隐藏的假设
           → 智能体并行研究代码库
           → 逐层推导: L0→L1→L2→L3→L4
           → 每层由 CLI 验证 + 智能体审查把关

/execute → 编排器读取 spec.json，分派并行 Worker
           → Worker 根据子需求行为自行验证 (--tdd: 测试先行)
           → 多模型代码审查综合裁定
           → Final Verify 整体检查目标、约束、子需求
           → 原子提交，完整可追溯
```

从意图到证明，整条链一气呵成。每一步推导都经过验证。

</details>

---

## 推导链

六个层级。每层从前一层推导而来。每层在下一层开始前经过把关。

```
  L0: Goal           "add dark mode toggle"
   ↓  ◇ gate         目标是否清晰?
  L1: Context        代码库分析, UX 审查, 文档研究
   ↓  ◇ gate         上下文是否充分?
  L2: Decisions      决策访谈 → 隐含要求推导 (L2.5)
   ↓  ◇ gate         决策是否有依据?
  L3: Requirements   R1: "Toggle switches theme" → 子需求
   ↓  ◇ gate         需求是否完整?
  L4: Tasks          T1: "Add toggle component" → fulfills, depends_on
   ↓  ◇ gate         任务是否覆盖所有需求?
  Plan Approval      summary + user confirmation → /execute
```

每个关卡包含两项检查:
- **合并检查点** — CLI 验证结构和完整性
- **Gate-keeper** — 智能体团队审查范围偏移、盲点和不必要的复杂性

两项全部通过才能推进。链条的强度取决于最薄弱的环节——所以每个环节都经过验证。

### 规格契约

`spec.json` 是唯一事实来源。所有读写都围绕它进行。

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

证据链: **需求 → 子需求 → 任务 (fulfills) → 完成**。从意图到证明。

---

## 执行引擎

编排器读取 `spec.json`，分派并行 Worker 智能体:

```
  ┌─────────────────────────────────────────────────────┐
  │  /execute                                           │
  │                                                     │
  │  Worker T1 ──→ Verifier T1 ──→ Commit T1             │
  │  Worker T2 ──→ Verifier T2 ──→ Commit T2  (并行)    │
  │  Worker T3 ──→ Verifier T3 ──→ Commit T3             │
  │       │                                             │
  │       ▼                                             │
  │  Code Review (Codex + Gemini + Claude)              │
  │       │  独立审查 → 综合裁定                          │
  │       ▼                                             │
  │  Final Verify                                       │
  │    ✓ 目标对齐                                        │
  │    ✓ 约束合规                                        │
  │    ✓ 验收标准                                        │
  │    ✓ 需求覆盖                                        │
  │       │                                             │
  │       ▼                                             │
  │  Report                                             │
  └─────────────────────────────────────────────────────┘
```

Worker 负责实现，独立 Verifier 智能体检查每个任务的子需求 — 无判断，不可绕过。

### 规格是活的

> *无法适应的规格，注定会被抛弃。*

`spec.json` 不是在规划阶段冻结的静态文档。它是一份**活的契约**，在执行过程中演化——在严格的确定性边界内。

当 Worker 发现实际代码库与计划的假设不符时，规格会适应:

```
  规划时的 spec.json:
    tasks: [T1, T2, T3]           ← 3 个计划任务

  Worker T2 遇到阻塞:
    "T2 需要一个不存在的工具函数"
       │
       ▼
  系统推导 T2-fix:
    tasks: [T1, T2, T3, T2-fix]   ← 规格增长, 只追加
       │
       ▼
  T2-fix 执行 → T2 重试 → 通过
    tasks: [T1 ✓, T2 ✓, T3 ✓, T2-fix ✓]
```

这就是**有界适应**——规格会增长但绝不变异。三条规则确保确定性:

- **只追加** — 已有任务绝不修改，只添加新任务。原始计划作为审计轨迹完整保留。
- **深度 1** — 衍生任务不能再衍生任务。仅一级适应，不会级联。这防止规格陷入无限膨胀。
- **熔断器** — 每条路径最大重试次数，超限则升级给用户。系统知道何时该停止尝试并寻求帮助。

关键洞察: **执行过程中需求不变——变的只是任务。**经过推导链验证的目标、决策和需求保持稳定。任务只是最底层，也是重新推导成本最低的层级。这就是层级结构的意义: 层级越高，越稳定。

```
  执行过程中保持稳定:
    L0: Goal           ← 锁定
    L1: Context        ← 锁定
    L2: Decisions      ← 锁定
    L3: Requirements   ← 锁定
    L3: Sub-reqs       ← 锁定 (行为级验收标准)

  执行过程中可适应:
    L4: Tasks          ← 可增长 (只追加, 深度 1)
```

规格不预测未来。它在未来中存续——因为它知道哪些部分要坚守，哪些部分可以灵活调整。

---

## 二十一个思维

二十一个智能体，每个代表不同的思维模式。你无需直接与它们交互——技能在幕后编排它们。

| 智能体 | 角色 | 核心问题 |
|-------|------|---------|
| **Interviewer** | 只提问，从不构建 | *"你还有什么没说的?"* |
| **Gap Analyzer** | 在问题发生前发现遗漏 | *"什么可能出错?"* |
| **UX Reviewer** | 守护用户体验 | *"人类会喜欢这个吗?"* |
| **Tradeoff Analyzer** | 权衡每个选项的代价 | *"你在放弃什么?"* |
| **Debugger** | 追溯 bug 的根因，而非表象 | *"这是原因，还是症状?"* |
| **Code Reviewer** | 多模型共识 (Codex + Gemini + Claude) | *"三位专家会发布这个吗?"* |
| **Worker** | 按规格精确实现 | *"这符合需求吗?"* |
| **Verifier** | 每任务独立场景验证 | *"代码与所有场景一致吗?"* |
| **Ralph Verifier** | 独立的、上下文隔离的完成定义检查 | *"真的完成了吗?"* |
| **Gate-Keeper** | 验证层级转换的漂移、差距和冲突 | *"该层级是否准备好推进?"* |
| **External Researcher** | 调研库和最佳实践 | *"我们实际有什么证据?"* |

<details>
<summary><strong>全部 21 个智能体</strong></summary>

| 智能体 | 角色 |
|-------|------|
| Interviewer | 苏格拉底式提问——只问不写代码 |
| Gap Analyzer | 缺失需求和潜在陷阱检测 |
| UX Reviewer | 用户体验保护和回归预防 |
| Tradeoff Analyzer | 风险评估和更简方案建议 |
| Debugger | 带 bug 分类的根因分析 |
| Code Reviewer | 多模型审查: Codex + Gemini + Claude → SHIP/NEEDS_FIXES |
| Worker | 基于规格驱动的自验证任务实现 |
| Verifier | 独立子需求验证（机械执行，不可绕过） |
| Ralph Verifier | 隔离上下文中的独立完成定义验证 |
| External Researcher | 通过网络调研库和最佳实践 |
| Docs Researcher | 内部文档和架构决策搜索 |
| Code Explorer | 快速只读代码库搜索和模式发现 |
| Git Master | 带项目风格检测的原子提交执行 |
| Phase2 Stepback | 规划前的范围偏移和盲点检测 |
| Verification Planner | 测试策略设计 (Auto/Agent/Manual 分类) |
| Value Assessor | 正面影响和目标对齐评估 |
| Risk Analyst | 漏洞、故障模式和边界情况检测 |
| Feasibility Checker | 实际可行性评估 |
| Codex Strategist | 跨报告战略综合和盲点检测 |

</details>

---

## 命令

24 个技能——你在 Claude Code 中调用的斜杠命令。

| 类别 | 你在做什么 | 技能 |
|------|----------|------|
| **理解** | 推导需求，生成规格 | `/specify` `/quick-plan` `/discuss` `/deep-interview` `/mirror` |
| **研究** | 分析代码库，查找引用，扫描社区 | `/deep-research` `/dev-scan` `/reference-seek` `/google-search` `/browser-work` |
| **决策** | 评估权衡，多视角审查 | `/council` `/tribunal` `/tech-decision` `/stepback` |
| **构建** | 执行规格，修复 bug，迭代 | `/execute` `/ralph` `/rulph` `/bugfix` `/ultrawork` |
| **反思** | 验证变更，提取经验 | `/check` `/compound` `/scope` `/issue` |

<details>
<summary><strong>核心命令详解</strong></summary>

| 命令 | 功能 |
|------|------|
| `/specify` | 基于层级的访谈 → spec.json 推导 (L0→L4)，配合 gate-keeper |
| `/execute` | 规格驱动的并行智能体调度 + 多模型审查 + Final Verify |
| `/ultrawork` | 完整流水线: 一条命令完成 specify → execute |
| `/bugfix` | 根因诊断 → 自动生成规格 → 执行 (自适应路由) |
| `/ralph` | 基于完成定义的迭代循环——直到独立验证通过才停止 |
| `/council` | 多视角审议: tribunal + 外部 LLM + 社区扫描 |
| `/tribunal` | 3 智能体对抗式审查: 风险 + 价值 + 可行性 → 综合裁定 |
| `/scope` | 快速并行影响分析——5+ 智能体扫描可能的影响范围 |
| `/check` | 基于项目规则检查清单的推送前验证 |
| `/rulph` | 基于评分标准的多模型评估，具备自主改进能力 |

</details>

---

## 底层架构

**24 个技能 · 21 个智能体 · 18 个钩子**

```
.claude/
├── skills/
│   ├── specify/       基于层级的规格推导 (L0→L4)
│   ├── execute/       规格驱动的并行编排
│   ├── bugfix/        根因 → 规格 → 执行流水线
│   ├── council/       多视角审议
│   ├── tribunal/      3 智能体对抗式审查
│   └── ...            另外 19 个技能
├── agents/
│   ├── interviewer    苏格拉底式提问
│   ├── debugger       根因分析
│   ├── worker         任务实现
│   ├── code-reviewer  多模型共识
│   └── ...            另外 17 个智能体
├── scripts/           18 个钩子脚本
│   ├── session        生命周期管理
│   ├── guards         写入保护, 计划执行
│   ├── validation     输出质量, 故障恢复
│   └── pipeline       Ultrawork 流转, DoD 循环
└── cli/               spec.json 验证 & 状态管理
```

**核心内部机制:**

- **推导链** — L0→L4，每层转换时有合并检查点 + gate-keeper 团队
- **多模型审查** — Codex + Gemini + Claude 独立审查，综合产出 SHIP/NEEDS_FIXES 裁定
- **钩子系统** — 18 个钩子自动化流水线流转、守护写入、执行关卡、故障恢复
- **验证流水线** — 专用 Verifier 智能体独立检查每个任务的子需求
- **自改进** — 范围阻塞 → 运行时衍生修复任务 (只追加, 深度 1, 熔断器)
- **Ralph 循环** — 基于 DoD 的迭代，Stop 钩子重注入 + 独立上下文隔离验证

详见 [docs/architecture.md](docs/architecture.md) 了解完整流水线图。

---

## 快速开始

```bash
# 安装插件
claude plugin add team-attention/hoyeon
npm install -g @team-attention/hoyeon-cli

# 开始——推导需求并执行
/specify "add dark mode toggle to settings page"
/execute

# 或一条命令运行完整流水线
/ultrawork "refactor auth module"

# 通过根因分析修复 bug
/bugfix "login fails when session expires"
```

在 Claude Code 中输入 `/` 即可查看所有可用技能。

## CLI

`hoyeon-cli` 管理 spec.json 验证和会话状态:

```bash
hoyeon-cli spec init "project-name"        # 创建新规格
hoyeon-cli spec merge spec.json --json ...  # 验证合并
hoyeon-cli spec check spec.json             # 验证完整性
hoyeon-cli spec guide <section>             # 显示字段结构
```

详见 [docs/cli.md](docs/cli.md) 了解完整命令参考。

---

## 贡献

欢迎贡献。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解指南。

---

*"规格不预测未来。它在未来中存续。"*

**需求不是写出来的——而是推导出来的。**

`MIT License`
