# Contracts Auto-Patch Recipe

Orchestrator-side recipe for patching `contracts.md` when worker output signals a
cross-module contract mismatch. Runs automatically — **no user confirmation**
(INV-7 / C4). Every patch is append-logged to `audit.md`.

**Inputs**:
- `worker_output` — the WorkerOutput payload just returned (see contracts.md → WorkerOutput)
- `task_id` — plan.json task identifier that produced `worker_output`
- `round` — current dispatch round (integer)
- `contracts_path` — absolute path to `<spec_dir>/contracts.md` (may be null)
- `audit_path` — absolute path to `<spec_dir>/audit.md`

**Tools used** (INV-5): `Read`, `Edit`, `Write` only. **Never `hoyeon-cli2`** for
contracts.md or audit.md.

---

## When to Invoke

Called by the dispatch mode (`direct.md` / `agent.md` / `team.md`) immediately
after a worker result is collected, **before** the orchestrator marks the task
`done` or enqueues a retry. Runs once per worker output (never in a loop inside
itself — a second mismatch in round N+1 will re-invoke it).

Preconditions:
- `contracts_path != null` (no contracts.md → nothing to patch; skip)
- `worker_output` parsed and available

---

## Phase A: Detection (fulfills R-F9.1)

Scan `worker_output` for either of two signals. Detection is a pure function over
the returned JSON — the orchestrator does **not** re-read requirements.md or
contracts.md body during detection (INV-3).

```
function detect_mismatch(worker_output) → mismatch | null:
  # Signal 1: explicit field per WorkerOutput contract.
  # Workers with multiple issues MUST concatenate them into this single
  # string (e.g., join with "\n- ") — there is no separate array field.
  IF worker_output.contract_mismatch is non-empty string:
    return { signal: "contract_mismatch",
             text: worker_output.contract_mismatch,
             severity: "explicit" }

  # Signal 2: BLOCKED with contract-related reason
  IF worker_output.status == "blocked"
     AND worker_output.blocked_reason matches /contract|invariant|interface/i:
    return { signal: "blocked_contract",
             text: worker_output.blocked_reason,
             severity: "inferred" }

  return null
```

If `detect_mismatch` returns `null`, skip the rest of this recipe — there is
nothing to patch.

### Decide the patch shape

Once a signal is detected, the orchestrator classifies the mismatch into a patch
kind. This is the "decide what to patch" step mandated by R-F9.1.

```
function classify_patch(mismatch, task_id) → patch_plan:
  text = mismatch.text

  # Kind 1: new invariant needed
  IF text matches /missing invariant|should enforce|need rule|auto-?patch policy/i:
    return { kind: "add_invariant",
             section: "## Invariants",
             next_id: next_invariant_id(),   # e.g., INV-10 if INV-9 exists
             rationale: text,
             origin: task_id }

  # Kind 2: interface field add/modify
  IF text matches /field|param|add to interface|missing property|signature/i:
    interface_name = extract_interface_name(text)  # e.g., "WorkerOutput"
    field_name     = extract_field_name(text)      # e.g., "round"
    return { kind: "modify_interface",
             section: "### " + interface_name,
             field_name: field_name,
             rationale: text,
             origin: task_id }

  # Kind 3: allowed churn / relax constraint
  IF text matches /allow|permit|relax|exception/i:
    return { kind: "mark_allowed_churn",
             section: "## Invariants",
             rationale: text,
             origin: task_id }

  # Kind 4: unknown — fall through to annotation
  # Do NOT fabricate an invariant; just append a NOTE block that a later
  # worker or human can resolve. Keeps INV-7 honest: orchestrator always
  # applies *something*, even if it's a visible marker, and the audit log
  # records the ambiguity.
  return { kind: "annotate_unknown",
           section: "## Notes",
           rationale: text,
           origin: task_id }
```

`next_invariant_id()` reads `contracts.md` only to scan existing `INV-N` labels
and return `N+1`. This is a **metadata read** (counting labels), not a body
read — INV-3 permits it.

> **INV-3 carve-out.** This recipe IS the sole exception to INV-3 —
> the orchestrator reads `contracts.md` ONLY for (i) INV-N label scanning
> (`next_invariant_id()`) and (ii) section anchor location
> (`find_last_invariant_line()`, `find_interface_anchor()`,
> `find_section_anchor()`, `has_section()`). No other orchestrator context
> may read `contracts.md`. Readers who need the contract should self-read per
> the Worker Charter (R-F6.1). F7 is responsible for updating `contracts.md`
> INV-3 to note this carve-out; this recipe does not edit that rule itself.

---

## Phase B: Apply Patch (fulfills R-F9.2)

No user confirm. Orchestrator edits `contracts.md` inline, then appends the
patch record to `audit.md`.

```
function apply_patch(patch_plan, contracts_path, audit_path, round):
  timestamp = now_iso8601()

  # ─── Step 1: Edit contracts.md ──────────────────────────────────────
  IF patch_plan.kind == "add_invariant":
    new_line = "- **" + patch_plan.next_id + "**: "
             + one_line_summary(patch_plan.rationale)
             + " (origin: " + patch_plan.origin + ")"

    # Append inside the existing Invariants section (before the file end).
    # Uses Edit tool with unique anchor (last existing INV-N line).
    last_inv_line = find_last_invariant_line(contracts_path)
    Edit(
      file_path=contracts_path,
      old_string=last_inv_line,
      new_string=last_inv_line + "\n" + new_line
    )
    diff_preview = "+ " + new_line

  ELSE IF patch_plan.kind == "modify_interface":
    # Locate the interface heading, then append a bullet describing the
    # change. Keep it surgical — do not rewrite the whole section.
    anchor = find_interface_anchor(contracts_path, patch_plan.section)
    addition = "- `" + patch_plan.field_name + "` — "
             + one_line_summary(patch_plan.rationale)
             + " (added by " + patch_plan.origin + ")"
    Edit(
      file_path=contracts_path,
      old_string=anchor,
      new_string=anchor + "\n" + addition
    )
    diff_preview = "+ " + addition

  ELSE IF patch_plan.kind == "mark_allowed_churn":
    note = "- **Allowed churn** (origin: " + patch_plan.origin + "): "
         + one_line_summary(patch_plan.rationale)
    last_inv_line = find_last_invariant_line(contracts_path)
    Edit(
      file_path=contracts_path,
      old_string=last_inv_line,
      new_string=last_inv_line + "\n" + note
    )
    diff_preview = "+ " + note

  ELSE:  # annotate_unknown
    note = "- UNRESOLVED (origin: " + patch_plan.origin + ", round "
         + round + "): " + one_line_summary(patch_plan.rationale)
    # Create Notes section if missing, then append.
    # INV-5 permits only Read/Edit/Write — no helper tools.
    IF not has_section(contracts_path, "## Notes"):
      existing = Read(contracts_path)
      Write(contracts_path, existing + "\n## Notes\n\n" + note + "\n")
    ELSE:
      anchor = find_section_anchor(contracts_path, "## Notes")
      Edit(file_path=contracts_path,
           old_string=anchor,
           new_string=anchor + "\n" + note)
    diff_preview = "+ " + note

  # ─── Step 2: Append audit.md entry ──────────────────────────────────
  # NOTE: Read/Write/Edit only. cli2 MUST NOT touch audit.md (INV-5).
  audit_entry = build_audit_entry(round, timestamp, patch_plan, diff_preview)

  existing_audit = Read(audit_path) if exists(audit_path) else ""
  Write(audit_path, existing_audit + "\n" + audit_entry + "\n")
```

### Audit entry format

```markdown
## Contracts Patch (round {round}, {timestamp})
- Signal: worker {origin_task_id} reported "{one_line_summary(rationale)}"
- Patch kind: {add_invariant | modify_interface | mark_allowed_churn | annotate_unknown}
- Section: {section heading edited}
- Diff:
  ```diff
  {diff_preview}
  ```
- User confirm: NONE (INV-7)
```

The `User confirm: NONE (INV-7)` line is a canonical marker so reviewers can
grep `audit.md` for auto-patch activity and verify it matches the INV-7 policy.

---

## Phase C: Return Control

After `apply_patch` completes, return to the caller (dispatch mode). The caller
continues its normal flow — marking the task `done`, enqueuing a retry, or
moving to the next round. The auto-patch itself does **not** change task
status, retry counts, or dispatch ceiling (INV-6 is unaffected: patching
contracts.md is not a dispatch).

Subsequent workers in the same run will Read the updated `contracts.md` as part
of the Worker Charter self-read pattern (R-F6.1) — so the patch takes effect
from the next worker forward without any extra plumbing.

---

## Concrete Example Walkthrough

**Scenario.** During round 2, worker for `T5` (agent.md dispatch) returns:

```json
{
  "status": "done",
  "fulfills": [
    {"sub_req_id": "R-F4.3", "file_path": "skills/execute/references/agent.md", "line": 78},
    {"sub_req_id": "R-F4.4", "file_path": "skills/execute/references/agent.md", "line": 142}
  ],
  "contract_mismatch": "WorkerOutput is missing a `round` echo field — agent mode cannot tell which round a background result belongs to when notifications arrive out of order."
}
```

### Step 1 — detect_mismatch

```
signal:   "contract_mismatch"
text:     "WorkerOutput is missing a `round` echo field — agent mode cannot tell..."
severity: "explicit"
```

### Step 2 — classify_patch

Text matches `/field|missing property/i` → `kind: "modify_interface"`.
Interface name extracted: `WorkerOutput`.

```
patch_plan = {
  kind:      "modify_interface",
  section:   "### WorkerOutput",
  rationale: "WorkerOutput is missing a `round` echo field — ...",
  origin:    "T5"
}
```

### Step 3 — apply_patch → contracts.md Edit

Find anchor line `*fulfills R6.2, R10.2*` under `### WorkerOutput`, then insert
a new bullet **under the existing Required fields list**. The concrete Edit call:

```
Edit(
  file_path=".hoyeon/specs/execute/contracts.md",
  old_string="- `contract_mismatch` (optional) — free-text description of detected contract violation",
  new_string="- `contract_mismatch` (optional) — free-text description of detected contract violation\n- `round` (number, optional) — echo of the dispatch round for notification ordering (added by T5)"
)
```

### Step 4 — apply_patch → audit.md append

```markdown
## Contracts Patch (round 2, 2026-04-17T20:05:11)
- Signal: worker T5 reported "WorkerOutput is missing a `round` echo field — agent mode cannot order out-of-order notifications"
- Patch kind: modify_interface
- Section: ### WorkerOutput
- Diff:
  ```diff
  + - `round` (number, optional) — echo of the dispatch round for notification ordering (added by T5)
  ```
- User confirm: NONE (INV-7)
```

(The `Signal:` line uses `one_line_summary(rationale)` — the first sentence of
the rationale truncated to ~120 chars — matching the format spec above.)

### Step 5 — return

Control returns to `agent.md`, which marks `T5` done and continues round 2.
Round 3 workers, on self-read of `contracts.md`, will see the new `round`
field and use it.

---

## Helper Definitions

Each helper below is a plain function the orchestrator runs in its own
context — no sub-agents, no cli2. All file access uses `Read` only (anchor /
label scanning is a metadata read, permitted by the INV-3 carve-out above).

### `next_invariant_id(contracts_path) → string`

```
text = Read(contracts_path)
# Match every bullet like `- **INV-12**:` or `**INV-7**:` case-insensitively.
ids = regex_find_all(text, /\bINV-(\d+)\b/)
IF ids is empty:
  return "INV-1"
max_n = max(int(n) for n in ids)
return "INV-" + (max_n + 1)
```

### `extract_interface_name(text) → string | null`

```
# Preferred: explicit `### Name` reference in the mismatch text.
m = regex_find(text, /###\s+([A-Za-z][A-Za-z0-9_]*)/)
IF m: return m.group(1)

# Fallback: any TitleCase token adjacent to a contract/interface keyword.
m = regex_find(text, /(?:interface|contract|shape|schema|type)\s+`?([A-Z][A-Za-z0-9_]+)`?/i)
IF m: return m.group(1)

# Final fallback: first TitleCase token in the text.
m = regex_find(text, /\b([A-Z][A-Za-z0-9_]{2,})\b/)
return m ? m.group(1) : null
```

### `extract_field_name(text) → string | null`

```
# Preferred: a backtick-quoted token immediately after "field"/"property"/"param".
m = regex_find(text, /(?:field|property|param|parameter|key)\s+`([^`]+)`/i)
IF m: return m.group(1)

# Fallback: any backtick-quoted identifier in the text.
m = regex_find(text, /`([A-Za-z_][A-Za-z0-9_]*)`/)
return m ? m.group(1) : null
```

### `one_line_summary(text) → string`

```
# First sentence boundary, capped at 140 chars; normalize whitespace.
first = split(text, /(?<=[.!?])\s+/)[0] or text
trimmed = normalize_whitespace(first)
return trimmed.length > 140 ? trimmed.slice(0, 137) + "..." : trimmed
```

### `has_section(contracts_path, heading) → bool`

```
# heading example: "## Notes" or "## Invariants"
text = Read(contracts_path)
return regex_find(text, "^" + escape(heading) + "\\s*$", multiline=true) != null
```

### `find_section_anchor(contracts_path, heading) → string`

```
# Returns the last non-empty line inside the named section (used as unique
# Edit anchor when appending). If the section has no body yet, returns the
# heading line itself.
text = Read(contracts_path)
lines = text.split("\n")
start = lines.find_index(line => line.strip() == heading.strip())
IF start < 0: ERROR "section not found: " + heading

# Walk forward until the next `## ` heading or EOF.
end = start + 1
WHILE end < lines.length AND NOT lines[end].startswith("## "):
  end += 1

# Last non-empty line inside [start+1 .. end) — fallback to heading.
body = [lines[i] for i in range(start + 1, end) if lines[i].strip() != ""]
return body.length > 0 ? body[-1] : lines[start]
```

### `find_last_invariant_line(contracts_path) → string`

```
# Convenience wrapper — Invariants section is the canonical append target for
# add_invariant / mark_allowed_churn.
return find_section_anchor(contracts_path, "## Invariants")
```

### `find_interface_anchor(contracts_path, section_heading) → string`

```
# section_heading example: "### WorkerOutput"
# Returns the last non-empty line inside that interface's subsection so the
# orchestrator can Edit(old=anchor, new=anchor + "\n- new bullet").
text = Read(contracts_path)
lines = text.split("\n")
start = lines.find_index(line => line.strip() == section_heading.strip())
IF start < 0: ERROR "interface section not found: " + section_heading

# Walk forward until the next `## ` or `### ` heading or EOF.
end = start + 1
WHILE end < lines.length AND NOT (
  lines[end].startswith("## ") OR lines[end].startswith("### ")
):
  end += 1

body = [lines[i] for i in range(start + 1, end) if lines[i].strip() != ""]
return body.length > 0 ? body[-1] : lines[start]
```

Each helper is deterministic and read-only — mutation of `contracts.md`
happens exclusively in `apply_patch` (Phase B) via `Edit` / `Write`.

---

## Traceability

| Sub-req  | Implemented by                                                    |
|----------|-------------------------------------------------------------------|
| R-F9.1   | Phase A (`detect_mismatch` + `classify_patch`) — decides what to patch |
| R-F9.2   | Phase B (`apply_patch`) — inline Edit + audit append, no user confirm (INV-7) |

| Invariant | Enforcement                                                     |
|-----------|-----------------------------------------------------------------|
| INV-3     | Detection reads worker output only; contracts/audit are *written*, not scanned for business prose |
| INV-5     | All file mutations via `Read` / `Edit` / `Write` — cli2 never touches contracts.md or audit.md |
| INV-7     | No AskUserQuestion; `User confirm: NONE (INV-7)` marker in every audit entry |
| C4        | Same as INV-7 — auto-patch policy enforced                      |
