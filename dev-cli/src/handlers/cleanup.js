/**
 * handlers/cleanup.js — dev-cli cleanup <name>
 *
 * Wraps cleanup() from ../blocks/cleanup.js.
 */

import { cleanup } from '../blocks/cleanup.js';

export default async function handler(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: dev-cli cleanup <name>');
    process.exit(1);
  }
  const result = await cleanup(name);
  console.log(JSON.stringify(result, null, 2));
}
