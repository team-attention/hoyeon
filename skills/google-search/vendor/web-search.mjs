#!/usr/bin/env node
/**
 * web-search.mjs — Google search + content enrichment via chromux.
 *
 * Replaces ddgs-search.sh + enrich-browser.py pipeline for dev-scan skill.
 * Uses real Chrome via chromux for Google search and page content extraction.
 * Zero additional dependencies beyond chromux.
 *
 * Usage:
 *   node web-search.mjs "query" --site dev.to --count 10
 *   node web-search.mjs "query" --site lobste.rs --count 10 --no-enrich
 *   node web-search.mjs --check
 */

import { execFileSync } from 'node:child_process';

// ── chromux CLI helper ──────────────────────────────────────

function cx(...args) {
  try {
    return execFileSync('chromux', args, {
      encoding: 'utf8', timeout: 25000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    throw new Error(`chromux ${args[0]}: ${err.stderr?.trim() || err.message}`);
  }
}

const RUN_ID = Math.random().toString(36).slice(2, 6);
let seq = 0;
function sid() { return `ws-${RUN_ID}-${seq++}`; }

// ── Google search result extraction JS ──────────────────────

const GOOGLE_JS = (count) => `JSON.stringify(
  [...document.querySelectorAll('h3')]
    .map(h3 => {
      const a = h3.closest('a') || h3.parentElement?.closest('a');
      if (!a || !a.href || a.href.includes('google.com')) return null;
      const container = a.closest('[data-sokoban-container]') || a.closest('div');
      const spans = container ? [...container.querySelectorAll('span')] : [];
      const snippet = spans.find(s => s.innerText.length > 50)?.innerText?.trim()?.slice(0, 300) || '';
      return {
        title: h3.innerText.trim(),
        url: a.href,
        snippet
      };
    })
    .filter(Boolean)
    .slice(0, ${count})
)`;

// ── Site-specific content extractors ────────────────────────

const DEVTO_JS = (mc, bl) => `JSON.stringify({
  site: "dev.to", url: location.href,
  title: document.querySelector('h1')?.innerText?.trim() || document.title,
  author: document.querySelector('.crayons-article__subheader a')?.innerText?.trim() || '',
  tags: [...document.querySelectorAll('.crayons-article__tags a')].map(a => a.innerText.trim()).slice(0, 8),
  body: (document.querySelector('#article-body')?.innerText || '').trim().slice(0, ${bl}),
  comments: [...document.querySelectorAll('.comment__body')].slice(0, ${mc}).map(el => {
    const c = el.closest('.comment') || el.closest('.crayons-comment');
    return {
      author: c?.querySelector('.comment__username, .crayons-comment__username')?.innerText?.trim() || '',
      text: el.innerText.trim().slice(0, 300)
    };
  })
})`;

const LOBSTERS_JS = (mc) => `JSON.stringify({
  site: "lobste.rs", url: location.href,
  title: document.querySelector('.u-url')?.innerText?.trim() || document.title,
  author: document.querySelector('.u-author')?.innerText?.trim() || '',
  tags: [...document.querySelectorAll('.story .tags a')].map(a => a.innerText.trim()).slice(0, 8),
  score: document.querySelector('.score')?.innerText?.trim() || '',
  comments: [...document.querySelectorAll('.comment_text')].slice(0, ${mc}).map(el => {
    const ct = el.closest('.details_container') || el.parentElement;
    return {
      author: ct?.querySelector('.u-author')?.innerText?.trim() || '',
      text: el.innerText.trim().slice(0, 300)
    };
  })
})`;

const REDDIT_JS = (mc, bl) => `JSON.stringify({
  site: "reddit.com", url: location.href,
  title: (document.querySelector('h1') || document.querySelector('[data-testid="post-title"]'))?.innerText?.trim() || document.title,
  author: document.querySelector('[data-testid="post_author_link"]')?.innerText?.trim() || '',
  score: document.querySelector('[data-testid="post-unit-score"]')?.innerText?.trim() || document.querySelector('shreddit-post')?.getAttribute('score') || '',
  body: (document.querySelector('[data-testid="post-content"]')?.innerText || document.querySelector('[slot="text-body"]')?.innerText || '').trim().slice(0, ${bl}),
  comments: [...document.querySelectorAll('shreddit-comment')].slice(0, ${mc}).map(el => {
    return {
      author: el.getAttribute('author') || '',
      score: el.getAttribute('score') || '',
      text: (el.querySelector('[slot="comment"]')?.innerText || '').trim().slice(0, 300)
    };
  })
})`;

const TWITTER_JS = (mc) => `JSON.stringify({
  site: "x.com", url: location.href,
  title: '',
  comments: [...document.querySelectorAll('[data-testid="tweet"]')].slice(0, ${mc + 1}).map(el => {
    const textEl = el.querySelector('[data-testid="tweetText"]');
    const userEl = el.querySelector('[data-testid="User-Name"]');
    const timeEl = el.querySelector('time');
    const metric = (id) => {
      const btn = el.querySelector('[data-testid="' + id + '"]');
      const label = btn?.getAttribute('aria-label') || '';
      const m = label.match(/([\\d,]+)/);
      return m ? m[1].replace(/,/g, '') : '0';
    };
    if (!textEl) return null;
    const userParts = userEl?.innerText?.split('\\n') || [];
    return {
      author: userParts[0]?.trim() || '',
      handle: userParts.find(p => p.startsWith('@'))?.trim() || '',
      text: textEl.innerText.trim().slice(0, 300),
      likes: metric('like'),
      time: timeEl?.getAttribute('datetime') || ''
    };
  }).filter(Boolean)
})`;

const GENERIC_JS = (bl) => `JSON.stringify({
  site: "generic", url: location.href,
  title: document.querySelector('h1')?.innerText?.trim() || document.title,
  body: (
    document.querySelector('article')?.innerText ||
    document.querySelector('main')?.innerText ||
    document.querySelector('.post-content, .entry-content')?.innerText || ''
  ).trim().slice(0, ${bl})
})`;

function extractorFor(url, mc, bl) {
  if (url.includes('dev.to')) return DEVTO_JS(mc, bl);
  if (url.includes('lobste.rs')) return LOBSTERS_JS(mc);
  if (url.includes('reddit.com')) return REDDIT_JS(mc, bl);
  if (url.includes('x.com') || url.includes('twitter.com')) return TWITTER_JS(mc);
  return GENERIC_JS(bl);
}

// ── Google time filter ──────────────────────────────────────

const TIME_MAP = { d: 'qdr:d', w: 'qdr:w', m: 'qdr:m', y: 'qdr:y' };

// ── Main ────────────────────────────────────────────────────

async function search(query, { site, count, time, enrich, maxComments, bodyLen }) {
  const gs = sid();

  let q = query;
  if (site) q += ` site:${site}`;
  let url = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=${count}`;
  if (time && TIME_MAP[time]) url += `&tbs=${TIME_MAP[time]}`;

  try {
    process.stderr.write(`[web-search] Google: ${q}\n`);
    cx('open', gs, url);
    cx('wait', gs, '1500');

    let results;
    try {
      results = JSON.parse(cx('eval', gs, GOOGLE_JS(count)));
    } catch {
      process.stderr.write(`[web-search] Failed to parse Google results\n`);
      return [];
    }
    process.stderr.write(`[web-search] ${results.length} results found\n`);

    if (!enrich || results.length === 0) return results;

    // Enrich: visit each URL and extract content (reuse one session)
    const es = sid();
    const enriched = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      process.stderr.write(`[web-search] Enriching (${i + 1}/${results.length}): ${r.url}\n`);
      try {
        cx('open', es, r.url);
        const wait = (r.url.includes('reddit.com') || r.url.includes('x.com')) ? '3000' : '1500';
        cx('wait', es, wait);
        const content = JSON.parse(cx('eval', es, extractorFor(r.url, maxComments, bodyLen)));
        const empty = !content.body && (!content.comments || content.comments.length === 0);
        if (empty) process.stderr.write(`[web-search] WARNING: empty enrichment for ${r.url}\n`);
        enriched.push({ ...r, ...content, enrichEmpty: empty || undefined });
      } catch (err) {
        enriched.push({ ...r, enrichError: err.message });
      }
    }

    try { cx('close', es); } catch {}
    return enriched;
  } finally {
    try { cx('close', gs); } catch {}
  }
}

// ── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--check')) {
  try {
    cx('list');
    console.log(JSON.stringify({ available: true, tool: 'chromux (web-search)' }));
  } catch (err) {
    console.log(JSON.stringify({ available: false, error: err.message }));
    process.exit(1);
  }
  process.exit(0);
}

let query = '', site = '', count = 10, time = '', enrich = true;
let maxComments = 5, bodyLen = 500, jsonMode = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--site': site = args[++i]; break;
    case '--count': count = parseInt(args[++i]); break;
    case '--time': time = args[++i]; break;
    case '--comments': maxComments = parseInt(args[++i]); break;
    case '--body': bodyLen = parseInt(args[++i]); break;
    case '--no-enrich': enrich = false; break;
    case '--json': jsonMode = true; break;
    default:
      if (!args[i].startsWith('-')) query = query ? `${query} ${args[i]}` : args[i];
  }
}

if (!query) {
  console.error('Usage: web-search.mjs "query" [--site domain] [--count N] [--time d/w/m/y] [--comments N] [--body N] [--no-enrich] [--json]');
  process.exit(1);
}

const results = await search(query, { site, count, time, enrich, maxComments, bodyLen });

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`[${i + 1}] ${r.title}`);
    console.log(`    URL: ${r.url}`);
    if (r.author) console.log(`    Author: ${r.author}`);
    if (r.tags?.length) console.log(`    Tags: ${r.tags.join(', ')}`);
    if (r.body) console.log(`    Body: ${r.body.replace(/\s+/g, ' ').slice(0, 300)}`);
    if (r.score) console.log(`    Score: ${r.score}`);
    if (r.comments?.length) {
      console.log(`    Comments (${r.comments.length}):`);
      r.comments.forEach((c, j) => {
        console.log(`      ${j + 1}. ${c.author || '?'}: ${c.text?.replace(/\s+/g, ' ').slice(0, 200)}`);
      });
    }
    if (r.enrichError) console.log(`    ERROR: ${r.enrichError}`);
    console.log();
  }
}
