---
name: dev-scan
description: Collect diverse opinions on technical topics from developer communities. Use for "developer reactions", "community opinions" requests. Aggregates Reddit, HN, Dev.to, Lobsters, etc.
version: 1.2.0
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
| X (Twitter) | Vendored bird-search.mjs (`node`) |
| Hacker News | WebSearch |
| Dev.to | WebSearch |
| Lobsters | WebSearch |

## Execution

### Step 0: Dependency Check

Run in parallel:
```bash
python3 skills/dev-scan/vendor/reddit-search/reddit-search.py --check
node skills/dev-scan/vendor/bird-search/bird-search.mjs --check
```

| Result | Action |
|--------|--------|
| `reddit-search --check` → `available: true` | Reddit source available |
| `reddit-search --check` → `available: false` | Skip Reddit, warn user |
| `bird-search --check` → `authenticated: true` | X/Twitter source available |
| `bird-search --check` → `authenticated: false` | Skip X/Twitter, warn: "브라우저에서 X 로그인 필요" |
| `node` not found or script error | Skip X/Twitter |

Report available sources before proceeding. Minimum 1 source required (WebSearch always available).

### Step 1: Topic Extraction
Extract core topic from user request.

Examples:
- "Developer reactions to React 19" → `React 19`
- "Community opinions on Bun vs Deno" → `Bun vs Deno`

### Step 2: Parallel Search (Single Message, 5 Sources)

**Reddit** (Vendored reddit-search.py — public JSON API):
```bash
python3 skills/dev-scan/vendor/reddit-search/reddit-search.py "{TOPIC}" --count 10 --comments 5 --time month
```
- Searches global Reddit + auto-discovered subreddits.
- Returns threads with score, num_comments, upvote_ratio.
- **Includes top comments** with author and score — use these as primary opinion sources.
- No API key needed. Rate limit ~30 req/min.
- Options: `--time` (hour/day/week/month/year/all), `--subreddits` (comma-separated), `--json`.

**X / Twitter** (Vendored bird-search.mjs):
```bash
node skills/dev-scan/vendor/bird-search/bird-search.mjs "{TOPIC}" --count 20 --json
```
- Read-only search. Returns recent tweets with engagement metrics.
- Cookie-based auth (Safari/Chrome session) — no API key needed.
- `--json` output includes: text, author, permanent_url, likeCount, retweetCount.
- Focus on: developer hot takes, viral threads, debate threads.

**Other Sources** (WebSearch, parallel):
```
WebSearch: "{topic} site:news.ycombinator.com"
WebSearch: "{topic} site:dev.to"
WebSearch: "{topic} site:lobste.rs"
```

**CRITICAL**: Run all 5 searches in **one message** in parallel.

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
| Topic too new | Note insufficient results, suggest related keywords |
