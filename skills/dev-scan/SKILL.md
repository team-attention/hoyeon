---
name: dev-scan
description: Collect diverse opinions on technical topics from developer communities. Use for "developer reactions", "community opinions" requests. Aggregates Reddit, HN, Dev.to, Lobsters, etc.
version: 1.4.0
---

# Dev Opinions Scan

Collect and synthesize diverse opinions on specific topics from multiple developer communities.

## Purpose

Quickly understand **diverse perspectives** on technical topics:
- Distribution of pros/cons
- Practitioner experiences
- Hidden concerns or advantages
- Unique or notable perspectives

## Data Sources

| Platform | Method |
|----------|--------|
| Reddit | Vendored reddit-search.py (`python3`) — public JSON API, no key needed |
| X (Twitter) | Vendored bird-search.mjs (`node`) — cookie auth |
| Hacker News | Vendored hn-search.py (`python3`) — Algolia API, no key needed |
| Dev.to | Vendored ddgs-search.sh (`uvx ddgs`) — DuckDuckGo site: search |
| Lobsters | Vendored ddgs-search.sh (`uvx ddgs`) — DuckDuckGo site: search |

## Execution

### Step 0: Dependency Check

Run in parallel:
```bash
python3 skills/dev-scan/vendor/reddit-search/reddit-search.py --check
node skills/dev-scan/vendor/bird-search/bird-search.mjs --check
python3 skills/dev-scan/vendor/hn-search/hn-search.py --check
skills/dev-scan/vendor/ddgs-search/ddgs-search.sh --check
```

| Result | Action |
|--------|--------|
| `reddit-search --check` → `available: true` | Reddit source available |
| `reddit-search --check` → `available: false` | Skip Reddit, warn user |
| `bird-search --check` → `authenticated: true` | X/Twitter source available |
| `bird-search --check` → `authenticated: false` | Skip X/Twitter, warn: "브라우저에서 X 로그인 필요" |
| `node` not found or script error | Skip X/Twitter |
| `hn-search --check` → `available: true` | Hacker News source available |
| `hn-search --check` → `available: false` | Fall back to WebSearch for HN |
| `ddgs-search --check` → `available: true` | Dev.to/Lobsters source available |
| `ddgs-search --check` → `available: false` | Fall back to WebSearch for Dev.to/Lobsters |

Report available sources before proceeding. Minimum 1 source required.

### Step 1: Query Planning

> **Note**: Step 0 (dependency check) and Step 1 (query planning) are independent — run Step 0 bash commands and perform Step 1 reasoning in the same message to save a round-trip.

#### 1-1. Parse Request

Extract structured components from user request:

- **topic**: Main subject
- **entities**: Key product/technology names
- **type**: `comparison` | `opinion` | `technology` | `event`

Examples:
- "Developer reactions to React 19" → topic: `React 19`, entities: [`React 19`], type: `opinion`
- "Community opinions on Bun vs Deno" → topic: `Bun vs Deno`, entities: [`Bun`, `Deno`], type: `comparison`
- "What happened with Redis license" → topic: `Redis license`, entities: [`Redis`], type: `event`

#### 1-2. Source-Specific Query Optimization

Each platform's search engine works differently. Generate one optimized query per source.

| Source | Variable | Strategy |
|--------|----------|----------|
| Reddit | `Q_REDDIT` | Natural phrasing. Keep "vs" for comparisons — Reddit titles use it. Script handles broadening internally. |
| X/Twitter | `Q_TWITTER` | Short (≤5 words). Drop filler words (vs, about, of). Key terms only. |
| HN | `Q_HN` | Specific technical terms. Drop "vs" — Algolia full-text matches better without. |
| Dev.to | `Q_DEVTO` | Add context word (`comparison`/`review`/`guide`) for better DuckDuckGo recall. |
| Lobsters | `Q_LOBSTERS` | Simple technical terms. Small community — keep query broad for recall. |

**Query type rules:**

| Type | Reddit | X/Twitter | HN | Dev.to (DuckDuckGo) | Lobsters (DuckDuckGo) |
|------|--------|-----------|-----|------|------|
| Comparison ("A vs B") | Keep "A vs B" | "A B" | "A B" | "A vs B comparison" | "A B" |
| Opinion ("reactions to X") | "X" | "X" | "X" | "X review" | "X" |
| Technology ("X feature") | "X feature" | "X feature" | "X feature" | "X feature guide" | "X feature" |
| Event ("X release") | "X release" | "X" | "X" | "X announcement" | "X" |

**Example**: user asks "claude code vs codex"

| Variable | Optimized Query |
|----------|----------------|
| `Q_REDDIT` | `claude code vs codex` |
| `Q_TWITTER` | `claude code codex` |
| `Q_HN` | `claude code codex` |
| `Q_DEVTO` | `claude code vs codex comparison` |
| `Q_LOBSTERS` | `claude code codex` |

### Step 2: Parallel Search (Single Message, 5 Sources)

**Reddit** (Vendored reddit-search.py — public JSON API):
```bash
python3 skills/dev-scan/vendor/reddit-search/reddit-search.py "{Q_REDDIT}" --count 10 --comments 5 --time month
```
- Searches global Reddit + auto-discovered subreddits.
- Returns threads with score, num_comments, upvote_ratio.
- **Includes top comments** with author and score — use these as primary opinion sources.
- No API key needed. Rate limit ~30 req/min.
- Options: `--time` (hour/day/week/month/year/all), `--subreddits` (comma-separated), `--json`.

**X / Twitter** (Vendored bird-search.mjs):
```bash
node skills/dev-scan/vendor/bird-search/bird-search.mjs "{Q_TWITTER}" --count 20 --json
```
- Read-only search. Returns recent tweets with engagement metrics.
- Cookie-based auth (Safari/Chrome session) — no API key needed.
- `--json` output includes: text, author, permanent_url, likeCount, retweetCount.
- Focus on: developer hot takes, viral threads, debate threads.

**Hacker News** (Vendored hn-search.py — Algolia API):
```bash
python3 skills/dev-scan/vendor/hn-search/hn-search.py "{Q_HN}" --count 10 --comments 5 --time month
```
- Searches HN stories via Algolia (fast, structured, free).
- Returns stories with points, num_comments, and **top comments with full text**.
- No API key needed. Options: `--time` (day/week/month/year/all), `--json`.

**Dev.to / Lobsters** (ddgs-search):
```bash
skills/dev-scan/vendor/ddgs-search/ddgs-search.sh "{Q_DEVTO}" --site dev.to --time m --count 10
skills/dev-scan/vendor/ddgs-search/ddgs-search.sh "{Q_LOBSTERS}" --site lobste.rs --time m --count 10
```
- If ddgs-search unavailable, fall back to WebSearch:
  `WebSearch: "{Q_DEVTO} site:dev.to"` etc.

**CRITICAL**: Run all **available** searches in **one message** in parallel.

### Step 3: Synthesize & Present

#### 3-1. Opinion Classification

Classify collected opinions by:
- **Pro/Positive**: Supporting opinions
- **Con/Negative**: Concerns, criticism, alternatives
- **Neutral/Conditional**: "Only if...", "When used with..."
- **Experience-based**: Based on actual production use

#### 3-2. Derive Consensus

Identify opinions **repeatedly appearing** across communities:
- Same point mentioned in 2+ sources = consensus
- Especially high reliability if mentioned in both Reddit and HN
- Prioritize opinions with specific numbers or examples
- **Target at least 5 consensus items**

#### 3-3. Identify Controversies

Find points where **opinions diverge**:
- Opposing opinions on same topic
- Threads with active debates
- Topics with many "depends on...", "but actually..." responses
- **Target at least 3 controversy points**

#### 3-4. Select Notable Perspectives

Find unique or deep insights:
- Logically sound opinions that differ from majority
- Opinions from senior developers or domain experts
- Insights from large-scale project experience
- Edge cases or long-term perspectives others might miss
- **Target at least 3 notable perspectives**

## Output Format

**Core Principle**: All opinions must have inline source. No opinions without sources.

```markdown
## Key Insights

### Consensus

1. **[Opinion Title]**
   - [Detailed description]
   - Sources: [Reddit](url), [HN](url)

2. **[Opinion Title]**
   - [Details]
   - Source: [Dev.to](url)

(at least 5)

---

### Controversy

1. **[Controversy Topic]**
   - Pro: "[Quote]" - [Source](url)
   - Con: "[Quote]" - [Source](url)
   - Context: [Why opinions diverge]

(at least 3)

---

### Notable Perspective

1. **[Insight Title]**
   > "[Original quote or key sentence]"
   - [Why this is notable]
   - Source: [Platform](url)

(at least 3)
```

### Source Citation Rules

- **Inline links required**: End every opinion with `Source: [Platform](url)`
- **Multiple sources**: `Sources: [Reddit](url), [HN](url)`
- **Direct quotes**: Use `"..."` format when possible
- **URL accuracy**: Only include verified accessible links

## Error Handling

| Situation | Response |
|------|------|
| No search results | Skip that platform, focus on others |
| reddit-search failure / rate limit | Skip Reddit, proceed with other sources |
| bird-search auth failure | Skip X/Twitter (user needs active browser session) |
| bird-search script error | Skip X/Twitter, proceed with other sources |
| hn-search failure | Skip HN, proceed with other sources |
| ddgs-search failure | Fall back to WebSearch with `site:` filter |
| Topic too new | Note insufficient results, suggest related keywords |
