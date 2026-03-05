import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { resolve, dirname, relative } from 'path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readState, writeState } from '../lib/state-io.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATE_HELP = `
Usage:
  dev-cli state init --spec <path> [--output <path>]
  dev-cli state update <task-id> --status <status> [--state <path>]
  dev-cli state check --spec <path> --state <path>
  dev-cli state sync --spec <path> --state <path>

Subcommands:
  init    Initialize state.json from a spec.json file
  update  Update a task's status in state.json
  check   Check consistency between spec.json and state.json
  sync    Sync state.json after spec.json changes

Options:
  --help, -h    Show this help message

Examples:
  dev-cli state init --spec ./spec.json
  dev-cli state init --spec ./spec.json --output ./state.json
  dev-cli state update T1 --done --state ./state.json
  dev-cli state update T1 --status in_progress --state ./state.json
  dev-cli state update T1 --status blocked_by --blocked-by T2 --state ./state.json
  dev-cli state check --spec ./spec.json --state ./state.json
  dev-cli state sync --spec ./spec.json --state ./state.json
`;

function loadStateSchema() {
  const schemaPath = resolve(__dirname, '../../schemas/dev-state-v1.schema.json');
  const raw = readFileSync(schemaPath, 'utf8');
  return JSON.parse(raw);
}

function getStateValidator() {
  const schema = loadStateSchema();
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function validateState(data) {
  const validate = getStateValidator();
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors.map((e) => {
      const path = e.instancePath || '(root)';
      return `  ${path}: ${e.message}`;
    });
    throw new Error(`State validation failed:\n${errors.join('\n')}`);
  }
}

function computeSpecHash(specPath) {
  const raw = readFileSync(specPath);
  return createHash('sha256').update(raw).digest('hex');
}

function parseArgs(args) {
  const result = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      result._.push(arg);
      i += 1;
    }
  }
  return result;
}

async function handleInit(args) {
  const parsed = parseArgs(args);

  if (!parsed.spec) {
    process.stderr.write('Error: --spec <path> is required\n');
    process.stderr.write('Usage: dev-cli state init --spec <path> [--output <path>]\n');
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);

  let specRaw;
  let specData;
  try {
    specRaw = readFileSync(specPath, 'utf8');
    specData = JSON.parse(specRaw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: spec file not found: ${specPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in spec file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read spec file: ${err.message}\n`);
    }
    process.exit(1);
  }

  if (!specData.tasks || !Array.isArray(specData.tasks)) {
    process.stderr.write('Error: spec.json must have a "tasks" array\n');
    process.exit(1);
  }

  const specHash = computeSpecHash(specPath);

  const outputPath = parsed.output
    ? resolve(parsed.output)
    : resolve(dirname(specPath), 'state.json');

  const specRefRelative = relative(dirname(outputPath), specPath);

  const tasks = {};
  const seenIds = new Set();
  for (const task of specData.tasks) {
    if (!task.id) {
      process.stderr.write('Error: all tasks must have an "id" field\n');
      process.exit(1);
    }
    if (seenIds.has(task.id)) {
      process.stderr.write(`Error: duplicate task id '${task.id}' in spec\n`);
      process.exit(1);
    }
    seenIds.add(task.id);
    tasks[task.id] = { status: 'pending' };
  }

  const stateData = {
    spec_ref: specRefRelative,
    spec_hash: specHash,
    tasks,
    verifications: {},
    assumptions: {},
    history: [],
  };

  try {
    validateState(stateData);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  try {
    writeState(outputPath, stateData);
  } catch (err) {
    process.stderr.write(`Error: could not write state file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`State initialized: ${outputPath}\n`);
  process.stdout.write(`Tasks: ${Object.keys(tasks).join(', ')}\n`);
  process.exit(0);
}

async function handleUpdate(args) {
  const taskId = args[0];

  if (!taskId || taskId.startsWith('--')) {
    process.stderr.write('Error: <task-id> is required\n');
    process.stderr.write('Usage: dev-cli state update <task-id> --status <status> [--state <path>]\n');
    process.exit(1);
  }

  const parsed = parseArgs(args.slice(1));

  // Resolve short flags
  let status = parsed.status;
  if (parsed.done === true) status = 'done';
  if (parsed['in-progress'] === true) status = 'in_progress';

  if (!status) {
    process.stderr.write('Error: --status <status> is required (or use --done / --in-progress)\n');
    process.stderr.write('Usage: dev-cli state update <task-id> --status <status> [--state <path>]\n');
    process.exit(1);
  }

  const validStatuses = ['pending', 'in_progress', 'done', 'blocked_by'];
  if (!validStatuses.includes(status)) {
    process.stderr.write(`Error: invalid status '${status}'. Valid values: ${validStatuses.join(', ')}\n`);
    process.exit(1);
  }

  if (status === 'blocked_by' && !parsed['blocked-by']) {
    process.stderr.write('Error: --blocked-by <task-id> is required when status is blocked_by\n');
    process.exit(1);
  }

  const statePath = parsed.state ? resolve(parsed.state) : resolve('state.json');

  const stateData = readState(statePath);
  if (!stateData) {
    process.stderr.write(`Error: state file not found: ${statePath}\n`);
    process.exit(1);
  }

  if (!stateData.tasks || !Object.prototype.hasOwnProperty.call(stateData.tasks, taskId)) {
    process.stderr.write(`Error: task '${taskId}' not found in state\n`);
    process.exit(1);
  }

  const now = new Date().toISOString();

  stateData.tasks[taskId].status = status;

  if (status === 'blocked_by') {
    const blockedBy = parsed['blocked-by'];
    stateData.tasks[taskId].blocked_by = [blockedBy];
  } else {
    // Remove blocked_by if status is no longer blocked_by
    delete stateData.tasks[taskId].blocked_by;
  }

  if (status === 'in_progress' && !stateData.tasks[taskId].started_at) {
    stateData.tasks[taskId].started_at = now;
  }

  if (status === 'done') {
    stateData.tasks[taskId].completed_at = now;
  }

  if (!stateData.history) {
    stateData.history = [];
  }

  const historyEntry = {
    action: `status:${status}`,
    task: taskId,
    by: 'dev-cli',
    at: now,
  };

  if (status === 'blocked_by' && parsed['blocked-by']) {
    historyEntry.detail = `blocked by ${parsed['blocked-by']}`;
  }

  stateData.history.push(historyEntry);

  try {
    validateState(stateData);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  try {
    writeState(statePath, stateData);
  } catch (err) {
    process.stderr.write(`Error: could not write state file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Updated task '${taskId}' status to '${status}'\n`);
  process.exit(0);
}

async function handleCheck(args) {
  const parsed = parseArgs(args);

  if (!parsed.spec) {
    process.stderr.write('Error: --spec <path> is required\n');
    process.stderr.write('Usage: dev-cli state check --spec <path> --state <path>\n');
    process.exit(1);
  }

  if (!parsed.state) {
    process.stderr.write('Error: --state <path> is required\n');
    process.stderr.write('Usage: dev-cli state check --spec <path> --state <path>\n');
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);
  const statePath = resolve(parsed.state);

  let specData;
  try {
    const raw = readFileSync(specPath, 'utf8');
    specData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: spec file not found: ${specPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in spec file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read spec file: ${err.message}\n`);
    }
    process.exit(1);
  }

  const stateData = readState(statePath);
  if (!stateData) {
    process.stderr.write(`Error: state file not found: ${statePath}\n`);
    process.exit(1);
  }

  const issues = [];

  // Check spec hash
  const currentHash = computeSpecHash(specPath);
  if (currentHash !== stateData.spec_hash) {
    issues.push(`spec_hash mismatch: state has ${stateData.spec_hash}, current spec hash is ${currentHash}`);
  }

  // Build set of spec task IDs
  const specTaskIds = new Set((specData.tasks || []).map((t) => t.id));

  // Check for orphan task IDs in state (state has tasks not in spec)
  const stateTaskIds = Object.keys(stateData.tasks || {});
  for (const taskId of stateTaskIds) {
    if (!specTaskIds.has(taskId)) {
      issues.push(`orphan task in state: '${taskId}' does not exist in spec`);
    }
  }

  if (issues.length > 0) {
    process.stderr.write('State check failed:\n');
    for (const issue of issues) {
      process.stderr.write(`  - ${issue}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('State check passed: spec and state are consistent\n');
  process.exit(0);
}

async function handleSync(args) {
  const parsed = parseArgs(args);

  if (!parsed.spec) {
    process.stderr.write('Error: --spec <path> is required\n');
    process.stderr.write('Usage: dev-cli state sync --spec <path> --state <path>\n');
    process.exit(1);
  }

  if (!parsed.state) {
    process.stderr.write('Error: --state <path> is required\n');
    process.stderr.write('Usage: dev-cli state sync --spec <path> --state <path>\n');
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);
  const statePath = resolve(parsed.state);

  let specData;
  try {
    const raw = readFileSync(specPath, 'utf8');
    specData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: spec file not found: ${specPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in spec file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read spec file: ${err.message}\n`);
    }
    process.exit(1);
  }

  if (!specData.tasks || !Array.isArray(specData.tasks)) {
    process.stderr.write('Error: spec.json must have a "tasks" array\n');
    process.exit(1);
  }

  const stateData = readState(statePath);
  if (!stateData) {
    process.stderr.write(`Error: state file not found: ${statePath}\n`);
    process.exit(1);
  }

  const specTaskIds = new Set(specData.tasks.map((t) => t.id));
  const stateTaskIds = Object.keys(stateData.tasks || {});
  const now = new Date().toISOString();

  const added = [];
  const archived = [];

  // Add tasks present in spec but missing from state
  for (const task of specData.tasks) {
    if (!task.id) {
      process.stderr.write('Error: all tasks must have an "id" field\n');
      process.exit(1);
    }
    if (!Object.prototype.hasOwnProperty.call(stateData.tasks, task.id)) {
      stateData.tasks[task.id] = { status: 'pending' };
      added.push(task.id);
    }
  }

  // Remove tasks in state that are no longer in spec
  for (const taskId of stateTaskIds) {
    if (!specTaskIds.has(taskId)) {
      delete stateData.tasks[taskId];
      archived.push(taskId);
    }
  }

  // Update spec_hash to current spec
  stateData.spec_hash = computeSpecHash(specPath);

  if (!stateData.history) {
    stateData.history = [];
  }

  stateData.history.push({
    action: 'sync',
    by: 'dev-cli',
    at: now,
    detail: `added: [${added.join(', ')}], removed: [${archived.join(', ')}]`,
  });

  try {
    validateState(stateData);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  try {
    writeState(statePath, stateData);
  } catch (err) {
    process.stderr.write(`Error: could not write state file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`State synced: ${statePath}\n`);
  if (added.length > 0) {
    process.stdout.write(`Added tasks: ${added.join(', ')}\n`);
  }
  if (archived.length > 0) {
    process.stdout.write(`Removed tasks: ${archived.join(', ')}\n`);
  }
  if (added.length === 0 && archived.length === 0) {
    process.stdout.write('No changes: spec and state tasks are already in sync\n');
  }
  process.exit(0);
}

export default async function state(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(STATE_HELP);
    process.exit(0);
  }

  if (subcommand === 'init') {
    await handleInit(args.slice(1));
  } else if (subcommand === 'update') {
    await handleUpdate(args.slice(1));
  } else if (subcommand === 'check') {
    await handleCheck(args.slice(1));
  } else if (subcommand === 'sync') {
    await handleSync(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown state subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'dev-cli state --help' for usage.\n`);
    process.exit(1);
  }
}
