/**
 * handlers/next.js — dev-cli next <name>
 *
 * Wraps next() from ../core/sequencer.js.
 */

import { next } from '../core/sequencer.js';

export default async function handler(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: dev-cli next <name>');
    process.exit(1);
  }
  const result = await next(name);
  console.log(JSON.stringify(result, null, 2));
}
