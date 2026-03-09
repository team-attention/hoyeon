---
name: google-search
description: |
  Google search via real Chrome browser (chromux). Use when the user asks to
  "search Google", "구글 검색", "구글에서 찾아줘", "find articles about",
  "search the web for", or needs web search results with full page content.
  Also trigger when: searching a specific site ("search dev.to for..."),
  finding recent articles/posts about a topic, extracting content from
  search results, or when WebSearch results are insufficient and real
  browser rendering is needed. Prefer this over WebSearch when the user
  wants site-specific search, time-filtered results, or full article
  body/comments extraction.
---

# Google Search (chromux)

Search Google and optionally extract full page content using a real Chrome browser via chromux.
Unlike WebSearch, this uses an actual Chrome instance — same results a human would see, with
JavaScript-rendered content and no bot detection.

## When to Use

- User asks to search Google or the web for something
- Need `site:` operator to search within a specific domain
- Need time-filtered results (past day/week/month/year)
- Need full article body and comments, not just snippets
- WebSearch gives poor results and real browser search would help

## Prerequisites

Requires `chromux` CLI installed. Launch headless Chrome before use:

```bash
chromux launch default --headless 2>/dev/null || true
```

This starts Chrome without a visible window. Skips if already running.

## Usage

```bash
node ${baseDir}/vendor/web-search.mjs "<query>" [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--site <domain>` | Add `site:` filter (e.g. `dev.to`, `stackoverflow.com`) | none |
| `--time <d\|w\|m\|y>` | Time filter: day, week, month, year | none (all time) |
| `--count <N>` | Max results | `10` |
| `--no-enrich` | Skip page visits, return Google snippets only (faster) | enrichment on |
| `--comments <N>` | Max comments to extract per page | `5` |
| `--body <N>` | Max body chars to extract per page | `500` |
| `--json` | Output raw JSON instead of text | text |
| `--check` | Verify chromux is available | - |

### Examples

**Basic search:**
```bash
node ${baseDir}/vendor/web-search.mjs "react server components best practices" --count 5
```

**Site-specific search:**
```bash
node ${baseDir}/vendor/web-search.mjs "authentication patterns" --site stackoverflow.com --count 10
```

**Quick search (snippets only, no page visits):**
```bash
node ${baseDir}/vendor/web-search.mjs "bun vs deno 2024" --no-enrich --count 10
```

**Time-filtered search:**
```bash
node ${baseDir}/vendor/web-search.mjs "openai o3 release" --time w --count 5
```

**Full content extraction with JSON output:**
```bash
node ${baseDir}/vendor/web-search.mjs "claude code tips" --site dev.to --comments 5 --body 1000 --json
```

## Output Format

### Text mode (default)

```
[1] Article Title Here
    URL: https://example.com/article
    Author: John Doe
    Tags: javascript, react
    Body: First 500 chars of article body...
    Comments (3):
      1. commenter1: Comment text here...
      2. commenter2: Another comment...

[2] Another Article
    URL: https://example.com/other
    ...
```

### JSON mode (`--json`)

Returns an array of objects:
```json
[
  {
    "title": "Article Title",
    "url": "https://example.com/article",
    "snippet": "Google search snippet",
    "author": "John Doe",
    "tags": ["javascript", "react"],
    "body": "Full article body text...",
    "comments": [
      {"author": "commenter1", "text": "Comment text..."}
    ]
  }
]
```

Fields like `author`, `tags`, `body`, `comments` are only present when enrichment is enabled.
The enrichment extracts content using site-specific JS extractors for Dev.to and Lobsters,
with a generic fallback for other sites.

## Performance Notes

- **No enrichment** (`--no-enrich`): ~3-5 seconds (Google search only)
- **With enrichment**: ~2-3 seconds per result page (sequential visits)
- For 10 results with enrichment: ~25-35 seconds total
- Use `--no-enrich` when you only need URLs and snippets
- Use `--count` to limit results when enrichment is on

## Error Handling

| Situation | Behavior |
|-----------|----------|
| chromux not installed | `--check` returns `available: false` |
| Google CAPTCHA | Returns 0 results, retry later |
| Page load timeout during enrichment | Skips that URL, continues with others |
| No results found | Returns empty array/output |

## Fallback

If chromux is unavailable, fall back to the built-in `WebSearch` tool.
