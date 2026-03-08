#!/usr/bin/env node
/**
 * x-search.mjs — X/Twitter search via chromux.
 *
 * Replaces bird-search.mjs (900+ lines) for dev-scan skill.
 * Uses real Chrome with existing X.com login — no cookie extraction,
 * no GraphQL query ID management, no feature flag caching.
 *
 * Usage:
 *   node x-search.mjs "query" --count 20
 *   node x-search.mjs --check
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

const SESSION = `xs-${Math.random().toString(36).slice(2, 6)}`;

// ── Tweet extraction JS ─────────────────────────────────────

const TWEET_JS = (count) => `JSON.stringify(
  [...document.querySelectorAll('[data-testid="tweet"]')].map(el => {
    const textEl = el.querySelector('[data-testid="tweetText"]');
    const userEl = el.querySelector('[data-testid="User-Name"]');
    const timeEl = el.querySelector('time');
    const linkEl = el.querySelector('a[href*="/status/"]');
    const metric = (id) => {
      const btn = el.querySelector('[data-testid="' + id + '"]');
      const label = btn?.getAttribute('aria-label') || '';
      const m = label.match(/([\\d,]+)/);
      return m ? m[1].replace(/,/g, '') : '0';
    };
    if (!textEl) return null;
    const userParts = userEl?.innerText?.split('\\n') || [];
    return {
      text: textEl.innerText.trim(),
      author: userParts[0]?.trim() || '',
      handle: userParts.find(p => p.startsWith('@'))?.trim() || '',
      time: timeEl?.getAttribute('datetime') || '',
      url: linkEl ? 'https://x.com' + new URL(linkEl.href).pathname : '',
      likes: metric('like'),
      retweets: metric('retweet'),
      replies: metric('reply'),
    };
  }).filter(Boolean).slice(0, ${count})
)`;

// ── Login check JS ──────────────────────────────────────────

const LOGIN_CHECK_JS = `JSON.stringify({
  loggedIn: !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Home_Link"]'),
  hasLoginPrompt: !!document.querySelector('[data-testid="loginButton"], [href="/login"]')
})`;

// ── Main ────────────────────────────────────────────────────

async function searchX(query, count) {
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;

  try {
    process.stderr.write(`[x-search] Opening: ${url}\n`);
    cx('open', SESSION, url);
    cx('wait', SESSION, '3000'); // X.com is heavy, needs time to render

    // Check login status
    try {
      const status = JSON.parse(cx('eval', SESSION, LOGIN_CHECK_JS));
      if (!status.loggedIn && status.hasLoginPrompt) {
        process.stderr.write(`[x-search] Not logged in to X.com\n`);
        return { error: 'Not logged in to X.com. Login in chromux default profile first.' };
      }
    } catch {}

    // Extract first batch of tweets
    let tweets;
    try {
      tweets = JSON.parse(cx('eval', SESSION, TWEET_JS(count)));
    } catch {
      process.stderr.write(`[x-search] Failed to parse tweets\n`);
      return { error: 'Failed to extract tweets from X.com' };
    }

    process.stderr.write(`[x-search] Extracted ${tweets.length} tweets\n`);

    // Scroll for more if needed
    if (tweets.length < count) {
      for (let scroll = 0; scroll < 3 && tweets.length < count; scroll++) {
        cx('scroll', SESSION, 'down');
        cx('wait', SESSION, '2000');
        try {
          const more = JSON.parse(cx('eval', SESSION, TWEET_JS(count)));
          // Deduplicate by URL
          const seen = new Set(tweets.map(t => t.url));
          for (const t of more) {
            if (!seen.has(t.url)) { tweets.push(t); seen.add(t.url); }
          }
        } catch {}
        process.stderr.write(`[x-search] After scroll ${scroll + 1}: ${tweets.length} tweets\n`);
      }
    }

    return tweets.slice(0, count);
  } finally {
    try { cx('close', SESSION); } catch {}
  }
}

// ── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--check')) {
  try {
    cx('list');
    // Quick login check: open X.com and verify
    const cs = `xc-${Math.random().toString(36).slice(2, 6)}`;
    try {
      cx('open', cs, 'https://x.com/home');
      cx('wait', cs, '3000');
      const status = JSON.parse(cx('eval', cs, LOGIN_CHECK_JS));
      cx('close', cs);
      if (status.loggedIn) {
        console.log(JSON.stringify({ available: true, authenticated: true, tool: 'chromux (x-search)' }));
      } else {
        console.log(JSON.stringify({ available: true, authenticated: false, error: 'Not logged in to X.com in chromux default profile' }));
        process.exit(1);
      }
    } catch (err) {
      try { cx('close', cs); } catch {}
      console.log(JSON.stringify({ available: true, authenticated: false, error: err.message }));
      process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({ available: false, error: err.message }));
    process.exit(1);
  }
  process.exit(0);
}

let query = '', count = 20, jsonMode = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--count': count = parseInt(args[++i]); break;
    case '--json': jsonMode = true; break;
    default:
      if (!args[i].startsWith('-')) query = query ? `${query} ${args[i]}` : args[i];
  }
}

if (!query) {
  console.error('Usage: x-search.mjs "query" [--count N] [--json]');
  process.exit(1);
}

const result = await searchX(query, count);

if (result.error) {
  console.error(`Error: ${result.error}`);
  process.exit(1);
}

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`=== X/Twitter Search: ${query} ===`);
  console.log(`Found: ${result.length} tweets\n`);
  for (let i = 0; i < result.length; i++) {
    const t = result[i];
    console.log(`[${i + 1}] ${t.author} ${t.handle}`);
    console.log(`    ${t.text.replace(/\n/g, '\n    ')}`);
    console.log(`    ${t.likes} likes · ${t.retweets} RTs · ${t.replies} replies`);
    if (t.url) console.log(`    ${t.url}`);
    if (t.time) console.log(`    ${t.time}`);
    console.log();
  }
}
