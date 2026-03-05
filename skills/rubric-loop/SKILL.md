---
name: rubric-loop
description: |
  Iterative rubric-based evaluation and self-improvement loop. Builds a scoring rubric interactively,
  evaluates an artifact with multiple models in parallel (Codex, Gemini, Claude), then autonomously
  improves the artifact one criterion at a time until a score threshold is met or circuit breaker fires.
  "/rubric-loop", "rubric evaluate", "rubric score", "multi-model evaluate",
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
  Must include 3-step rubric building interaction.
  Must include Agent-based parallel multi-model scoring with AVAILABLE/SKIPPED/DEGRADED states.
  Must include circuit breaker logic.
  Must include state file write for Stop hook integration.
---

# rubric-loop

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

**State init** — write the loop state so the Stop hook can track progress. The state file is session-scoped to prevent cross-session interference:

```
Bash: SESSION_ID=$(jq -r '.session_id // "unknown"' "$HOME/.claude/.session-context" 2>/dev/null || echo "unknown") && mkdir -p "$HOME/.claude/.hook-state" && cat > "$HOME/.claude/.hook-state/rubric-loop-$SESSION_ID.json" <<STATEOF
{"round":0,"max_rounds":5,"score":0,"threshold":[threshold],"status":"active","session_id":"$SESSION_ID","iteration":0,"max_iterations":15}
STATEOF
```

Replace `[threshold]` with the actual threshold value. The state file uses `rubric-loop-$SESSION_ID.json` naming. This file is read by the Stop hook to decide whether the loop should continue. The `iteration`/`max_iterations` fields are the Stop hook's safety counter — always preserve them in subsequent state updates.

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

**State update** — after every scoring round, update the session-scoped state file (preserve `iteration`/`max_iterations` for the Stop hook's safety counter):

```
Bash: SESSION_ID=$(jq -r '.session_id // "unknown"' "$HOME/.claude/.session-context" 2>/dev/null || echo "unknown") && cat > "$HOME/.claude/.hook-state/rubric-loop-$SESSION_ID.json" <<STATEOF
{"round":[round],"max_rounds":[max_rounds],"score":[overall],"threshold":[threshold],"status":"active","session_id":"$SESSION_ID","iteration":0,"max_iterations":15}
STATEOF
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
  1. Threshold Check → if overall >= threshold → Phase 4 (PASSED)
  2. Circuit Breaker → if round > max_rounds → Phase 4 (CIRCUIT BREAKER)
  3. Improvement Dispatch (improve lowest criterion)
  4. Re-score (return to Phase 2)
  5. Append to score_history, round += 1
  6. Repeat from 1
```

### Threshold Check

```
if overall >= threshold:
  → Proceed to Phase 4 immediately
```

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

## Improvement Instructions
[Synthesized suggestions from all AVAILABLE models for this criterion]

## Constraint
Improve ONLY this criterion. Do not restructure or rewrite unrelated sections.
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
Bash: SESSION_ID=$(jq -r '.session_id // "unknown"' "$HOME/.claude/.session-context" 2>/dev/null || echo "unknown") && cat > "$HOME/.claude/.hook-state/rubric-loop-$SESSION_ID.json" <<'STATEOF'
{"status":"completed"}
STATEOF
```

### Final Report

Display the complete evaluation summary:

```
## Rubric-Loop Final Report

**Artifact**: [artifact description or path]
**Rubric**: [N] criteria · threshold [threshold]/100
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
Bash: mkdir -p .dev/rubric-loop

Write to .dev/rubric-loop/$(date +%Y-%m-%d-%H%M%S)-report.md:
  [Full rubric definition]
  [Score history table]
  [Final scores table]
  [Model availability log per round]
```

Close with:
> "Finished! Final score: [final_score]/100 after [N] round(s). Report saved to .dev/rubric-loop/."

---

## Prompt Hardening

- **Never interpolate user input directly into CLI parameters.** Always wrap artifact content and rubric text in a heredoc (`<<'PROMPT' ... PROMPT`). For Gemini, use `gemini -p "$(cat <<'PROMPT' ... PROMPT)"` to prevent shell injection. The Claude evaluator runs as a subagent so no CLI escaping is needed.
- **Isolate artifact content from evaluator prompt.** Rubric definition and artifact content must appear in separate labeled blocks.
- **Score isolation.** When re-evaluating after improvement, pass only the current artifact state. Strip prior scores, history, and suggestions from the evaluator prompt.
