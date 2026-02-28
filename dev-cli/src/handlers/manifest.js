/**
 * handlers/manifest.js — dev-cli manifest <name> [--json]
 *
 * Wraps manifest() and manifestJSON() from ../core/manifest.js.
 * --json flag returns structured JSON for compact recovery.
 */

import { manifest, manifestJSON } from '../core/manifest.js';

export default async function handler(args) {
  const name = args[0] && !args[0].startsWith('--') ? args[0] : null;
  if (!name) {
    console.error('Usage: dev-cli manifest <name> [--json]');
    process.exit(1);
  }

  const flags = new Set(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2)));

  if (flags.has('json')) {
    const result = manifestJSON(name);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const result = manifest(name);
    console.log(result);
  }
}
