#!/usr/bin/env python3
"""
reddit-search.py - Reddit public JSON API search for dev-scan skill.

Usage:
  python3 reddit-search.py <query> [options]
  python3 reddit-search.py --check

Options:
  --count N        Max threads to return (default: 10)
  --comments N     Top comments per thread (default: 5)
  --time PERIOD    Time filter: hour,day,week,month,year,all (default: month)
  --subreddits S   Comma-separated subreddits to search (auto-detected if omitted)
  --json           Output as JSON (default: compact text for LLM consumption)
  --check          Verify Reddit API is reachable
"""

import json
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

UA = "dev-scan/1.0 (Claude Code skill; +https://github.com)"
BASE = "https://www.reddit.com"
REQ_DELAY = 1.0  # seconds between requests (rate limit courtesy)


# ── HTTP helpers ─────────────────────────────────────────────

def fetch_json(url, timeout=10):
    """Fetch JSON from Reddit public endpoint."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RateLimitError("Reddit rate limit hit")
        raise
    except Exception:
        return None


class RateLimitError(Exception):
    pass


# ── Search ───────────────────────────────────────────────────

def search_global(query, time_filter="month", limit=25):
    """Global Reddit search with quoted phrase matching."""
    params = urllib.parse.urlencode({
        "q": query,
        "sort": "relevance",
        "t": time_filter,
        "limit": limit,
        "raw_json": 1,
    })
    url = f"{BASE}/search.json?{params}"
    data = fetch_json(url)
    if not data:
        return []
    return _parse_listing(data)


def search_subreddits(query, subreddits, time_filter="month", limit=25):
    """Search within specific subreddits (r/A+B+C)."""
    multi = "+".join(subreddits)
    params = urllib.parse.urlencode({
        "q": query,
        "sort": "relevance",
        "t": time_filter,
        "limit": limit,
        "raw_json": 1,
    })
    url = f"{BASE}/r/{multi}/search.json?{params}"
    data = fetch_json(url)
    if not data:
        return []
    return _parse_listing(data)


def _parse_listing(data):
    """Extract thread metadata from a Reddit listing response."""
    threads = []
    for child in data.get("data", {}).get("children", []):
        d = child.get("data", {})
        if not d.get("permalink"):
            continue
        threads.append({
            "id": d.get("id", ""),
            "subreddit": d.get("subreddit", ""),
            "title": d.get("title", ""),
            "selftext": (d.get("selftext", "") or "")[:500],
            "score": d.get("score", 0),
            "num_comments": d.get("num_comments", 0),
            "upvote_ratio": d.get("upvote_ratio", 0),
            "created_utc": d.get("created_utc", 0),
            "permalink": d.get("permalink", ""),
            "url": f"https://reddit.com{d.get('permalink', '')}",
            "author": d.get("author", ""),
            "link_flair_text": d.get("link_flair_text", ""),
        })
    return threads


# ── Enrichment: fetch thread comments ────────────────────────

def enrich_thread(thread, max_comments=5):
    """Fetch top comments for a single thread."""
    permalink = thread["permalink"].rstrip("/")
    url = f"{BASE}{permalink}.json?limit={max_comments}&sort=top&raw_json=1"
    data = fetch_json(url, timeout=15)
    if not data or len(data) < 2:
        thread["comments"] = []
        return thread

    comments = []
    for child in data[1].get("data", {}).get("children", []):
        if child.get("kind") != "t1":
            continue
        cd = child.get("data", {})
        body = (cd.get("body", "") or "").strip()
        # Filter low-value comments
        if len(body) < 30:
            continue
        if body.lower() in ("this", "this.", "lol", "same", "agreed", "+1"):
            continue
        comments.append({
            "author": cd.get("author", ""),
            "score": cd.get("score", 0),
            "body": body[:300],
            "permalink": f"https://reddit.com{cd.get('permalink', '')}",
        })

    thread["comments"] = comments[:max_comments]
    return thread


def enrich_threads(threads, max_comments=5, max_workers=3):
    """Enrich multiple threads with comments in parallel."""
    enriched = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {}
        for i, t in enumerate(threads):
            # Stagger requests to avoid rate limiting
            future = pool.submit(_enrich_with_delay, t, max_comments, i * REQ_DELAY)
            futures[future] = t

        for future in as_completed(futures):
            try:
                result = future.result()
                enriched.append(result)
            except RateLimitError:
                # On rate limit, keep remaining threads without comments
                remaining = futures[future]
                remaining["comments"] = []
                enriched.append(remaining)
            except Exception:
                t = futures[future]
                t["comments"] = []
                enriched.append(t)

    # Restore original order by id
    id_order = {t["id"]: i for i, t in enumerate(threads)}
    enriched.sort(key=lambda t: id_order.get(t["id"], 999))
    return enriched


def _enrich_with_delay(thread, max_comments, delay):
    if delay > 0:
        time.sleep(delay)
    return enrich_thread(thread, max_comments)


# ── Relevance scoring ────────────────────────────────────────

def score_relevance(threads, query):
    """Score threads by keyword match ratio and attach relevance_score.
    Requires at least half the keywords to match (rounded up)."""
    keywords = [w.lower() for w in query.split() if len(w) >= 3]
    if not keywords:
        for t in threads:
            t["relevance"] = 1.0
        return threads

    threshold = (len(keywords) + 1) // 2  # at least half must match

    for t in threads:
        text = (t["title"] + " " + t.get("selftext", "") + " " + t.get("subreddit", "")).lower()
        matched = sum(1 for kw in keywords if kw in text)
        t["relevance"] = matched / len(keywords)

    relevant = [t for t in threads if t["relevance"] * len(keywords) >= threshold]
    return relevant if relevant else threads  # fallback to all


# ── Deduplication ────────────────────────────────────────────

def dedupe_threads(threads):
    """Remove duplicate threads by Reddit post ID."""
    seen = set()
    unique = []
    for t in threads:
        if t["id"] not in seen:
            seen.add(t["id"])
            unique.append(t)
    return unique


# ── Auto-discover subreddits ─────────────────────────────────

def discover_subreddits(threads, min_count=1):
    """Extract subreddit names from search results."""
    counts = {}
    for t in threads:
        sub = t["subreddit"]
        counts[sub] = counts.get(sub, 0) + 1
    return [sub for sub, cnt in sorted(counts.items(), key=lambda x: -x[1]) if cnt >= min_count]


# ── Output formatters ────────────────────────────────────────

def _fmt_date(utc_ts):
    """Format UTC timestamp as YYYY-MM-DD + days ago."""
    if not utc_ts:
        return "?"
    dt = datetime.fromtimestamp(utc_ts, tz=timezone.utc)
    days_ago = (datetime.now(tz=timezone.utc) - dt).days
    return f"{dt.strftime('%Y-%m-%d')} ({days_ago}d ago)"


def format_compact(threads, query):
    """Compact text output optimized for LLM consumption."""
    lines = []
    lines.append(f"## Reddit Search: {query}")
    lines.append(f"**Threads found:** {len(threads)}")
    lines.append("")

    for i, t in enumerate(threads, 1):
        date_str = _fmt_date(t.get("created_utc"))
        rel = t.get("relevance", 0)
        lines.append(f"**R{i}** r/{t['subreddit']} | {date_str} | score:{t['score']} | "
                     f"{t['num_comments']}cmt | rel:{rel:.0%}")
        lines.append(f"  {t['title']}")
        lines.append(f"  {t['url']}")

        if t.get("selftext"):
            body_preview = t["selftext"].replace("\n", " ")[:200]
            lines.append(f"  > {body_preview}")

        if t.get("comments"):
            lines.append("  **Top comments:**")
            for j, c in enumerate(t["comments"], 1):
                body = c["body"].replace("\n", " ")[:200]
                lines.append(f"    {j}. u/{c['author']} (score:{c['score']}): {body}")

        lines.append("")

    return "\n".join(lines)


def format_json(threads, query):
    """JSON output."""
    return json.dumps({
        "query": query,
        "count": len(threads),
        "threads": threads,
    }, ensure_ascii=False, indent=2)


# ── Main ─────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    # --check
    if "--check" in args:
        try:
            data = fetch_json(f"{BASE}/r/test/about.json")
            if data:
                print(json.dumps({"available": True}))
                sys.exit(0)
            else:
                print(json.dumps({"available": False, "error": "no response"}))
                sys.exit(1)
        except Exception as e:
            print(json.dumps({"available": False, "error": str(e)}))
            sys.exit(1)

    # Parse args
    query = None
    count = 10
    max_comments = 5
    time_filter = "month"
    subreddits = None
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
        elif args[i] == "--subreddits" and i + 1 < len(args):
            subreddits = [s.strip() for s in args[i + 1].split(",")]
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
        print("Usage: reddit-search.py <query> [--count N] [--comments N] [--time month] [--json]",
              file=sys.stderr)
        sys.exit(1)

    # Phase 1: Global search — quoted first, fallback to unquoted
    sys.stderr.write(f"[reddit-search] Searching: {query} (t={time_filter})\n")
    global_threads = search_global(f'"{query}"', time_filter, limit=25)

    if len(global_threads) < 3:
        sys.stderr.write(f"[reddit-search] Exact match too few ({len(global_threads)}), broadening...\n")
        time.sleep(REQ_DELAY)
        broad_threads = search_global(query, time_filter, limit=25)
        global_threads.extend(broad_threads)

    # Phase 2: If subreddits given or discovered, do targeted search
    all_threads = list(global_threads)

    if subreddits:
        target_subs = subreddits
    else:
        target_subs = discover_subreddits(global_threads, min_count=1)

    if target_subs:
        sys.stderr.write(f"[reddit-search] Subreddits found: {', '.join(target_subs[:8])}\n")
        time.sleep(REQ_DELAY)
        sub_threads = search_subreddits(query, target_subs[:8], time_filter, limit=25)
        all_threads.extend(sub_threads)

    # Score relevance, dedupe, sort by relevance then score
    all_threads = score_relevance(all_threads, query)
    all_threads = dedupe_threads(all_threads)
    all_threads.sort(key=lambda t: (t.get("relevance", 0), t["score"]), reverse=True)
    all_threads = all_threads[:count]

    sys.stderr.write(f"[reddit-search] Unique threads: {len(all_threads)}, enriching top {len(all_threads)}...\n")

    # Phase 3: Enrich with comments
    if max_comments > 0:
        all_threads = enrich_threads(all_threads, max_comments, max_workers=3)

    # Output
    if output_json:
        print(format_json(all_threads, query))
    else:
        print(format_compact(all_threads, query))


if __name__ == "__main__":
    main()
