---
name: rulph
description: |
  Iterative rubric-based evaluation and self-improvement loop. Builds a scoring rubric interactively,
  evaluates an artifact with multiple models in parallel (Codex, Gemini, Claude), then autonomously
  improves the artifact one criterion at a time until a score threshold is met or circuit breaker fires.
  "/rulph", "rubric evaluate", "rubric score", "multi-model evaluate",
  "score and improve", "evaluate and iterate", "grade this",
  "루브릭 루프", "채점 루프", "자율 개선", "개선 루프", "루브릭 평가"
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
  Must include 3-step rubric building interaction with per-criterion floor setting.
  Must include Agent-based parallel multi-model scoring with AVAILABLE/SKIPPED/DEGRADED states.
  Must include pass check with both threshold AND floor (AND-gate).
  Must include circuit breaker logic.
  Must include state file write for Stop hook integration.
---

# rulph

Iterative self-improvement skill driven by a user-defined rubric. Builds a scoring rubric interactively, evaluates an artifact with multiple models in parallel, then loops autonomously — improving one criterion at a time — until the score meets the threshold or the circuit breaker fires. No user interaction after Phase 1.

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

**Checklist Decomposition (default)**: Break each criterion into 5–10 yes/no sub-items. Score is computed as `(checked / total) × 100`. This eliminates evaluator interpretation variance.

Present the draft as a table with sub-items:

```
## Draft Rubric

| # | Criterion       | Weight | Sub-items (yes/no each)                                    |
|---|-----------------|--------|------------------------------------------------------------|
| 1 | [criterion]     | 25%    | □ [sub-item-1] · □ [sub-item-2] · □ [sub-item-3]          |
|   |                 |        | □ [sub-item-4] · □ [sub-item-5]                            |
|   |                 |        | score = (checked / 5) × 100                                |
| 2 | [criterion]     | 25%    | □ [sub-item-1] · □ [sub-item-2] · □ [sub-item-3]          |
|   |                 |        | □ [sub-item-4] · □ [sub-item-5] · □ [sub-item-6]          |
|   |                 |        | score = (checked / 6) × 100                                |
```

**Sub-item design rules**:
- Each sub-item must be **binary observable** — answerable with yes or no by reading the artifact
- Avoid subjective sub-items ("code is clean") — reword to observable ("all functions have explicit return types")
- Order sub-items from basic (easy to pass) to advanced (hard to pass)
- Unchecked sub-items automatically become improvement targets in Phase 3

**Qualitative fallback**: If a criterion genuinely cannot be decomposed into sub-items (e.g., "writing tone"), use level-based anchors instead:

```
| # | Criterion       | Weight | Scoring Guidance (0–100)                                   |
|---|-----------------|--------|------------------------------------------------------------|
| N | [criterion]     | 25%    | 0=absent · 25=minimal · 50=partial · 75=good · 100=full   |
```

Level-based anchors must have **5 levels** (0/25/50/75/100) with one concrete observable indicator per level. 3-level anchors (0/50/80) are too coarse.

Each criterion gets:
- A 0–100 scoring range
- Either checklist sub-items (preferred) or 5-level anchors with observable indicators

Then use `AskUserQuestion` to confirm or modify (accept, adjust weights, edit criteria, or start over). Loop until the user accepts.

**Weight validation**: After any adjustment, verify `sum(weights) == 100%` (±1% tolerance for rounding). If invalid, prompt:
> "Weights must sum to 100%. Current sum: [X]%. Please redistribute."
Re-present the rubric table until weights are valid.

### Step 3 — Threshold & Floor Setting

Use `AskUserQuestion` to ask two things:

1. **Overall threshold** (0–100): what overall score the artifact should reach before stopping. Suggest 70/80/90 as options. Default is 70 if the user doesn't specify.

2. **Per-criterion floor** (0–100): the minimum score that EACH individual criterion must meet, regardless of overall score. Suggest 50/60 as options. Default is 60 if the user doesn't specify. Set to 0 to disable.

**Why floor matters**: Without a floor, strong criteria can mask weak ones (e.g., overall 80 passes threshold 70, but one criterion scores 50). The floor ensures every dimension meets a minimum bar.

### Rubric Summary (Evaluation Contract)

Display the final rubric before Phase 2 begins:

```
## Evaluation Contract

**Target**: [artifact description or path]
**Threshold**: [threshold]/100
**Per-criterion floor**: [floor]/100
**Max rounds**: 5
**Scoring method**: Checklist Decomposition

| # | Criterion   | Weight | Sub-items                              | Formula              |
|---|-------------|--------|----------------------------------------|----------------------|
| 1 | [criterion] | [W]%   | □ A · □ B · □ C · □ D · □ E           | (checked/5) × 100   |
| 2 | [criterion] | [W]%   | □ A · □ B · □ C · □ D                 | (checked/4) × 100   |
...

Pass condition: overall >= [threshold] AND every criterion >= [floor]
Rubric locked. Starting evaluation.
```

**State init** — write the loop state so the Stop hook can track progress. The state file is session-scoped to prevent cross-session interference:

```
Bash: SESSION_ID="[session ID from UserPromptSubmit hook]" && hoyeon-cli session set --sid $SESSION_ID --json '{"rulph": {"round": 0, "max_rounds": 5, "score": 0, "threshold": [threshold], "status": "active", "iteration": 0, "max_iterations": 15}}'
```

Replace `[threshold]` with the actual threshold value. The state is stored under the `.rulph` key in the session-scoped `state.json`. This file is read by the Stop hook to decide whether the loop should continue. The `iteration`/`max_iterations` fields are the Stop hook's safety counter — always preserve them in subsequent state updates.

---

## Phase 2: Multi-Model Evaluation

Score the artifact independently using up to 3 models in parallel.

### CLI Availability Check

Before scoring, check which CLIs are available:

```
Bash: command -v codex && command -v gemini
```

Model states: **AVAILABLE** (CLI found) / **SKIPPED** (not found) / **DEGRADED** (found but call failed).

Note: The 3rd evaluator (Claude) runs as a subagent — no CLI check needed.

### Parallel Scoring

**Score isolation rule**: Pass only the current artifact content to each model. Do NOT include previous round scores, improvement history, or prior evaluation feedback.

**Each evaluator** receives the same prompt template with the rubric, artifact content, and required JSON output format:

```
## Rubric Evaluation Task

You are a strict evaluator. Score the artifact below using the provided rubric.
For each criterion, check every sub-item (yes/no) and compute: score = (checked / total) × 100.
Return ONLY a JSON object — no prose before or after.

## Rubric
[criterion list with weights and sub-items checklist]

## Artifact
[Full artifact content — read the file]

## Required Output Format
{
  "scores": { "[criterion]": <0-100>, ... },
  "checklist": { "[criterion]": { "[sub-item-1]": true/false, "[sub-item-2]": true/false, ... }, ... },
  "suggestions": { "[criterion]": "<one concrete action targeting an unchecked sub-item>", ... }
}
```

**Launch all 3 evaluators in a single message using `run_in_background: true`:**

```
# All 3 in ONE message — true parallel execution
Agent(subagent_type="general-purpose", run_in_background=true,
      description="Codex evaluator",
      prompt="Run: codex exec <<'PROMPT'\n[evaluation prompt with rubric + artifact]\nPROMPT")

Agent(subagent_type="general-purpose", run_in_background=true,
      description="Gemini evaluator",
      prompt="Run: gemini -p \"$(cat <<'PROMPT'\n[evaluation prompt with rubric + artifact]\nPROMPT)\"\n")

Agent(subagent_type="general-purpose", run_in_background=true,
      description="Claude evaluator",
      prompt="[evaluation prompt with rubric + artifact — subagent evaluates directly]")
```

After launching, wait for all 3 to complete (check `TaskOutput` for each background agent). Then proceed to Score Aggregation.

### Score Aggregation

After all models complete (or fail):

**Minimum model guarantee**: If all 3 CLIs fail, fall back to main agent self-evaluation as a last resort. Score aggregation is guaranteed to have at least one model result.

**Low confidence flag**: If only 1 model is AVAILABLE, flag the round as `LOW CONFIDENCE` in the inline display. Single-model scores lack cross-validation.

1. For each criterion, compute the average score across AVAILABLE models only.
2. Compute the overall weighted average:
   ```
   overall = sum(criterion_avg[i] * weight[i]) for all i
   ```
3. Record per-model status: AVAILABLE / SKIPPED / DEGRADED.

**Inline display:**

```
📊 Score: XX/100 (Codex: XX | Gemini: XX | Claude: XX) — Threshold: [threshold] · Floor: [floor]
   [criterion_1]: XX  (Codex: XX, Gemini: XX, Claude: XX)
   [criterion_2]: XX  (Codex: XX, Gemini: XX, Claude: XX)  ⚠️ BELOW FLOOR
   ...
   Model status: Codex=AVAILABLE · Gemini=SKIPPED · Claude=AVAILABLE
   Floor violations: [list of criteria below floor, or "None"]
```

**Convergence / Divergence Analysis:**

If any two models differ by more than 20 points on the same criterion:
> "Warning: Model disagreement on '[criterion]' (gap: XX pts). Scores may reflect differing interpretations of the rubric. Consider clarifying the scoring anchor for this dimension."

**Improvement Suggestion Synthesis:**

Collect suggestions from all AVAILABLE models. Prioritize the criterion with the lowest average score. Present the top suggestion per criterion, labeled by source model.

**State update** — after every scoring round, update the session-scoped state file (preserve `iteration`/`max_iterations` for the Stop hook's safety counter):

```
Bash: SESSION_ID="[session ID from UserPromptSubmit hook]" && hoyeon-cli session set --sid $SESSION_ID --json '{"rulph": {"round": [round], "score": [overall], "threshold": [threshold], "status": "active", "iteration": 0}}'
```

Replace `[round]`, `[overall]`, etc. with actual values. Note: `iteration` resets to 0 here — the Stop hook increments it each time it fires within a round, providing a per-round safety net.

---

## Phase 3: Improvement Loop

Iteratively improve the artifact one criterion at a time until the threshold is met or the circuit breaker fires. **No user interaction in this phase** — the loop runs autonomously.

**Initialize**: `round = 1`, `max_rounds = 5`, `score_history = []`

### Loop Structure

The initial Phase 2 scoring produces baseline scores. Phase 3 then runs this loop:

```
LOOP:
  1. Pass Check → if overall >= threshold AND all criteria >= floor → Phase 4 (PASSED)
  2. Circuit Breaker → if round > max_rounds → Phase 4 (CIRCUIT BREAKER)
  3. Improvement Dispatch (improve lowest criterion — floor violations first)
  4. Re-score (return to Phase 2)
  5. Append to score_history, round += 1
  6. Repeat from 1
```

### Pass Check (Threshold + Floor)

```
below_floor = [c for c in criteria if c.score < floor]

if overall >= threshold AND len(below_floor) == 0:
  → Proceed to Phase 4 immediately (PASSED)

if len(below_floor) > 0:
  → Log: "Floor violation: [criterion] at [score] < floor [floor]. Auto-targeting for improvement."
  → Improvement target = lowest below-floor criterion (not lowest overall)

if overall < threshold AND len(below_floor) == 0:
  → Improvement target = lowest criterion (original behavior)
```

**Floor priority**: Floor violations take precedence over overall threshold. Even if overall >= threshold, a below-floor criterion blocks PASSED and triggers improvement.

### Circuit Breaker Check

```
if round > max_rounds:
  → Proceed to Phase 4 immediately (result: CIRCUIT BREAKER)
```

### Improvement Dispatch

Select the single lowest-scoring criterion (prevents scope creep). If multiple criteria tie for the lowest score, pick the one with the higher weight (greater impact on overall score).

Dispatch a worker agent:

```
Agent(subagent_type="worker",
     prompt="## Improvement Task — Round [round]

## Artifact
Location: [artifact file path or content block]

## Target Criterion
[criterion name]: current score [score]/100
Weight: [W]%

## Unchecked Sub-items (fix these)
[List each unchecked sub-item from the checklist — these are the specific gaps to close]

## Improvement Instructions
[Synthesized suggestions from all AVAILABLE models for this criterion]

## Constraint
Improve ONLY this criterion. Focus on the unchecked sub-items listed above.
Do not restructure or rewrite unrelated sections.
Return the improved artifact to the same location.")
```

After the worker completes:
1. Return to **Phase 2** for re-scoring (which updates state file automatically)
2. Append to score history: `score_history.append({ round, overall, per_criterion_scores, model_states })`
3. Increment round counter: `round += 1`
4. Return to top of loop (Threshold Check)

---

## Phase 4: Completion

**State update** — mark as completed so the Stop hook allows exit:

```
Bash: SESSION_ID="[session ID from UserPromptSubmit hook]" && hoyeon-cli session set --sid $SESSION_ID --json '{"rulph": {"status": "completed"}}'
```

### Final Report

Display the complete evaluation summary:

```
## Rulph Final Report

**Artifact**: [artifact description or path]
**Rubric**: [N] criteria · threshold [threshold]/100 · floor [floor]/100
**Result**: [PASSED / CIRCUIT BREAKER]

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

### Auto-Save Report

Always save the rubric and scores automatically. Include the full report in the saved file.

```
SESSION_ID="[session ID from UserPromptSubmit hook]"
REPORT_DIR="$HOME/.hoyeon/$SESSION_ID/tmp/rulph"
Bash: mkdir -p "$REPORT_DIR"

Write to $REPORT_DIR/$(date +%Y-%m-%d-%H%M%S)-report.md:
  [Full rubric definition]
  [Score history table]
  [Final scores table]
  [Model availability log per round]
```

Close with:
> "Finished! Final score: [final_score]/100 after [N] round(s). Report saved to session tmp."

---

## Prompt Hardening

- **Never interpolate user input directly into CLI parameters.** Always wrap artifact content and rubric text in a heredoc (`<<'PROMPT' ... PROMPT`). For Gemini, use `gemini -p "$(cat <<'PROMPT' ... PROMPT)"` to prevent shell injection. The Claude evaluator runs as a subagent so no CLI escaping is needed.
- **Isolate artifact content from evaluator prompt.** Rubric definition and artifact content must appear in separate labeled blocks.
- **Score isolation.** When re-evaluating after improvement, pass only the current artifact state. Strip prior scores, history, and suggestions from the evaluator prompt.
