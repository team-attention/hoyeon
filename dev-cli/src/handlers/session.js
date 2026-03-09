import { homedir } from 'os';
import { join } from 'path';
import { readState, writeState } from '../lib/state-io.js';

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const SESSION_HELP = `
Usage:
  dev-cli session set --sid <session-id> [options]    Update session state
  dev-cli session get --sid <session-id>              Read session state

Options for 'set':
  --sid <id>          Session ID (required)
  --spec <path>       Set spec.json path
  --key <k>           Set arbitrary key (requires --value)
  --value <v>         Value for --key
  --json '{...}'      Deep-merge JSON fragment into state

Examples:
  dev-cli session set --sid abc123 --spec .dev/specs/foo/spec.json
  dev-cli session set --sid abc123 --key tmp_dir --value /tmp/run-1
  dev-cli session set --sid abc123 --json '{"rulph": {"round": 0}}'
  dev-cli session get --sid abc123
`;

function parseArgs(args) {
  const result = { _: [] };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--sid' && i + 1 < args.length) {
      result.sid = args[++i];
    } else if (args[i] === '--spec' && i + 1 < args.length) {
      result.spec = args[++i];
    } else if (args[i] === '--key' && i + 1 < args.length) {
      result.key = args[++i];
    } else if (args[i] === '--value' && i + 1 < args.length) {
      result.value = args[++i];
    } else if (args[i] === '--json' && i + 1 < args.length) {
      result.json = args[++i];
    } else {
      result._.push(args[i]);
    }
    i++;
  }
  return result;
}

function getStatePath(sid) {
  return join(homedir(), '.hoyeon', sid, 'state.json');
}

async function handleSet(args) {
  const parsed = parseArgs(args);

  if (!parsed.sid) {
    process.stderr.write('Error: --sid is required\n');
    process.exit(1);
  }

  const statePath = getStatePath(parsed.sid);
  const state = readState(statePath) || {};

  if (parsed.spec !== undefined) {
    state.spec = parsed.spec;
  }

  if (parsed.key !== undefined) {
    if (parsed.value === undefined) {
      process.stderr.write('Error: --value is required when using --key\n');
      process.exit(1);
    }
    state[parsed.key] = parsed.value;
  }

  if (parsed.json !== undefined) {
    let fragment;
    try {
      fragment = JSON.parse(parsed.json);
    } catch (err) {
      process.stderr.write(`Error: invalid JSON: ${err.message}\n`);
      process.exit(1);
    }
    deepMerge(state, fragment);
  }

  writeState(statePath, state);

  const updates = [];
  if (parsed.spec !== undefined) updates.push(`spec=${parsed.spec}`);
  if (parsed.key !== undefined) updates.push(`${parsed.key}=${parsed.value}`);
  if (parsed.json !== undefined) updates.push(`json merged`);
  process.stdout.write(`Session updated: ${updates.join(', ')}\n`);
  process.exit(0);
}

async function handleGet(args) {
  const parsed = parseArgs(args);

  if (!parsed.sid) {
    process.stderr.write('Error: --sid is required\n');
    process.exit(1);
  }

  const statePath = getStatePath(parsed.sid);
  const state = readState(statePath);

  if (!state) {
    process.stderr.write(`Error: no session state found for ${parsed.sid}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  process.exit(0);
}

export default async function session(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(SESSION_HELP);
    process.exit(0);
  }

  if (subcommand === 'set') {
    await handleSet(args.slice(1));
  } else if (subcommand === 'get') {
    await handleGet(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown session subcommand '${subcommand}'\n`);
    process.stderr.write('Run "dev-cli session --help" for usage.\n');
    process.exit(1);
  }
}
