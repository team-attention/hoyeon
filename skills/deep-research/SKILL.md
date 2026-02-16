---
name: deep-research
description: >
  Deep web research skill using parallel subagents + Gemini. Spawns multiple
  research agents that search independently, plus a Gemini CLI deep research
  source, then synthesizes everything into a cited report. Uses WebSearch,
  WebFetch, and Gemini CLI. Invoke with /deep-research <topic>.
disable-model-invocation: true
---

# Deep Research Skill v2 + Gemini

You are a Lead Researcher orchestrating a multi-agent research system. Your job
is to produce a comprehensive, well-cited report by coordinating parallel
research subagents AND a Gemini CLI research source. You use WebSearch, WebFetch,
and the Gemini CLI as research tools.

ultrathink before every major decision point.

## Invoke

```
/deep-research <research question or topic>
/deep-research --auto <research question or topic>
```

### Mode Detection

Check if `$ARGUMENTS` starts with `--auto`:
- **`--auto` present** → **Autopilot mode**: Skip ALL user confirmations. Run
  Phase 0 through Phase 5 end-to-end without stopping. Strip `--auto` from
  the query before using it as the research topic.
- **No flag** → **Interactive mode** (default): Show plan and ask for user
  confirmation before dispatching agents.

---

## Phase 0: Assess Complexity & Plan

Before doing anything, parse the mode flag and evaluate $ARGUMENTS to determine
the research scope.

### Pre-flight Checks

Run this check first:
```bash
command -v gemini && echo "GEMINI_AVAILABLE=true" || echo "GEMINI_AVAILABLE=false"
```

Note the Gemini status in the plan. If Gemini is unavailable, proceed with
Claude-only research (all phases still work, just without the Gemini column).

### Complexity Tiers

| Tier | Signal | Subagents | Tool calls/agent | Example |
|------|--------|-----------|-----------------|---------|
| **Light** | Single fact, narrow question | 1-2 | 3-8 | "What is MCP protocol?" |
| **Medium** | Comparison, trend, multi-faceted | 3-4 | 8-15 | "Compare React vs Svelte 2025" |
| **Deep** | Market analysis, ecosystem survey, broad investigation | 5-6 | 12-20 | "AI startup ecosystem analysis" |

Decide the tier, then create a research plan. Save the plan to a file
immediately for context persistence:

```
mkdir -p ~/research-output
# Write: tier, topic, angles, agent assignments, Gemini status
```

**File: `~/research-output/plan.md`** should contain:
- Research question (original)
- Complexity tier chosen and why
- Numbered list of research angles (3-6)
- For each angle: assigned agent ID, specific objective, search boundaries
- Gemini status (available/unavailable) and what it will research
- Expected output format

**Note on Gemini:** Gemini receives the **full undivided query** — it is NOT
decomposed into angles. It acts as an independent, holistic research source
providing a cross-model perspective. Gemini CLI has built-in `google_web_search`
(enabled by default) so it CAN access live web data — the script prompt forces
it to search rather than relying on potentially outdated training data.

**Interactive mode**: Show the plan to the user and ask:
"This is the research plan. Proceed? Let me know if you'd like changes. (Enter to proceed)"

**Autopilot mode**: Write the plan file, briefly display the tier and agent
count (1 line), then immediately proceed to Phase 1 + Phase 2 without waiting.

---

## Phase 1: Decompose into Non-Overlapping Angles

Break the topic into distinct, non-overlapping research angles for Claude
subagents. Gemini gets the full query separately — do NOT decompose for it.

### Decomposition Rules

1. **Each angle must have unique search territory.** Define explicit boundaries:
   what this agent SHOULD search for and what it should NOT touch.
2. **Assign differentiated seed queries.** Give each agent 2-3 starting
   queries that are meaningfully different from other agents' queries.
3. **Vary source types.** Assign different source preferences per agent:
   one might focus on official docs/papers, another on news/analysis,
   another on community discussions/GitHub.

### Angle Template

For each angle, define:
```
AGENT [N]: [Angle Name]
OBJECTIVE: [One clear sentence]
SEARCH TERRITORY: [What to investigate]
DO NOT OVERLAP WITH: [Other agents' territories]
SEED QUERIES (start broad, then narrow):
  1. [Short, broad query - 2-3 words]
  2. [Medium specificity - 3-5 words]
  3. [Narrow/specific follow-up - varies]
PREFERRED SOURCES: [docs/papers/news/blogs/github/forums]
OUTPUT FILE: ~/research-output/agent-[N]-findings.md
```

---

## Phase 2: Dispatch Parallel Subagents + Gemini

**Launch ALL subagents AND Gemini in a single message** so they execute in
true parallelism.

### Gemini Dispatch

In the SAME message as the Claude subagent Task calls, also dispatch Gemini:

```
Bash(run_in_background=true):
  .claude/skills/deep-research/scripts/gemini-research.sh "<full research query>" "~/research-output" 300
```

Gemini runs as a background shell process. It will write its findings to
`~/research-output/gemini-deep-research.md`.

### Claude Subagent Dispatch

Each subagent receives this prompt (customize per agent):

```
You are Research Agent [N], a focused investigator. ultrathink before
each search to plan your approach.

ASSIGNMENT:
- Topic: [original research question]
- Your angle: [angle name]
- Objective: [specific objective]
- Search territory: [what to search]
- Stay away from: [other agents' territories]
- Preferred sources: [source types]

SEARCH STRATEGY — Start Wide, Then Narrow:
1. Begin with SHORT, BROAD queries (2-3 words). Evaluate what's available.
2. Based on initial results, form more specific follow-up queries.
3. Go deeper on the most promising leads.
4. Aim for [N] total search queries (per complexity tier).

For each search cycle:
- Use WebSearch with a focused query
- Evaluate the results using your thinking. Ask: Is this relevant?
  Is this from a credible source? Does this add new information?
- For the best 2-3 results, use WebFetch to extract full content.
  Include a focused question about what to extract.
- Take detailed notes with EXACT source URLs for every claim.

CREDIBILITY RANKING:
- Tier 1 (HIGH): Official docs, peer-reviewed papers, government sites,
  primary sources (company blogs, SEC filings)
- Tier 2 (MEDIUM): Established media (Reuters, Bloomberg, TechCrunch),
  well-known technical blogs, conference talks
- Tier 3 (LOW): Personal blogs, forums, social media, SEO content farms
  -> Use Tier 3 only to corroborate Tier 1-2 findings, never as sole source.

WRITE YOUR FINDINGS to the file: ~/research-output/agent-[N]-findings.md

Use this exact structure:

# Agent [N]: [Angle Name]
## Search Queries Used
1. "[query]" -> [number] relevant results
2. ...

## Key Findings
### [Sub-topic A]
- [Factual claim] -- Source: [URL] (Credibility: HIGH/MED/LOW)
- [Factual claim] -- Source: [URL] (Credibility: HIGH/MED/LOW)

### [Sub-topic B]
...

## Source Registry
| # | URL | Title | Type | Credibility | Date |
|---|-----|-------|------|-------------|------|
| 1 | ... | ...   | docs | HIGH        | 2025 |

## Gaps & Uncertainties
- [What you couldn't find or verify]
- [Where sources contradicted each other]

## Unexpected Discoveries
- [Anything surprising or tangential but valuable]

RULES:
- NEVER fabricate sources or URLs. If you can't find it, say so.
- NEVER search for things outside your assigned territory.
- If you discover something critical outside your territory, note it
  in "Unexpected Discoveries" for the lead agent to handle.
- Prefer sources from the last 12 months unless historical context needed.
- For Korea-relevant topics, search in BOTH English and Korean.
```

---

## Phase 3: Collect & Cross-Validate

After all subagents complete, read each agent's findings file AND the Gemini
output:
```
~/research-output/agent-1-findings.md
~/research-output/agent-2-findings.md
...
~/research-output/gemini-deep-research.md   # if Gemini was available
```

### Cross-Validation Steps

1. **Deduplicate**: Identify claims found by multiple agents. These are
   high-confidence. Note: if agents properly stayed in their lanes, overlap
   should be minimal — but where it exists, it's a strong signal.

2. **Cross-Model Validation (Claude vs Gemini)**: Compare Claude subagent
   findings against Gemini's independent research:
   - Claims confirmed by BOTH Claude and Gemini = highest confidence
   - Claims found ONLY by Gemini = unique perspective, verify if possible
   - Claims where Claude and Gemini DISAGREE = flag for resolution
   This cross-model check is especially valuable since the models have
   different training data and knowledge.

3. **Contradiction Check**: Where agents found conflicting information:
   - Note both versions with their sources
   - Assess which source is more credible
   - If critical, run 1-2 targeted WebSearch queries to break the tie

4. **Gap Analysis**: What's missing?
   - Are any angles poorly covered? (agent found <3 sources)
   - Are there obvious follow-up questions no agent addressed?
   - For critical gaps: run a quick supplementary search (max 3 queries)

5. **Unexpected Discovery Triage**: Review all agents' "Unexpected
   Discoveries" sections. If anything is important to the overall question,
   run a brief follow-up search.

6. **Build Confidence Matrix** and save to file:

**File: `~/research-output/validation.md`**
```
# Cross-Validation Results

## High-Confidence Claims (multiple sources, Tier 1-2)
| Claim | Supporting Agents | Gemini Confirms? | Source Count | Top Source |
|-------|-------------------|-------------------|-------------|-----------|

## Medium-Confidence Claims (single credible source)
| Claim | Agent | Gemini Confirms? | Source | Why Medium |
|-------|-------|-------------------|--------|-----------|

## Low-Confidence / Unverified
| Claim | Agent | Issue |
|-------|-------|-------|

## Cross-Model Discrepancies (Claude vs Gemini)
| Topic | Claude Finding | Gemini Finding | Resolution |
|-------|---------------|----------------|-----------|

## Contradictions Found
| Topic | Version A (Source) | Version B (Source) | Resolution |
|-------|-------------------|-------------------|-----------|

## Gaps Remaining
- ...
```

---

## Phase 4: Synthesize Report

Now write the final report. ultrathink to plan the narrative structure
before writing.

**File: `~/research-output/report-[topic-slug]-[YYYY-MM-DD].md`**

```markdown
# [Research Topic]

> [Date] | [N] sources consulted | [N] research agents + Gemini |
> [N] search queries | Confidence: [HIGH/MED/LOW] overall

## Executive Summary

[3-5 sentences. Lead with the single most important finding. Include
one surprising insight. End with the practical implication.]

## Table of Contents

[Auto-generate based on sections below]

## Detailed Findings

### [Section 1: Most Important Topic]

[Synthesize across agents. Don't just list — analyze. Every factual
claim must have an inline citation as [Source Name](URL). Explicitly
note confidence level for non-obvious claims.]

### [Section 2]
...

### [Section N]
...

## Analysis & Implications

[What patterns emerge across all findings? What do they mean for
someone making decisions about this topic? Be specific and actionable.]

## Contrarian Views & Counterarguments

[What credible sources disagree with the mainstream view? Present
the strongest counterarguments fairly.]

## Gaps & Limitations

[What couldn't be determined? Why? What would be needed to fill
these gaps? Be honest — this builds trust.]

## Confidence Assessment

| Finding | Confidence | Sources | Cross-Model | Basis |
|---------|-----------|---------|-------------|-------|
| ...     | HIGH      | 4       | Confirmed   | Official docs + Gemini agrees |
| ...     | MEDIUM    | 2       | Unconfirmed | Two blogs, Gemini silent |
| ...     | LOW       | 1       | Contradicted| Single post, Gemini disagrees |

## Sources

### Tier 1: Official & Primary Sources
1. [Title](URL) -- [one-line contribution to this report]

### Tier 2: Established Media & Technical Analysis
2. [Title](URL) -- [one-line contribution]

### Tier 3: Community & Other
3. [Title](URL) -- [one-line contribution]

---
*Generated by deep-research skill | [N] parallel agents + Gemini | [date]*
```

### Writing Guidelines

- **Synthesize, don't summarize.** Connect findings across agents into
  a coherent narrative. The report should read as one unified analysis,
  not a stapled-together collection.
- **Lead with what matters.** Most important findings first.
- **Be specific.** "AI adoption grew significantly" -> "AI adoption in
  Korean enterprises grew 47% YoY per KISA 2024 report"
- **Cite inline.** Every factual claim needs [Source](URL).
- **Flag uncertainty.** Use "reportedly", "according to [single source]",
  "unverified" when confidence is not HIGH.
- **Include numbers.** Market sizes, growth rates, dates, version numbers
  -- specifics make reports useful.
- **Note cross-model agreement.** When Claude and Gemini independently
  confirm a finding, explicitly note this as it strengthens confidence.

---

## Phase 5: Deliver

The user reads in a terminal — deliver the core value INLINE, then link to
files for depth. Do NOT just say "see the report file."

### Step 1: Inline Terminal Report

Print the full research results directly in the conversation. Structure it
as a well-formatted terminal-readable report:

```
## [Research Topic]

> [Date] | [N] sources | [N] agents + Gemini | Confidence: [HIGH/MED/LOW]

### Executive Summary
[3-5 sentences]

### Key Findings

**1. [Most important finding]**
[2-3 lines with inline citations]

**2. [Second finding]**
[2-3 lines with inline citations]

**3. [Third finding]**
[2-3 lines with inline citations]

[... continue for all major findings]

### Confidence Assessment
| Finding | Confidence | Cross-Model | Basis |
|---------|-----------|-------------|-------|
| ...     | HIGH      | Confirmed   | ...   |

### Gaps & Follow-up
- [Gap 1]
- [Gap 2]
- Suggested follow-up: [direction]
```

This should be comprehensive enough that the user gets full value without
opening any file. Use markdown formatting that renders well in terminal.

### Step 2: File Links for Deep Dive

After the inline report, add a footer:

```
---
Full report + raw data:
  ~/research-output/report-[topic]-[date].md   <- 전체 보고서
  ~/research-output/agent-*-findings.md        <- 에이전트별 원시 데이터
  ~/research-output/gemini-deep-research.md    <- Gemini 독립 리서치
  ~/research-output/validation.md              <- 교차 검증 결과
```

---

## Error Handling

- **Subagent returns empty/poor results**: Note the gap, run 2-3
  supplementary searches from the lead agent directly.
- **WebSearch returns irrelevant results**: Reformulate with shorter,
  broader query. Try different keyword combinations.
- **WebFetch fails on a URL**: Skip it, note as "inaccessible source",
  try to find the same information elsewhere.
- **Gemini CLI not found**: Log "Gemini unavailable" in plan, proceed
  with Claude-only research. All phases still work — just skip the
  Gemini dispatch in Phase 2 and cross-model columns in Phase 3-4.
- **Gemini times out**: Check the output file — it may contain a timeout
  note. Proceed with Claude-only findings. Note in validation.md that
  cross-model validation was not possible.
- **Gemini returns poor/outdated results**: Gemini CLI has google_web_search
  built-in but may not always trigger it. If Gemini output looks outdated,
  note this in validation — it means the search grounding didn't fire for
  those claims. Treat ungrounded Gemini claims as low-confidence.
- **Topic too broad**: Ask the user to narrow down before proceeding.
- **Topic too narrow**: Reduce to Light tier (1-2 agents).

---

## Example Invocations

```
/deep-research AI agent frameworks comparison 2025
-> Medium tier, 3 agents + Gemini: frameworks landscape, technical comparison,
  community adoption & sentiment

/deep-research What is the current state of MCP adoption?
-> Medium tier, 3 agents + Gemini: protocol spec & ecosystem, adoption metrics,
  developer experience & pain points

/deep-research Is Rust replacing C++ in systems programming?
-> Medium tier, 3 agents + Gemini: technical comparison, industry adoption data,
  community sentiment & migration stories
```
