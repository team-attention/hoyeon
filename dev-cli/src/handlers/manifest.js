/**
 * handlers/manifest.js — dev-cli manifest <name>
 *
 * Wraps manifest() from ../core/manifest.js.
 */

import { manifest } from '../core/manifest.js';

export default async function handler(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: dev-cli manifest <name>');
    process.exit(1);
  }
  const result = await manifest(name);
  console.log(result);
}
