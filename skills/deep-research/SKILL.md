---
name: deep-research
description: >
  Deep web research skill using parallel subagents + chromux browser-explorer + Gemini. Spawns
  multiple WebSearch research agents AND browser-explorer agents (via chromux for JS-heavy/dynamic
  sites), plus a Gemini CLI deep research source, then synthesizes everything into a cited report.
  Uses WebSearch, WebFetch, chromux browser-explorer, and Gemini CLI. Invoke with /deep-research
  <topic>.
disable-model-invocation: true
---

# Deep Research Skill v3 + Gemini + Browser-Explorer

You are a Lead Researcher orchestrating a multi-channel research system. Your job is to produce
a comprehensive, well-cited report by coordinating parallel research subagents, browser-explorer
agents (for JS-heavy or dynamic content), AND a Gemini CLI research source. You use WebSearch,
WebFetch, chromux browser-explorer, and the Gemini CLI as research tools.

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

## Phase 0: Setup & Assess Complexity

Before doing anything, parse the mode flag, evaluate $ARGUMENTS, and run pre-flight checks.

### Pre-flight Checks

Run all checks in a **single Bash call**:

```bash
# Session dir init
SESSION_ID="[CLAUDE_SESSION_ID from UserPromptSubmit hook]"
RESEARCH_DIR="$HOME/.hoyeon/$SESSION_ID/research"
mkdir -p "$RESEARCH_DIR"
echo "RESEARCH_DIR=$RESEARCH_DIR"

# Gemini check
command -v gemini && echo "GEMINI_AVAILABLE=true" || echo "GEMINI_AVAILABLE=false"

# Chromux check — resolve path literally, remember the output
CX=$(command -v chromux 2>/dev/null || echo "") && [ -n "$CX" ] && echo "CHROMUX=$CX" || (npx @team-attention/chromux help >/dev/null 2>&1 && echo "CHROMUX=npx @team-attention/chromux" || echo "CHROMUX=MISSING")
```

**Remember `RESEARCH_DIR`, `GEMINI_AVAILABLE`, and `CHROMUX` literally.** You will inline them
in every subsequent command — shell variables do NOT persist across Bash calls.

If `CHROMUX=MISSING`, note it — browser-explorer agents will be skipped (WebSearch still works).

If `CHROMUX` is available, launch Chrome in headless mode:
```bash
/path/to/chromux launch default --headless 2>/dev/null || true
```

### Complexity Tiers

| Tier | Signal | WebSearch agents | Browser agents | Tool calls/agent | Example |
|------|--------|-----------------|----------------|-----------------|---------|
| **Light** | Single fact, narrow question | 1-2 | 0-1 | 3-8 | "What is MCP protocol?" |
| **Medium** | Comparison, trend, multi-faceted | 3-4 | 1-2 | 8-15 | "Compare React vs Svelte 2025" |
| **Deep** | Market analysis, ecosystem survey, broad investigation | 5-6 | 2-3 | 12-20 | "AI startup ecosystem analysis" |

Decide the tier, then create a research plan. Save the plan immediately for context persistence:

```bash
cat > "$RESEARCH_DIR/plan.md" << 'PLAN_EOF'
# Research Plan

## Research Question
[original query]

## Complexity Tier
[tier] — [reason]

## Research Angles
[numbered list: 3-6 angles]

## Agent Assignments
[for each angle: agent type (WebSearch or Browser), objective, seed queries or target URLs]

## Gemini Status
[available/unavailable] — will research: [full query]

## Browser Agent Targets
[URLs/sites identified as needing browser-based extraction, with rationale]

## Expected Output Format
[report structure]
PLAN_EOF
echo "Plan saved to $RESEARCH_DIR/plan.md"
```

**Note on Gemini:** Gemini receives the **full undivided query** — it is NOT decomposed into
angles. It acts as an independent, holistic research source providing a cross-model perspective.
Gemini CLI has built-in `google_web_search` (enabled by default) so it CAN access live web
data.

**Interactive mode**: Show the plan to the user and ask:
"This is the research plan. Proceed? Let me know if you'd like changes. (Enter to proceed)"

**Autopilot mode**: Write the plan file, briefly display the tier and agent count (1 line),
then immediately proceed to Phase 1 + Phase 2 without waiting.

---

## Phase 1: Decompose into Research Channels

Break the topic into distinct, non-overlapping research angles. Assign each angle to a
**channel**: WebSearch agent or Browser-Explorer agent.

### When to Use Browser vs WebSearch

| Use WebSearch | Use Browser-Explorer |
|--------------|---------------------|
| General queries, news, documentation | Sites known to need JS rendering |
| Broad coverage, multiple sources | Sites with dynamic content loading |
| Fast parallel search | Community forums (Reddit threads, GitHub discussions) |
| Well-structured static sites | Sites with lazy-loading or pagination |
| Public APIs, static HTML | Extracting structured data from specific pages |
| | Content that WebFetch can't access (JS-rendered text) |

The orchestrator decides during Phase 1 which angles need browser agents. Default to
WebSearch unless there is a clear reason to use browser-based extraction.

### Decomposition Rules

1. **Each angle must have unique search territory.** Define explicit boundaries.
2. **Assign differentiated seed queries.** Give each WebSearch agent 2-3 starting queries.
3. **Vary source types.** One agent might focus on official docs/papers, another on news,
   another on community discussions.
4. **For browser angles:** Identify the specific URLs or sites to visit, and what data to
   extract from them.

### Angle Template (WebSearch)

```
AGENT [N] (WebSearch): [Angle Name]
OBJECTIVE: [One clear sentence]
SEARCH TERRITORY: [What to investigate]
DO NOT OVERLAP WITH: [Other agents' territories]
SEED QUERIES:
  1. [Short, broad query - 2-3 words]
  2. [Medium specificity - 3-5 words]
  3. [Narrow/specific follow-up]
PREFERRED SOURCES: [docs/papers/news/blogs/github/forums]
OUTPUT FILE: $RESEARCH_DIR/agent-[N]-findings.md
```

### Angle Template (Browser-Explorer)

```
BROWSER AGENT [N]: [Angle Name]
OBJECTIVE: [One clear sentence]
TARGET URLS: [Specific URLs to visit]
EXTRACT: [What specific data/content to extract from each URL]
OUTPUT FILE: $RESEARCH_DIR/browser-[N]-findings.md
RATIONALE: [Why browser is needed — e.g., "Reddit uses infinite scroll / JS-rendered comments"]
```

---

## Phase 2: Dispatch ALL Channels in Parallel

**Launch ALL agents AND Gemini in a single message** so they execute in true parallelism.
Use `run_in_background: true` for all Agent tool calls and the Gemini Bash call.

### Channel 1: Gemini Dispatch

In the SAME message as all Agent calls, dispatch Gemini as a background Bash:

```
Bash(run_in_background=true):
  /absolute/path/to/script/gemini-research.sh "<full research query>" "$HOME/.hoyeon/SESSION_ID/research" 300
```

Note: Inline `SESSION_ID` and the script path literally. The script path is:
`.claude/skills/deep-research/scripts/gemini-research.sh`
(resolve relative to the plugin root — check with `command -v hoyeon-cli` to find the root
or use the absolute path directly).

Gemini will write findings to `$RESEARCH_DIR/gemini-deep-research.md`.

### Channel 2: WebSearch Agent Dispatch

Each WebSearch subagent receives this prompt (customize per agent):

```
You are Research Agent [N], a focused investigator. ultrathink before each search.

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
- Evaluate the results. Ask: Is this relevant? Is this from a credible source?
  Does this add new information?
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

WRITE YOUR FINDINGS to the file: [RESEARCH_DIR]/agent-[N]-findings.md

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

### Channel 3: Browser-Explorer Agent Dispatch

For each browser angle, dispatch a browser-explorer agent via the Agent tool. Each browser
agent gets its **own chromux session ID** (e.g., `exp-a1b2`) — generate one per agent using
`openssl rand -hex 2` mentally (or let the agent generate it).

**Browser agent prompt template:**

```
You are a Browser Research Agent. Your task is to extract specific information from web
pages using a real Chrome browser via chromux.

## Chromux Setup

Resolve chromux: The chromux path is [INLINE LITERAL CHROMUX PATH — e.g., /usr/local/bin/chromux].
Chrome is already running in headless mode.

Generate your session ID:
```bash
openssl rand -hex 2
```
Remember the output literally (e.g., ab12 → your session ID is exp-ab12). Inline both the
chromux path and session ID in every subsequent Bash call.

## Research Objective

Topic: [original research question]
Your angle: [angle name]
Objective: [one clear sentence — what information to find]

## Target URLs

Visit these URLs in order:
1. [URL 1] — Extract: [specific data points, e.g., "top comments discussing X", "version numbers", "benchmark table"]
2. [URL 2] — Extract: [specific data points]
[additional URLs if needed]

## Extraction Instructions

For each URL:
1. Open the URL: `/path/to/chromux open exp-XXXX <url>`
2. Wait for dynamic content: `/path/to/chromux wait exp-XXXX 2000`
3. Snapshot to see page structure: `/path/to/chromux snapshot exp-XXXX`
4. Navigate to relevant sections (scroll, click "Load more" buttons if needed)
5. Re-snapshot after each interaction to get fresh @ref numbers
6. Extract the content specified above
7. If the page has pagination or "load more", click through up to 3 pages

## Core Rules
- Always snapshot before any interaction
- Inline the chromux path and session ID literally in EVERY Bash call (no shell variables)
- Re-snapshot after EVERY click or scroll — @ref numbers go stale
- Use @ref numbers from snapshot output for click/fill, NOT CSS selectors
- Close your session when done: `/path/to/chromux close exp-XXXX`

## Output

Write your findings to: [RESEARCH_DIR]/browser-[N]-findings.md

Structure:

# Browser Agent [N]: [Angle Name]
## URLs Visited
- [URL] — [status: success/failed/redirected]

## Extracted Content
### [URL 1 or topic section]
[Extracted data with exact quotes where useful]

## Source Registry
| URL | Title | Content Type | Date |
|-----|-------|--------------|------|

## Gaps & Issues
- [Pages that failed to load or had no relevant content]
- [Dynamic content that couldn't be extracted]
```

**Agent tool call:**
```
Agent(
  subagent_type: "hoyeon:browser-explorer",
  mode: "dontAsk",
  prompt: "[browser agent prompt as above, fully customized]"
)
```

For simple single-page extraction, a helper script is also available at
`.claude/skills/deep-research/scripts/browser-extract.sh` — reference it if needed for
basic URL content dumps. For multi-page browsing or dynamic interactions, always use the
browser-explorer agent directly.

---

## Phase 3: Collect & Cross-Validate

After all agents complete, read each findings file from RESEARCH_DIR:
```
$RESEARCH_DIR/agent-1-findings.md
$RESEARCH_DIR/agent-2-findings.md
...
$RESEARCH_DIR/browser-1-findings.md
$RESEARCH_DIR/browser-2-findings.md
...
$RESEARCH_DIR/gemini-deep-research.md   # if Gemini was available
```

### Cross-Validation Steps

1. **Deduplicate**: Identify claims found by multiple agents/sources. These are
   high-confidence. Note: if agents properly stayed in their lanes, overlap should
   be minimal — but where it exists, it's a strong signal.

2. **Cross-Channel Validation**: Compare WebSearch, Browser, and Gemini findings:
   - Claims confirmed by WebSearch AND Browser agents = very high confidence (both
     channels independently found the same thing)
   - Claims found ONLY by browser agents = unique deep extraction, note extraction context
   - Claims confirmed by BOTH Claude agents and Gemini = highest confidence (cross-model)
   - Claims where Claude and Gemini DISAGREE = flag for resolution

3. **Contradiction Check**: Where agents found conflicting information:
   - Note both versions with their sources
   - Assess which source is more credible
   - If critical, run 1-2 targeted WebSearch queries to break the tie

4. **Gap Analysis**: What's missing?
   - Are any angles poorly covered? (agent found <3 sources)
   - Are there obvious follow-up questions no agent addressed?
   - For critical gaps: run a quick supplementary search (max 3 queries)

5. **Unexpected Discovery Triage**: Review all agents' "Unexpected Discoveries" sections.
   If anything is important to the overall question, run a brief follow-up search.

6. **Build Confidence Matrix** and save:

**File: `$RESEARCH_DIR/validation.md`**
```
# Cross-Validation Results

## High-Confidence Claims (multiple sources, Tier 1-2)
| Claim | Supporting Agents | Gemini Confirms? | Browser Confirms? | Source Count | Top Source |
|-------|-------------------|-----------------|-------------------|-------------|-----------|

## Medium-Confidence Claims (single credible source)
| Claim | Agent | Gemini Confirms? | Source | Why Medium |
|-------|-------|-----------------|--------|-----------|

## Low-Confidence / Unverified
| Claim | Agent | Issue |
|-------|-------|-------|

## Cross-Model Discrepancies (Claude vs Gemini)
| Topic | Claude Finding | Gemini Finding | Resolution |
|-------|---------------|----------------|-----------|

## Cross-Channel Discrepancies (WebSearch vs Browser)
| Topic | WebSearch Finding | Browser Finding | Resolution |
|-------|------------------|----------------|-----------|

## Contradictions Found
| Topic | Version A (Source) | Version B (Source) | Resolution |
|-------|-------------------|-------------------|-----------|

## Gaps Remaining
- ...
```

---

## Phase 4: Synthesize Report

Now write the final report. ultrathink to plan the narrative structure before writing.

**File: `$RESEARCH_DIR/report-[topic-slug]-[YYYY-MM-DD].md`**

```markdown
# [Research Topic]

> [Date] | [N] sources consulted | [N] WebSearch agents + [N] Browser agents + Gemini |
> [N] search queries | Confidence: [HIGH/MED/LOW] overall

## Executive Summary

[3-5 sentences. Lead with the single most important finding. Include
one surprising insight. End with the practical implication.]

## Table of Contents

[Auto-generate based on sections below]

## Detailed Findings

### [Section 1: Most Important Topic]

[Synthesize across all channels. Don't just list — analyze. Every factual
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

| Finding | Confidence | Sources | Cross-Model | Cross-Channel | Basis |
|---------|-----------|---------|-------------|---------------|-------|
| ...     | HIGH      | 4       | Confirmed   | Confirmed     | Official docs + Gemini + Browser |
| ...     | MEDIUM    | 2       | Unconfirmed | N/A           | Two blogs, Gemini silent |
| ...     | LOW       | 1       | Contradicted| N/A           | Single post, Gemini disagrees |

## Sources

### Tier 1: Official & Primary Sources
1. [Title](URL) -- [one-line contribution to this report]

### Tier 2: Established Media & Technical Analysis
2. [Title](URL) -- [one-line contribution]

### Tier 3: Community & Other
3. [Title](URL) -- [one-line contribution]

---
*Generated by deep-research skill | [N] WebSearch agents + [N] Browser agents + Gemini | [date]*
```

### Writing Guidelines

- **Synthesize, don't summarize.** Connect findings across all channels into a coherent
  narrative. The report should read as one unified analysis.
- **Lead with what matters.** Most important findings first.
- **Be specific.** "AI adoption grew significantly" -> "AI adoption in Korean enterprises
  grew 47% YoY per KISA 2024 report"
- **Cite inline.** Every factual claim needs [Source](URL).
- **Flag uncertainty.** Use "reportedly", "according to [single source]", "unverified"
  when confidence is not HIGH.
- **Include numbers.** Market sizes, growth rates, dates, version numbers — specifics make
  reports useful.
- **Note cross-channel agreement.** When WebSearch and browser agents independently confirm
  a finding, note this. When Claude and Gemini independently confirm, note that too — it
  strengthens confidence.

---

## Phase 5: Deliver

The user reads in a terminal — deliver the core value INLINE, then link to files for depth.
Do NOT just say "see the report file."

### Step 1: Inline Terminal Report

Print the full research results directly in the conversation:

```
## [Research Topic]

> [Date] | [N] sources | [N] WebSearch agents + [N] Browser agents + Gemini |
> Confidence: [HIGH/MED/LOW]

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
| Finding | Confidence | Cross-Model | Cross-Channel | Basis |
|---------|-----------|-------------|---------------|-------|
| ...     | HIGH      | Confirmed   | Confirmed     | ...   |

### Gaps & Follow-up
- [Gap 1]
- [Gap 2]
- Suggested follow-up: [direction]
```

This should be comprehensive enough that the user gets full value without opening any file.

### Step 2: File Links for Deep Dive

After the inline report, add a footer:

```
---
Full report + raw data:
  $RESEARCH_DIR/report-[topic]-[date].md      <- Full report
  $RESEARCH_DIR/agent-*-findings.md           <- WebSearch agent raw data
  $RESEARCH_DIR/browser-*-findings.md         <- Browser-extracted raw data
  $RESEARCH_DIR/gemini-deep-research.md       <- Gemini independent research
  $RESEARCH_DIR/validation.md                 <- Cross-validation results
```

---

## Error Handling

- **Subagent returns empty/poor results**: Note the gap, run 2-3 supplementary searches
  from the lead agent directly.
- **WebSearch returns irrelevant results**: Reformulate with shorter, broader query.
  Try different keyword combinations.
- **WebFetch fails on a URL**: Skip it, note as "inaccessible source", try to find the
  same information elsewhere.
- **chromux MISSING**: Skip all browser-explorer agents. WebSearch and Gemini channels
  still work. Note in plan.md that browser-based extraction was unavailable.
- **Browser agent fails to load a page**: Note as "inaccessible via browser", check if
  WebFetch can retrieve a cached/static version instead.
- **Browser agent hits CAPTCHA**: Stop extraction for that site, note in findings, use
  WebSearch for that angle instead.
- **Gemini CLI not found**: Log "Gemini unavailable" in plan, proceed with Claude-only
  research (WebSearch + Browser channels). All phases still work.
- **Gemini times out**: Check the output file — it may contain a timeout note. Proceed
  with Claude-only findings. Note in validation.md that cross-model validation was not
  possible.
- **Gemini returns poor/outdated results**: Gemini CLI has google_web_search built-in but
  may not always trigger it. If Gemini output looks outdated, note this in validation — it
  means the search grounding didn't fire. Treat ungrounded Gemini claims as low-confidence.
- **Topic too broad**: Ask the user to narrow down before proceeding.
- **Topic too narrow**: Reduce to Light tier (1-2 agents, no browser agents).

---

## Example Invocations

```
/deep-research AI agent frameworks comparison 2025
-> Medium tier, 3 WebSearch agents + 1 Browser agent + Gemini:
   WebSearch: frameworks landscape, technical comparison, community adoption
   Browser: GitHub discussions/issues on major frameworks (dynamic content)

/deep-research What is the current state of MCP adoption?
-> Medium tier, 3 WebSearch agents + 1 Browser agent + Gemini:
   WebSearch: protocol spec & ecosystem, adoption metrics, developer tooling
   Browser: Reddit /r/LocalLLaMA threads on MCP (JS-rendered comments)

/deep-research Is Rust replacing C++ in systems programming?
-> Medium tier, 3 WebSearch agents + 1 Browser agent + Gemini:
   WebSearch: technical comparison, industry adoption data, official statements
   Browser: HN/Reddit discussions on Rust adoption (community sentiment threads)
```
