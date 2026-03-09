#!/usr/bin/env node
import { readFileSync } from 'fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

await build({
  entryPoints: ['bin/dev-cli.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/cli.js',
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  // Allow JSON imports with { type: 'json' } assertion
  loader: {
    '.json': 'json',
  },
});

console.log('Build complete: dist/cli.js');
