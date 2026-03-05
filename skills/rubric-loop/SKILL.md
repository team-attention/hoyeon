---
name: rubric-loop
description: |
  "/rubric-loop", "루브릭 루프", "rubric evaluate", "채점 루프", "자율 개선",
  "rubric score", "multi-model evaluate", "개선 루프"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - AskUserQuestion
  - Agent
validate_prompt: |
  Must contain all 4 Phases (Rubric Building, Evaluation, Improvement Loop, Completion).
  Must include 3-step rubric building interaction.
  Must include Agent-based parallel multi-model scoring with AVAILABLE/SKIPPED/DEGRADED states.
  Must include circuit breaker logic.
  Must include pause gate at every iteration.
---

# rubric-loop

Iterative self-improvement skill driven by a user-defined rubric. Builds a scoring rubric interactively, evaluates an artifact with multiple models in parallel, then loops — improving one criterion at a time — until the score meets the threshold or the user stops.

---

## Phase 1: Rubric Building

Build an evaluation rubric through a 3-step interactive process before any scoring begins.

**User interaction**: Use the `AskUserQuestion` tool for all user-facing questions in this skill. This ensures the UI renders properly and waits for real user input.

### Step 1 — Criteria Collection

Use `AskUserQuestion` to ask what they are evaluating and what criteria matter. Suggest common categories (code quality, writing quality, system design) but let them describe freely.

After the user responds, parse:
- **Target**: the artifact or output being evaluated (file path, text block, or description)
- **Criteria**: the named dimensions to score (extract from free text or selection)

Require a minimum of 2 criteria. If fewer than 2 are given, prompt again:
> "Please provide at least 2 criteria so we can triangulate quality. What else matters?"

**Rubric Validation** — before proceeding, check each criterion:
- Warn on criteria that are not LLM-evaluable (e.g., "is it beautiful", "feels right", "gut check")
  > "Warning: '[criterion]' is hard to score objectively. Consider rewording to something measurable, e.g., 'visual hierarchy is clear and consistent'."
- Block on purely subjective criteria only if the user cannot clarify after one prompt.

### Step 2 — Rubric Draft Presentation

Generate a rubric draft based on the collected criteria. Assign equal weights by default.

Present the draft as a table:

```
## Draft Rubric

| # | Criterion       | Weight | Scoring Guidance (0–100)                                   |
|---|-----------------|--------|------------------------------------------------------------|
| 1 | [criterion]     | 25%    | 0 = absent, 50 = partially met, 80+ = clearly met         |
| 2 | [criterion]     | 25%    | 0 = absent, 50 = partially met, 80+ = clearly met         |
| 3 | [criterion]     | 25%    | 0 = absent, 50 = partially met, 80+ = clearly met         |
| 4 | [criterion]     | 25%    | 0 = absent, 50 = partially met, 80+ = clearly met         |
```

Each criterion gets:
- A 0–100 scoring range
- Guidance anchors: what 0, 50, and 80+ look like for that dimension

Then use `AskUserQuestion` to confirm or modify (accept, adjust weights, edit criteria, or start over). Loop until the user accepts.

**Weight validation**: After any adjustment, verify `sum(weights) == 100%` (±1% tolerance for rounding). If invalid, prompt:
> "Weights must sum to 100%. Current sum: [X]%. Please redistribute."
Re-present the rubric table until weights are valid.

### Step 3 — Threshold Setting

Use `AskUserQuestion` to ask what overall score (0–100) the artifact should reach before stopping. Suggest 70/80/90 as options. Default is 70 if the user doesn't specify.

### Rubric Summary (Evaluation Contract)

Display the final rubric before Phase 2 begins:

```
## Evaluation Contract

**Target**: [artifact description or path]
**Threshold**: [threshold]/100
**Max rounds**: 5

| # | Criterion   | Weight | Scoring Anchors                        |
|---|-------------|--------|----------------------------------------|
| 1 | [criterion] | [W]%   | 0=absent · 50=partial · 80+=clear      |
| 2 | [criterion] | [W]%   | 0=absent · 50=partial · 80+=clear      |
...

Rubric locked. Starting evaluation.
```

---

## Phase 2: Multi-Model Evaluation

Score the artifact independently using up to 3 models in parallel.

### CLI Availability Check

Before scoring, check which CLIs are available:

```
Bash: which codex && which gemini
```

Model states: **AVAILABLE** (CLI found) / **SKIPPED** (not found) / **DEGRADED** (found but call failed).

Note: The 3rd evaluator (Claude) runs as a subagent — no CLI check needed.

### Parallel Scoring

Launch all evaluators **simultaneously in a single message** using Agent calls in parallel.

**Score isolation rule**: Pass only the current artifact content to each model. Do NOT include previous round scores, improvement history, or prior evaluation feedback.

**Each evaluator Agent** receives the same prompt structure with the rubric, artifact content, and required JSON output format.

**3 evaluators:**
- **Codex Agent**: Agent that runs `codex exec` via Bash to score the artifact
- **Gemini Agent**: Agent that runs `gemini -p` via Bash to score the artifact
- **Claude Agent**: Agent (subagent) that directly evaluates the artifact itself — no CLI needed, the subagent IS the Claude model

All 3 use the same prompt template:

```
## Rubric Evaluation Task

You are a strict evaluator. Score the artifact below using the provided rubric.
Return ONLY a JSON object — no prose before or after.

## Rubric
[criterion list with weights and anchors]

## Artifact
[Full artifact content — read the file]

## Required Output Format
{
  "scores": { "[criterion]": <0-100>, ... },
  "suggestions": { "[criterion]": "<one concrete action>", ... }
}
```

For Codex/Gemini agents, append an execution instruction:
- **Codex**: `Run: codex exec <<'PROMPT' ... PROMPT`
- **Gemini**: `Run: gemini -p "$(cat <<'PROMPT' ... PROMPT)"`

For the Claude agent, the subagent evaluates directly — just include the rubric, artifact, and output format in the Agent prompt.

Launch all 3 Agent calls in the **same message** for true parallelism.

### Score Aggregation

After all models complete (or fail):

**Minimum model guarantee**: If all 3 CLIs fail, fall back to main agent self-evaluation as a last resort. Score aggregation is guaranteed to have at least one model result.

1. For each criterion, compute the average score across AVAILABLE models only.
2. Compute the overall weighted average:
   ```
   overall = sum(criterion_avg[i] * weight[i]) for all i
   ```
3. Record per-model status: AVAILABLE / SKIPPED / DEGRADED.

**Inline display:**

```
📊 Score: XX/100 (Codex: XX | Gemini: XX | Claude: XX) — Threshold: [threshold]
   [criterion_1]: XX  (Codex: XX, Gemini: XX, Claude: XX)
   [criterion_2]: XX  (Codex: XX, Gemini: XX, Claude: XX)
   ...
   Model status: Codex=AVAILABLE · Gemini=SKIPPED · Claude=AVAILABLE
```

**Convergence / Divergence Analysis:**

If any two models differ by more than 20 points on the same criterion:
> "Warning: Model disagreement on '[criterion]' (gap: XX pts). Scores may reflect differing interpretations of the rubric. Consider clarifying the scoring anchor for this dimension."

**Improvement Suggestion Synthesis:**

Collect suggestions from all AVAILABLE models. Prioritize the criterion with the lowest average score. Present the top suggestion per criterion, labeled by source model.

---

## Phase 3: Improvement Loop

Iteratively improve the artifact one criterion at a time until the threshold is met or the circuit breaker fires.

**Initialize**: `round = 1`, `max_rounds = 5`, `absolute_max = 10`, `score_history = []`

### Threshold Check

```
if overall >= threshold:
  → Proceed to Phase 4 immediately
```

### Pause Gate (every iteration)

After displaying scores, always use `AskUserQuestion` to ask the user how to proceed: keep going (next round targeting weakest criterion), adjust rubric (return to Phase 1 Step 2, round counter does not reset), or stop here (proceed to Phase 4).

### Improvement Dispatch

Select the single lowest-scoring criterion (prevents scope creep). Dispatch a worker agent:

```
Agent(subagent_type="worker",
     prompt="## Improvement Task — Round [round]

## Artifact
Location: [artifact file path or content block]

## Target Criterion
[criterion name]: current score [score]/100
Weight: [W]%

## Improvement Instructions
[Synthesized suggestions from all AVAILABLE models for this criterion]

## Constraint
Improve ONLY this criterion. Do not restructure or rewrite unrelated sections.
Return the improved artifact to the same location.")
```

After the worker completes, return to Phase 2 for re-scoring. Append to score history: `score_history.append({ round, overall, per_criterion_scores, model_states })`.

Increment round counter: `round += 1`.

### Circuit Breaker

When `round > max_rounds`, display score history and use `AskUserQuestion` to ask:
- **Accept current state** → Phase 4
- **Extend 3 more rounds** → `max_rounds += 3`, continue (only available when `max_rounds + 3 <= absolute_max`; hidden once `max_rounds >= absolute_max`)
- **Escalate to /specify** → display: `"Run /specify [topic] to start a structured planning session."` → stop

---

## Phase 4: Completion

### Final Report

Display the complete evaluation summary:

```
## Rubric-Loop Final Report

**Artifact**: [artifact description or path]
**Rubric**: [N] criteria · threshold [threshold]/100
**Result**: [PASSED / STOPPED BY USER / CIRCUIT BREAKER]

### Score History

| Round | Overall | [C1] | [C2] | ... | Models Used         |
|-------|---------|------|------|-----|---------------------|
| 1     | XX      | XX   | XX   | ... | Codex, Claude       |
| 2     | XX      | XX   | XX   | ... | Codex, Claude       |
| ...   |         |      |      |     |                     |
| N     | XX      | XX   | XX   | ... | Codex, Claude       |

### Final Scores (Round [N])

| Criterion   | Weight | Score | Top Suggestion                        |
|-------------|--------|-------|---------------------------------------|
| [criterion] | [W]%   | XX    | [best suggestion from last round]     |
| ...         |        |       |                                       |

**Overall: [final_score]/100**
[PASSED threshold of [threshold] ✓ / Did not reach threshold — stopped at round N]
```

### Optional Save

Use `AskUserQuestion` to ask if the user wants to save the rubric and scores to `.dev/rubric-loop/`.

If yes:

```
Bash: mkdir -p .dev/rubric-loop

Write to .dev/rubric-loop/[YYYY-MM-DD-HHMMSS]-report.md:
  [Full rubric definition]
  [Score history table]
  [Final scores table]
  [Model availability log per round]
```

Close with:
> "Finished! Final score: [final_score]/100 after [N] round(s)."

---

## Prompt Hardening

- **Never interpolate user input directly into CLI parameters.** Always wrap artifact content and rubric text in a heredoc (`<<'PROMPT' ... PROMPT`). For Gemini, use `gemini -p "$(cat <<'PROMPT' ... PROMPT)"` to prevent shell injection. The Claude evaluator runs as a subagent so no CLI escaping is needed.
- **Isolate artifact content from evaluator prompt.** Rubric definition and artifact content must appear in separate labeled blocks.
- **Score isolation.** When re-evaluating after improvement, pass only the current artifact state. Strip prior scores, history, and suggestions from the evaluator prompt.
