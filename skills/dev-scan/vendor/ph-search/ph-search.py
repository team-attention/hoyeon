#!/usr/bin/env python3
"""
ph-search.py - ProductHunt search via GraphQL API for dev-scan skill.

Usage:
  python3 ph-search.py <query> [options]
  python3 ph-search.py --check

Options:
  --count N        Max products to return (default: 10)
  --comments N     Top comments per product (default: 3)
  --time PERIOD    Time filter: day,week,month,year,all (default: month)
  --json           Output as JSON (default: compact text for LLM consumption)
  --check          Verify ProductHunt API is reachable and token is valid
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

API_URL = "https://api.producthunt.com/v2/api/graphql"
UA = "dev-scan/1.0 (Claude Code skill)"

TIME_MAP = {
    "day": 1,
    "week": 7,
    "month": 30,
    "year": 365,
    "all": 0,
}

# ── GraphQL queries ──────────────────────────────────────────

SEARCH_TOPICS_QUERY = """
query SearchTopics($query: String!) {
  topics(query: $query, first: 10) {
    edges {
      node {
        id
        slug
        name
        postsCount
      }
    }
  }
}
"""

TOPIC_BY_SLUG_QUERY = """
query TopicBySlug($slug: String!) {
  topic(slug: $slug) {
    id
    slug
    name
    postsCount
  }
}
"""

POSTS_BY_TOPIC_QUERY = """
query PostsByTopic($topic: String!, $postedAfter: DateTime, $first: Int!) {
  posts(topic: $topic, first: $first, order: VOTES, postedAfter: $postedAfter) {
    edges {
      node {
        id
        name
        tagline
        description
        url
        slug
        votesCount
        commentsCount
        createdAt
        website
        topics {
          edges {
            node {
              slug
            }
          }
        }
      }
    }
  }
}
"""

POST_COMMENTS_QUERY = """
query PostComments($id: ID!, $first: Int!) {
  post(id: $id) {
    comments(first: $first, order: VOTES_COUNT) {
      edges {
        node {
          id
          body
          votesCount
          createdAt
          user {
            username
          }
        }
      }
    }
  }
}
"""


# ── HTTP helpers ─────────────────────────────────────────────

def get_token():
    return os.environ.get("PRODUCT_HUNT_TOKEN", "")


def graphql_request(query, variables=None, timeout=15):
    token = get_token()
    if not token:
        return None

    payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "User-Agent": UA,
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            if data.get("errors"):
                sys.stderr.write(f"[ph-search] GraphQL errors: {data['errors']}\n")
                return None
            return data.get("data")
    except Exception as e:
        sys.stderr.write(f"[ph-search] Request failed: {e}\n")
        return None


# ── Search ───────────────────────────────────────────────────

def _slugify(text):
    """Convert text to PH-style slug: lowercase, hyphens, no special chars."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text


def _is_relevant_topic(topic_name, topic_slug, keywords):
    """Check if a topic is relevant to the search keywords."""
    name_lower = topic_name.lower()
    slug_lower = topic_slug.lower()
    for kw in keywords:
        kw = kw.lower()
        if kw in name_lower or kw in slug_lower:
            return True
    return False


def search_topics(query):
    """Search topics by keyword using hybrid strategy, return list of slugs.

    Strategy:
    1. Split query into keywords, search each via topics(query:)
    2. Try direct topic(slug:) lookups for slugified variants
    3. Filter for relevance, deduplicate, return top 5 by postsCount
    """
    keywords = [w for w in query.split() if len(w) >= 2]
    if not keywords:
        keywords = [query]

    found = {}  # slug -> {slug, name, postsCount}

    # 1) Search via topics(query:) for each keyword
    for kw in keywords:
        data = graphql_request(SEARCH_TOPICS_QUERY, {"query": kw})
        if not data or not data.get("topics"):
            continue
        for edge in data["topics"].get("edges", []):
            node = edge.get("node")
            if not node:
                continue
            slug = node["slug"]
            if slug not in found and _is_relevant_topic(node["name"], slug, keywords):
                found[slug] = node

    # 2) Try direct slug lookups for slugified variants
    slug_candidates = set()
    slug_candidates.add(_slugify(query))  # full query as slug
    for kw in keywords:
        slug_candidates.add(_slugify(kw))
    # common PH slug patterns
    if len(keywords) >= 2:
        slug_candidates.add(_slugify(" ".join(keywords)))

    for slug in slug_candidates:
        if not slug or slug in found:
            continue
        data = graphql_request(TOPIC_BY_SLUG_QUERY, {"slug": slug})
        if data and data.get("topic"):
            node = data["topic"]
            found[node["slug"]] = node

    # Sort by postsCount desc, take top 5
    topics = sorted(found.values(), key=lambda t: t.get("postsCount", 0), reverse=True)
    return [t["slug"] for t in topics[:5]]


def get_posts_by_topic(slug, posted_after=None, limit=10):
    """Get posts for a topic slug, sorted by votes."""
    variables = {"topic": slug, "first": limit}
    if posted_after:
        variables["postedAfter"] = posted_after

    data = graphql_request(POSTS_BY_TOPIC_QUERY, variables)
    if not data or not data.get("posts"):
        return []

    posts = []
    for edge in data["posts"].get("edges", []):
        node = edge.get("node")
        if not node:
            continue
        topics = [
            te["node"]["slug"]
            for te in node.get("topics", {}).get("edges", [])
            if te.get("node")
        ]
        posts.append({
            "id": node["id"],
            "name": node.get("name", ""),
            "tagline": node.get("tagline", ""),
            "description": (node.get("description") or "")[:200],
            "url": f"https://www.producthunt.com/posts/{node.get('slug', '')}",
            "website": node.get("website", ""),
            "votesCount": node.get("votesCount", 0),
            "commentsCount": node.get("commentsCount", 0),
            "createdAt": node.get("createdAt", ""),
            "topics": topics,
        })
    return posts


FALLBACK_TOPICS = [
    "artificial-intelligence", "developer-tools", "saas", "open-source",
    "productivity", "software-engineering",
]


def _post_matches_query(post, keywords):
    """Check if a post's name or tagline contains any query keyword."""
    text = f"{post['name']} {post['tagline']}".lower()
    return any(kw.lower() in text for kw in keywords)


def search_products(query, time_filter="month", limit=10):
    """Search products: topics → posts → deduplicate → sort.

    When no matching topics are found, falls back to broad topics
    and filters posts by name/tagline keyword match.
    """
    sys.stderr.write(f"[ph-search] Searching topics for: {query}\n")
    slugs = search_topics(query)
    use_post_filter = False

    if not slugs:
        sys.stderr.write("[ph-search] No topics found, using fallback topics with post filter\n")
        slugs = FALLBACK_TOPICS
        use_post_filter = True
    else:
        sys.stderr.write(f"[ph-search] Found topics: {slugs}\n")

    days = TIME_MAP.get(time_filter, 30)
    posted_after = None
    if days > 0:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
        posted_after = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")

    keywords = [w for w in query.split() if len(w) >= 2]
    all_posts = []
    seen_ids = set()
    per_topic = max(limit, 5) if not use_post_filter else 20

    for slug in slugs:
        posts = get_posts_by_topic(slug, posted_after=posted_after, limit=per_topic)
        for p in posts:
            if p["id"] not in seen_ids:
                if use_post_filter and not _post_matches_query(p, keywords):
                    continue
                seen_ids.add(p["id"])
                all_posts.append(p)

    all_posts.sort(key=lambda p: p["votesCount"], reverse=True)
    return all_posts[:limit]


# ── Enrichment: fetch top comments ───────────────────────────

def enrich_product(product, max_comments=3):
    """Fetch top comments for a single product."""
    data = graphql_request(POST_COMMENTS_QUERY, {"id": product["id"], "first": max_comments})
    if not data or not data.get("post") or not data["post"].get("comments"):
        product["comments"] = []
        return product

    comments = []
    for edge in data["post"]["comments"].get("edges", []):
        node = edge.get("node")
        if not node:
            continue
        body = (node.get("body") or "").strip()
        if len(body) < 10:
            continue
        username = ""
        if node.get("user"):
            username = node["user"].get("username", "")
        comments.append({
            "author": username,
            "text": body[:300],
            "votes": node.get("votesCount", 0),
        })

    product["comments"] = comments
    return product


def enrich_products(products, max_comments=3, max_workers=3):
    """Enrich multiple products with comments in parallel."""
    enriched = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(enrich_product, p, max_comments): p for p in products}
        for future in as_completed(futures):
            try:
                enriched.append(future.result())
            except Exception:
                p = futures[future]
                p["comments"] = []
                enriched.append(p)

    # Restore original order (sorted by votes)
    id_order = {p["id"]: i for i, p in enumerate(products)}
    enriched.sort(key=lambda p: id_order.get(p["id"], 999))
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


def format_compact(products, query):
    lines = []
    lines.append(f"## ProductHunt Search: {query}")
    lines.append(f"**Products found:** {len(products)}")
    lines.append("")

    for i, p in enumerate(products, 1):
        date_str = _fmt_date(p.get("createdAt"))
        lines.append(f"**PH{i}** {date_str} | {p['votesCount']}votes | {p['commentsCount']}cmt")
        lines.append(f"  {p['name']} — {p['tagline']}")
        lines.append(f"  {p['url']}")
        if p.get("description"):
            lines.append(f"  > {p['description']}")
        if p.get("topics"):
            lines.append(f"  Topics: {', '.join(p['topics'])}")

        if p.get("comments"):
            lines.append("  **Top comments:**")
            for j, c in enumerate(p["comments"], 1):
                text = c["text"][:200]
                lines.append(f"    {j}. {c['author']}: {text}")

        lines.append("")

    return "\n".join(lines)


def format_json(products, query):
    return json.dumps({
        "query": query,
        "count": len(products),
        "products": products,
    }, ensure_ascii=False, indent=2)


# ── Main ─────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if "--check" in args:
        token = get_token()
        if not token:
            print(json.dumps({"available": False, "error": "PRODUCT_HUNT_TOKEN not set"}))
            sys.exit(1)
        try:
            data = graphql_request("{ viewer { user { id } } }", timeout=10)
            if data is not None:
                print(json.dumps({"available": True}))
                sys.exit(0)
            else:
                print(json.dumps({"available": False, "error": "invalid token or API error"}))
                sys.exit(1)
        except Exception as e:
            print(json.dumps({"available": False, "error": str(e)}))
            sys.exit(1)

    query = None
    count = 10
    max_comments = 3
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
        print("Usage: ph-search.py <query> [--count N] [--comments N] [--time month] [--json]",
              file=sys.stderr)
        sys.exit(1)

    sys.stderr.write(f"[ph-search] Searching: {query} (t={time_filter})\n")
    products = search_products(query, time_filter, limit=count)

    sys.stderr.write(f"[ph-search] Products found: {len(products)}, enriching...\n")

    if max_comments > 0 and products:
        products = enrich_products(products, max_comments, max_workers=3)

    if output_json:
        print(format_json(products, query))
    else:
        print(format_compact(products, query))


if __name__ == "__main__":
    main()
