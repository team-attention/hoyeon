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
  Must include multi-model scoring with AVAILABLE/SKIPPED/DEGRADED states.
  Must include circuit breaker logic.
  Must include pause gate at every iteration.
---

# rubric-loop

Iterative self-improvement skill driven by a user-defined rubric. Builds a scoring rubric interactively, evaluates an artifact with multiple models in parallel, then loops — improving one criterion at a time — until the score meets the threshold or the user stops.

---

## Phase 1: Rubric Building

Build an evaluation rubric through a 3-step interactive process before any scoring begins.

### Step 1 — Criteria Collection

Ask the user what they are evaluating and what matters:

```
AskUserQuestion(
  header: "What are we evaluating?",
  question: "Describe what you want to evaluate and what criteria matter to you. You can type freely or pick from suggestions.",
  options: [
    { label: "Code quality", description: "Readability, maintainability, test coverage, error handling" },
    { label: "Writing quality", description: "Clarity, structure, tone, completeness, accuracy" },
    { label: "System design", description: "Scalability, fault tolerance, simplicity, data modeling" },
    { label: "Custom — I'll describe it", description: "Type your own target and criteria below" }
  ]
)
```

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

Then confirm or modify:

```
AskUserQuestion(
  header: "Rubric Review",
  question: "Does this rubric look right? You can accept it, adjust weights, rename criteria, or add/remove dimensions.",
  options: [
    { label: "Looks good — accept rubric", description: "Proceed with this rubric as-is" },
    { label: "Adjust weights", description: "Redistribute how much each criterion contributes" },
    { label: "Edit criteria", description: "Rename, add, or remove dimensions" },
    { label: "Start over", description: "Go back to Step 1" }
  ]
)
```

If "Adjust weights" or "Edit criteria" is selected, apply changes and re-present the table. Loop until "Looks good" is selected.

**Weight validation**: After any adjustment, verify `sum(weights) == 100%` (±1% tolerance for rounding). If invalid, prompt:
> "Weights must sum to 100%. Current sum: [X]%. Please redistribute."
Re-present the rubric table until weights are valid.

### Step 3 — Threshold Setting

```
AskUserQuestion(
  header: "Pass Threshold",
  question: "What overall score (0–100) should the artifact reach before we stop improving? Default is 70.",
  options: [
    { label: "70 — Good enough (default)", description: "Stop when weighted average reaches 70/100" },
    { label: "80 — High quality", description: "Stop at 80/100" },
    { label: "90 — Excellent", description: "Stop at 90/100" },
    { label: "Custom", description: "Type your own threshold" }
  ]
)
```

Store: `threshold = <selected value>` (default 70).

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

Before scoring, run availability checks **in foreground** (not background):

```
Bash: which codex
Bash: which gemini
```

Determine model states:
- **AVAILABLE**: CLI found and ready
- **SKIPPED**: CLI not found (`which` returned nothing)
- **DEGRADED**: CLI found but call failed or timed out

### Parallel Scoring

Launch all available models **simultaneously in a single message** (multiple Bash calls or Agent calls in one turn).

**Score isolation rule**: Pass only the current artifact content to each model. Do NOT include previous round scores, improvement history, or prior evaluation feedback. Each model must score independently.

**Codex** (if AVAILABLE):

```
Bash: codex exec <<'PROMPT'
## Rubric Evaluation Task

You are a strict evaluator. Score the artifact below using the provided rubric.
Return ONLY a JSON object — no prose before or after.

## Rubric

[For each criterion:]
- Criterion: [name]
  Weight: [W]%
  Scoring anchors: 0=absent, 50=partially met, 80+=clearly met

## Artifact

[Full artifact content — isolated block]

## Required Output Format

{
  "scores": {
    "[criterion_1]": <integer 0-100>,
    "[criterion_2]": <integer 0-100>,
    ...
  },
  "suggestions": {
    "[criterion_1]": "<one concrete improvement action>",
    "[criterion_2]": "<one concrete improvement action>",
    ...
  }
}
PROMPT
```

**Gemini** (if AVAILABLE):

```
Bash: gemini -p "$(cat <<'PROMPT'
## Rubric Evaluation Task

You are a strict evaluator. Score the artifact below using the provided rubric.
Return ONLY a JSON object — no prose before or after.

## Rubric

[For each criterion:]
- Criterion: [name]
  Weight: [W]%
  Scoring anchors: 0=absent, 50=partially met, 80+=clearly met

## Artifact

[Full artifact content — isolated block]

## Required Output Format

{
  "scores": {
    "[criterion_1]": <integer 0-100>,
    "[criterion_2]": <integer 0-100>
  },
  "suggestions": {
    "[criterion_1]": "<one concrete improvement action>",
    "[criterion_2]": "<one concrete improvement action>"
  }
}
PROMPT
)"
```

**Claude** (always AVAILABLE — main agent performs self-analysis directly):

Apply the same rubric to the artifact as a self-evaluation. Score each criterion 0–100 with the same anchors. Generate one concrete suggestion per criterion. No external call needed.

### Score Aggregation

After all models complete (or fail):

**Minimum model guarantee**: Claude self-evaluation is always AVAILABLE and non-optional — it provides the fallback score if both external models are SKIPPED or DEGRADED. Score aggregation is guaranteed to have at least one model result.

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

After displaying scores, always ask before proceeding:

```
AskUserQuestion(
  header: "Round [round]/[max_rounds] — Score: [overall]/100",
  question: "How would you like to proceed?",
  options: [
    { label: "Keep going", description: "Run the next improvement round targeting the weakest criterion" },
    { label: "Adjust rubric", description: "Return to Phase 1 Step 2 to modify criteria or weights" },
    { label: "Stop here", description: "Accept the current state and generate the final report" }
  ]
)
```

- **Keep going** → continue to Improvement Dispatch below
- **Adjust rubric** → return to Phase 1 Step 2; after rubric is updated, re-run Phase 2 scoring (round counter does not reset)
- **Stop here** → proceed to Phase 4

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

```
if round > max_rounds:
  → Display score history
  → AskUserQuestion:
       header: "Circuit Breaker — Max Iterations Reached"
       question: "We've completed [max_rounds] rounds. Score is [overall]/100. What next?"
       options:
         - { label: "Accept current state", description: "Generate final report with current scores" }
         # Only show "Extend 3 more rounds" option if max_rounds + 3 <= absolute_max
         # Once absolute_max reached, show only "Accept" and "Escalate to /specify"
         - { label: "Extend 3 more rounds", description: "Raise max_rounds by 3 and continue improving (only if max_rounds + 3 <= absolute_max)" }
         - { label: "Escalate to /specify", description: "This may need architectural rethinking — open a planning session" }
```

- **Accept** → Phase 4
- **Extend 3 more rounds** → `max_rounds += 3`, continue loop (only available when `max_rounds + 3 <= absolute_max`; when `max_rounds >= absolute_max`, this option is hidden)
- **Escalate to /specify** → display message: `"Run /specify [topic] to start a structured planning session. Your rubric and score history are shown above for context."` → stop

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

```
AskUserQuestion(
  header: "Save Results?",
  question: "Save the rubric and final scores to .dev/rubric-loop/?",
  options: [
    { label: "Yes — save rubric and scores", description: "Write to .dev/rubric-loop/[timestamp]-report.md" },
    { label: "No — discard", description: "Results remain in context only" }
  ]
)
```

If "Yes":

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

- **Never interpolate user input directly into CLI parameters.** Always wrap artifact content and rubric text in a heredoc (`<<'PROMPT' ... PROMPT`) for both Codex and Gemini calls. For Gemini, use `gemini -p "$(cat <<'PROMPT' ... PROMPT)"` to prevent shell injection from artifact content containing `$(command)` or backticks.
- **Isolate artifact content from evaluator prompt.** The rubric definition and the artifact content must appear in separate labeled blocks. Do not mix them into a single paragraph.
- **Score isolation.** When dispatching re-evaluation after improvement, pass only the current state of the artifact. Strip prior round scores, improvement history, and suggestions from the model prompt.
