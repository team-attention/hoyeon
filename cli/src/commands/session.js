import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { parseArgs } from '../lib/args.js';

const HELP = `
Usage:
  hoyeon-cli session set --sid <session-id> [options]    Update session state
  hoyeon-cli session get --sid <session-id>              Read session state

Options for 'set':
  --sid <id>          Session ID (required)
  --key <k>           Set arbitrary key (requires --value)
  --value <v>         Value for --key
  --json '{...}'      Deep-merge JSON fragment into state

Examples:
  hoyeon-cli session set --sid abc123 --key spec_dir --value .hoyeon/specs/foo
  hoyeon-cli session set --sid abc123 --json '{"ralph": {"round": 0}}'
  hoyeon-cli session get --sid abc123
`;

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

function statePath(sid) {
  return join(homedir(), '.hoyeon', sid, 'state.json');
}

function readState(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (err) { throw new Error(`Invalid JSON in ${path}: ${err.message}`); }
}

function writeState(path, data) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] !== null && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

async function handleSet(args) {
  const parsed = parseArgs(args);
  if (!parsed.sid) die('Error: --sid is required');

  const path = statePath(parsed.sid);
  const state = readState(path) || {};

  if (parsed.key !== undefined) {
    if (parsed.value === undefined) die('Error: --value is required when using --key');
    state[parsed.key] = parsed.value;
  }

  if (parsed.json !== undefined) {
    let fragment;
    try { fragment = JSON.parse(parsed.json); }
    catch (err) { die(`Error: invalid JSON: ${err.message}`); }
    deepMerge(state, fragment);
  }

  writeState(path, state);

  const updates = [];
  if (parsed.key !== undefined) updates.push(`${parsed.key}=${parsed.value}`);
  if (parsed.json !== undefined) updates.push('json merged');
  process.stdout.write(`Session updated: ${updates.join(', ')}\n`);
}

async function handleGet(args) {
  const parsed = parseArgs(args);
  if (!parsed.sid) die('Error: --sid is required');

  const state = readState(statePath(parsed.sid));
  if (!state) die(`Error: no session state found for ${parsed.sid}`);
  process.stdout.write(JSON.stringify(state, null, 2) + '\n');
}

export default async function session(args) {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (sub === 'set') return handleSet(args.slice(1));
  if (sub === 'get') return handleGet(args.slice(1));
  die(`Error: unknown session command '${sub}'. Run 'hoyeon-cli session --help'.`);
}
