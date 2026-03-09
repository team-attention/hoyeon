---
name: ralph
description: |
  Iterative task completion loop with Definition of Done verification.
  Combines the Ralph Wiggum technique (prompt re-injection via Stop hook) with
  DoD-based independent verification. Claude proposes DoD criteria, user confirms,
  then Claude works autonomously. Stop hook re-injects the original prompt and
  blocks exit until all DoD items are independently verified.
  "/ralph", "ralph loop", "ralph 루프", "반복 작업", "DoD 루프",
  "완료 검증 루프", "task loop", "keep going until done"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - Agent
  - AskUserQuestion
validate_prompt: |
  Must contain Phase 1 (DoD Collection) and Phase 2 (Work Execution).
  Must use AskUserQuestion for DoD confirmation.
  Must write state via hoyeon-cli session set with .ralph namespace.
  Must write DoD file to session files directory.
  Must include prompt storage for Stop hook re-injection.
---

# ralph

Iterative task completion loop driven by a user-confirmed Definition of Done. Combines the Ralph Wiggum technique (prompt re-injection on stop) with DoD-based independent verification.

**How it works:**
1. You propose DoD criteria based on the user's request
2. User confirms/modifies via AskUserQuestion
3. You work on the task
4. When you try to stop, the Stop hook checks the DoD checklist:
   - If unchecked items remain → blocks exit, re-injects original prompt + remaining items
   - If all items checked → allows exit
5. Loop continues until all DoD items verified or circuit breaker (max 10 iterations)

---

## Phase 1: DoD Collection

Build a Definition of Done through interactive confirmation before starting work.

### Step 1 — Analyze & Propose

Read the user's request carefully. Based on the task, propose 3–7 concrete, verifiable DoD criteria.

**Good criteria** (binary, independently verifiable):
- "All unit tests pass (`npm test` exits 0)"
- "New function `parseConfig()` exists in `src/config.ts`"
- "No TypeScript errors (`tsc --noEmit` exits 0)"

**Bad criteria** (vague, subjective):
- "Code is clean" → reword to "No lint warnings (`eslint .` exits 0)"
- "Works correctly" → reword to specific test or behavior check

Present as a numbered markdown checklist:

```
Based on your request, here's my proposed Definition of Done:

1. [concrete criterion 1]
2. [concrete criterion 2]
3. [concrete criterion 3]
...

Each item will be independently verified before the task is considered complete.
```

### Step 2 — User Confirmation

Use `AskUserQuestion` to confirm:

> "Here are the proposed DoD criteria. You can:
> - **Accept** as-is
> - **Add** criteria (tell me what to add)
> - **Remove** criteria (tell me which to remove)
> - **Modify** criteria (tell me what to change)
>
> Also, set **max iterations** (default: 10) if you want to limit the loop."

Loop until the user accepts. Parse their response for:
- Additions, removals, or modifications
- Custom max_iterations (default 10 if not specified)

### Step 3 — State Initialization

After user confirms, initialize the loop state and write the DoD file.

**Write DoD file** — create the checklist as a markdown file:

```
Bash: SESSION_ID="[session ID from hook]" && mkdir -p "$HOME/.hoyeon/$SESSION_ID/files" && cat > "$HOME/.hoyeon/$SESSION_ID/files/ralph-dod.md" << 'DODEOF'
# Definition of Done

- [ ] [criterion 1]
- [ ] [criterion 2]
- [ ] [criterion 3]
...
DODEOF
```

**Write state** — store the original prompt and configuration for the Stop hook:

```
Bash: SESSION_ID="[session ID from hook]" && PROMPT=$(cat << 'PROMPTEOF'
[The user's ORIGINAL request/prompt — exactly as they typed it, before any processing]
PROMPTEOF
) && hoyeon-cli session set --sid "$SESSION_ID" --json "$(jq -n \
  --arg prompt "$PROMPT" \
  --arg dod_file "$HOME/.hoyeon/$SESSION_ID/files/ralph-dod.md" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{ralph: {prompt: $prompt, iteration: 0, max_iterations: 10, dod_file: $dod_file, created_at: $created_at}}')"
```

Replace `max_iterations: 10` with the user's chosen value if they specified one.

**Display confirmation:**

```
## Ralph Loop Initialized

**Task**: [summary of what you'll do]
**DoD**: [N] criteria
**Max iterations**: [max_iterations]

Starting work. The loop will verify each DoD item independently before allowing completion.
```

---

## Phase 2: Work Execution

Now do the actual work. Focus on completing the task to satisfy all DoD criteria.

**Rules during work:**
- Do NOT read or modify the DoD file (`ralph-dod.md`) — it's guarded by the system
- Do NOT try to check off DoD items yourself — the Stop hook handles verification
- Focus purely on the task described in the user's original request
- Work thoroughly — the loop will catch anything you miss

When you believe the work is complete, simply finish your response normally. The Stop hook will:
1. Check the DoD file for unchecked items
2. If items remain: block exit, re-inject the original prompt in `reason`, list remaining items in `systemMessage`
3. If all items checked: allow exit

**On re-entry (after Stop hook blocks):**
- You will receive the original prompt again as your task
- The `systemMessage` will tell you which DoD items are still unchecked
- Review the remaining items, do the work, then verify each one independently
- For each verified item, change `- [ ]` to `- [x]` in the DoD file (allowed during verification phase)
- Do NOT blindly check items — actually read files, run tests, verify the real state

---

## Prompt Hardening

- Store the original prompt in state.json via heredoc to prevent shell injection
- The Stop hook re-injects the prompt via jq JSON construction (safe)
- DoD file is guarded during work phase — only editable during verification
- Circuit breaker at max_iterations prevents infinite loops
