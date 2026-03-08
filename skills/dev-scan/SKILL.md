---
name: dev-scan
description: Collect diverse opinions on technical topics from developer communities. Use for "developer reactions", "community opinions" requests. Aggregates Reddit, HN, Dev.to, Lobsters, ProductHunt, etc.
version: 2.0.0
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
| X (Twitter) | Vendored x-search.mjs (`chromux`) — real Chrome with existing login, no API keys |
| Hacker News | Vendored hn-search.py (`python3`) — Algolia API, no key needed |
| Dev.to | Vendored web-search.mjs (`chromux`) — Google search + content enrichment via real Chrome |
| Lobsters | Vendored web-search.mjs (`chromux`) — Google search + content enrichment via real Chrome |
| ProductHunt | Vendored ph-search.py (`python3`) — GraphQL API, requires `PRODUCT_HUNT_TOKEN` env var |

## Execution

### Step 0: Dependency Check

Run all checks in a **single Bash call** using shell backgrounding (`&` + `wait`).
Claude Code executes Bash calls sequentially — multiple Bash tool calls do NOT run in parallel.
The only way to parallelize is within one shell invocation.

```bash
mkdir -p /tmp/dev-scan-$$
python3 skills/dev-scan/vendor/reddit-search/reddit-search.py --check > /tmp/dev-scan-$$/reddit.txt 2>&1 &
node skills/dev-scan/vendor/chromux-search/x-search.mjs --check > /tmp/dev-scan-$$/x.txt 2>&1 &
python3 skills/dev-scan/vendor/hn-search/hn-search.py --check > /tmp/dev-scan-$$/hn.txt 2>&1 &
node skills/dev-scan/vendor/chromux-search/web-search.mjs --check > /tmp/dev-scan-$$/web.txt 2>&1 &
python3 skills/dev-scan/vendor/ph-search/ph-search.py --check > /tmp/dev-scan-$$/ph.txt 2>&1 &
wait
echo "=== Reddit ===" && cat /tmp/dev-scan-$$/reddit.txt
echo "=== X/Twitter ===" && cat /tmp/dev-scan-$$/x.txt
echo "=== HN ===" && cat /tmp/dev-scan-$$/hn.txt
echo "=== Web (chromux) ===" && cat /tmp/dev-scan-$$/web.txt
echo "=== ProductHunt ===" && cat /tmp/dev-scan-$$/ph.txt
rm -rf /tmp/dev-scan-$$
```

| Result | Action |
|--------|--------|
| `reddit-search --check` → `available: true` | Reddit source available |
| `reddit-search --check` → `available: false` | Skip Reddit, warn user |
| `x-search --check` → `authenticated: true` | X/Twitter source available |
| `x-search --check` → `authenticated: false` | Skip X/Twitter, warn: "chromux default 프로필에서 X.com 로그인 필요" |
| `web-search --check` → `available: true` | Dev.to/Lobsters source available (Google search + enrichment via chromux) |
| `web-search --check` → `available: false` | Fall back to WebSearch for Dev.to/Lobsters |
| `hn-search --check` → `available: true` | Hacker News source available |
| `hn-search --check` → `available: false` | Fall back to WebSearch for HN |
| `ph-search --check` → `available: true` | ProductHunt source available |
| `ph-search --check` → `available: false` | Skip ProductHunt (token not set or invalid) |

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
| X/Twitter | `Q_TWITTER` | Short key terms + search operators. Append `since:YYYY-MM-DD` (30 days ago) and `min_faves:5` for quality filtering. Results sorted by popularity (Top). |
| HN | `Q_HN` | Specific technical terms. Drop "vs" — Algolia full-text matches better without. |
| Dev.to | `Q_DEVTO` | Add context word (`comparison`/`review`/`guide`) for better DuckDuckGo recall. |
| Lobsters | `Q_LOBSTERS` | Simple technical terms. Small community — keep query broad for recall. |
| ProductHunt | `Q_PH` | Product/tool names. Drop generic words — PH topics are specific slugs. **Only generate if PH is relevant (see below).** |

**ProductHunt relevance check** — PH is a product launch community. Only set `Q_PH` when the query involves **specific products, tools, or SaaS** (e.g. "Cursor", "Linear", "Supabase vs Firebase"). Skip PH when the topic is abstract/conceptual (e.g. "microservices best practices", "Rust async patterns", "tech layoffs").

**Query type rules:**

| Type | Reddit | X/Twitter | HN | Dev.to (DuckDuckGo) | Lobsters (DuckDuckGo) | ProductHunt |
|------|--------|-----------|-----|------|------|------|
| Comparison ("A vs B") | Keep "A vs B" | "A B since:… min_faves:5" | "A B" | "A vs B comparison" | "A B" | "A B" |
| Opinion ("reactions to X") | "X" | "X since:… min_faves:5" | "X" | "X review" | "X" | "X" |
| Technology ("X feature") | "X feature" | "X feature since:… min_faves:5" | "X feature" | "X feature guide" | "X feature" | "X" |
| Event ("X release") | "X release" | "X since:… min_faves:5" | "X" | "X announcement" | "X" | "X" |

**Example**: user asks "claude code vs codex"

| Variable | Optimized Query |
|----------|----------------|
| `Q_REDDIT` | `claude code vs codex` |
| `Q_TWITTER` | `claude code codex since:2026-01-17 min_faves:5` |
| `Q_HN` | `claude code codex` |
| `Q_DEVTO` | `claude code vs codex comparison` |
| `Q_LOBSTERS` | `claude code codex` |
| `Q_PH` | `claude code codex` |

### Step 2: Search (Two Bash Calls)

chromux scripts share one Chrome instance — running them simultaneously causes tab conflicts.
Split into two phases: API-based sources in parallel, then chromux sources sequentially.

**Bash call 1 — API sources (parallel):**
```bash
D=/tmp/dev-scan-results-$$
mkdir -p "$D"

python3 skills/dev-scan/vendor/reddit-search/reddit-search.py "{Q_REDDIT}" --count 10 --comments 5 --time month --json > "$D/reddit.json" 2>"$D/reddit.err" &
python3 skills/dev-scan/vendor/hn-search/hn-search.py "{Q_HN}" --count 10 --comments 5 --time month --json > "$D/hn.json" 2>"$D/hn.err" &
python3 skills/dev-scan/vendor/ph-search/ph-search.py "{Q_PH}" --count 10 --comments 3 --time month --json > "$D/ph.json" 2>"$D/ph.err" &
wait

echo "=== Reddit ===" && cat "$D/reddit.json"
echo "=== HN ===" && cat "$D/hn.json"
echo "=== ProductHunt ===" && cat "$D/ph.json"
```

**Bash call 2 — chromux sources (sequential, same Bash call):**
```bash
D=/tmp/dev-scan-results-$$

node skills/dev-scan/vendor/chromux-search/x-search.mjs "{Q_TWITTER}" --count 20 --json > "$D/x.json" 2>"$D/x.err"
echo "=== X/Twitter ===" && cat "$D/x.json"

node skills/dev-scan/vendor/chromux-search/web-search.mjs "{Q_DEVTO}" --site dev.to --time m --count 10 --comments 5 --body 500 --json > "$D/devto.json" 2>"$D/devto.err"
echo "=== Dev.to ===" && cat "$D/devto.json"

node skills/dev-scan/vendor/chromux-search/web-search.mjs "{Q_LOBSTERS}" --site lobste.rs --time m --count 10 --comments 5 --json > "$D/lobsters.json" 2>"$D/lobsters.err"
echo "=== Lobsters ===" && cat "$D/lobsters.json"

rm -rf "$D"
```

- Omit any source that failed `--check` in Step 0 or is not relevant (e.g. skip PH line if `Q_PH` not set).
- If chromux unavailable, replace Dev.to/Lobsters/X lines with `WebSearch` fallback.
- Run Bash call 1 and 2 in the **same message** (Claude Code sends them sequentially, but this saves a round-trip vs separate messages).

#### Source Notes

| Source | Tool | Notes |
|--------|------|-------|
| Reddit | reddit-search.py | Public JSON API, no key. Includes top comments with author/score. `--subreddits` for targeted search. |
| X/Twitter | x-search.mjs | chromux + existing X.com login. Auto-scrolls. Output: text, author, likes, RTs. |
| HN | hn-search.py | Algolia API, no key. Stories with points and top comments. |
| Dev.to | web-search.mjs | Google `site:dev.to` via chromux. Enriches: body, author, tags, comments. |
| Lobsters | web-search.mjs | Google `site:lobste.rs` via chromux. Enriches: body, author, tags, comments. |
| ProductHunt | ph-search.py | GraphQL API, needs `PRODUCT_HUNT_TOKEN`. Only for product/tool queries. |

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
| x-search not logged in | Skip X/Twitter, warn: "chromux default 프로필에서 X.com 로그인 필요" |
| x-search error | Skip X/Twitter, proceed with other sources |
| hn-search failure | Skip HN, proceed with other sources |
| ph-search failure / token missing | Skip ProductHunt, proceed with other sources |
| web-search / chromux unavailable | Fall back to WebSearch with `site:` filter |
| web-search enrichment timeout on URL | Skip that URL, include remaining results |
| Topic too new | Note insufficient results, suggest related keywords |
