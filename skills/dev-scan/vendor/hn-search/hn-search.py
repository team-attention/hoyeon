#!/usr/bin/env python3
"""
hn-search.py - Hacker News search via Algolia API for dev-scan skill.

Usage:
  python3 hn-search.py <query> [options]
  python3 hn-search.py --check

Options:
  --count N        Max stories to return (default: 10)
  --comments N     Top comments per story (default: 5)
  --time PERIOD    Time filter: day,week,month,year,all (default: month)
  --json           Output as JSON (default: compact text for LLM consumption)
  --check          Verify HN Algolia API is reachable
"""

import json
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
import re

BASE = "https://hn.algolia.com/api/v1"
UA = "dev-scan/1.0 (Claude Code skill)"

TIME_MAP = {
    "day": 1,
    "week": 7,
    "month": 30,
    "year": 365,
    "all": 0,
}


# ── HTTP helpers ─────────────────────────────────────────────

def fetch_json(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def strip_html(text):
    """Strip HTML tags and decode entities."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ── Search ───────────────────────────────────────────────────

def search_stories(query, time_filter="month", limit=20):
    """Search HN stories via Algolia."""
    days = TIME_MAP.get(time_filter, 30)

    params = {
        "query": query,
        "tags": "story",
        "hitsPerPage": limit,
    }
    if days > 0:
        cutoff = int((datetime.now(tz=timezone.utc) - timedelta(days=days)).timestamp())
        params["numericFilters"] = f"created_at_i>{cutoff}"

    url = f"{BASE}/search?{urllib.parse.urlencode(params)}"
    data = fetch_json(url)
    if not data:
        return []

    stories = []
    for hit in data.get("hits", []):
        stories.append({
            "id": hit.get("objectID", ""),
            "title": hit.get("title", ""),
            "url": hit.get("url", ""),
            "hn_url": f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
            "points": hit.get("points", 0),
            "num_comments": hit.get("num_comments", 0),
            "author": hit.get("author", ""),
            "created_at": hit.get("created_at", ""),
        })
    return stories


# ── Enrichment: fetch top comments ───────────────────────────

def enrich_story(story, max_comments=5):
    """Fetch top comments for a single story via items endpoint."""
    url = f"{BASE}/items/{story['id']}"
    data = fetch_json(url, timeout=15)
    if not data:
        story["comments"] = []
        return story

    comments = []
    for child in data.get("children", []):
        if child.get("type") != "comment":
            continue
        text = strip_html(child.get("text", ""))
        if len(text) < 20:
            continue
        comments.append({
            "author": child.get("author", ""),
            "text": text[:300],
            "points": child.get("points") or 0,
        })

    # Sort by points desc (Algolia items endpoint returns in thread order)
    comments.sort(key=lambda c: c["points"], reverse=True)
    story["comments"] = comments[:max_comments]
    return story


def enrich_stories(stories, max_comments=5, max_workers=3):
    """Enrich multiple stories with comments in parallel."""
    enriched = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(enrich_story, s, max_comments): s for s in stories}
        for future in as_completed(futures):
            try:
                enriched.append(future.result())
            except Exception:
                s = futures[future]
                s["comments"] = []
                enriched.append(s)

    # Restore original order
    id_order = {s["id"]: i for i, s in enumerate(stories)}
    enriched.sort(key=lambda s: id_order.get(s["id"], 999))
    return enriched


# ── Output formatters ────────────────────────────────────────

def _fmt_date(iso_str):
    """Format ISO date as YYYY-MM-DD + days ago."""
    if not iso_str:
        return "?"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        days_ago = (datetime.now(tz=timezone.utc) - dt).days
        return f"{dt.strftime('%Y-%m-%d')} ({days_ago}d ago)"
    except Exception:
        return iso_str[:10]


def format_compact(stories, query):
    lines = []
    lines.append(f"## HN Search: {query}")
    lines.append(f"**Stories found:** {len(stories)}")
    lines.append("")

    for i, s in enumerate(stories, 1):
        date_str = _fmt_date(s.get("created_at"))
        lines.append(f"**HN{i}** {date_str} | {s['points']}pts | {s['num_comments']}cmt")
        lines.append(f"  {s['title']}")
        lines.append(f"  {s['hn_url']}")
        if s.get("url"):
            lines.append(f"  → {s['url']}")

        if s.get("comments"):
            lines.append("  **Top comments:**")
            for j, c in enumerate(s["comments"], 1):
                text = c["text"][:200]
                lines.append(f"    {j}. {c['author']}: {text}")

        lines.append("")

    return "\n".join(lines)


def format_json(stories, query):
    return json.dumps({
        "query": query,
        "count": len(stories),
        "stories": stories,
    }, ensure_ascii=False, indent=2)


# ── Main ─────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if "--check" in args:
        try:
            data = fetch_json(f"{BASE}/search?query=test&hitsPerPage=1")
            if data and "hits" in data:
                print(json.dumps({"available": True}))
                sys.exit(0)
            else:
                print(json.dumps({"available": False, "error": "unexpected response"}))
                sys.exit(1)
        except Exception as e:
            print(json.dumps({"available": False, "error": str(e)}))
            sys.exit(1)

    query = None
    count = 10
    max_comments = 5
    time_filter = "month"
    output_json = False

    i = 0
    while i < len(args):
        if args[i] == "--count" and i + 1 < len(args):
            count = int(args[i + 1])
            i += 2
        elif args[i] == "--comments" and i + 1 < len(args):
            max_comments = int(args[i + 1])
            i += 2
        elif args[i] == "--time" and i + 1 < len(args):
            time_filter = args[i + 1]
            i += 2
        elif args[i] == "--json":
            output_json = True
            i += 1
        elif not args[i].startswith("-"):
            query = args[i]
            i += 1
        else:
            i += 1

    if not query:
        print("Usage: hn-search.py <query> [--count N] [--comments N] [--time month] [--json]",
              file=sys.stderr)
        sys.exit(1)

    sys.stderr.write(f"[hn-search] Searching: {query} (t={time_filter})\n")
    stories = search_stories(query, time_filter, limit=count)
    stories = stories[:count]

    sys.stderr.write(f"[hn-search] Stories found: {len(stories)}, enriching...\n")

    if max_comments > 0 and stories:
        stories = enrich_stories(stories, max_comments, max_workers=3)

    if output_json:
        print(format_json(stories, query))
    else:
        print(format_compact(stories, query))


if __name__ == "__main__":
    main()
