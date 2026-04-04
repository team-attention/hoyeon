/**
 * Shared test utilities for hoyeon-cli tests.
 *
 * Provides:
 *   - loadFixture(name)       — read a JSON fixture from tests/fixtures/
 *   - createTempSpec(data)    — write data to a temp file, return { path, cleanup }
 *   - runCli(args, opts)      — run the built CLI via child_process, return { stdout, stderr, status }
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

/**
 * Load a fixture file from tests/fixtures/<name>.
 * @param {string} name - fixture filename (e.g. 'merge-base.json')
 * @returns {object} parsed JSON object
 */
export function loadFixture(name) {
  const fixturePath = join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
}

/**
 * Write spec data to a temp file and return the path + cleanup function.
 * @param {object} data - spec data to write
 * @returns {{ path: string, cleanup: () => void }}
 */
export function createTempSpec(data) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hoyeon-cli-test-'));
  const specPath = join(tmpDir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(data, null, 2));
  return {
    path: specPath,
    dir: tmpDir,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  };
}

/**
 * Run the hoyeon-cli via child_process.execFileSync.
 * @param {string[]} args - CLI arguments (e.g. ['spec', 'validate', '/path/to/spec.json'])
 * @param {object} [opts] - options: { cwd, env, expectFail }
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
export function runCli(args, opts = {}) {
  const { cwd = process.cwd(), env = process.env, expectFail = false } = opts;
  let stdout = '';
  let stderr = '';
  let status = 0;

  try {
    stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (!expectFail && err.status !== 0) {
      stdout = err.stdout || '';
      stderr = err.stderr || '';
      status = err.status ?? 1;
      return { stdout, stderr, status };
    }
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    status = err.status ?? 1;
  }

  return { stdout, stderr, status };
}
