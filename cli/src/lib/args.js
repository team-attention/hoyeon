// Minimal arg parser. Supports: --key value, --flag, positional args (in order).
export function parseArgs(args) {
  const out = { _: [] };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--') {
      out._.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i += 2;
      } else {
        out[key] = true;
        i += 1;
      }
    } else {
      out._.push(a);
      i += 1;
    }
  }
  return out;
}

// Walk a dotted path like "meta.type" or "tasks[0].id" into an object.
export function getPath(obj, path) {
  if (!path) return obj;
  const parts = [];
  for (const raw of path.split('.')) {
    const m = /^([^\[]+)((?:\[\d+\])*)$/.exec(raw);
    if (!m) return undefined;
    parts.push(m[1]);
    for (const idx of (m[2].match(/\d+/g) || [])) parts.push(parseInt(idx, 10));
  }
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
