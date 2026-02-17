#!/usr/bin/env python3
"""
enrich-browser.py - Enrich search result URLs with full content via agent-browser.

Uses agent-browser --session for parallel page extraction. Each URL runs in an
isolated browser session. Designed to receive URLs from ddgs-search.sh and fetch
article body + comments that DuckDuckGo snippets miss.

Usage:
  python3 enrich-browser.py <url> [url2 ...] [options]
  ddgs-search.sh "query" --site dev.to --json | python3 enrich-browser.py --stdin [options]
  python3 enrich-browser.py --check

Options:
  --stdin          Read ddgs JSON from stdin (expects [{href,title,body},...])
  --comments N     Max comments per page (default: 5)
  --body N         Max body chars (default: 500)
  --concurrency N  Parallel browser sessions (default: 3)
  --wait N         Wait ms after page load for JS rendering (default: 1500)
  --json           Output raw JSON (default: compact text for LLM)
  --check          Verify agent-browser is available
"""

import asyncio
import json
import re
import shutil
import subprocess
import sys


# ── Site-specific JS extractors ──────────────────────────────

EXTRACT_DEVTO = """
JSON.stringify({
    site: "dev.to",
    url: location.href,
    title: document.querySelector('h1')?.innerText?.trim() || document.title,
    author: document.querySelector('.crayons-article__subheader a')?.innerText?.trim() || '',
    tags: [...document.querySelectorAll('.crayons-article__tags a')].map(a => a.innerText.trim()),
    body: (document.querySelector('#article-body')?.innerText || '').trim().slice(0, __BODY_LEN__),
    comments: [...document.querySelectorAll('.comment__body')].slice(0, __MAX_COMMENTS__).map(el => {
        const c = el.closest('.comment') || el.closest('.crayons-comment');
        return {
            author: c?.querySelector('.comment__username, .crayons-comment__username')?.innerText?.trim() || '',
            text: el.innerText.trim().slice(0, 300)
        };
    })
})
"""

EXTRACT_LOBSTERS = """
JSON.stringify({
    site: "lobste.rs",
    url: location.href,
    title: document.querySelector('.u-url')?.innerText?.trim() || document.title,
    author: document.querySelector('.u-author')?.innerText?.trim() || '',
    tags: [...document.querySelectorAll('.story .tags a')].map(a => a.innerText.trim()),
    score: document.querySelector('.score')?.innerText?.trim() || '',
    comments: [...document.querySelectorAll('.comment_text')].slice(0, __MAX_COMMENTS__).map((el) => {
        const container = el.closest('.details_container') || el.parentElement;
        return {
            author: container?.querySelector('.u-author')?.innerText?.trim() || '',
            text: el.innerText.trim().slice(0, 300)
        };
    })
})
"""

EXTRACT_GENERIC = """
JSON.stringify({
    site: "generic",
    url: location.href,
    title: document.querySelector('h1')?.innerText?.trim() || document.title,
    body: (
        document.querySelector('article')?.innerText ||
        document.querySelector('main')?.innerText ||
        document.querySelector('.post-content, .entry-content, .article-body')?.innerText ||
        ''
    ).trim().slice(0, __BODY_LEN__)
})
"""


def detect_site(url):
    if "dev.to" in url:
        return "devto"
    elif "lobste.rs" in url:
        return "lobsters"
    return "generic"


def get_extractor_js(url, max_comments, body_len):
    site = detect_site(url)
    if site == "devto":
        js = EXTRACT_DEVTO
    elif site == "lobsters":
        js = EXTRACT_LOBSTERS
    else:
        js = EXTRACT_GENERIC
    return js.replace("__MAX_COMMENTS__", str(max_comments)).replace("__BODY_LEN__", str(body_len))


# ── agent-browser helpers ────────────────────────────────────

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(s):
    return ANSI_RE.sub("", s)


async def run_ab(session, *args):
    """Run an agent-browser command in a named session."""
    cmd = ["agent-browser", "--session", session] + list(args)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return strip_ansi(stdout.decode("utf-8", errors="replace")).strip()


def parse_eval_output(raw):
    """Parse agent-browser eval output: a JSON string containing JSON."""
    try:
        inner = json.loads(raw)
        if isinstance(inner, str):
            return json.loads(inner)
        return inner
    except json.JSONDecodeError:
        # Fallback: strip outer quotes
        raw = raw.strip('"').replace('\\"', '"')
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"error": "parse_failed", "raw": raw[:200]}


# ── Parallel extraction ──────────────────────────────────────

async def extract_one(url, idx, total, max_comments, body_len, wait_ms):
    """Extract content from a single URL using its own agent-browser session."""
    site = detect_site(url)
    session = f"enrich-{idx}"
    sys.stderr.write(f"[enrich] ({idx + 1}/{total}) {site}: {url}\n")

    try:
        # Open page
        await run_ab(session, "open", url)

        # Wait for JS-rendered content
        await run_ab(session, "wait", str(wait_ms))

        # Extract
        js = get_extractor_js(url, max_comments, body_len)
        raw = await run_ab(session, "eval", js)
        result = parse_eval_output(raw)
        return result

    except Exception as e:
        return {"url": url, "site": site, "error": str(e)}

    finally:
        # Close session
        try:
            await run_ab(session, "close")
        except Exception:
            pass


async def extract_batch(urls, max_comments, body_len, concurrency, wait_ms):
    """Extract from multiple URLs with controlled concurrency."""
    results = [None] * len(urls)
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded(i, url):
        async with semaphore:
            results[i] = await extract_one(url, i, len(urls), max_comments, body_len, wait_ms)

    tasks = [bounded(i, url) for i, url in enumerate(urls)]
    await asyncio.gather(*tasks)
    return results


# ── Input parsing ────────────────────────────────────────────

def parse_stdin_urls():
    """Parse ddgs JSON from stdin → list of URLs."""
    raw = sys.stdin.read().strip()
    if not raw:
        return []
    data = json.loads(raw)
    if isinstance(data, list):
        items = data
    else:
        items = data.get("results", data.get("data", []))
    return [r.get("href", r.get("url", "")) for r in items if r.get("href") or r.get("url")]


# ── Output formatters ───────────────────────────────────────

def format_compact(results):
    lines = []
    for i, item in enumerate(results, 1):
        if not item:
            continue
        title = item.get("title", "No title")
        url = item.get("url", "")
        author = item.get("author", "")

        lines.append(f"[{i}] {title}")
        lines.append(f"    URL: {url}")
        if author:
            lines.append(f"    Author: {author}")

        tags = item.get("tags", [])
        if tags:
            lines.append(f"    Tags: {' '.join(tags[:8])}")

        body = item.get("body", "")
        if body:
            preview = re.sub(r"\s+", " ", body)[:300]
            lines.append(f"    Body: {preview}")

        score = item.get("score", "")
        if score:
            lines.append(f"    Score: {score}")

        comments = item.get("comments", [])
        if comments:
            lines.append(f"    Comments ({len(comments)}):")
            for j, c in enumerate(comments, 1):
                ctext = re.sub(r"\s+", " ", c.get("text", ""))[:200]
                cauthor = c.get("author", "?")
                lines.append(f"      {j}. {cauthor}: {ctext}")

        if item.get("error"):
            lines.append(f"    ERROR: {item['error']}")

        lines.append("")

    return "\n".join(lines)


def format_json(results):
    return json.dumps(results, ensure_ascii=False, indent=2)


# ── Main ─────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    # --check
    if "--check" in args:
        ab = shutil.which("agent-browser")
        if ab:
            try:
                ver = subprocess.check_output(
                    ["agent-browser", "--version"], stderr=subprocess.STDOUT, timeout=5
                ).decode().strip()
            except Exception:
                ver = "installed"
            print(json.dumps({"available": True, "tool": f"agent-browser ({ver})"}))
            sys.exit(0)
        else:
            print(json.dumps({"available": False, "error": "agent-browser not found. Install: npm i -g agent-browser"}))
            sys.exit(1)

    # Parse args
    urls = []
    max_comments = 5
    body_len = 500
    concurrency = 3
    wait_ms = 1500
    output_json = False
    stdin_mode = False

    i = 0
    while i < len(args):
        if args[i] == "--stdin":
            stdin_mode = True
            i += 1
        elif args[i] == "--comments" and i + 1 < len(args):
            max_comments = int(args[i + 1])
            i += 2
        elif args[i] == "--body" and i + 1 < len(args):
            body_len = int(args[i + 1])
            i += 2
        elif args[i] == "--concurrency" and i + 1 < len(args):
            concurrency = int(args[i + 1])
            i += 2
        elif args[i] == "--wait" and i + 1 < len(args):
            wait_ms = int(args[i + 1])
            i += 2
        elif args[i] == "--json":
            output_json = True
            i += 1
        elif not args[i].startswith("-"):
            urls.append(args[i])
            i += 1
        else:
            i += 1

    if stdin_mode:
        urls = parse_stdin_urls()

    if not urls:
        print("Error: no URLs provided", file=sys.stderr)
        print("Usage: enrich-browser.py <url> [url2 ...] or --stdin", file=sys.stderr)
        sys.exit(1)

    urls = [u for u in urls if u.strip()]

    sys.stderr.write(f"[enrich] Starting: {len(urls)} URLs, concurrency={concurrency}\n")

    results = asyncio.run(extract_batch(urls, max_comments, body_len, concurrency, wait_ms))

    if output_json:
        print(format_json(results))
    else:
        print(format_compact(results))


if __name__ == "__main__":
    main()
