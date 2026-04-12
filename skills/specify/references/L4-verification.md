## L4: Verification (Journeys)

**Output**: `verification.journeys[]` (optional — may be empty after explicit confirmation)

L4 in v2 replaces the legacy L4 Tasks step. There are no tasks produced by `/specify` in v2;
task planning is the job of the 2nd-PR `plan.js` pipeline. At L4 the specify skill derives
**verification journeys** — named cross-sub flows that describe how 2+ sub-requirements compose
into a single end-to-end scenario that must be verified together.

This file is self-contained (per C10): heuristic, AskUserQuestion flow, merge semantics,
post-merge validation, and the zero-journey confirmation gate are all documented inline.

---

### 1. Purpose + Output

**Purpose.** Surface integration-level acceptance scenarios that are invisible at the sub-req
level. A sub-req is atomic (one Given/When/Then triple). A *journey* is a composition: "given
this entry sub, when the user proceeds through sub A → sub B → sub C, then this end-state holds."
Journeys are how reviewers and executors agree on what "it works end-to-end" means.

**Output shape.** Merge into the top-level `verification` object:

```json
{
  "verification": {
    "journeys": [
      {
        "id": "J1",
        "name": "New user onboarding → first project created",
        "composes": ["R1.1", "R2.1", "R3.1"],
        "given": "A fresh browser session with no account",
        "when": "User signs up, verifies email, and creates a project",
        "then": "Project list page shows the newly created project and session is authenticated"
      }
    ]
  }
}
```

Journey schema (authoritative — see `hoyeon-cli spec guide journey --schema v2`):

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | `J1`, `J2`, ... (stable, unique per spec) |
| `name` | yes | One-line human label |
| `composes` | yes | Array of existing sub-req ids, **min 2 entries** |
| `given` | yes | Initial state across the composition |
| `when` | yes | Sequence of user/system actions spanning the composed subs |
| `then` | yes | End-state observable after the full sequence |

`verification.journeys[]` is **optional** at the schema level — 0 journeys is valid, but only
after the user explicitly confirms (see §7).

---

### 2. Scan Heuristic

After L3 approval the spec has every sub-requirement with GWT filled. Claude now scans
`requirements[].sub[]` and proposes candidate journeys. Two signals are used, in order.

#### 2a. Shared entity / state across sub GWTs

For each sub, extract noun phrases from `given`, `when`, `then` (concatenated). Two subs share
an entity when their noun-phrase sets intersect after normalization.

**Normalization rule** (apply before comparison):
1. Lowercase the string.
2. Collapse all whitespace to single spaces; trim.
3. Strip leading articles (`a`, `an`, `the`).
4. Treat singular/plural as equivalent via naive suffix strip (`-s`, `-es`).
5. Keep quoted identifiers (`'T1'`, `"/orders"`) verbatim — do not normalize quoted strings.

**Example.** Three subs in a todo-app spec:

- R1.1 — `given`: "An authenticated user exists" / `when`: "POST /projects with name" / `then`: "Returns 201 with project id"
- R2.3 — `given`: "A project with id=42 exists" / `when`: "GET /projects/42" / `then`: "Returns project JSON"
- R3.1 — `given`: "A project exists on the list page" / `when`: "User clicks it" / `then`: "Editor opens for that project"

Shared entities after normalization: `project` appears in all three. Claude proposes:

> **Candidate J1** — "Project create → fetch → edit" (composes R1.1, R2.3, R3.1)
> Evidence: all three subs mention the `project` entity; R1.1 produces a project id, R2.3 fetches by id, R3.1 opens editor for one.

#### 2b. Actor / persona-flow clustering

Extract the subject of `when` (e.g. "User", "Admin", "Worker", "Client"). Group subs that share
the same actor AND describe adjacent steps in a narrative flow (onboarding, checkout, admin task).

**Example.** Four subs in an e-commerce spec, all subject "User":

- R1.1 `when`: "User adds item to cart"
- R1.2 `when`: "User applies a coupon code"
- R2.1 `when`: "User enters shipping address"
- R2.2 `when`: "User submits payment"

Actor cluster: User. Narrative order: add → coupon → ship → pay. Claude proposes:

> **Candidate J2** — "Guest checkout happy path" (composes R1.1, R1.2, R2.1, R2.2)
> Evidence: all four subs share actor "User"; sequence forms the classic checkout funnel (cart → discount → shipping → payment).

#### Signal composition

The two signals are complementary, not alternatives:

- **Entity signal** gives structural grouping (what object the subs manipulate).
- **Actor signal** gives narrative coherence (who drives the flow and in what order).

A strong candidate usually hits both (same entity + same actor). Claude reports which signals
fired for each candidate so the user can judge heuristic quality.

---

### 3. Candidate Presentation Format

Present candidates **evidence-first** so the user can verify the heuristic rather than rubber-stamp:

```
Candidate J1 — "Project create → fetch → edit"
  Composes: R1.1, R2.3, R3.1
  Signals: shared-entity ("project"), narrative (create → fetch → open)
  Evidence:
    R1.1 then: "Returns 201 with project id"  →  R2.3 given: "A project with id=42 exists"
    R2.3 then: "Returns project JSON"         →  R3.1 given: "A project exists on the list page"
  Proposed GWT:
    given: "An authenticated user with no projects"
    when:  "User creates a project, fetches it, and opens the editor"
    then:  "Editor renders with the created project's data loaded"
```

Emit one block per candidate, then route to §4.

---

### 4. AskUserQuestion Interaction Flow

`AskUserQuestion` is limited to **4 options per question**. The flow is one question per
candidate, plus a final top-level question.

#### 4a. Per-candidate question

For each candidate `J<n>`:

```
AskUserQuestion(
  question: "Candidate J1 — Project create → fetch → edit. Decision?",
  options: [
    { label: "Accept",         description: "Use as-is (R1.1, R2.3, R3.1 + proposed GWT)" },
    { label: "Modify",         description: "Keep the composition but edit name / composes / GWT" },
    { label: "Reject",         description: "Drop this candidate — not a real journey" },
    { label: "Propose-custom", description: "Discard this and I'll describe a different journey" }
  ]
)
```

Branches:

- **Accept** → stage the candidate as-is for the batch merge in §5.
- **Reject** → drop; move to next candidate.
- **Modify** → follow-up prompts (free text):
  1. `name` — "New name for this journey (or press enter to keep '<proposed name>'):"
  2. `composes` — "Comma-separated sub ids (current: R1.1, R2.3, R3.1):"
  3. `given`, `when`, `then` — three separate prompts, each defaulting to the proposed value.
- **Propose-custom** → same follow-up prompts but starting from blank:
  1. `name` — "Journey name:"
  2. `composes` — "Comma-separated sub ids (min 2):"
  3. `given`, `when`, `then` — three prompts, no defaults.

Validate collected `composes` locally against `requirements[].sub[].id` before staging — if the
user typed a bogus id, re-prompt. Enforce `composes.length >= 2` before staging.

#### 4b. Top-level question (after all candidates processed)

```
AskUserQuestion(
  question: "All candidates processed. Anything else?",
  options: [
    { label: "Add another",      description: "Propose an additional custom journey" },
    { label: "Proceed to merge", description: "Merge the staged journeys" },
    { label: "Revise",           description: "Re-open a previously answered candidate" },
    { label: "Abort",            description: "Stop L4 without merging" }
  ]
)
```

**Add another** loops back to the custom-journey follow-ups in §4a. **Proceed to merge** advances
to §5. **Revise** re-opens the per-candidate loop starting at the selected candidate.

If zero candidates were produced by the scan → skip §4a entirely and jump to §7 (zero-journey gate).
If candidates were produced but all were Rejected → also jump to §7.

---

### 5. Merge into verification.journeys[]

Merge the staged journey set via `spec merge --stdin --append` so repeated L4 runs accumulate
rather than overwrite.

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --append << 'EOF'
{
  "verification": {
    "journeys": [
      {
        "id": "J1",
        "name": "Project create → fetch → edit",
        "composes": ["R1.1", "R2.3", "R3.1"],
        "given": "An authenticated user with no projects",
        "when":  "User creates a project, fetches it, and opens the editor",
        "then":  "Editor renders with the created project's data loaded"
      },
      {
        "id": "J2",
        "name": "Guest checkout happy path",
        "composes": ["R1.1", "R1.2", "R2.1", "R2.2"],
        "given": "A guest visitor with a product in mind",
        "when":  "User adds to cart, applies coupon, enters shipping, and pays",
        "then":  "Order is created, confirmation page shows discounted total and shipping summary"
      }
    ]
  }
}
EOF
```

Notes:

- `--append` is mandatory here — it concatenates new entries into `verification.journeys[]`.
  Default merge (replace) would wipe prior journeys; `--patch` would require per-id matching.
- Assign sequential `id`s: `J1`, `J2`, ... Check the current spec for the highest existing id
  before picking the next.
- One merge call per L4 run, even with multiple journeys — do not split per-journey.

Run `hoyeon-cli spec guide verification --schema v2` to double-check the expected structure
before the merge heredoc is composed.

---

### 6. Post-Merge Validate (ref-integrity)

After the merge, run validate to catch referential integrity failures. The CLI enforces:

- Every `composes[]` entry must resolve to an existing sub id.
- `composes[].length >= 2` per journey.
- `given`, `when`, `then` non-empty (not `TBD`).

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer verification
```

If validate fails with a dangling-ref or minItems message, the staged composes were wrong
(likely the sub was renamed or miscopied). Recovery: re-run L4 for the offending journey via
`--patch` on that specific journey id, or remove it via `--patch` with an empty overwrite
(document the reason in `known_gaps`).

---

### 7. Zero-Journey Confirmation Gate

If §4 ends with zero staged journeys (either no candidates produced, or all rejected), L4 must
not silently emit an empty `verification`. Require explicit confirmation:

```
AskUserQuestion(
  question: "No verification journeys will be created. Confirm: no cross-sub integration scenarios needed?",
  options: [
    { label: "Yes, no journeys",    description: "Spec is simple enough — sub-reqs alone cover acceptance" },
    { label: "No, let me add one",  description: "Go back and propose a custom journey" },
    { label: "Abort L4",            description: "Stop without finalizing verification" }
  ]
)
```

- **Yes, no journeys** → merge `{"verification": {"journeys": []}}` explicitly so the field exists
  and downstream readers see the intentional empty set.
- **No, let me add one** → loop back to §4a Propose-custom.
- **Abort L4** → exit without merging; user must re-enter L4 later.

Explicit `yes` is the only path to 0 journeys. Silent skips are forbidden (per D4).

---

### 8. Plan Summary

After the L4 gate passes (validate clean), print the final plan summary. In v2 the plan has
**no tasks section** — this is intentional and must be stated explicitly.

```
spec.json ready! .hoyeon/specs/{name}/spec.json   (schema v2)

Goal
────────────────────────────────────────
{context.confirmed_goal}

Non-goals
────────────────────────────────────────
{non_goals or "(none)"}

Key Decisions ({n} total)
────────────────────────────────────────
D1: {decision}
D2: {decision}
...

Requirements ({n} total, {m} sub-requirements)
────────────────────────────────────────
R1: {behavior}
  R1.1: {sub behavior}
  R1.2: {sub behavior}
...

Verification Journeys ({k} total)
────────────────────────────────────────
J1: {name} — composes R1.1, R2.3, R3.1
J2: {name} — composes R1.1, R1.2, R2.1, R2.2
(or "(none — user confirmed no cross-sub integration needed)")

Known Gaps
────────────────────────────────────────
{known_gaps or "(none)"}

Tasks
────────────────────────────────────────
(none — v2 spec does not produce tasks; plan.json generation arrives in the
 2nd PR. Run /execute to continue — it will handle v2 specs once plan.js lands.)

Next step
────────────────────────────────────────
/execute
```

The summary **must**:

- Report requirement count AND total sub-req count.
- Report journey count (including `0` after explicit confirmation).
- State explicitly that no tasks are produced in v2.
- Advise `/execute` as the next step.

### L4 Gate (CLI)

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --schema v2
```

Pass → Plan Summary → user runs `/execute`.
