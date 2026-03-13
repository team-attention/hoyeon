import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import specSchema from '../../schemas/dev-spec-v4.schema.json' with { type: 'json' };

import { writeState } from '../lib/state-io.js';

const SPEC_HELP = `
Usage:
  hoyeon-cli spec init <name> --goal "..." <path>   Create a minimal valid spec.json
  hoyeon-cli spec merge <path> --json '{...}'       Deep-merge a JSON fragment into spec.json
  hoyeon-cli spec validate <path>                   Validate a spec.json file against the schema
  hoyeon-cli spec plan <path> [--format text|mermaid|json]  Show execution plan with parallel groups
  hoyeon-cli spec task <task-id> --status <status> [--summary "..."] <path>  Update task status
  hoyeon-cli spec task <task-id> --get <path>                               Get task details as JSON
  hoyeon-cli spec status <path>                     Show task completion status (exit 0=done, 1=incomplete)
  hoyeon-cli spec meta <path>                       Show spec meta (name, goal, non_goals, mode, etc.)
  hoyeon-cli spec check <path>                      Check internal consistency
  hoyeon-cli spec amend --reason <feedback-id> --spec <path>  Amend spec.json based on feedback

Options:
  --help, -h    Show this help message

Examples:
  hoyeon-cli spec init api-auth --goal "Add JWT auth" .dev/specs/api-auth/spec.json
  hoyeon-cli spec merge .dev/specs/api-auth/spec.json --json '{"context":{"request":"Add auth"}}'
  hoyeon-cli spec validate ./spec.json
  hoyeon-cli spec plan ./spec.json
  hoyeon-cli spec task T1 --status done --summary "implemented" ./spec.json
  hoyeon-cli spec task T1 --get ./spec.json
  hoyeon-cli spec status ./spec.json
  hoyeon-cli spec meta ./spec.json
  hoyeon-cli spec check ./spec.json
  hoyeon-cli spec amend --reason fb-001 --spec ./spec.json
`;

function loadSchema() {
  return specSchema;
}

function validateSpec(specData) {
  let schema;
  try {
    schema = loadSchema();
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(specData);
  if (!valid) {
    process.stderr.write('Validation failed:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    process.exit(1);
  }
}

/**
 * Deep-merge source into target.
 * - Objects are recursively merged
 * - Arrays are replaced by default, or concatenated with --append
 */
function deepMerge(target, source, append = false) {
  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) {
      continue;
    }
    if (Array.isArray(source[key])) {
      if (append && Array.isArray(target[key])) {
        target[key] = target[key].concat(source[key]);
      } else {
        target[key] = source[key];
      }
    } else if (typeof source[key] === 'object') {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMerge(target[key], source[key], append);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

async function handleInit(args) {
  const parsed = parseArgs(args);
  const name = parsed._[0];

  if (!name) {
    process.stderr.write('Error: <name> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec init <name> --goal "..." <path>\n');
    process.exit(1);
  }

  if (!parsed.goal) {
    process.stderr.write('Error: --goal "..." is required\n');
    process.stderr.write('Usage: hoyeon-cli spec init <name> --goal "..." <path>\n');
    process.exit(1);
  }

  const filePath = parsed._[1];
  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec init <name> --goal "..." <path>\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);

  // Check if file already exists
  try {
    readFileSync(specPath, 'utf8');
    process.stderr.write(`Error: file already exists: ${specPath}\n`);
    process.stderr.write('Use "hoyeon-cli spec merge" to update an existing spec.\n');
    process.exit(1);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
  }

  const now = new Date().toISOString();

  const specData = {
    meta: {
      name,
      goal: parsed.goal,
      created_at: now,
    },
    tasks: [
      { id: 'T1', action: 'TODO', type: 'work', status: 'pending' },
    ],
    history: [
      { ts: now, type: 'spec_created' },
    ],
  };

  // Add optional type
  if (parsed.type !== undefined) {
    const validTypes = ['dev', 'plain'];
    if (!validTypes.includes(parsed.type)) {
      process.stderr.write(`Error: invalid --type '${parsed.type}'. Valid values: ${validTypes.join(', ')}\n`);
      process.exit(1);
    }
    specData.meta.type = parsed.type;
  }

  // Add optional mode
  if (parsed.depth || parsed.interaction) {
    specData.meta.mode = {};
    if (parsed.depth) specData.meta.mode.depth = parsed.depth;
    if (parsed.interaction) specData.meta.mode.interaction = parsed.interaction;
  }

  validateSpec(specData);
  writeState(specPath, specData);

  process.stdout.write(`Spec created: ${specPath}\n`);
  process.stdout.write(`  name: ${name}\n`);
  process.stdout.write(`  goal: ${parsed.goal}\n`);
  if (specData.meta.mode) {
    process.stdout.write(`  mode: ${specData.meta.mode.depth || '-'}/${specData.meta.mode.interaction || '-'}\n`);
  }
  process.exit(0);
}

async function handleMerge(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec merge <path> --json \'{...}\' [--append]\n');
    process.exit(1);
  }

  if (!parsed.json) {
    process.stderr.write('Error: --json \'{...}\' is required\n');
    process.stderr.write('Usage: hoyeon-cli spec merge <path> --json \'{...}\' [--append]\n');
    process.exit(1);
  }

  let fragment;
  try {
    fragment = JSON.parse(parsed.json);
  } catch (err) {
    process.stderr.write(`Error: invalid JSON fragment: ${err.message}\n`);
    process.exit(1);
  }

  if (typeof fragment !== 'object' || Array.isArray(fragment)) {
    process.stderr.write('Error: JSON fragment must be an object\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  const append = parsed.append === true;
  deepMerge(specData, fragment, append);

  // Auto-add history entry for merge
  const now = new Date().toISOString();
  if (!specData.history) specData.history = [];
  const mergedKeys = Object.keys(fragment).join(', ');
  specData.history.push({
    ts: now,
    type: 'spec_updated',
    detail: `merged: ${mergedKeys}`,
  });

  // Update meta.updated_at
  if (specData.meta) {
    specData.meta.updated_at = now;
  }

  validateSpec(specData);
  writeState(specPath, specData);

  process.stdout.write(`Spec merged: ${specPath}\n`);
  process.stdout.write(`  merged keys: ${mergedKeys}\n`);
  if (append) process.stdout.write('  mode: append (arrays concatenated)\n');
  process.exit(0);
}

async function handleValidate(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec validate <path>\n');
    process.exit(1);
  }

  let data;
  try {
    const raw = readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in ${filePath}: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read file: ${err.message}\n`);
    }
    process.exit(1);
  }

  let schema;
  try {
    schema = loadSchema();
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    process.stdout.write(JSON.stringify({ valid: true, errors: [] }) + '\n');
    process.exit(0);
  } else {
    const errors = validate.errors.map((e) => ({
      instancePath: e.instancePath,
      schemaPath: e.schemaPath,
      keyword: e.keyword,
      message: e.message,
      params: e.params,
    }));

    process.stdout.write(JSON.stringify({ valid: false, errors }) + '\n');
    process.stderr.write('Validation failed:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    process.exit(1);
  }
}

function loadSpec(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in ${filePath}: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read file: ${err.message}\n`);
    }
    process.exit(1);
  }
}

/**
 * Build execution plan from spec.json tasks using topological sort.
 * Groups tasks into parallel rounds based on depends_on.
 */
function buildPlan(tasks) {
  const taskMap = new Map();
  for (const t of tasks) {
    taskMap.set(t.id, { ...t, depends_on: t.depends_on || [] });
  }

  // Validate dependency references
  for (const t of taskMap.values()) {
    for (const dep of t.depends_on) {
      if (!taskMap.has(dep)) {
        process.stderr.write(`Warning: task ${t.id} depends on unknown task ${dep}\n`);
      }
    }
  }

  // Kahn's algorithm — topological sort into rounds
  const inDegree = new Map();
  for (const t of taskMap.values()) {
    if (!inDegree.has(t.id)) inDegree.set(t.id, 0);
    for (const dep of t.depends_on) {
      // dep → t.id edge
      inDegree.set(t.id, (inDegree.get(t.id) || 0));
    }
  }
  // Count in-degrees
  for (const t of taskMap.values()) {
    inDegree.set(t.id, t.depends_on.filter(d => taskMap.has(d)).length);
  }

  const rounds = [];
  const done = new Set();

  while (done.size < taskMap.size) {
    const round = [];
    for (const t of taskMap.values()) {
      if (done.has(t.id)) continue;
      const allDepsDone = t.depends_on.every(d => done.has(d) || !taskMap.has(d));
      if (allDepsDone) round.push(t.id);
    }

    if (round.length === 0) {
      // Cycle detection
      const remaining = [...taskMap.keys()].filter(id => !done.has(id));
      process.stderr.write(`Error: circular dependency detected among: ${remaining.join(', ')}\n`);
      process.exit(1);
    }

    rounds.push(round);
    for (const id of round) done.add(id);
  }

  return rounds;
}

/**
 * Find the critical path (longest path through the DAG).
 */
function findCriticalPath(tasks) {
  const taskMap = new Map();
  for (const t of tasks) {
    taskMap.set(t.id, { ...t, depends_on: t.depends_on || [] });
  }

  // longest path to each node + predecessor
  const dist = new Map();
  const pred = new Map();
  for (const id of taskMap.keys()) {
    dist.set(id, 0);
    pred.set(id, null);
  }

  // Process in topological order
  const rounds = buildPlan(tasks);
  for (const round of rounds) {
    for (const id of round) {
      const t = taskMap.get(id);
      for (const dep of t.depends_on) {
        if (!taskMap.has(dep)) continue;
        if (dist.get(dep) + 1 > dist.get(id)) {
          dist.set(id, dist.get(dep) + 1);
          pred.set(id, dep);
        }
      }
    }
  }

  // Find the node with max distance
  let maxDist = -1;
  let endNode = null;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // Trace back
  const path = [];
  let cur = endNode;
  while (cur) {
    path.unshift(cur);
    cur = pred.get(cur);
  }

  return path;
}

function formatText(spec, rounds, criticalPath) {
  const taskMap = new Map();
  for (const t of spec.tasks) taskMap.set(t.id, t);

  const lines = [];
  lines.push(`Plan: ${spec.meta.name}`);
  lines.push(`Goal: ${spec.meta.goal}`);
  lines.push('');

  const totalTasks = spec.tasks.length;
  const parallelTasks = rounds.filter(r => r.length > 1).reduce((sum, r) => sum + r.length, 0);
  lines.push(`Tasks: ${totalTasks}  Rounds: ${rounds.length}  Max parallel: ${Math.max(...rounds.map(r => r.length))}`);
  lines.push('');

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const parallel = round.length > 1;
    lines.push(`Round ${i + 1}${parallel ? ' (parallel)' : ''}:`);
    for (const id of round) {
      const t = taskMap.get(id);
      const type = t.type === 'verification' ? 'verify' : 'work';
      const risk = t.risk ? ` [${t.risk}]` : '';
      const deps = (t.depends_on || []).length > 0 ? ` ← ${t.depends_on.join(', ')}` : '';
      const cp = criticalPath.includes(id) ? ' *' : '';
      lines.push(`  ${id}: ${t.action} (${type}${risk})${deps}${cp}`);
    }
    lines.push('');
  }

  lines.push(`Critical path: ${criticalPath.join(' → ')}`);

  // Show fulfills summary if any task has it
  const hasFulfills = spec.tasks.some(t => t.fulfills && t.fulfills.length > 0);
  if (hasFulfills) {
    lines.push('');
    lines.push('Requirement coverage:');
    const reqMap = new Map();
    for (const t of spec.tasks) {
      for (const r of (t.fulfills || [])) {
        if (!reqMap.has(r)) reqMap.set(r, []);
        reqMap.get(r).push(t.id);
      }
    }
    for (const [r, tasks] of reqMap) {
      lines.push(`  ${r} ← ${tasks.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function formatMermaid(spec, rounds, criticalPath) {
  const taskMap = new Map();
  for (const t of spec.tasks) taskMap.set(t.id, t);
  const cpSet = new Set(criticalPath);

  const lines = ['graph LR'];

  for (const t of spec.tasks) {
    const label = `${t.id}[${t.id}: ${t.action}]`;
    lines.push(`  ${label}`);
  }

  for (const t of spec.tasks) {
    for (const dep of (t.depends_on || [])) {
      if (taskMap.has(dep)) {
        lines.push(`  ${dep} --> ${t.id}`);
      }
    }
  }

  // Style critical path
  if (criticalPath.length > 0) {
    lines.push(`  style ${criticalPath.join(',')} stroke:#f66,stroke-width:3px`);
  }

  // Style verification tasks
  const verifyTasks = spec.tasks.filter(t => t.type === 'verification').map(t => t.id);
  if (verifyTasks.length > 0) {
    lines.push(`  style ${verifyTasks.join(',')} stroke:#6a6,stroke-dasharray: 5 5`);
  }

  return lines.join('\n');
}

function formatJson(spec, rounds, criticalPath) {
  const taskMap = new Map();
  for (const t of spec.tasks) taskMap.set(t.id, t);

  return JSON.stringify({
    name: spec.meta.name,
    goal: spec.meta.goal,
    total_tasks: spec.tasks.length,
    total_rounds: rounds.length,
    max_parallel: Math.max(...rounds.map(r => r.length)),
    critical_path: criticalPath,
    rounds: rounds.map((round, i) => ({
      round: i + 1,
      parallel: round.length > 1,
      tasks: round.map(id => {
        const t = taskMap.get(id);
        return {
          id: t.id,
          action: t.action,
          type: t.type,
          status: t.status || 'pending',
          risk: t.risk || null,
          depends_on: t.depends_on || [],
          steps: t.steps || [],
          file_scope: t.file_scope || [],
        };
      }),
    })),
  }, null, 2);
}

function formatSlim(spec, rounds, criticalPath) {
  return JSON.stringify({
    name: spec.meta.name,
    goal: spec.meta.goal,
    total_tasks: spec.tasks.length,
    total_rounds: rounds.length,
    max_parallel: Math.max(...rounds.map(r => r.length)),
    critical_path: criticalPath,
    rounds: rounds.map((round, i) => ({
      round: i + 1,
      parallel: round.length > 1,
      tasks: round.map(id => {
        const t = (spec.tasks || []).find(task => task.id === id) || {};
        return {
          id: t.id,
          action: t.action,
          type: t.type,
          status: t.status || 'pending',
          depends_on: t.depends_on || [],
        };
      }),
    })),
  }, null, 2);
}

async function handlePlan(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0] || parsed.spec;

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec plan <path> [--format text|mermaid|json|slim]\n');
    process.exit(1);
  }

  const spec = loadSpec(filePath);

  if (!spec.tasks || spec.tasks.length === 0) {
    process.stderr.write('Error: spec has no tasks\n');
    process.exit(1);
  }

  const rounds = buildPlan(spec.tasks);
  const criticalPath = findCriticalPath(spec.tasks);
  const format = parsed.format || 'text';

  let output;
  if (format === 'mermaid') {
    output = formatMermaid(spec, rounds, criticalPath);
  } else if (format === 'json') {
    output = formatJson(spec, rounds, criticalPath);
  } else if (format === 'slim') {
    output = formatSlim(spec, rounds, criticalPath);
  } else {
    output = formatText(spec, rounds, criticalPath);
  }

  process.stdout.write(output + '\n');
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

async function handleAmend(args) {
  const parsed = parseArgs(args);

  if (!parsed.reason) {
    process.stderr.write('Error: --reason <feedback-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec amend --reason <feedback-id> --spec <path>\n');
    process.exit(1);
  }

  if (!parsed.spec) {
    process.stderr.write('Error: --spec <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec amend --reason <feedback-id> --spec <path>\n');
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);
  const feedbackId = parsed.reason;

  // Derive feedback file path relative to spec directory
  const specDir = dirname(specPath);
  const feedbackPath = resolve(specDir, 'feedback', `${feedbackId}.json`);

  let feedbackData;
  try {
    const raw = readFileSync(feedbackPath, 'utf8');
    feedbackData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: feedback file not found: ${feedbackPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in feedback file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read feedback file: ${err.message}\n`);
    }
    process.exit(1);
  }

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

  // Display the feedback message
  process.stdout.write(`Feedback (${feedbackId}): ${feedbackData.message}\n`);

  // Phase 1: update meta.updated_at as a placeholder for future amendment logic
  if (!specData.meta) {
    specData.meta = {};
  }
  specData.meta.updated_at = new Date().toISOString();

  try {
    writeFileSync(specPath, JSON.stringify(specData, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`Error: could not write spec file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Spec amended: ${specPath}\n`);
  process.stdout.write(`Note: actual spec modification logic will be added in later phases\n`);
  process.exit(0);
}

async function handleTask(args) {
  const taskId = args[0];

  if (!taskId || taskId.startsWith('--')) {
    process.stderr.write('Error: <task-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec task <task-id> --status <status> [--summary "..."] <path>\n');
    process.stderr.write('       hoyeon-cli spec task <task-id> --get <path>\n');
    process.exit(1);
  }

  const parsed = parseArgs(args.slice(1));

  // --get mode: read-only task retrieval
  // Usage: hoyeon-cli spec task <id> --get <path>
  if (parsed.get !== undefined) {
    if (typeof parsed.get !== 'string') {
      process.stderr.write('Error: --get requires <path> argument\n');
      process.stderr.write('Usage: hoyeon-cli spec task <task-id> --get <path>\n');
      process.exit(1);
    }
    const filePath = parsed.get;
    const specData = loadSpec(resolve(filePath));
    const task = specData.tasks.find(t => t.id === taskId);
    if (!task) {
      process.stderr.write(`Error: task '${taskId}' not found in spec\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(task, null, 2) + '\n');
    process.exit(0);
  }

  let status = parsed.status;
  if (parsed.done === true) status = 'done';
  if (parsed['in-progress'] === true) status = 'in_progress';

  if (!status) {
    process.stderr.write('Error: --status <status> is required (or use --done / --in-progress / --get)\n');
    process.exit(1);
  }

  const validStatuses = ['pending', 'in_progress', 'done'];
  if (!validStatuses.includes(status)) {
    process.stderr.write(`Error: invalid status '${status}'. Valid values: ${validStatuses.join(', ')}\n`);
    process.exit(1);
  }

  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> to spec.json is required\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  const task = specData.tasks.find(t => t.id === taskId);
  if (!task) {
    process.stderr.write(`Error: task '${taskId}' not found in spec\n`);
    process.exit(1);
  }

  const now = new Date().toISOString();

  task.status = status;

  if (status === 'in_progress' && !task.started_at) {
    task.started_at = now;
  }

  if (status === 'done') {
    task.completed_at = now;
    if (parsed.summary) {
      task.summary = parsed.summary;
    }
  }

  // Append history
  if (!specData.history) {
    specData.history = [];
  }

  const historyType = status === 'in_progress' ? 'task_start' : status === 'done' ? 'task_done' : 'spec_updated';
  const entry = { ts: now, type: historyType, task: taskId };
  if (parsed.summary) {
    entry.summary = parsed.summary;
  }
  specData.history.push(entry);

  // Validate before writing
  let schema;
  try {
    schema = loadSchema();
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(specData);

  if (!valid) {
    process.stderr.write('Validation failed after update:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    process.exit(1);
  }

  // Atomic write (reuse state-io pattern)
  writeState(specPath, specData);

  process.stdout.write(`Updated task '${taskId}' status to '${status}'\n`);
  process.exit(0);
}

async function handleStatus(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec status <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));

  const tasks = specData.tasks || [];
  const done = tasks.filter(t => t.status === 'done');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const pending = tasks.filter(t => t.status === 'pending' || !t.status);
  const remaining = tasks.filter(t => t.status !== 'done');

  const result = {
    name: specData.meta?.name || 'unknown',
    done: done.length,
    in_progress: inProgress.length,
    pending: pending.length,
    total: tasks.length,
    complete: remaining.length === 0,
    remaining: remaining.map(t => ({ id: t.id, action: t.action, status: t.status || 'pending' })),
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(remaining.length === 0 ? 0 : 1);
}

async function handleMeta(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec meta <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));
  const meta = specData.meta || {};

  process.stdout.write(JSON.stringify(meta, null, 2) + '\n');
  process.exit(0);
}

async function handleCheck(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec check <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));
  const issues = [];

  const taskIds = new Set(specData.tasks.map(t => t.id));

  // Check for duplicate IDs
  if (taskIds.size !== specData.tasks.length) {
    issues.push('duplicate task IDs detected');
  }

  // Check depends_on references
  for (const task of specData.tasks) {
    for (const dep of (task.depends_on || [])) {
      if (!taskIds.has(dep)) {
        issues.push(`task '${task.id}' depends on unknown task '${dep}'`);
      }
    }
  }

  // Check done tasks have completed_at
  for (const task of specData.tasks) {
    if (task.status === 'done' && !task.completed_at) {
      issues.push(`task '${task.id}' is done but missing completed_at`);
    }
  }

  // Check depends_on completion for in_progress/done tasks
  for (const task of specData.tasks) {
    if (task.status === 'in_progress' || task.status === 'done') {
      for (const dep of (task.depends_on || [])) {
        const depTask = specData.tasks.find(t => t.id === dep);
        if (depTask && depTask.status !== 'done') {
          issues.push(`task '${task.id}' is ${task.status} but dependency '${dep}' is not done`);
        }
      }
    }
  }

  // Check file_scope overlap across tasks (warning only)
  const warnings = [];
  const fileScopeMap = new Map();
  for (const task of specData.tasks) {
    for (const file of (task.file_scope || [])) {
      if (!fileScopeMap.has(file)) fileScopeMap.set(file, []);
      fileScopeMap.get(file).push(task.id);
    }
  }
  for (const [file, taskList] of fileScopeMap) {
    if (taskList.length > 1) {
      warnings.push(`file '${file}' appears in file_scope of multiple tasks: ${taskList.join(', ')}`);
    }
  }

  if (issues.length > 0) {
    process.stderr.write('Spec check failed:\n');
    for (const issue of issues) {
      process.stderr.write(`  - ${issue}\n`);
    }
    process.exit(1);
  }

  if (warnings.length > 0) {
    process.stderr.write('Warnings:\n');
    for (const w of warnings) {
      process.stderr.write(`  - ${w}\n`);
    }
  }

  process.stdout.write('Spec check passed: internal consistency OK\n');
  process.exit(0);
}

export default async function spec(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(SPEC_HELP);
    process.exit(0);
  }

  if (subcommand === 'init') {
    await handleInit(args.slice(1));
  } else if (subcommand === 'merge') {
    await handleMerge(args.slice(1));
  } else if (subcommand === 'validate') {
    await handleValidate(args.slice(1));
  } else if (subcommand === 'plan') {
    await handlePlan(args.slice(1));
  } else if (subcommand === 'task') {
    await handleTask(args.slice(1));
  } else if (subcommand === 'status') {
    await handleStatus(args.slice(1));
  } else if (subcommand === 'meta') {
    await handleMeta(args.slice(1));
  } else if (subcommand === 'check') {
    await handleCheck(args.slice(1));
  } else if (subcommand === 'amend') {
    await handleAmend(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown spec subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'hoyeon-cli spec --help' for usage.\n`);
    process.exit(1);
  }
}
